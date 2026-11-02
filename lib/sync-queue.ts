/**
 * Offline sync engine (pure TypeScript: storage, fetch and locking are injected, so it is unit-tested in Node).
 *
 * Guarantees:
 *  - Every transaction / project has a CLIENT-GENERATED UUID that is sent to the server. The server treats a repeated id
 *    as a replay (returns the stored row), so a retry after a lost response, a second tab, or a double flush can never
 *    create a second transaction.
 *  - Only ONE flush runs per queue at a time (concurrent callers join the running flush).
 *  - An item leaves the queue only after a 2xx (or a 404 for a delete, meaning it is already gone).
 *  - Network errors, 401, 408, 429 and 5xx keep the item queued and stop the run (order is preserved, nothing is lost).
 *  - Any other 4xx marks the item FAILED ("requires attention"): it stays visible in the queue with the server's message,
 *    is never retried automatically, and never counts towards balances.
 */
import type { Project, Transaction } from './data'

export type SyncOp =
  | { type: 'add_tx'; tx: Transaction }
  | { type: 'update_tx'; id: string; patch: Record<string, unknown> }
  | { type: 'delete_tx'; id: string }
  | { type: 'add_project'; project: Project }
  | { type: 'delete_project'; id: string }
  | { type: 'settings'; openingBalance: number; openingCash: number }

export type SyncItem = SyncOp & {
  qid: string
  status: 'pending' | 'failed'
  attempts: number
  error?: string
}

export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export const newId = (): string => globalThis.crypto.randomUUID()

export function readQueue(storage: StorageLike, key: string): SyncItem[] {
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? migrateLegacyQueue(parsed) : []
  } catch {
    return []
  }
}

export function writeQueue(storage: StorageLike, key: string, items: SyncItem[]) {
  storage.setItem(key, JSON.stringify(items))
}

/** Append an operation. A newer settings change replaces an older pending one (latest value wins). */
export function enqueueOp(storage: StorageLike, key: string, op: SyncOp): SyncItem {
  let items = readQueue(storage, key)
  if (op.type === 'settings' && !isFlushing(key)) {
    items = items.filter((i) => !(i.type === 'settings' && i.status === 'pending'))
  }
  const item = { ...op, qid: newId(), status: 'pending', attempts: 0 } as SyncItem
  items.push(item)
  writeQueue(storage, key, items)
  return item
}

export function removeItem(storage: StorageLike, key: string, qid: string) {
  writeQueue(storage, key, readQueue(storage, key).filter((i) => i.qid !== qid))
}

export function retryItem(storage: StorageLike, key: string, qid: string) {
  writeQueue(
    storage,
    key,
    readQueue(storage, key).map((i) => (i.qid === qid ? { ...i, status: 'pending' as const, error: undefined } : i)),
  )
}

function patchItem(storage: StorageLike, key: string, qid: string, patch: Partial<SyncItem>) {
  writeQueue(storage, key, readQueue(storage, key).map((i) => (i.qid === qid ? ({ ...i, ...patch } as SyncItem) : i)))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Queue items written by the previous version (temp ids such as offline_tx_*, payload objects) are converted so that
 * unsynced money entered before the upgrade is not lost.
 */
function migrateLegacyQueue(raw: unknown[]): SyncItem[] {
  const projectIdMap = new Map<string, string>()
  const out: SyncItem[] = []
  for (const entry of raw as Record<string, any>[]) {
    if (entry && typeof entry.qid === 'string') {
      out.push(entry as SyncItem)
      continue
    }
    if (!entry || typeof entry.type !== 'string') continue
    const base = { qid: newId(), status: 'pending' as const, attempts: 0 }
    if (entry.type === 'add_project' && entry.payload) {
      const id = newId()
      if (typeof entry.tempId === 'string') projectIdMap.set(entry.tempId, id)
      out.push({ ...base, type: 'add_project', project: { ...entry.payload, id } })
    } else if (entry.type === 'add_tx' && entry.payload) {
      const projectId = entry.payload.projectId
      const mapped = typeof projectId === 'string' ? (projectIdMap.get(projectId) ?? projectId) : null
      out.push({
        ...base,
        type: 'add_tx',
        tx: { ...entry.payload, id: newId(), projectId: mapped && UUID_RE.test(mapped) ? mapped : null, createdAt: new Date().toISOString() },
      })
    } else if (entry.type === 'delete_tx' && typeof entry.txId === 'string' && UUID_RE.test(entry.txId)) {
      out.push({ ...base, type: 'delete_tx', id: entry.txId })
    } else if (entry.type === 'delete_project' && typeof entry.projectId === 'string' && UUID_RE.test(entry.projectId)) {
      out.push({ ...base, type: 'delete_project', id: entry.projectId })
    } else if (entry.type === 'settings' && entry.payload) {
      out.push({
        ...base,
        type: 'settings',
        openingBalance: Number(entry.payload.openingBalance),
        openingCash: Number(entry.payload.openingCash ?? entry.payload.openingBalance),
      })
    }
  }
  return out
}

/** Server rows + still-pending local operations = what the user should see right now. Failed items are NOT applied. */
export function applyPendingToTransactions(server: Transaction[], items: SyncItem[]): Transaction[] {
  let list = [...server]
  for (const item of items) {
    if (item.status !== 'pending') continue
    if (item.type === 'add_tx') {
      if (!list.some((t) => t.id === item.tx.id)) list.push(item.tx)
    } else if (item.type === 'update_tx') {
      list = list.map((t) => (t.id === item.id ? ({ ...t, ...item.patch } as Transaction) : t))
    } else if (item.type === 'delete_tx') {
      list = list.filter((t) => t.id !== item.id)
    }
  }
  return list
}

export function applyPendingToProjects(server: Project[], items: SyncItem[]): Project[] {
  let list = [...server]
  for (const item of items) {
    if (item.status !== 'pending') continue
    if (item.type === 'add_project' && !list.some((p) => p.id === item.project.id)) list.push(item.project)
    else if (item.type === 'delete_project') list = list.filter((p) => p.id !== item.id)
  }
  return list
}

function requestFor(item: SyncItem): { url: string; init: RequestInit } {
  const json = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  switch (item.type) {
    case 'add_tx':
      return { url: '/api/transactions', init: json('POST', { transaction: item.tx }) }
    case 'update_tx':
      return { url: '/api/transactions', init: json('PATCH', { id: item.id, patch: item.patch }) }
    case 'delete_tx':
      return { url: `/api/transactions?id=${encodeURIComponent(item.id)}`, init: { method: 'DELETE' } }
    case 'add_project':
      return { url: '/api/projects', init: json('POST', { project: item.project }) }
    case 'delete_project':
      return { url: `/api/projects?id=${encodeURIComponent(item.id)}`, init: { method: 'DELETE' } }
    case 'settings':
      return {
        url: '/api/settings',
        init: json('POST', { openingBalance: item.openingBalance, openingCash: item.openingCash }),
      }
  }
}

export type ItemOutcome =
  | { status: 'synced'; json: any }
  | { status: 'failed'; error: string }
  | { status: 'retry'; error: string }

export type FlushResult = {
  outcomes: Map<string, ItemOutcome>
  stoppedBy?: 'network' | 'auth' | 'server'
}

export type FlushOptions = {
  storage: StorageLike
  key: string
  fetchFn: FetchLike
  /** Optional cross-tab lock (navigator.locks). */
  lock?: <T>(fn: () => Promise<T>) => Promise<T>
  onSynced?: (item: SyncItem, json: any) => void
  onFailed?: (item: SyncItem, error: string) => void
}

const running = new Map<string, Promise<FlushResult>>()
export const isFlushing = (key: string) => running.has(key)

/** Sends every pending item in order. Concurrent callers for the same queue share one run. */
export function flushQueue(opts: FlushOptions): Promise<FlushResult> {
  const existing = running.get(opts.key)
  if (existing) return existing
  const run = (opts.lock ? opts.lock(() => doFlush(opts)) : doFlush(opts)).finally(() => running.delete(opts.key))
  running.set(opts.key, run)
  return run
}

async function doFlush(opts: FlushOptions): Promise<FlushResult> {
  const { storage, key, fetchFn } = opts
  const outcomes = new Map<string, ItemOutcome>()
  const attempted = new Set<string>()
  let stoppedBy: FlushResult['stoppedBy']

  while (true) {
    // Re-read every time: items enqueued while the run is in progress are picked up by the same run.
    const next = readQueue(storage, key).find((i) => i.status === 'pending' && !attempted.has(i.qid))
    if (!next) break
    attempted.add(next.qid)

    let outcome: ItemOutcome
    try {
      const { url, init } = requestFor(next)
      const res = await fetchFn(url, init)
      let json: any = null
      try {
        json = await res.json()
      } catch {
        json = null
      }
      const message = (json && typeof json.error === 'string' && json.error) || `Server responded ${res.status}`
      if (res.ok) outcome = { status: 'synced', json }
      else if (res.status === 404 && (next.type === 'delete_tx' || next.type === 'delete_project')) outcome = { status: 'synced', json }
      else if (res.status === 401) {
        outcome = { status: 'retry', error: message }
        stoppedBy = 'auth'
      } else if (res.status === 408 || res.status === 429 || res.status >= 500) {
        outcome = { status: 'retry', error: message }
        stoppedBy = 'server'
      } else outcome = { status: 'failed', error: message }
    } catch (err) {
      outcome = { status: 'retry', error: err instanceof Error ? err.message : 'Network error' }
      stoppedBy = 'network'
    }

    outcomes.set(next.qid, outcome)
    if (outcome.status === 'synced') {
      removeItem(storage, key, next.qid)
      opts.onSynced?.(next, outcome.json)
    } else if (outcome.status === 'failed') {
      patchItem(storage, key, next.qid, { status: 'failed', attempts: next.attempts + 1, error: outcome.error })
      opts.onFailed?.(next, outcome.error)
    } else {
      patchItem(storage, key, next.qid, { attempts: next.attempts + 1, error: outcome.error })
      break // keep order: do not send later items past an item that must be retried
    }
  }
  return { outcomes, stoppedBy }
}
