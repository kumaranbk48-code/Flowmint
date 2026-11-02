import './helpers/env'
import test, { before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let admin: any
let authClient: any
let reset: typeof import('../app/api/auth/reset-password/route')
let forgot: typeof import('../app/api/auth/forgot-password/route')
let session: typeof import('../lib/security/session')
let limiter: typeof import('../lib/security/rate-limit')

let updated: { id: string; attrs: any }[]
let ipCounter = 0

before(async () => {
  const server = await import('../lib/supabase/server')
  admin = server.supabaseAdmin
  authClient = server.supabaseAuthClient
  reset = await import('../app/api/auth/reset-password/route')
  forgot = await import('../app/api/auth/forgot-password/route')
  session = await import('../lib/security/session')
  limiter = await import('../lib/security/rate-limit')
})

beforeEach(() => {
  updated = []
  admin.auth.admin.updateUserById = async (id: string, attrs: any) => {
    updated.push({ id, attrs })
    return { data: {}, error: null }
  }
  admin.auth.admin.generateLink = async () => {
    throw new Error('generateLink must never be called')
  }
  admin.auth.admin.listUsers = async () => ({ data: { users: [{ id: 'victim-id', email: 'victim@example.com' }] }, error: null })
})

const req = (body: unknown, ip = `10.0.0.${++ipCounter}`) =>
  new Request('http://localhost/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(body) })

const fakeJwt = (iat: number) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iat })).toString('base64url')}.sig`

test('C1: an email address alone can NOT reset a password', async () => {
  const res = await reset.POST(req({ email: 'victim@example.com', password: 'AttackerPass123' }))
  assert.equal(res.status, 401)
  assert.equal(updated.length, 0, 'no password may be changed')
})

test('C1: garbage, stale and unverifiable tokens are rejected without touching the password', async () => {
  admin.auth.getUser = async () => ({ data: { user: null }, error: { message: 'invalid' } })
  assert.equal((await reset.POST(req({ accessToken: 'not-a-jwt', password: 'NewPassword123' }))).status, 401)
  assert.equal((await reset.POST(req({ accessToken: fakeJwt(Math.floor(Date.now() / 1000)), password: 'NewPassword123' }))).status, 401)
  let asked = false
  admin.auth.getUser = async () => {
    asked = true
    return { data: { user: { id: 'victim-id' } }, error: null }
  }
  const twoHoursAgo = Math.floor(Date.now() / 1000) - 7200
  assert.equal((await reset.POST(req({ accessToken: fakeJwt(twoHoursAgo), password: 'NewPassword123' }))).status, 401)
  assert.equal(asked, false, 'a stale token is refused before Supabase is even asked')
  authClient.auth.verifyOtp = async () => ({ data: { user: null }, error: { message: 'expired' } })
  assert.equal((await reset.POST(req({ tokenHash: 'bad', password: 'NewPassword123' }))).status, 401)
  assert.equal(updated.length, 0)
})

test('C1: a valid emailed recovery token sets the password for the token owner only', async () => {
  admin.auth.getUser = async (jwt: string) => ({ data: { user: jwt.length > 10 ? { id: 'owner-id' } : null }, error: null })
  const ok = await reset.POST(req({ accessToken: fakeJwt(Math.floor(Date.now() / 1000)), password: 'NewPassword123', email: 'victim@example.com' }))
  assert.equal(ok.status, 200)
  assert.deepEqual(updated, [{ id: 'owner-id', attrs: { password: 'NewPassword123' } }]) // the email field is ignored

  updated = []
  authClient.auth.verifyOtp = async (args: any) => ({ data: { user: { id: 'hash-owner' } }, error: args.token_hash === 'good' ? null : { message: 'no' } })
  assert.equal((await reset.POST(req({ tokenHash: 'good', password: 'AnotherPass123' }))).status, 200)
  assert.equal(updated[0].id, 'hash-owner')
})

test('C1: weak or oversized passwords are rejected', async () => {
  admin.auth.getUser = async () => ({ data: { user: { id: 'u' } }, error: null })
  const token = fakeJwt(Math.floor(Date.now() / 1000))
  assert.equal((await reset.POST(req({ accessToken: token, password: 'short' }))).status, 400)
  assert.equal((await reset.POST(req({ accessToken: token, password: 'x'.repeat(200) }))).status, 400)
  assert.equal((await reset.POST(req({ accessToken: token }))).status, 400)
  assert.equal(updated.length, 0)
})

test('C2: forgot-password answers identically for known and unknown emails and leaks no token or link', async () => {
  const sent: string[] = []
  authClient.auth.resetPasswordForEmail = async (email: string) => {
    sent.push(email)
    return { data: {}, error: null }
  }
  const known = await forgot.POST(req({ email: 'victim@example.com' }))
  const unknown = await forgot.POST(req({ email: 'nobody@example.com' }))
  assert.equal(known.status, 200)
  assert.equal(unknown.status, 200)
  const [a, b] = [await known.json(), await unknown.json()] as any[]
  assert.deepEqual(a, b, 'no user enumeration')
  const text = JSON.stringify(a)
  for (const leak of ['token', 'resetUrl', 'actionLink', 'hashed', 'http']) assert.ok(!text.toLowerCase().includes(leak.toLowerCase()), `response must not contain "${leak}"`)
  assert.deepEqual(sent, ['victim@example.com', 'nobody@example.com'])
  assert.equal((await forgot.POST(req({ email: 'not-an-email' }))).status, 400)
})

test('C2: a failing mail provider still gives the same generic answer', async () => {
  authClient.auth.resetPasswordForEmail = async () => ({ data: null, error: { message: 'smtp down' } })
  const res = await forgot.POST(req({ email: 'victim@example.com' }))
  assert.equal(res.status, 200)
})

test('auth endpoints are rate limited per client', async () => {
  authClient.auth.resetPasswordForEmail = async () => ({ data: {}, error: null })
  const ip = '203.0.113.99'
  let last = 200
  for (let i = 0; i < 12; i++) last = (await forgot.POST(req({ email: 'a@b.co' }, ip))).status
  assert.equal(last, 429)
})

test('rate limiting cannot be bypassed by spoofing X-Forwarded-For', () => {
  const spoofed = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.7' } })
  assert.equal(limiter.getClientIp(spoofed), '198.51.100.7', 'the proxy-appended last hop is used, not the client-supplied first one')
  const edge = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '198.51.100.9' } })
  assert.equal(limiter.getClientIp(edge), '198.51.100.9')
})

test('sessions: tampering, expiry and a missing production secret never yield a valid session', () => {
  const token = session.signSession({ userId: 'u1', email: 'u@x.test', name: 'U' })
  assert.equal(session.verifySession(token)?.userId, 'u1')
  const [payload, sig] = token.split('.')
  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), userId: 'admin' })).toString('base64url')
  assert.equal(session.verifySession(`${forgedPayload}.${sig}`), null)
  assert.equal(session.verifySession(session.signSession({ userId: 'u1', email: 'u@x.test' }, -10)), null)

  const saved = { secret: process.env.SESSION_SECRET, env: process.env.NODE_ENV }
  try {
    ;(process.env as any).NODE_ENV = 'production'
    delete process.env.SESSION_SECRET
    assert.throws(() => session.signSession({ userId: 'u1', email: 'u@x.test' }), /SESSION_SECRET/)
    assert.equal(session.verifySession(token), null, 'with no secret configured, nothing is accepted (no guessable fallback key)')
    process.env.SESSION_SECRET = 'short'
    assert.equal(session.verifySession(token), null)
  } finally {
    process.env.SESSION_SECRET = saved.secret
    ;(process.env as any).NODE_ENV = saved.env
  }
})

test('the session token is never returned in a JSON body (it lives only in the httpOnly cookie)', () => {
  for (const f of ['login', 'signup', 'google-login', 'google-signup']) {
    const src = fs.readFileSync(new URL(`../app/api/auth/${f}/route.ts`, import.meta.url), 'utf8')
    assert.ok(!/token:\s*sessionToken/.test(src), `${f} must not return the session token`)
  }
  const cookie = session.createSessionCookie('abc')
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
})

test('secrets are never shipped to the browser', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]))
  const root = fileURLToPath(new URL('..', import.meta.url))
  const clientFiles = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components')), ...walk(path.join(root, 'hooks'))]
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('api'))
    .filter((f) => /^['"]use client['"]/.test(fs.readFileSync(f, 'utf8')))
  assert.ok(clientFiles.length > 10)
  for (const f of clientFiles) {
    const src = fs.readFileSync(f, 'utf8')
    assert.ok(!/SERVICE_ROLE|GEMINI_API_KEY|SESSION_SECRET|lib\/supabase\/server|lib\/supabase\/ledger-db/.test(src), `${f} must not touch server secrets`)
  }
  const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8')
  assert.ok(!/SERVICE_ROLE|GEMINI/.test(sw))
})
