import { supabase } from '@/lib/supabase'
import { call, type WaMessage, type WaTemplate } from '@/lib/whatsapp'

// ─────────────────────────────────────────────────────────────────────────────
// R-WA-02: WhatsApp CRM modules — Deals, Broadcast, Automation, Keyword Trigger, Templates, Settings, Analytics
// ─────────────────────────────────────────────────────────────────────────────
export type DealStage = 'new' | 'contacted' | 'quoted' | 'won' | 'lost'
export const DEAL_STAGES: { key: DealStage; label: string; tone: string }[] = [
  { key: 'new', label: 'New lead', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  { key: 'contacted', label: 'Contacted', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  { key: 'quoted', label: 'Quote sent', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'won', label: 'Won', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'lost', label: 'Lost', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
]
export interface WaDeal {
  id: string
  conversation_id: string | null
  client_id: string | null
  title: string
  contact_name: string | null
  wa_id: string | null
  value: number
  stage: DealStage
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
export type RuleKind = 'welcome' | 'away' | 'keyword'
export interface WaRule {
  id: string
  kind: RuleKind
  name: string
  enabled: boolean
  keywords: string[]
  match: 'contains' | 'exact'
  reply: string
  fire_count: number
  last_fired_at: string | null
  created_at: string
}
export interface BusinessHours { days: number[]; from: string; to: string }
export const DEFAULT_HOURS: BusinessHours = { days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '20:00' }
export interface WaBroadcast {
  id: string
  name: string
  template_name: string
  language: string
  params: string[]
  status: 'sending' | 'done' | 'failed'
  total: number
  sent: number
  failed: number
  created_by: string | null
  created_at: string
  finished_at: string | null
}
export interface WaTemplateFull extends WaTemplate { status: string; rejected_reason?: string }
export interface WaPhoneInfo {
  phone: { display_phone_number?: string; verified_name?: string; quality_rating?: string; name_status?: string; code_verification_status?: string; platform_type?: string }
  subscribed: boolean | null
}
type MsgLite = Pick<WaMessage, 'conversation_id' | 'direction' | 'status' | 'created_at' | 'sent_by'>

/** True when a Supabase error means "table not created yet" (migration not run) */
export const isMissingTable = (e: { message?: string; code?: string } | null) =>
  Boolean(e && (e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message || '')))

/** Deal pipeline totals per stage (open = not won / lost) */
export function dealSummary(deals: Pick<WaDeal, 'stage' | 'value'>[]) {
  const by = Object.fromEntries(DEAL_STAGES.map(s => [s.key, { count: 0, value: 0 }])) as Record<DealStage, { count: number; value: number }>
  for (const d of deals) { const b = by[d.stage]; if (b) { b.count++; b.value += Number(d.value) || 0 } }
  const open = by.new.value + by.contacted.value + by.quoted.value
  const closed = by.won.count + by.lost.count
  return { by, open, won: by.won.value, winRate: closed ? Math.round((by.won.count / closed) * 100) : null }
}

/** "+971 50…", "0501234567", "00971…" → "971501234567" (same rule as the server) */
export function toWaId(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (/^05\d{8}$/.test(d)) d = '971' + d.slice(1)
  return d
}

/** WhatsApp numbers of CRM clients (WhatsApp field first, else phone), one per number — the Broadcast audience */
export function clientAudience(clients: { id: string; full_name: string; phone?: string; whatsapp?: string; service_mode?: string }[]) {
  const seen = new Set<string>()
  const out: { id: string; name: string; to: string; mode: string }[] = []
  for (const c of clients) {
    const d = toWaId(c.whatsapp || c.phone || '')
    if (d.length < 8 || seen.has(d)) continue
    seen.add(d)
    out.push({ id: c.id, name: c.full_name, to: d, mode: c.service_mode || 'general' })
  }
  return out
}

/** Pasted numbers (one per line, optional ", name") → recipients */
export function parseRecipients(text: string) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const [num, ...rest] = l.split(/[,;\t]/)
    return { to: toWaId(num), name: rest.join(' ').trim() || undefined }
  }).filter(r => r.to.length >= 8)
}

export const waTemplatesAll = () => call<{ templates: WaTemplateFull[] }>('/api/whatsapp/templates?all=1').then(r => r.templates)
export const waCreateTemplate = (t: { name: string; category: 'UTILITY' | 'MARKETING'; language: string; body: string; examples: string[] }) =>
  call<{ id: string; status: string; name: string }>('/api/whatsapp/templates', { method: 'POST', body: JSON.stringify(t) })
export const waDeleteTemplate = (name: string) => call<{ ok: boolean }>(`/api/whatsapp/templates?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
export const waPhone = () => call<WaPhoneInfo>('/api/whatsapp/phone')
export const waConnect = (pin?: string) => call<{ ok: boolean; done: string[] }>('/api/whatsapp/connect', { method: 'POST', body: JSON.stringify({ pin }) })
export const waBroadcast = (b: { name: string; templateName: string; language: string; params: string[]; preview: string; recipients: { to: string; name?: string }[] }) =>
  call<{ id: string; total: number }>('/api/whatsapp/broadcast', { method: 'POST', body: JSON.stringify(b) })

/** Table reads: null = the table is not created yet (run 2026-11-07_whatsapp_modules.sql) */
async function readTable<T>(table: string, order: string, ascending = false): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending }).limit(1000)
  if (error) { if (isMissingTable(error)) return null; throw error }
  return (data || []) as T[]
}
export const loadDeals = () => readTable<WaDeal>('wa_deals', 'updated_at')
export const loadRules = () => readTable<WaRule>('wa_rules', 'created_at', true)
export const loadBroadcasts = () => readTable<WaBroadcast>('wa_broadcasts', 'created_at')

export async function saveDeal(d: Partial<WaDeal> & { title: string }): Promise<WaDeal> {
  const row = { ...d, value: Number(d.value) || 0, updated_at: new Date().toISOString() }
  const q = d.id ? supabase.from('wa_deals').update(row).eq('id', d.id) : supabase.from('wa_deals').insert(row)
  const { data, error } = await q.select().single()
  if (error) throw error
  return data as WaDeal
}
export async function deleteDeal(id: string) { const { error } = await supabase.from('wa_deals').delete().eq('id', id); if (error) throw error }

export async function saveRule(r: Partial<WaRule> & { kind: RuleKind; reply: string }): Promise<WaRule> {
  const row = { ...r, keywords: (r.keywords || []).map(k => k.trim()).filter(Boolean) }
  const q = r.id ? supabase.from('wa_rules').update(row).eq('id', r.id) : supabase.from('wa_rules').insert(row)
  const { data, error } = await q.select().single()
  if (error) throw error
  return data as WaRule
}
export async function deleteRule(id: string) { const { error } = await supabase.from('wa_rules').delete().eq('id', id); if (error) throw error }

/** undefined = table missing, null = no hours saved yet */
export async function loadHours(): Promise<BusinessHours | null | undefined> {
  const { data, error } = await supabase.from('wa_settings').select('value').eq('key', 'hours').maybeSingle()
  if (error) { if (isMissingTable(error)) return undefined; throw error }
  return (data?.value as BusinessHours) || null
}
export async function saveHours(h: BusinessHours) {
  const { error } = await supabase.from('wa_settings').upsert({ key: 'hours', value: h, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** All messages since a date, for Analytics */
export async function loadMessagesSince(sinceIso: string): Promise<MsgLite[]> {
  const { data, error } = await supabase.from('wa_messages').select('conversation_id,direction,status,created_at,sent_by').gte('created_at', sinceIso).order('created_at', { ascending: true }).limit(10000)
  if (error) throw error
  return (data || []) as MsgLite[]
}

/** R-WA-02 Analytics: volumes, delivery, and how fast the team answers (first staff reply after a client message) */
export function waAnalytics(msgs: MsgLite[], days: number, now = new Date()) {
  const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const series: { day: string; in: number; out: number }[] = []
  for (let i = days - 1; i >= 0; i--) series.push({ day: dayKey(new Date(now.getTime() - i * 86400000)), in: 0, out: 0 })
  const idx = new Map(series.map((s, i) => [s.day, i]))
  let inbound = 0; let outbound = 0; let delivered = 0; let read = 0; let failed = 0; let auto = 0
  const chats = new Set<string>()
  const waiting = new Map<string, number>() // conversation → first unanswered client message
  const replies: number[] = []
  for (const m of msgs) {
    const i = idx.get(dayKey(new Date(m.created_at)))
    if (i !== undefined) series[i][m.direction]++
    chats.add(m.conversation_id)
    const t = new Date(m.created_at).getTime()
    if (m.direction === 'in') { inbound++; if (!waiting.has(m.conversation_id)) waiting.set(m.conversation_id, t); continue }
    outbound++
    if (m.status === 'delivered' || m.status === 'read') delivered++
    if (m.status === 'read') read++
    if (m.status === 'failed') { failed++; continue } // never reached the client: not an answer
    if (m.sent_by === 'automation') { auto++; continue } // an automatic reply is not the team answering
    const w = waiting.get(m.conversation_id)
    if (w !== undefined) { replies.push(t - w); waiting.delete(m.conversation_id) }
  }
  replies.sort((a, b) => a - b)
  const median = replies.length ? replies[Math.floor(replies.length / 2)] : null
  const sentOk = outbound - failed
  return {
    series, inbound, outbound, chats: chats.size, auto, failed, unanswered: waiting.size,
    deliveredPct: sentOk ? Math.round((delivered / sentOk) * 100) : null,
    readPct: sentOk ? Math.round((read / sentOk) * 100) : null,
    medianReplyMin: median === null ? null : Math.round(median / 60000),
  }
}
