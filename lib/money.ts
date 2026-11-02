/**
 * Money helpers. All arithmetic on rupee amounts goes through integer paise so that
 * 0.1 + 0.2 style float drift can never change a total.
 */

export function toPaise(amount: number): number {
  return Math.round(amount * 100)
}

export function fromPaise(paise: number): number {
  return paise / 100
}

/** Exact sum of rupee amounts (each amount is rounded to whole paise first). */
export function sumRupees(values: number[]): number {
  let paise = 0
  for (const v of values) paise += toPaise(v)
  return fromPaise(paise)
}

/**
 * Neutralises spreadsheet formula injection and quotes a CSV cell.
 * A cell starting with = + - @ tab or CR is prefixed with an apostrophe.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Parses what a person types into an amount field. Indian digit grouping is accepted ("12,000", "1,50,000", "₹500"),
 * anything else is rejected instead of being half-read: "100abc", "1e3", "1.2.3", "12 000" all return null.
 */
export function parseMoneyInput(raw: string): number | null {
  const text = raw.trim()
  if (!/^₹?\s*\d[\d,]*(\.\d{1,2})?$/.test(text)) return null
  const num = Number(text.replace(/[₹,\s]/g, ''))
  return Number.isFinite(num) ? num : null
}
