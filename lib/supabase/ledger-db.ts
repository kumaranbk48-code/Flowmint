import { ensureProfileExists, supabaseAdmin } from './server'
import {
  DEFAULT_OPENING_BALANCE,
  type Project,
  type Transaction,
} from '@/lib/data'

/**
 * Fetch contractor transactions directly from Supabase PostgreSQL table.
 */
export async function getDbTransactions(userId: string): Promise<Transaction[]> {
  try {
    await ensureProfileExists(userId)

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (!error && Array.isArray(data)) {
      return data.map((row) => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        date: row.date,
        time: row.time || undefined,
        description: row.description || undefined,
        projectId: row.project_id || null,
        category: row.category,
        party: row.party || '',
        method: row.method,
        source: row.source || 'voice',
        transcript: row.transcript || undefined,
      }))
    }

    if (error) {
      console.error('Error in getDbTransactions from Supabase:', error)
    }

    return []
  } catch (err) {
    console.error('getDbTransactions exception:', err)
    return []
  }
}

/**
 * Save new transaction to Supabase public.transactions table.
 */
export async function saveDbTransaction(
  userId: string,
  tx: Omit<Transaction, 'id'>,
): Promise<Transaction> {
  // Ensure the parent profile exists in profiles table
  await ensureProfileExists(userId)

  try {
    const payload = {
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
      source: tx.source || 'voice',
      transcript: tx.transcript || null,
    }

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error('Error inserting transaction into Supabase:', error)
      throw error
    }

    return {
      id: data.id,
      type: data.type,
      amount: Number(data.amount),
      date: data.date,
      time: data.time || undefined,
      description: data.description || undefined,
      projectId: data.project_id || null,
      category: data.category,
      party: data.party || '',
      method: data.method,
      source: data.source,
      transcript: data.transcript || undefined,
    }
  } catch (err) {
    console.error('saveDbTransaction failed:', err)
    throw err
  }
}

/**
 * Delete a transaction from Supabase
 */
export async function deleteDbTransaction(userId: string, txId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('transactions')
      .delete()
      .eq('id', txId)
      .eq('user_id', userId)

    return !error
  } catch (err) {
    console.error('deleteDbTransaction error:', err)
    return false
  }
}

/**
 * Verifies that a given project ID belongs to the specified user.
 */
export async function verifyProjectOwnership(userId: string, projectId: string): Promise<boolean> {
  if (!userId || !projectId) return false
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle()

    return !error && !!data
  } catch {
    return false
  }
}

/**
 * Fetch building projects for contractor from Supabase
 */
export async function getDbProjects(userId: string): Promise<Project[]> {
  try {
    await ensureProfileExists(userId)

    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (!error && Array.isArray(data)) {
      return data.map((row) => ({
        id: row.id,
        name: row.name,
        client: row.client,
        contractValue: Number(row.contract_value),
        startDate: row.start_date,
        expectedCompletionDate: row.expected_completion_date || undefined,
        status: row.status || 'active',
      }))
    }

    if (error) {
      console.error('Error fetching projects from Supabase:', error)
    }

    return []
  } catch (err) {
    console.error('getDbProjects exception:', err)
    return []
  }
}

/**
 * Save new building project to Supabase
 */
export async function saveDbProject(
  userId: string,
  projectInput: {
    name: string
    client: string
    contractValue: number
    startDate: string
    expectedCompletionDate?: string
  },
): Promise<Project> {
  await ensureProfileExists(userId)

  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: userId,
        name: projectInput.name.trim(),
        client: projectInput.client.trim(),
        contract_value: projectInput.contractValue,
        start_date: projectInput.startDate,
        expected_completion_date: projectInput.expectedCompletionDate || null,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating project in Supabase:', error)
      throw error
    }

    return {
      id: data.id,
      name: data.name,
      client: data.client,
      contractValue: Number(data.contract_value),
      startDate: data.start_date,
      expectedCompletionDate: data.expected_completion_date || undefined,
      status: data.status,
    }
  } catch (err) {
    console.error('saveDbProject failed:', err)
    throw err
  }
}

/**
 * Delete a project and unbind project transactions in Supabase
 */
export async function deleteDbProject(userId: string, projectId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId)

    return !error
  } catch (err) {
    console.error('deleteDbProject error:', err)
    return false
  }
}

/**
 * Fetch contractor opening balance from public.profiles
 */
export async function getDbSettings(userId: string): Promise<{ openingBalance: number }> {
  try {
    const profile = await ensureProfileExists(userId)
    if (profile?.opening_balance !== undefined && profile?.opening_balance !== null) {
      return { openingBalance: Number(profile.opening_balance) }
    }

    const { data } = await supabaseAdmin
      .from('profiles')
      .select('opening_balance')
      .eq('id', userId)
      .maybeSingle()

    if (data?.opening_balance !== undefined && data?.opening_balance !== null) {
      return { openingBalance: Number(data.opening_balance) }
    }

    return { openingBalance: DEFAULT_OPENING_BALANCE }
  } catch (err) {
    console.error('getDbSettings error:', err)
    return { openingBalance: DEFAULT_OPENING_BALANCE }
  }
}

/**
 * Update contractor opening balance in public.profiles
 */
export async function updateDbSettings(
  userId: string,
  settings: { openingBalance: number },
): Promise<boolean> {
  try {
    await ensureProfileExists(userId)

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ opening_balance: settings.openingBalance })
      .eq('id', userId)

    return !error
  } catch (err) {
    console.error('updateDbSettings error:', err)
    return false
  }
}
