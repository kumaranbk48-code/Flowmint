'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, Home, RefreshCw } from 'lucide-react'
import { buttonClass } from '@/components/ledger-ui'
import { FlowMintLogo } from '@/components/logo'
import { cn } from '@/lib/utils'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log sanitized error summary without exposing secrets or stack traces to client DOM
    console.error('[FlowMint Error Boundary]', error.message || 'Unhandled error')
  }, [error])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4 text-center sm:p-6 lg:p-8">
      <div className="flex w-full max-w-md flex-col items-center rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        <FlowMintLogo size={56} className="mb-4" />

        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-7" aria-hidden="true" />
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Something went wrong
        </h1>
        <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
          An unexpected error occurred while loading this view. Your ledger data remains safe in your database.
        </p>

        <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className={cn(buttonClass('primary'), 'inline-flex items-center justify-center gap-2')}
          >
            <RefreshCw className="size-4" />
            <span>Try Again</span>
          </button>
          <Link
            href="/"
            className={cn(buttonClass('outline'), 'inline-flex items-center justify-center gap-2')}
          >
            <Home className="size-4" />
            <span>Go to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

