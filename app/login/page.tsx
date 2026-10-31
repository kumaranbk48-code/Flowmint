'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth-provider'
import { buttonClass } from '@/components/ledger-ui'
import { FlowMintLogo } from '@/components/logo'
import { OfficialGoogleButton } from '@/components/auth/official-google-button'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Invalid email or password')
      return
    }

    setLoading(true)
    setError('')
    try {
      await login(email, password)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid email or password'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        {/* Brand */}
        <div className="flex flex-col items-center text-center">
          <FlowMintLogo size={56} className="mb-2" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to FlowMint</h1>
          <p className="mt-1 text-pretty text-xs text-muted-foreground sm:text-sm">
            Focused financial assistant for building contractors
          </p>
        </div>

        {error ? (
          <div className="mt-5 rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
            <span>{error}</span>
            {error.includes('Please sign up') && (
              <span className="ml-1 font-semibold underline">
                <Link href="/signup">Sign up now</Link>
              </span>
            )}
          </div>
        ) : null}

        {/* Google sign-in */}
        <div className="mt-6 flex w-full justify-center">
          <OfficialGoogleButton
            mode="login"
            onSuccess={async (profile) => {
              setError('')
              setLoading(true)
              try {
                await loginWithGoogle(profile)
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Google sign-in failed. Please try again.'
                setError(msg)
              } finally {
                setLoading(false)
              }
            }}
            onError={(err) => setError(err)}
          />
        </div>

        {/* Divider */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <span className="relative bg-card px-3 text-xs uppercase tracking-wider text-muted-foreground">
            or sign in with email
          </span>
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
          <div>
            <label htmlFor="login-email" className="text-xs font-medium text-foreground">
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              placeholder="contractor@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-xs font-medium text-foreground">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(buttonClass('primary', 'lg'), 'w-full')}
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Don’t have an account?{' '}
          <Link href="/signup" className="font-semibold text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
