import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAmount, validateIsoDate, validateTxDate, validateOpeningBalance, validateTxType } from '../lib/security/validation'
import { csvCell, parseMoneyInput } from '../lib/money'

test('amounts: accepted values', () => {
  for (const [input, expected] of [[100, 100], [100.5, 100.5], ['100', 100], ['100.50', 100.5], [5000, 5000], ['0.01', 0.01]] as const) {
    const r = validateAmount(input)
    assert.equal(r.valid, true, String(input))
    assert.equal(r.amount, expected)
  }
})

test('amounts: every malformed value from the spec is rejected', () => {
  const bad: unknown[] = [0, -100, '-100', NaN, Infinity, -Infinity, '', '   ', null, undefined, '100abc', '12,000', '1e3', '0x10', 'abc', '₹500', 1e12, 0.004, 5000.999, '1.234', {}, [], true]
  for (const v of bad) assert.equal(validateAmount(v).valid, false, `should reject ${String(v)}`)
})

test('amounts: zero is only allowed when explicitly requested (contract value)', () => {
  assert.equal(validateAmount(0).valid, false)
  assert.equal(validateAmount(0, { allowZero: true }).valid, true)
  assert.equal(validateAmount(-1, { allowZero: true }).valid, false)
})

test('opening balance: strict format, negatives allowed, bounds enforced', () => {
  assert.deepEqual(validateOpeningBalance('50000'), { valid: true, balance: 50000 })
  assert.equal(validateOpeningBalance('12,000').valid, false)
  assert.equal(validateOpeningBalance('100abc').valid, false)
  assert.equal(validateOpeningBalance(NaN).valid, false)
  assert.equal(validateOpeningBalance(1e12).valid, false)
})

test('dates: impossible calendar dates are rejected', () => {
  assert.equal(validateIsoDate('2026-02-30'), null)
  assert.equal(validateIsoDate('2026-02-31'), null)
  assert.equal(validateIsoDate('2026-13-01'), null)
  assert.equal(validateIsoDate('0000-01-01'), null)
  assert.equal(validateIsoDate('9999-12-31'), null)
  assert.equal(validateIsoDate('2026-1-1'), null)
  assert.equal(validateIsoDate('2024-02-29'), '2024-02-29') // leap day
  assert.equal(validateIsoDate('2026-10-31'), '2026-10-31')
})

test('dates: a transaction may not be more than one day in the future', () => {
  assert.equal(validateTxDate('2026-11-02', '2026-11-02'), '2026-11-02')
  assert.equal(validateTxDate('2026-11-03', '2026-11-02'), '2026-11-03') // IST slack
  assert.equal(validateTxDate('2026-11-04', '2026-11-02'), null)
})

test("types: 'wage' is a valid transaction type", () => {
  assert.equal(validateTxType('wage'), 'wage')
  assert.equal(validateTxType('transfer'), null)
})

test('csv cells neutralise spreadsheet formulas and escape quotes', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`)
  assert.equal(csvCell('+1+1'), `"'+1+1"`)
  assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`)
  assert.equal(csvCell('cement, 50 bags'), '"cement, 50 bags"')
})

test('typed amount fields: Indian grouping accepted, half-readable text rejected (no 100abc -> 100)', () => {
  assert.equal(parseMoneyInput('12,000'), 12000)
  assert.equal(parseMoneyInput('1,50,000'), 150000)
  assert.equal(parseMoneyInput('₹500'), 500)
  assert.equal(parseMoneyInput(' 4500.50 '), 4500.5)
  for (const bad of ['100abc', 'abc', '', '1e3', '1.2.3', '12 000', '-5', '1.234', '₹', ',5']) {
    assert.equal(parseMoneyInput(bad), null, `should reject "${bad}"`)
  }
})
