const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function formatMoney(value: number) {
  return currency.format(value)
}

export function formatSigned(value: number, type: 'income' | 'expense' | 'wage') {
  return `${type === 'income' ? '+' : '−'}${currency.format(Math.abs(value))}`
}

export function formatCompact(value: number) {
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)}L`
  if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
  return `₹${value}`
}

/**
 * FlowMint is an India-first app: every "today" / "yesterday" / report boundary is computed
 * in Indian Standard Time, never in the server's or the browser's timezone, and never cached
 * at module load (a long-lived server or an app left open past midnight would go stale).
 */
export const APP_TIMEZONE = 'Asia/Kolkata'

const istDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const istTimeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** YYYY-MM-DD for the given instant, as seen in IST. */
export function isoInIST(date: Date): string {
  return istDateFormat.format(date)
}

/** Today's date in IST. Call it at use time; never store it in a module-level constant. */
export function todayISO(now: Date = new Date()): string {
  return isoInIST(now)
}

/** Clock time such as '10:15 AM', in IST. */
export function timeLabelIST(now: Date = new Date()): string {
  return istTimeFormat.format(now).replace(/\u202f/g, ' ').toUpperCase()
}

/** Monday of the week containing `today`. */
export function weekStartISO(today: string = todayISO()): string {
  const dow = (parseDate(today).getDay() + 6) % 7
  return addDays(today, -dow)
}

export function parseDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso: string, days: number) {
  const date = parseDate(iso)
  date.setDate(date.getDate() + days)
  return toISO(date)
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return parseDate(iso).toLocaleDateString('en-IN', opts)
}

export function formatLongDate(iso: string) {
  return parseDate(iso).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function relativeDay(iso: string, today: string) {
  if (iso === today) return 'Today'
  if (iso === addDays(today, -1)) return 'Yesterday'
  return parseDate(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const methodLabel: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  cheque: 'Cheque',
}

export const typeLabel = {
  income: 'Received',
  expense: 'Expense',
  wage: 'Wages',
} as const
