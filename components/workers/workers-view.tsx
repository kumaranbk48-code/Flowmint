'use client'

import { Check, Phone, UserPlus } from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { buttonClass, PageHeader, Panel } from '@/components/ledger-ui'
import { PAYDAY, WEEK_START, type Worker } from '@/lib/data'
import { addDays, formatDay, formatMoney } from '@/lib/format'
import { daysWorked, paidThisWeek, workerDue, workerEarned } from '@/lib/ledger'
import { cn } from '@/lib/utils'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Attendance({ worker }: { worker: Worker }) {
  return (
    <ul className="flex gap-1" aria-label={`Attendance for ${worker.name}`}>
      {worker.attendance.map((a, i) => (
        <li
          key={i}
          title={`${DAYS[i]}: ${a === null ? 'upcoming' : a ? 'present' : 'absent'}`}
          className={cn(
            'flex size-7 items-center justify-center rounded-md text-[10px] font-semibold',
            a === true && 'bg-wage text-primary-foreground',
            a === false && 'border border-expense/30 bg-expense-soft text-expense',
            a === null && 'border border-dashed text-muted-foreground',
          )}
        >
          <span aria-hidden="true">{DAYS[i][0]}</span>
          <span className="sr-only">
            {DAYS[i]} {a === null ? 'upcoming' : a ? 'present' : 'absent'}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function WorkersView() {
  const { workers, projects, transactions, payWorker } = useLedger()
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? ''
  const unpaid = workers.filter((w) => !paidThisWeek(w, transactions))
  const due = unpaid.reduce((s, w) => s + workerDue(w), 0)
  const advances = workers.reduce((s, w) => s + w.advance, 0)
  const present = workers.filter((w) => w.attendance[1]).length

  return (
    <>
      <PageHeader
        title="Workers"
        description={`Week of ${formatDay(WEEK_START)} – ${formatDay(addDays(WEEK_START, 5))} · wages paid every Saturday`}
        actions={
          <button type="button" className={buttonClass('outline')}>
            <UserPlus aria-hidden="true" />
            Add worker
          </button>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <Panel bodyClassName="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <div>
              <p className="text-xs text-muted-foreground">
                Payroll due · {formatDay(PAYDAY, { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
              <p className="num mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{formatMoney(due)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Advances to deduct</p>
              <p className="num mt-1 text-lg font-semibold">{formatMoney(advances)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">On site today</p>
              <p className="num mt-1 text-lg font-semibold">
                {present} / {workers.length}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={unpaid.length === 0}
            onClick={() => unpaid.forEach((w) => payWorker(w))}
            className={buttonClass('primary', 'lg')}
          >
            {unpaid.length ? `Pay all ${unpaid.length} workers` : 'Everyone paid'}
          </button>
        </Panel>

        <Panel title="Attendance & wages">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1fr)_minmax(0,1fr)_120px] items-center gap-4 border-b bg-surface/60 px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
            <span>Worker</span>
            <span className="w-[202px]">This week</span>
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
                  className="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1fr)_minmax(0,1fr)_120px] lg:items-center lg:gap-4 lg:px-5"
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
                        .slice(0, 2)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{w.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {w.role} · {projectName(w.projectId)}
                      </p>
                    </div>
                    <a
                      href={`tel:${w.phone.replace(/\s/g, '')}`}
                      className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary lg:hidden"
                      aria-label={`Call ${w.name}`}
                    >
                      <Phone className="size-4" aria-hidden="true" />
                    </a>
                  </div>

                  <Attendance worker={w} />

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
                        onClick={() => payWorker(w)}
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
        </Panel>
      </div>
    </>
  )
}
