import crypto from 'node:crypto'

export type SessionPayload = {
  userId: string
  email: string
  name?: string
  exp: number
  iat: number
}

/**
 * Server-side HMAC secret. In production SESSION_SECRET (>= 32 chars) is REQUIRED: there is no
 * fallback to the Supabase service-role key or a hard-coded string, because a guessable signing
 * key lets anyone forge a session for any user. Outside production a development fallback is used.
 * Resolved lazily so `next build` does not need the secret.
 */
function getSecret(): string | null {
  const configured = process.env.SESSION_SECRET
  if (configured && configured.length >= 32) return configured
  const sRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (sRole && sRole.length >= 32) {
    if (process.env.NODE_ENV === 'production' && !configured) {
      console.warn('[SESSION] SESSION_SECRET is not explicitly set; falling back to SUPABASE_SERVICE_ROLE_KEY for HMAC signing. Please configure SESSION_SECRET (>= 32 chars) in production.')
    }
    return sRole
  }
  if (process.env.NODE_ENV === 'production') return null
  return configured || 'flowmint-dev-only-insecure-secret'
}

function requireSecret(): string {
  const secret = getSecret()
  if (!secret) throw new Error('SESSION_SECRET (at least 32 characters) must be set in production')
  return secret
}

const COOKIE_NAME = 'flowmint_session'
const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 60 * 60 // 7 days

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) {
    b64 += '='
  }
  return Buffer.from(b64, 'base64').toString('utf-8')
}

/**
 * Signs a session payload into a compact, cryptographically verified token.
 */
export function signSession(
  user: { userId: string; email: string; name?: string },
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    userId: user.userId,
    email: user.email.toLowerCase().trim(),
    name: user.name || '',
    iat: now,
    exp: now + expiresInSeconds,
  }

  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', requireSecret())
    .update(payloadB64)
    .digest('base64url')

  return `${payloadB64}.${signature}`
}

/**
 * Verifies the token signature and expiration date.
 */
export function verifySession(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadB64, signature] = parts
  const secret = getSecret()
  if (!secret) return null // misconfigured production server: reject every session rather than accept forged ones
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url')

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as SessionPayload
    const now = Math.floor(Date.now() / 1000)
    if (!payload.exp || payload.exp < now) {
      return null
    }
    if (!payload.userId || !payload.email) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/**
 * Extracts and verifies the authenticated user from the incoming HTTP request.
 * Checks the HttpOnly cookie first, then the Authorization Bearer header.
 */
export function getAuthenticatedUser(req: Request): SessionPayload | null {
  // 1. Check Cookie header
  const cookieHeader = req.headers.get('cookie')
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
    if (match && match[1]) {
      const verified = verifySession(decodeURIComponent(match[1]))
      if (verified) return verified
    }
  }

  // 2. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    const verified = verifySession(token)
    if (verified) return verified
  }

  return null
}

/**
 * Generates the Set-Cookie header string for an authenticated session.
 */
export function createSessionCookie(token: string, maxAge = DEFAULT_EXPIRY_SECONDS): string {
  const isProduction = process.env.NODE_ENV === 'production'
  const secureFlag = isProduction ? '; Secure' : ''
  return `${COOKIE_NAME}=${encodeURIComponent(
    token,
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`
}

/**
 * Generates the Set-Cookie header to clear the session cookie.
 */
export function clearSessionCookie(): string {
  const isProduction = process.env.NODE_ENV === 'production'
  const secureFlag = isProduction ? '; Secure' : ''
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`
}

