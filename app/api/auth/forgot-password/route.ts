import { NextResponse } from 'next/server'
import { supabaseAuthClient } from '@/lib/supabase/server'
import { authRateLimiter, getClientIp } from '@/lib/security/rate-limit'

/** Identical response whether or not the account exists (no user enumeration, no token in the response). */
const GENERIC_MESSAGE = 'If an account exists for this email, a password reset link has been sent.'

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req)
    const rateCheck = authRateLimiter.check(clientIp)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many password reset requests. Please wait ${rateCheck.resetInSeconds} seconds.` },
        { status: 429 },
      )
    }

    let email: unknown
    try {
      email = ((await req.json()) as { email?: unknown })?.email
    } catch {
      email = undefined
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    // The link is only ever delivered by email. The redirect target comes from server configuration,
    // never from request headers (a forged Origin/Host header could otherwise point the emailed link at an attacker's site).
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
      (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined)
    const { error } = await supabaseAuthClient.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      siteUrl ? { redirectTo: `${siteUrl}/reset-password` } : undefined,
    )
    if (error) console.error('resetPasswordForEmail failed:', error.message)

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE })
  } catch (err) {
    console.error('forgot-password error:', err)
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE })
  }
}
