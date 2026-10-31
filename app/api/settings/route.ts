import { NextResponse } from 'next/server'
import { getDbSettings, updateDbSettings } from '@/lib/supabase/ledger-db'
import { getAuthenticatedUser } from '@/lib/security/session'
import { apiRateLimiter } from '@/lib/security/rate-limit'
import { validateOpeningBalance } from '@/lib/security/validation'

export async function GET(req: Request) {
  try {
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or expired.' }, { status: 401 })
    }

    const rateCheck = apiRateLimiter.check(auth.userId)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429 },
      )
    }

    const settings = await getDbSettings(auth.userId)
    return NextResponse.json({ settings })
  } catch (err) {
    console.error('Error fetching settings:', err)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
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
        { error: 'Too many requests. Please slow down.' },
        { status: 429 },
      )
    }

    const body = await req.json()
    const { openingBalance } = body

    const balCheck = validateOpeningBalance(openingBalance)
    if (!balCheck.valid) {
      return NextResponse.json({ error: 'Invalid openingBalance format or value out of bounds.' }, { status: 400 })
    }

    const success = await updateDbSettings(auth.userId, {
      openingBalance: balCheck.balance,
    })

    return NextResponse.json({ success, openingBalance: balCheck.balance })
  } catch (err) {
    console.error('Error updating settings:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
