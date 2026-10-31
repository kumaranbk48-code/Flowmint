/**
 * Input sanitization and validation helpers for FlowMint.
 */

const ALLOWED_TX_TYPES = ['income', 'expense'] as const
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

/**
 * Validates financial transaction amounts:
 * - Must be a finite number
 * - Must be strictly positive
 * - Must not exceed a sane ceiling (e.g. ₹100 Crores)
 */
export function validateAmount(val: unknown): { valid: boolean; amount: number; error?: string } {
  const num = typeof val === 'number' ? val : parseFloat(String(val))
  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, amount: 0, error: 'Amount must be a valid number.' }
  }
  if (num <= 0) {
    return { valid: false, amount: 0, error: 'Amount must be greater than zero.' }
  }
  if (num > 1_000_000_000) {
    return { valid: false, amount: 0, error: 'Amount exceeds maximum allowable threshold.' }
  }
  return { valid: true, amount: Math.round(num * 100) / 100 }
}

/**
 * Validates opening balances (can be 0 or positive).
 */
export function validateOpeningBalance(val: unknown): { valid: boolean; balance: number } {
  const num = typeof val === 'number' ? val : parseFloat(String(val))
  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, balance: 0 }
  }
  if (num < -100_000_000 || num > 1_000_000_000) {
    return { valid: false, balance: 0 }
  }
  return { valid: true, balance: Math.round(num * 100) / 100 }
}

/**
 * Validates transaction type.
 */
export function validateTxType(val: unknown): ValidTxType | null {
  if (typeof val !== 'string') return null
  const lower = val.toLowerCase().trim()
  if (lower === 'income' || lower === 'expense') {
    return lower
  }
  return null
}

/**
 * Validates payment method.
 */
export function validatePayMethod(val: unknown): ValidPayMethod | null {
  if (typeof val !== 'string') return null
  const lower = val.toLowerCase().trim()
  if (ALLOWED_PAY_METHODS.includes(lower as ValidPayMethod)) {
    return lower as ValidPayMethod
  }
  return null
}

/**
 * Validates ISO date format YYYY-MM-DD.
 */
export function validateIsoDate(val: unknown): string | null {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? null : trimmed
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

