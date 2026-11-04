import { supabase } from '@/lib/supabase'
import { todayDubai } from '@/lib/dubaiTime'
/**
 * One invoice-number scheme for the whole app (AUD-36): SAF-<year>-<4-digit sequence>,
 * e.g. SAF-2026-0001. UAE tax invoices need a unique, sequential number.
 */
const pattern = (year: number) => new RegExp(`^SAF-${year}-(\\d+)$`)

export function nextInvoiceNumber(existing: Array<{ invoice_number?: string } | string>, date?: Date): string {
  const year = date ? date.getFullYear() : Number(todayDubai().slice(0, 4)) // INV-A02: the Dubai year
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

/**
 * INV-A01: two users (or two tabs) creating an invoice at the same moment used to get the same number,
 * because each counted only the invoices in its own browser. Before saving, the numbers already in
 * Supabase are read and the next free one is taken. Offline: the local number is kept.
 */
export async function reserveInvoiceNumber(proposed: string, local: Array<{ invoice_number?: string }>): Promise<string> {
  const year = proposed.match(/^SAF-(d{4})-/)?.[1] || todayDubai().slice(0, 4)
  try {
    const { data, error } = await supabase.from('invoices').select('invoice_number').like('invoice_number', `SAF-${year}-%`)
    if (error || !data) return proposed
    const taken = new Set([...data.map(r => (r as { invoice_number: string }).invoice_number), ...local.map(i => i.invoice_number || '')])
    if (!taken.has(proposed)) return proposed
    return nextInvoiceNumber([...taken].map(n => ({ invoice_number: n })), new Date(Number(year), 5, 1))
  } catch {
    return proposed
  }
}
