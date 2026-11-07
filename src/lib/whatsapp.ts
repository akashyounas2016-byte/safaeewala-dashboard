import { supabase } from '@/lib/supabase'

/** R-WA-01: WhatsApp inbox — reads from Supabase (RLS), sends through our server (Meta Cloud API) */
export interface WaConversation {
  id: string
  wa_id: string
  name: string | null
  client_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_direction: 'in' | 'out' | null
  last_inbound_at: string | null
  unread_count: number
  created_at: string
  /** R-WA-03 (after 2026-11-07_whatsapp_crm_more.sql) */
  status?: ChatStatus
  assigned_to?: string | null
  snoozed_until?: string | null
  tags?: string[]
  unsubscribed?: boolean
}
export type ChatStatus = 'open' | 'pending' | 'resolved' | 'snoozed'
export interface WaMessage {
  id: string
  conversation_id: string
  wa_message_id: string | null
  direction: 'in' | 'out'
  type: string
  body: string | null
  media_path: string | null
  media_mime: string | null
  media_name: string | null
  template_name: string | null
  status: string | null
  error: string | null
  sent_by: string | null
  created_at: string
}
export interface WaTemplate {
  name: string
  language: string
  category: string
  components: { type: string; text?: string; format?: string }[]
}

export const WINDOW_MS = 24 * 60 * 60 * 1000
export const windowOpen = (c: Pick<WaConversation, 'last_inbound_at'> | null, now = Date.now()) =>
  Boolean(c?.last_inbound_at) && now - new Date(c!.last_inbound_at!).getTime() < WINDOW_MS
export const windowEndsAt = (c: Pick<WaConversation, 'last_inbound_at'>) => (c.last_inbound_at ? new Date(new Date(c.last_inbound_at).getTime() + WINDOW_MS) : null)

/** "971501234567" → "+971 50 123 4567" */
export function formatWaNumber(waId: string): string {
  const d = String(waId || '').replace(/\D/g, '')
  if (/^9715\d{8}$/.test(d)) return `+971 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
  return d ? `+${d}` : ''
}

/** Body text of a template with {{1}}, {{2}} … filled in */
export function templateBody(t: WaTemplate, params: string[] = []): string {
  const text = t.components.find(c => c.type === 'BODY')?.text || ''
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`)
}
export const templateParamCount = (t: WaTemplate) => new Set((t.components.find(c => c.type === 'BODY')?.text || '').match(/\{\{\d+\}\}/g) || []).size

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error || `Request failed (${r.status})`)
  return data as T
}
export const waStatus = () => call<{ configured: boolean; templates: boolean }>('/api/whatsapp/status')
export const waSendText = (conversationId: string, text: string) => call<WaMessage>('/api/whatsapp/send', { method: 'POST', body: JSON.stringify({ conversationId, text }) })
export const waSendTemplate = (conversationId: string, t: WaTemplate, params: string[]) =>
  call<WaMessage>('/api/whatsapp/send-template', { method: 'POST', body: JSON.stringify({ conversationId, name: t.name, language: t.language, params, preview: templateBody(t, params) }) })
export const waTemplates = () => call<{ templates: WaTemplate[] }>('/api/whatsapp/templates').then(r => r.templates)
export const waMarkRead = (conversationId: string) => call<{ ok: boolean }>('/api/whatsapp/read', { method: 'POST', body: JSON.stringify({ conversationId }) })
export const waStart = (to: string, name?: string) => call<{ id: string }>('/api/whatsapp/start', { method: 'POST', body: JSON.stringify({ to, name }) })
export const waMediaUrl = (messageId: string) => call<{ url: string }>(`/api/whatsapp/media/${messageId}`).then(r => r.url)

/** null = tables not created yet (migration 2026-11-06_whatsapp_inbox.sql not run) */
export async function loadConversations(): Promise<WaConversation[] | null> {
  const { data, error } = await supabase.from('wa_conversations').select('*').order('last_message_at', { ascending: false, nullsFirst: false }).limit(500)
  if (error) { if (/wa_conversations|schema cache|does not exist/i.test(error.message)) return null; throw error }
  return (data || []) as WaConversation[]
}
export async function loadMessages(conversationId: string): Promise<WaMessage[]> {
  const { data, error } = await supabase.from('wa_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(1000)
  if (error) throw error
  return (data || []) as WaMessage[]
}

/** Live changes to conversations and messages */
export function subscribeWhatsApp(onChange: (table: 'wa_conversations' | 'wa_messages', row: Record<string, unknown>) => void): () => void {
  const channel = supabase.channel(`whatsapp-inbox-${Math.random().toString(36).slice(2)}`) // unique: one name can be subscribed only once
  ;(['wa_conversations', 'wa_messages'] as const).forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => onChange(table, (payload.new || payload.old) as Record<string, unknown>))
  })
  channel.subscribe()
  return () => { void supabase.removeChannel(channel) }
}
