'use client'

import { useEffect, useState } from 'react'
import { Check, Coins, RotateCcw, Wallet, X } from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { buttonClass } from '@/components/ledger-ui'
import { TODAY } from '@/lib/data'
import { formatLongDate, formatMoney } from '@/lib/format'

export function DailyOpeningBalanceModal({
  open,
  onClose,
  date = TODAY,
}: {
  open: boolean
  onClose: () => void
  date?: string
}) {
  const {
    openingBalance,
    getOpeningBalanceForDate,
    setDailyOpeningBalance,
    isCustomDailyBalance,
    setOpeningBalance,
  } = useLedger()

  const currentForDate = getOpeningBalanceForDate(date)
  const isCustom = isCustomDailyBalance(date)
  const isToday = date === TODAY

  const [inputVal, setInputVal] = useState<string>(String(currentForDate))
  const [error, setError] = useState<string>('')
  const [savedNote, setSavedNote] = useState<string>('')

  // Sync state whenever modal opens or date changes
  useEffect(() => {
    if (open) {
      setInputVal(String(currentForDate))
      setError('')
      setSavedNote('')
    }
  }, [open, currentForDate, date])

  if (!open) return null

  const handleApplyDayOnly = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseFloat(inputVal.replace(/,/g, ''))
    if (isNaN(parsed) || parsed < 0) {
      setError('Please enter a valid starting balance (₹0 or greater).')
      return
    }
    if (parsed > 1_000_000_000) {
      setError('Opening balance cannot exceed ₹100,00,00,000 (100 Cr).')
      return
    }

    setDailyOpeningBalance(date, parsed)
    onClose()
  }

  const handleSetGlobalDefault = () => {
    const parsed = parseFloat(inputVal.replace(/,/g, ''))
    if (isNaN(parsed) || parsed < 0) {
      setError('Please enter a valid starting balance (₹0 or greater).')
      return
    }
    if (parsed > 1_000_000_000) {
      setError('Opening balance cannot exceed ₹100,00,00,000 (100 Cr).')
      return
    }

    setOpeningBalance(parsed)
    setDailyOpeningBalance(date, null)
    onClose()
  }

  const handleResetToDefault = () => {
    setDailyOpeningBalance(date, null)
    onClose()
  }

  const addQuickAmount = (delta: number) => {
    const curr = parseFloat(inputVal.replace(/,/g, '')) || 0
    setInputVal(String(Math.max(0, curr + delta)))
    setError('')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-opening-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-xs animate-in fade-in-0"
    >
      <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border bg-card p-4 sm:p-5 md:p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="Close dialog"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Coins className="size-5" />
          </div>
          <div>
            <h2 id="daily-opening-title" className="text-base font-bold text-foreground">
              {isToday ? 'Today’s Opening Balance' : 'Day Opening Balance'}
            </h2>
            <p className="text-xs text-muted-foreground">{formatLongDate(date)}</p>
          </div>
        </div>

        {/* Current default baseline status */}
        <div className="mt-4 rounded-xl border border-input/60 bg-surface/50 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Default Baseline:</span>
            <span className="font-bold text-foreground">{formatMoney(openingBalance)}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isCustom ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                This date has a custom override of {formatMoney(currentForDate)}.
              </span>
            ) : (
              'This day is currently using your standard default baseline.'
            )}
          </p>
        </div>

        <form onSubmit={handleApplyDayOnly} className="mt-4 flex flex-col gap-4">
          <div>
            <label htmlFor="daily-balance-input" className="block text-xs font-semibold text-foreground">
              Starting Balance for {isToday ? 'Today' : date} (₹)
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground">
                ₹
              </span>
              <input
                id="daily-balance-input"
                type="number"
                min="0"
                step="any"
                value={inputVal}
                autoFocus
                onChange={(e) => {
                  setInputVal(e.target.value)
                  setError('')
                }}
                className="h-11 w-full rounded-xl border border-input bg-card pl-8 pr-3 text-lg font-bold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                placeholder="0"
              />
            </div>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>

          {/* Quick Adjustment Chips */}
          <div>
            <span className="text-[11px] font-medium text-muted-foreground">Quick Adjustments:</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setInputVal(String(openingBalance))}
                className="rounded-lg border border-border bg-secondary/50 px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary active:scale-95"
              >
                Default ({formatMoney(openingBalance)})
              </button>
              <button
                type="button"
                onClick={() => addQuickAmount(5000)}
                className="rounded-lg border border-border bg-secondary/50 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground active:scale-95"
              >
                +₹5,000
              </button>
              <button
                type="button"
                onClick={() => addQuickAmount(10000)}
                className="rounded-lg border border-border bg-secondary/50 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground active:scale-95"
              >
                +₹10,000
              </button>
              <button
                type="button"
                onClick={() => addQuickAmount(25000)}
                className="rounded-lg border border-border bg-secondary/50 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground active:scale-95"
              >
                +₹25,000
              </button>
              <button
                type="button"
                onClick={() => setInputVal('0')}
                className="rounded-lg border border-border bg-secondary/50 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground active:scale-95"
              >
                ₹0
              </button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Setting for <strong>this day only</strong> leaves your standard {formatMoney(openingBalance)}{' '}
            baseline intact for tomorrow and all other days.
          </p>

          {/* Action Buttons */}
          <div className="mt-2 flex flex-col gap-2 border-t pt-4">
            <button
              type="submit"
              className={buttonClass('primary', 'md')}
            >
              <Check className="size-4" />
              <span>Apply for {isToday ? 'Today' : 'This Day'} Only</span>
            </button>

            <button
              type="button"
              onClick={handleSetGlobalDefault}
              className={buttonClass('outline', 'md')}
            >
              <Wallet className="size-4" />
              <span>Save as Default for Every Day</span>
            </button>

            {isCustom && (
              <button
                type="button"
                onClick={handleResetToDefault}
                className="mt-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors"
              >
                <RotateCcw className="size-3" />
                <span>Reset to Default ({formatMoney(openingBalance)})</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

