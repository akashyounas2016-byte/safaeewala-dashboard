// R-WA-02 (WhatsApp CRM modules) + R-INBOX-01 (central Inbox): helpers, server automation end to end, wiring
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { clientAudience, dealSummary, parseRecipients, toWaId, waAnalytics } from '@/lib/whatsappModules'
import { mergeInbox } from '@/lib/ghlInbox'
import { moduleForPath, normalizeRolePerms } from '@/lib/permissions'
import { prefillJob } from '@/components/bookings/NewBookingModal'

const require = createRequire(process.cwd() + '/')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wa = require(process.cwd() + '/whatsappServer.cjs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ghl = require(process.cwd() + '/ghlServer.cjs')

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// ── pure helpers ──
const hours = { days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '20:00' }
eq([
  wa.withinHours(hours, new Date('2026-11-09T06:00:00Z')), // Monday 10:00 Dubai
  wa.withinHours(hours, new Date('2026-11-09T17:30:00Z')), // Monday 21:30 Dubai
  wa.withinHours(hours, new Date('2026-11-08T06:00:00Z')), // Sunday
  wa.withinHours(null, new Date()),
], [true, false, false, true], 'business hours in Dubai time (no hours saved = always open)')
const rules = [
  { id: 'r1', kind: 'keyword', enabled: false, keywords: ['price'], match: 'contains', reply: 'off' },
  { id: 'r2', kind: 'keyword', enabled: true, keywords: ['price', 'rates'], match: 'contains', reply: 'Price list' },
  { id: 'r3', kind: 'keyword', enabled: true, keywords: ['hi'], match: 'exact', reply: 'Hello' },
]
eq([wa.matchKeyword(rules, 'What are your RATES?')?.id, wa.matchKeyword(rules, 'hi')?.id, wa.matchKeyword(rules, 'hi there'), wa.matchKeyword(rules, '')], ['r2', 'r3', null, null], 'keyword trigger: contains / exact, case-insensitive, disabled ones skipped')
eq(wa.fillName(['{name}', 'Eid'], 'Sara'), ['Sara', 'Eid'], 'broadcast {name} filled per client')

eq(dealSummary([{ stage: 'new', value: 300 }, { stage: 'quoted', value: 700 }, { stage: 'won', value: 500 }, { stage: 'lost', value: 200 }]).open, 1000, 'open pipeline = new + contacted + quoted')
eq(dealSummary([{ stage: 'won', value: 1 }, { stage: 'won', value: 1 }, { stage: 'lost', value: 1 }]).winRate, 67, 'win rate = won ÷ (won + lost)')
eq([toWaId('050 123 4567'), toWaId('+971 50 123 4567')], ['971501234567', '971501234567'], 'client numbers normalised like the server')
eq(clientAudience([
  { id: 'a', full_name: 'A', phone: '0501234567' }, { id: 'b', full_name: 'B', whatsapp: '+971501234567' }, { id: 'c', full_name: 'C', phone: '' },
]).map(x => x.id), ['a'], 'broadcast audience: one row per number, clients without a number left out')
eq(parseRecipients('0501112222, Sara\n\nbad\n+971 55 333 4444').map(r => [r.to, r.name]), [['971501112222', 'Sara'], ['971553334444', undefined]], 'pasted numbers parsed')

const t0 = new Date('2026-11-07T08:00:00Z').getTime()
const iso = (min: number) => new Date(t0 + min * 60000).toISOString()
const a = waAnalytics([
  { conversation_id: 'c1', direction: 'in', status: 'received', created_at: iso(0), sent_by: null },
  { conversation_id: 'c1', direction: 'out', status: 'read', created_at: iso(1), sent_by: 'automation' },
  { conversation_id: 'c1', direction: 'out', status: 'delivered', created_at: iso(10), sent_by: 'ali@x' },
  { conversation_id: 'c2', direction: 'in', status: 'received', created_at: iso(20), sent_by: null },
  { conversation_id: 'c2', direction: 'out', status: 'failed', created_at: iso(21), sent_by: 'ali@x' },
], 7, new Date(t0 + 3600000))
eq([a.inbound, a.outbound, a.chats, a.auto, a.failed, a.medianReplyMin, a.unanswered, a.deliveredPct, a.readPct, a.series.length], [2, 3, 2, 1, 1, 10, 1, 100, 50, 7], 'analytics: automatic and failed messages are not the team\'s reply; failed left out of delivery %')

eq(mergeInbox(
  [{ id: 'w1', last_message_preview: 'wa', last_direction: 'in', last_message_at: '2026-11-07T08:00:00Z', unread_count: 2 }],
  [{ id: 'g1', contactId: 'k', name: 'FB user', channel: 'facebook', lastMessageAt: '2026-11-07T09:00:00Z', preview: 'fb', lastDirection: 'in', unread: 1 }],
  () => 'WA user',
).map(i => [i.key, i.channel, i.name]), [['ghl:g1', 'facebook', 'FB user'], ['wa:w1', 'whatsapp', 'WA user']], 'central Inbox: all channels in one list, newest first')
eq([ghl.channelOf('TYPE_INSTAGRAM'), ghl.channelOf('TYPE_FACEBOOK'), ghl.sendTypeOf('instagram'), ghl.sendTypeOf('whatsapp')], ['instagram', 'facebook', 'IG', null], 'GHL channel types mapped; WhatsApp is never sent through GHL')
eq(ghl.mapMessage({ id: 'm', direction: 'outbound', body: 'ok', dateAdded: '2026-11-07T08:00:00Z', messageType: 'TYPE_INSTAGRAM' }).direction, 'out', 'GHL message mapped')

// ── server automation end to end (fake Supabase + fake Meta) ──
process.env.WHATSAPP_TOKEN = 't'; process.env.WHATSAPP_PHONE_NUMBER_ID = 'PN1'; process.env.WHATSAPP_APP_SECRET = 'appsecret'; process.env.WHATSAPP_VERIFY_TOKEN = 'v'
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  wa_conversations: [], wa_messages: [], clients: [],
  wa_rules: [
    { id: 'kw', kind: 'keyword', enabled: true, keywords: ['price'], match: 'contains', reply: 'Our price list…', fire_count: 0 },
    { id: 'wel', kind: 'welcome', enabled: true, keywords: [], match: 'contains', reply: 'Welcome to Safaeewala!', fire_count: 0 },
    { id: 'away', kind: 'away', enabled: true, keywords: [], match: 'contains', reply: 'We are closed now.', fire_count: 0 },
  ],
  wa_settings: [{ key: 'hours', value: { days: [], from: '08:00', to: '20:00' } }], // no working day → always "away"
}
let n = 0
const supa = async (p: string, opts: { method?: string; body?: Row } = {}) => {
  const [base, qs] = p.replace('/rest/v1/', '').split('?')
  const params = new URLSearchParams(qs || '')
  const rows = db[base] || []
  const filters = [...params.entries()].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k))
  const match = (r: Row) => filters.every(([k, v]) => (v.startsWith('gt.') ? String(r[k]) > v.slice(3) : v.startsWith('in.(') ? v.slice(4, -1).split(',').includes(String(r[k])) : String(r[k]) === v.replace(/^eq\./, '')))
  if (!opts.method || opts.method === 'GET') return rows.filter(match)
  if (opts.method === 'POST') { const row = { id: `id-${++n}`, unread_count: 0, ...(opts.body as Row) }; rows.push(row); db[base] = rows; return [row] }
  if (opts.method === 'PATCH') { rows.filter(match).forEach(r => Object.assign(r, opts.body)); return [] }
  return []
}
const graphCalls: Row[] = []
globalThis.fetch = (async (_url: string, init: { body?: string }) => {
  graphCalls.push(JSON.parse(init?.body || '{}'))
  return { ok: true, json: async () => ({ messages: [{ id: `wamid.R${graphCalls.length}` }] }) }
}) as unknown as typeof fetch
const sendJson = (res: { writeHead: (s: number) => void; end: (b: string) => void }, status: number, body: unknown) => { res.writeHead(status); res.end(JSON.stringify(body)) }
const api = wa.createWhatsApp({ supa, supabaseUrl: 'https://x', serviceHeaders: () => ({}), sendJson, readJson: async () => ({}), activeUserFrom: async () => null })
const sign = (body: string) => 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(body).digest('hex')
const fakeRes = () => { const r = { status: 0, body: '', headersSent: false, writeHead(s: number) { r.status = s; r.headersSent = true }, end(b?: string) { r.body = b || '' } }; return r }
const fakeReq = (body: string) => { const e = new EventEmitter() as EventEmitter & { method: string; headers: Record<string, string> }; e.method = 'POST'; e.headers = { 'x-hub-signature-256': sign(body) }; setTimeout(() => { e.emit('data', Buffer.from(body)); e.emit('end') }, 0); return e }
const inbound = (id: string, text: string) => JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN1' }, contacts: [{ wa_id: '971509998888', profile: { name: 'Omar' } }], messages: [{ from: '971509998888', id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] })
const hook = async (body: string) => { await api.handleWebhook(fakeReq(body), fakeRes(), new URL('https://x/api/whatsapp/webhook')); await new Promise(r => setTimeout(r, 30)) }

await hook(inbound('wamid.1', 'Hello'))
const autoBodies = () => db.wa_messages.filter(m => m.sent_by === 'automation').map(m => m.body)
eq(autoBodies(), ['Welcome to Safaeewala!', 'We are closed now.'], 'new chat: welcome message, then the away message outside business hours')
await hook(inbound('wamid.2', 'what is the PRICE'))
eq(autoBodies().slice(2), ['Our price list…'], 'keyword reply sent; no second welcome / away within 12 hours')
eq([db.wa_rules.find(r => r.id === 'kw')?.fire_count, db.wa_messages.filter(m => m.rule_id === 'kw').length, graphCalls.every(c => c.to === '971509998888')], [1, 1, true], 'reply counted, stored with its rule, sent to the client')

// ── wiring ──
const page = src('src/pages/WhatsAppCRM.tsx')
eq(['Inbox', 'Jobs', 'Deals', 'Broadcasts', 'Analytics', 'Automations', 'Keyword Trigger', 'Templates', 'Settings'].every(l => page.includes(`label: '${l}'`)), true, 'all nine WhatsApp modules in the module rail')
eq(/SetupPanel/.test(page), false, 'no full-screen setup wall: the setup state is a strip + a Settings tab')
eq([
  prefillJob({ clientId: 'c1', phone: '+971500000000' }, [{ id: 'c1', full_name: 'Sara', building_name: 'Marina Tower', area: 'Dubai Marina' }]),
  prefillJob({ name: 'Omar', phone: '+971509998888' }, []).remarks,
], [{ date: prefillJob(null, []).date, address: 'Marina Tower', area: 'Dubai Marina' }, 'WhatsApp enquiry — Omar +971509998888'], 'booking from a chat: CRM client → building + area; anyone else → remarks with the number')
eq(/prefill=\{bookingPrefill\}/.test(src('src/pages/Bookings.tsx')) && /bookings\?new=1/.test(src('src/components/whatsapp/WaChat.tsx')), true, 'Jobs: a booking is made with the normal booking form, client filled in')
eq([moduleForPath('/inbox'), normalizeRolePerms({ manager: ['Overview'], _modules: ['Overview', 'Alerts', 'WhatsApp'] }).manager.includes('Inbox')], ['Inbox', true], 'Inbox is its own screen; managers get it by default')
eq(/to: '\/whatsapp-crm',\s+label: 'Inbox & WhatsApp'/.test(src('src/components/layout/Sidebar.tsx')) && !/to: '\/inbox'/.test(src('src/components/layout/Sidebar.tsx')) && /path="inbox"/.test(src('src/App.tsx')) && /Navigate to="\/whatsapp-crm\?tab=inbox"/.test(src('src/pages/Inbox.tsx')), true, 'R-INBOX-02: one sidebar item; old /inbox links land in the WhatsApp CRM inbox')
eq(/ghlServer\.cjs/.test(src('Dockerfile')) && /whatsappServer\.cjs ghlServer\.cjs/.test(src('.github/workflows/deploy.yml')) && /ghl\.route\(req, res, parsedUrl, pathname\)/.test(src('webhookServer.cjs')), true, 'ghlServer.cjs ships with every deploy and is wired')
eq(/GHL_API_KEY/.test(src('ghlServer.cjs')) && !/GHL_TOKEN/.test(src('docker-compose.yml')), true, 'Inbox reuses the existing GHL_API_KEY')
const sql = src('supabase/migrations/2026-11-07_whatsapp_modules.sql')
eq(/array\['wa_deals', 'wa_rules', 'wa_settings'\]/.test(sql) && !/'wa_broadcasts', 'wa_broadcast_recipients'\] loop\s+execute format\('drop policy if exists %I on public.%I', t \|\| '_write'/.test(sql), true, 'deals / rules / settings writable by staff; broadcasts written only by the server')
