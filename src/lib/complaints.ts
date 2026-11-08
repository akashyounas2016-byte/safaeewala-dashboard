// R-CMP-01: complaints from Fluent Forms, Facebook / Instagram, WhatsApp, phone or typed in — one list with a status
import { supabase } from '@/lib/supabase'
import { isMissingTable } from '@/lib/whatsappModules'

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type ComplaintSource = 'fluent_forms' | 'facebook' | 'instagram' | 'whatsapp' | 'phone' | 'email' | 'manual'
export interface Complaint {
  id: string; ref: string | null; client_id: string | null; client_name: string; phone: string | null
  source: ComplaintSource; source_ref: string | null; category: string; priority: 'low' | 'medium' | 'high'
  status: ComplaintStatus; description: string; job_date: string | null; cleaner: string | null; assigned_to: string | null
  resolution: string | null; resolved_at: string | null; created_by: string | null; created_at: string; updated_at: string
}

export const COMPLAINT_STATUSES: { key: ComplaintStatus; label: string; tone: string }[] = [
  { key: 'open', label: 'Open', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  { key: 'in_progress', label: 'In progress', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'resolved', label: 'Resolved', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'closed', label: 'Closed', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
]
export const COMPLAINT_SOURCES: { key: ComplaintSource; label: string }[] = [
  { key: 'fluent_forms', label: 'Fluent Forms' }, { key: 'facebook', label: 'Facebook' }, { key: 'instagram', label: 'Instagram' },
  { key: 'whatsapp', label: 'WhatsApp' }, { key: 'phone', label: 'Phone call' }, { key: 'email', label: 'Email' }, { key: 'manual', label: 'Other' },
]
export const COMPLAINT_CATEGORIES = ['Service quality', 'Late / no-show', 'Damage / breakage', 'Staff behaviour', 'Billing / price', 'Missed area', 'Other']

/** Words that mark a website message or a chat as a likely complaint */
const COMPLAINT_WORDS = /\b(complain|complaint|not happy|unhappy|disappoint|bad service|poor|dirty|not clean|damage|damaged|broke|broken|stolen|missing|late|no.?show|didn'?t come|did not come|rude|refund|worst|shikayat)\b/i
export const looksLikeComplaint = (text?: string | null) => COMPLAINT_WORDS.test(String(text || ''))

/** Next reference: CMP-0001, CMP-0002 … */
export function nextComplaintRef(existing: (string | null)[]): string {
  const n = Math.max(0, ...existing.map(r => Number(/^CMP-(\d+)$/i.exec(r || '')?.[1]) || 0)) + 1
  return `CMP-${String(n).padStart(4, '0')}`
}

/** Open = not resolved / closed; overdue = open for more than 2 days */
export function complaintSummary(list: Pick<Complaint, 'status' | 'priority' | 'created_at' | 'resolved_at'>[], now = Date.now()) {
  const open = list.filter(c => c.status === 'open' || c.status === 'in_progress')
  const done = list.filter(c => c.resolved_at)
  const hours = done.map(c => (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()) / 3_600_000).filter(h => h >= 0)
  return {
    total: list.length,
    open: open.length,
    high: open.filter(c => c.priority === 'high').length,
    overdue: open.filter(c => now - new Date(c.created_at).getTime() > 2 * 86_400_000).length,
    resolved: list.filter(c => c.status === 'resolved' || c.status === 'closed').length,
    avgHours: hours.length ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length) : null,
  }
}

export async function loadComplaints(): Promise<Complaint[] | null> {
  const { data, error } = await supabase.from('complaints').select('*').order('created_at', { ascending: false }).limit(2000)
  if (error) { if (isMissingTable(error)) return null; throw error }
  return (data || []) as Complaint[]
}
export async function saveComplaint(row: Partial<Complaint> & { client_name: string }): Promise<Complaint> {
  const body: Partial<Complaint> = { ...row, updated_at: new Date().toISOString() }
  if (row.status === 'resolved' || row.status === 'closed') body.resolved_at = row.resolved_at || new Date().toISOString()
  else if (row.status) body.resolved_at = null
  const q = row.id ? supabase.from('complaints').update(body).eq('id', row.id) : supabase.from('complaints').insert(body)
  const { data, error } = await q.select().single()
  if (error) throw new Error(/duplicate key|unique/i.test(error.message) ? 'This message is already a complaint' : error.message)
  return data as Complaint
}
export async function deleteComplaint(id: string) {
  const { error } = await supabase.from('complaints').delete().eq('id', id)
  if (error) throw error
}
