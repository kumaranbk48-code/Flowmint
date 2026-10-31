import { addDays, toISO } from './format'

export type TxType = 'income' | 'expense' | 'wage'
export type PayMethod = 'cash' | 'upi' | 'bank' | 'cheque'

export type Transaction = {
  id: string
  type: TxType // 'income' = Credit, 'expense'/'wage' = Debit
  amount: number
  date: string
  time?: string // e.g. '10:15 AM'
  description?: string
  projectId: string | null
  workerId?: string | null
  category: string
  party: string
  note?: string
  method: PayMethod
  source: 'voice' | 'manual'
  transcript?: string
}

export type Project = {
  id: string
  name: string
  client: string
  contractValue: number
  startDate: string
  expectedCompletionDate?: string
  location?: string
  stage?: string
  status?: 'active' | 'completed' | 'on-hold'
  receivedBefore?: number
  spentBefore?: number
}

export type Worker = {
  id: string
  name: string
  role: string
  phone: string
  dailyRate: number
  projectId: string
  /** Mon → Sat for the current week. null = day not reached yet */
  attendance: (boolean | null)[]
  advance: number
}

/** Local dynamic date for today */
export const TODAY = toISO(new Date())
export const WEEK_START = addDays(TODAY, -((new Date().getDay() + 6) % 7))
export const PAYDAY = addDays(WEEK_START, 5)

export const DEFAULT_OPENING_BALANCE = 1000
export const DEFAULT_OPENING_CASH = 1000

export const EXPENSE_CATEGORIES = [
  'Client Payment',
  'Worker Payment',
  'Cement',
  'Sand & aggregate',
  'Steel',
  'Bricks & blocks',
  'Tiles & finishes',
  'Electrical',
  'Plumbing',
  'Fuel',
  'Food & tea',
  'Transport',
  'Equipment rent',
  'Tools',
  'Other',
] as const

/** Initial live data is clean and empty; data is populated dynamically by the contractor. */
export const projects: Project[] = []
export const workers: Worker[] = []
