import { NextResponse } from 'next/server'
import { supabaseAdmin, supabaseAuthClient } from '@/lib/supabase/server'
import { authRateLimiter, getClientIp } from '@/lib/security/rate-limit'

const MIN_PASSWORD_LENGTH = 8
const MAX_RECOVERY_TOKEN_AGE_SECONDS = 60 * 60

function jwtIssuedAt(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { iat?: number }
    return typeof payload.iat === 'number' ? payload.iat : null
  } catch {
    return null
  }
}

/**
 * Sets a new password. Requires proof that the caller received the recovery email:
 *  - tokenHash: the single-use token_hash from the emailed link (verified and consumed by Supabase), or
 *  - accessToken: the short-lived recovery session token from the emailed link (verified by Supabase, max 1 hour old).
 * An email address alone is NEVER sufficient.
 */
export async function POST(req: Request) {
  try {
    const rateCheck = authRateLimiter.check(getClientIp(req))
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Please wait ${rateCheck.resetInSeconds} seconds.` },
        { status: 429 },
      )
    }

    let body: { tokenHash?: unknown; accessToken?: unknown; password?: unknown } = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const { tokenHash, accessToken, password } = body
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
      return NextResponse.json(
        { error: `Password must be between ${MIN_PASSWORD_LENGTH} and 128 characters.` },
        { status: 400 },
      )
    }

    let userId: string | null = null
    if (typeof tokenHash === 'string' && tokenHash.length > 0) {
      const { data, error } = await supabaseAuthClient.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
      if (!error) userId = data.user?.id ?? null
    } else if (typeof accessToken === 'string' && accessToken.length > 0) {
      const iat = jwtIssuedAt(accessToken)
      const fresh = iat !== null && Date.now() / 1000 - iat <= MAX_RECOVERY_TOKEN_AGE_SECONDS
      if (fresh) {
        const { data, error } = await supabaseAdmin.auth.getUser(accessToken)
        if (!error) userId = data.user?.id ?? null
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'This reset link is invalid or has expired. Please request a new one.' }, { status: 401 })
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
    if (updateError) {
      console.error('Password update failed:', updateError.message)
      return NextResponse.json({ error: 'Could not update the password. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Your password has been updated successfully!' })
  } catch (err) {
    console.error('reset-password error:', err)
    return NextResponse.json({ error: 'Failed to reset password.' }, { status: 500 })
  }
}
