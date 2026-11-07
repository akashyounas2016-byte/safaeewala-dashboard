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

// ── R-WA-02: automation helpers (pure, tested) ──
/** Dubai weekday (0 = Sunday) and "HH:MM" */
function dubaiClock(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dubai', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]))
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), time: `${parts.hour}:${parts.minute}` }
}
/** hours = { days: [0..6], from: "09:00", to: "20:00" } — no hours saved means always open */
function withinHours(hours, date = new Date()) {
  if (!hours || !Array.isArray(hours.days) || !hours.from || !hours.to) return true
  const { day, time } = dubaiClock(date)
  return hours.days.includes(day) && time >= hours.from && time < hours.to
}
/** First enabled keyword rule that matches the text (case-insensitive) */
function matchKeyword(rules, text) {
  const t = String(text || '').trim().toLowerCase()
  if (!t) return null
  return (rules || []).find(r => r.kind === 'keyword' && r.enabled && (r.keywords || []).some(k => {
    const w = String(k || '').trim().toLowerCase()
    if (!w) return false
    return r.match === 'exact' ? t === w : t.includes(w)
  })) || null
}
/** "{name}" in a broadcast value becomes the recipient's name */
const fillName = (params, name) => (params || []).map(p => String(p).replace(/\{name\}/gi, name || 'there'))

// ── R-WA-03 helpers (pure, tested) ──
/** A client writing STOP / UNSUBSCRIBE opts out of campaigns; START / SUBSCRIBE opts back in */
function optOutWord(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '')
  if (['stop', 'unsubscribe', 'stop all', 'band karo'].includes(t)) return 'stop'
  if (['start', 'subscribe', 'unstop'].includes(t)) return 'start'
  return null
}
/** Round-robin: the agent after the last one assigned (agents = profile ids in order) */
function nextAgent(agents, last) {
  const list = (agents || []).filter(Boolean)
  if (!list.length) return null
  const i = list.indexOf(last)
  return list[(i + 1) % list.length]
}
/**
 * Retarget: which recipients of an earlier campaign get the new one.
 * no_reply = sent, but the person has not written since the campaign; not_read = sent, never read; failed = not delivered.
 */
function retargetPick(recipients, { repliedWaIds, statusByWamid }, rule) {
  return (recipients || []).filter(r => {
    if (rule === 'failed') return r.status === 'failed'
    if (r.status !== 'sent') return false
    if (rule === 'no_reply') return !repliedWaIds.has(r.wa_id)
    if (rule === 'not_read') return statusByWamid.get(r.wa_message_id) !== 'read'
    return false
  })
}
/** R-WA-03: Meta template components — optional text header (60), body with examples, optional footer (60), up to 3 quick-reply buttons (25) */
function buildTemplateComponents({ header, body, examples = [], footer, buttons }) {
  const out = []
  const h = String(header || '').trim()
  if (h) {
    if (h.length > 60 || /\{\{\d+\}\}/.test(h)) throw Object.assign(new Error('The header has at most 60 characters and no {{n}} values.'), { status: 400 })
    out.push({ type: 'HEADER', format: 'TEXT', text: h })
  }
  out.push({ type: 'BODY', text: body, ...(examples.length ? { example: { body_text: [examples] } } : {}) })
  const f = String(footer || '').trim()
  if (f) {
    if (f.length > 60) throw Object.assign(new Error('The footer has at most 60 characters.'), { status: 400 })
    out.push({ type: 'FOOTER', text: f })
  }
  const b = (Array.isArray(buttons) ? buttons : []).map(x => String(x || '').trim()).filter(Boolean)
  if (b.length > 3 || b.some(x => x.length > 25)) throw Object.assign(new Error('At most 3 buttons, 25 characters each.'), { status: 400 })
  if (b.length) out.push({ type: 'BUTTONS', buttons: b.map(text => ({ type: 'QUICK_REPLY', text })) })
  return out
}
// ── R-WA-04 helpers (pure, tested) ──
/** Dubai calendar date, offset by whole days */
function dubaiDate(offsetDays = 0, now = Date.now()) {
  return new Date(now + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
}
/** Template values: {name} {date} {time} {service} {address} {amount} {balance} {cleaner} from the job */
function fillTokens(params, ctx) {
  return (params || []).map(p => String(p).replace(/\{(\w+)\}/g, (m, k) => (ctx[k] !== undefined && ctx[k] !== null && ctx[k] !== '' ? String(ctx[k]) : m === '{name}' ? 'there' : '-')))
}
/** Template values from a booking row */
function jobContext(b) {
  if (!b) return {}
  const total = Number(b.total_amount) || 0; const paid = Number(b.received_amount) || 0
  const d = b.scheduled_date ? new Date(`${b.scheduled_date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }) : ''
  return { date: d, time: b.scheduled_time || '', service: b.service_type || '', address: b.service_address || '', amount: total ? `AED ${total}` : '', balance: total - paid > 0 ? `AED ${total - paid}` : '' }
}
/** WhatsApp message type for a file */
function mediaKind(mime) {
  const m = String(mime || '').toLowerCase()
  if (/^image\/(jpeg|png)$/.test(m)) return 'image'
  if (/^video\/(mp4|3gpp)$/.test(m)) return 'video'
  if (/^audio\//.test(m)) return 'audio'
  return 'document'
}
/** The notifications that are switched on and have a template (master switch off = none) */
function activeNotifications(settings) {
  if (!settings || settings.master === false) return {}
  const out = {}
  for (const k of ['confirm', 'reminder', 'on_way', 'feedback', 'payment']) if (settings[k] && settings[k].enabled && settings[k].template) out[k] = settings[k]
  return out
}

/** A deal-stage rule fires when the deal moves into its "to" stage (from its "from" stage, or from any stage) */
const stageRuleMatches = (rule, from, to) => rule.kind === 'deal_stage' && rule.enabled && rule.to_stage === to && (!rule.from_stage || rule.from_stage === from)

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

function createWhatsApp({ supa, supabaseUrl, serviceHeaders, sendJson, readJson, activeUserFrom, scheduler = true }) {
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
    return { ...created, isNew: true }
  }

  // R-WA-02: rules and hours are read at most every 30 s (they change rarely; the webhook is hot)
  let cache = { at: 0, rules: [], hours: null, assignment: null, notifications: null }
  async function automation() {
    if (Date.now() - cache.at < 30000) return cache
    try {
      const rules = await supa('/rest/v1/wa_rules?select=*&order=created_at.asc')
      const settings = await supa('/rest/v1/wa_settings?key=in.(hours,assignment,notifications)&select=key,value')
      const val = k => (settings || []).find(s => s.key === k)?.value || null
      cache = { at: Date.now(), rules: rules || [], hours: val('hours'), assignment: val('assignment'), notifications: val('notifications') }
    } catch { cache = { at: Date.now(), rules: [], hours: null, assignment: null, notifications: null } } // tables not created yet: no automation
    return cache
  }
  /** R-WA-03: a note on the chat's history (assignment / status); quiet when the table is missing */
  const chatNote = (conversationId, kind, body, author) =>
    supa('/rest/v1/wa_notes', { method: 'POST', body: { conversation_id: conversationId, kind, body, author } }).catch(() => {})

  /** R-WA-03: a new chat goes to the next agent when the assignment mode is round-robin */
  async function autoAssign(conv) {
    const { assignment } = await automation()
    if (!assignment || assignment.mode !== 'round_robin') return null
    const agent = nextAgent(assignment.agents, assignment.last)
    if (!agent) return null
    await supa(`/rest/v1/wa_conversations?id=eq.${conv.id}`, { method: 'PATCH', body: { assigned_to: agent } })
    const next = { ...assignment, last: agent }
    await supa('/rest/v1/wa_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: { key: 'assignment', value: next, updated_at: new Date().toISOString() } })
    cache.assignment = next
    await chatNote(conv.id, 'assign', `Assigned to ${agent} (round-robin)`, 'automation')
    return agent
  }
  const invalidate = () => { cache.at = 0 }

  async function autoReply(conv, rule) {
    const sent = await sendOut(conv, { email: 'automation' }, { type: 'text', text: { body: rule.reply } }, { type: 'text', body: rule.reply, rule_id: rule.id })
    const next = (rule.fire_count || 0) + 1
    await supa(`/rest/v1/wa_rules?id=eq.${rule.id}`, { method: 'PATCH', body: { fire_count: next, last_fired_at: new Date().toISOString() } })
    rule.fire_count = next // keep the cached copy in step
    return sent
  }

  /** Keyword reply first; otherwise a welcome for a new chat; and an away note outside business hours (once per 12 h per chat) */
  async function runAutomation(conv, m) {
    const { rules, hours, notifications } = await automation()
    if (!rules.length) return
    if (notifications && notifications.master === false) return // R-WA-04: master switch pauses every automatic message
    const kw = m.type === 'text' || m.type === 'button' || m.type === 'interactive' ? matchKeyword(rules, m.body) : null
    if (kw) { await autoReply(conv, kw); return }
    const welcome = rules.find(r => r.kind === 'welcome' && r.enabled)
    let replied = false
    if (conv.isNew && welcome) { await autoReply(conv, welcome); replied = true }
    const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString()
    const sentRecently = async rule => {
      const recent = await supa(`/rest/v1/wa_messages?conversation_id=eq.${conv.id}&rule_id=eq.${rule.id}&created_at=gt.${q(since)}&select=id&limit=1`)
      return Boolean(recent && recent.length)
    }
    const away = rules.find(r => r.kind === 'away' && r.enabled)
    if (away && !withinHours(hours) && !(await sentRecently(away))) { await autoReply(conv, away); replied = true }
    // R-WA-03: no keyword matched and nothing else was sent → the fallback reply (once every 12 h per chat)
    const fallback = rules.find(r => r.kind === 'fallback' && r.enabled && r.reply)
    if (!replied && fallback && m.type === 'text' && !(await sentRecently(fallback))) await autoReply(conv, fallback)
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
    const patch = { last_message_at: m.at, last_inbound_at: m.at, last_direction: 'in', last_message_preview: previewOf(m.type, m.body), unread_count: (conv.unread_count || 0) + 1 }
    // R-WA-03 (only once the columns exist): a resolved / snoozed chat opens again; STOP / START change the opt-out
    const hasCrm = 'status' in conv
    if (hasCrm && (conv.status === 'resolved' || conv.status === 'snoozed')) { patch.status = 'open'; patch.snoozed_until = null }
    const opt = hasCrm && m.type === 'text' ? optOutWord(m.body) : null
    if (opt) patch.unsubscribed = opt === 'stop'
    await supa(`/rest/v1/wa_conversations?id=eq.${conv.id}`, { method: 'PATCH', body: patch })
    if (m.mediaId) saveMedia(row.id, conv.id, m.mediaId, m.mediaMime).catch(err => console.warn('[WhatsApp] media not saved:', err.message))
    if (hasCrm && conv.isNew && !conv.assigned_to) await autoAssign(conv).catch(err => console.warn('[WhatsApp] assign:', err.message))
    if (opt) {
      await chatNote(conv.id, 'status', opt === 'stop' ? 'Client opted out of campaigns (STOP)' : 'Client opted in again (START)', 'automation')
      const text = opt === 'stop' ? 'You will not get offers from Safaeewala on WhatsApp any more. Reply START to subscribe again.' : 'Welcome back — you will get Safaeewala updates again.'
      await sendOut(conv, { email: 'automation' }, { type: 'text', text: { body: text } }, { type: 'text', body: text }).catch(err => console.warn('[WhatsApp] opt-out reply:', err.message))
      return // no other automatic reply to STOP / START
    }
    await runAutomation(conv, m).catch(err => console.warn('[WhatsApp] automation:', err.message))
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

  /** R-WA-03: send the pending recipients of a campaign one by one; opted-out clients are skipped */
  async function sendBroadcast(bc) {
    if (bc.status === 'scheduled') await supa(`/rest/v1/wa_broadcasts?id=eq.${bc.id}`, { method: 'PATCH', body: { status: 'sending' } })
    const rows = await supa(`/rest/v1/wa_broadcast_recipients?broadcast_id=eq.${bc.id}&status=eq.pending&select=*&order=created_at.asc&limit=1000`)
    const sender = { email: bc.created_by || 'campaign' }
    const params = Array.isArray(bc.params) ? bc.params : []
    let sent = bc.sent || 0; let failed = bc.failed || 0
    for (const row of rows || []) {
      try {
        const conv = await conversationFor(row.wa_id, row.name)
        if (conv.unsubscribed) {
          await supa(`/rest/v1/wa_broadcast_recipients?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'skipped', error: 'Opted out (STOP)' } })
          continue
        }
        const filled = fillName(params, row.name)
        const template = { name: bc.template_name, language: { code: bc.language }, ...(filled.length ? { components: [{ type: 'body', parameters: filled.map(text => ({ type: 'text', text })) }] } : {}) }
        const preview = String(bc.preview || `Template: ${bc.template_name}`).replace(/\{name\}/gi, row.name || 'there')
        const msg = await sendOut(conv, sender, { type: 'template', template }, { type: 'template', body: preview, template_name: bc.template_name })
        await supa(`/rest/v1/wa_broadcast_recipients?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'sent', wa_message_id: msg?.wa_message_id || null } }); sent++
      } catch (err) {
        failed++
        await supa(`/rest/v1/wa_broadcast_recipients?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'failed', error: String(err.message).slice(0, 300) } }).catch(() => {})
      }
      await supa(`/rest/v1/wa_broadcasts?id=eq.${bc.id}`, { method: 'PATCH', body: { sent, failed } }).catch(() => {})
      await new Promise(r => setTimeout(r, 250)) // stay well under Meta's per-second limit
    }
    await supa(`/rest/v1/wa_broadcasts?id=eq.${bc.id}`, { method: 'PATCH', body: { status: sent ? 'done' : 'failed', finished_at: new Date().toISOString() } }).catch(() => {})
  }

  /** R-WA-03: recipients of an earlier campaign that match the retarget rule */
  async function retargetRecipients(sourceId, rule) {
    const [src] = await supa(`/rest/v1/wa_broadcasts?id=eq.${q(sourceId)}&select=id,created_at`)
    if (!src) throw Object.assign(new Error('That campaign was not found.'), { status: 404 })
    const recips = await supa(`/rest/v1/wa_broadcast_recipients?broadcast_id=eq.${src.id}&select=wa_id,name,status,wa_message_id&limit=1000`) || []
    const repliedWaIds = new Set(); const statusByWamid = new Map()
    const chunks = (arr, n = 80) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))
    if (rule === 'no_reply') {
      for (const part of chunks(recips.map(r => r.wa_id))) {
        const convs = await supa(`/rest/v1/wa_conversations?wa_id=in.(${part.map(q).join(',')})&select=id,wa_id`) || []
        if (!convs.length) continue
        const ins = await supa(`/rest/v1/wa_messages?conversation_id=in.(${convs.map(c => c.id).join(',')})&direction=eq.in&created_at=gt.${q(src.created_at)}&select=conversation_id`) || []
        const byId = new Map(convs.map(c => [c.id, c.wa_id]))
        ins.forEach(m => repliedWaIds.add(byId.get(m.conversation_id)))
      }
    }
    if (rule === 'not_read') {
      for (const part of chunks(recips.map(r => r.wa_message_id).filter(Boolean))) {
        const msgs = await supa(`/rest/v1/wa_messages?wa_message_id=in.(${part.map(x => `"${x}"`).map(q).join(',')})&select=wa_message_id,status`) || []
        msgs.forEach(m => statusByWamid.set(m.wa_message_id, m.status))
      }
    }
    return retargetPick(recips, { repliedWaIds, statusByWamid }, rule)
  }

  // ── R-WA-04: automatic client notifications (each with its own on/off, plus a master switch) ──
  /** Send one notification template once per (kind, ref): the log row is claimed first, so two ticks never double-send */
  async function notify(kind, ref, phone, name, ctx, cfg, by = 'automation') {
    const waId = normalizeWaId(phone)
    if (waId.length < 8) return 'no-number'
    const claim = await supa('/rest/v1/wa_notification_log?on_conflict=kind,ref', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: { kind, ref: String(ref), wa_id: waId, sent_by: by } })
    if (!claim || !claim.length) return 'already'
    try {
      const conv = await conversationFor(waId, name || null)
      const values = fillTokens(cfg.params || [], { name, ...ctx })
      const template = { name: cfg.template, language: { code: cfg.language || 'en' }, ...(values.length ? { components: [{ type: 'body', parameters: values.map(text => ({ type: 'text', text })) }] } : {}) }
      await sendOut(conv, { email: by }, { type: 'template', template }, { type: 'template', body: `${({ confirm: 'Booking confirmation', reminder: 'Booking reminder', on_way: 'Team on the way', feedback: 'Feedback request', payment: 'Payment reminder' })[kind] || kind}: ${cfg.template}`, template_name: cfg.template })
      return 'sent'
    } catch (err) {
      await supa(`/rest/v1/wa_notification_log?id=eq.${claim[0].id}`, { method: 'PATCH', body: { status: 'failed', error: String(err.message).slice(0, 300) } }).catch(() => {})
      return 'failed'
    }
  }

  /** Phone + name + template values for a booking (and the job sheet row that belongs to it) */
  async function bookingContacts(bookings) {
    const clients = await supa('/rest/v1/clients?select=id,full_name,phone,whatsapp,building_name') || []
    return bookings.map(b => {
      const c = clients.find(x => x.id === b.client_id)
      return { ref: b.id, phone: b.client_phone || c?.whatsapp || c?.phone || '', name: b.client_name || c?.full_name || '', ctx: jobContext(b) }
    })
  }

  let running = false
  /** Called every minute by the server: confirmations, day-before reminders, "on the way", feedback requests */
  async function runNotifications(now = Date.now()) {
    if (running) return { skipped: true }
    running = true
    const sent = []
    try {
      const { notifications } = await automation()
      const on = activeNotifications(notifications)
      if (!Object.keys(on).length) return { sent }
      const today = dubaiDate(0, now); const tomorrow = dubaiDate(1, now); const yesterday = dubaiDate(-1, now)
      const { time } = dubaiClock(new Date(now))
      const cols = 'id,client_id,client_name,client_phone,service_address,service_type,status,scheduled_date,scheduled_time,end_time,total_amount,received_amount,created_at'
      let budget = 30 // per minute, well under Meta's limits
      const run = async (kind, list) => {
        for (const x of list) {
          if (budget <= 0) return
          const r = await notify(kind, x.ref, x.phone, x.name, x.ctx, on[kind])
          if (r === 'sent' || r === 'failed') { budget--; sent.push(`${kind}:${x.ref}:${r}`) }
        }
      }
      if (on.confirm && on.confirm.since) {
        // only bookings made after the switch was turned on — never a flood of old bookings
        const rows = await supa(`/rest/v1/bookings?scheduled_date=gte.${today}&select=${cols}&limit=300`) || []
        const fresh = rows.filter(b => String(b.created_at || '') >= on.confirm.since && !/cancel/i.test(b.status || ''))
        await run('confirm', await bookingContacts(fresh))
      }
      if (on.reminder && time >= (on.reminder.hour || '18:00')) {
        const rows = await supa(`/rest/v1/bookings?scheduled_date=eq.${tomorrow}&select=${cols}&limit=300`) || []
        await run('reminder', await bookingContacts(rows.filter(b => !/cancel|complet/i.test(b.status || ''))))
      }
      if (on.feedback && time >= (on.feedback.hour || '10:00')) {
        const rows = await supa(`/rest/v1/bookings?scheduled_date=in.(${yesterday},${today})&status=eq.completed&select=${cols}&limit=300`) || []
        const jobsDone = await supa(`/rest/v1/daily_jobs?date=in.(${yesterday},${today})&status=eq.completed&booking_id=not.is.null&select=booking_id&limit=500`).catch(() => []) || []
        const more = jobsDone.length ? await supa(`/rest/v1/bookings?id=in.(${[...new Set(jobsDone.map(j => j.booking_id))].map(q).join(',')})&select=${cols}`) || [] : []
        const all = [...new Map([...rows, ...more].map(b => [b.id, b])).values()]
        await run('feedback', await bookingContacts(all))
      }
      if (on.on_way) {
        const since = new Date(now - 45 * 60000).toISOString()
        const checks = await supa(`/rest/v1/job_checkins?status=eq.on_way&on_way_at=gt.${q(since)}&select=job_id,cleaner`).catch(() => []) || []
        if (checks.length) {
          const jobIds = [...new Set(checks.map(c => c.job_id))]
          const jobs = await supa(`/rest/v1/daily_jobs?id=in.(${jobIds.map(q).join(',')})&select=id,booking_id,address,area,start_time,service,date`) || []
          const bIds = jobs.map(j => j.booking_id).filter(Boolean)
          const bookings = bIds.length ? await supa(`/rest/v1/bookings?id=in.(${bIds.map(q).join(',')})&select=${cols}`) || [] : []
          const clients = await supa('/rest/v1/clients?select=id,full_name,phone,whatsapp,building_name') || []
          const list = jobs.map(j => {
            const b = bookings.find(x => x.id === j.booking_id)
            const c = (b && clients.find(x => x.id === b.client_id)) || clients.find(x => x.building_name && j.address && x.building_name.trim().toLowerCase() === String(j.address).trim().toLowerCase())
            const cleaner = checks.filter(k => k.job_id === j.id).map(k => k.cleaner).join(', ')
            return { ref: j.id, phone: b?.client_phone || c?.whatsapp || c?.phone || '', name: b?.client_name || c?.full_name || '', ctx: { ...jobContext(b || { scheduled_date: j.date, scheduled_time: j.start_time, service_type: j.service, service_address: j.address }), cleaner } }
          })
          await run('on_way', list)
        }
      }
      return { sent }
    } finally { running = false }
  }

  // R-WA-03: scheduled campaigns go out within a minute of their time (checked by the server, not a browser)
  if (scheduler) {
    const tick = async () => {
      if (!configured()) return
      try {
        const due = await supa(`/rest/v1/wa_broadcasts?status=eq.scheduled&scheduled_at=lte.${q(new Date().toISOString())}&select=*&limit=5`) || []
        for (const bc of due) {
          // claim it first, so two ticks never send the same campaign
          const claimed = await supa(`/rest/v1/wa_broadcasts?id=eq.${bc.id}&status=eq.scheduled`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { status: 'sending' } })
          if (claimed && claimed.length) await sendBroadcast({ ...bc, status: 'sending' })
        }
      } catch { /* tables not created yet */ }
      await runNotifications().catch(err => console.warn('[WhatsApp] notifications:', err.message))
    }
    setInterval(() => void tick(), 60000).unref()
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
    // R-WA-04: a notification sent by hand (payment reminder, "on the way") — uses the template set for that kind;
    // payment reminders at most once a day per job
    if (pathname === '/api/whatsapp/notify' && req.method === 'POST') {
      return run(async () => {
        const user = await staffUser(req); const body = await readJson(req)
        if (!configured()) throw Object.assign(new Error('WhatsApp is not set up on the server yet.'), { status: 503 })
        const { notifications } = await automation()
        const cfg = activeNotifications(notifications)[body.kind]
        if (!cfg) throw Object.assign(new Error('This notification is switched off or has no template (Settings → Notifications).'), { status: 400 })
        const ref = body.kind === 'payment' ? `${body.ref}:${dubaiDate(0)}` : String(body.ref || '')
        if (!ref) throw Object.assign(new Error('Which job?'), { status: 400 })
        const r = await notify(body.kind, ref, body.to, body.name || '', body.values || {}, cfg, user.email || user.id)
        if (r === 'already') throw Object.assign(new Error(body.kind === 'payment' ? 'A payment reminder already went to this client today.' : 'Already sent for this job.'), { status: 409 })
        if (r === 'no-number') throw Object.assign(new Error('No WhatsApp number for this client.'), { status: 400 })
        if (r === 'failed') throw Object.assign(new Error('Meta did not accept the message — see the chat for the reason.'), { status: 502 })
        sendJson(res, 200, { ok: true })
      }), true
    }
    // R-INBOX-03: send a photo / file (up to 16 MB) inside the 24-hour window; a copy is kept in the private bucket
    if (pathname === '/api/whatsapp/send-media' && req.method === 'POST') {
      return run(async () => {
        const user = await staffUser(req); const body = await readJson(req, 23 * 1024 * 1024)
        if (!configured()) throw Object.assign(new Error('WhatsApp is not set up on the server yet.'), { status: 503 })
        const buf = Buffer.from(String(body.base64 || ''), 'base64')
        if (!buf.length) throw Object.assign(new Error('Choose a file.'), { status: 400 })
        if (buf.length > 16 * 1024 * 1024) throw Object.assign(new Error('A file can be at most 16 MB.'), { status: 413 })
        const conv = await conversationFromBody(body)
        if (!windowOpen(conv.last_inbound_at)) throw Object.assign(new Error('More than 24 hours since the client last wrote — send an approved template first.'), { status: 409 })
        const mime = String(body.mime || 'application/octet-stream')
        const kind = mediaKind(mime)
        const filename = String(body.filename || 'file').replace(/[^\w. -]/g, '_').slice(0, 100)
        const e = env()
        const form = new FormData()
        form.append('messaging_product', 'whatsapp'); form.append('type', mime)
        form.append('file', new Blob([buf], { type: mime }), filename)
        const up = await fetch(`${e.graph}/${e.phoneNumberId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${e.token}` }, body: form })
        const upJson = await up.json().catch(() => ({}))
        if (!up.ok || !upJson.id) throw Object.assign(new Error(upJson?.error?.message || 'Meta did not accept the file.'), { status: 400 })
        const caption = String(body.caption || '').slice(0, 1024)
        const payload = { id: upJson.id, ...(caption && kind !== 'audio' ? { caption } : {}), ...(kind === 'document' ? { filename } : {}) }
        const row = await sendOut(conv, user, { type: kind, [kind]: payload }, { type: kind, body: caption || null, media_mime: mime, media_name: filename })
        const ext = (filename.includes('.') ? filename.split('.').pop() : mime.split('/')[1] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
        const objectPath = `${conv.id}/${row.id}.${ext}`
        const st = await fetch(`${supabaseUrl}/storage/v1/object/whatsapp-media/${objectPath}`, { method: 'POST', headers: { ...serviceHeaders({ 'Content-Type': mime }), 'x-upsert': 'true' }, body: buf })
        if (st.ok) await supa(`/rest/v1/wa_messages?id=eq.${row.id}`, { method: 'PATCH', body: { media_path: objectPath } })
        sendJson(res, 200, { ...row, media_path: st.ok ? objectPath : null })
      }), true
    }
    // R-WA-03: the people a chat or deal can be given to (admins and managers) — works before Meta is connected
    if (pathname === '/api/whatsapp/agents' && req.method === 'GET') {
      return run(async () => {
        await staffUser(req)
        const rows = await supa("/rest/v1/profiles?role=in.(admin,manager)&status=eq.active&select=id,full_name,login_id,role&order=full_name.asc")
        sendJson(res, 200, { agents: (rows || []).map(r => ({ id: r.id, name: r.full_name || r.login_id || 'User', role: r.role })) })
      }), true
    }
    // R-INBOX-02: delete every WhatsApp chat in the CRM (messages, notes and media go with them) — admin only,
    // typed confirmation. Facebook / Instagram chats live in GHL and are not touched. Works before Meta is connected.
    if (pathname === '/api/whatsapp/delete-all' && req.method === 'POST') {
      return run(async () => {
        const user = await staffUser(req)
        if (user.role !== 'admin') throw Object.assign(new Error('Only an admin can delete all conversations.'), { status: 403 })
        const body = await readJson(req)
        if (body.confirm !== 'DELETE') throw Object.assign(new Error('Type DELETE to confirm.'), { status: 400 })
        const convs = await supa('/rest/v1/wa_conversations?select=id') || []
        let files = 0
        for (const c of convs) {
          const objs = await supa('/storage/v1/object/list/whatsapp-media', { method: 'POST', body: { prefix: c.id, limit: 1000 } }).catch(() => []) || []
          const paths = objs.filter(o => o && o.name).map(o => `${c.id}/${o.name}`)
          if (paths.length) { await supa('/storage/v1/object/whatsapp-media', { method: 'DELETE', body: { prefixes: paths } }).catch(() => {}); files += paths.length }
        }
        if (convs.length) await supa('/rest/v1/wa_conversations?id=not.is.null', { method: 'DELETE' })
        console.log(`[WhatsApp] all conversations deleted by ${user.email || user.id}: ${convs.length} chats, ${files} files`)
        sendJson(res, 200, { deleted: convs.length, files })
      }), true
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
        const data = await graph(`/${env().wabaId}/message_templates?fields=name,language,status,category,components,rejected_reason&limit=200`)
        const all = parsedUrl.searchParams.get('all') === '1' // R-WA-02: the Templates tab shows pending / rejected too
        sendJson(res, 200, { templates: (data.data || []).filter(t => all || t.status === 'APPROVED') })
      }), true
    }
    // R-WA-02: create a template (Meta reviews it) / delete one
    if (pathname === '/api/whatsapp/templates' && req.method === 'POST') {
      return run(async () => {
        await staffUser(req); const body = await readJson(req)
        if (!env().wabaId) throw Object.assign(new Error('WHATSAPP_WABA_ID is not set on the server.'), { status: 400 })
        const name = String(body.name || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
        const text = String(body.body || '').trim()
        if (!name || !text) throw Object.assign(new Error('Name and message text are required.'), { status: 400 })
        if (!['UTILITY', 'MARKETING'].includes(body.category)) throw Object.assign(new Error('Choose Utility or Marketing.'), { status: 400 })
        const count = new Set(text.match(/\{\{\d+\}\}/g) || []).size
        const examples = (Array.isArray(body.examples) ? body.examples : []).map(String)
        if (examples.length < count || examples.slice(0, count).some(x => !x.trim())) throw Object.assign(new Error('Give an example for every {{n}} value — Meta needs them for review.'), { status: 400 })
        const components = buildTemplateComponents({ header: body.header, body: text, examples: examples.slice(0, count), footer: body.footer, buttons: body.buttons })
        const created = await graph(`/${env().wabaId}/message_templates`, { method: 'POST', body: { name, category: body.category, language: String(body.language || 'en'), components } })
        sendJson(res, 200, { id: created.id, status: created.status, name })
      }), true
    }
    if (pathname === '/api/whatsapp/templates' && req.method === 'DELETE') {
      return run(async () => {
        await staffUser(req)
        const name = parsedUrl.searchParams.get('name') || ''
        if (!name || !env().wabaId) throw Object.assign(new Error('Template name missing.'), { status: 400 })
        await graph(`/${env().wabaId}/message_templates?name=${q(name)}`, { method: 'DELETE' })
        sendJson(res, 200, { ok: true })
      }), true
    }
    // R-WA-02: Settings — the number as Meta sees it, and whether our app gets its messages
    if (pathname === '/api/whatsapp/phone' && req.method === 'GET') {
      return run(async () => {
        await staffUser(req)
        const e = env()
        const phone = await graph(`/${e.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,name_status,code_verification_status,platform_type,throughput`)
        const subs = e.wabaId ? await graph(`/${e.wabaId}/subscribed_apps`).catch(() => null) : null
        sendJson(res, 200, { phone, subscribed: subs ? (subs.data || []).length > 0 : null })
      }), true
    }
    // R-WA-02: register the number on the Cloud API (6-digit PIN) and subscribe the WhatsApp account to our app
    if (pathname === '/api/whatsapp/connect' && req.method === 'POST') {
      return run(async () => {
        const user = await staffUser(req)
        if (user.role !== 'admin') throw Object.assign(new Error('Only an admin can connect the number.'), { status: 403 })
        const body = await readJson(req); const e = env(); const done = []
        const pin = String(body.pin || '').trim()
        if (pin) {
          if (!/^\d{6}$/.test(pin)) throw Object.assign(new Error('The PIN has 6 digits.'), { status: 400 })
          await graph(`/${e.phoneNumberId}/register`, { method: 'POST', body: { messaging_product: 'whatsapp', pin } }); done.push('registered')
        }
        if (e.wabaId) { await graph(`/${e.wabaId}/subscribed_apps`, { method: 'POST' }); done.push('subscribed') }
        sendJson(res, 200, { ok: true, done })
      }), true
    }
    // R-WA-02 / R-WA-03: Campaign — an approved template to many numbers: now, at a set time, or again to the
    // people of an earlier campaign who did not reply / read / get it (retarget)
    if (pathname === '/api/whatsapp/broadcast' && req.method === 'POST') {
      return run(async () => {
        const user = await staffUser(req); const body = await readJson(req)
        const name = String(body.name || '').trim() || `Campaign ${new Date().toISOString().slice(0, 10)}`
        if (!body.templateName || !body.language) throw Object.assign(new Error('Choose an approved template.'), { status: 400 })
        let input = Array.isArray(body.recipients) ? body.recipients : []
        if (body.retargetOf) {
          if (!['no_reply', 'not_read', 'failed'].includes(body.retargetRule)) throw Object.assign(new Error('Choose who to retarget.'), { status: 400 })
          input = (await retargetRecipients(String(body.retargetOf), body.retargetRule)).map(r => ({ to: r.wa_id, name: r.name }))
        }
        const seen = new Set()
        const recipients = input
          .map(r => ({ waId: normalizeWaId(r.to), name: r.name ? String(r.name) : null }))
          .filter(r => r.waId.length >= 8 && !seen.has(r.waId) && seen.add(r.waId))
        if (!recipients.length) throw Object.assign(new Error(body.retargetOf ? 'Nobody in that campaign matches — nothing to send.' : 'Add at least one valid number.'), { status: 400 })
        if (recipients.length > 1000) throw Object.assign(new Error('At most 1000 numbers per campaign.'), { status: 400 })
        const at = body.scheduledAt ? new Date(body.scheduledAt) : null
        if (at && (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60000)) throw Object.assign(new Error('Choose a time in the future.'), { status: 400 })
        const params = Array.isArray(body.params) ? body.params.map(String) : []
        const row = {
          name, template_name: body.templateName, language: body.language, params, total: recipients.length, created_by: user.email || user.id,
          ...(at ? { status: 'scheduled', scheduled_at: at.toISOString() } : {}),
          ...(body.preview ? { preview: String(body.preview).slice(0, 2000) } : {}),
          ...(body.retargetOf ? { retarget_of: body.retargetOf, retarget_rule: body.retargetRule } : {}),
        }
        const [bc] = await supa('/rest/v1/wa_broadcasts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: row })
        await supa('/rest/v1/wa_broadcast_recipients', { method: 'POST', body: recipients.map(r => ({ broadcast_id: bc.id, wa_id: r.waId, name: r.name })) })
        sendJson(res, 200, { id: bc.id, total: recipients.length, scheduled: Boolean(at) })
        if (!at) await sendBroadcast({ ...bc, preview: body.preview || bc.preview })
      }), true
    }
    if (pathname === '/api/whatsapp/broadcast/cancel' && req.method === 'POST') {
      return run(async () => {
        await staffUser(req); const body = await readJson(req)
        await supa(`/rest/v1/wa_broadcasts?id=eq.${q(body.id || '')}&status=eq.scheduled`, { method: 'PATCH', body: { status: 'cancelled', finished_at: new Date().toISOString() } })
        sendJson(res, 200, { ok: true })
      }), true
    }
    if (pathname === '/api/whatsapp/retarget-preview' && req.method === 'POST') {
      return run(async () => {
        await staffUser(req); const body = await readJson(req)
        const list = await retargetRecipients(String(body.retargetOf || ''), body.retargetRule)
        sendJson(res, 200, { count: list.length })
      }), true
    }
    // R-WA-03: a deal moved to another stage → the matching deal-stage rules send their template and log a note
    if (pathname === '/api/whatsapp/deal-stage' && req.method === 'POST') {
      return run(async () => {
        const user = await staffUser(req); const body = await readJson(req)
        const [deal] = await supa(`/rest/v1/wa_deals?id=eq.${q(body.dealId || '')}&select=*`)
        if (!deal) throw Object.assign(new Error('Deal not found'), { status: 404 })
        const { rules, notifications } = await automation()
        const hits = notifications && notifications.master === false ? [] : rules.filter(r => stageRuleMatches(r, body.from || null, deal.stage))
        let fired = 0
        for (const rule of hits) {
          const notes = []
          if (rule.template_name && deal.wa_id) {
            try {
              const conv = await conversationFor(deal.wa_id, deal.contact_name || null)
              if (conv.unsubscribed) notes.push(`Template "${rule.template_name}" not sent — the client opted out (STOP)`)
              else {
                const filled = fillName(rule.params || [], deal.contact_name)
                const template = { name: rule.template_name, language: { code: rule.language || 'en' }, ...(filled.length ? { components: [{ type: 'body', parameters: filled.map(text => ({ type: 'text', text })) }] } : {}) }
                await sendOut(conv, { email: 'automation' }, { type: 'template', template }, { type: 'template', body: `Template: ${rule.template_name}`, template_name: rule.template_name, rule_id: rule.id })
                notes.push(`Sent template "${rule.template_name}"`)
              }
            } catch (err) { notes.push(`Template "${rule.template_name}" failed: ${err.message}`) }
          } else if (rule.template_name) notes.push(`Template "${rule.template_name}" not sent — the deal has no WhatsApp number`)
          if (rule.note) notes.push(rule.note)
          for (const n of notes) await supa('/rest/v1/wa_deal_events', { method: 'POST', body: { deal_id: deal.id, kind: 'automation', body: `${rule.name || 'Automation'}: ${n}`, author: 'automation' } }).catch(() => {})
          await supa(`/rest/v1/wa_rules?id=eq.${rule.id}`, { method: 'PATCH', body: { fire_count: (rule.fire_count || 0) + 1, last_fired_at: new Date().toISOString() } }).catch(() => {})
          fired++
        }
        sendJson(res, 200, { fired, by: user.email || user.id })
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

  return { handleWebhook, route, invalidate, runNotifications }
}

module.exports = { createWhatsApp, normalizeWaId, verifySignature, parseWebhook, statusAdvances, windowOpen, previewOf, configured, withinHours, matchKeyword, fillName, dubaiClock, optOutWord, nextAgent, retargetPick, stageRuleMatches, buildTemplateComponents, dubaiDate, fillTokens, mediaKind, activeNotifications, jobContext }
