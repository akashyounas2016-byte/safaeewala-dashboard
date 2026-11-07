import { useSyncExternalStore } from 'react'
import type { WaConversation, WaMessage } from '@/lib/whatsapp'
import type { GhlConversation, GhlMessage } from '@/lib/ghlInbox'
import type { WaNote } from '@/lib/whatsappCrm'

/**
 * R-INBOX-02: DEMO chats for trying the unified inbox without real clients.
 * Off by default; switched on per browser (⋮ → Demo data). Lives only in this browser's memory —
 * never written to Supabase, GHL or Meta, never counted in Analytics, never sent anywhere. Ids start with "demo-".
 */
const FLAG = 'safaeewala_inbox_demo' // plain localStorage on purpose: not cloud-synced
export const isDemoId = (id: string | null | undefined) => Boolean(id && id.startsWith('demo-'))

const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString()
function seed() {
  const wa: WaConversation[] = [
    { id: 'demo-wa-1', wa_id: '971500000101', name: 'DEMO · Sara (Marina)', client_id: null, last_message_at: ago(4), last_message_preview: 'Can the team come at 10 tomorrow?', last_direction: 'in', last_inbound_at: ago(4), unread_count: 2, created_at: ago(300), status: 'open', assigned_to: null, snoozed_until: null, tags: ['deep clean'], unsubscribed: false },
    { id: 'demo-wa-2', wa_id: '971500000102', name: 'DEMO · Omar (JVC villa)', client_id: null, last_message_at: ago(55), last_message_preview: 'Price for 4 hours with materials?', last_direction: 'in', last_inbound_at: ago(55), unread_count: 1, created_at: ago(900), status: 'pending', assigned_to: null, snoozed_until: null, tags: ['quote'], unsubscribed: false },
    { id: 'demo-wa-3', wa_id: '971500000103', name: 'DEMO · Priya (monthly)', client_id: null, last_message_at: ago(60 * 26), last_message_preview: 'Thank you, the cleaner was great!', last_direction: 'out', last_inbound_at: ago(60 * 27), unread_count: 0, created_at: ago(60 * 72), status: 'resolved', assigned_to: null, snoozed_until: null, tags: [], unsubscribed: false },
  ]
  const ghl: GhlConversation[] = [
    { id: 'demo-fb-1', contactId: 'demo', name: 'DEMO · Ahmed (Facebook)', channel: 'facebook', lastMessageAt: ago(12), preview: 'Do you do sofa shampoo?', lastDirection: 'in', unread: 1 },
    { id: 'demo-ig-1', contactId: 'demo', name: 'DEMO · Lina (Instagram)', channel: 'instagram', lastMessageAt: ago(140), preview: 'Saw your post — move-out cleaning price?', lastDirection: 'in', unread: 0 },
  ]
  const msg = (conversation_id: string, direction: 'in' | 'out', body: string, min: number, status = direction === 'in' ? 'received' : 'read'): WaMessage =>
    ({ id: `demo-m-${conversation_id}-${min}`, conversation_id, wa_message_id: null, direction, type: 'text', body, media_path: null, media_mime: null, media_name: null, template_name: null, status, error: null, sent_by: direction === 'out' ? 'demo' : null, created_at: ago(min) })
  const waMsgs: Record<string, WaMessage[]> = {
    'demo-wa-1': [msg('demo-wa-1', 'in', 'Hi, I booked a deep clean for Friday.', 60), msg('demo-wa-1', 'out', 'Hi Sara! Yes, Friday 10 AM with 2 cleaners is confirmed.', 50), msg('demo-wa-1', 'in', 'Can the team come at 10 tomorrow instead?', 5), msg('demo-wa-1', 'in', 'Can the team come at 10 tomorrow?', 4)],
    'demo-wa-2': [msg('demo-wa-2', 'in', 'Price for 4 hours with materials?', 55)],
    'demo-wa-3': [msg('demo-wa-3', 'in', 'Thank you, the cleaner was great!', 60 * 27), msg('demo-wa-3', 'out', 'Happy to hear that, see you next week!', 60 * 26)],
  }
  const g = (id: string, direction: 'in' | 'out', body: string, min: number, channel: string): GhlMessage => ({ id: `demo-g-${id}-${min}`, direction, body, at: ago(min), channel, attachments: [], status: null })
  const ghlMsgs: Record<string, GhlMessage[]> = {
    'demo-fb-1': [g('fb1', 'in', 'Hello! Do you do sofa shampoo?', 12, 'facebook')],
    'demo-ig-1': [g('ig1', 'in', 'Saw your post — move-out cleaning price?', 140, 'instagram'), g('ig1', 'out', 'Hi Lina! A 2-bed move-out is from AED 450. Which area?', 130, 'instagram')],
  }
  return { wa, ghl, waMsgs, ghlMsgs, notes: {} as Record<string, WaNote[]> }
}

type State = ReturnType<typeof seed> & { on: boolean }
let state: State = { ...seed(), on: (() => { try { return localStorage.getItem(FLAG) === '1' } catch { return false } })() }
const listeners = new Set<() => void>()
const emit = () => { state = { ...state }; listeners.forEach(l => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export const useInboxDemo = () => useSyncExternalStore(subscribe, () => state)

export const demo = {
  setOn(on: boolean) { try { localStorage.setItem(FLAG, on ? '1' : '0') } catch { /* private window */ } state = { ...seed(), on }; emit() },
  /** "Delete all conversations" also clears the demo chats */
  clear() { state = { ...state, wa: [], ghl: [], waMsgs: {}, ghlMsgs: {}, notes: {} }; emit() },
  patchWa(id: string, patch: Partial<WaConversation>) { state.wa = state.wa.map(c => (c.id === id ? { ...c, ...patch } : c)); emit() },
  readWa(id: string) { this.patchWa(id, { unread_count: 0 }) },
  sendWa(id: string, body: string) {
    const now = new Date().toISOString()
    const m: WaMessage = { id: `demo-m-${Date.now()}`, conversation_id: id, wa_message_id: null, direction: 'out', type: 'text', body, media_path: null, media_mime: null, media_name: null, template_name: null, status: 'sent', error: null, sent_by: 'demo', created_at: now }
    state.waMsgs = { ...state.waMsgs, [id]: [...(state.waMsgs[id] || []), m] }
    this.patchWa(id, { last_message_at: now, last_message_preview: body.slice(0, 120), last_direction: 'out' })
  },
  sendGhl(id: string, body: string) {
    const now = new Date().toISOString()
    const conv = state.ghl.find(c => c.id === id)
    state.ghlMsgs = { ...state.ghlMsgs, [id]: [...(state.ghlMsgs[id] || []), { id: `demo-g-${Date.now()}`, direction: 'out', body, at: now, channel: conv?.channel || 'facebook', attachments: [], status: null }] }
    state.ghl = state.ghl.map(c => (c.id === id ? { ...c, lastMessageAt: now, preview: body.slice(0, 120), lastDirection: 'out', unread: 0 } : c))
    emit()
  },
  readGhl(id: string) { state.ghl = state.ghl.map(c => (c.id === id ? { ...c, unread: 0 } : c)); emit() },
  addNote(conversationId: string, kind: WaNote['kind'], body: string, author: string) {
    const n: WaNote = { id: `demo-n-${Date.now()}`, conversation_id: conversationId, kind, body, author, created_at: new Date().toISOString() }
    state.notes = { ...state.notes, [conversationId]: [...(state.notes[conversationId] || []), n] }
    emit()
  },
}
