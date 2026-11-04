// SEC-06: before the service key is set, reading data still needs a sign-in; a lead can still be sent
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const serverFile = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'webhookServer.cjs')
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safaeewala-open-test-'))
const child = spawn(process.execPath, [serverFile], { env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FLUENT_WEBHOOK_SECRET: '', DATA_DIR: dataDir }, stdio: 'pipe' })
await new Promise(r => setTimeout(r, 700))
const a = await fetch('http://127.0.0.1:3001/api/webhook/fluent-forms')
const b = await fetch('http://127.0.0.1:3001/api/admin/users')
const c = await fetch('http://127.0.0.1:3001/api/webhook/fluent-forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'TEST Lead', phone: '0500000000' }) })
const d = await fetch('http://127.0.0.1:3001/api/agencies')
console.log(a.status === 401 ? 'PASS  no service key: reading leads needs a sign-in' : 'FAIL leads read ' + a.status)
console.log(d.status === 401 ? 'PASS  no service key: agencies need a sign-in' : 'FAIL agencies read ' + d.status)
console.log(c.status < 300 ? 'PASS  no service key: Fluent Forms can still send a lead' : 'FAIL lead post ' + c.status)
console.log(b.status === 503 ? 'PASS  open mode: user admin says "not set up"' : 'FAIL ' + b.status)
child.kill()
await new Promise(r => child.once('exit', r))
