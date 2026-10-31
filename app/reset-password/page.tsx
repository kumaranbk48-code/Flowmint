'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { buttonClass } from '@/components/ledger-ui'
import { FlowMintLogo } from '@/components/logo'
import { cn } from '@/lib/utils'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const initialEmail = searchParams.get('email') || ''

  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail)
    }
  }, [initialEmail])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }

    if (!password) {
      setError('Please enter a new password.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password.')
      }

      setSubmitted(true)
      setMessage(data.message || 'Your password has been updated successfully!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <FlowMintLogo size={56} className="mb-2" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Set New Password</h1>
          <p className="mt-1 text-pretty text-xs text-muted-foreground sm:text-sm">
            Choose a secure new password for your FlowMint contractor account.
          </p>
        </div>

        {error ? (
          <div className="mt-5 rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
            {error}
          </div>
        ) : null}

        {submitted ? (
          <div className="mt-6 flex flex-col items-center rounded-xl bg-primary-soft/40 p-5 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="size-6" />
            </span>
            <h2 className="mt-3 text-base font-bold text-foreground">
              Password Reset Complete!
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {message}
            </p>
            <Link
              href="/login"
              className={cn(buttonClass('primary', 'lg'), 'mt-6 w-full inline-flex items-center justify-center gap-2')}
            >
              <ArrowLeft className="size-4" />
              <span>Log In with New Password</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="reset-email" className="text-xs font-medium text-foreground">
                Email address
              </label>
              <div className="relative mt-1">
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="contractor@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-card pl-3 pr-10 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Mail className="size-4" />
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="new-password" className="text-xs font-medium text-foreground">
                New password (min 6 characters)
              </label>
              <div className="relative mt-1">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-card pl-3 pr-10 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="text-xs font-medium text-foreground">
                Confirm new password
              </label>
              <div className="relative mt-1">
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-card pl-3 pr-10 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="size-4" />
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(buttonClass('primary', 'lg'), 'w-full')}
            >
              {loading ? 'Saving new password…' : 'Reset Password'}
            </button>

            <div className="mt-2 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                <span>Return to Log In</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <div className="animate-pulse">
            <FlowMintLogo size={56} />
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}

