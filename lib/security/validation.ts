/**
 * Input sanitization and validation helpers for FlowMint.
 */

export const ALLOWED_TX_TYPES = ['income', 'expense', 'wage'] as const
export type ValidTxType = (typeof ALLOWED_TX_TYPES)[number]

const ALLOWED_PAY_METHODS = ['cash', 'upi', 'bank', 'cheque'] as const
export type ValidPayMethod = (typeof ALLOWED_PAY_METHODS)[number]

/**
 * Sanitizes user-provided string inputs:
 * - Strips HTML/XML script tags
 * - Removes non-printable control characters
 * - Trims leading/trailing whitespace
 * - Clamps string to max allowable length
 */
export function sanitizeString(val: unknown, maxLen = 255): string {
  if (typeof val !== 'string') return ''
  return val
    .replace(/<[^>]*>?/gm, '') // Remove HTML tags
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Strip control characters
    .trim()
    .slice(0, maxLen)
}

export const MAX_AMOUNT = 1_000_000_000
const MONEY_STRING = /^\d{1,10}(\.\d{1,2})?$/

export type AmountResult = { valid: boolean; amount: number; error?: string }

/**
 * Strict money validation (server is authoritative):
 * - a finite number, or a plain decimal string such as "100" / "100.50" (no commas, no units,
 *   no exponent, no trailing text: "100abc", "12,000", "1e3" are all rejected)
 * - at most 2 decimal places (no silent rounding), at least 0.01, at most MAX_AMOUNT
 * - allowZero is only for fields like a contract value where 0 is meaningful
 */
export function validateAmount(val: unknown, opts: { allowZero?: boolean } = {}): AmountResult {
  let num: number
  if (typeof val === 'number') {
    num = val
  } else if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!MONEY_STRING.test(trimmed)) return { valid: false, amount: 0, error: 'Amount must be a plain number such as 1500 or 1500.50' }
    num = Number(trimmed)
  } else {
    return { valid: false, amount: 0, error: 'Amount is required' }
  }
  if (!Number.isFinite(num)) return { valid: false, amount: 0, error: 'Amount must be a finite number' }
  if (num < 0) return { valid: false, amount: 0, error: 'Amount cannot be negative' }
  if (num === 0) {
    return opts.allowZero ? { valid: true, amount: 0 } : { valid: false, amount: 0, error: 'Amount must be greater than zero' }
  }
  if (num > MAX_AMOUNT) return { valid: false, amount: 0, error: 'Amount is too large' }
  const paise = Math.round(num * 100)
  if (Math.abs(num * 100 - paise) > 1e-6) return { valid: false, amount: 0, error: 'Amount can have at most 2 decimal places' }
  if (paise < 1) return { valid: false, amount: 0, error: 'Amount must be at least 0.01' }
  return { valid: true, amount: paise / 100 }
}

/** Opening balance / opening cash: same strictness, zero and negatives allowed. */
export function validateOpeningBalance(val: unknown): { valid: boolean; balance: number } {
  let num: number
  if (typeof val === 'number') num = val
  else if (typeof val === 'string' && /^-?\d{1,10}(\.\d{1,2})?$/.test(val.trim())) num = Number(val.trim())
  else return { valid: false, balance: 0 }
  if (!Number.isFinite(num) || Math.abs(num) > MAX_AMOUNT) return { valid: false, balance: 0 }
  const paise = Math.round(num * 100)
  if (Math.abs(num * 100 - paise) > 1e-6) return { valid: false, balance: 0 }
  return { valid: true, balance: paise / 100 }
}

export function validateTxType(val: unknown): ValidTxType | null {
  if (typeof val !== 'string') return null
  return (ALLOWED_TX_TYPES as readonly string[]).includes(val) ? (val as ValidTxType) : null
}

export function validatePayMethod(val: unknown): ValidPayMethod | null {
  if (typeof val !== 'string') return null
  const normalised = val.trim().toLowerCase()
  return (ALLOWED_PAY_METHODS as readonly string[]).includes(normalised) ? (normalised as ValidPayMethod) : null
}

export function validateSource(val: unknown): 'voice' | 'manual' | null {
  return val === 'voice' || val === 'manual' ? val : null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validateUuid(val: unknown): string | null {
  return typeof val === 'string' && UUID_RE.test(val) ? val.toLowerCase() : null
}

/**
 * Strict calendar date YYYY-MM-DD: must be a real date (2026-02-30 is rejected) between
 * 2000-01-01 and 2100-12-31.
 */
export function validateIsoDate(val: unknown): string | null {
  if (typeof val !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 2000 || y > 2100) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return val
}

/** A transaction date must be a real date and not more than one day ahead of `today` (IST slack). */
export function validateTxDate(val: unknown, today: string): string | null {
  const iso = validateIsoDate(val)
  if (!iso) return null
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + 1)
  return iso <= limit.toISOString().slice(0, 10) ? iso : null
}

/** An ISO timestamp the client may supply as created_at: within the last 90 days, at most 5 minutes ahead. */
export function validateCreatedAt(val: unknown, now: Date = new Date()): string | null {
  if (typeof val !== 'string') return null
  const t = Date.parse(val)
  if (!Number.isFinite(t)) return null
  if (t > now.getTime() + 5 * 60_000) return null
  if (t < now.getTime() - 90 * 86_400_000) return null
  return new Date(t).toISOString()
}

/**
 * Validates audio file uploads.
 */
export function validateAudioUpload(
  file: unknown,
  maxSizeBytes = 10 * 1024 * 1024,
): { valid: boolean; error?: string } {
  if (!file || !(file instanceof Blob)) {
    return { valid: false, error: 'No audio file provided.' }
  }
  if (file.size <= 0) {
    return { valid: false, error: 'Audio file is empty.' }
  }
  if (file.size > maxSizeBytes) {
    return { valid: false, error: 'Audio recording exceeds 10MB limit.' }
  }
  const mime = file.type?.toLowerCase() || ''
  if (mime && !mime.startsWith('audio/') && mime !== 'application/octet-stream') {
    return { valid: false, error: 'Invalid file format. Only audio recordings are supported.' }
  }
  return { valid: true }
}

