'use client'

import { Fragment, useMemo, useState } from 'react'
import { Download, Mic, Search } from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { Amount, ButtonLink, buttonClass, PageHeader, Panel, Segmented, TransactionRow, TypeBadge } from '@/components/ledger-ui'
import { type Transaction, type TxType } from '@/lib/data'
import { EditTransactionModal } from './edit-transaction-modal'
import { todayISO } from '@/lib/format'
import { formatDay, formatMoney, methodLabel, relativeDay } from '@/lib/format'
import { groupByDate, summarise } from '@/lib/ledger'
import { cn } from '@/lib/utils'

export function TransactionsView({ initialProject }: { initialProject: string }) {
  const { transactions, projects, isLoading, deleteTransaction } = useLedger()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const confirmDelete = (tx: Transaction) => {
    if (window.confirm(`Delete this ${tx.type === 'income' ? 'income' : 'expense'} of ${formatMoney(tx.amount)}? Balances will be recalculated.`)) {
      void deleteTransaction(tx.id)
    }
  }
  const [type, setType] = useState<'all' | TxType>('all')
  const [project, setProject] = useState(initialProject)
  const [query, setQuery] = useState('')
  const projectMap = new Map(projects.map((p) => [p.id, p]))

  const handleResetFilters = () => {
    setType('all')
    setProject('')
    setQuery('')
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions.filter(
      (t) =>
        (type === 'all' || t.type === type) &&
        (!project || t.projectId === project) &&
        (!q || `${t.party} ${t.category} ${t.note ?? ''}`.toLowerCase().includes(q)),
    )
  }, [transactions, type, project, query])

  const groups = groupByDate(filtered)
  const s = summarise(filtered)

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every payment received and every rupee spent, newest first."
        actions={
          <>
            <button type="button" className={buttonClass('outline')}>
              <Download aria-hidden="true" />
              Export
            </button>
            <ButtonLink href="/voice" variant="primary">
              <Mic aria-hidden="true" />
              Add by voice
            </ButtonLink>
          </>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <Segmented
              label="Filter by type"
              value={type}
              onChange={setType}
              options={[
                { value: 'all', label: 'All' },
                { value: 'income', label: 'Received' },
                { value: 'expense', label: 'Expenses' },
                { value: 'wage', label: 'Wages' },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="project-filter" className="sr-only">
              Filter by project
            </label>
            <select
              id="project-filter"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <label htmlFor="tx-search" className="sr-only">
                Search
              </label>
              <input
                id="tx-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search supplier, client…"
                className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 sm:w-64"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {filtered.length} entries
          </span>
          <span>
            In <span className="num font-semibold text-income">{formatMoney(s.received)}</span>
          </span>
          <span>
            Out <span className="num font-semibold">{formatMoney(s.spent)}</span>
          </span>
        </div>

        {/* Mobile list */}
        <Panel className="md:hidden">
          {isLoading ? (
            <div className="p-4 space-y-3 animate-pulse">
              <div className="h-12 w-full rounded bg-muted/40" />
              <div className="h-12 w-full rounded bg-muted/40" />
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              totalCount={transactions.length}
              onResetFilters={handleResetFilters}
            />
          ) : null}
          {groups.map(([date, txs]) => (
            <div key={date}>
              <p className="border-b bg-surface/60 px-4 py-1.5 text-xs font-medium text-muted-foreground">{relativeDay(date, todayISO())}</p>
              <ul className="divide-y">
                {txs.map((tx) => (
                  <Fragment key={tx.id}>
                    <TransactionRow tx={tx} project={tx.projectId ? projectMap.get(tx.projectId) : undefined} />
                    <li className="flex gap-4 px-4 pb-2 text-xs font-semibold text-primary">
                      <button type="button" onClick={() => setEditing(tx)}>Edit</button>
                      <button type="button" onClick={() => confirmDelete(tx)} className="text-destructive">Delete</button>
                    </li>
                  </Fragment>
                ))}
              </ul>
            </div>
          ))}
        </Panel>

        {/* Desktop table */}
        <Panel className="hidden overflow-hidden md:block">
          {isLoading ? (
            <div className="p-6 space-y-3 animate-pulse">
              <div className="h-10 w-full rounded bg-muted/40" />
              <div className="h-10 w-full rounded bg-muted/40" />
              <div className="h-10 w-full rounded bg-muted/40" />
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              totalCount={transactions.length}
              onResetFilters={handleResetFilters}
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-surface/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Description</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Project</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Method</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {groups.flatMap(([, txs]) =>
                  txs.map((tx) => (
                    <tr key={tx.id} className="transition-colors hover:bg-surface/50">
                      <td className="num whitespace-nowrap px-5 py-3 text-muted-foreground">{formatDay(tx.date)}</td>
                      <td className="px-3 py-3">
                        <p className="flex items-center gap-1.5 font-medium">
                          {tx.party || tx.category}
                          {tx.source === 'voice' ? <Mic className="size-3 text-muted-foreground" aria-label="Recorded by voice" /> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.category}
                          {tx.note && tx.note !== tx.transcript ? ` · ${tx.note}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {tx.projectId ? projectMap.get(tx.projectId)?.name : 'All sites'}
                      </td>
                      <td className="px-3 py-3">
                        <TypeBadge type={tx.type} />
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{methodLabel[tx.method]}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <Amount tx={tx} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold">
                        <button type="button" onClick={() => setEditing(tx)} className="mr-3 text-primary hover:underline">Edit</button>
                        <button type="button" onClick={() => confirmDelete(tx)} className="text-destructive hover:underline">Delete</button>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
      <EditTransactionModal tx={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function EmptyState({
  totalCount,
  onResetFilters,
}: {
  totalCount: number
  onResetFilters: () => void
}) {
  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center sm:p-12">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Mic className="size-6" />
        </span>
        <h3 className="mt-4 text-base font-semibold text-foreground">No transactions recorded yet</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Start recording your client payments, worker wages, and construction expenses with your voice or manual entry.
        </p>
        <ButtonLink href="/voice" variant="primary" className="mt-4 inline-flex items-center gap-2">
          <Mic className="size-4" />
          <span>Record by voice</span>
        </ButtonLink>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center sm:p-12">
      <p className="text-sm font-medium text-foreground">No entries match these filters</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Try clearing your search term, changing type filter, or switching project view.
      </p>
      <button
        type="button"
        onClick={onResetFilters}
        className={cn(buttonClass('outline'), 'mt-4 text-xs')}
      >
        Clear filters
      </button>
    </div>
  )
}
