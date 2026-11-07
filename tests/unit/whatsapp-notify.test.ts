// R-WA-04 (client notifications with switches) + R-INBOX-03 (Conversations: tags, filters, composer)
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { tagSummary, tagTone, DEFAULT_TAGS } from '@/lib/inboxSettings'
import { contactForJob, unpaidJobs } from '@/components/whatsapp/WaJobsNotify'

const require = createRequire(process.cwd() + '/')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wa = require(process.cwd() + '/whatsappServer.cjs')
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// ── helpers ──
const ctx = { name: 'Sara', ...wa.jobContext({ scheduled_date: '2026-11-08', scheduled_time: '10:00 AM', service_type: 'Deep Cleaning', total_amount: 300, received_amount: 100 }) }
eq(wa.fillTokens(['{name}', '{date} at {time}', '{balance}', '{cleaner}'], ctx), ['Sara', 'Sun 08 Nov at 10:00 AM', 'AED 200', '-'], 'template values filled from the booking; unknown values become "-"')
eq(wa.fillTokens(['{name}'], {}), ['there'], 'no name → "there"')
eq(['image/jpeg', 'video/mp4', 'audio/ogg', 'application/pdf', 'image/webp'].map(wa.mediaKind), ['image', 'video', 'audio', 'document', 'document'], 'file → WhatsApp message type')
eq([
  Object.keys(wa.activeNotifications({ master: true, confirm: { enabled: true, template: 't' }, reminder: { enabled: true, template: '' }, feedback: { enabled: false, template: 't' } })),
  Object.keys(wa.activeNotifications({ master: false, confirm: { enabled: true, template: 't' } })),
], [['confirm'], []], 'only switched-on notifications with a template; master switch off = none')
eq(wa.dubaiDate(0, Date.parse('2026-11-07T21:30:00Z')), '2026-11-08', 'dates in Dubai time')

// ── engine end to end ──
process.env.WHATSAPP_TOKEN = 't'; process.env.WHATSAPP_PHONE_NUMBER_ID = 'PN1'; process.env.WHATSAPP_APP_SECRET = 's'; process.env.WHATSAPP_VERIFY_TOKEN = 'v'
type Row = Record<string, unknown>
const NOW = Date.parse('2026-11-07T15:00:00Z') // 19:00 Dubai
const iso = (min: number) => new Date(NOW + min * 60000).toISOString()
const tpl = (template: string) => ({ enabled: true, template, language: 'en', params: ['{name}', '{date}'] })
const db: Record<string, Row[]> = {
  wa_settings: [{ key: 'notifications', value: { master: true, confirm: { ...tpl('booking_confirm'), since: iso(-60) }, reminder: { ...tpl('booking_reminder'), hour: '18:00' }, on_way: tpl('team_on_way') } }],
  wa_rules: [], wa_conversations: [], wa_messages: [], wa_notification_log: [],
  clients: [{ id: 'c1', full_name: 'Sara', phone: '0501110000', building_name: 'Marina Tower' }],
  bookings: [
    { id: 'b-old', client_id: 'c1', client_name: 'Sara', client_phone: '0501110000', scheduled_date: '2026-11-09', status: 'confirmed', created_at: iso(-600) },
    { id: 'b-new', client_id: 'c1', client_name: 'Sara', client_phone: '0501110000', scheduled_date: '2026-11-09', status: 'confirmed', created_at: iso(-5) },
    { id: 'b-tmr', client_name: 'Omar', client_phone: '0502220000', scheduled_date: '2026-11-08', status: 'confirmed', created_at: iso(-3000) },
    { id: 'b-cxl', client_name: 'Lina', client_phone: '0503330000', scheduled_date: '2026-11-08', status: 'cancelled', created_at: iso(-3000) },
  ],
  daily_jobs: [{ id: 'j1', booking_id: null, address: 'Marina Tower', date: '2026-11-07', start_time: '07:30 PM' }],
  job_checkins: [{ job_id: 'j1', cleaner: 'Ambika', status: 'on_way', on_way_at: iso(-10) }],
}
let n = 0
const supa = async (p: string, opts: { method?: string; body?: Row } = {}) => {
  const [base, qs] = p.replace('/rest/v1/', '').split('?')
  const params = new URLSearchParams(qs || '')
  const rows = (db[base] = db[base] || [])
  const filters = [...params.entries()].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k))
  const match = (r: Row) => filters.every(([k, v]) => {
    if (v.startsWith('gte.')) return String(r[k]) >= v.slice(4)
    if (v.startsWith('gt.')) return String(r[k]) > v.slice(3)
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(r[k]))
    if (v === 'not.is.null') return r[k] !== null && r[k] !== undefined
    return String(r[k]) === v.replace(/^eq\./, '')
  })
  if (!opts.method || opts.method === 'GET') return rows.filter(match)
  if (opts.method === 'POST') {
    const b = opts.body as Row
    if (base === 'wa_notification_log' && rows.some(r => r.kind === b.kind && r.ref === b.ref)) return []
    const row = { id: `id-${++n}`, unread_count: 0, ...b }; rows.push(row); return [row]
  }
  if (opts.method === 'PATCH') { const hit = rows.filter(match); hit.forEach(r => Object.assign(r, opts.body)); return hit }
  return []
}
const toMeta: Row[] = []
globalThis.fetch = (async (_u: string, init: { body?: string }) => { toMeta.push(JSON.parse(init?.body || '{}')); return { ok: true, json: async () => ({ messages: [{ id: `wamid.${toMeta.length}` }] }) } }) as unknown as typeof fetch
const sendJson = () => {}
const api = wa.createWhatsApp({ supa, supabaseUrl: 'https://x', serviceHeaders: () => ({}), sendJson, readJson: async () => ({}), activeUserFrom: async () => null, scheduler: false })

const r1 = await api.runNotifications(NOW)
const kinds = (r1.sent as string[]).map(x => x.split(':').slice(0, 2).join(':')).sort()
eq(kinds, ['confirm:b-new', 'on_way:j1', 'reminder:b-tmr'], 'new booking confirmed (not the old one), tomorrow reminded (not the cancelled one), "on the way" from the cleaner\'s tap')
const onWay = toMeta.find(m => (m.template as { name?: string })?.name === 'team_on_way') as { to?: string } | undefined
eq(onWay?.to, '971501110000', '"on the way" goes to the client found by the job\'s building')
const r2 = await api.runNotifications(NOW + 60000)
eq(r2.sent, [], 'nothing is sent twice')
db.wa_settings[0].value = { ...(db.wa_settings[0].value as Row), master: false }
db.bookings.push({ id: 'b-new2', client_name: 'X', client_phone: '0504440000', scheduled_date: '2026-11-10', status: 'confirmed', created_at: iso(1) })
api.invalidate()
eq((await api.runNotifications(NOW + 120000)).sent, [], 'master switch off: no notifications at all')

// ── client helpers ──
eq(tagSummary([{ unread: 2, status: 'pending', tags: ['VIP'] }, { unread: 0, tags: ['VIP', 'Booked Job'] }]), { unread: 1, pending: 1, tags: { VIP: 2, 'Booked Job': 1 } }, 'header summary: unread chats, pending, per-tag counts')
eq(tagTone(DEFAULT_TAGS, 'upcoming job').includes('sky'), true, 'tag colours by name (any case)')
const jobs = [{ id: 'a', date: '2026-11-06', charges: 300, received: 100 }, { id: 'b', date: '2026-11-06', charges: 200, received: 200 }, { id: 'c', date: '2026-08-01', charges: 100, received: 0 }, { id: 'd', date: '2026-11-09', charges: 100, received: 0 }]
eq(unpaidJobs(jobs, '2026-11-07').map(j => j.id), ['a'], 'unpaid: charges more than received, last 60 days, not future')
eq([contactForJob({ booking_id: 'b1' }, [{ id: 'b1', client_phone: '050', client_name: 'A' }], []), contactForJob({ address: 'marina tower ' }, [], [{ id: 'c', full_name: 'S', whatsapp: '051', building_name: 'Marina Tower' }])],
  [{ phone: '050', name: 'A' }, { phone: '051', name: 'S' }], 'job → phone: booking first, else the client of the building')

// ── wiring ──
eq(/label: 'Conversations'/.test(src('src/components/layout/Sidebar.tsx')) && !/WhatsApp CRM<\/span>/.test(src('src/pages/WhatsAppCRM.tsx')), true, 'one sidebar item "Conversations"; no "WhatsApp CRM" heading')
const composer = src('src/components/whatsapp/Composer.tsx')
eq(/aria-label="Attach"/.test(composer) && /aria-label="Templates"/.test(composer) && /aria-label="Emoji"/.test(composer) && /aria-label="Send"/.test(composer), true, 'message bar: attach, templates, emoji, send')
eq(/<Composer/.test(src('src/components/whatsapp/WaChat.tsx')) && /<Composer/.test(src('src/components/whatsapp/GhlChat.tsx')), true, 'the same message bar on WhatsApp, Facebook and Instagram')
const inbox = src('src/components/whatsapp/WaInbox.tsx')
eq(/unread chats always on top/.test(inbox) && /aria-label="Filters"/.test(inbox) && /tagSummary\(/.test(inbox), true, 'unread first, filter dropdown, tag summary')
eq(/demo-fb|demo-ig/.test(src('src/lib/inboxDemo.ts')), false, 'demo data is WhatsApp only')
eq(/notifications\.master === false\) return/.test(src('whatsappServer.cjs')), true, 'master switch also stops welcome / away / keyword / fallback replies')
