'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileQuestion, Home } from 'lucide-react'
import { buttonClass } from '@/components/ledger-ui'
import { FlowMintLogo } from '@/components/logo'
import { cn } from '@/lib/utils'

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4 text-center sm:p-6 lg:p-8">
      <div className="flex w-full max-w-md flex-col items-center rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        <FlowMintLogo size={56} className="mb-4" />

        <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <FileQuestion className="size-7" aria-hidden="true" />
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Page Not Found
        </h1>
        <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
          The page or contract record you are looking for does not exist or may have been moved.
        </p>

        <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => router.back()}
            className={cn(buttonClass('outline'), 'inline-flex items-center justify-center gap-2')}
          >
            <ArrowLeft className="size-4" />
            <span>Go Back</span>
          </button>
          <Link
            href="/"
            className={cn(buttonClass('primary'), 'inline-flex items-center justify-center gap-2')}
          >
            <Home className="size-4" />
            <span>Go to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

