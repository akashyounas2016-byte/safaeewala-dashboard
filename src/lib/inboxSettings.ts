import { supabase } from '@/lib/supabase'
import { call, type WaMessage } from '@/lib/whatsapp'
import { isMissingTable } from '@/lib/whatsappModules'

/** One wa_settings row (undefined = table missing, null = not saved yet) */
export async function loadSetting<T>(key: string): Promise<T | null | undefined> {
  const { data, error } = await supabase.from('wa_settings').select('value').eq('key', key).maybeSingle()
  if (error) { if (isMissingTable(error)) return undefined; throw error }
  return (data?.value as T) ?? null
}
export async function saveSetting<T>(key: string, value: T) {
  const { error } = await supabase.from('wa_settings').upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ── R-WA-04: client notifications, each with its own switch, plus a master switch ──
export type NotifyKind = 'confirm' | 'reminder' | 'on_way' | 'feedback' | 'payment'
export interface NotifyConfig { enabled: boolean; template: string; language: string; params: string[]; hour?: string; since?: string }
export type NotificationSettings = { master: boolean } & Partial<Record<NotifyKind, NotifyConfig>>
export const NOTIFY_KINDS: { key: NotifyKind; label: string; when: string; params: string[]; hour?: string; auto: boolean }[] = [
  { key: 'confirm', label: 'Booking confirmation', when: 'Right after a new booking is saved (only bookings made after you switch it on).', params: ['{name}', '{date}', '{time}'], auto: true },
  { key: 'reminder', label: 'Day-before reminder', when: 'The evening before the booking, from the time below (Dubai).', params: ['{name}', '{date}', '{time}'], hour: '18:00', auto: true },
  { key: 'on_way', label: 'Team on the way', when: 'When a cleaner taps "On my way" in My Duties — or by hand from Jobs.', params: ['{name}', '{cleaner}'], auto: true },
  { key: 'feedback', label: 'Feedback request', when: 'After the job is marked completed (from the time below, same or next day).', params: ['{name}'], hour: '10:00', auto: true },
  { key: 'payment', label: 'Payment reminder', when: 'Only by hand: Conversations → Jobs → Unpaid → Remind (at most once a day per job).', params: ['{name}', '{balance}', '{date}'], auto: false },
]
export const TOKENS = ['{name}', '{date}', '{time}', '{service}', '{address}', '{amount}', '{balance}', '{cleaner}', '{review_link}']
/** R-GHL-01: the Google review link (Google Business Profile → "Ask for reviews") — fills {review_link} */
export const loadReviewLink = () => loadSetting<{ url: string }>('review_link')
export const saveReviewLink = (url: string) => saveSetting('review_link', { url })
export const isReviewLink = (u: string) => /^https:\/\/(g\.page\/r\/|search\.google\.com\/local\/writereview|www\.google\.com\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i.test(u.trim())
export const loadNotifications = () => loadSetting<NotificationSettings>('notifications')
export const saveNotifications = (v: NotificationSettings) => saveSetting('notifications', v)
export const waNotify = (kind: NotifyKind, ref: string, to: string, name: string, values: Record<string, string>) =>
  call<{ ok: boolean }>('/api/whatsapp/notify', { method: 'POST', body: JSON.stringify({ kind, ref, to, name, values }) })

// ── R-INBOX-03: chat tags (custom, with colours) ──
export interface TagDef { name: string; color: string }
export const TAG_COLORS = ['emerald', 'sky', 'violet', 'amber', 'rose', 'slate'] as const
export const TAG_TONE: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200', sky: 'bg-sky-50 text-sky-700 border-sky-200', violet: 'bg-violet-50 text-violet-700 border-violet-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200', rose: 'bg-rose-50 text-rose-700 border-rose-200', slate: 'bg-slate-100 text-slate-600 border-slate-200',
}
export const DEFAULT_TAGS: TagDef[] = [
  { name: 'Upcoming Job', color: 'sky' }, { name: 'Booked Job', color: 'emerald' }, { name: 'Quote Sent', color: 'amber' },
  { name: 'Follow-up', color: 'violet' }, { name: 'Complaint', color: 'rose' }, { name: 'VIP', color: 'slate' },
]
export const loadTagDefs = () => loadSetting<TagDef[]>('tags')
export const saveTagDefs = (v: TagDef[]) => saveSetting('tags', v)
export const tagTone = (defs: TagDef[], name: string) => TAG_TONE[defs.find(d => d.name.toLowerCase() === name.toLowerCase())?.color || 'slate']

/** Tags of Facebook / Instagram chats (WhatsApp chats keep theirs on the chat row) */
export async function loadGhlTags(): Promise<Record<string, string[]> | null> {
  const { data, error } = await supabase.from('inbox_chat_tags').select('ref,tags').limit(5000)
  if (error) { if (isMissingTable(error)) return null; throw error }
  return Object.fromEntries((data || []).map(r => [r.ref as string, (r.tags as string[]) || []]))
}
export async function saveGhlTags(ref: string, tags: string[]) {
  const { error } = await supabase.from('inbox_chat_tags').upsert({ ref, tags, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Header summary: unread, pending and per-tag counts */
export function tagSummary(items: { unread: number; status?: string; tags: string[] }[]) {
  const tags: Record<string, number> = {}
  let unread = 0; let pending = 0
  for (const i of items) {
    if (i.unread > 0) unread++
    if (i.status === 'pending') pending++
    for (const t of i.tags) tags[t] = (tags[t] || 0) + 1
  }
  return { unread, pending, tags }
}

// ── R-INBOX-03: saved replies (all channels) ──
export interface QuickReply { title: string; text: string }
export const loadQuickReplies = () => loadSetting<QuickReply[]>('quick_replies')
export const saveQuickReplies = (v: QuickReply[]) => saveSetting('quick_replies', v)

// ── R-INBOX-03: attachments ──
export const MAX_FILE = 16 * 1024 * 1024
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(new Error('The file could not be read'))
    r.readAsDataURL(file)
  })
}
export async function waSendMedia(conversationId: string, file: File, caption: string) {
  if (file.size > MAX_FILE) throw new Error('A file can be at most 16 MB')
  return call<WaMessage>('/api/whatsapp/send-media', { method: 'POST', body: JSON.stringify({ conversationId, filename: file.name, mime: file.type || 'application/octet-stream', base64: await fileToBase64(file), caption }) })
}
export async function ghlSendFile(c: { contactId: string | null; channel: string }, file: File, text: string) {
  if (file.size > MAX_FILE) throw new Error('A file can be at most 16 MB')
  return call<{ ok: boolean }>('/api/ghl/send', { method: 'POST', body: JSON.stringify({ contactId: c.contactId, channel: c.channel, text, file: { name: file.name, mime: file.type, base64: await fileToBase64(file) } }) })
}

/** A small emoji set for replies */
export const EMOJIS = ['😊', '🙏', '👍', '✅', '👋', '😀', '😉', '🙂', '❤️', '🎉', '⭐', '🧹', '🧽', '🧼', '🏠', '🚐', '⏰', '📅', '📍', '💳', '💰', '📞', '✨', '👌', '🤝', '😔', '⚠️', '❓', '➡️', '🕐']
