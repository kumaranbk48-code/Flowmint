import { NextResponse } from 'next/server'
import { findUserByEmail, supabaseAdmin, supabaseAuthClient } from '@/lib/supabase/server'
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
    const { email } = body

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Please enter your email address.' }, { status: 400 })
    }

    const trimmedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    // 1. Check if the user account exists in Supabase
    const existingUser = await findUserByEmail(trimmedEmail)
    if (!existingUser) {
      return NextResponse.json(
        { error: 'No account found with this email address. Please check your spelling or sign up.' },
        { status: 404 },
      )
    }

    // 2. Determine redirect destination
    const host = req.headers.get('host') || 'localhost:3000'
    const protocol = req.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
    const origin = req.headers.get('origin') || `${protocol}://${host}`
    const redirectUrl = `${origin}/reset-password?email=${encodeURIComponent(trimmedEmail)}`

    // 3. Generate secure recovery link & token via admin client
    let hashedToken = ''
    let actionLink = ''
    try {
      const linkRes = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: trimmedEmail,
        options: {
          redirectTo: redirectUrl,
        },
      })

      if (linkRes.data?.properties) {
        hashedToken = linkRes.data.properties.hashed_token || ''
        actionLink = linkRes.data.properties.action_link || ''
      }
    } catch (e) {
      console.warn('[Forgot Password] Supabase admin generateLink error:', e)
    }

    // 4. Trigger Supabase password reset email dispatch
    try {
      await supabaseAuthClient.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: redirectUrl,
      })
    } catch (e) {
      console.warn('[Forgot Password] Supabase reset request error:', e)
    }

    const directResetUrl = `/reset-password?email=${encodeURIComponent(trimmedEmail)}${
      hashedToken ? `&token=${encodeURIComponent(hashedToken)}` : ''
    }`

    return NextResponse.json({
      success: true,
      email: trimmedEmail,
      message: `Password reset instructions have been generated for ${trimmedEmail}.`,
      resetUrl: directResetUrl,
      actionLink: actionLink || undefined,
    })
  } catch (err: unknown) {
    console.error('Forgot password error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    )
  }
}

