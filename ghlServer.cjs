/**
 * R-INBOX-01: Facebook + Instagram chats from the GoHighLevel sub-account, read and answered from the CRM's Inbox.
 * GHL stays the connection to Facebook / Instagram; the CRM only reads and sends through GHL's API (v2).
 *
 * Server env (VPS /var/www/safaeewala/.env — never commit) — the same keys the GHL contact sync already uses:
 *   GHL_API_KEY      Private Integration token of the sub-account (Settings → Private Integrations) with
 *                    conversations.readonly, conversations.write, conversations/message.readonly,
 *                    conversations/message.write, contacts.readonly
 *   GHL_LOCATION_ID  the sub-account (location) id
 *
 * CRM endpoints (signed-in admin / manager): GET /api/ghl/conversations · /api/ghl/messages/:id
 *                                            POST /api/ghl/send · /api/ghl/read
 * (/api/ghl/status, /test and /contacts/upsert stay in webhookServer.cjs)
 */
const BASE = 'https://services.leadconnectorhq.com'
const env = () => ({ token: process.env.GHL_API_KEY || '', locationId: process.env.GHL_LOCATION_ID || '' })
const configured = () => { const e = env(); return Boolean(e.token && e.locationId) }

/** GHL message / conversation type → our channel */
function channelOf(type) {
  const t = String(type || '').toUpperCase()
  if (t.includes('INSTAGRAM') || t === 'IG') return 'instagram'
  if (t.includes('FACEBOOK') || t === 'FB') return 'facebook'
  if (t.includes('WHATSAPP')) return 'whatsapp'
  if (t.includes('SMS') || t.includes('PHONE')) return 'sms'
  if (t.includes('EMAIL')) return 'email'
  return 'other'
}
/** GHL "send message" type for a channel */
const sendTypeOf = channel => ({ facebook: 'FB', instagram: 'IG' })[channel] || null

const toIso = v => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  const d = Number.isFinite(n) && String(v).match(/^\d+$/) ? new Date(n) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** GHL conversation → the Inbox's shape */
function mapConversation(c) {
  return {
    id: String(c.id),
    contactId: c.contactId || null,
    name: c.fullName || c.contactName || c.name || c.email || c.phone || 'Unknown',
    channel: channelOf(c.lastMessageType || c.type),
    lastMessageAt: toIso(c.lastMessageDate || c.dateUpdated),
    preview: String(c.lastMessageBody || '').slice(0, 120),
    lastDirection: c.lastMessageDirection === 'outbound' ? 'out' : c.lastMessageDirection === 'inbound' ? 'in' : null,
    unread: Number(c.unreadCount) || 0,
  }
}
/** GHL message → the Inbox's shape */
function mapMessage(m) {
  return {
    id: String(m.id),
    direction: m.direction === 'outbound' ? 'out' : 'in',
    body: m.body || m.message || '',
    at: toIso(m.dateAdded || m.createdAt),
    channel: channelOf(m.messageType || m.type),
    attachments: Array.isArray(m.attachments) ? m.attachments.filter(a => typeof a === 'string') : [],
    status: m.status || null,
  }
}

async function ghl(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env().token}`, Version: '2021-04-15', Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(data?.message ? `GHL: ${[].concat(data.message).join(', ')}` : `GHL error ${r.status}`), { status: r.status === 401 ? 502 : 400 })
  return data
}

const INBOX_PATHS = /^\/api\/ghl\/(conversations|messages\/[^/]+|send|read)$/

function createGhl({ sendJson, readJson, activeUserFrom }) {
  const q = encodeURIComponent
  async function staffUser(req) {
    const user = await activeUserFrom(req)
    if (!user) throw Object.assign(new Error('Sign in first.'), { status: 401 })
    if (user.role !== 'admin' && user.role !== 'manager') throw Object.assign(new Error('Only an admin or manager can use the Inbox.'), { status: 403 })
    return user
  }

  function route(req, res, parsedUrl, pathname) {
    if (!INBOX_PATHS.test(pathname)) return false // other /api/ghl/* routes live in webhookServer.cjs
    const run = fn => fn().catch(err => sendJson(res, err.status || 500, { error: err.message || 'Server error' }))
    if (!configured()) { sendJson(res, 503, { error: 'Facebook / Instagram (GHL) is not set up on the server yet.' }); return true }
    if (pathname === '/api/ghl/conversations' && req.method === 'GET') {
      return run(async () => {
        await staffUser(req)
        const data = await ghl(`/conversations/search?locationId=${q(env().locationId)}&limit=100&sort=desc&sortBy=last_message_date`)
        const list = (data.conversations || []).map(mapConversation).filter(c => c.channel === 'facebook' || c.channel === 'instagram')
        sendJson(res, 200, { conversations: list })
      }), true
    }
    const msgMatch = /^\/api\/ghl\/messages\/([A-Za-z0-9_-]{4,64})$/.exec(pathname)
    if (msgMatch && req.method === 'GET') {
      return run(async () => {
        await staffUser(req)
        const data = await ghl(`/conversations/${msgMatch[1]}/messages?limit=100`)
        const raw = data.messages?.messages || data.messages || []
        const list = (Array.isArray(raw) ? raw : []).map(mapMessage).sort((a, b) => String(a.at).localeCompare(String(b.at)))
        sendJson(res, 200, { messages: list })
      }), true
    }
    if (pathname === '/api/ghl/send' && req.method === 'POST') {
      return run(async () => {
        await staffUser(req); const body = await readJson(req)
        const text = String(body.text || '').trim()
        const type = sendTypeOf(body.channel)
        if (!text) throw Object.assign(new Error('Type a message.'), { status: 400 })
        if (!type || !body.contactId) throw Object.assign(new Error('Only Facebook and Instagram chats can be answered here.'), { status: 400 })
        const sent = await ghl('/conversations/messages', { method: 'POST', body: { type, contactId: String(body.contactId), message: text } })
        sendJson(res, 200, { ok: true, id: sent.messageId || sent.id || null })
      }), true
    }
    if (pathname === '/api/ghl/read' && req.method === 'POST') {
      return run(async () => {
        await staffUser(req); const body = await readJson(req)
        if (!/^[A-Za-z0-9_-]{4,64}$/.test(String(body.conversationId || ''))) throw Object.assign(new Error('Conversation missing.'), { status: 400 })
        await ghl(`/conversations/${body.conversationId}`, { method: 'PUT', body: { locationId: env().locationId, unreadCount: 0 } }).catch(() => {})
        sendJson(res, 200, { ok: true })
      }), true
    }
    sendJson(res, 405, { error: 'Method not allowed' })
    return true
  }
  return { route }
}

module.exports = { createGhl, channelOf, sendTypeOf, mapConversation, mapMessage, configured }
