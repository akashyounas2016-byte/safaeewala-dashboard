// Test runner (TA-08) — no extra packages: bundles each tests/unit/*.test.ts with rolldown (already
// installed with Vite), replaces Supabase with an in-memory stand-in, and runs it in a fresh Node
// process with a minimal browser environment. Then runs tests/server/*.test.mjs against
// webhookServer.cjs. A test fails when it prints a line starting with "FAIL" or exits non-zero.
//
//   npm test                 all tests
//   npm test -- validation   only files whose name contains "validation"
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src')
const stub = path.join(root, 'tests', 'support', 'supabaseStub.ts')
const filter = process.argv[2] || ''
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'safaeewala-tests-'))

const ENV_PRELUDE = `;(() => {
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}
globalThis.sessionStorage = globalThis.localStorage
const et = new EventTarget()
globalThis.addEventListener = et.addEventListener.bind(et)
globalThis.removeEventListener = et.removeEventListener.bind(et)
globalThis.dispatchEvent = et.dispatchEvent.bind(et)
globalThis.window = globalThis
})();
`

const alias = {
  name: 'alias',
  resolveId(id) {
    if (id === '@/lib/supabase') return stub
    if (id.startsWith('@/')) {
      const base = path.join(src, id.slice(2))
      for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + ext)) return base + ext
    }
    return null
  },
}

const results = []
const run = (name, cmd, args, extraEnv = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...extraEnv }, timeout: 120_000 })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const lines = out.split(/\r?\n/)
  const passed = lines.filter(l => /^PASS\b/.test(l)).length
  const failed = lines.filter(l => /^FAIL\b/.test(l))
  const ok = r.status === 0 && failed.length === 0
  results.push({ name, ok, passed, failed })
  console.log(`${ok ? '✓' : '✗'} ${name} — ${passed} passed${failed.length ? `, ${failed.length} failed` : ''}${r.status && !failed.length ? ` (exit ${r.status})` : ''}`)
  if (!ok) console.log(failed.length ? failed.map(l => `    ${l}`).join('\n') : out.split(/\r?\n/).slice(-15).map(l => `    ${l}`).join('\n'))
}

const unitDir = path.join(root, 'tests', 'unit')
for (const file of fs.readdirSync(unitDir).filter(f => f.endsWith('.test.ts') && f.includes(filter)).sort()) {
  const outFile = path.join(tmp, file.replace(/\.ts$/, '.mjs'))
  try {
    const bundle = await rolldown({ input: path.join(unitDir, file), platform: 'node', plugins: [alias], logLevel: 'silent' })
    await bundle.write({ file: outFile, format: 'esm', banner: ENV_PRELUDE })
    await bundle.close()
  } catch (err) {
    results.push({ name: file, ok: false, passed: 0, failed: [String(err)] })
    console.log(`✗ ${file} — could not build: ${err instanceof Error ? err.message : err}`)
    continue
  }
  run(file, process.execPath, [outFile])
}

const serverDir = path.join(root, 'tests', 'server')
for (const file of fs.readdirSync(serverDir).filter(f => f.endsWith('.test.mjs') && f.includes(filter)).sort()) {
  run(file, process.execPath, [path.join(serverDir, file)])
}

fs.rmSync(tmp, { recursive: true, force: true })
const failedFiles = results.filter(r => !r.ok)
const total = results.reduce((n, r) => n + r.passed, 0)
console.log(`\n${results.length} files · ${total} checks passed · ${failedFiles.length} file(s) failed`)
process.exit(failedFiles.length ? 1 : 0)
