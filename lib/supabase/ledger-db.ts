import { ensureProfileExists, supabaseAdmin } from './server'
import { DEFAULT_OPENING_BALANCE, type Project, type Transaction } from '@/lib/data'

/**
 * Database access for ledger data.
 *
 * Rules enforced here:
 *  - Read functions THROW on failure. They never return [] or defaults for an error, so the
 *    API can answer 500 instead of presenting "no data" as if it were the truth.
 *  - Deleted transactions are soft-deleted (deleted_at); every read excludes them.
 *  - A transaction/project id may be supplied by the client; inserting the same id again is
 *    an idempotent replay (returns the stored row) instead of a duplicate.
 */

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

type TxRow = Record<string, unknown>

function rowToTx(row: TxRow): Transaction {
  return {
    id: row.id as string,
    type: row.type as Transaction['type'],
    amount: Number(row.amount),
    date: row.date as string,
    time: (row.time as string) || undefined,
    description: (row.description as string) || undefined,
    projectId: (row.project_id as string) || null,
    category: row.category as string,
    party: (row.party as string) || '',
    method: row.method as Transaction['method'],
    source: ((row.source as string) || 'manual') as Transaction['source'],
    transcript: (row.transcript as string) || undefined,
    createdAt: (row.created_at as string) || undefined,
    updatedAt: (row.updated_at as string) || undefined,
  }
}

function rowToProject(row: TxRow): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    client: row.client as string,
    contractValue: Number(row.contract_value),
    startDate: row.start_date as string,
    expectedCompletionDate: (row.expected_completion_date as string) || undefined,
    status: ((row.status as string) || 'active') as Project['status'],
  }
}

const isUniqueViolation = (err: { code?: string } | null) => err?.code === '23505'

export async function getDbTransactions(userId: string): Promise<Transaction[]> {
  const profile = await ensureProfileExists(userId)
  if (!profile) throw new Error('Profile unavailable')

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw error
  return (data ?? []).map(rowToTx)
}

export type SaveTxInput = Omit<Transaction, 'id'> & { id?: string }

/**
 * Insert a transaction. If `tx.id` already exists for this user the stored row is returned
 * with created=false (safe retry). If the id belongs to a different user, ConflictError.
 */
export async function saveDbTransaction(
  userId: string,
  tx: SaveTxInput,
): Promise<{ tx: Transaction; created: boolean }> {
  const profile = await ensureProfileExists(userId)
  if (!profile) throw new Error('Profile unavailable')

  const payload: Record<string, unknown> = {
    user_id: userId,
    project_id: tx.projectId || null,
    type: tx.type,
    amount: tx.amount,
    date: tx.date,
    time: tx.time || null,
    category: tx.category,
    party: tx.party || '',
    description: tx.description || null,
    method: tx.method,
    source: tx.source || 'manual',
    transcript: tx.transcript || null,
  }
  if (tx.id) payload.id = tx.id
  if (tx.createdAt) payload.created_at = tx.createdAt

  const { data, error } = await supabaseAdmin.from('transactions').insert(payload).select().single()

  if (error) {
    if (isUniqueViolation(error) && tx.id) {
      const existing = await getDbTransactionById(userId, tx.id)
      if (existing) return { tx: existing, created: false }
      throw new ConflictError('Transaction id already in use')
    }
    throw error
  }
  return { tx: rowToTx(data), created: true }
}

/** Returns the transaction (including soft-deleted ones are NOT returned). */
export async function getDbTransactionById(userId: string, txId: string): Promise<Transaction | null> {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('id', txId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data ? rowToTx(data) : null
}

export type TxPatch = Partial<
  Pick<Transaction, 'type' | 'amount' | 'date' | 'time' | 'description' | 'projectId' | 'category' | 'party' | 'method'>
>

/** Edit a transaction in place (same id, same row; never creates a second transaction). */
export async function updateDbTransaction(userId: string, txId: string, patch: TxPatch): Promise<Transaction | null> {
  const update: Record<string, unknown> = {}
  if (patch.type !== undefined) update.type = patch.type
  if (patch.amount !== undefined) update.amount = patch.amount
  if (patch.date !== undefined) update.date = patch.date
  if (patch.time !== undefined) update.time = patch.time || null
  if (patch.description !== undefined) update.description = patch.description || null
  if (patch.projectId !== undefined) update.project_id = patch.projectId || null
  if (patch.category !== undefined) update.category = patch.category
  if (patch.party !== undefined) update.party = patch.party
  if (patch.method !== undefined) update.method = patch.method

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .update(update)
    .eq('id', txId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (error) throw error
  return data ? rowToTx(data) : null
}

/** Soft delete. 'deleted' also covers "already deleted" so that retries are harmless. */
export async function softDeleteDbTransaction(userId: string, txId: string): Promise<'deleted' | 'not_found'> {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('transactions')
    .select('id, deleted_at')
    .eq('id', txId)
    .eq('user_id', userId)
    .maybeSingle()
  if (findErr) throw findErr
  if (!existing) return 'not_found'
  if (existing.deleted_at) return 'deleted'

  const { error } = await supabaseAdmin
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', txId)
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (error) throw error
  return 'deleted'
}

/** True only if the project exists AND belongs to the user. Database errors are thrown, not treated as "no". */
export async function verifyProjectOwnership(userId: string, projectId: string): Promise<boolean> {
  if (!userId || !projectId) return false
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

export async function getDbProjects(userId: string): Promise<Project[]> {
  const profile = await ensureProfileExists(userId)
  if (!profile) throw new Error('Profile unavailable')

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error
  return (data ?? []).map(rowToProject)
}

export type SaveProjectInput = {
  id?: string
  name: string
  client: string
  contractValue: number
  startDate: string
  expectedCompletionDate?: string
}

export async function saveDbProject(
  userId: string,
  input: SaveProjectInput,
): Promise<{ project: Project; created: boolean }> {
  const profile = await ensureProfileExists(userId)
  if (!profile) throw new Error('Profile unavailable')

  const payload: Record<string, unknown> = {
    user_id: userId,
    name: input.name.trim(),
    client: input.client.trim(),
    contract_value: input.contractValue,
    start_date: input.startDate,
    expected_completion_date: input.expectedCompletionDate || null,
    status: 'active',
  }
  if (input.id) payload.id = input.id

  const { data, error } = await supabaseAdmin.from('projects').insert(payload).select().single()
  if (error) {
    if (isUniqueViolation(error) && input.id) {
      const { data: existing, error: findErr } = await supabaseAdmin
        .from('projects')
        .select('*')
        .eq('id', input.id)
        .eq('user_id', userId)
        .maybeSingle()
      if (findErr) throw findErr
      if (existing) return { project: rowToProject(existing), created: false }
      throw new ConflictError('Project id already in use')
    }
    throw error
  }
  return { project: rowToProject(data), created: true }
}

/**
 * Delete a project. A project that still has transactions (including soft-deleted ones, which
 * the foreign key also protects) is NOT deleted: that would silently move its money out of
 * every project report.
 */
export async function deleteDbProject(
  userId: string,
  projectId: string,
): Promise<'deleted' | 'not_found' | 'has_transactions'> {
  const { data: project, error: findErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (findErr) throw findErr
  if (!project) return 'not_found'

  const { data: linked, error: linkErr } = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .limit(1)
  if (linkErr) throw linkErr
  if (linked && linked.length > 0) return 'has_transactions'

  const { error } = await supabaseAdmin.from('projects').delete().eq('id', projectId).eq('user_id', userId)
  if (error) {
    // Foreign key (23503) = a transaction was added between the check and the delete.
    if ((error as { code?: string }).code === '23503') return 'has_transactions'
    throw error
  }
  return 'deleted'
}

export type DbSettings = { openingBalance: number }

/**
 * Opening balance set for the business ledger.
 */
export async function getDbSettings(userId: string): Promise<DbSettings> {
  const profile = await ensureProfileExists(userId)
  if (!profile) throw new Error('Profile unavailable')

  const rawBalance = profile.opening_balance
  const openingBalance =
    rawBalance !== undefined && rawBalance !== null ? Number(rawBalance) : DEFAULT_OPENING_BALANCE
  return { openingBalance }
}

export async function updateDbSettings(userId: string, settings: { openingBalance: number }) {
  const profile = await ensureProfileExists(userId)
  if (!profile) throw new Error('Profile unavailable')

  const update: Record<string, unknown> = { opening_balance: settings.openingBalance }
  const { error } = await supabaseAdmin.from('profiles').update(update).eq('id', userId)
  if (error) throw error
}

/** Everything the spend check needs, in one place (server-side source of truth). */
export async function getDbLedgerBasis(userId: string) {
  const [transactions, settings] = await Promise.all([getDbTransactions(userId), getDbSettings(userId)])
  return { transactions, openingBalance: settings.openingBalance }
}
