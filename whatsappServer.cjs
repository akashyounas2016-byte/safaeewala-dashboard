/**
 * R-WA-01: WhatsApp inside the CRM — Meta WhatsApp Cloud API, no GHL in between.
 *
 * Webhook (Meta → us, no sign-in):  GET/POST /api/whatsapp/webhook
 *   - GET answers Meta's verification (hub.verify_token = WHATSAPP_VERIFY_TOKEN)
 *   - POST is accepted only with a valid X-Hub-Signature-256 (HMAC of the raw body with WHATSAPP_APP_SECRET)
 * CRM endpoints (signed-in admin / manager): status, send, send-template, templates, read, media, start
 *
 * Server env (VPS /var/www/safaeewala/.env — never commit):
 *   WHATSAPP_TOKEN            permanent System User access token
 *   WHATSAPP_PHONE_NUMBER_ID  the business number's phone_number_id
 *   WHATSAPP_WABA_ID          WhatsApp Business Account id (for templates)
 *   WHATSAPP_APP_SECRET       Meta app secret (webhook signature)
 *   WHATSAPP_VERIFY_TOKEN     any long random text, also typed into Meta's webhook settings
 *   WHATSAPP_GRAPH_VERSION    optional, default v23.0
 */
const crypto = require('crypto')

const env = () => ({
  token: process.env.WHATSAPP_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  wabaId: process.env.WHATSAPP_WABA_ID || '',
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  graph: `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}`,
})
const configured = () => { const e = env(); return Boolean(e.token && e.phoneNumberId && e.appSecret && e.verifyToken) }
const WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_WEBHOOK = 2 * 1024 * 1024

/** "+971 50 123 4567", "0501234567", "00971…" → "971501234567" (UAE local numbers get 971) */
function normalizeWaId(phone) {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (/^05\d{8}$/.test(d)) d = '971' + d.slice(1)
  return d
}

/** Meta signs the raw body: X-Hub-Signature-256: sha256=<hex HMAC with the app secret> */
function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !header || !String(header).startsWith('sha256=')) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const a = Buffer.from(String(header)); const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker']
/** Text shown in the inbox for any message type */
function bodyOf(m) {
  if (m.type === 'text') return m.text?.body || ''
  if (MEDIA_TYPES.includes(m.type)) return m[m.type]?.caption || ''
  if (m.type === 'location') { const l = m.location || {}; return [l.name, l.address, `${l.latitude},${l.longitude}`].filter(Boolean).join(' · ') }
  if (m.type === 'button') return m.button?.text || ''
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
  if (m.type === 'reaction') return m.reaction?.emoji ? `Reacted ${m.reaction.emoji}` : 'Removed a reaction'
  if (m.type === 'contacts') return (m.contacts || []).map(c => c.name?.formatted_name).filter(Boolean).join(', ')
  return ''
}
const previewOf = (type, body) => (body ? body.slice(0, 120) : ({ image: '📷 Photo', audio: '🎤 Voice note', video: '🎬 Video', document: '📄 Document', sticker: 'Sticker', location: '📍 Location', template: 'Template' })[type] || type)

/** Meta webhook payload → { messages, statuses } for our phone number only */
function parseWebhook(payload, phoneNumberId = '') {
  const messages = []; const statuses = []
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {}
      if (phoneNumberId && v.metadata?.phone_number_id && v.metadata.phone_number_id !== phoneNumberId) continue
      const names = new Map((v.contacts || []).map(c => [c.wa_id, c.profile?.name]))
      for (const m of v.messages || []) {
        const media = MEDIA_TYPES.includes(m.type) ? m[m.type] || {} : null
        messages.push({
          waId: normalizeWaId(m.from), name: names.get(m.from) || null, waMessageId: m.id,
          at: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(), type: m.type || 'text', body: bodyOf(m),
          mediaId: media?.id || null, mediaMime: media?.mime_type || null, mediaName: media?.filename || null,
        })
      }
      for (const s of v.statuses || []) {
        statuses.push({ waMessageId: s.id, status: s.status, error: s.errors?.[0] ? `${s.errors[0].title || ''} ${s.errors[0].message || ''}`.trim() : null })
      }
    }
  }
  return { messages, statuses }
}

const STATUS_RANK = { sent: 1, delivered: 2, read: 3, failed: 4 }
/** A late "delivered" must not overwrite "read" */
const statusAdvances = (current, next) => (STATUS_RANK[next] || 0) > (STATUS_RANK[current] || 0)
const windowOpen = (lastInboundAt, now = Date.now()) => Boolean(lastInboundAt) && now - new Date(lastInboundAt).getTime() < WINDOW_MS

function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = []
    req.on('data', c => { size += c.length; if (size > max) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); return } chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function graph(path, { method = 'GET', body } = {}) {
  const e = env()
  const r = await fetch(`${e.graph}${path}`, { method, headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || `WhatsApp error ${r.status}`), { status: r.status === 401 ? 502 : 400 })
  return data
}

function createWhatsApp({ supa, supabaseUrl, serviceHeaders, sendJson, readJson, activeUserFrom }) {
  const q = encodeURIComponent

  async function matchClient(waId) {
    const rows = await supa('/rest/v1/clients?select=id,phone,whatsapp')
    const tail = waId.slice(-9)
    const hit = (rows || []).find(c => [c.phone, c.whatsapp].some(p => p && normalizeWaId(p).slice(-9) === tail))
    return hit ? hit.id : null
  }

  async function conversationFor(waId, name) {
    const [found] = await supa(`/rest/v1/wa_conversations?wa_id=eq.${q(waId)}&select=*`)
    if (found) {
      if (name && found.name !== name) await supa(`/rest/v1/wa_conversations?id=eq.${found.id}`, { method: 'PATCH', body: { name } })
      return found
    }
    const [created] = await supa('/rest/v1/wa_conversations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { wa_id: waId, name, client_id: await matchClient(waId).catch(() => null) } })
    return created
  }

  async function saveMedia(messageRowId, conversationId, mediaId, mime) {
    const e = env()
    const meta = await graph(`/${mediaId}`)
    const file = await fetch(meta.url, { headers: { Authorization: `Bearer ${e.token}` } })
    if (!file.ok) throw new Error(`media download ${file.status}`)
    const buf = Buffer.from(await file.arrayBuffer())
    const ext = String(mime || meta.mime_type || 'application/octet-stream').split('/')[1]?.split(';')[0] || 'bin'
    const objectPath = `${conversationId}/${messageRowId}.${ext}`
    const up = await fetch(`${supabaseUrl}/storage/v1/object/whatsapp-media/${objectPath}`, {
      method: 'POST', headers: { ...serviceHeaders({ 'Content-Type': mime || meta.mime_type || 'application/octet-stream' }), 'x-upsert': 'true' }, body: buf,
    })
    if (!up.ok) throw new Error(`media upload ${up.status}`)
    await supa(`/rest/v1/wa_messages?id=eq.${messageRowId}`, { method: 'PATCH', body: { media_path: objectPath } })
  }

  async function storeInbound(m) {
    const conv = await conversationFor(m.waId, m.name)
    const rows = await supa('/rest/v1/wa_messages?on_conflict=wa_message_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: { conversation_id: conv.id, wa_message_id: m.waMessageId, direction: 'in', type: m.type, body: m.body, media_id: m.mediaId, media_mime: m.mediaMime, media_name: m.mediaName, status: 'received', created_at: m.at },
    })
    const row = rows && rows[0]
    if (!row) return // Meta sent the same message again
    await supa(`/rest/v1/wa_conversations?id=eq.${conv.id}`, { method: 'PATCH', body: {
      last_message_at: m.at, last_inbound_at: m.at, last_direction: 'in', last_message_preview: previewOf(m.type, m.body), unread_count: (conv.unread_count || 0) + 1,
    } })
    if (m.mediaId) saveMedia(row.id, conv.id, m.mediaId, m.mediaMime).catch(err => console.warn('[WhatsApp] media not saved:', err.message))
  }

  async function storeStatus(s) {
    const [row] = await supa(`/rest/v1/wa_messages?wa_message_id=eq.${q(s.waMessageId)}&select=id,status`)
    if (!row || !statusAdvances(row.status, s.status)) return
    await supa(`/rest/v1/wa_messages?id=eq.${row.id}`, { method: 'PATCH', body: { status: s.status, error: s.error } })
  }

  async function handleWebhook(req, res, parsedUrl) {
    const e = env()
    if (req.method === 'GET') {
      const ok = parsedUrl.searchParams.get('hub.mode') === 'subscribe' && e.verifyToken && parsedUrl.searchParams.get('hub.verify_token') === e.verifyToken
      res.writeHead(ok ? 200 : 403, { 'Content-Type': 'text/plain' })
      return res.end(ok ? String(parsedUrl.searchParams.get('hub.challenge') || '') : 'Forbidden')
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
    if (!configured()) return sendJson(res, 503, { error: 'WhatsApp is not set up on the server' })
    let raw
    try { raw = await readRaw(req, MAX_WEBHOOK) } catch (err) { return sendJson(res, err.status || 400, { error: err.message }) }
    if (!verifySignature(raw, req.headers['x-hub-signature-256'], e.appSecret)) return sendJson(res, 401, { error: 'Invalid signature' })
    sendJson(res, 200, { ok: true }) // answer Meta at once; store afterwards
    let payload
    try { payload = JSON.parse(raw.toString('utf8')) } catch { return }
    const { messages, statuses } = parseWebhook(payload, e.phoneNumberId)
    for (const m of messages) await storeInbound(m).catch(err => console.warn('[WhatsApp] message not stored:', err.message))
    for (const s of statuses) await storeStatus(s).catch(err => console.warn('[WhatsApp] status not stored:', err.message))
  }

  async function staffUser(req) {
    const user = await activeUserFrom(req)
    if (!user) throw Object.assign(new Error('Sign in first.'), { status: 401 })
    if (user.role !== 'admin' && user.role !== 'manager') throw Object.assign(new Error('Only an admin or manager can use WhatsApp.'), { status: 403 })
    return user
  }

  async function sendOut(conv, user, message, record) {
    const sent = await graph(`/${env().phoneNumberId}/messages`, { method: 'POST', body: { messaging_product: 'whatsapp', to: conv.wa_id, ...message } })
    const now = new Date().toISOString()
    const [row] = await supa('/rest/v1/wa_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: {
      conversation_id: conv.id, wa_message_id: sent.messages?.[0]?.id || null, direction: 'out', status: 'sent', sent_by: user.email || user.id, created_at: now, ...record,
    } })
    await supa(`/rest/v1/wa_conversations?id=eq.${conv.id}`, { method: 'PATCH', body: { last_message_at: now, last_direction: 'out', last_message_preview: previewOf(record.type, record.body) } })
    return row
  }

  async function conversationFromBody(body) {
    if (body.conversationId) { const [c] = await supa(`/rest/v1/wa_conversations?id=eq.${q(body.conversationId)}&select=*`); if (c) return c }
    const waId = normalizeWaId(body.to)
    if (waId.length < 8) throw Object.assign(new Error('Enter a valid WhatsApp number.'), { status: 400 })
    return conversationFor(waId, body.name || null)
  }

  /** CRM endpoints; returns false when the path is not a WhatsApp one */
  function route(req, res, parsedUrl, pathname) {
    if (!pathname.startsWith('/api/whatsapp/')) return false
    const run = fn => fn().catch(err => sendJson(res, err.status || 500, { error: err.message || 'Server error' }))
    if (pathname === '/api/whatsapp/status' && req.method === 'GET') {
      return run(async () => { await staffUser(req); sendJson(res, 200, { configured: configured(), templates: Boolean(env().wabaId) }) }), true
    }
    if (!configured()) { sendJson(res, 503, { error: 'WhatsApp is not set up on the server yet.' }); return true }
    if (pathname === '/api/whatsapp/send' && req.method === 'POST') {
      return run(async () => {
        const user = await staffUser(req); const body = await readJson(req)
        const text = String(body.text || '').trim()
        if (!text) throw Object.assign(new Error('Type a message.'), { status: 400 })
        if (text.length > 4096) throw Object.assign(new Error('A message can have at most 4096 characters.'), { status: 400 })
        const conv = await conversationFromBody(body)
        if (!windowOpen(conv.last_inbound_at)) throw Object.assign(new Error('More than 24 hours since the client last wrote — send an approved template instead.'), { status: 409 })
        sendJson(res, 200, await sendOut(conv, user, { type: 'text', text: { body: text, preview_url: true } }, { type: 'text', body: text }))
      }), true
    }
    if (pathname === '/api/whatsapp/send-template' && req.method === 'POST') {
      return run(async () => {
        const user = await staffUser(req); const body = await readJson(req)
        if (!body.name || !body.language) throw Object.assign(new Error('Choose a template.'), { status: 400 })
        const params = Array.isArray(body.params) ? body.params.map(p => String(p)) : []
        const conv = await conversationFromBody(body)
        const template = { name: body.name, language: { code: body.language }, ...(params.length ? { components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }] } : {}) }
        const preview = String(body.preview || `Template: ${body.name}`)
        sendJson(res, 200, await sendOut(conv, user, { type: 'template', template }, { type: 'template', body: preview, template_name: body.name }))
      }), true
    }
    if (pathname === '/api/whatsapp/templates' && req.method === 'GET') {
      return run(async () => {
        await staffUser(req)
        if (!env().wabaId) return sendJson(res, 200, { templates: [] })
        const data = await graph(`/${env().wabaId}/message_templates?fields=name,language,status,category,components&limit=200`)
        sendJson(res, 200, { templates: (data.data || []).filter(t => t.status === 'APPROVED') })
      }), true
    }
    if (pathname === '/api/whatsapp/read' && req.method === 'POST') {
      return run(async () => {
        await staffUser(req); const body = await readJson(req)
        const [conv] = await supa(`/rest/v1/wa_conversations?id=eq.${q(body.conversationId || '')}&select=id,unread_count`)
        if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 })
        if (conv.unread_count) {
          await supa(`/rest/v1/wa_conversations?id=eq.${conv.id}`, { method: 'PATCH', body: { unread_count: 0 } })
          const [last] = await supa(`/rest/v1/wa_messages?conversation_id=eq.${conv.id}&direction=eq.in&order=created_at.desc&limit=1&select=wa_message_id`)
          if (last?.wa_message_id) await graph(`/${env().phoneNumberId}/messages`, { method: 'POST', body: { messaging_product: 'whatsapp', status: 'read', message_id: last.wa_message_id } }).catch(() => {})
        }
        sendJson(res, 200, { ok: true })
      }), true
    }
    if (pathname === '/api/whatsapp/start' && req.method === 'POST') {
      return run(async () => { await staffUser(req); const body = await readJson(req); const conv = await conversationFromBody(body); sendJson(res, 200, { id: conv.id }) }), true
    }
    const mediaMatch = /^\/api\/whatsapp\/media\/([0-9a-f-]{36})$/.exec(pathname)
    if (mediaMatch && req.method === 'GET') {
      return run(async () => {
        await staffUser(req)
        const [row] = await supa(`/rest/v1/wa_messages?id=eq.${mediaMatch[1]}&select=media_path`)
        if (!row?.media_path) throw Object.assign(new Error('The file is not stored yet.'), { status: 404 })
        const signed = await supa(`/storage/v1/object/sign/whatsapp-media/${row.media_path}`, { method: 'POST', body: { expiresIn: 300 } })
        sendJson(res, 200, { url: `${supabaseUrl}/storage/v1${signed.signedURL || signed.signedUrl}` })
      }), true
    }
    sendJson(res, 404, { error: 'Not found' })
    return true
  }

  return { handleWebhook, route }
}

module.exports = { createWhatsApp, normalizeWaId, verifySignature, parseWebhook, statusAdvances, windowOpen, previewOf, configured }
