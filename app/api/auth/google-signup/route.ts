import { NextResponse } from 'next/server'
import { ensureProfileExists, findUserByEmail, supabaseAdmin } from '@/lib/supabase/server'
import { authRateLimiter, getClientIp } from '@/lib/security/rate-limit'
import { createSessionCookie, signSession } from '@/lib/security/session'
import { verifyGoogleToken } from '@/lib/security/google-auth'
import { sanitizeString } from '@/lib/security/validation'
import crypto from 'node:crypto'

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
    const { email, name, googleId, picture, credential, idToken, accessToken } = body

    const tokenToVerify = credential || idToken || accessToken

    // Cryptographically verify Google token
    let verifiedEmail = ''
    let verifiedName = ''
    let verifiedPicture = ''
    let verifiedSub = ''

    if (tokenToVerify) {
      const verified = await verifyGoogleToken(tokenToVerify, !!accessToken && !credential && !idToken)
      if (verified) {
        verifiedEmail = verified.email
        verifiedName = verified.name
        verifiedPicture = verified.picture || ''
        verifiedSub = verified.sub
      }
    }

    // Dev fallback if Google client ID is not yet configured in local environment
    if (!verifiedEmail) {
      if (typeof email === 'string' && email.trim() && process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
        verifiedEmail = email.trim().toLowerCase()
        verifiedName = sanitizeString(name, 100) || verifiedEmail.split('@')[0]
      } else {
        return NextResponse.json(
          { error: 'Google sign-up failed. Invalid or unverified Google credentials.' },
          { status: 401 },
        )
      }
    }

    const trimmedEmail = verifiedEmail.toLowerCase()
    const trimmedName = verifiedName || sanitizeString(name, 100) || trimmedEmail.split('@')[0]

    // 1. Check if user already exists in Supabase
    const existingUser = await findUserByEmail(trimmedEmail)
    if (existingUser) {
      return NextResponse.json(
        {
          error: 'An account with this email already exists. Please log in instead.',
        },
        { status: 409 },
      )
    }

    // 2. Generate a secure internal password for OAuth user
    const internalPassword = crypto.randomUUID() + '-GAuth!' + Date.now()

    // 3. Create the user in Supabase with email_confirm: true
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password: internalPassword,
      email_confirm: true,
      user_metadata: {
        name: trimmedName,
        ownerName: trimmedName,
        businessName: '',
        businessType: '',
        location: '',
        isGoogle: true,
        googleId: verifiedSub || googleId || '',
        picture: verifiedPicture || picture || '',
        onboardingCompleted: false,
        createdAt: new Date().toISOString(),
      },
    })

    if (error || !data.user) {
      console.error('Supabase create Google user error:', error)
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
      openingBalance: 1000,
    })

    const newUser = {
      id: data.user.id,
      name: trimmedName,
      email: trimmedEmail,
      isGoogle: true,
    }

    const initialBusiness = {
      businessName: '',
      ownerName: trimmedName,
      businessType: '',
      location: '',
    }

    // 4. Issue verified session cookie
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
    })

    response.headers.set('Set-Cookie', createSessionCookie(sessionToken))
    return response
  } catch (err: unknown) {
    console.error('Google signup error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred during Google signup. Please try again.' },
      { status: 500 },
    )
  }
}
