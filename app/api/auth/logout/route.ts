import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/security/session'

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' })
  response.headers.set('Set-Cookie', clearSessionCookie())
  return response
}

