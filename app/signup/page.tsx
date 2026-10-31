'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { buttonClass } from '@/components/ledger-ui'
import { FlowMintLogo } from '@/components/logo'
import { OfficialGoogleButton } from '@/components/auth/official-google-button'
import { cn } from '@/lib/utils'

export default function SignupPage() {
  const router = useRouter()
  const { signup, signupWithGoogle } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await signup(name, email, password)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create account. Please try again.'
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Create your account</h1>
          <p className="mt-1 text-pretty text-xs text-muted-foreground sm:text-sm">
            Start managing your building contracts with FlowMint
          </p>
        </div>

        {error ? (
          <div className="mt-5 rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
            <span>{error}</span>
            {error.includes('Please log in') && (
              <span className="ml-1 font-semibold underline">
                <Link href="/login">Log in here</Link>
              </span>
            )}
          </div>
        ) : null}

        {/* Google sign-up */}
        <div className="mt-6 flex w-full justify-center">
          <OfficialGoogleButton
            mode="signup"
            onSuccess={async (profile) => {
              setError('')
              setLoading(true)
              try {
                await signupWithGoogle(profile)
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Google sign-up failed. Please try again.'
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
            or sign up with email
          </span>
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailSignup} className="flex flex-col gap-4">
          <div>
            <label htmlFor="signup-name" className="text-xs font-medium text-foreground">
              Full Name
            </label>
            <input
              id="signup-name"
              type="text"
              required
              placeholder="e.g. Arun Prakash"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="text-xs font-medium text-foreground">
              Email address
            </label>
            <input
              id="signup-email"
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
            <label htmlFor="signup-password" className="text-xs font-medium text-foreground">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="At least 6 characters"
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
            {loading ? 'Creating account…' : 'Continue to Business Setup'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
