'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[FlowMint Global Error]', error.message || 'Fatal error')
  }, [error])

  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-[#f8f6f3] p-4 font-sans text-center text-[#1c1917]">
        <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-[#e7e5e4] bg-white p-6 shadow-xl sm:p-8">
          <div className="flex size-14 items-center justify-center rounded-full bg-[#fee2e2] text-[#dc2626]">
            ⚠️
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">System Error</h1>
          <p className="mt-2 text-xs text-[#78716c] sm:text-sm">
            A critical error interrupted the application. Please try reloading.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 rounded-lg bg-[#b45309] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#92400e]"
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  )
}

