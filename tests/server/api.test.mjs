import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Runs webhookServer.cjs against a fake Supabase: admin user endpoints, API protection (SEC-04), SEC-05
import os from 'node:os'
const serverFile = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'webhookServer.cjs')
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safaeewala-api-test-'))
fs.rmSync(dataDir, { recursive: true, force: true }); fs.mkdirSync(dataDir, { recursive: true })

const ADMIN = '11111111-1111-1111-1111-111111111111'
const EMP = '22222222-2222-2222-2222-222222222222'
const profiles = [
  { id: ADMIN, login_id: 'admin', role: 'admin', status: 'active', employee_id: null, created_at: '1' },
  { id: EMP, login_id: 'SW-0001', role: 'employee', status: 'active', employee_id: 'e1', created_at: '2' },
]
const authUsers = new Map([[ADMIN, { id: ADMIN, email: 'admin@staff.safaeewala.com' }], [EMP, { id: EMP, email: 'sw-0001@staff.safaeewala.com' }]])
const calls = []
const leadsInCloud = []
let n = 3
const mock = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', () => {
    const u = new URL(req.url, 'http://x')
    const json = (s, d) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)) }
    const b = body ? JSON.parse(body) : null
    calls.push(`${req.method} ${u.pathname}`)
    if (u.pathname === '/auth/v1/user') {
      const t = (req.headers.authorization || '').replace('Bearer ', '')
      return t === 'admin-token' ? json(200, authUsers.get(ADMIN)) : t === 'emp-token' ? json(200, authUsers.get(EMP)) : json(401, { msg: 'bad jwt' })
    }
    if (u.pathname === '/rest/v1/profiles') {
      const q = Object.fromEntries(u.searchParams)
      if (req.method === 'GET') {
        let rows = profiles
        if (q.id) rows = rows.filter(p => p.id === q.id.slice(3))
        if (q.role) rows = rows.filter(p => p.role === q.role.slice(3))
        if (q.status) rows = rows.filter(p => p.status === q.status.slice(3))
        if (q.login_id) rows = rows.filter(p => p.login_id.toLowerCase() === q.login_id.slice(6).toLowerCase())
        if (q.employee_id) rows = rows.filter(p => p.employee_id === q.employee_id.slice(3))
        return json(200, rows)
      }
      if (req.method === 'POST') { profiles.push(b); return json(201, [b]) }
      if (req.method === 'PATCH') { const p = profiles.find(x => x.id === q.id.slice(3)); Object.assign(p, b); return json(200, [p]) }
    }
    if (u.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
      const id = `${String(n++).repeat(8)}-0000-0000-0000-000000000000`.slice(0, 36)
      authUsers.set(id, { id, email: b.email }); return json(200, { id, email: b.email })
    }
    if (u.pathname.startsWith('/auth/v1/admin/users/')) return json(200, {})
    if (u.pathname === '/rest/v1/fluent_form_leads' && req.method === 'POST') { leadsInCloud.push(b); return json(201, []) }
    json(404, { message: 'mock: unknown ' + u.pathname })
  })
})
await new Promise(r => mock.listen(54329, r))

const child = spawn(process.execPath, [serverFile], { env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:54329', SUPABASE_SERVICE_ROLE_KEY: 'test-key', DATA_DIR: dataDir, FLUENT_WEBHOOK_SECRET: 'hook-secret' }, stdio: 'pipe' })
await new Promise(r => setTimeout(r, 700))

const api = async (method, p, token, body) => {
  const r = await fetch(`http://127.0.0.1:3001${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, body: await r.json().catch(() => null) }
}
let fail = 0
const check = (cond, msg, extra) => { console.log(cond ? 'PASS ' : 'FAIL ', msg, cond ? '' : JSON.stringify(extra)); if (!cond) fail++ }

try {
  let r = await api('GET', '/api/admin/users')
  check(r.status === 401, 'no token → 401', r)
  r = await api('GET', '/api/admin/users', 'emp-token')
  check(r.status === 403, 'employee → 403', r)
  r = await api('GET', '/api/admin/users', 'admin-token')
  check(r.status === 200 && r.body.length === 2, 'admin lists users', r)
  r = await api('POST', '/api/admin/users', 'admin-token', { login_id: 'SW-0002', full_name: 'TEST Rupa', role: 'employee', password: 'weak' })
  check(r.status === 400, 'weak password rejected', r)
  r = await api('POST', '/api/admin/users', 'admin-token', { login_id: 'sw-0001', full_name: 'Dup', role: 'employee', password: 'Strong-Pass-2026' })
  check(r.status === 409, 'duplicate login id rejected (case-insensitive)', r)
  r = await api('POST', '/api/admin/users', 'admin-token', { login_id: 'SW-0002', full_name: 'Dup emp', role: 'employee', employee_id: 'e1', password: 'Strong-Pass-2026' })
  check(r.status === 409, 'employee with a login cannot get a second one', r)
  r = await api('POST', '/api/admin/users', 'admin-token', { login_id: 'SW-0002', full_name: 'TEST Rupa', role: 'manager', employee_id: 'e2', password: 'Strong-Pass-2026' })
  check(r.status === 201 && r.body.email === 'crm-sw-0002@safaeewala.com' && r.body.role === 'manager', 'admin creates user', r)
  const newId = r.body && r.body.id
  r = await api('PATCH', `/api/admin/users/${ADMIN}`, 'admin-token', { role: 'employee' })
  check(r.status === 400, 'last admin cannot be demoted', r)
  r = await api('PATCH', `/api/admin/users/${newId}`, 'admin-token', { status: 'disabled' })
  check(r.status === 200 && r.body.status === 'disabled' && calls.includes(`PUT /auth/v1/admin/users/${newId}`), 'disable user also bans sign-in', r)
  r = await api('PATCH', `/api/admin/users/${newId}`, 'admin-token', { password: 'Another-Strong-1' })
  check(r.status === 200, 'admin resets password', r)
  r = await api('PATCH', `/api/admin/users/${EMP}`, 'emp-token', { role: 'admin' })
  check(r.status === 403, 'employee cannot promote themselves', r)
  // SEC-04: dashboard endpoints need a signed-in user; webhook needs the secret
  r = await api('GET', '/api/webhook/fluent-forms')
  check(r.status === 401, 'leads list without sign-in → 401 (SEC-04)', r)
  r = await api('GET', '/api/webhook/fluent-forms', 'emp-token')
  check(r.status === 200, 'leads list for signed-in user → 200', r)
  r = await api('POST', '/api/agencies', null, [])
  check(r.status === 401, 'agency overwrite without sign-in → 401', r)
  r = await api('POST', '/api/webhook/fluent-forms', null, { client_name: 'TEST lead', phone: '0500000000' })
  check(r.status === 401, 'webhook without secret → 401', r)
  r = await api('POST', '/api/webhook/fluent-forms?secret=wrong', null, { client_name: 'TEST lead', phone: '0500000000' })
  check(r.status === 401, 'webhook with wrong secret → 401', r)
  r = await api('POST', '/api/webhook/fluent-forms?secret=hook-secret', null, { client_name: 'TEST lead', phone: '0500000000' })
  check(r.status >= 200 && r.status < 300, 'webhook with secret accepted', r)
  await new Promise(res => setTimeout(res, 200))
  check(leadsInCloud.length === 1 && leadsInCloud[0].client_name === 'TEST lead' && !('is_read' in leadsInCloud[0]), 'new website lead is saved in Supabase too (AUD-59)', leadsInCloud)
  let h = await fetch('http://127.0.0.1:3001/api/webhook/fluent-forms', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
  check(!h.headers.get('access-control-allow-origin'), 'unknown origin gets no CORS header', h.headers.get('access-control-allow-origin'))
  h = await fetch('http://127.0.0.1:3001/api/webhook/fluent-forms', { method: 'OPTIONS', headers: { Origin: 'https://crm.srv1646539.hstgr.cloud' } })
  check(h.headers.get('access-control-allow-origin') === 'https://crm.srv1646539.hstgr.cloud', 'dashboard origin allowed', h.headers.get('access-control-allow-origin'))
  // TA-24: app error log
  r = await api('POST', '/api/logs/errors', null, { message: 'TEST crash' })
  check(r.status === 401, 'error report without sign-in → 401', r)
  r = await api('POST', '/api/logs/errors', 'emp-token', { message: 'TEST crash', where: 'screen /bookings', stack: 'x'.repeat(5000) })
  check(r.status === 201, 'signed-in user can report an error', r)
  r = await api('GET', '/api/logs/errors', 'admin-token')
  check(r.status === 200 && r.body[0]?.message === 'TEST crash' && r.body[0].stack.length <= 2000, 'error log lists newest first, long stacks cut', r.body?.[0])
  // TA-18: GHL key lives on the server
  r = await api('GET', '/api/ghl/status', 'emp-token')
  check(r.status === 200 && r.body.configured === false, 'GHL status says not configured (no key in browser)', r)
  r = await api('POST', '/api/ghl/test', null)
  check(r.status === 401, 'GHL test without sign-in → 401', r)
  // SEC-05: path traversal in backup file name
  r = await api('POST', '/api/webhook/google-drive-backup', 'admin-token', { filename: '../../evil.xlsx', file_base64: Buffer.from('x').toString('base64') })
  const escaped = fs.existsSync(path.join(dataDir, '..', 'evil.xlsx')) || fs.existsSync(path.join(dataDir, 'evil.xlsx'))
  check(!escaped && fs.existsSync(path.join(dataDir, 'backups', 'evil.xlsx')), 'backup file stays inside backups/ (SEC-05)', fs.readdirSync(dataDir))
  const big = 'x'.repeat(1.5 * 1024 * 1024)
  r = await api('POST', '/api/admin/users', 'admin-token', { login_id: 'SW-0003', full_name: big, role: 'employee', password: 'Strong-Pass-2026' }).catch(e => ({ status: 'closed', body: String(e) }))
  check(r.status === 413 || r.status === 'closed', 'oversized request refused', r.status)
} finally {
  child.kill(); mock.close()
}
console.log(fail ? `${fail} FAILED` : 'ALL PASSED')
process.exit(fail ? 1 : 0)
