import { NextResponse } from 'next/server'
import {
  ConflictError,
  getDbLedgerBasis,
  getDbTransactionById,
  getDbTransactions,
  saveDbTransaction,
  softDeleteDbTransaction,
  updateDbTransaction,
  verifyProjectOwnership,
  type TxPatch,
} from '@/lib/supabase/ledger-db'
import { guard, isResponse, readJson } from '@/lib/security/api-guard'
import {
  sanitizeString,
  validateAmount,
  validateCreatedAt,
  validatePayMethod,
  validateSource,
  validateTxDate,
  validateTxType,
  validateUuid,
} from '@/lib/security/validation'
import { checkSpendAllowed } from '@/lib/ledger'
import { formatMoney, todayISO } from '@/lib/format'
import type { Transaction } from '@/lib/data'

const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status })

function spendError(check: Extract<ReturnType<typeof checkSpendAllowed>, { ok: false }>) {
  const what = check.reason === 'cash' ? 'cash in hand' : 'available balance'
  return bad(`Not enough ${what}: ${formatMoney(check.available)} available.`, 422, {
    code: 'INSUFFICIENT_FUNDS',
    reason: check.reason,
    available: check.available,
  })
}

export async function GET(req: Request) {
  const g = guard(req)
  if (isResponse(g)) return g
  try {
    // Always scoped to the authenticated user; a database failure is a 500, never an empty list.
    const transactions = await getDbTransactions(g.userId)
    return NextResponse.json({ transactions })
  } catch (err) {
    console.error('Error fetching transactions:', err)
    return bad('Failed to fetch transactions', 500)
  }
}

export async function POST(req: Request) {
  const g = guard(req)
  if (isResponse(g)) return g
  try {
    const body = await readJson(req)
    const t = body?.transaction as Record<string, unknown> | undefined
    if (!t || typeof t !== 'object') return bad('Invalid transaction payload')

    // Nothing is silently corrected: every invalid field is rejected.
    const amount = validateAmount(t.amount)
    if (!amount.valid) return bad(amount.error || 'Invalid amount')

    const type = validateTxType(t.type)
    if (!type) return bad('Invalid transaction type (must be income, expense or wage)')

    const method = validatePayMethod(t.method)
    if (!method) return bad('Invalid payment method (cash, upi, bank or cheque)')

    const date = validateTxDate(t.date, todayISO())
    if (!date) return bad('Invalid date (must be a real date, not in the future)')

    const source = t.source === undefined ? 'manual' : validateSource(t.source)
    if (!source) return bad('Invalid source (voice or manual)')

    let id: string | undefined
    if (t.id !== undefined && t.id !== null) {
      const valid = validateUuid(t.id)
      if (!valid) return bad('Invalid transaction id')
      id = valid
    }

    let projectId: string | null = null
    if (t.projectId !== undefined && t.projectId !== null && t.projectId !== '') {
      const pid = validateUuid(t.projectId)
      if (!pid) return bad('Invalid project id')
      if (!(await verifyProjectOwnership(g.userId, pid))) return bad('Project not found', 403)
      projectId = pid
    }

    const category = sanitizeString(t.category, 60)
    if (!category) return bad('Category is required')

    // Idempotent replay: the same id must never create a second transaction.
    if (id) {
      const existing = await getDbTransactionById(g.userId, id)
      if (existing) return NextResponse.json({ transaction: existing, duplicate: true }, { status: 200 })
    }

    const createdAt = t.createdAt !== undefined ? validateCreatedAt(t.createdAt) : null
    if (t.createdAt !== undefined && !createdAt) return bad('Invalid createdAt')

    const candidate: Omit<Transaction, 'id'> & { id?: string } = {
      id,
      type,
      amount: amount.amount,
      date,
      time: sanitizeString(t.time, 20) || undefined,
      description: sanitizeString(t.description, 255) || undefined,
      projectId,
      category,
      party: sanitizeString(t.party, 100),
      method,
      source,
      transcript: sanitizeString(t.transcript, 1000) || undefined,
      createdAt: createdAt ?? undefined,
    }

    // Server-side spend rule (authoritative; the client check is only early feedback).
    if (type !== 'income') {
      const basis = await getDbLedgerBasis(g.userId)
      const check = checkSpendAllowed(basis.transactions, basis.openingBalance, basis.openingCash, candidate)
      if (!check.ok) return spendError(check)
    }

    const { tx, created } = await saveDbTransaction(g.userId, candidate)
    return NextResponse.json({ transaction: tx, duplicate: !created }, { status: created ? 201 : 200 })
  } catch (err) {
    if (err instanceof ConflictError) return bad(err.message, 409)
    console.error('Error saving transaction:', err)
    return bad('Failed to save transaction', 500)
  }
}

/** Edit a transaction in place. Body: { id, patch: { amount?, type?, date?, time?, method?, category?, party?, description?, projectId? } } */
export async function PATCH(req: Request) {
  const g = guard(req)
  if (isResponse(g)) return g
  try {
    const body = await readJson(req)
    const id = validateUuid(body?.id)
    const raw = body?.patch as Record<string, unknown> | undefined
    if (!id || !raw || typeof raw !== 'object') return bad('Invalid update payload')

    const patch: TxPatch = {}
    if (raw.amount !== undefined) {
      const a = validateAmount(raw.amount)
      if (!a.valid) return bad(a.error || 'Invalid amount')
      patch.amount = a.amount
    }
    if (raw.type !== undefined) {
      const ty = validateTxType(raw.type)
      if (!ty) return bad('Invalid transaction type')
      patch.type = ty
    }
    if (raw.method !== undefined) {
      const m = validatePayMethod(raw.method)
      if (!m) return bad('Invalid payment method')
      patch.method = m
    }
    if (raw.date !== undefined) {
      const d = validateTxDate(raw.date, todayISO())
      if (!d) return bad('Invalid date (must be a real date, not in the future)')
      patch.date = d
    }
    if (raw.category !== undefined) {
      const c = sanitizeString(raw.category, 60)
      if (!c) return bad('Category is required')
      patch.category = c
    }
    if (raw.time !== undefined) patch.time = sanitizeString(raw.time, 20)
    if (raw.party !== undefined) patch.party = sanitizeString(raw.party, 100)
    if (raw.description !== undefined) patch.description = sanitizeString(raw.description, 255)
    if (raw.projectId !== undefined) {
      if (raw.projectId === null || raw.projectId === '') {
        patch.projectId = null
      } else {
        const pid = validateUuid(raw.projectId)
        if (!pid) return bad('Invalid project id')
        if (!(await verifyProjectOwnership(g.userId, pid))) return bad('Project not found', 403)
        patch.projectId = pid
      }
    }
    if (Object.keys(patch).length === 0) return bad('Nothing to update')

    const current = await getDbTransactionById(g.userId, id)
    if (!current) return bad('Transaction not found', 404)

    // The edited transaction must still satisfy the spend rule, measured against everything else.
    const merged = { ...current, ...patch }
    if (merged.type !== 'income') {
      const basis = await getDbLedgerBasis(g.userId)
      const others = basis.transactions.filter((x) => x.id !== id)
      const check = checkSpendAllowed(others, basis.openingBalance, basis.openingCash, merged)
      if (!check.ok) return spendError(check)
    }

    const updated = await updateDbTransaction(g.userId, id, patch)
    if (!updated) return bad('Transaction not found', 404)
    return NextResponse.json({ transaction: updated })
  } catch (err) {
    console.error('Error updating transaction:', err)
    return bad('Failed to update transaction', 500)
  }
}

export async function DELETE(req: Request) {
  const g = guard(req)
  if (isResponse(g)) return g
  try {
    const id = validateUuid(new URL(req.url).searchParams.get('id'))
    if (!id) return bad('Invalid transaction id')

    const result = await softDeleteDbTransaction(g.userId, id)
    if (result === 'not_found') return bad('Transaction not found', 404)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting transaction:', err)
    return bad('Failed to delete transaction', 500)
  }
}
