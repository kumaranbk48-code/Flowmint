'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react'
import { buttonClass } from '@/components/ledger-ui'
import { FlowMintLogo } from '@/components/logo'
import { cn } from '@/lib/utils'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit reset request.')
      }

      setSubmitted(true)
      setMessage(data.message || 'If an account exists for this email, a reset link has been sent.')
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Reset Password</h1>
          <p className="mt-1 text-pretty text-xs text-muted-foreground sm:text-sm">
            Enter your email to receive password reset instructions.
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
            <p className="mt-3 text-sm font-semibold text-foreground">
              {message}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Open the link in the email to choose a new password. The link works once and expires soon.
            </p>

            <div className="mt-5 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className={cn(buttonClass('outline'), 'w-full sm:w-auto inline-flex items-center justify-center gap-2')}
              >
                <ArrowLeft className="size-4" />
                <span>Back to Login</span>
              </Link>
            </div>
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
                  autoFocus
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

            <button
              type="submit"
              disabled={loading}
              className={cn(buttonClass('primary', 'lg'), 'w-full')}
            >
              {loading ? 'Sending instructions…' : 'Send Reset Link'}
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

