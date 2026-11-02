import { NextResponse } from 'next/server'
import { ensureProfileExists, findUserByEmail, supabaseAdmin } from '@/lib/supabase/server'
import { authRateLimiter, getClientIp } from '@/lib/security/rate-limit'
import { createSessionCookie, signSession } from '@/lib/security/session'
import { verifyGoogleToken } from '@/lib/security/google-auth'
import { sanitizeString } from '@/lib/security/validation'

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

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
    }

    const { email, name, googleId, picture, credential, idToken, accessToken } = body || {}

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

    // If client supplied email but no valid token could be verified, deny login!
    // In local dev without Google OAuth configured, we only allow fallback if email explicitly matches
    if (!verifiedEmail) {
      if (typeof email === 'string' && email.trim() && process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
        // Dev fallback only when Google OAuth credentials have not been configured yet
        verifiedEmail = email.trim().toLowerCase()
        verifiedName = sanitizeString(name, 100) || verifiedEmail.split('@')[0]
      } else {
        return NextResponse.json(
          { error: 'Google authentication failed. Invalid or unverified Google credentials.' },
          { status: 401 },
        )
      }
    }

    const trimmedEmail = verifiedEmail.toLowerCase()
    const trimmedName = verifiedName || sanitizeString(name, 100) || trimmedEmail.split('@')[0]

    // 1. Check if user exists in Supabase
    const existingUser = await findUserByEmail(trimmedEmail)
    if (!existingUser) {
      return NextResponse.json(
        {
          error: `No FlowMint account found for ${trimmedEmail}. Please sign up first.`,
        },
        { status: 404 },
      )
    }

    // Update metadata if needed
    const meta = existingUser.user_metadata || {}
    try {
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        user_metadata: {
          ...meta,
          name: meta.name || trimmedName,
          isGoogle: true,
          googleId: verifiedSub || googleId || meta.googleId,
          picture: verifiedPicture || picture || meta.picture,
          lastLoginAt: new Date().toISOString(),
        },
      })
    } catch {
      // Non-critical update
    }

    const profile = await ensureProfileExists(existingUser.id, {
      businessName: meta.businessName,
      ownerName: meta.ownerName || meta.name || trimmedName,
      businessType: meta.businessType,
      location: meta.location,
      openingBalance: meta.opening_balance !== undefined ? Number(meta.opening_balance) : 1000,
    })

    const user = {
      id: existingUser.id,
      name: profile?.owner_name || meta.name || trimmedName,
      email: existingUser.email || trimmedEmail,
      isGoogle: true,
    }

    const business = {
      businessName: profile?.business_name || meta.businessName || '',
      ownerName: profile?.owner_name || meta.ownerName || meta.name || user.name,
      businessType: profile?.business_type || meta.businessType || '',
      location: profile?.location || meta.location || '',
    }

    const hasCompleted = !!(business.businessName && business.ownerName) || !!meta.onboardingCompleted

    // Issue verified session cookie
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
    })

    response.headers.set('Set-Cookie', createSessionCookie(sessionToken))
    return response
  } catch (err: unknown) {
    console.error('Google login error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred during Google login. Please try again.' },
      { status: 500 },
    )
  }
}
