import { NextResponse } from 'next/server'
import {
  deleteDbTransaction,
  getDbTransactions,
  saveDbTransaction,
  verifyProjectOwnership,
} from '@/lib/supabase/ledger-db'
import { getAuthenticatedUser } from '@/lib/security/session'
import { apiRateLimiter } from '@/lib/security/rate-limit'
import {
  sanitizeString,
  validateAmount,
  validateIsoDate,
  validatePayMethod,
  validateTxType,
} from '@/lib/security/validation'
import { TODAY } from '@/lib/data'

export async function GET(req: Request) {
  try {
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or expired.' }, { status: 401 })
    }

    const rateCheck = apiRateLimiter.check(auth.userId)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Please slow down.` },
        { status: 429 },
      )
    }

    // Always fetch strictly for the authenticated user, ignoring any query param
    const transactions = await getDbTransactions(auth.userId)
    return NextResponse.json({ transactions })
  } catch (err) {
    console.error('Error fetching transactions:', err)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or expired.' }, { status: 401 })
    }

    const rateCheck = apiRateLimiter.check(auth.userId)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Please slow down.` },
        { status: 429 },
      )
    }

    const body = await req.json()
    const { transaction } = body

    if (!transaction || typeof transaction !== 'object') {
      return NextResponse.json({ error: 'Invalid transaction payload' }, { status: 400 })
    }

    // 1. Validate Amount
    const amountCheck = validateAmount(transaction.amount)
    if (!amountCheck.valid) {
      return NextResponse.json({ error: amountCheck.error || 'Invalid amount' }, { status: 400 })
    }

    // 2. Validate Type
    const validatedType = validateTxType(transaction.type)
    if (!validatedType) {
      return NextResponse.json({ error: 'Invalid transaction type (must be income or expense)' }, { status: 400 })
    }

    // 3. Validate Payment Method
    const validatedMethod = validatePayMethod(transaction.method) || 'cash'

    // 4. Validate Date
    const validatedDate = validateIsoDate(transaction.date) || TODAY

    // 5. Sanitize String Fields
    const category = sanitizeString(transaction.category || 'Other', 60)
    const party = sanitizeString(transaction.party || '', 100)
    const description = sanitizeString(transaction.description || '', 255)
    const time = sanitizeString(transaction.time || '', 20)
    const source = transaction.source === 'manual' ? 'manual' : 'voice'
    const transcript = sanitizeString(transaction.transcript || '', 1000)

    // 6. Verify Project Ownership if projectId provided
    let safeProjectId: string | null = null
    if (transaction.projectId && typeof transaction.projectId === 'string') {
      const isOwner = await verifyProjectOwnership(auth.userId, transaction.projectId.trim())
      if (isOwner) {
        safeProjectId = transaction.projectId.trim()
      } else {
        console.warn(`[Security] User ${auth.userId} attempted to attach transaction to foreign project ${transaction.projectId}`)
        // Fall back to unlinked project rather than throwing or polluting foreign project
        safeProjectId = null
      }
    }

    const sanitizedTx = {
      type: validatedType,
      amount: amountCheck.amount,
      date: validatedDate,
      time: time || undefined,
      description: description || undefined,
      projectId: safeProjectId,
      category,
      party,
      method: validatedMethod,
      source: source as 'voice' | 'manual',
      transcript: transcript || undefined,
    }

    const saved = await saveDbTransaction(auth.userId, sanitizedTx)
    return NextResponse.json({ success: true, transaction: saved })
  } catch (err) {
    console.error('Error saving transaction:', err)
    return NextResponse.json({ error: 'Failed to save transaction' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or expired.' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 })
    }

    // Delete strictly where user_id matches authenticated session
    const success = await deleteDbTransaction(auth.userId, id.trim())
    return NextResponse.json({ success })
  } catch (err) {
    console.error('Error deleting transaction:', err)
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
