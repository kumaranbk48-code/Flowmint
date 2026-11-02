import { type Project, type Transaction, type TxType, type Worker } from './data'
import { addDays, todayISO, weekStartISO } from './format'
import { fromPaise, sumRupees, toPaise } from './money'

/**
 * Accounting rules (single source of truth, used by the server AND the client):
 *   credit  = income
 *   debit   = expense + wage (anything that is not income)
 *   balance = opening balance + credits - debits          (never clamped: a negative balance is shown as negative)
 *   cash    = opening cash + cash credits - cash debits   (UPI / bank / cheque never touch physical cash)
 * Every sum is done in integer paise.
 */

export const isCredit = (t: Pick<Transaction, 'type'>) => t.type === 'income'
export const isDebit = (t: Pick<Transaction, 'type'>) => t.type !== 'income'

export function inRange(txs: Transaction[], start: string, end: string) {
  return txs.filter((t) => t.date >= start && t.date <= end)
}

export function total(txs: Transaction[], type?: TxType | TxType[]) {
  const types = type ? (Array.isArray(type) ? type : [type]) : null
  return sumRupees(txs.filter((t) => !types || types.includes(t.type)).map((t) => t.amount))
}

export function isWorkerPayment(tx: Transaction) {
  return tx.type === 'wage' || tx.category === 'Worker Payment' || tx.category === 'Weekly wages'
}

export function summarise(txs: Transaction[]) {
  const received = sumRupees(txs.filter(isCredit).map((t) => t.amount))
  const spent = sumRupees(txs.filter(isDebit).map((t) => t.amount))
  const workerPayments = sumRupees(txs.filter((t) => isDebit(t) && isWorkerPayment(t)).map((t) => t.amount))
  return {
    received,
    spent,
    workerPayments,
    wages: workerPayments,
    materials: fromPaise(toPaise(spent) - toPaise(workerPayments)),
    net: fromPaise(toPaise(received) - toPaise(spent)),
  }
}

export function projectStats(project: Project, txs: Transaction[]) {
  const own = txs.filter((t) => t.projectId === project.id)
  const received = total(own, 'income')
  const spent = total(own, ['expense', 'wage'])
  const workerPayments = sumRupees(own.filter((t) => isDebit(t) && isWorkerPayment(t)).map((t) => t.amount))
  const net = fromPaise(toPaise(received) - toPaise(spent))
  const pendingPaise = toPaise(project.contractValue) - toPaise(received)
  return {
    received,
    spent,
    workerPayments,
    net,
    /** Contract amount still to be collected. The contract value itself is never treated as money received. */
    balanceDue: fromPaise(Math.max(pendingPaise, 0)),
    /** Money received above the contract value (shown instead of silently hiding it). */
    overpaid: fromPaise(Math.max(-pendingPaise, 0)),
    margin: net,
    receivedPct: project.contractValue > 0 ? Math.min(received / project.contractValue, 1) : 0,
  }
}

export function daysWorked(worker: Worker) {
  return worker.attendance.filter(Boolean).length
}

export function workerEarned(worker: Worker) {
  return daysWorked(worker) * worker.dailyRate
}

export function workerDue(worker: Worker) {
  return Math.max(workerEarned(worker) - worker.advance, 0)
}

export function paidThisWeek(worker: Worker, txs: Transaction[], today: string = todayISO()) {
  const start = weekStartISO(today)
  return txs.some((t) => isWorkerPayment(t) && t.workerId === worker.id && t.date >= start && t.date <= today)
}

export function weekRange(start: string) {
  return { start, end: addDays(start, 6) }
}

export function groupByDate(txs: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>()
  for (const tx of txs) {
    const list = map.get(tx.date) ?? []
    list.push(tx)
    map.set(tx.date, list)
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
}

export function timeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return 0
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const meridiem = match[3]?.toUpperCase()
  if (meridiem === 'PM' && hours < 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

/**
 * Deterministic chronological order: date, then clock time, then creation timestamp, then id.
 * Never depends on the order the database or the network happened to return rows in.
 */
export function compareTx(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const dt = timeToMinutes(a.time) - timeToMinutes(b.time)
  if (dt !== 0) return dt
  const ac = a.createdAt ?? ''
  const bc = b.createdAt ?? ''
  if (ac !== bc) return ac < bc ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export type TransactionWithBalance = Transaction & {
  balanceAfter: number
}

export function computeRunningBalances(txs: Transaction[], openingBalance: number = 0): TransactionWithBalance[] {
  const sorted = [...txs].sort(compareTx)
  let runningPaise = toPaise(openingBalance)
  return sorted.map((tx) => {
    runningPaise += isCredit(tx) ? toPaise(tx.amount) : -toPaise(tx.amount)
    return { ...tx, balanceAfter: fromPaise(runningPaise) }
  })
}

export function getFinancialSummary(txs: Transaction[], openingBalance: number = 0, openingCash: number = 0) {
  const creditReceived = sumRupees(txs.filter(isCredit).map((t) => t.amount))
  const debitSpent = sumRupees(txs.filter(isDebit).map((t) => t.amount))
  const netBalance = fromPaise(toPaise(openingBalance) + toPaise(creditReceived) - toPaise(debitSpent))

  const cashIn = sumRupees(txs.filter((t) => isCredit(t) && t.method === 'cash').map((t) => t.amount))
  const cashOut = sumRupees(txs.filter((t) => isDebit(t) && t.method === 'cash').map((t) => t.amount))
  const currentCash = fromPaise(toPaise(openingCash) + toPaise(cashIn) - toPaise(cashOut))

  return { openingBalance, creditReceived, debitSpent, netBalance, currentCash, openingCash }
}

export type ProjectFilter = 'all' | 'none' | string

export function matchesProjectFilter(tx: Transaction, filter: ProjectFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'none') return !tx.projectId
  return tx.projectId === filter
}

/**
 * Opening balance for the start of `date` = opening balance set once at the beginning
 * + every credit - every debit dated BEFORE `date`. This is what makes each day's opening
 * balance equal the previous day's closing balance.
 *
 * A project-specific view has no opening balance of its own (the business opening balance
 * belongs to the business, not to one project), so it starts from 0 and only counts that
 * project's earlier transactions.
 */
export function openingBalanceAt(
  date: string,
  txs: Transaction[],
  openingBalance: number,
  projectFilter: ProjectFilter = 'all',
): number {
  const base = projectFilter === 'all' ? toPaise(openingBalance) : 0
  const earlier = txs.filter((t) => t.date < date && matchesProjectFilter(t, projectFilter))
  const delta = earlier.reduce((acc, t) => acc + (isCredit(t) ? toPaise(t.amount) : -toPaise(t.amount)), 0)
  return fromPaise(base + delta)
}

/** Same carry-forward rule for physical cash (cash-method transactions only). */
export function openingCashAt(
  date: string,
  txs: Transaction[],
  openingCash: number,
  projectFilter: ProjectFilter = 'all',
): number {
  const base = projectFilter === 'all' ? toPaise(openingCash) : 0
  const earlier = txs.filter((t) => t.date < date && t.method === 'cash' && matchesProjectFilter(t, projectFilter))
  const delta = earlier.reduce((acc, t) => acc + (isCredit(t) ? toPaise(t.amount) : -toPaise(t.amount)), 0)
  return fromPaise(base + delta)
}

export type SpendCheck = { ok: true } | { ok: false; reason: 'net' | 'cash'; available: number }

/**
 * The rule for checking whether a debit can be recorded.
 * In a contractor cashbook, real-world expenses and wages must always be recordable
 * even if the balance or cash-in-hand is zero or temporarily overdrawn.
 */
export function checkSpendAllowed(
  _existing: Transaction[],
  _openingBalance: number,
  _openingCash: number,
  _candidate: Pick<Transaction, 'type' | 'amount' | 'method'>,
): SpendCheck {
  return { ok: true }
}
