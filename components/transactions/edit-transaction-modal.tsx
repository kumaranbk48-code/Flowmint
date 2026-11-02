'use client'

import { useEffect, useState } from 'react'
import { useLedger } from '@/components/ledger-provider'
import { buttonClass } from '@/components/ledger-ui'
import type { PayMethod, Transaction } from '@/lib/data'
import { methodLabel, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'

const METHODS: PayMethod[] = ['cash', 'upi', 'bank', 'cheque']

/** Edits a transaction IN PLACE (same id): it can never create a second transaction. */
export function EditTransactionModal({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const { updateTransaction } = useLedger()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [method, setMethod] = useState<PayMethod>('cash')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!tx) return
    setAmount(String(tx.amount))
    setDate(tx.date)
    setMethod(tx.method)
    setDescription(tx.description || '')
    setError('')
  }, [tx])

  if (!tx) return null

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await updateTransaction(tx.id, { amount: amount.trim() as unknown as number, date, method, description })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the change.')
    } finally {
      setSaving(false)
    }
  }

  const field =
    'mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <form onSubmit={save} className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
        <h2 className="text-base font-semibold">Edit {tx.type === 'income' ? 'income' : 'expense'}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          This changes the existing entry. It does not create a new one.
        </p>

        <label className="mt-4 block text-xs font-semibold">
          Amount (₹)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={field} />
        </label>
        <label className="mt-3 block text-xs font-semibold">
          Date
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <div className="mt-3">
          <span className="text-xs font-semibold">Payment method</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold',
                  method === m ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground',
                )}
              >
                {methodLabel[m]}
              </button>
            ))}
          </div>
        </div>
        <label className="mt-3 block text-xs font-semibold">
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
        </label>

        {error && <p className="mt-3 text-xs font-semibold text-destructive">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass('outline')}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={buttonClass('primary')}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
