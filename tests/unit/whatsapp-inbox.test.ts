// R-WA-01: WhatsApp inbox in the CRM — helpers, wiring, permissions, migration
import { readFileSync } from 'node:fs'
import { formatWaNumber, templateBody, templateParamCount, windowOpen, type WaTemplate } from '@/lib/whatsapp'
import { moduleForPath, normalizeRolePerms } from '@/lib/permissions'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

eq(formatWaNumber('971501234567'), '+971 50 123 4567', 'UAE numbers shown readable')
const t = { name: 'booking_reminder', language: 'en', category: 'UTILITY', components: [{ type: 'BODY', text: 'Hi {{1}}, your cleaning is on {{2}} at {{1}}.' }] } as WaTemplate
eq([templateParamCount(t), templateBody(t, ['Maria', 'Monday'])], [2, 'Hi Maria, your cleaning is on Monday at Maria.'], 'template parameters counted and filled')
eq([windowOpen({ last_inbound_at: new Date().toISOString() }), windowOpen({ last_inbound_at: null })], [true, false], 'reply window')

eq(moduleForPath('/whatsapp-crm'), 'WhatsApp', 'WhatsApp is its own screen permission')
eq(normalizeRolePerms({ manager: ['Overview'], _modules: ['Overview', 'Alerts'] }).manager.includes('WhatsApp'), true, 'managers get WhatsApp by default (saved before it existed)')
eq(/to: '\/whatsapp-crm',\s+label: 'Inbox & WhatsApp'/.test(src('src/components/layout/Sidebar.tsx')), true, 'sidebar item with unread badge')
eq(/whatsapp-crm\?phone=/.test(src('src/pages/ClientProfile.tsx')), true, 'Client Profile opens the chat')

const server = src('webhookServer.cjs')
eq(/if \(pathname === '\/api\/whatsapp\/webhook'\)/.test(server) && server.indexOf("pathname === '/api/whatsapp/webhook'") < server.indexOf('authorizeApi(req, pathname, parsedUrl).then'), true, 'Meta webhook handled before the sign-in check (signature instead)')
eq(server.split("replace(/^Bearer\\s+/i, '')").length - 1, 3, 'Bearer token regex fixed (all three sign-in checks)')
eq(/COPY whatsappServer\.cjs/.test(src('Dockerfile')) && /webhookServer\.cjs whatsappServer\.cjs/.test(src('.github/workflows/deploy.yml')), true, 'whatsappServer.cjs ships with every deploy')
eq(/--ignore-failed-read/.test(src('.github/workflows/deploy.yml')), true, 'release backup does not fail on a new file')
const sql = src('supabase/migrations/2026-11-06_whatsapp_inbox.sql')
eq(/enable row level security/.test(sql) && !/for (insert|update|delete)/i.test(sql), true, 'tables readable by staff, written only by the server')
eq(/'whatsapp-media', 'whatsapp-media', false/.test(sql), true, 'media bucket is private')
