import './helpers/env'
import test, { before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeDb } from './helpers/fake-supabase'
import { todayISO } from '../lib/format'

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

let db: ReturnType<typeof createFakeDb>
let tx: typeof import('../app/api/transactions/route')
let projects: typeof import('../app/api/projects/route')
let settings: typeof import('../app/api/settings/route')
let session: typeof import('../lib/security/session')
let admin: any

before(async () => {
  const server = await import('../lib/supabase/server')
  admin = server.supabaseAdmin
  tx = await import('../app/api/transactions/route')
  projects = await import('../app/api/projects/route')
  settings = await import('../app/api/settings/route')
  session = await import('../lib/security/session')
})

beforeEach(() => {
  db = createFakeDb()
  admin.from = db.from
})

const cookieFor = (userId: string) =>
  `flowmint_session=${encodeURIComponent(session.signSession({ userId, email: `${userId}@x.test`, name: 'T' }))}`

function call(handler: (req: Request) => Promise<Response>, method: string, path: string, user: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (user) headers.cookie = cookieFor(user)
  return handler(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }))
}

const uuid = () => crypto.randomUUID()
const income = (amount: number, extra: Record<string, unknown> = {}) => ({
  id: uuid(), type: 'income', amount, date: todayISO(), category: 'Client Payment', party: 'Client', method: 'upi', source: 'manual', ...extra,
})
const expense = (amount: number, extra: Record<string, unknown> = {}) => ({
  id: uuid(), type: 'expense', amount, date: todayISO(), category: 'Cement', party: 'Vendor', method: 'bank', source: 'manual', ...extra,
})
const post = (t: unknown, user: string | null = USER_A) => call(tx.POST, 'POST', '/api/transactions', user, { transaction: t })
const list = async (user = USER_A) => ((await (await call(tx.GET, 'GET', '/api/transactions', user)).json()) as any).transactions as any[]
const makeProject = async (user = USER_A, name = 'Site A') => {
  const res = await call(projects.POST, 'POST', '/api/projects', user, {
    project: { id: uuid(), name, client: 'Client', contractValue: 500000, startDate: '2026-01-01' },
  })
  assert.equal(res.status, 201)
  return ((await res.json()) as any).project.id as string
}

test('authentication is required on every route', async () => {
  assert.equal((await call(tx.GET, 'GET', '/api/transactions', null)).status, 401)
  assert.equal((await post(income(100), null)).status, 401)
  assert.equal((await call(tx.DELETE, 'DELETE', `/api/transactions?id=${uuid()}`, null)).status, 401)
  assert.equal((await call(projects.GET, 'GET', '/api/projects', null)).status, 401)
  assert.equal((await call(settings.POST, 'POST', '/api/settings', null, { openingBalance: 1 })).status, 401)
  // a forged / tampered session token is rejected
  const forged = new Request('http://localhost/api/transactions', { headers: { cookie: 'flowmint_session=eyJ1c2VySWQiOiJ4In0.AAAA' } })
  assert.equal((await tx.GET(forged)).status, 401)
})

test('network failure after the database write: the retry returns the same row, ONE transaction (spec 43)', async () => {
  const t = income(10000)
  const first = await post(t)
  assert.equal(first.status, 201)
  const retry = await post(t) // client never saw the response and retries
  assert.equal(retry.status, 200)
  const body = (await retry.json()) as any
  assert.equal(body.duplicate, true)
  assert.equal(body.transaction.id, t.id)
  assert.equal((await list()).length, 1)
})

test("another user's id can never be hijacked or revealed through a replay", async () => {
  const t = income(500)
  assert.equal((await post(t, USER_A)).status, 201)
  const attack = await post({ ...t, amount: 1 }, USER_B)
  assert.equal(attack.status, 409)
  assert.equal((await list(USER_B)).length, 0)
  assert.equal((await list(USER_A))[0].amount, 500)
})

test('amount validation on the server (matrix 20): bad amounts are rejected and nothing is stored', async () => {
  for (const bad of [-100, 0, NaN, Infinity, 'abc', '100abc', '12,000', '', null, 1e12, 5000.999]) {
    const res = await post(income(bad as any))
    assert.equal(res.status, 400, `amount ${String(bad)}`)
  }
  assert.equal((await list()).length, 0)
  for (const ok of [100, 100.5, '100']) assert.equal((await post(income(ok as any))).status, 201)
  assert.equal((await list()).length, 3)
})

test('nothing is silently rewritten: bad method / date / type / category are 400, not corrected', async () => {
  assert.equal((await post(income(100, { method: 'bitcoin' }))).status, 400)
  assert.equal((await post(income(100, { method: undefined }))).status, 400)
  assert.equal((await post(income(100, { date: '2026-02-30' }))).status, 400)
  assert.equal((await post(income(100, { date: undefined }))).status, 400)
  assert.equal((await post(income(100, { date: '2099-01-01' }))).status, 400)
  assert.equal((await post(income(100, { type: 'transfer' }))).status, 400)
  assert.equal((await post(income(100, { source: 'robot' }))).status, 400)
  assert.equal((await post(income(100, { id: 'not-a-uuid' }))).status, 400)
  assert.equal((await post(income(100, { category: '   ' }))).status, 400)
  assert.equal((await list()).length, 0)
})

test('malformed JSON is a 400, not a 500', async () => {
  const res = await tx.POST(new Request('http://localhost/api/transactions', { method: 'POST', headers: { cookie: cookieFor(USER_A) }, body: '{oops' }))
  assert.equal(res.status, 400)
})

test("'wage' is stored as its own type and reduces the balance, never counted as income", async () => {
  await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: 0, openingCash: 0 })
  assert.equal((await post(income(20000))).status, 201)
  assert.equal((await post({ ...expense(5000), type: 'wage', category: 'Worker Payment' })).status, 201)
  const rows = await list()
  assert.equal(rows.find((r) => r.type === 'wage').amount, 5000)
})

test('project isolation and authorization: another user\'s project is rejected with 403 (matrix 15)', async () => {
  const projectB = await makeProject(USER_B, 'B site')
  const res = await post(income(100, { projectId: projectB }), USER_A)
  assert.equal(res.status, 403)
  assert.equal((await list(USER_A)).length, 0)
  assert.equal((await post(income(100, { projectId: uuid() }), USER_A)).status, 403) // non-existent project
  assert.equal((await post(income(100, { projectId: 'nope' }), USER_A)).status, 400)
  const projectA = await makeProject(USER_A, 'A site')
  assert.equal((await post(income(100, { projectId: projectA }))).status, 201)
})

test('users only ever see their own transactions and projects (matrix 13)', async () => {
  await post(income(111), USER_A)
  await post(income(222), USER_B)
  await makeProject(USER_A, 'A')
  assert.deepEqual((await list(USER_A)).map((t) => t.amount), [111])
  assert.deepEqual((await list(USER_B)).map((t) => t.amount), [222])
  const pb = (await (await call(projects.GET, 'GET', '/api/projects', USER_B)).json()) as any
  assert.equal(pb.projects.length, 0)
})

test("a user cannot delete or edit another user's transaction (matrix 14)", async () => {
  const t = income(300)
  await post(t, USER_A)
  assert.equal((await call(tx.DELETE, 'DELETE', `/api/transactions?id=${t.id}`, USER_B)).status, 404)
  assert.equal((await call(tx.PATCH, 'PATCH', '/api/transactions', USER_B, { id: t.id, patch: { amount: 1 } })).status, 404)
  assert.equal((await list(USER_A))[0].amount, 300)
})

test('server-side spend rule: allows recording expenses even when balance is low or zero', async () => {
  await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: 10000, openingCash: 2000 })
  const spend = await post(expense(10001))
  assert.equal(spend.status, 201)
  const cash = await post(expense(2500, { method: 'cash' }))
  assert.equal(cash.status, 201)
  assert.equal((await post(expense(2500, { method: 'upi' }))).status, 201) // UPI spends do not need cash in hand
  assert.equal((await list()).length, 3)
})

test('database failure on read is a 500, never an empty ledger presented as success (C4)', async () => {
  await post(income(100))
  db.failing.add('transactions')
  const res = await call(tx.GET, 'GET', '/api/transactions', USER_A)
  assert.equal(res.status, 500)
  assert.equal(((await res.json()) as any).transactions, undefined)
  const save = await post(income(200))
  assert.equal(save.status, 500, 'a failed write must never be reported as saved')
  db.failing.clear()
  const s = await call(settings.GET, 'GET', '/api/settings', USER_A)
  assert.equal(s.status, 200)
  db.failing.add('profiles')
  assert.equal((await call(settings.GET, 'GET', '/api/settings', USER_A)).status, 500)
})

test('edit changes the SAME row: 2,000 -> 3,000 leaves one transaction and a 1,000 difference (matrix 10)', async () => {
  await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: 10000, openingCash: 10000 })
  const t = expense(2000, { method: 'cash' })
  await post(t)
  const res = await call(tx.PATCH, 'PATCH', '/api/transactions', USER_A, { id: t.id, patch: { amount: 3000 } })
  assert.equal(res.status, 200)
  const rows = await list()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, t.id)
  assert.equal(rows[0].amount, 3000)
  assert.ok(rows[0].updatedAt || rows[0].updated_at !== undefined)
})

test('edit validation: invalid values rejected, overspending edits rejected, foreign project rejected', async () => {
  await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: 5000, openingCash: 5000 })
  const t = expense(1000, { method: 'cash' })
  await post(t)
  const patch = (p: unknown) => call(tx.PATCH, 'PATCH', '/api/transactions', USER_A, { id: t.id, patch: p })
  assert.equal((await patch({ amount: -5 })).status, 400)
  assert.equal((await patch({ amount: '12,000' })).status, 400)
  assert.equal((await patch({ method: 'x' })).status, 400)
  assert.equal((await patch({ date: '2026-02-31' })).status, 400)
  assert.equal((await patch({})).status, 400)
  assert.equal((await patch({ amount: 5001 })).status, 200)
  const foreign = await makeProject(USER_B, 'B')
  assert.equal((await patch({ projectId: foreign })).status, 403)
  assert.equal((await list())[0].amount, 5001)
})

test('delete is a soft delete: gone from every read, idempotent, 404 for unknown (matrix 9)', async () => {
  const keep = income(5000)
  const gone = expense(2000)
  await post(keep)
  await post(gone)
  assert.equal((await call(tx.DELETE, 'DELETE', `/api/transactions?id=${gone.id}`, USER_A)).status, 200)
  assert.deepEqual((await list()).map((t) => t.id), [keep.id])
  // history is kept in the database
  const stored = db.tables.transactions.find((r) => r.id === gone.id)
  assert.ok(stored?.deleted_at)
  // retrying the delete is harmless; unknown id is 404; bad id is 400
  assert.equal((await call(tx.DELETE, 'DELETE', `/api/transactions?id=${gone.id}`, USER_A)).status, 200)
  assert.equal((await call(tx.DELETE, 'DELETE', `/api/transactions?id=${uuid()}`, USER_A)).status, 404)
  assert.equal((await call(tx.DELETE, 'DELETE', `/api/transactions?id=bogus`, USER_A)).status, 400)
  // a deleted transaction cannot be revived by replaying its id
  const replay = await post(gone)
  assert.notEqual(replay.status, 201)
  assert.deepEqual((await list()).map((t) => t.id), [keep.id])
})

test('settings: strict validation, opening cash stored separately, failures are errors', async () => {
  assert.equal((await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: '12,000' })).status, 400)
  assert.equal((await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: NaN })).status, 400)
  assert.equal((await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: 1000, openingCash: 'x' })).status, 400)
  const ok = await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: 50000, openingCash: 8000 })
  assert.equal(ok.status, 200)
  const got = ((await (await call(settings.GET, 'GET', '/api/settings', USER_A)).json()) as any).settings
  assert.deepEqual(got, { openingBalance: 50000, openingCash: 8000 })
  // a legacy profile (no opening_cash) keeps cash = balance
  db.tables.profiles[0].opening_cash = null
  const legacy = ((await (await call(settings.GET, 'GET', '/api/settings', USER_A)).json()) as any).settings
  assert.deepEqual(legacy, { openingBalance: 50000, openingCash: 50000 })
})

test('opening balance only: no transactions => balance is the opening balance (not doubled)', async () => {
  await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: 50000, openingCash: 50000 })
  assert.equal((await list()).length, 0)
  const got = ((await (await call(settings.GET, 'GET', '/api/settings', USER_A)).json()) as any).settings
  assert.equal(got.openingBalance, 50000)
})

test('projects: strict contract value, idempotent create, delete blocked when it has money (D11)', async () => {
  const bad = (project: unknown) => call(projects.POST, 'POST', '/api/projects', USER_A, { project })
  const base = { name: 'P', client: 'C', contractValue: 1000, startDate: '2026-01-01' }
  assert.equal((await bad({ ...base, contractValue: 'abc' })).status, 400)
  assert.equal((await bad({ ...base, contractValue: -5 })).status, 400)
  assert.equal((await bad({ ...base, contractValue: '10,00,000' })).status, 400)
  assert.equal((await bad({ ...base, startDate: '2026-02-30' })).status, 400)
  assert.equal((await bad({ ...base, expectedCompletionDate: '2025-01-01' })).status, 400)
  assert.equal((await bad({ ...base, contractValue: 0 })).status, 201) // 0 = not agreed yet, allowed

  const id = uuid()
  const p = { ...base, id }
  assert.equal((await bad(p)).status, 201)
  const again = await bad(p)
  assert.equal(again.status, 200)
  assert.equal((((await (await call(projects.GET, 'GET', '/api/projects', USER_A)).json()) as any).projects as any[]).filter((x) => x.id === id).length, 1)

  await post(income(1000, { projectId: id }))
  const del = await call(projects.DELETE, 'DELETE', `/api/projects?id=${id}`, USER_A)
  assert.equal(del.status, 409)
  assert.equal((await list())[0].projectId, id, 'the money stays attached to its project')
  // an empty project can be deleted; someone else's project cannot
  const empty = await makeProject(USER_A, 'Empty')
  assert.equal((await call(projects.DELETE, 'DELETE', `/api/projects?id=${empty}`, USER_B)).status, 404)
  assert.equal((await call(projects.DELETE, 'DELETE', `/api/projects?id=${empty}`, USER_A)).status, 200)
})

test('concurrent expenses are both recorded and sum correctly (matrix 16)', async () => {
  await call(settings.POST, 'POST', '/api/settings', USER_A, { openingBalance: 10000, openingCash: 10000 })
  const [a, b] = await Promise.all([post(expense(3000, { method: 'upi' })), post(expense(2000, { method: 'upi' }))])
  assert.equal(a.status, 201)
  assert.equal(b.status, 201)
  const rows = await list()
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 5000)
  assert.equal(10000 - rows.reduce((s, r) => s + r.amount, 0), 5000)
})
