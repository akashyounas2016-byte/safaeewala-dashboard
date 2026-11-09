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

async function ghl(path, { method = 'GET', body, version = '2021-04-15' } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env().token}`, Version: version, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(data?.message ? `GHL: ${[].concat(data.message).join(', ')}` : `GHL error ${r.status}`), { status: r.status === 401 ? 502 : 400, ghlStatus: r.status })
  return data
}

const INBOX_PATHS = /^\/api\/ghl\/(conversations|messages\/[^/]+|send|read|social\/(accounts|posts|posts\/list))$/

// ── R-GHL-02: Google Business Profile posts through GHL's Social Planner (API Version v3) ──
const SOCIAL_SCOPES = 'socialplanner/account.readonly, socialplanner/post.readonly, socialplanner/post.write'
const ymd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? { year: +m[1], month: +m[2], day: +m[3] } : null }
const hm = s => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? { hours: +m[1], minutes: +m[2], seconds: 0 } : { hours: 0, minutes: 0, seconds: 0 } }
const isUrl = u => /^https:\/\/\S+$/i.test(String(u || ''))

/**
 * The Social Planner body for a post: text and / or one image, the Google post type (STANDARD · EVENT · OFFER) with its
 * button, posted now, scheduled or kept as a draft. Throws a plain message when something required is missing.
 */
function buildPostBody(input, now = new Date()) {
  const accountIds = (Array.isArray(input.accountIds) ? input.accountIds : []).map(String).filter(Boolean)
  const summary = String(input.summary || '').trim().slice(0, 1500)
  const mode = ['now', 'schedule', 'draft'].includes(input.mode) ? input.mode : 'now'
  const mediaType = ['image/jpeg', 'image/png'].includes(input.mediaType) ? input.mediaType : /\.png(\?|$)/i.test(String(input.mediaUrl)) ? 'image/png' : 'image/jpeg'
  const media = isUrl(input.mediaUrl) ? [{ url: input.mediaUrl, type: mediaType }] : []
  if (mode !== 'draft' && !accountIds.length) throw new Error('Choose at least one account to post to.')
  if (!summary && !media.length) throw new Error('Write the post text or add a photo.')
  const g = input.gmb || {}
  const type = ['STANDARD', 'EVENT', 'OFFER'].includes(g.eventType) ? g.eventType : 'STANDARD'
  const action = ['none', 'order', 'book', 'shop', 'learn_more', 'call', 'sign_up'].includes(g.actionType) ? g.actionType : 'none'
  const gmb = { gmbEventType: type }
  if (type !== 'OFFER') {
    gmb.actionType = action
    if (action !== 'none' && action !== 'call') { if (!isUrl(g.url)) throw new Error('The button needs a link (https://…).'); gmb.url = g.url }
  }
  if (type === 'EVENT' || type === 'OFFER') {
    const s = ymd(g.startDate); const e = ymd(g.endDate)
    if (!s || !e) throw new Error('An event or offer needs a start and an end date.')
    if (`${g.endDate} ${g.endTime || '23:59'}` <= `${g.startDate} ${g.startTime || '00:00'}`) throw new Error('The end must be after the start.')
    gmb.startDate = { startDate: s, startTime: hm(g.startTime || '00:00') }
    gmb.endDate = { endDate: e, endTime: hm(g.endTime || '23:59') }
  }
  if (type === 'EVENT') { const t = String(g.title || '').trim(); if (!t) throw new Error('An event needs a title.'); gmb.title = t.slice(0, 58) }
  if (type === 'OFFER') {
    const need = { offerTitle: g.offerTitle, couponCode: g.couponCode, termsConditions: g.termsUrl, redeemOnlineUrl: g.redeemUrl }
    if (!String(need.offerTitle || '').trim() || !String(need.couponCode || '').trim()) throw new Error('An offer needs a title and a coupon code.')
    if (!isUrl(need.termsConditions) || !isUrl(need.redeemOnlineUrl)) throw new Error('An offer needs a terms link and a booking / redeem link (https://…).')
    Object.assign(gmb, { offerTitle: String(need.offerTitle).trim(), couponCode: String(need.couponCode).trim(), termsConditions: need.termsConditions, redeemOnlineUrl: need.redeemOnlineUrl })
  }
  const body = { accountIds, summary, media, type: 'post', status: mode === 'now' ? 'published' : mode === 'schedule' ? 'scheduled' : 'draft', gmbPostDetails: gmb }
  if (mode === 'schedule') {
    const at = new Date(input.scheduleAt || '')
    if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() + 5 * 60_000) throw new Error('Pick a time at least 5 minutes from now.')
    body.scheduleDate = at.toISOString()
  }
  return body
}

function createGhl({ sendJson, readJson, activeUserFrom, supabaseUrl = '', serviceHeaders = () => ({}) }) {
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
        await staffUser(req); const body = await readJson(req, 23 * 1024 * 1024)
        const text = String(body.text || '').trim()
        const type = sendTypeOf(body.channel)
        if (!text && !body.file) throw Object.assign(new Error('Type a message.'), { status: 400 })
        if (!type || !body.contactId) throw Object.assign(new Error('Only Facebook and Instagram chats can be answered here.'), { status: 400 })
        // R-INBOX-03: a photo / file goes to the private bucket; GHL gets a 7-day link to attach
        const attachments = []
        if (body.file) {
          const buf = Buffer.from(String(body.file.base64 || ''), 'base64')
          if (!buf.length || buf.length > 16 * 1024 * 1024) throw Object.assign(new Error('A file can be at most 16 MB.'), { status: 413 })
          if (!supabaseUrl) throw Object.assign(new Error('File storage is not set up on the server.'), { status: 503 })
          const mime = String(body.file.mime || 'application/octet-stream')
          const ext = (String(body.file.name || '').split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
          const objectPath = `ghl/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
          const up = await fetch(`${supabaseUrl}/storage/v1/object/whatsapp-media/${objectPath}`, { method: 'POST', headers: { ...serviceHeaders({ 'Content-Type': mime }), 'x-upsert': 'true' }, body: buf })
          if (!up.ok) throw Object.assign(new Error('The file could not be stored.'), { status: 502 })
          const sg = await fetch(`${supabaseUrl}/storage/v1/object/sign/whatsapp-media/${objectPath}`, { method: 'POST', headers: serviceHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 7 * 24 * 3600 }) })
          const sj = await sg.json().catch(() => ({}))
          if (!sg.ok) throw Object.assign(new Error('The file link could not be made.'), { status: 502 })
          attachments.push(`${supabaseUrl}/storage/v1${sj.signedURL || sj.signedUrl}`)
        }
        const sent = await ghl('/conversations/messages', { method: 'POST', body: { type, contactId: String(body.contactId), message: text, ...(attachments.length ? { attachments } : {}) } })
        sendJson(res, 200, { ok: true, id: sent.messageId || sent.id || null })
      }), true
    }
    // R-GHL-02: Social Planner — a 401/403 from GHL means the key lacks the Social Planner scopes
    const social = fn => run(async () => {
      try { await fn() } catch (err) {
        if (err.ghlStatus === 401 || err.ghlStatus === 403) throw Object.assign(new Error(`The GHL key has no Social Planner permission. In GHL → Settings → Private Integrations, edit the key and tick: ${SOCIAL_SCOPES}.`), { status: 403, code: 'scope' })
        throw err
      }
    })
    if (pathname === '/api/ghl/social/accounts' && req.method === 'GET') {
      return social(async () => {
        await staffUser(req)
        const data = await ghl(`/social-media-posting/${q(env().locationId)}/accounts`, { version: 'v3' })
        const accounts = ((data.results || {}).accounts || []).map(a => ({ id: String(a.id), name: a.name || '', platform: String(a.platform || '').toLowerCase(), type: a.type || '', expired: Boolean(a.isExpired), active: a.active !== false }))
        sendJson(res, 200, { accounts })
      }), true
    }
    if (pathname === '/api/ghl/social/posts/list' && req.method === 'POST') {
      return social(async () => {
        await staffUser(req); const body = await readJson(req)
        const type = ['all', 'scheduled', 'published', 'draft', 'failed'].includes(body.type) ? body.type : 'all'
        const data = await ghl(`/social-media-posting/${q(env().locationId)}/posts/list`, { method: 'POST', version: 'v3', body: { type, skip: '0', limit: '50', ...(body.accounts ? { accounts: String(body.accounts) } : {}) } })
        const posts = ((data.results || {}).posts || []).map(p => ({
          id: String(p._id || p.id), platform: String(p.platform || '').toLowerCase(), status: p.status || '', summary: p.summary || '',
          media: (p.media || []).map(m => m.url).filter(Boolean), at: p.publishedAt || p.displayDate || p.scheduleDate || p.createdAt || null,
          link: p.previewLink || null, error: p.error ? String(p.error.message || p.error).slice(0, 200) : null,
        }))
        sendJson(res, 200, { posts, total: (data.results || {}).count || posts.length })
      }), true
    }
    if (pathname === '/api/ghl/social/posts' && req.method === 'POST') {
      return social(async () => {
        await staffUser(req); const input = await readJson(req, 12 * 1024 * 1024)
        // a photo from the CRM goes to private Storage; GHL gets a long-lived link (a scheduled post fetches it later)
        if (input.file && input.file.base64) {
          const buf = Buffer.from(String(input.file.base64), 'base64')
          if (!buf.length || buf.length > 8 * 1024 * 1024) throw Object.assign(new Error('A photo can be at most 8 MB.'), { status: 413 })
          if (!/^image\/(jpeg|png)$/.test(String(input.file.mime || ''))) throw Object.assign(new Error('Use a JPG or PNG photo.'), { status: 400 })
          if (!supabaseUrl) throw Object.assign(new Error('File storage is not set up on the server.'), { status: 503 })
          const ext = input.file.mime === 'image/png' ? 'png' : 'jpg'
          const objectPath = `ghl-posts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
          const up = await fetch(`${supabaseUrl}/storage/v1/object/whatsapp-media/${objectPath}`, { method: 'POST', headers: { ...serviceHeaders({ 'Content-Type': input.file.mime }), 'x-upsert': 'true' }, body: buf })
          if (!up.ok) throw Object.assign(new Error('The photo could not be stored.'), { status: 502 })
          const sg = await fetch(`${supabaseUrl}/storage/v1/object/sign/whatsapp-media/${objectPath}`, { method: 'POST', headers: serviceHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 365 * 24 * 3600 }) })
          const sj = await sg.json().catch(() => ({}))
          if (!sg.ok) throw Object.assign(new Error('The photo link could not be made.'), { status: 502 })
          input.mediaUrl = `${supabaseUrl}/storage/v1${sj.signedURL || sj.signedUrl}`
          input.mediaType = input.file.mime
        }
        let body
        try { body = buildPostBody(input) } catch (e) { throw Object.assign(e, { status: 400 }) }
        const data = await ghl(`/social-media-posting/${q(env().locationId)}/posts`, { method: 'POST', version: 'v3', body })
        sendJson(res, 200, { ok: true, id: (data.results && (data.results.post?._id || data.results._id)) || null, status: body.status })
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

module.exports = { createGhl, channelOf, sendTypeOf, mapConversation, mapMessage, configured, buildPostBody, SOCIAL_SCOPES }
