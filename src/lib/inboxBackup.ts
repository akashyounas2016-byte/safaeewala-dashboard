import { supabase } from '@/lib/supabase'
import { call } from '@/lib/whatsapp'
import { ghlConversations } from '@/lib/ghlInbox'
import { authorizeGoogleDrive, blobToBase64, gdriveConfigured, getAccessToken, getDriveWebhookUrl, uploadToDrive } from '@/lib/googleDrive'
import { todayDubai } from '@/lib/dubaiTime'

/**
 * R-INBOX-02: backup of the inbox to Google Drive — every WhatsApp chat with its messages and team notes,
 * plus the list of Facebook / Instagram chats (their messages stay in GHL). Real data only — DEMO chats are never included.
 * Route: the n8n Drive webhook (Settings → Backup) when set, else Google sign-in (VITE_GOOGLE_CLIENT_ID), else a download.
 */
async function readAll(table: string, select = '*') {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) { if (/schema cache|does not exist/i.test(error.message)) return rows; throw error }
    rows.push(...((data || []) as unknown as Record<string, unknown>[]))
    if (!data || data.length < 1000) return rows
  }
}

export async function buildInboxBackup() {
  const [conversations, messages, notes] = await Promise.all([readAll('wa_conversations'), readAll('wa_messages'), readAll('wa_notes')])
  const facebookInstagram = await ghlConversations().catch(() => [])
  return {
    kind: 'safaeewala-inbox-backup', version: 1, exported_at: new Date().toISOString(),
    counts: { whatsapp_chats: conversations.length, whatsapp_messages: messages.length, notes: notes.length, facebook_instagram_chats: facebookInstagram.length },
    whatsapp: { conversations, messages, notes },
    facebook_instagram: facebookInstagram,
  }
}

export type BackupOutcome = { where: 'drive-webhook' | 'drive' | 'download'; link?: string; counts: Record<string, number> }

export async function backupInbox(): Promise<BackupOutcome> {
  const data = await buildInboxBackup()
  const filename = `Safaeewala-Inbox-${todayDubai()}-${Date.now()}.json`
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const hook = getDriveWebhookUrl()
  if (hook) {
    const r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({
      event: 'inbox_backup', filename, mime_type: 'application/json', file_base64: await blobToBase64(blob), file_size_bytes: blob.size, summary: data.counts, exported_at: data.exported_at,
    }) })
    if (!r.ok) throw new Error(`Drive webhook answered ${r.status}`)
    const j = await r.json().catch(() => ({}))
    return { where: 'drive-webhook', link: j?.driveUrl || j?.webViewLink || j?.link || undefined, counts: data.counts }
  }
  if (gdriveConfigured) {
    const token = getAccessToken() || await authorizeGoogleDrive()
    const link = await uploadToDrive(blob, filename, token, 'application/json')
    return { where: 'drive', link, counts: data.counts }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { where: 'download', counts: data.counts }
}

export const waDeleteAll = () => call<{ deleted: number; files: number }>('/api/whatsapp/delete-all', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE' }) })
