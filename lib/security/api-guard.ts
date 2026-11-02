import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from './session'
import { apiRateLimiter } from './rate-limit'

/** Authenticates the request and applies the per-user rate limit. Returns the user id or a ready error response. */
export function guard(req: Request): { userId: string } | NextResponse {
  const auth = getAuthenticatedUser(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized: Session missing or expired.' }, { status: 401 })
  }
  const rate = apiRateLimiter.check(auth.userId)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }
  return { userId: auth.userId }
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse
}

/** Parses a JSON body; returns null for a missing/malformed body so the caller can answer 400 (not 500). */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
