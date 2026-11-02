import test from 'node:test'
import assert from 'node:assert/strict'
import type { PayMethod, Project, Transaction, TxType } from '../lib/data'
import {
  checkSpendAllowed,
  computeRunningBalances,
  getFinancialSummary,
  openingBalanceAt,
  openingCashAt,
  projectStats,
  summarise,
} from '../lib/ledger'
import { sumRupees } from '../lib/money'
import { isoInIST, todayISO, weekStartISO } from '../lib/format'

let n = 0
const tx = (type: TxType, amount: number, date = '2026-10-30', method: PayMethod = 'cash', extra: Partial<Transaction> = {}): Transaction => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  type,
  amount,
  date,
  category: type === 'income' ? 'Client Payment' : 'Other',
  party: '',
  method,
  source: 'manual',
  projectId: null,
  ...extra,
})

test('matrix 1-3: balance = opening + credits - debits (wage is a debit)', () => {
  assert.equal(getFinancialSummary([tx('income', 5000), tx('expense', 2000)], 10000, 0).netBalance, 13000)
  assert.equal(getFinancialSummary([tx('income', 10000), tx('wage', 4000)], 0, 0).netBalance, 6000)
  const s = getFinancialSummary([tx('income', 10000), tx('expense', 3000), tx('wage', 2000)], 20000, 0)
  assert.equal(s.netBalance, 25000)
  assert.equal(s.creditReceived, 10000)
  assert.equal(s.debitSpent, 5000)
})

test('spec section 4: 20,000 + 15,000 credits - 6,000 debits = 29,000', () => {
  const txs = [tx('income', 10000), tx('income', 5000), tx('expense', 3000), tx('wage', 2000), tx('expense', 1000)]
  assert.equal(getFinancialSummary(txs, 20000, 0).netBalance, 29000)
})

test('matrix 4-6: only cash transactions move physical cash', () => {
  assert.equal(getFinancialSummary([tx('income', 5000, '2026-10-30', 'upi')], 10000, 10000).currentCash, 10000)
  assert.equal(getFinancialSummary([tx('income', 5000, '2026-10-30', 'upi')], 10000, 10000).netBalance, 15000)
  assert.equal(getFinancialSummary([tx('income', 5000), tx('expense', 2000)], 10000, 10000).currentCash, 13000)
  assert.equal(getFinancialSummary([tx('expense', 2000, '2026-10-30', 'upi')], 10000, 10000).currentCash, 10000)
})

test('opening balance alone is the balance (not doubled)', () => {
  const s = getFinancialSummary([], 50000, 50000)
  assert.equal(s.netBalance, 50000)
})

test('balances are NOT clamped at zero: an overdrawn ledger shows the real negative number', () => {
  const s = getFinancialSummary([tx('expense', 3000)], 1000, 1000)
  assert.equal(s.netBalance, -2000)
  assert.equal(s.currentCash, -2000)
  const running = computeRunningBalances([tx('expense', 3000), tx('income', 500, '2026-10-31')], 1000)
  assert.deepEqual(running.map((r) => r.balanceAfter), [-2000, -1500])
  assert.equal(summarise([tx('expense', 3000)]).net, -3000)
})

test('CARRY-FORWARD: each day opens with the previous day closing balance', () => {
  // opening 10,000; 30 Oct income 5,000; 31 Oct expense 2,000
  const txs = [tx('income', 5000, '2026-10-30'), tx('expense', 2000, '2026-10-31')]
  assert.equal(openingBalanceAt('2026-10-30', txs, 10000), 10000)
  assert.equal(openingBalanceAt('2026-10-31', txs, 10000), 15000)
  assert.equal(openingBalanceAt('2026-11-01', txs, 10000), 13000) // dashboard on 1 Nov
  // closing(day) === opening(next day)
  const day31 = txs.filter((t) => t.date === '2026-10-31')
  const closing31 = getFinancialSummary(day31, openingBalanceAt('2026-10-31', txs, 10000), 0).netBalance
  assert.equal(closing31, openingBalanceAt('2026-11-01', txs, 10000))
})

test('carry-forward for cash ignores non-cash days', () => {
  const txs = [tx('income', 5000, '2026-10-30', 'upi'), tx('expense', 1000, '2026-10-30', 'cash')]
  assert.equal(openingCashAt('2026-10-31', txs, 10000), 9000)
  assert.equal(openingBalanceAt('2026-10-31', txs, 10000), 14000)
})

test('project view: starts from 0, never includes the business opening balance or another project', () => {
  const A = '11111111-1111-4111-8111-111111111111'
  const B = '22222222-2222-4222-8222-222222222222'
  const txs = [
    tx('income', 100000, '2026-10-30', 'upi', { projectId: A }),
    tx('expense', 20000, '2026-10-30', 'cash', { projectId: A }),
    tx('income', 50000, '2026-10-30', 'upi', { projectId: B }),
    tx('expense', 10000, '2026-10-31', 'cash', { projectId: B }),
  ]
  assert.equal(openingBalanceAt('2026-11-01', txs, 50000, A), 80000)
  assert.equal(openingBalanceAt('2026-11-01', txs, 50000, B), 40000)
  assert.equal(openingBalanceAt('2026-11-01', txs, 50000, 'all'), 50000 + 80000 + 40000)
  const projA = projectStats({ id: A, name: 'A', client: 'c', contractValue: 500000, startDate: '2026-01-01', status: 'active' } as Project, txs)
  assert.equal(projA.received, 100000)
  assert.equal(projA.net, 80000)
})

test('contract amount is never money received: pending = contract - received', () => {
  const A = '11111111-1111-4111-8111-111111111111'
  const p = { id: A, name: 'A', client: 'c', contractValue: 1000000, startDate: '2026-01-01', status: 'active' } as Project
  const s = projectStats(p, [tx('income', 300000, '2026-10-30', 'bank', { projectId: A })])
  assert.equal(s.received, 300000)
  assert.equal(s.balanceDue, 700000)
  assert.equal(s.overpaid, 0)
  // overpayment is reported, not hidden
  assert.equal(projectStats(p, [tx('income', 1200000, '2026-10-30', 'bank', { projectId: A })]).overpaid, 200000)
  // zero contract value never produces NaN / Infinity
  const zero = projectStats({ ...p, contractValue: 0 }, [tx('income', 1000, '2026-10-30', 'bank', { projectId: A })])
  assert.equal(zero.receivedPct, 0)
  assert.ok(Number.isFinite(zero.receivedPct))
})

test('worker payments are debits, are counted as worker payments, and never as income', () => {
  const s = summarise([tx('income', 20000), tx('wage', 5000)])
  assert.equal(s.received, 20000)
  assert.equal(s.spent, 5000)
  assert.equal(s.workerPayments, 5000)
  assert.equal(s.net, 15000)
  // legacy rows: an expense categorised 'Worker Payment' still counts as a worker payment
  assert.equal(summarise([tx('expense', 700, '2026-10-30', 'cash', { category: 'Worker Payment' })]).workerPayments, 700)
})

test('money is summed in integer paise: no floating-point drift', () => {
  assert.equal(0.1 + 0.2 === 0.3, false) // the underlying JS problem
  assert.equal(sumRupees([0.1, 0.2]), 0.3)
  assert.equal(sumRupees([0.1, 0.2, 0.3]), 0.6)
  assert.equal(sumRupees([1000.1, 2000.2, 3000.3]), 6000.6)
  const s = getFinancialSummary([tx('income', 0.1), tx('income', 0.2)], 0, 0)
  assert.equal(s.creditReceived, 0.3)
})

test('running balance order is deterministic, whatever order the rows arrive in', () => {
  const a = tx('expense', 100, '2026-10-30', 'cash', { time: '10:15 AM', createdAt: '2026-10-30T04:45:01.000Z' })
  const b = tx('income', 500, '2026-10-30', 'cash', { time: '10:15 AM', createdAt: '2026-10-30T04:45:02.000Z' })
  const c = tx('expense', 50, '2026-10-30', 'cash', { time: '9:00 AM', createdAt: '2026-10-30T03:30:00.000Z' })
  const expected = computeRunningBalances([a, b, c], 1000).map((r) => r.id)
  for (const perm of [[a, b, c], [c, b, a], [b, a, c], [b, c, a]]) {
    assert.deepEqual(computeRunningBalances(perm, 1000).map((r) => r.id), expected)
  }
  assert.deepEqual(expected, [c.id, a.id, b.id]) // 9:00, then the two 10:15 entries by creation order
  // identical timestamps still order deterministically (by id)
  const x = tx('expense', 1, '2026-10-30', 'cash', { time: '10:00 AM', createdAt: 'T' })
  const y = tx('expense', 2, '2026-10-30', 'cash', { time: '10:00 AM', createdAt: 'T' })
  assert.deepEqual(computeRunningBalances([y, x], 100).map((r) => r.id), computeRunningBalances([x, y], 100).map((r) => r.id))
})

test('spend rule: allows recording expenses so contractors are never blocked', () => {
  const existing = [tx('income', 5000, '2026-10-30', 'upi')]
  // opening 1000 (all cash), UPI income 5000 => balance 6000, cash 1000
  assert.deepEqual(checkSpendAllowed(existing, 1000, 1000, { type: 'expense', amount: 6000, method: 'upi' }), { ok: true })
  const cash = checkSpendAllowed(existing, 1000, 1000, { type: 'expense', amount: 2000, method: 'cash' })
  assert.equal(cash.ok, true)
  const net = checkSpendAllowed(existing, 1000, 1000, { type: 'wage', amount: 6000.01, method: 'bank' })
  assert.equal(net.ok, true)
  assert.deepEqual(checkSpendAllowed(existing, 1000, 1000, { type: 'income', amount: 999999, method: 'cash' }), { ok: true })
})

test('dates are India time, never UTC', () => {
  // 31 Oct 2026 23:59:59 IST = 18:29:59 UTC the same day; 1 Nov 00:00:00 IST = 18:30:00 UTC on 31 Oct
  assert.equal(isoInIST(new Date('2026-10-31T18:29:59Z')), '2026-10-31')
  assert.equal(isoInIST(new Date('2026-10-31T18:30:00Z')), '2026-11-01')
  assert.equal(todayISO(new Date('2026-12-31T18:30:00Z')), '2027-01-01') // year boundary
  assert.equal(todayISO(new Date('2026-11-01T02:00:00Z')), '2026-11-01') // 07:30 IST
  assert.equal(weekStartISO('2026-11-01'), '2026-10-26') // Sunday -> Monday of that week
})
