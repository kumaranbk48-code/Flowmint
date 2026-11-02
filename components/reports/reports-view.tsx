'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  X,
} from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { useAuth } from '@/components/auth-provider'
import { useToday } from '@/hooks/use-today'
import { csvCell } from '@/lib/money'
import { buttonClass, PageHeader, Panel } from '@/components/ledger-ui'
import { type Project, type Transaction } from '@/lib/data'
import { addDays, formatDay, formatLongDate, formatMoney, methodLabel, parseDate, toISO } from '@/lib/format'
import { computeRunningBalances, getFinancialSummary, type TransactionWithBalance } from '@/lib/ledger'
import { cn } from '@/lib/utils'

type DateMode = 'day' | 'weekly' | 'monthly' | 'custom'

function getSunday(dateStr: string): string {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() - d.getDay())
  return toISO(d)
}

function getSaturday(dateStr: string): string {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() + (6 - d.getDay()))
  return toISO(d)
}

function getMonthStart(dateStr: string): string {
  const d = parseDate(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function getMonthEnd(dateStr: string): string {
  const d = parseDate(dateStr)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function formatDateRangeLabel(start: string, end: string, mode: DateMode, today: string): string {
  if (start === '2000-01-01' && end === '2099-12-31') {
    return 'All Recorded Transactions'
  }

  const d1 = parseDate(start)
  const d2 = parseDate(end)
  const year = d1.getFullYear()
  const sameYear = d1.getFullYear() === d2.getFullYear()

  const s1 = d1.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const s2 = d2.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  if (mode === 'day' || start === end) {
    const isToday = start === today
    const isYesterday = start === addDays(today, -1)
    const suffix = isToday ? ' (Today)' : isYesterday ? ' (Yesterday)' : ''
    return `${s1}, ${year}${suffix}`
  }

  if (mode === 'weekly') {
    const thisWeekStart = getSunday(today)
    const isThisWeek = start === thisWeekStart
    const isLastWeek = start === addDays(thisWeekStart, -7)
    const suffix = isThisWeek ? ' (This Week)' : isLastWeek ? ' (Last Week)' : ''
    return `${s1} – ${s2}, ${year}${suffix}`
  }

  if (mode === 'monthly') {
    const isThisMonth = start.slice(0, 7) === today.slice(0, 7)
    const suffix = isThisMonth ? ' (This Month)' : ''
    return `${s1} – ${s2}, ${year}${suffix}`
  }

  return `${s1} – ${s2}${sameYear ? `, ${year}` : ` – ${s2}, ${d2.getFullYear()}`}`
}

export function ReportsView() {
  const {
    transactions,
    projects,
    getOpeningBalanceForDate,
    getOpeningCashForDate,
  } = useLedger()
  const { business, user } = useAuth()
  const today = useToday()

  // Date mode & range state (defaults to Sunday-Saturday current week matching reference)
  const [dateMode, setDateMode] = useState<DateMode>('weekly')
  const [startDate, setStartDate] = useState<string>(() => getSunday(today))
  const [endDate, setEndDate] = useState<string>(() => getSaturday(today))
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [projectFilter, setProjectFilter] = useState<string>('all')

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  const contractorName = business.businessName || business.ownerName || user?.name || 'Contractor'
  const projectMap = useMemo(() => new Map<string, Project>(projects.map((p) => [p.id, p])), [projects])

  // Previous period navigation
  const handlePrev = () => {
    if (dateMode === 'day') {
      setStartDate((prev) => addDays(prev, -1))
      setEndDate((prev) => addDays(prev, -1))
    } else if (dateMode === 'weekly') {
      setStartDate((prev) => addDays(prev, -7))
      setEndDate((prev) => addDays(prev, -7))
    } else if (dateMode === 'monthly') {
      const d = parseDate(startDate)
      d.setMonth(d.getMonth() - 1)
      setStartDate(getMonthStart(toISO(d)))
      setEndDate(getMonthEnd(toISO(d)))
    } else {
      // Custom: shift back by range length
      const d1 = parseDate(startDate).getTime()
      const d2 = parseDate(endDate).getTime()
      const diffDays = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)))
      setStartDate((prev) => addDays(prev, -diffDays))
      setEndDate((prev) => addDays(prev, -diffDays))
    }
  }

  // Next period navigation
  const handleNext = () => {
    if (dateMode === 'day') {
      setStartDate((prev) => addDays(prev, 1))
      setEndDate((prev) => addDays(prev, 1))
    } else if (dateMode === 'weekly') {
      setStartDate((prev) => addDays(prev, 7))
      setEndDate((prev) => addDays(prev, 7))
    } else if (dateMode === 'monthly') {
      const d = parseDate(startDate)
      d.setMonth(d.getMonth() + 1)
      setStartDate(getMonthStart(toISO(d)))
      setEndDate(getMonthEnd(toISO(d)))
    } else {
      const d1 = parseDate(startDate).getTime()
      const d2 = parseDate(endDate).getTime()
      const diffDays = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)))
      setStartDate((prev) => addDays(prev, diffDays))
      setEndDate((prev) => addDays(prev, diffDays))
    }
  }

  // Switch mode
  const handleModeChange = (mode: DateMode) => {
    setDateMode(mode)
    setIsDropdownOpen(false)
    if (mode === 'day') {
      setStartDate(today)
      setEndDate(today)
    } else if (mode === 'weekly') {
      setStartDate(getSunday(today))
      setEndDate(getSaturday(today))
    } else if (mode === 'monthly') {
      setStartDate(getMonthStart(today))
      setEndDate(getMonthEnd(today))
    }
  }

  // Quick preset selection from dropdown
  const handleSelectPreset = (
    preset: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'all',
  ) => {
    if (preset === 'today') {
      setDateMode('day')
      setStartDate(today)
      setEndDate(today)
    } else if (preset === 'yesterday') {
      setDateMode('day')
      const yesterday = addDays(today, -1)
      setStartDate(yesterday)
      setEndDate(yesterday)
    } else if (preset === 'this_week') {
      setDateMode('weekly')
      setStartDate(getSunday(today))
      setEndDate(getSaturday(today))
    } else if (preset === 'last_week') {
      setDateMode('weekly')
      const thisSunday = getSunday(today)
      setStartDate(addDays(thisSunday, -7))
      setEndDate(addDays(thisSunday, -1))
    } else if (preset === 'this_month') {
      setDateMode('monthly')
      setStartDate(getMonthStart(today))
      setEndDate(getMonthEnd(today))
    } else if (preset === 'last_month') {
      setDateMode('monthly')
      const d = parseDate(today)
      d.setMonth(d.getMonth() - 1)
      setStartDate(getMonthStart(toISO(d)))
      setEndDate(getMonthEnd(toISO(d)))
    } else if (preset === 'all') {
      setDateMode('custom')
      setStartDate('2000-01-01')
      setEndDate('2099-12-31')
    }
    setIsDropdownOpen(false)
  }

  // Filter transactions by date range & project
  const filteredTxs = useMemo(() => {
    return transactions.filter((t) => {
      // Date range filter
      if (t.date < startDate || t.date > endDate) return false

      // Project filter
      if (projectFilter !== 'all') {
        if (projectFilter === 'none' && t.projectId) return false
        if (projectFilter !== 'none' && t.projectId !== projectFilter) return false
      }

      return true
    })
  }, [transactions, startDate, endDate, projectFilter])

  // Opening for the first day of the range = opening balance + every credit - debit dated BEFORE the range
  // (carry-forward). A single-project view starts from 0 and counts only that project's earlier entries.
  const effectiveOpeningBalance = useMemo(() => {
    return getOpeningBalanceForDate(startDate, projectFilter)
  }, [getOpeningBalanceForDate, startDate, projectFilter])

  const effectiveOpeningCash = useMemo(() => {
    return getOpeningCashForDate(startDate, projectFilter)
  }, [getOpeningCashForDate, startDate, projectFilter])

  // Compute running balance in chronological order
  const txsWithBalance = useMemo(() => {
    return computeRunningBalances(filteredTxs, effectiveOpeningBalance)
  }, [filteredTxs, effectiveOpeningBalance])

  // Financial summary
  const summary = useMemo(() => {
    return getFinancialSummary(filteredTxs, effectiveOpeningBalance, effectiveOpeningCash)
  }, [filteredTxs, effectiveOpeningBalance, effectiveOpeningCash])

  const dateRangeLabel = formatDateRangeLabel(startDate, endDate, dateMode, today)

  // Download CSV function
  const handleDownloadCsv = () => {
    const headers = [
      'Date',
      'Time',
      'Details / Description',
      'Project',
      'Category',
      'Payment Method',
      'Debit (INR)',
      'Credit (INR)',
      'Running Balance (INR)',
    ]

    // Every text cell goes through csvCell: quotes are escaped and cells starting with = + - @ are neutralised
    // so a description can never run as a spreadsheet formula.
    const rows = txsWithBalance.map((t) => [
      t.date,
      csvCell(t.time || ''),
      csvCell(t.description || t.party || t.category),
      csvCell(t.projectId ? projectMap.get(t.projectId)?.name || 'General' : 'General'),
      csvCell(t.category),
      csvCell(methodLabel[t.method] || t.method),
      t.type !== 'income' ? t.amount.toFixed(2) : '',
      t.type === 'income' ? t.amount.toFixed(2) : '',
      t.balanceAfter.toFixed(2),
    ])

    const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })
    const csvContent = [
      `FlowMint Financial Ledger Statement`,
      `Contractor,${csvCell(contractorName)}`,
      `Period,${csvCell(dateRangeLabel)}`,
      `Generated,${csvCell(`${generatedAt} IST`)}`,
      `Opening Balance,${summary.openingBalance.toFixed(2)}`,
      `Total Credit,${summary.creditReceived.toFixed(2)}`,
      `Total Debit,${summary.debitSpent.toFixed(2)}`,
      `Net Balance,${summary.netBalance.toFixed(2)}`,
      `Entries,${txsWithBalance.length}`,
      '',
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      '',
      // Same 9 columns as the table: label, then totals under Debit / Credit / Running Balance.
      `${csvCell('Totals')},,,,,,${summary.debitSpent.toFixed(2)},${summary.creditReceived.toFixed(2)},${summary.netBalance.toFixed(2)}`,
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download =
      startDate === endDate
        ? `FlowMint_Statement_${startDate}.csv`
        : `FlowMint_Statement_${startDate}_to_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow="Financial Statement & Cashbook"
          title="Ledger Statement"
          description="Complete date-wise cashbook statement with running balances and downloadable reports."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/" className={buttonClass('outline')}>
                <ArrowLeft className="size-4" />
                <span>Back to Dashboard</span>
              </Link>
              <button
                type="button"
                onClick={handleDownloadCsv}
                className={buttonClass('primary')}
              >
                <Download className="size-4" />
                <span>Download CSV</span>
              </button>
            </div>
          }
        />
      </div>

      <div className="flex flex-col gap-5 px-4 py-5 md:gap-6 md:px-8 md:py-7">
        {/* Date Filter & Project Controls Bar (Hidden on print) */}
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Left Pill: Previous < , Calendar Icon, Date Range Label, ChevronDown v , Next > */}
            <div
              ref={dropdownRef}
              className="relative inline-flex items-center rounded-full border bg-card px-1.5 py-1 shadow-xs transition-colors"
            >
              <button
                type="button"
                onClick={handlePrev}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Previous period"
                title="Previous period"
              >
                <ChevronLeft className="size-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsDropdownOpen((v) => !v)}
                className="flex items-center gap-2 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:text-primary md:text-sm"
              >
                <Calendar className="size-4 text-primary shrink-0" />
                <span className="tracking-tight">{dateRangeLabel}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Next period"
                title="Next period"
              >
                <ChevronRight className="size-4" />
              </button>

              {/* Popover / Quick preset dropdown */}
              {isDropdownOpen && (
                <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-2xl border bg-card p-3 shadow-2xl animate-in fade-in-0 zoom-in-95">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Select Period
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(false)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('today')}
                      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left font-medium hover:bg-secondary transition-colors"
                    >
                      <span>Today</span>
                      <span className="text-[11px] text-muted-foreground">{formatDay(today)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('yesterday')}
                      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left font-medium hover:bg-secondary transition-colors"
                    >
                      <span>Yesterday</span>
                      <span className="text-[11px] text-muted-foreground">{formatDay(addDays(today, -1))}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('this_week')}
                      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left font-medium hover:bg-secondary transition-colors"
                    >
                      <span>This Week</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDay(getSunday(today))} – {formatDay(getSaturday(today))}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('last_week')}
                      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left font-medium hover:bg-secondary transition-colors"
                    >
                      <span>Last Week</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDay(addDays(getSunday(today), -7))} – {formatDay(addDays(getSunday(today), -1))}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('this_month')}
                      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left font-medium hover:bg-secondary transition-colors"
                    >
                      <span>This Month</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDay(getMonthStart(today))} – {formatDay(getMonthEnd(today))}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('last_month')}
                      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left font-medium hover:bg-secondary transition-colors"
                    >
                      <span>Last Month</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('all')}
                      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left font-medium hover:bg-secondary transition-colors"
                    >
                      <span>All Recorded Entries</span>
                    </button>
                  </div>

                  {/* Date Pickers */}
                  <div className="mt-2.5 border-t pt-2.5">
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                      {dateMode === 'day' ? 'Select Particular Day' : 'Custom Date Range'}
                    </p>
                    {dateMode === 'day' ? (
                      <div>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => {
                            setDateMode('day')
                            setStartDate(e.target.value)
                            setEndDate(e.target.value)
                          }}
                          className="h-8 w-full rounded-md border border-input bg-card px-2 text-[11px] font-medium outline-none"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">From</label>
                          <input
                            type="date"
                            value={startDate === '2000-01-01' ? today : startDate}
                            onChange={(e) => {
                              setDateMode('custom')
                              setStartDate(e.target.value)
                            }}
                            className="h-8 w-full rounded-md border border-input bg-card px-2 text-[11px] font-medium outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">To</label>
                          <input
                            type="date"
                            value={endDate === '2099-12-31' ? today : endDate}
                            onChange={(e) => {
                              setDateMode('custom')
                              setEndDate(e.target.value)
                            }}
                            className="h-8 w-full rounded-md border border-input bg-card px-2 text-[11px] font-medium outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Segmented Control Pill: Day, Weekly, Monthly, Custom */}
            <div className="inline-flex items-center rounded-full border bg-card p-1 shadow-xs">
              <button
                type="button"
                onClick={() => handleModeChange('day')}
                className={cn(
                  'rounded-full px-3.5 py-1 text-xs transition-all',
                  dateMode === 'day'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground font-medium',
                )}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('weekly')}
                className={cn(
                  'rounded-full px-3.5 py-1 text-xs transition-all',
                  dateMode === 'weekly'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground font-medium',
                )}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('monthly')}
                className={cn(
                  'rounded-full px-3.5 py-1 text-xs transition-all',
                  dateMode === 'monthly'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground font-medium',
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('custom')}
                className={cn(
                  'rounded-full px-3.5 py-1 text-xs transition-all',
                  dateMode === 'custom'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground font-medium',
                )}
              >
                Custom
              </button>
            </div>
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Filter className="size-3.5" />
              Project:
            </span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-8.5 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground outline-none shadow-2xs"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="none">General / No Project</option>
            </select>
          </div>
        </div>

        {/* Custom date range inline inputs when Custom mode is active */}
        {dateMode === 'custom' && (
          <div className="print:hidden -mt-2 flex flex-wrap items-center gap-3 rounded-xl border bg-card/80 p-3 text-xs shadow-2xs">
            <span className="font-semibold text-muted-foreground">Select Custom Date Range:</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">From:</span>
              <input
                type="date"
                value={startDate === '2000-01-01' ? today : startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 rounded-lg border border-input bg-card px-2 text-xs font-medium outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">To:</span>
              <input
                type="date"
                value={endDate === '2099-12-31' ? today : endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 rounded-lg border border-input bg-card px-2 text-xs font-medium outline-none"
              />
            </div>
          </div>
        )}

        {/* Official Statement Document Container */}
        <div className="rounded-2xl border bg-card p-5 shadow-xs md:p-8 print:border-none print:p-0 print:shadow-none">
          {/* Statement Header */}
          <div className="border-b pb-5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  FlowMint Contractor Cashbook
                </p>
                <h2 className="mt-1 text-2xl font-black text-foreground">
                  {contractorName}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {business.businessType || 'Building Contractor'}
                  {business.location ? ` · ${business.location}` : ''}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-xs font-semibold text-muted-foreground">Statement Period</p>
                <p className="text-sm font-bold text-foreground">
                  {dateRangeLabel}
                </p>
                <p className="text-[11px] text-muted-foreground">Generated on {formatLongDate(today)}</p>
              </div>
            </div>

            {/* Financial Summary Box */}
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border bg-surface/50 p-4 sm:grid-cols-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Opening Balance</span>
                </div>
                <p className="num mt-1 text-base font-bold text-foreground md:text-lg">
                  {formatMoney(summary.openingBalance)}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-income">Total Credit (Received)</span>
                <p className="num mt-1 text-base font-bold text-income md:text-lg">
                  +{formatMoney(summary.creditReceived)}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-medium text-muted-foreground">Total Debit (Spent)</span>
                <p className="num mt-1 text-base font-bold text-foreground md:text-lg">
                  −{formatMoney(summary.debitSpent)}
                </p>
              </div>

              <div className="border-t pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                  Net Balance
                </span>
                <p className="num mt-1 text-xl font-black text-foreground md:text-2xl">
                  {formatMoney(summary.netBalance)}
                </p>
              </div>
            </div>
          </div>

          {/* Cashbook Table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="border-b bg-surface/80 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-3">Date & Time</th>
                  <th scope="col" className="px-3 py-3">Details / Description</th>
                  <th scope="col" className="px-3 py-3">Project</th>
                  <th scope="col" className="px-3 py-3 text-right">Debit (−)</th>
                  <th scope="col" className="px-3 py-3 text-right">Credit (+)</th>
                  <th scope="col" className="px-3 py-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y font-normal">
                {/* Initial opening balance row */}
                <tr className="bg-surface/30 font-semibold text-muted-foreground">
                  <td className="px-3 py-2.5 tabular-nums">{formatDay(startDate === '2000-01-01' ? today : startDate)}</td>
                  <td className="px-3 py-2.5 font-bold text-foreground" colSpan={4}>
                    Opening Balance Forward
                  </td>
                  <td className="num px-3 py-2.5 text-right font-bold text-foreground">
                    {formatMoney(summary.openingBalance)}
                  </td>
                </tr>

                {txsWithBalance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center">
                      <p className="text-sm font-semibold text-foreground">
                        No transactions recorded in this period ({dateRangeLabel})
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Try selecting another date range above or record a new entry by voice.
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        <Link
                          href="/voice"
                          className={cn(buttonClass('primary'), 'text-xs inline-flex items-center gap-1.5')}
                        >
                          Record by voice
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  txsWithBalance.map((tx: TransactionWithBalance) => {
                    const proj = tx.projectId ? projectMap.get(tx.projectId) : undefined
                    const isCredit = tx.type === 'income'

                    return (
                      <tr key={tx.id} className="transition-colors hover:bg-surface/40">
                        <td className="px-3 py-3.5 tabular-nums text-muted-foreground whitespace-nowrap">
                          <span className="font-semibold text-foreground">{formatDay(tx.date)}</span>
                          {tx.time ? (
                            <span className="block text-[11px] text-muted-foreground">{tx.time}</span>
                          ) : null}
                        </td>

                        <td className="px-3 py-3.5 max-w-xs">
                          <p className="font-semibold text-foreground">
                            {tx.description || tx.party || tx.category}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {tx.party && tx.description && tx.party !== tx.description ? `${tx.party} · ` : ''}
                            {tx.category} · {methodLabel[tx.method] || tx.method}
                          </p>
                        </td>

                        <td className="px-3 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          {proj ? (
                            <span className="font-medium text-foreground">{proj.name}</span>
                          ) : (
                            <span className="italic text-muted-foreground/80">General</span>
                          )}
                        </td>

                        {/* Debit (-) */}
                        <td className="num px-3 py-3.5 text-right font-medium text-foreground tabular-nums whitespace-nowrap">
                          {!isCredit ? `−${formatMoney(tx.amount)}` : '—'}
                        </td>

                        {/* Credit (+) */}
                        <td className="num px-3 py-3.5 text-right font-semibold text-income tabular-nums whitespace-nowrap">
                          {isCredit ? `+${formatMoney(tx.amount)}` : '—'}
                        </td>

                        {/* Running Balance */}
                        <td className="num px-3 py-3.5 text-right font-bold text-foreground tabular-nums whitespace-nowrap">
                          {formatMoney(tx.balanceAfter)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>

              {/* Cashbook Totals Summary Row */}
              <tfoot className="border-t-2 border-foreground/20 bg-surface/80 font-semibold">
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-sm font-bold text-foreground">
                    Totals & Net Position
                  </td>
                  <td className="num px-3 py-3 text-right text-sm font-bold text-foreground tabular-nums">
                    −{formatMoney(summary.debitSpent)}
                  </td>
                  <td className="num px-3 py-3 text-right text-sm font-bold text-income tabular-nums">
                    +{formatMoney(summary.creditReceived)}
                  </td>
                  <td className="num px-3 py-3 text-right text-base font-black text-foreground tabular-nums">
                    {formatMoney(summary.netBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Official Sign-off Block for Printing */}
          <div className="mt-12 hidden border-t pt-8 print:block">
            <div className="flex justify-between text-xs text-muted-foreground">
              <div>
                <p className="font-semibold text-foreground">Prepared by:</p>
                <p className="mt-8 border-t border-muted-foreground/40 pt-1 font-medium text-foreground">
                  {contractorName}
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Verified / Approved by:</p>
                <p className="mt-8 border-t border-muted-foreground/40 pt-1 font-medium text-foreground">
                  Signature & Seal
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </>
  )
}
