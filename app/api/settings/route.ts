import { NextResponse } from 'next/server'
import { getDbSettings, updateDbSettings } from '@/lib/supabase/ledger-db'
import { guard, isResponse, readJson } from '@/lib/security/api-guard'
import { validateOpeningBalance } from '@/lib/security/validation'

export async function GET(req: Request) {
  const g = guard(req)
  if (isResponse(g)) return g
  try {
    const settings = await getDbSettings(g.userId)
    return NextResponse.json({ settings })
  } catch (err) {
    console.error('Error fetching settings:', err)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

/** Body: { openingBalance }. The opening balance is set once; every day's opening is derived from it. */
export async function POST(req: Request) {
  const g = guard(req)
  if (isResponse(g)) return g
  try {
    const body = await readJson(req)
    const bal = validateOpeningBalance(body?.openingBalance)
    if (!bal.valid) {
      return NextResponse.json({ error: 'Invalid openingBalance format or value out of bounds.' }, { status: 400 })
    }

    await updateDbSettings(g.userId, { openingBalance: bal.balance })
    return NextResponse.json({ success: true, openingBalance: bal.balance })
  } catch (err) {
    console.error('Error updating settings:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
