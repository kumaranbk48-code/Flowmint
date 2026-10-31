'use client'

import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingSyncCount } = useLedger()

  if (isOnline && pendingSyncCount === 0 && !isSyncing) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 flex items-center justify-between border-b px-4 py-2 text-xs font-semibold backdrop-blur transition-all duration-200 bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200"
    >
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <>
            <WifiOff className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>
              Offline Mode · Changes saved to this device
              {pendingSyncCount > 0 ? ` (${pendingSyncCount} pending sync)` : ''}
            </span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="size-3.5 animate-spin text-primary" aria-hidden="true" />
            <span>Syncing offline entries to cloud…</span>
          </>
        ) : pendingSyncCount > 0 ? (
          <>
            <CheckCircle2 className="size-3.5 text-income" aria-hidden="true" />
            <span>Reconnected! Syncing {pendingSyncCount} saved entries…</span>
          </>
        ) : null}
      </div>

      <span className="text-[11px] font-normal text-muted-foreground hidden sm:inline">
        {!isOnline ? 'Manual entry & reports work 100% offline' : 'Cloud sync active'}
      </span>
    </div>
  )
}

