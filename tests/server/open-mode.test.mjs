// Before user management is configured the API stays open (nothing breaks before the owner setup)
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
console.log(a.status === 200 ? 'PASS  open mode: leads still work before setup' : 'FAIL ' + a.status)
console.log(b.status === 503 ? 'PASS  open mode: user admin says "not set up"' : 'FAIL ' + b.status)
child.kill()
await new Promise(r => child.once('exit', r))
