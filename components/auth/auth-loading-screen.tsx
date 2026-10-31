'use client'

import { FlowMintLogo } from '@/components/logo'

export function AuthLoadingScreen({
  title = 'Opening FlowMint…',
  subtitle = 'Loading your cashbook and projects…',
}: {
  title?: string
  subtitle?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Animated Brand Logo with Ambient Glow */}
        <div className="relative mb-6 flex items-center justify-center">
          <div className="absolute size-20 rounded-2xl bg-primary/20 blur-xl animate-pulse" />
          <div className="relative flex size-18 items-center justify-center rounded-2xl border border-primary/20 bg-card p-2.5 shadow-xl">
            <FlowMintLogo size={48} />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
          {title}
        </h2>

        {/* Subtitle */}
        <p className="mt-2 text-xs font-medium text-muted-foreground sm:text-sm">
          {subtitle}
        </p>

        {/* Elegant Animated Progress Bar */}
        <div className="mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-24 rounded-full bg-primary animate-indeterminate" />
        </div>

        {/* Reassuring Microcopy */}
        <div className="mt-6 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="size-2 rounded-full bg-primary animate-ping" />
          <span>Securing your session & cashbook…</span>
        </div>
      </div>
    </div>
  )
}

