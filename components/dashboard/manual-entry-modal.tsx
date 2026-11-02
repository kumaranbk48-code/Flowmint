'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Check,
  Coins,
  Keyboard,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { buttonClass, Segmented } from '@/components/ledger-ui'
import { EXPENSE_CATEGORIES, type PayMethod, type Project, type TxType } from '@/lib/data'
import { formatMoney, timeLabelIST, todayISO } from '@/lib/format'
import { parseMoneyInput } from '@/lib/money'
import { cn } from '@/lib/utils'

function getCurrentTimeStr() {
  return timeLabelIST()
}

export function ManualEntryModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { addTransaction, projects } = useLedger()

  // Mode: 'type' (AI text extraction like "Type instead"), 'confirm' (reviewing extracted details), 'form' (direct manual inputs)
  const [mode, setMode] = useState<'type' | 'confirm' | 'form'>('type')
  const [typedText, setTypedText] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')

  // Extracted/editable transaction details
  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [party, setParty] = useState('')
  const [projectId, setProjectId] = useState<string>('')
  const [category, setCategory] = useState<string>('Other')
  // '' = the speaker did not say how it was paid: the user must choose (it is never silently assumed to be cash)
  const [method, setMethod] = useState<PayMethod | ''>('cash')
  const [time, setTime] = useState(getCurrentTimeStr())
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  if (!open) return null

  const handleClose = () => {
    if (isSaving) return
    setMode('type')
    setTypedText('')
    setIsExtracting(false)
    setExtractError('')
    setAmount('')
    setDescription('')
    setParty('')
    setProjectId('')
    setCategory('Other')
    setMethod('cash')
    setError('')
    setIsSaving(false)
    onClose()
  }

  // AI Text Extraction (Matches the "Type instead" pipeline)
  const handleExtract = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const clean = typedText.trim()
    if (!clean) {
      setExtractError('Please enter a sentence describing the transaction.')
      return
    }

    setIsExtracting(true)
    setExtractError('')

    try {
      const res = await fetch('/api/voice/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: clean, projects }),
      })

      const data = await res.json()
      if (!res.ok || !data?.parsed) {
        throw new Error('Could not parse transaction')
      }

      const raw = data.parsed
      const parsedType: TxType = raw.type === 'income' ? 'income' : 'expense'
      setType(parsedType)
      setAmount(raw.amount ? String(raw.amount) : '')
      setProjectId(raw.projectId || '')
      setCategory(raw.category || (parsedType === 'income' ? 'Client Payment' : 'Other'))
      setParty(
        raw.party ||
          (raw.category === 'Worker Payment'
            ? 'Site Workers'
            : parsedType === 'income'
              ? 'Client'
              : 'Daily expense'),
      )
      setMethod(raw.method || '')
      setDescription(raw.description || clean)
      setTime(getCurrentTimeStr())
      setMode('confirm')
    } catch (err: any) {
      setExtractError('Could not automatically parse. You can fill the details below.')
      setMode('form')
    } finally {
      setIsExtracting(false)
    }
  }

  // Save confirmed transaction to ledger
  const handleSaveToLedger = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    const numericAmount = parseMoneyInput(amount)
    if (numericAmount === null || numericAmount <= 0) {
      setError('Please enter a valid amount: digits only, up to 2 decimals, greater than ₹0.')
      return
    }

    const selectedProj = projects.find((p) => p.id === projectId)
    const effectiveDesc =
      description.trim() ||
      (type === 'income'
        ? `Client Payment${selectedProj ? ' — ' + selectedProj.name : ''}`
        : category === 'Worker Payment'
          ? `Worker payment${selectedProj ? ' for ' + selectedProj.name : ''}`
          : `${category}${party ? ' — ' + party : ''}`)

    if (!method) {
      setError('Choose how this was paid: cash, UPI, bank or cheque.')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      await addTransaction({
        type,
        amount: numericAmount,
        date: todayISO(),
        time: time.trim() || getCurrentTimeStr(),
        description: effectiveDesc,
        projectId: projectId || null,
        category: type === 'income' ? 'Client Payment' : category,
        party: party.trim() || (type === 'income' ? (selectedProj?.client || 'Client') : 'Expense'),
        method,
        source: 'manual',
        transcript: typedText.trim() || undefined,
      })

      handleClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save transaction. Please try again.'
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-entry-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-xs animate-in fade-in-0"
    >
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border bg-card p-4 sm:p-5 md:p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Close dialog"
        >
          <X className="size-5" />
        </button>

        {/* STEP 1: TYPE INSTEAD / SMART TEXT PROMPT */}
        {mode === 'type' && (
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Keyboard className="size-5" />
              </div>
              <div>
                <h2 id="manual-entry-title" className="text-base font-bold text-foreground">
                  Add Transaction Manually
                </h2>
                <p className="text-xs text-muted-foreground">
                  Type what you received or spent, and we will extract the details.
                </p>
              </div>
            </div>

            <form onSubmit={handleExtract} className="mt-5 flex flex-col gap-3">
              <div>
                <label htmlFor="typed-tx-input" className="sr-only">
                  Transaction sentence
                </label>
                <textarea
                  id="typed-tx-input"
                  rows={3}
                  value={typedText}
                  autoFocus
                  onChange={(e) => {
                    setTypedText(e.target.value)
                    setExtractError('')
                  }}
                  placeholder="e.g. Received 1,50,000 from Rakesh Sharma for Sharma Residence by bank transfer or Paid 8000 to workers"
                  className="w-full resize-none rounded-xl border border-input bg-card p-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
                {extractError && <p className="mt-1 text-xs text-destructive">{extractError}</p>}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setMode('form')}
                  className="text-xs font-semibold text-muted-foreground hover:text-primary hover:underline"
                >
                  Or fill form manually
                </button>

                <button
                  type="submit"
                  disabled={isExtracting || !typedText.trim()}
                  className={cn(buttonClass('primary', 'md'), 'gap-1.5')}
                >
                  {isExtracting ? (
                    <>
                      <span className="size-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Extracting…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      <span>Extract Details</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 2: REVIEW & CONFIRM EXTRACTED DETAILS (OR EDIT) */}
        {mode === 'confirm' && (
          <form onSubmit={handleSaveToLedger} className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  You typed
                </span>
                <button
                  type="button"
                  onClick={() => setMode('type')}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Edit text
                </button>
              </div>
              <blockquote className="mt-1 rounded-lg border border-input/60 bg-surface/40 p-2.5 text-xs font-medium text-foreground italic">
                “{typedText}”
              </blockquote>
            </div>

            {/* Type selector */}
            <div>
              <label className="text-xs font-semibold text-foreground">Entry Type</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setType('income')
                    if (category !== 'Client Payment') setCategory('Client Payment')
                  }}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-bold transition-all',
                    type === 'income'
                      ? 'border-income bg-income/10 text-income'
                      : 'border-input bg-card text-muted-foreground hover:bg-secondary',
                  )}
                >
                  <ArrowDownLeft className="size-4" />
                  <span>Money In (Credit)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('expense')
                    if (category === 'Client Payment') setCategory('Worker Payment')
                  }}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-bold transition-all',
                    type === 'expense'
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : 'border-input bg-card text-muted-foreground hover:bg-secondary',
                  )}
                >
                  <ArrowUpRight className="size-4" />
                  <span>Money Out (Debit)</span>
                </button>
              </div>
            </div>

            {/* Amount & Project */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="confirm-amount" className="text-xs font-semibold text-foreground">
                  Amount (₹)
                </label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                    ₹
                  </span>
                  <input
                    id="confirm-amount"
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value)
                      setError('')
                    }}
                    placeholder="0"
                    className="h-10 w-full rounded-lg border border-input bg-card pl-7 pr-3 text-sm font-bold outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirm-project" className="text-xs font-semibold text-foreground">
                  Project
                </label>
                <select
                  id="confirm-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2.5 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                >
                  <option value="">No Project (General)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.client})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Category & Party */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="confirm-category" className="text-xs font-semibold text-foreground">
                  Category
                </label>
                <select
                  id="confirm-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2.5 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                >
                  {type === 'income' ? (
                    <>
                      <option value="Client Payment">Client Payment</option>
                      <option value="Advance">Contract Advance</option>
                      <option value="Other">Other Income</option>
                    </>
                  ) : (
                    EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="confirm-party" className="text-xs font-semibold text-foreground">
                  {type === 'income' ? 'Received From (Client)' : 'Paid To (Party/Worker)'}
                </label>
                <input
                  id="confirm-party"
                  type="text"
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                  placeholder="e.g. Rakesh Sharma, Workers"
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-xs font-semibold text-foreground">Payment Method</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(
                  [
                    ['cash', 'Cash'],
                    ['upi', 'UPI / GPay'],
                    ['bank', 'Bank Transfer'],
                    ['cheque', 'Cheque'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                      method === m
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-input bg-card text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setMode('type')}
                className={cn(buttonClass('outline', 'md'), 'shrink-0 px-3 text-xs sm:px-4 sm:text-sm')}
              >
                Back
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className={cn(buttonClass('primary', 'md'), 'flex-1 sm:flex-initial text-xs sm:text-sm')}
              >
                <Check className="size-4" />
                <span>{isSaving ? 'Saving…' : 'Confirm & Save to Ledger'}</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: FALLBACK TRADITIONAL FORM */}
        {mode === 'form' && (
          <form onSubmit={handleSaveToLedger} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">Manual Entry Form</h2>
              <button
                type="button"
                onClick={() => setMode('type')}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Type sentence instead
              </button>
            </div>

            {/* Type selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('income')
                  if (category !== 'Client Payment') setCategory('Client Payment')
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-bold transition-all',
                  type === 'income'
                    ? 'border-income bg-income/10 text-income'
                    : 'border-input bg-card text-muted-foreground hover:bg-secondary',
                )}
              >
                <ArrowDownLeft className="size-4" />
                <span>Money In (Credit)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('expense')
                  if (category === 'Client Payment') setCategory('Worker Payment')
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-bold transition-all',
                  type === 'expense'
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-input bg-card text-muted-foreground hover:bg-secondary',
                )}
              >
                <ArrowUpRight className="size-4" />
                <span>Money Out (Debit)</span>
              </button>
            </div>

            {/* Amount */}
            <div>
              <label htmlFor="form-amount" className="text-xs font-semibold text-foreground">
                Amount (₹)
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                  ₹
                </span>
                <input
                  id="form-amount"
                  type="number"
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    setError('')
                  }}
                  placeholder="0"
                  className="h-10 w-full rounded-lg border border-input bg-card pl-7 pr-3 text-sm font-bold outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
              </div>
            </div>

            {/* Project & Category */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="form-project" className="text-xs font-semibold text-foreground">
                  Project
                </label>
                <select
                  id="form-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2.5 text-xs font-medium outline-none"
                >
                  <option value="">No Project (General)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.client})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="form-category" className="text-xs font-semibold text-foreground">
                  Category
                </label>
                <select
                  id="form-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2.5 text-xs font-medium outline-none"
                >
                  {type === 'income' ? (
                    <>
                      <option value="Client Payment">Client Payment</option>
                      <option value="Advance">Contract Advance</option>
                      <option value="Other">Other Income</option>
                    </>
                  ) : (
                    EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Party */}
            <div>
              <label htmlFor="form-party" className="text-xs font-semibold text-foreground">
                {type === 'income' ? 'Received From (Client)' : 'Paid To (Party/Worker)'}
              </label>
              <input
                id="form-party"
                type="text"
                value={party}
                onChange={(e) => setParty(e.target.value)}
                placeholder="e.g. Rakesh Sharma, Workers"
                className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-xs outline-none"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-xs font-semibold text-foreground">Payment Method</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(
                  [
                    ['cash', 'Cash'],
                    ['upi', 'UPI / GPay'],
                    ['bank', 'Bank Transfer'],
                    ['cheque', 'Cheque'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                      method === m
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-input bg-card text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-4">
              <button
                type="button"
                onClick={handleClose}
                className={cn(buttonClass('outline', 'md'), 'shrink-0 px-3 text-xs sm:px-4 sm:text-sm')}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className={cn(buttonClass('primary', 'md'), 'flex-1 sm:flex-initial text-xs sm:text-sm')}
              >
                <Check className="size-4" />
                <span>{isSaving ? 'Saving…' : 'Save to Today’s Ledger'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
