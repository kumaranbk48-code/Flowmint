'use client'
 
import { useEffect, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, Mic, Plus, Trash2, UserRound, X } from 'lucide-react'
import { useLedger, type NewProjectInput } from '@/components/ledger-provider'
import { ButtonLink, PageHeader, buttonClass } from '@/components/ledger-ui'
import { type Project } from '@/lib/data'
import { todayISO } from '@/lib/format'
import { formatDay, formatMoney } from '@/lib/format'
import { projectStats } from '@/lib/ledger'
import { cn } from '@/lib/utils'

export function ProjectsView() {
  const { projects, transactions, addProject, deleteProject, isLoading } = useLedger()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [feedback])

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every building contract with received amounts, spent amounts, and net cash flow."
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className={buttonClass('primary')}
            >
              <Plus className="size-4" aria-hidden="true" />
              New Project
            </button>
            <ButtonLink href="/voice" variant="outline">
              <Mic aria-hidden="true" />
              Record by voice
            </ButtonLink>
          </>
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

        {isLoading ? (
          <div className="grid gap-5 lg:grid-cols-2 animate-pulse">
            <div className="h-48 rounded-xl border bg-card/60 p-5" />
            <div className="h-48 rounded-xl border bg-card/60 p-5" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/60 px-4 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Building2 className="size-6" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">No projects yet</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Start by adding your first building contract with client name, contract amount, and dates.
            </p>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className={cn(buttonClass('primary'), 'mt-4')}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add Project
            </button>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {projects.map((p: Project) => {
              const s = projectStats(p, transactions)

            return (
              <article
                key={p.id}
                id={p.id}
                className="scroll-mt-20 rounded-xl border bg-card shadow-[0_1px_2px_oklch(0.2_0.01_60/0.04)]"
              >
                {/* Project / Building Name & Client Name & Timeline */}
                <div className="flex items-start justify-between gap-3 border-b px-4 py-4 md:px-5">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold tracking-tight text-foreground md:text-lg">
                      {p.name}
                    </h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserRound className="size-3.5" aria-hidden="true" />
                      <span>Client: <span className="font-medium text-foreground">{p.client}</span></span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Start Date:{' '}
                        <span className="font-medium text-foreground">
                          {formatDay(p.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </span>
                      {p.expectedCompletionDate ? (
                        <span>
                          Expected Completion:{' '}
                          <span className="font-medium text-foreground">
                            {formatDay(p.expectedCompletionDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProjectToDelete(p)}
                    title={`Delete ${p.name}`}
                    aria-label={`Delete ${p.name}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Contract, Received, Spent, Net Cash */}
                <dl className="grid grid-cols-2 border-b sm:grid-cols-4">
                  {[
                    ['Contract', p.contractValue, 'text-foreground'],
                    ['Received', s.received, 'text-income'],
                    ['Spent', s.spent, 'text-foreground'],
                    ['Net cash', s.margin, s.margin >= 0 ? 'text-income' : 'text-expense'],
                  ].map(([label, value, tone], i) => (
                    <div
                      key={label as string}
                      className={cn(
                        'px-4 py-3.5 md:px-5',
                        i % 2 === 1 && 'border-l',
                        i > 1 && 'border-t sm:border-t-0',
                        i === 2 && 'sm:border-l',
                      )}
                    >
                      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                      <dd className={cn('num mt-1 text-base font-semibold', tone as string)}>
                        {(value as number) < 0 ? '−' : ''}
                        {formatMoney(Math.abs(value as number))}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Client collection progress & worker payments summary */}
                <div className="px-4 py-3.5 md:px-5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Client paid {Math.round(s.receivedPct * 100)}%
                    </span>
                    <span className="num font-medium text-muted-foreground">
                      {formatMoney(s.balanceDue)} to collect
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuenow={Math.round(s.receivedPct * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${p.name} payments received`}
                  >
                    <div
                      className="h-full rounded-full bg-income transition-all"
                      style={{ width: `${Math.round(s.receivedPct * 100)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Worker payments on this site:{' '}
                      <span className="num font-semibold text-foreground">
                        {formatMoney(s.workerPayments)}
                      </span>
                    </span>
                    <span>
                      Started {formatDay(p.startDate, { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      </div>

      <AddProjectModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdd={async (data) => {
          try {
            await addProject(data)
            setFeedback({ type: 'success', message: `Project "${data.name}" created successfully.` })
          } catch {
            setFeedback({ type: 'error', message: 'Failed to create project. Please try again.' })
          }
        }}
      />

      <ConfirmDeleteModal
        project={projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirm={() => {
          if (projectToDelete) {
            const name = projectToDelete.name
            const id = projectToDelete.id
            setProjectToDelete(null)
            deleteProject(id).then(
              () => setFeedback({ type: 'success', message: `Project "${name}" was deleted.` }),
              (err: unknown) =>
                setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not delete the project.' }),
            )
          }
        }}
      />
    </>
  )
}

function AddProjectModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (data: NewProjectInput) => Promise<void> | void
}) {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [startDate, setStartDate] = useState(() => todayISO())
  const [expectedCompletionDate, setExpectedCompletionDate] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, isSubmitting])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!name.trim()) {
      setError('Please enter the project or building name.')
      return
    }
    if (!client.trim()) {
      setError('Please enter the client name.')
      return
    }
    const val = Number(contractValue)
    if (!contractValue || isNaN(val) || val <= 0) {
      setError('Please enter a valid contract amount.')
      return
    }
    if (!startDate) {
      setError('Please select a start date.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      await onAdd({
        name: name.trim(),
        client: client.trim(),
        contractValue: val,
        startDate,
        expectedCompletionDate: expectedCompletionDate || undefined,
      })

      setName('')
      setClient('')
      setContractValue('')
      setStartDate(todayISO())
      setExpectedCompletionDate('')
      onClose()
    } catch {
      setError('An error occurred while creating the project.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const numVal = Number(contractValue)
  const formattedPreview = !isNaN(numVal) && numVal > 0 ? formatMoney(numVal) : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-project-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border bg-card p-4 sm:p-5 md:p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3.5">
          <div>
            <h2 id="add-project-title" className="text-lg font-semibold tracking-tight text-foreground">
              Add New Project
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Enter the building contract details below.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg bg-destructive/10 px-3.5 py-2 text-xs font-medium text-destructive">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div>
            <label htmlFor="proj-name" className="text-xs font-medium text-foreground">
              Project / Building Name
            </label>
            <input
              id="proj-name"
              type="text"
              required
              placeholder="e.g. Sharma Residence"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError('')
              }}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          <div>
            <label htmlFor="client-name" className="text-xs font-medium text-foreground">
              Client Name
            </label>
            <input
              id="client-name"
              type="text"
              required
              placeholder="e.g. Rakesh Sharma"
              value={client}
              onChange={(e) => {
                setClient(e.target.value)
                if (error) setError('')
              }}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="contract-amount" className="text-xs font-medium text-foreground">
                Contract Amount
              </label>
              {formattedPreview ? (
                <span className="num text-xs font-semibold text-primary">{formattedPreview}</span>
              ) : null}
            </div>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">
                ₹
              </span>
              <input
                id="contract-amount"
                type="number"
                min="0"
                step="any"
                required
                placeholder="1850000"
                value={contractValue}
                onChange={(e) => {
                  setContractValue(e.target.value)
                  if (error) setError('')
                }}
                className="h-10 w-full rounded-lg border border-input bg-card pl-7 pr-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="start-date" className="text-xs font-medium text-foreground">
                Start Date
              </label>
              <input
                id="start-date"
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (error) setError('')
                }}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>

            <div>
              <label htmlFor="exp-completion" className="text-xs font-medium text-foreground">
                Expected Completion Date <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <input
                id="exp-completion"
                type="date"
                value={expectedCompletionDate}
                onChange={(e) => {
                  setExpectedCompletionDate(e.target.value)
                  if (error) setError('')
                }}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2 border-t pt-3.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className={buttonClass('outline')}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={buttonClass('primary')}
            >
              {isSubmitting ? 'Creating…' : 'Add Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ConfirmDeleteModal({
  project,
  onClose,
  onConfirm,
}: {
  project: Project | null
  onClose: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    if (!project) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [project, onClose])

  if (!project) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl md:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-delete-title" className="text-base font-semibold text-foreground">
              Delete Project
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Are you sure you want to delete <strong className="font-semibold text-foreground">{project.name}</strong>? This action will remove the project and its financial records.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t pt-3.5">
          <button
            type="button"
            onClick={onClose}
            className={buttonClass('outline')}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

