// Must be imported BEFORE any module that creates the Supabase clients.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.SESSION_SECRET = 'test-session-secret-test-session-secret-0123456789'
Object.assign(process.env, { NODE_ENV: 'test' })
