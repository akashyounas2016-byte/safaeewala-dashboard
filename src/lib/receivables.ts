import type { Invoice } from '@/types'

/**
 * Shared receivables helpers (UX-08, UX-09, UX-17, UX-18).
 */

/** Amount still owed on an invoice (partial payments via amount_paid) */
/**
 * R-FIN-14: an invoice's totals after its lines changed (Invoices → Edit / Delete a line). A percentage discount
 * follows the new gross; a fixed one stays; VAT at the invoice's rate.
 */
export function recalcInvoiceTotals(inv: Pick<Invoice, 'line_items' | 'discount_type' | 'discount_value' | 'discount_amount' | 'vat_rate'>): { subtotal: number; discount_amount: number; vat_amount: number; total: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const gross = r2((inv.line_items || []).reduce((s, l) => s + (Number(l.amount) || 0), 0))
  const discount = inv.discount_type === 'percentage' && inv.discount_value ? r2(gross * Number(inv.discount_value) / 100) : Math.min(gross, Number(inv.discount_amount) || 0)
  const subtotal = r2(gross - discount)
  const vat = r2(subtotal * (Number(inv.vat_rate) || 0) / 100)
  return { subtotal, discount_amount: discount, vat_amount: vat, total: r2(subtotal + vat) }
}

export function invoiceBalance(inv: Pick<Invoice, 'total' | 'status' | 'amount_paid'>): number {
  if (inv.status === 'paid' || inv.status === 'void') return 0
  return Math.max(0, Math.round(((Number(inv.total) || 0) - (Number(inv.amount_paid) || 0)) * 100) / 100)
}

export const isPartlyPaid = (inv: Pick<Invoice, 'total' | 'status' | 'amount_paid'>) =>
  inv.status !== 'paid' && (Number(inv.amount_paid) || 0) > 0 && invoiceBalance(inv) > 0

/**
 * Job-sheet rows that are billed through a sent invoice. Their dues are collected on the invoice,
 * so receivables screens must not list them as separate job dues (UX-18). Drafts don't count.
 */
export function invoicedJobIds(invoices: Invoice[]): Set<string> {
  const ids = new Set<string>()
  invoices.forEach(inv => {
    if (inv.status === 'draft' || inv.status === 'void') return // a voided invoice frees its jobs again
    ;(inv.job_ids || []).forEach(id => ids.add(id))
  })
  return ids
}

export type AgeBucket = '0-30' | '31-60' | '60+'

/** Ageing of a due by its date (UX-09) */
export function ageBucket(date: string, today = new Date()): AgeBucket {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '0-30'
  const days = Math.floor((today.getTime() - d.getTime()) / 86_400_000)
  return days > 60 ? '60+' : days > 30 ? '31-60' : '0-30'
}

/** WhatsApp link with a polite payment reminder (UX-09) */
export function whatsappReminderLink(phone: string, clientName: string, amount: number, company: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  const msg = [
    `Dear ${clientName},`,
    '',
    `This is a friendly reminder that AED ${amount.toLocaleString()} is pending for our cleaning services.`,
    'Kindly arrange the payment at your earliest convenience. Thank you!',
    '',
    company,
  ].join('\n')
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}
