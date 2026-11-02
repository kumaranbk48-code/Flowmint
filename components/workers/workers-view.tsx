'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Phone,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { buttonClass, PageHeader, Panel } from '@/components/ledger-ui'
import { type Worker } from '@/lib/data'
import { addDays, formatDay, formatMoney, weekStartISO } from '@/lib/format'
import { daysWorked, paidThisWeek, workerDue, workerEarned } from '@/lib/ledger'
import { cn } from '@/lib/utils'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COMMON_ROLES = [
  'Mason / Mistri',
  'Helper / Mazdoor',
  'Carpenter',
  'Bar Bender / Steel Fixer',
  'Plumber',
  'Electrician',
  'Painter',
  'Supervisor',
  'Other',
]

function Attendance({
  worker,
  onToggleDay,
}: {
  worker: Worker
  onToggleDay?: (dayIndex: number) => void
}) {
  return (
    <ul className="flex gap-1" aria-label={`Attendance for ${worker.name}`}>
      {worker.attendance.map((a, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onToggleDay?.(i)}
            title={`${DAYS[i]}: ${a === null ? 'upcoming' : a ? 'present' : 'absent'} (click to change)`}
            className={cn(
              'flex size-7 items-center justify-center rounded-md text-[10px] font-semibold transition-colors',
              a === true && 'bg-wage text-primary-foreground hover:opacity-90',
              a === false && 'border border-expense/30 bg-expense-soft text-expense hover:opacity-90',
              a === null && 'border border-dashed text-muted-foreground hover:border-foreground/40',
            )}
          >
            <span aria-hidden="true">{DAYS[i][0]}</span>
            <span className="sr-only">
              {DAYS[i]} {a === null ? 'upcoming' : a ? 'present' : 'absent'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

const STORAGE_KEY = 'flowmint_workers'

export function WorkersView() {
  const { workers: contextWorkers, projects, transactions, payWorker } = useLedger()
  const [workers, setWorkers] = useState<Worker[]>(contextWorkers)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPayingAll, setIsPayingAll] = useState(false)

  // New worker form state
  const [name, setName] = useState('')
  const [role, setRole] = useState(COMMON_ROLES[0])
  const [phone, setPhone] = useState('')
  const [dailyRate, setDailyRate] = useState('750')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [advance, setAdvance] = useState('')

  // Load persisted workers on client mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWorkers(parsed)
          return
        }
      }
    } catch {
      /* ignore */
    }
    if (contextWorkers && contextWorkers.length > 0) {
      setWorkers(contextWorkers)
    }
  }, [contextWorkers])

  // Clear feedback banner
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [feedback])

  const saveWorkers = (next: Worker[]) => {
    setWorkers(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const handleToggleAttendance = (workerId: string, dayIdx: number) => {
    const updated = workers.map((w) => {
      if (w.id !== workerId) return w
      const att = [...w.attendance]
      const current = att[dayIdx]
      // cycle: true (present) -> false (absent) -> null (upcoming) -> true
      att[dayIdx] = current === true ? false : current === false ? null : true
      return { ...w, attendance: att }
    })
    saveWorkers(updated)
  }

  const handleAddWorker = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFeedback({ type: 'error', message: 'Worker name is required.' })
      return
    }

    const rate = Math.round(Number(dailyRate))
    if (!Number.isFinite(rate) || rate <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid daily rate.' })
      return
    }

    const adv = advance.trim() ? Math.max(0, Math.round(Number(advance))) : 0

    const newWorker: Worker = {
      id: crypto.randomUUID(),
      name: name.trim(),
      role: role.trim() || 'Worker',
      phone: phone.trim() || '',
      dailyRate: rate,
      projectId: projectId || (projects[0]?.id ?? ''),
      attendance: [true, true, true, null, null, null], // default 3 days present this week
      advance: adv,
    }

    const next = [...workers, newWorker]
    saveWorkers(next)
    setFeedback({ type: 'success', message: `${newWorker.name} added successfully.` })
    setName('')
    setPhone('')
    setAdvance('')
    setIsAddOpen(false)
  }

  const handleDeleteWorker = (workerId: string) => {
    const next = workers.filter((w) => w.id !== workerId)
    saveWorkers(next)
    setFeedback({ type: 'success', message: 'Worker removed.' })
  }

  const handlePaySingle = async (w: Worker) => {
    try {
      await payWorker(w)
      setFeedback({
        type: 'success',
        message: `Payment of ${formatMoney(workerDue(w))} recorded for ${w.name}.`,
      })
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || `Failed to record payment for ${w.name}.` })
    }
  }

  const handlePayAll = async () => {
    if (unpaid.length === 0 || isPayingAll) return
    setIsPayingAll(true)
    try {
      for (const w of unpaid) {
        await payWorker(w)
      }
      setFeedback({
        type: 'success',
        message: `Paid all ${unpaid.length} workers successfully.`,
      })
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to record worker payments.' })
    } finally {
      setIsPayingAll(false)
    }
  }

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? 'General Site'
  const unpaid = workers.filter((w) => !paidThisWeek(w, transactions))
  const due = unpaid.reduce((s, w) => s + workerDue(w), 0)
  const advances = workers.reduce((s, w) => s + w.advance, 0)
  const present = workers.filter((w) => w.attendance.some((d) => d === true)).length

  return (
    <>
      <PageHeader
        title="Workers"
        description={`Week of ${formatDay(weekStartISO())} – ${formatDay(addDays(weekStartISO(), 5))} · wages paid every Saturday`}
        actions={
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className={buttonClass('primary')}
          >
            <UserPlus aria-hidden="true" className="size-4" />
            Add worker
          </button>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        {feedback && (
          <div
            className={cn(
              'flex items-center justify-between rounded-xl p-3.5 text-xs font-semibold shadow-xs animate-in fade-in',
              feedback.type === 'success'
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-destructive/10 text-destructive border border-destructive/20',
            )}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <Panel bodyClassName="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <div>
              <p className="text-xs text-muted-foreground">
                Payroll due · {formatDay(addDays(weekStartISO(), 5), { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
              <p className="num mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{formatMoney(due)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Advances to deduct</p>
              <p className="num mt-1 text-lg font-semibold">{formatMoney(advances)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active this week</p>
              <p className="num mt-1 text-lg font-semibold">
                {present} / {workers.length}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={unpaid.length === 0 || isPayingAll}
            onClick={handlePayAll}
            className={buttonClass('primary', 'lg')}
          >
            {isPayingAll
              ? 'Recording...'
              : unpaid.length
                ? `Pay all ${unpaid.length} workers`
                : 'Everyone paid'}
          </button>
        </Panel>

        <Panel title="Attendance & wages">
          {workers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 p-8 text-center bg-card/40 my-4 mx-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                <Users className="size-6" />
              </div>
              <h3 className="text-base font-semibold">No workers added yet</h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Add your site workers, masons, and helpers to record attendance, track advances, and pay wages.
              </p>
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                className={cn(buttonClass('primary'), 'mt-4')}
              >
                <UserPlus className="size-4" />
                Add your first worker
              </button>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1fr)_minmax(0,1fr)_130px] items-center gap-4 border-b bg-surface/60 px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
                <span>Worker</span>
                <span className="w-[202px]">This week (click day to toggle)</span>
                <span className="text-right">Earned</span>
                <span className="text-right">Due</span>
                <span className="sr-only">Action</span>
              </div>
              <ul className="divide-y">
                {workers.map((w) => {
                  const paid = paidThisWeek(w, transactions)
                  return (
                    <li
                      key={w.id}
                      className="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1fr)_minmax(0,1fr)_130px] lg:items-center lg:gap-4 lg:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold"
                        >
                          {w.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{w.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {w.role} · {projectName(w.projectId)}
                          </p>
                        </div>
                        {w.phone && (
                          <a
                            href={`tel:${w.phone.replace(/\s/g, '')}`}
                            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary lg:hidden"
                            aria-label={`Call ${w.name}`}
                          >
                            <Phone className="size-4" aria-hidden="true" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteWorker(w.id)}
                          className="text-muted-foreground/60 hover:text-destructive p-1 rounded-md"
                          title={`Remove ${w.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      <Attendance
                        worker={w}
                        onToggleDay={(dayIdx) => handleToggleAttendance(w.id, dayIdx)}
                      />

                      <div className="flex items-center justify-between gap-4 lg:contents">
                        <div className="lg:text-right">
                          <p className="num text-sm">{formatMoney(workerEarned(w))}</p>
                          <p className="text-xs text-muted-foreground">
                            {daysWorked(w)} × {formatMoney(w.dailyRate)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="num text-sm font-semibold">{formatMoney(workerDue(w))}</p>
                          <p className="text-xs text-muted-foreground">
                            {w.advance ? `− ${formatMoney(w.advance)} advance` : 'No advance'}
                          </p>
                        </div>
                      </div>

                      <div className="lg:text-right">
                        {paid ? (
                          <span className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-income-soft px-3 text-sm font-medium text-income lg:w-auto">
                            <Check className="size-4" aria-hidden="true" />
                            Paid
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePaySingle(w)}
                            disabled={workerDue(w) === 0}
                            className={cn(buttonClass('outline'), 'w-full lg:w-auto')}
                          >
                            Pay {formatMoney(workerDue(w))}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Panel>
      </div>

      {/* Add Worker Modal */}
      {isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-lg font-semibold">Add Site Worker</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Track attendance, daily rates, and wages for this worker.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleAddWorker} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Worker Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="mt-1 w-full rounded-xl border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-hidden"
                  >
                    {COMMON_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Daily Wage (₹) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    step="50"
                    placeholder="750"
                    value={dailyRate}
                    onChange={(e) => setDailyRate(e.target.value)}
                    className="mt-1 w-full rounded-xl border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Advance Given (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={advance}
                    onChange={(e) => setAdvance(e.target.value)}
                    className="mt-1 w-full rounded-xl border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Assigned Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-1 w-full rounded-xl border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-hidden"
                >
                  <option value="">General Site / No Project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.client})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-2 flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className={buttonClass('outline')}
                >
                  Cancel
                </button>
                <button type="submit" className={buttonClass('primary')}>
                  Save Worker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

