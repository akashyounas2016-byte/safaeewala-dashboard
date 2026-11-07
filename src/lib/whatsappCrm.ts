import { supabase } from '@/lib/supabase'
import { call, type ChatStatus, type WaConversation, type WaMessage } from '@/lib/whatsapp'
import { isMissingTable, toWaId, type RetargetRule } from '@/lib/whatsappModules'

// ─────────────────────────────────────────────────────────────────────────────
// R-WA-03: the rest of the WhatsApp CRM prototype — assignment, chat status, team notes, opt-out,
// contact lists, scheduled / retarget campaigns, deal activity, agent leaderboard
// ─────────────────────────────────────────────────────────────────────────────
export interface WaAgent { id: string; name: string; role: string }
export interface WaNote { id: string; conversation_id: string; kind: 'note' | 'assign' | 'status'; body: string; author: string | null; created_at: string }
export interface WaContactList { id: string; name: string; tags: string[]; created_by: string | null; created_at: string; count?: number }
export interface WaListMember { id: string; list_id: string; wa_id: string; name: string | null; client_id: string | null }
export interface WaDealEvent { id: string; deal_id: string; kind: 'note' | 'stage' | 'automation'; body: string; author: string | null; created_at: string }
export interface WaRecipient { id: string; wa_id: string; name: string | null; status: 'pending' | 'sent' | 'failed' | 'skipped'; error: string | null }

export const CHAT_STATUSES: { key: ChatStatus; label: string; tone: string }[] = [
  { key: 'open', label: 'Open', tone: 'bg-emerald-50 text-emerald-700' },
  { key: 'pending', label: 'Pending', tone: 'bg-amber-50 text-amber-700' },
  { key: 'snoozed', label: 'Snoozed', tone: 'bg-violet-50 text-violet-700' },
  { key: 'resolved', label: 'Resolved', tone: 'bg-slate-100 text-slate-600' },
]
export const RETARGET_RULES: { key: RetargetRule; label: string; note: string }[] = [
  { key: 'no_reply', label: "Didn't reply", note: 'Got the message but have not written since' },
  { key: 'not_read', label: "Didn't read", note: 'Got the message, no blue ticks' },
  { key: 'failed', label: 'Not delivered', note: 'Meta could not deliver it' },
]

/** True once 2026-11-07_whatsapp_crm_more.sql has run (the chat rows carry a status) */
export const crmReady = (convs: WaConversation[]) => convs.length === 0 ? null : convs.some(c => c.status !== undefined)

/** Inbox filters: status tab + "assigned to me / unassigned / everyone" */
export function filterChats(convs: WaConversation[], status: ChatStatus | 'all', who: 'all' | 'mine' | 'unassigned', me: string | null) {
  return convs.filter(c => {
    const st = c.status || 'open'
    if (status !== 'all' && st !== status) return false
    if (who === 'mine') return Boolean(me) && c.assigned_to === me
    if (who === 'unassigned') return !c.assigned_to
    return true
  })
}

/** Outbound messages per sender (automatic replies left out) — the agent leaderboard */
export function agentLeaderboard(msgs: Pick<WaMessage, 'direction' | 'sent_by' | 'status'>[]) {
  const by = new Map<string, { sent: number; failed: number }>()
  for (const m of msgs) {
    if (m.direction !== 'out' || !m.sent_by || m.sent_by === 'automation') continue
    const b = by.get(m.sent_by) || { sent: 0, failed: 0 }
    b.sent++; if (m.status === 'failed') b.failed++
    by.set(m.sent_by, b)
  }
  return [...by].map(([sender, v]) => ({ sender, ...v })).sort((a, b) => b.sent - a.sent)
}

/** Numbers for a list from CRM clients (WhatsApp field first, else phone) */
export const membersFromClients = (clients: { id: string; full_name: string; phone?: string; whatsapp?: string }[]) =>
  clients.map(c => ({ wa_id: toWaId(c.whatsapp || c.phone || ''), name: c.full_name, client_id: c.id })).filter(m => m.wa_id.length >= 8)

// ── server ──
export const waAgents = () => call<{ agents: WaAgent[] }>('/api/whatsapp/agents').then(r => r.agents)
export const waCancelBroadcast = (id: string) => call<{ ok: boolean }>('/api/whatsapp/broadcast/cancel', { method: 'POST', body: JSON.stringify({ id }) })
export const waRetargetPreview = (retargetOf: string, retargetRule: RetargetRule) =>
  call<{ count: number }>('/api/whatsapp/retarget-preview', { method: 'POST', body: JSON.stringify({ retargetOf, retargetRule }) }).then(r => r.count)
export const waDealStage = (dealId: string, from: string | null) => call<{ fired: number }>('/api/whatsapp/deal-stage', { method: 'POST', body: JSON.stringify({ dealId, from }) })

// ── chats ──
export async function updateChat(id: string, patch: Partial<Pick<WaConversation, 'status' | 'assigned_to' | 'snoozed_until' | 'tags' | 'unsubscribed'>>) {
  const { error } = await supabase.from('wa_conversations').update(patch).eq('id', id)
  if (error) throw error
}
export async function loadNotes(conversationId: string): Promise<WaNote[] | null> {
  const { data, error } = await supabase.from('wa_notes').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(500)
  if (error) { if (isMissingTable(error)) return null; throw error }
  return (data || []) as WaNote[]
}
export async function addNote(conversationId: string, kind: WaNote['kind'], body: string, author: string) {
  const { error } = await supabase.from('wa_notes').insert({ conversation_id: conversationId, kind, body, author })
  if (error) throw error
}

// ── contact lists ──
export async function loadLists(): Promise<WaContactList[] | null> {
  const { data, error } = await supabase.from('wa_contact_lists').select('*, wa_contact_list_members(count)').order('created_at', { ascending: false })
  if (error) { if (isMissingTable(error)) return null; throw error }
  return (data || []).map(r => {
    const row = r as WaContactList & { wa_contact_list_members?: { count: number }[] }
    return { ...row, count: row.wa_contact_list_members?.[0]?.count ?? 0 }
  })
}
export async function loadListMembers(listIds: string[]): Promise<WaListMember[]> {
  if (!listIds.length) return []
  const { data, error } = await supabase.from('wa_contact_list_members').select('*').in('list_id', listIds).limit(5000)
  if (error) throw error
  return (data || []) as WaListMember[]
}
export async function createList(name: string, tags: string[], members: { wa_id: string; name?: string | null; client_id?: string | null }[], by: string) {
  const { data, error } = await supabase.from('wa_contact_lists').insert({ name, tags, created_by: by }).select().single()
  if (error) throw error
  const seen = new Set<string>()
  const rows = members.filter(m => m.wa_id && !seen.has(m.wa_id) && seen.add(m.wa_id)).map(m => ({ list_id: data.id, wa_id: m.wa_id, name: m.name || null, client_id: m.client_id || null }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e2 } = await supabase.from('wa_contact_list_members').insert(rows.slice(i, i + 500))
    if (e2) throw e2
  }
  return data as WaContactList
}
export async function addListTags(ids: string[], tags: string[], lists: WaContactList[]) {
  for (const id of ids) {
    const cur = lists.find(l => l.id === id)?.tags || []
    const { error } = await supabase.from('wa_contact_lists').update({ tags: [...new Set([...cur, ...tags])] }).eq('id', id)
    if (error) throw error
  }
}
export async function deleteLists(ids: string[]) {
  const { error } = await supabase.from('wa_contact_lists').delete().in('id', ids)
  if (error) throw error
}

// ── deals ──
export async function loadDealEvents(dealId: string): Promise<WaDealEvent[] | null> {
  const { data, error } = await supabase.from('wa_deal_events').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }).limit(200)
  if (error) { if (isMissingTable(error)) return null; throw error }
  return (data || []) as WaDealEvent[]
}
export async function addDealEvent(dealId: string, kind: WaDealEvent['kind'], body: string, author: string) {
  const { error } = await supabase.from('wa_deal_events').insert({ deal_id: dealId, kind, body, author })
  if (error && !isMissingTable(error)) throw error
}

// ── campaigns ──
export async function loadRecipients(broadcastId: string): Promise<WaRecipient[]> {
  const { data, error } = await supabase.from('wa_broadcast_recipients').select('id,wa_id,name,status,error').eq('broadcast_id', broadcastId).order('created_at', { ascending: true }).limit(1000)
  if (error) throw error
  return (data || []) as WaRecipient[]
}

// ── settings: chat assignment (manual / round-robin) ──
export interface AssignmentSetting { mode: 'manual' | 'round_robin'; agents: string[]; last?: string | null }
export async function loadAssignment(): Promise<AssignmentSetting | null | undefined> {
  const { data, error } = await supabase.from('wa_settings').select('value').eq('key', 'assignment').maybeSingle()
  if (error) { if (isMissingTable(error)) return undefined; throw error }
  return (data?.value as AssignmentSetting) || null
}
export async function saveAssignment(v: AssignmentSetting) {
  const { error } = await supabase.from('wa_settings').upsert({ key: 'assignment', value: v, updated_at: new Date().toISOString() })
  if (error) throw error
}
