// R-DOC-01 / R-OPS-04: copy every file of the private Storage buckets (passport, EID, work permit … images, chat
// media) to the VPS backup folder. Only files not copied before are downloaded; nothing is ever deleted from the
// copy, so every version of every document stays. Run by db-backup.sh in a node container.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OUT (folder), BUCKETS (comma list, default staff-documents)
const fs = require('fs')
const path = require('path')

const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const out = process.env.OUT || '/out'
const buckets = String(process.env.BUCKETS || 'staff-documents').split(',').map(s => s.trim()).filter(Boolean)
if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(1) }
const headers = { apikey: key, Authorization: `Bearer ${key}` }

async function list(bucket, prefix) {
  const files = []
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (r.status === 400 || r.status === 404) return files // bucket not there
    if (!r.ok) throw new Error(`list ${bucket}/${prefix}: HTTP ${r.status}`)
    const rows = await r.json()
    for (const row of rows) {
      const p = prefix ? `${prefix}/${row.name}` : row.name
      if (row.id === null || !row.metadata) files.push(...await list(bucket, p)) // a folder
      else files.push({ path: p, size: Number(row.metadata.size) || 0 })
    }
    if (rows.length < 1000) return files
  }
}

;(async () => {
  let copied = 0, kept = 0, failed = 0, bytes = 0
  for (const bucket of buckets) {
    const files = await list(bucket, '')
    for (const f of files) {
      const dest = path.join(out, bucket, f.path)
      if (process.env.DRY) { bytes += f.size; copied++; continue } // DRY=1: count only, download nothing
      if (fs.existsSync(dest) && fs.statSync(dest).size === f.size) { kept++; continue }
      const r = await fetch(`${url}/storage/v1/object/${bucket}/${f.path.split('/').map(encodeURIComponent).join('/')}`, { headers })
      if (!r.ok) { failed++; console.error(`download ${bucket}/${f.path}: HTTP ${r.status}`); continue }
      const buf = Buffer.from(await r.arrayBuffer())
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest + '.tmp', buf)
      fs.renameSync(dest + '.tmp', dest)
      copied++; bytes += buf.length
    }
  }
  console.log(`storage: ${copied} new files (${Math.round(bytes / 1024)} KB), ${kept} already copied, ${failed} failed`)
  if (failed) process.exit(2)
})().catch(e => { console.error(e.message); process.exit(1) })
