'use client'

import { useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { buttonClass, Segmented } from '@/components/ledger-ui'
import { EXPENSE_CATEGORIES, TODAY, type PayMethod, type Project, type Transaction, type TxType } from '@/lib/data'
import type { ParsedEntry } from '@/lib/parse-voice'
import { cn } from '@/lib/utils'

const fieldClass =
  'h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20'

export function ReviewForm({
  parsed,
  transcript,
  projects,
  onSave,
  onCancel,
}: {
  parsed: ParsedEntry
  transcript: string
  projects: Project[]
  onSave: (tx: Omit<Transaction, 'id'>) => void
  onCancel: () => void
  key?: string
}) {
  const [type, setType] = useState<TxType>(parsed.type === 'income' ? 'income' : 'expense')
  const [amount, setAmount] = useState(parsed.amount ? String(parsed.amount) : '')
  const [projectId, setProjectId] = useState(parsed.projectId ?? '')
  const [category, setCategory] = useState(parsed.category || (parsed.type === 'income' ? 'Client Payment' : 'Worker Payment'))
  const [party, setParty] = useState(parsed.party || (parsed.category === 'Worker Payment' ? 'Workers' : ''))
  const [method, setMethod] = useState<PayMethod>(parsed.method || (parsed.type === 'income' ? 'bank' : 'cash'))
  const [date, setDate] = useState(TODAY)
  const [touched, setTouched] = useState(false)

  const amountValue = parseFloat(amount.replace(/[^\d.]/g, '')) || 0
  const amountMissing = !amountValue || isNaN(amountValue)
  const isDailyExpense = category === 'Fuel' || category === 'Food & tea' || category === 'Other'

  const warnings = [
    !amountValue && 'We couldn’t detect the amount. Please enter it below.',
    !projectId && !isDailyExpense && type === 'income' && 'Please select the building project for this income.',
  ].filter(Boolean) as string[]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (amountMissing) return

    const selectedProj = projects.find((p) => p.id === projectId)
    const effectiveDescription =
      type === 'income'
        ? `Client payment${selectedProj ? ' — ' + selectedProj.name : ''}`
        : category === 'Worker Payment'
          ? `Worker payment${selectedProj ? ' for ' + selectedProj.name : ''}`
          : `${category}${party ? ' — ' + party : ''}${selectedProj ? ' (' + selectedProj.name + ')' : ''}`

    onSave({
      type,
      amount: amountValue,
      date,
      projectId: projectId || null,
      category: type === 'income' ? 'Client Payment' : category,
      party: party || (category === 'Worker Payment' ? 'Workers' : (type === 'income' ? (selectedProj?.client || 'Client') : 'Daily expense')),
      method,
      source: 'voice',
      transcript,
      description: effectiveDescription,
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col">
      {warnings.length > 0 ? (
        <div className="border-b bg-primary-soft/40 px-4 py-3 md:px-6">
          <div className="flex items-start gap-2 text-xs font-medium text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>{warnings.join(' ')} Check the details below.</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 px-4 py-5 md:grid-cols-2 md:px-6">
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-xs font-semibold text-foreground uppercase tracking-wider">Type of entry</legend>
          <Segmented
            label="Type of entry"
            value={type}
            onChange={(v) => {
              setType(v)
              if (v === 'income') setCategory('Client Payment')
              else if (category === 'Client Payment') setCategory('Worker Payment')
            }}
            options={[
              { value: 'income', label: 'Credit (Money received)' },
              { value: 'expense', label: 'Debit (Expense / Wages)' },
            ]}
          />
        </fieldset>

        <div className="md:col-span-2">
          <label htmlFor="amount" className="mb-1.5 block text-xs font-semibold text-foreground">
            Amount (₹) *
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
              ₹
            </span>
            <input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={touched && amountMissing}
              className={cn(
                fieldClass,
                'num h-13 pl-9 text-xl font-black',
                touched && amountMissing && 'border-destructive ring-1 ring-destructive',
              )}
              placeholder="0"
            />
          </div>
          {touched && amountMissing ? <p className="mt-1 text-xs text-destructive font-medium">Please enter a valid amount.</p> : null}
        </div>

        <div>
          <label htmlFor="project" className="mb-1.5 block text-xs font-semibold text-foreground">
            Building Project <span className="text-[11px] font-normal text-muted-foreground">(optional for daily expenses)</span>
          </label>
          <select
            id="project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={fieldClass}
          >
            <option value="">No Project (General Daily Expense)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.client}
              </option>
            ))}
          </select>
        </div>

        {type === 'expense' ? (
          <div>
            <label htmlFor="category" className="mb-1.5 block text-xs font-semibold text-foreground">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                if (e.target.value === 'Worker Payment' && !party) setParty('Workers')
              }}
              className={fieldClass}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="party" className="mb-1.5 block text-xs font-semibold text-foreground">
              Received From
            </label>
            <input
              id="party"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              className={fieldClass}
              placeholder="Client name"
            />
          </div>
        )}

        {type === 'expense' ? (
          <div>
            <label htmlFor="party" className="mb-1.5 block text-xs font-semibold text-foreground">
              Paid To <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="party"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              className={fieldClass}
              placeholder={category === 'Worker Payment' ? 'Workers' : 'Supplier or shop name'}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="date" className="mb-1.5 block text-xs font-semibold text-foreground">
            Date
          </label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
        </div>

        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-xs font-semibold text-foreground uppercase tracking-wider">Payment Method</legend>
          <Segmented
            label="Payment method"
            value={method}
            onChange={(m) => setMethod(m as PayMethod)}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'upi', label: 'UPI / GPay' },
              { value: 'bank', label: 'Bank Transfer' },
              { value: 'cheque', label: 'Cheque' },
            ]}
          />
        </fieldset>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t bg-surface/50 px-4 py-4 sm:flex-row sm:justify-end md:px-6">
        <button type="button" onClick={onCancel} className={buttonClass('ghost')}>
          Cancel
        </button>
        <button type="submit" className={buttonClass('primary', 'lg')}>
          <Check aria-hidden="true" />
          <span>Save Entry</span>
        </button>
      </div>
    </form>
  )
}
