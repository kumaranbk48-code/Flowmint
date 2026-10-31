import { PAYDAY, WEEK_START, type Project, type Transaction, type TxType, type Worker } from './data'
import { addDays } from './format'

export function inRange(txs: Transaction[], start: string, end: string) {
  return txs.filter((t) => t.date >= start && t.date <= end)
}

export function total(txs: Transaction[], type?: TxType | TxType[]) {
  const types = type ? (Array.isArray(type) ? type : [type]) : null
  return txs.filter((t) => !types || types.includes(t.type)).reduce((sum, t) => sum + t.amount, 0)
}

export function isWorkerPayment(tx: Transaction) {
  return tx.category === 'Worker Payment' || tx.category === 'Weekly wages' || tx.type === 'wage'
}

export function summarise(txs: Transaction[]) {
  const received = txs.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const spent = txs.filter((t) => t.type !== 'income').reduce((sum, t) => sum + t.amount, 0)
  const workerPayments = txs.filter((t) => isWorkerPayment(t)).reduce((sum, t) => sum + t.amount, 0)
  const net = Math.max(0, received - spent)
  return {
    received,
    spent,
    workerPayments,
    wages: workerPayments,
    materials: Math.max(0, spent - workerPayments),
    net,
  }
}

export function projectStats(project: Project, txs: Transaction[]) {
  const own = txs.filter((t) => t.projectId === project.id)
  const received = total(own, 'income')
  const spent = total(own, ['expense', 'wage'])
  const workerPayments = own.filter((t) => isWorkerPayment(t)).reduce((sum, t) => sum + t.amount, 0)
  const net = received - spent
  return {
    received,
    spent,
    workerPayments,
    net,
    balanceDue: Math.max(project.contractValue - received, 0),
    margin: net,
    receivedPct: Math.min(received / project.contractValue, 1),
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

export function paidThisWeek(worker: Worker, txs: Transaction[]) {
  return txs.some((t) => isWorkerPayment(t) && t.workerId === worker.id && t.date >= WEEK_START && t.date <= PAYDAY)
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

export type TransactionWithBalance = Transaction & {
  balanceAfter: number
}

export function computeRunningBalances(
  txs: Transaction[],
  openingBalance: number = 0,
): TransactionWithBalance[] {
  // Sort chronologically (oldest to newest)
  const sorted = [...txs].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return timeToMinutes(a.time) - timeToMinutes(b.time)
  })

  let running = openingBalance
  return sorted.map((tx) => {
    if (tx.type === 'income') {
      running += tx.amount
    } else {
      running -= tx.amount
    }
    return {
      ...tx,
      balanceAfter: Math.max(0, running),
    }
  })
}

export function getFinancialSummary(
  txs: Transaction[],
  openingBalance: number = 0,
  openingCash: number = 0,
) {
  const creditReceived = txs
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  const debitSpent = txs
    .filter((t) => t.type !== 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  const netBalance = Math.max(0, openingBalance + creditReceived - debitSpent)

  // Cash on hand
  const cashIn = txs
    .filter((t) => t.type === 'income' && t.method === 'cash')
    .reduce((sum, t) => sum + t.amount, 0)
  const cashOut = txs
    .filter((t) => t.type !== 'income' && t.method === 'cash')
    .reduce((sum, t) => sum + t.amount, 0)

  const currentCash = Math.max(0, openingCash + cashIn - cashOut)

  return {
    openingBalance,
    creditReceived,
    debitSpent,
    netBalance,
    currentCash,
    openingCash,
  }
}
