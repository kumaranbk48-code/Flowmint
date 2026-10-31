import { NextResponse } from 'next/server'
import { findUserByEmail, supabaseAdmin } from '@/lib/supabase/server'
import { authRateLimiter, getClientIp } from '@/lib/security/rate-limit'

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

    const body = await req.json()
    const { email, password } = body

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 })
    }

    const trimmedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 })
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters in length.' },
        { status: 400 },
      )
    }

    // 1. Locate the user in Supabase
    const user = await findUserByEmail(trimmedEmail)
    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email address. Please check your spelling.' },
        { status: 404 },
      )
    }

    // 2. Update password directly via Supabase admin service
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
    })

    if (error || !data.user) {
      console.error('Password reset update error:', error)
      return NextResponse.json(
        { error: error?.message || 'Failed to update password. Please try again.' },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Your password has been reset successfully! You can now sign in with your new password.',
    })
  } catch (err: unknown) {
    console.error('Reset password error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred while resetting your password. Please try again.' },
      { status: 500 },
    )
  }
}

