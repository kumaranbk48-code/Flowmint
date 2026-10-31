/**
 * Server-side verification for Google OAuth tokens.
 * Validates Google ID tokens and access tokens against Google's public APIs.
 */

export type VerifiedGoogleUser = {
  sub: string
  email: string
  name: string
  picture?: string
}

const EXPECTED_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

/**
 * Cryptographically verifies a Google ID token or OAuth access token.
 */
export async function verifyGoogleToken(
  tokenOrCredential: string,
  isAccessToken = false,
): Promise<VerifiedGoogleUser | null> {
  if (!tokenOrCredential || typeof tokenOrCredential !== 'string') return null
  const token = tokenOrCredential.trim()
  if (!token) return null

  try {
    if (!isAccessToken) {
      // 1. Verify Google ID token via Google's tokeninfo API
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
        { method: 'GET', cache: 'no-store' },
      )

      if (res.ok) {
        const data = await res.json()
        // Validate aud matches our Google Client ID if configured
        if (EXPECTED_CLIENT_ID && data.aud && data.aud !== EXPECTED_CLIENT_ID) {
          console.warn('[Google Auth] Client ID mismatch in ID token:', data.aud)
          return null
        }

        // Validate email exists and is verified
        if (data.email && (data.email_verified === 'true' || data.email_verified === true)) {
          return {
            sub: data.sub || `g_${Date.now()}`,
            email: data.email.toLowerCase().trim(),
            name: data.name || data.email.split('@')[0],
            picture: data.picture,
          }
        }
      }
    }

    // 2. Fallback: Verify as Google OAuth2 access token via UserInfo API
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (userinfoRes.ok) {
      const data = await userinfoRes.json()
      if (data.email && (data.email_verified === true || data.email_verified === 'true')) {
        return {
          sub: data.sub || `g_${Date.now()}`,
          email: data.email.toLowerCase().trim(),
          name: data.name || data.email.split('@')[0],
          picture: data.picture,
        }
      }
    }

    return null
  } catch (err) {
    console.error('[Google Auth] Exception verifying Google token:', err)
    return null
  }
}

