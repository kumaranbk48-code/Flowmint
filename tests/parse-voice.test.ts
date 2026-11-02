import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSpokenAmount, parseVoiceEntry } from '../lib/parse-voice'
import { addDays, todayISO } from '../lib/format'
import type { Project } from '../lib/data'

const proj = (id: string, name: string, client: string): Project =>
  ({ id, name, client, contractValue: 100000, startDate: '2026-01-01', status: 'active' }) as Project
const sharma = [
  proj('1', 'Sharma Residence', 'Rakesh Sharma'),
  proj('2', 'Sharma Office', 'Rakesh Sharma'),
  proj('3', 'Sharma Warehouse', 'Rakesh Sharma'),
]

test('spec section 25 amounts', () => {
  assert.equal(parseSpokenAmount('Received ten thousand'), 10000)
  assert.equal(parseSpokenAmount('Received 10,000'), 10000)
  assert.equal(parseSpokenAmount('Received ten thousand rupees'), 10000)
  assert.equal(parseSpokenAmount('Paid 4.5k for cement'), 4500)
  assert.equal(parseSpokenAmount('Paid ₹4,500 for cement'), 4500)
  assert.equal(parseSpokenAmount('Paid five thousand to workers'), 5000)
  assert.equal(parseSpokenAmount('Received 1 lakh from client'), 100000)
  assert.equal(parseSpokenAmount('Received 1.5 lakh'), 150000)
  assert.equal(parseSpokenAmount('Spent 2500'), 2500)
  assert.equal(parseSpokenAmount('Received nothing'), null)
})

test('a hedged amount is never recorded: "around five thousand" must be stated exactly', () => {
  for (const phrase of ['Paid around five thousand', 'Paid approximately 5000 for cement', 'Paid about 4500 to workers', 'Received maybe 10000']) {
    const p = parseVoiceEntry(phrase, [])
    assert.equal(p.amount, null, phrase)
    assert.equal(p.amountUncertain, true, phrase)
    assert.ok(p.missingFields.includes('amount'), phrase)
  }
  assert.equal(parseVoiceEntry('Paid 5000 for cement', []).amount, 5000)
})

test('worker payment vs income classification', () => {
  const w = parseVoiceEntry('Paid 8,000 to workers', [])
  assert.equal(w.type, 'expense')
  assert.equal(w.category, 'Worker Payment')
  assert.equal(w.amount, 8000)
  assert.equal(parseVoiceEntry('Received 10,000 from Sharma Residence by upi', sharma).type, 'income')
})

test('ambiguous project: never silently picks one of several matches', () => {
  const byClient = parseVoiceEntry('Received 20000 from Rakesh Sharma', sharma)
  assert.equal(byClient.projectId, null)
  assert.equal(byClient.missingProject, true)
  assert.deepEqual(byClient.ambiguousProjectIds?.sort(), ['1', '2', '3'])

  const partial = parseVoiceEntry('Received 20000 from Sharma', sharma)
  assert.equal(partial.projectId, null)
  assert.equal(partial.missingProject, true)
})

test('exact project name still matches, including when one name contains another', () => {
  const exact = parseVoiceEntry('Received 10000 from Sharma Residence', sharma)
  assert.equal(exact.projectId, '1')
  const nested = [proj('a', 'Sharma', 'S'), proj('b', 'Sharma Residence', 'S')]
  assert.equal(parseVoiceEntry('Received 10000 from Sharma Residence', nested).projectId, 'b')
})

test("'yesterday' and 'day before yesterday' use India dates and the right order", () => {
  const today = todayISO()
  assert.equal(parseVoiceEntry('Paid 5000 yesterday for cement', []).date, addDays(today, -1))
  assert.equal(parseVoiceEntry('Paid 5000 day before yesterday for cement', []).date, addDays(today, -2))
  assert.equal(parseVoiceEntry('Paid 5000 for cement', []).date, null)
})

test('payment method is never assumed', () => {
  assert.equal(parseVoiceEntry('Paid 5000 for cement', []).method, null)
  assert.equal(parseVoiceEntry('Paid 5000 for cement by upi', []).method, 'upi')
})
