// R-WA-03 (rest of the WhatsApp CRM prototype) + UX-114 (module rail, full screen): helpers, server end to end, wiring
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { agentLeaderboard, filterChats } from '@/lib/whatsappCrm'
import type { WaConversation } from '@/lib/whatsapp'

const require = createRequire(process.cwd() + '/')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wa = require(process.cwd() + '/whatsappServer.cjs')

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// ── pure helpers ──
eq(['STOP', 'unsubscribe.', 'Start', 'stop it'].map(wa.optOutWord), ['stop', 'stop', 'start', null], 'STOP / START words')
eq([wa.nextAgent(['a', 'b', 'c'], 'b'), wa.nextAgent(['a', 'b'], 'b'), wa.nextAgent(['a'], null), wa.nextAgent([], 'a')], ['c', 'a', 'a', null], 'round-robin goes to the next agent and wraps')
const recips = [
  { wa_id: '1', status: 'sent', wa_message_id: 'm1' }, { wa_id: '2', status: 'sent', wa_message_id: 'm2' },
  { wa_id: '3', status: 'failed', wa_message_id: null }, { wa_id: '4', status: 'skipped', wa_message_id: null },
]
const ctx = { repliedWaIds: new Set(['1']), statusByWamid: new Map([['m1', 'read'], ['m2', 'delivered']]) }
eq(['no_reply', 'not_read', 'failed'].map(r => wa.retargetPick(recips, ctx, r).map((x: { wa_id: string }) => x.wa_id)), [['2'], ['2'], ['3']], 'retarget: didn\'t reply / didn\'t read / not delivered; opted-out never retargeted')
const rule = { kind: 'deal_stage', enabled: true, from_stage: null, to_stage: 'quoted' }
eq([wa.stageRuleMatches(rule, 'new', 'quoted'), wa.stageRuleMatches({ ...rule, from_stage: 'contacted' }, 'new', 'quoted'), wa.stageRuleMatches(rule, 'quoted', 'won')], [true, false, false], 'deal-stage rule: to-stage, optional from-stage')
eq(wa.buildTemplateComponents({ header: 'Booking', body: 'Hi {{1}}', examples: ['Sara'], footer: 'Safaeewala', buttons: ['Confirm', ''] }).map((c: { type: string }) => c.type), ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'], 'template header / body / footer / quick replies')
let bad = ''
try { wa.buildTemplateComponents({ body: 'x', buttons: ['a', 'b', 'c', 'd'] }) } catch (e) { bad = (e as Error).message }
eq(/At most 3 buttons/.test(bad), true, 'more than 3 buttons refused')

const c = (id: string, status: string | undefined, assigned_to: string | null) => ({ id, status, assigned_to } as unknown as WaConversation)
const chats = [c('a', 'open', 'me'), c('b', 'open', null), c('c', 'resolved', 'x'), c('d', undefined, null)]
eq([filterChats(chats, 'open', 'all', 'me').map(x => x.id), filterChats(chats, 'all', 'mine', 'me').map(x => x.id), filterChats(chats, 'open', 'unassigned', 'me').map(x => x.id)], [['a', 'b', 'd'], ['a'], ['b', 'd']], 'inbox filters: status (no status = open), mine, unassigned')
eq(agentLeaderboard([
  { direction: 'out', sent_by: 'ali', status: 'read' }, { direction: 'out', sent_by: 'ali', status: 'failed' }, { direction: 'out', sent_by: 'sara', status: 'sent' },
  { direction: 'out', sent_by: 'automation', status: 'read' }, { direction: 'in', sent_by: null, status: 'received' },
]), [{ sender: 'ali', sent: 2, failed: 1 }, { sender: 'sara', sent: 1, failed: 0 }], 'agent leaderboard leaves automatic replies out')

// ── server end to end (fake Supabase with the R-WA-03 columns + fake Meta) ──
process.env.WHATSAPP_TOKEN = 't'; process.env.WHATSAPP_PHONE_NUMBER_ID = 'PN1'; process.env.WHATSAPP_APP_SECRET = 'appsecret'; process.env.WHATSAPP_VERIFY_TOKEN = 'v'
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  wa_conversations: [{ id: 'old', wa_id: '971501110000', name: 'Old', status: 'resolved', assigned_to: null, tags: [], unsubscribed: false, unread_count: 0 }],
  wa_messages: [], clients: [], wa_notes: [], wa_deal_events: [], wa_broadcasts: [], wa_broadcast_recipients: [],
  wa_rules: [
    { id: 'fb', kind: 'fallback', enabled: true, keywords: [], match: 'contains', reply: 'We will reply soon.', fire_count: 0 },
    { id: 'ds', kind: 'deal_stage', enabled: true, keywords: [], match: 'contains', reply: '', name: 'Quote follow-up', from_stage: null, to_stage: 'quoted', template_name: 'quote_follow_up', language: 'en', params: ['{name}'], note: 'Call in 2 days', fire_count: 0 },
  ],
  wa_settings: [{ key: 'assignment', value: { mode: 'round_robin', agents: ['ag1', 'ag2'], last: 'ag1' } }],
  wa_deals: [{ id: 'd1', title: 'Villa', contact_name: 'Sara', wa_id: '971502220000', stage: 'quoted' }],
}
let n = 0
const supa = async (p: string, opts: { method?: string; body?: Row | Row[] } = {}) => {
  const [base, qs] = p.replace('/rest/v1/', '').split('?')
  const params = new URLSearchParams(qs || '')
  const rows = (db[base] = db[base] || [])
  const filters = [...params.entries()].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k))
  const match = (r: Row) => filters.every(([k, v]) => (v.startsWith('gt.') ? String(r[k]) > v.slice(3) : v.startsWith('in.(') ? v.slice(4, -1).split(',').includes(String(r[k])) : String(r[k]) === v.replace(/^eq\./, '')))
  if (!opts.method || opts.method === 'GET') return rows.filter(match)
  if (opts.method === 'POST') {
    const list = Array.isArray(opts.body) ? opts.body : [opts.body as Row]
    if (base === 'wa_settings') { list.forEach(b => { const ex = rows.find(r => r.key === b.key); if (ex) Object.assign(ex, b); else rows.push(b) }); return [] }
    const extra = base === 'wa_conversations' ? { status: 'open', assigned_to: null, tags: [], unsubscribed: false, unread_count: 0 } : base === 'wa_broadcast_recipients' ? { status: 'pending' } : base === 'wa_broadcasts' ? { status: 'sending', sent: 0, failed: 0, created_at: new Date().toISOString() } : {}
    const made = list.map(b => ({ id: `id-${++n}`, created_at: new Date().toISOString(), ...extra, ...b })); rows.push(...made); return made
  }
  if (opts.method === 'PATCH') { const hit = rows.filter(match); hit.forEach(r => Object.assign(r, opts.body)); return hit }
  return []
}
const sentToMeta: Row[] = []
globalThis.fetch = (async (_url: string, init: { body?: string }) => {
  sentToMeta.push(JSON.parse(init?.body || '{}'))
  return { ok: true, json: async () => ({ messages: [{ id: `wamid.S${sentToMeta.length}` }] }) }
}) as unknown as typeof fetch
const sendJson = (res: { writeHead: (s: number) => void; end: (b: string) => void }, status: number, body: unknown) => { res.writeHead(status); res.end(JSON.stringify(body)) }
let body: Row = {}
const api = wa.createWhatsApp({ supa, supabaseUrl: 'https://x', serviceHeaders: () => ({}), sendJson, readJson: async () => body, activeUserFrom: async () => ({ id: 'ag1', email: 'ali@x', role: 'admin' }), scheduler: false })
const sign = (b: string) => 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(b).digest('hex')
const fakeRes = () => { const r = { status: 0, body: '', headersSent: false, writeHead(s: number) { r.status = s; r.headersSent = true }, end(b?: string) { r.body = b || '' } }; return r }
const fakeReq = (method: string, raw = '') => { const e = new EventEmitter() as EventEmitter & { method: string; headers: Record<string, string> }; e.method = method; e.headers = raw ? { 'x-hub-signature-256': sign(raw) } : {}; setTimeout(() => { if (raw) e.emit('data', Buffer.from(raw)); e.emit('end') }, 0); return e }
const inbound = (from: string, id: string, text: string) => JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN1' }, contacts: [{ wa_id: from, profile: { name: 'X' } }], messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] })
const hook = async (raw: string) => { await api.handleWebhook(fakeReq('POST', raw), fakeRes(), new URL('https://x/api/whatsapp/webhook')); await new Promise(r => setTimeout(r, 30)) }
const call = async (path: string, b: Row) => { body = b; const res = fakeRes(); api.route(fakeReq('POST'), res, new URL(`https://x${path}`), path); await new Promise(r => setTimeout(r, 400)); return res }

await hook(inbound('971503330000', 'w1', 'Hi'))
const fresh = db.wa_conversations.find(x => x.wa_id === '971503330000')!
eq([fresh.assigned_to, (db.wa_settings[0].value as Row).last, db.wa_notes.some(x => x.kind === 'assign')], ['ag2', 'ag2', true], 'new chat assigned round-robin to the next agent, noted in the history')
eq(db.wa_messages.filter(m => m.rule_id === 'fb' && m.conversation_id === fresh.id).length, 1, 'a new chat with no welcome message set gets the fallback reply')
await hook(inbound('971501110000', 'w2', 'any update?'))
const old = db.wa_conversations.find(x => x.id === 'old')!
eq([old.status, db.wa_messages.filter(m => m.rule_id === 'fb' && m.conversation_id === 'old').length], ['open', 1], 'a resolved chat opens again when the client writes; fallback reply sent once')
await hook(inbound('971501110000', 'w3', 'hello??'))
eq(db.wa_messages.filter(m => m.rule_id === 'fb' && m.conversation_id === 'old').length, 1, 'fallback not repeated within 12 hours')
await hook(inbound('971501110000', 'w4', 'STOP'))
eq([old.unsubscribed, db.wa_messages.some(m => m.conversation_id === 'old' && /not get offers/.test(String(m.body)))], [true, true], 'STOP opts the client out with one confirmation')

const bc = await call('/api/whatsapp/broadcast', { name: 'Eid', templateName: 'eid_offer', language: 'en', params: [], preview: 'Eid', recipients: [{ to: '971501110000', name: 'Old' }, { to: '0504440000', name: 'New' }] })
eq(bc.status, 200, 'campaign accepted')
eq(db.wa_broadcast_recipients.map(r => [r.wa_id, r.status]), [['971501110000', 'skipped'], ['971504440000', 'sent']], 'campaign skips the opted-out number, sends the rest')
const sched = await call('/api/whatsapp/broadcast', { name: 'Later', templateName: 'eid_offer', language: 'en', recipients: [{ to: '0505550000' }], scheduledAt: new Date(Date.now() + 3600e3).toISOString() })
eq([JSON.parse(sched.body).scheduled, db.wa_broadcasts.find(b => b.name === 'Later')?.status, db.wa_broadcast_recipients.find(r => r.wa_id === '971505550000')?.status], [true, 'scheduled', 'pending'], 'a scheduled campaign waits for the server (nothing sent yet)')

const before = sentToMeta.length
const ds = await call('/api/whatsapp/deal-stage', { dealId: 'd1', from: 'contacted' })
const tplSent = sentToMeta.slice(before).find(m => m.type === 'template') as { template?: { name: string; components: { parameters: { text: string }[] }[] } } | undefined
eq([JSON.parse(ds.body).fired, tplSent?.template?.name, tplSent?.template?.components[0].parameters[0].text], [1, 'quote_follow_up', 'Sara'], 'deal moved to Quote sent → follow-up template to the contact')
eq(db.wa_deal_events.map(e => e.body), ['Quote follow-up: Sent template "quote_follow_up"', 'Quote follow-up: Call in 2 days'], 'deal activity shows what the automation did')

// ── wiring ──
const layout = src('src/components/layout/Layout.tsx')
eq(/!focusMode && <Sidebar/.test(layout) && /setFocusMode: enterFocus/.test(layout) && /const enterFocus = useCallback/.test(layout), true, 'full screen hides the CRM sidebar (stable setter, so the page does not switch it off on every render)')
const page = src('src/pages/WhatsAppCRM.tsx')
eq(/Back to Sidebar/.test(page) && /Full screen/.test(page) && /aria-label="WhatsApp modules"/.test(page), true, 'WhatsApp: module rail, Full screen and Back to Sidebar')
eq(['Contacts List', 'Create Campaign', 'Campaign List', 'Retarget Campaign'].every(l => src('src/components/whatsapp/WaBroadcast.tsx').includes(`label: '${l}'`)), true, 'Broadcasts: Contacts List · Create Campaign · Campaign List · Retarget Campaign')
const sql = src('supabase/migrations/2026-11-07_whatsapp_crm_more.sql')
eq(/grant update \(status, assigned_to, snoozed_until, tags, unsubscribed, unread_count\) on public\.wa_conversations/.test(sql), true, 'staff may change only the CRM columns of a chat')
