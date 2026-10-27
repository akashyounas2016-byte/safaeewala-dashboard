import type { Invoice } from '@/types'

/**
 * Shared receivables helpers (UX-08, UX-09, UX-17, UX-18).
 */

/** Amount still owed on an invoice (partial payments via amount_paid) */
export function invoiceBalance(inv: Pick<Invoice, 'total' | 'status' | 'amount_paid'>): number {
  if (inv.status === 'paid') return 0
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
    if (inv.status === 'draft') return
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
