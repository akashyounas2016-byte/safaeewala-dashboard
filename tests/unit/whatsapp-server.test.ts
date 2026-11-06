// R-WA-01: WhatsApp Cloud API server — pure helpers and the webhook against an in-memory database
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'

const require = createRequire(process.cwd() + '/')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wa = require(process.cwd() + '/whatsappServer.cjs')

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// helpers
eq([wa.normalizeWaId('+971 50 123 4567'), wa.normalizeWaId('0501234567'), wa.normalizeWaId('00971501234567')], ['971501234567', '971501234567', '971501234567'], 'numbers normalised to 9715…')
const sign = (body: string, secret: string) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
eq([wa.verifySignature(Buffer.from('{}'), sign('{}', 's3'), 's3'), wa.verifySignature(Buffer.from('{}'), sign('{}', 'x'), 's3'), wa.verifySignature(Buffer.from('{}'), '', 's3')], [true, false, false], 'webhook signature checked')
eq([wa.statusAdvances('read', 'delivered'), wa.statusAdvances('sent', 'read')], [false, true], 'a late "delivered" never overwrites "read"')
eq([wa.windowOpen(new Date(Date.now() - 3600e3).toISOString()), wa.windowOpen(new Date(Date.now() - 25 * 3600e3).toISOString()), wa.windowOpen(null)], [true, false, false], '24-hour reply window')

const payload = {
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: 'PN1' },
    contacts: [{ wa_id: '971501234567', profile: { name: 'Maria' } }],
    messages: [
      { from: '971501234567', id: 'wamid.A', timestamp: '1793000000', type: 'text', text: { body: 'Hi, can you come tomorrow?' } },
      { from: '971501234567', id: 'wamid.B', timestamp: '1793000005', type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg', caption: 'the stain' } },
    ],
    statuses: [{ id: 'wamid.OUT', status: 'read' }],
  } }, { value: { metadata: { phone_number_id: 'OTHER' }, messages: [{ from: '1', id: 'x', type: 'text', text: { body: 'not ours' } }] } }] }],
}
const parsed = wa.parseWebhook(payload, 'PN1')
eq(parsed.messages.map((m: { waMessageId: string; type: string; body: string; mediaId: string | null }) => [m.waMessageId, m.type, m.body, m.mediaId]), [['wamid.A', 'text', 'Hi, can you come tomorrow?', null], ['wamid.B', 'image', 'the stain', 'MEDIA1']], 'messages parsed, other numbers ignored')
eq(parsed.statuses, [{ waMessageId: 'wamid.OUT', status: 'read', error: null }], 'statuses parsed')

// webhook end to end with a fake Supabase
process.env.WHATSAPP_TOKEN = 't'; process.env.WHATSAPP_PHONE_NUMBER_ID = 'PN1'; process.env.WHATSAPP_APP_SECRET = 'appsecret'; process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me'
type Row = Record<string, unknown>
const db: Record<string, Row[]> = { wa_conversations: [], wa_messages: [{ id: 'm-out', wa_message_id: 'wamid.OUT', status: 'delivered', conversation_id: 'c0' }], clients: [{ id: 'cl-1', phone: '050 123 4567' }] }
let n = 0
const supa = async (p: string, opts: { method?: string; body?: Row } = {}) => {
  const [base, qs] = p.replace('/rest/v1/', '').split('?')
  const params = new URLSearchParams(qs || '')
  const rows = db[base] || []
  const filters = [...params.entries()].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k))
  const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === v.replace(/^eq\./, ''))
  if (!opts.method || opts.method === 'GET') return rows.filter(match)
  if (opts.method === 'POST') {
    const b = opts.body as Row
    if (base === 'wa_messages' && b.wa_message_id && rows.some(r => r.wa_message_id === b.wa_message_id)) return []
    const row = { id: `id-${++n}`, unread_count: 0, ...b }; rows.push(row); db[base] = rows; return [row]
  }
  if (opts.method === 'PATCH') { rows.filter(match).forEach(r => Object.assign(r, opts.body)); return [] }
  return []
}
const sent: { status: number; body: string }[] = []
const sendJson = (res: { writeHead: (s: number) => void; end: (b: string) => void }, status: number, body: unknown) => { res.writeHead(status); res.end(JSON.stringify(body)) }
const api = wa.createWhatsApp({ supa, supabaseUrl: 'https://x', serviceHeaders: () => ({}), sendJson, readJson: async () => ({}), activeUserFrom: async () => null })
const fakeRes = () => { const r = { status: 0, body: '', headersSent: false, writeHead(s: number) { r.status = s; r.headersSent = true }, end(b?: string) { r.body = b || ''; sent.push({ status: r.status, body: r.body }) } }; return r }
const fakeReq = (method: string, body = '', headers: Record<string, string> = {}) => { const e = new EventEmitter() as EventEmitter & { method: string; headers: Record<string, string> }; e.method = method; e.headers = headers; setTimeout(() => { if (body) e.emit('data', Buffer.from(body)); e.emit('end') }, 0); return e }

const verifyRes = fakeRes()
await api.handleWebhook(fakeReq('GET'), verifyRes, new URL('https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42'))
eq([verifyRes.status, verifyRes.body], [200, '42'], 'Meta verification answered with the challenge')
const badRes = fakeRes()
await api.handleWebhook(fakeReq('GET'), badRes, new URL('https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42'))
eq(badRes.status, 403, 'wrong verify token refused')

const body = JSON.stringify({ entry: [{ changes: [{ value: { ...payload.entry[0].changes[0].value, messages: [payload.entry[0].changes[0].value.messages[0]] } }] }] })
const forged = fakeRes()
await api.handleWebhook(fakeReq('POST', body, { 'x-hub-signature-256': sign(body, 'wrong') }), forged, new URL('https://x/api/whatsapp/webhook'))
eq([forged.status, db.wa_conversations.length], [401, 0], 'unsigned / forged webhook refused, nothing stored')
const good = fakeRes()
await api.handleWebhook(fakeReq('POST', body, { 'x-hub-signature-256': sign(body, 'appsecret') }), good, new URL('https://x/api/whatsapp/webhook'))
await new Promise(r => setTimeout(r, 20))
const conv = db.wa_conversations[0]
eq([good.status, conv?.wa_id, conv?.name, conv?.client_id, conv?.unread_count, conv?.last_message_preview], [200, '971501234567', 'Maria', 'cl-1', 1, 'Hi, can you come tomorrow?'], 'inbound message stored, linked to the CRM client by phone, unread +1')
eq(db.wa_messages.find(m => m.wa_message_id === 'wamid.OUT')?.status, 'read', 'delivery status updated')
const again = fakeRes()
await api.handleWebhook(fakeReq('POST', body, { 'x-hub-signature-256': sign(body, 'appsecret') }), again, new URL('https://x/api/whatsapp/webhook'))
await new Promise(r => setTimeout(r, 20))
eq([db.wa_messages.filter(m => m.wa_message_id === 'wamid.A').length, db.wa_conversations[0].unread_count], [1, 1], 'Meta resending the same message is not stored twice')
