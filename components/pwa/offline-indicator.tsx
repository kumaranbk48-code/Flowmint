'use client'

import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { formatMoney } from '@/lib/format'
import type { SyncItem } from '@/lib/sync-queue'

function describe(item: SyncItem): string {
  switch (item.type) {
    case 'add_tx':
      return `${item.tx.type === 'income' ? 'Received' : 'Paid'} ${formatMoney(item.tx.amount)} (${item.tx.category})`
    case 'update_tx':
      return 'Edit of a transaction'
    case 'delete_tx':
      return 'Deletion of a transaction'
    case 'add_project':
      return `New project "${item.project.name}"`
    case 'delete_project':
      return 'Deletion of a project'
    case 'settings':
      return 'Opening balance change'
  }
}

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingSyncCount, failedSyncItems, retryFailedItem, discardFailedItem, loadError, refresh } =
    useLedger()

  const nothingToShow =
    isOnline && pendingSyncCount === 0 && !isSyncing && failedSyncItems.length === 0 && !loadError
  if (nothingToShow) return null

  return (
    <div className="sticky top-0 z-40 flex flex-col text-xs font-semibold backdrop-blur">
      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {loadError} The numbers shown are the last saved copy and may be out of date.
          </span>
          <button type="button" onClick={() => void refresh()} className="underline">
            Retry
          </button>
        </div>
      )}

      {failedSyncItems.length > 0 && (
        <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive">
          <p className="flex items-center gap-2">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {failedSyncItems.length} saved {failedSyncItems.length === 1 ? 'entry was' : 'entries were'} rejected by the server and{' '}
            {failedSyncItems.length === 1 ? 'is' : 'are'} NOT counted in your balances:
          </p>
          <ul className="mt-1 flex flex-col gap-1 font-normal">
            {failedSyncItems.map((item) => (
              <li key={item.qid} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {describe(item)}: {item.error || 'rejected'}
                </span>
                <span className="flex gap-3 font-semibold">
                  <button type="button" onClick={() => void retryFailedItem(item.qid)} className="underline">
                    Retry
                  </button>
                  <button type="button" onClick={() => void discardFailedItem(item.qid)} className="underline">
                    Discard
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(!isOnline || isSyncing || pendingSyncCount > 0) && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-amber-900 transition-all duration-200 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            {!isOnline ? (
              <>
                <WifiOff className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>
                  Offline mode · Saved on this device, not yet in the cloud
                  {pendingSyncCount > 0 ? ` (${pendingSyncCount} waiting to sync)` : ''}
                </span>
              </>
            ) : isSyncing ? (
              <>
                <RefreshCw className="size-3.5 animate-spin text-primary" aria-hidden="true" />
                <span>Syncing saved entries to the cloud…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5 text-income" aria-hidden="true" />
                <span>{pendingSyncCount} saved {pendingSyncCount === 1 ? 'entry is' : 'entries are'} waiting to sync</span>
              </>
            )}
          </div>
          <span className="hidden text-[11px] font-normal text-muted-foreground sm:inline">
            {!isOnline ? 'Manual entry works offline. Voice needs an internet connection.' : 'Will retry automatically'}
          </span>
        </div>
      )}
    </div>
  )
}
