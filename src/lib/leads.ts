import type { FluentFormLead, LeadStatus } from '@/types'

/** Lead pipeline helpers (UX-23, UX-24) */
export const LEAD_STAGES: { status: LeadStatus; label: string; tone: string }[] = [
  { status: 'new',       label: 'New',       tone: 'border-sky-300 bg-sky-50/60' },
  { status: 'contacted', label: 'Contacted', tone: 'border-indigo-300 bg-indigo-50/60' },
  { status: 'quoted',    label: 'Quoted',    tone: 'border-amber-300 bg-amber-50/60' },
  { status: 'converted', label: 'Converted', tone: 'border-emerald-300 bg-emerald-50/60' },
  { status: 'lost',      label: 'Lost',      tone: 'border-slate-300 bg-slate-50' },
]

const hoursBetween = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000)
const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`)

/** Response time: how long a lead waited before its first status change (UX-23) */
export function responseInfo(lead: FluentFormLead & { responded_at?: string }): { text: string; late: boolean } | null {
  if (!lead.created_at) return null
  if (lead.status === 'new') {
    const h = hoursBetween(lead.created_at, new Date().toISOString())
    return { text: `waiting ${fmtHours(h)}`, late: h > 4 }
  }
  if (lead.responded_at) {
    const h = hoursBetween(lead.created_at, lead.responded_at)
    return { text: `answered in ${fmtHours(h)}`, late: h > 4 }
  }
  return null
}

const phoneKey = (p?: string) => (p || '').replace(/\D/g, '').slice(-8)

/**
 * Leads that repeat an earlier lead's phone within 7 days → id of that earlier lead (UX-24)
 */
export function findDuplicateLeads(leads: FluentFormLead[]): Map<string, FluentFormLead> {
  const dup = new Map<string, FluentFormLead>()
  const byPhone = new Map<string, FluentFormLead[]>()
  ;[...leads].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')).forEach(l => {
    const k = phoneKey(l.phone || l.whatsapp)
    if (k.length < 7) return
    const earlier = (byPhone.get(k) || []).find(e => hoursBetween(e.created_at, l.created_at) <= 7 * 24)
    if (earlier) dup.set(l.id, earlier)
    byPhone.set(k, [...(byPhone.get(k) || []), l])
  })
  return dup
}
