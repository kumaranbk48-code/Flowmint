'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  Mic,
  Plus,
  RotateCcw,
  Wallet,
} from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { useAuth } from '@/components/auth-provider'
import { ButtonLink, PageHeader, Panel, buttonClass } from '@/components/ledger-ui'
import { type Project } from '@/lib/data'
import { useToday } from '@/hooks/use-today'
import { formatDay, formatLongDate, formatMoney, methodLabel } from '@/lib/format'
import { computeRunningBalances, getFinancialSummary, type TransactionWithBalance } from '@/lib/ledger'
import { cn } from '@/lib/utils'
import { ManualEntryModal } from './manual-entry-modal'

export function DashboardView() {
  const {
    transactions,
    projects,
    getOpeningBalanceForDate,
    getOpeningCashForDate,
    isLoading,
  } = useLedger()
  const { business, user } = useAuth()
  const [isManualOpen, setIsManualOpen] = useState(false)

  const today = useToday()
  // Opening balance is set once; today's opening = yesterday's closing (opening balance + everything dated before today).
  const todayOpeningBalance = getOpeningBalanceForDate(today)
  const todayOpeningCash = getOpeningCashForDate(today)
  const hasEarlierActivity = transactions.some((t) => t.date < today)

  const firstName = (business.ownerName || user?.name || '').trim().split(' ')[0]
  const greeting = firstName ? `Good morning, ${firstName}` : 'Good morning'

  // Filter today's transactions
  const todayRawTxs = useMemo(() => {
    return transactions.filter((t) => t.date === today)
  }, [transactions, today])

  // Compute running balance starting from today's opening balance
  const todayTxsWithBalance = useMemo(() => {
    // computeRunningBalances sorts chronologically to compute balanceAfter accurately
    const computed = computeRunningBalances(todayRawTxs, todayOpeningBalance)
    // Display in reverse chronological order (newest transaction at top)
    return [...computed].reverse()
  }, [todayRawTxs, todayOpeningBalance])

  // Financial summary for today
  const summary = useMemo(() => {
    return getFinancialSummary(todayRawTxs, todayOpeningBalance, todayOpeningCash)
  }, [todayRawTxs, todayOpeningBalance, todayOpeningCash])

  const projectMap = useMemo(() => {
    return new Map<string, Project>(projects.map((p) => [p.id, p]))
  }, [projects])

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(today)}
        title={greeting}
        description="FlowMint Financial Ledger · Live cashbook and transaction tracking"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsManualOpen(true)}
              className={buttonClass('outline')}
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>Add manually</span>
            </button>
            <ButtonLink href="/voice" variant="primary">
              <Mic className="size-4" aria-hidden="true" />
              <span>Record by voice</span>
            </ButtonLink>
          </div>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 md:gap-6 md:px-8 md:py-7">
        {/* Prominent Voice Entry Banner */}
        <VoiceEntryBanner todayCount={todayRawTxs.length} />

        {/* Top Financial Summary */}
        <section aria-labelledby="financial-summary-heading">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 id="financial-summary-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Financial Summary · Today
            </h2>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <span>View full report</span>
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Opening Balance: carried forward from the previous day's closing balance */}
            <div className="relative flex flex-col justify-between rounded-xl border bg-card p-4 shadow-xs transition-all hover:border-primary/40">
              <span className="text-xs font-semibold text-muted-foreground">Opening Balance</span>
              <div>
                <p className="num mt-2 text-xl font-bold tracking-tight text-foreground md:text-2xl">
                  {formatMoney(summary.openingBalance)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {hasEarlierActivity ? "Yesterday's closing balance" : 'Starting balance (set once in Settings)'}
                </p>
              </div>
            </div>

            {/* Total Credit / Received */}
            <div className="rounded-xl border border-income/30 bg-income-soft/30 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-income">Credit / Received</span>
                <span className="flex size-5 items-center justify-center rounded-full bg-income/10 text-income">
                  <ArrowDownLeft className="size-3" />
                </span>
              </div>
              <p className="num mt-2 text-xl font-bold tracking-tight text-income md:text-2xl">
                +{formatMoney(summary.creditReceived)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {todayRawTxs.filter((t) => t.type === 'income').length} credit payments
              </p>
            </div>

            {/* Total Debit / Spent */}
            <div className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Debit / Spent</span>
                <span className="flex size-5 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <ArrowUpRight className="size-3" />
                </span>
              </div>
              <p className="num mt-2 text-xl font-bold tracking-tight text-foreground md:text-2xl">
                −{formatMoney(summary.debitSpent)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {todayRawTxs.filter((t) => t.type !== 'income').length} debit expenses
              </p>
            </div>

            {/* Net Balance (Visually Important) */}
            <div className="rounded-xl border-2 border-foreground/20 bg-card p-4 shadow-md sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Net Balance
                </span>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  Live
                </span>
              </div>
              <p className="num mt-2 text-2xl font-black tracking-tight text-foreground md:text-3xl">
                {formatMoney(summary.netBalance)}
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">Available balance</p>
            </div>

            {/* Current Cash (Visually Important) */}
            <div className="rounded-xl border-2 border-primary/40 bg-primary-soft/40 p-4 shadow-md sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                  <Wallet className="size-3.5 text-primary" />
                  Current Cash
                </span>
                <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                  In Hand
                </span>
              </div>
              <p className="num mt-2 text-2xl font-black tracking-tight text-foreground md:text-3xl">
                {formatMoney(summary.currentCash)}
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">Physical cash on site</p>
            </div>
          </div>
        </section>

        {/* Today's Transactions Section */}
        <section aria-labelledby="today-transactions-heading">
          <Panel
            title="Today's Transactions"
            action={
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {todayTxsWithBalance.length} {todayTxsWithBalance.length === 1 ? 'entry' : 'entries'}
                </span>
                <ButtonLink href="/reports" className="h-7.5 px-2.5 text-xs font-medium">
                  <FileSpreadsheet className="size-3.5" />
                  View full report
                </ButtonLink>
              </div>
            }
          >
            {isLoading ? (
              <div className="divide-y divide-border/40 p-4 animate-pulse">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-secondary" />
                      <div className="space-y-1.5">
                        <div className="h-4 w-32 rounded bg-secondary" />
                        <div className="h-3 w-24 rounded bg-secondary" />
                      </div>
                    </div>
                    <div className="h-5 w-20 rounded bg-secondary" />
                  </div>
                ))}
              </div>
            ) : todayTxsWithBalance.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No transactions recorded today yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tap “Record by voice” or “Add manually” to log your first payment or expense.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <ButtonLink href="/voice" variant="primary">
                    <Mic className="size-4" />
                    Record by voice
                  </ButtonLink>
                  <button
                    type="button"
                    onClick={() => setIsManualOpen(true)}
                    className={buttonClass('outline')}
                  >
                    + Add manually
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y">
                {todayTxsWithBalance.map((tx: TransactionWithBalance) => {
                  const proj = tx.projectId ? projectMap.get(tx.projectId) : undefined
                  const isCredit = tx.type === 'income'

                  return (
                    <div
                      key={tx.id}
                      className="flex flex-col gap-2 p-3.5 transition-colors hover:bg-surface/50 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:px-5 md:py-4"
                    >
                      {/* Left side: Time, Description, Project, Category */}
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Time pill */}
                        <span className="shrink-0 mt-0.5 rounded-md border bg-secondary/80 px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
                          {tx.time || 'Today'}
                        </span>

                        <div className="min-w-0">
                          {/* Description */}
                          <p className="font-semibold text-sm text-foreground truncate">
                            {tx.description || tx.party || tx.category}
                          </p>

                          {/* Secondary detail line */}
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {tx.party && tx.description && tx.party !== tx.description ? (
                              <>
                                <span>{tx.party}</span>
                                <span aria-hidden="true">·</span>
                              </>
                            ) : null}

                            {proj ? (
                              <>
                                <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.2 text-[11px] font-medium text-foreground">
                                  {proj.name}
                                </span>
                                <span aria-hidden="true">·</span>
                              </>
                            ) : null}

                            <span className="text-[11px]">{tx.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[11px]">{methodLabel[tx.method] || tx.method}</span>

                            {tx.source === 'voice' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-0.5 text-[11px] text-primary" title="Recorded by voice">
                                  <Mic className="size-2.5" />
                                  <span>Voice</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Amount & Running Balance */}
                      <div className="flex items-center justify-between sm:flex-col sm:items-end sm:text-right shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-dashed sm:border-none">
                        {/* Amount with subtle credit/debit distinction */}
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'num text-base font-bold tracking-tight',
                              isCredit ? 'text-income' : 'text-foreground',
                            )}
                          >
                            {isCredit ? '+' : '−'}
                            {formatMoney(tx.amount)}
                          </span>
                        </div>

                        {/* Running balance value */}
                        <p className="num text-xs font-semibold text-muted-foreground sm:mt-0.5">
                          <span className="text-muted-foreground/70 font-normal">Balance </span>
                          <span className="text-foreground font-bold">{formatMoney(tx.balanceAfter)}</span>
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Bottom action bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-surface/30 px-4 py-3 md:px-5">
              <p className="text-xs text-muted-foreground">
                Showing all {todayTxsWithBalance.length} entries recorded today · Running balance calculated from opening {formatMoney(todayOpeningBalance)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualOpen(true)}
                  className={cn(buttonClass('outline', 'md'), 'h-8 px-3 text-xs')}
                >
                  <Plus className="size-3.5" />
                  Add manually
                </button>
                <ButtonLink href="/reports" className="h-8 px-3 text-xs font-semibold">
                  <span>View full report</span>
                  <ArrowRight className="size-3.5" />
                </ButtonLink>
              </div>
            </div>
          </Panel>
        </section>
      </div>

      <ManualEntryModal open={isManualOpen} onClose={() => setIsManualOpen(false)} />
    </>
  )
}

function VoiceEntryBanner({ todayCount }: { todayCount: number }) {
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-r from-primary-soft/60 via-card to-card p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/voice"
            className="group relative flex size-13 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
            aria-label="Tap to record by voice"
          >
            <Mic className="size-6 transition-transform group-hover:scale-110" />
            <span className="absolute -right-1 -top-1 flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-primary" />
            </span>
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Record by Voice</h3>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                Instant Entry
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Speak your payments received, material purchases, worker wages, or site expenses.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-0">
          <ButtonLink href="/voice" variant="primary" className="h-10 px-4 font-semibold shadow-sm">
            <Mic className="size-4" />
            <span>Tap to speak</span>
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}
