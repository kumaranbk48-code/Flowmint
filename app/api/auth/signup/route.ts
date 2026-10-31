import { NextResponse } from 'next/server'
import { ensureProfileExists, findUserByEmail, supabaseAdmin } from '@/lib/supabase/server'
import { authRateLimiter, getClientIp } from '@/lib/security/rate-limit'
import { createSessionCookie, signSession } from '@/lib/security/session'
import { sanitizeString } from '@/lib/security/validation'

export async function POST(req: Request) {
  try {
    // 0. Rate limiting by IP
    const clientIp = getClientIp(req)
    const rateCheck = authRateLimiter.check(clientIp)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many signup attempts. Please try again in ${rateCheck.resetInSeconds} seconds.` },
        { status: 429 },
      )
    }

    const body = await req.json()
    const { name, email, password } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Please enter your full name.' }, { status: 400 })
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Please enter your email address.' }, { status: 400 })
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    if (password.length > 128) {
      return NextResponse.json({ error: 'Password cannot exceed 128 characters.' }, { status: 400 })
    }

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = sanitizeString(name, 100)

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    // 1. Check if user already exists in Supabase
    const existingUser = await findUserByEmail(trimmedEmail)
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please log in instead.' },
        { status: 409 },
      )
    }

    // 2. Create the user in Supabase with pre-confirmed email
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        name: trimmedName,
        ownerName: trimmedName,
        businessName: '',
        businessType: '',
        location: '',
        isGoogle: false,
        onboardingCompleted: false,
        createdAt: new Date().toISOString(),
      },
    })

    if (error || !data.user) {
      console.error('Supabase create user error:', error)
      return NextResponse.json(
        { error: error?.message || 'Failed to create your account in Supabase. Please try again.' },
        { status: 500 },
      )
    }

    await ensureProfileExists(data.user.id, {
      ownerName: trimmedName,
      businessName: '',
      businessType: '',
      location: '',
      openingBalance: 0,
    })

    const newUser = {
      id: data.user.id,
      name: trimmedName,
      email: trimmedEmail,
      isGoogle: false,
    }

    const initialBusiness = {
      businessName: '',
      ownerName: trimmedName,
      businessType: '',
      location: '',
    }

    // 3. Issue verified session token
    const sessionToken = signSession({
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name,
    })

    const response = NextResponse.json({
      success: true,
      user: newUser,
      business: initialBusiness,
      onboardingCompleted: false,
      token: sessionToken,
    })

    response.headers.set('Set-Cookie', createSessionCookie(sessionToken))
    return response
  } catch (err: unknown) {
    console.error('Signup error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred during signup. Please try again.' },
      { status: 500 },
    )
  }
}
