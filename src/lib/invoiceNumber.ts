/**
 * One invoice-number scheme for the whole app (AUD-36): SAF-<year>-<4-digit sequence>,
 * e.g. SAF-2026-0001. UAE tax invoices need a unique, sequential number.
 */
const pattern = (year: number) => new RegExp(`^SAF-${year}-(\\d+)$`)

export function nextInvoiceNumber(existing: Array<{ invoice_number?: string } | string>, date = new Date()): string {
  const year = date.getFullYear()
  const re = pattern(year)
  const max = existing.reduce((m, item) => {
    const n = typeof item === 'string' ? item : item.invoice_number || ''
    const hit = n.match(re)
    return hit ? Math.max(m, Number(hit[1])) : m
  }, 0)
  return `SAF-${year}-${String(max + 1).padStart(4, '0')}`
}

/** Keep a proposed number only if it follows the scheme and is not taken */
export function ensureInvoiceNumber(proposed: string | undefined, existing: Array<{ invoice_number?: string }>): string {
  const taken = new Set(existing.map(i => i.invoice_number))
  if (proposed && /^SAF-\d{4}-\d+$/.test(proposed) && !taken.has(proposed)) return proposed
  return nextInvoiceNumber(existing)
}
