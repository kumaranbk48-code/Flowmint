import { NextResponse } from 'next/server'
import { ensureProfileExists, findUserByEmail, supabaseAuthClient } from '@/lib/supabase/server'
import { authRateLimiter, getClientIp } from '@/lib/security/rate-limit'
import { createSessionCookie, signSession } from '@/lib/security/session'

export async function POST(req: Request) {
  try {
    // 0. Rate limiting by IP
    const clientIp = getClientIp(req)
    const rateCheck = authRateLimiter.check(clientIp)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Please try again in ${rateCheck.resetInSeconds} seconds.` },
        { status: 429 },
      )
    }

    const body = await req.json()
    const { email, password } = body

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 })
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 })
    }

    const trimmedEmail = email.trim().toLowerCase()

    // 1. Check if user exists in Supabase
    const existingUser = await findUserByEmail(trimmedEmail)
    if (!existingUser) {
      return NextResponse.json(
        { error: 'Invalid email or password. Please check your credentials or sign up.' },
        { status: 401 },
      )
    }

    // 2. Validate password via Supabase Auth
    const { data: authData, error: authError } = await supabaseAuthClient.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: 'Invalid email or password. Please check your credentials or sign up.' },
        { status: 401 },
      )
    }

    // 3. Extract profile and ensure record in public.profiles table
    const meta = existingUser.user_metadata || {}
    const profile = await ensureProfileExists(existingUser.id, {
      businessName: meta.businessName,
      ownerName: meta.ownerName || meta.name,
      businessType: meta.businessType,
      location: meta.location,
      openingBalance: meta.opening_balance !== undefined ? Number(meta.opening_balance) : 1000,
    })

    const user = {
      id: existingUser.id,
      name: profile?.owner_name || meta.name || trimmedEmail.split('@')[0],
      email: existingUser.email || trimmedEmail,
      isGoogle: !!meta.isGoogle,
    }

    const business = {
      businessName: profile?.business_name || meta.businessName || '',
      ownerName: profile?.owner_name || meta.ownerName || meta.name || user.name,
      businessType: profile?.business_type || meta.businessType || '',
      location: profile?.location || meta.location || '',
    }

    const hasCompleted = !!(business.businessName && business.ownerName) || !!meta.onboardingCompleted

    // 4. Generate cryptographically verified session token & Set-Cookie header
    const sessionToken = signSession({
      userId: user.id,
      email: user.email,
      name: user.name,
    })

    const response = NextResponse.json({
      success: true,
      user,
      business,
      onboardingCompleted: hasCompleted,
      token: sessionToken,
    })

    response.headers.set('Set-Cookie', createSessionCookie(sessionToken))
    return response
  } catch (err: unknown) {
    console.error('Login error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred during login. Please try again.' },
      { status: 500 },
    )
  }
}
