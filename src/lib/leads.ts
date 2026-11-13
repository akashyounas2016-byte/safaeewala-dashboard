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

/** Last 8 digits of a phone; '' for a placeholder such as +971 50 000 0000 (one digit repeated) — UX-148 */
export const phoneKey = (p?: string) => {
  const k = (p || '').replace(/\D/g, '').slice(-8)
  return /^(\d)\1+$/.test(k.slice(-7)) ? '' : k
}
const emailKey = (e?: string) => (e || '').trim().toLowerCase()

/**
 * Leads that repeat an earlier lead's phone or email within 7 days → that earlier lead (UX-24).
 * UX-148: a placeholder number (+971 50 000 0000) is not a match — many visitors leave the form's example in.
 */
export function findDuplicateLeads(leads: FluentFormLead[]): Map<string, FluentFormLead> {
  const dup = new Map<string, FluentFormLead>()
  const seen = new Map<string, FluentFormLead[]>()
  ;[...leads].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')).forEach(l => {
    const keys: string[] = []
    const k = phoneKey(l.phone || l.whatsapp)
    if (k.length >= 7) keys.push(`p:${k}`)
    const m = emailKey(l.email)
    if (m.includes('@')) keys.push(`e:${m}`)
    const earlier = keys.flatMap(x => seen.get(x) || []).find(e => hoursBetween(e.created_at, l.created_at) <= 7 * 24)
    if (earlier) dup.set(l.id, earlier)
    keys.forEach(x => seen.set(x, [...(seen.get(x) || []), l]))
  })
  return dup
}
