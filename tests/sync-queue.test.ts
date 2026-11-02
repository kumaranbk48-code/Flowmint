import test from 'node:test'
import assert from 'node:assert/strict'
import type { Transaction } from '../lib/data'
import {
  applyPendingToTransactions,
  enqueueOp,
  flushQueue,
  newId,
  readQueue,
  retryItem,
  type FetchLike,
  type StorageLike,
} from '../lib/sync-queue'

const memoryStorage = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const sampleTx = (amount = 2000): Transaction => ({
  id: newId(), type: 'expense', amount, date: '2026-11-01', category: 'Cement', party: '', method: 'cash', source: 'manual', projectId: null,
  createdAt: new Date().toISOString(),
})

/** A fake server that behaves like the real /api/transactions route: same id => idempotent replay. */
function fakeServer(script: (call: number) => 'ok' | 'drop-response' | 'network' | number = () => 'ok') {
  const rows = new Map<string, any>()
  let calls = 0
  const fetchFn: FetchLike = async (url, init) => {
    const call = ++calls
    const mode = script(call)
    if (mode === 'network') throw new TypeError('Failed to fetch')
    if (typeof mode === 'number') return new Response(JSON.stringify({ error: `status ${mode}` }), { status: mode })
    const method = init?.method ?? 'GET'
    let body: any = { success: true }
    let status = 200
    if (url === '/api/transactions' && method === 'POST') {
      const t = JSON.parse(String(init!.body)).transaction
      const dup = rows.has(t.id)
      if (!dup) rows.set(t.id, t)
      body = { transaction: rows.get(t.id), duplicate: dup }
      status = dup ? 200 : 201
    } else if (url.startsWith('/api/transactions?id=') && method === 'DELETE') {
      const id = new URL(url, 'http://x').searchParams.get('id')!
      if (!rows.has(id)) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      rows.delete(id)
    }
    // 'drop-response': the server DID process it, but the client never sees the answer.
    if (mode === 'drop-response') throw new TypeError('Network connection lost')
    return new Response(JSON.stringify(body), { status })
  }
  return { rows, fetchFn, calls: () => calls }
}

test('lost response after the server saved: the retry creates ONE transaction (spec 43)', async () => {
  const storage = memoryStorage()
  const server = fakeServer((call) => (call === 1 ? 'drop-response' : 'ok'))
  const t = sampleTx()
  enqueueOp(storage, 'q', { type: 'add_tx', tx: t })

  const first = await flushQueue({ storage, key: 'q', fetchFn: server.fetchFn })
  assert.equal(first.stoppedBy, 'network')
  assert.equal(readQueue(storage, 'q').length, 1, 'item must stay queued, not be dropped')
  assert.equal(server.rows.size, 1, 'server already holds it')

  const second = await flushQueue({ storage, key: 'q', fetchFn: server.fetchFn })
  assert.equal(second.stoppedBy, undefined)
  assert.equal(readQueue(storage, 'q').length, 0)
  assert.equal(server.rows.size, 1, 'still exactly one 2,000 expense')
})

test('two concurrent flushes (reconnect event + load effect) send each item once and share one run', async () => {
  const storage = memoryStorage()
  const server = fakeServer()
  enqueueOp(storage, 'q2', { type: 'add_tx', tx: sampleTx() })
  enqueueOp(storage, 'q2', { type: 'add_tx', tx: sampleTx(500) })
  const [a, b] = await Promise.all([
    flushQueue({ storage, key: 'q2', fetchFn: server.fetchFn }),
    flushQueue({ storage, key: 'q2', fetchFn: server.fetchFn }),
  ])
  assert.equal(a, b, 'second caller joins the running flush')
  assert.equal(server.calls(), 2)
  assert.equal(server.rows.size, 2)
})

test('the same offline transaction syncing twice still yields one row (matrix 7 and 8)', async () => {
  const storage = memoryStorage()
  const server = fakeServer()
  const t = sampleTx()
  enqueueOp(storage, 'q3', { type: 'add_tx', tx: t })
  enqueueOp(storage, 'q3', { type: 'add_tx', tx: t }) // same id enqueued twice (e.g. a second tab)
  await flushQueue({ storage, key: 'q3', fetchFn: server.fetchFn })
  assert.equal(server.rows.size, 1)
  assert.equal(server.calls(), 2)
})

test('sync failures 400/401/403/409/429/500: never lost, never duplicated, correct status', async () => {
  for (const [code, expected] of [[400, 'failed'], [403, 'failed'], [409, 'failed'], [401, 'pending'], [429, 'pending'], [500, 'pending']] as const) {
    const storage = memoryStorage()
    const server = fakeServer(() => code)
    enqueueOp(storage, 'q', { type: 'add_tx', tx: sampleTx() })
    await flushQueue({ storage, key: 'q', fetchFn: server.fetchFn })
    const queue = readQueue(storage, 'q')
    assert.equal(queue.length, 1, `${code}: item must remain visible`)
    assert.equal(queue[0].status, expected, `${code}`)
    assert.equal(server.rows.size, 0)
    if (expected === 'failed') assert.match(queue[0].error ?? '', /status/)
  }
})

test('a retryable error stops the run and keeps order; a failed item does not block later ones', async () => {
  const storage = memoryStorage()
  const server = fakeServer((call) => (call === 1 ? 400 : 'ok'))
  enqueueOp(storage, 'q', { type: 'add_tx', tx: sampleTx(111) })
  enqueueOp(storage, 'q', { type: 'add_tx', tx: sampleTx(222) })
  await flushQueue({ storage, key: 'q', fetchFn: server.fetchFn })
  const queue = readQueue(storage, 'q')
  assert.equal(queue.length, 1)
  assert.equal(queue[0].status, 'failed')
  assert.equal(server.rows.size, 1)

  const s2 = memoryStorage()
  const flaky = fakeServer((call) => (call === 1 ? 500 : 'ok'))
  enqueueOp(s2, 'q', { type: 'add_tx', tx: sampleTx(1) })
  enqueueOp(s2, 'q', { type: 'add_tx', tx: sampleTx(2) })
  await flushQueue({ storage: s2, key: 'q', fetchFn: flaky.fetchFn })
  assert.equal(flaky.calls(), 1, 'must not send item 2 past a retryable failure of item 1')
  assert.equal(readQueue(s2, 'q').filter((i) => i.status === 'pending').length, 2)
})

test('failed items can be retried explicitly and then sync', async () => {
  const storage = memoryStorage()
  const bad = fakeServer(() => 400)
  const item = enqueueOp(storage, 'q', { type: 'add_tx', tx: sampleTx() })
  await flushQueue({ storage, key: 'q', fetchFn: bad.fetchFn })
  assert.equal(readQueue(storage, 'q')[0].status, 'failed')
  const good = fakeServer()
  retryItem(storage, 'q', item.qid)
  await flushQueue({ storage, key: 'q', fetchFn: good.fetchFn })
  assert.equal(readQueue(storage, 'q').length, 0)
  assert.equal(good.rows.size, 1)
})

test('deleting a transaction that is still queued offline: add then delete both apply, nothing resurrects', async () => {
  const storage = memoryStorage()
  const server = fakeServer()
  const t = sampleTx()
  enqueueOp(storage, 'q', { type: 'add_tx', tx: t })
  enqueueOp(storage, 'q', { type: 'delete_tx', id: t.id })
  await flushQueue({ storage, key: 'q', fetchFn: server.fetchFn })
  assert.equal(server.rows.size, 0, 'the deleted transaction must not exist on the server')
  assert.equal(readQueue(storage, 'q').length, 0)
})

test('delete of something already gone (404) counts as done', async () => {
  const storage = memoryStorage()
  const server = fakeServer()
  enqueueOp(storage, 'q', { type: 'delete_tx', id: newId() })
  await flushQueue({ storage, key: 'q', fetchFn: server.fetchFn })
  assert.equal(readQueue(storage, 'q').length, 0)
})

test('pending local entries survive a refresh from the server; failed ones do not count', () => {
  const server: Transaction[] = [sampleTx(100)]
  const pendingAdd = sampleTx(200)
  const failedAdd = sampleTx(300)
  const storage = memoryStorage()
  enqueueOp(storage, 'q', { type: 'add_tx', tx: pendingAdd })
  const f = enqueueOp(storage, 'q', { type: 'add_tx', tx: failedAdd })
  const queue = readQueue(storage, 'q').map((i) => (i.qid === f.qid ? { ...i, status: 'failed' as const } : i))
  const merged = applyPendingToTransactions(server, queue)
  assert.deepEqual(merged.map((t) => t.amount).sort(), [100, 200])
  // already on the server => not added a second time
  assert.equal(applyPendingToTransactions([...server, pendingAdd], queue).length, 2)
})

test('items queued by the previous app version are migrated, not lost', () => {
  const storage = memoryStorage()
  storage.setItem('legacy', JSON.stringify([
    { id: 'x1', type: 'add_project', tempId: 'offline_proj_1', payload: { name: 'P', client: 'C', contractValue: 10, startDate: '2026-01-01' } },
    { id: 'x2', type: 'add_tx', tempId: 'offline_tx_1', payload: { type: 'expense', amount: 2000, date: '2026-11-01', category: 'Cement', party: '', method: 'cash', projectId: 'offline_proj_1' } },
    { id: 'x3', type: 'delete_tx', txId: 'offline_tx_9' },
  ]))
  const q = readQueue(storage, 'legacy')
  assert.equal(q.length, 2, 'the delete for a temp id is dropped, the add/add are kept')
  const proj = q.find((i) => i.type === 'add_project')
  const t = q.find((i) => i.type === 'add_tx')
  assert.ok(proj && t && proj.type === 'add_project' && t.type === 'add_tx')
  assert.equal(t.tx.projectId, proj.project.id, 'transaction keeps its project through the id upgrade')
})
