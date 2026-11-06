import { call } from '@/lib/whatsapp'

/** R-INBOX-01: Facebook + Instagram chats from the GHL sub-account (server: ghlServer.cjs) */
export type InboxChannel = 'whatsapp' | 'facebook' | 'instagram'
export interface GhlConversation {
  id: string
  contactId: string | null
  name: string
  channel: 'facebook' | 'instagram'
  lastMessageAt: string | null
  preview: string
  lastDirection: 'in' | 'out' | null
  unread: number
}
export interface GhlMessage {
  id: string
  direction: 'in' | 'out'
  body: string
  at: string | null
  channel: string
  attachments: string[]
  status: string | null
}

/** Existing GHL settings route: both the key and the location must be on the server */
export const ghlStatus = () => call<{ configured: boolean; locationId: boolean }>('/api/ghl/status').then(r => Boolean(r.configured && r.locationId))
export const ghlConversations = () => call<{ conversations: GhlConversation[] }>('/api/ghl/conversations').then(r => r.conversations)
export const ghlMessages = (id: string) => call<{ messages: GhlMessage[] }>(`/api/ghl/messages/${encodeURIComponent(id)}`).then(r => r.messages)
export const ghlSend = (c: Pick<GhlConversation, 'contactId' | 'channel'>, text: string) =>
  call<{ ok: boolean }>('/api/ghl/send', { method: 'POST', body: JSON.stringify({ contactId: c.contactId, channel: c.channel, text }) })
export const ghlRead = (conversationId: string) => call<{ ok: boolean }>('/api/ghl/read', { method: 'POST', body: JSON.stringify({ conversationId }) })

/** One row of the central Inbox, whatever the channel */
export interface InboxItem {
  key: string
  channel: InboxChannel
  id: string
  name: string
  preview: string
  lastDirection: 'in' | 'out' | null
  at: string | null
  unread: number
}

/** WhatsApp + GHL chats in one list, newest first */
export function mergeInbox<W extends { id: string; last_message_preview: string | null; last_direction: 'in' | 'out' | null; last_message_at: string | null; unread_count: number }>(
  wa: W[],
  ghl: GhlConversation[],
  nameOf: (c: W) => string,
): InboxItem[] {
  const items: InboxItem[] = [
    ...wa.map(c => ({ key: `wa:${c.id}`, channel: 'whatsapp' as const, id: c.id, name: nameOf(c), preview: c.last_message_preview || '', lastDirection: c.last_direction, at: c.last_message_at, unread: c.unread_count || 0 })),
    ...ghl.map(c => ({ key: `ghl:${c.id}`, channel: c.channel, id: c.id, name: c.name, preview: c.preview, lastDirection: c.lastDirection, at: c.lastMessageAt, unread: c.unread })),
  ]
  return items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
}
