// Behaviour tests for src/lib/syncQueue.ts and src/lib/cloudState.ts against an in-memory Supabase
import { db, failing, tsFormat } from '@/lib/supabase'
import { dbInsert, dbUpdate, dbDelete, applyOutbox, flushOutbox, getSyncStatus } from '@/lib/syncQueue'
import { pullCloudState, getCloudStateStatus } from '@/lib/cloudState'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let failed = 0
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`)
  if (!cond) failed++
}
const PAY = 'safaeewala_monthly_client_payments'

async function main() {
  // ── Outbox ──
  failing.add('employees')
  dbInsert('employees', { id: 'e1', full_name: 'Test One', photo_url: 'x' })
  await sleep(10)
  check('failed insert is kept in outbox', getSyncStatus().pending === 1)
  check('load merges pending insert into server rows', applyOutbox('employees', [{ id: 'e0' }]).some(r => r.id === 'e1'))

  dbUpdate('employees', 'e1', { phone: '050' })
  await sleep(10)
  check('update of an unsaved row is folded, not lost', getSyncStatus().pending === 1)

  failing.delete('employees')
  await flushOutbox()
  const saved = db.employees?.find(r => r.id === 'e1')
  check('retry saves insert + later update together', saved?.full_name === 'Test One' && saved?.phone === '050', saved)
  check('outbox empty after successful retry', getSyncStatus().pending === 0)

  db.agencies = [{ id: 'a1', name: 'Keep' }, { id: 'a2', name: 'Gone' }]
  failing.add('agencies')
  dbDelete('agencies', 'a2')
  await sleep(10)
  check('pending delete hidden on load', !applyOutbox('agencies', db.agencies).some(r => r.id === 'a2'))
  failing.delete('agencies')
  await flushOutbox()
  check('delete applied on retry', !db.agencies.some(r => r.id === 'a2'))

  // ── Cloud state: first upload ──
  localStorage.clear()
  db.app_state = []
  safeLocalStorageSet(PAY, [{ id: 'p1', amount: 100 }])
  await sleep(1000)
  check('browser-only payments uploaded', JSON.stringify(db.app_state.find(r => r.key === PAY)?.value) === '[{"id":"p1","amount":100}]', db.app_state)

  // ── Second device with its own unsynced data merges instead of overwriting ──
  localStorage.clear()
  localStorage.setItem(PAY, JSON.stringify([{ id: 'p2', amount: 50 }]))
  await pullCloudState()
  await sleep(50)
  const ids = safeLocalStorageGet<any[]>(PAY, []).map(p => p.id).sort().join(',')
  check('device B keeps its own payment and gets device A\x27s', ids === 'p1,p2', ids)
  await sleep(50)
  const cloudIds = (db.app_state.find(r => r.key === PAY)?.value || []).map((p: any) => p.id).sort().join(',')
  check('merged list uploaded to cloud', cloudIds === 'p1,p2', cloudIds)

  // ── Deletion survives even if Postgres returns timestamps in another format ──
  tsFormat.pg = true
  safeLocalStorageSet(PAY, safeLocalStorageGet<any[]>(PAY, []).filter(p => p.id !== 'p1'))
  await sleep(1000)
  const afterDelete = (db.app_state.find(r => r.key === PAY)?.value || []).map((p: any) => p.id).join(',')
  check('deleted payment does not come back', afterDelete === 'p2', afterDelete)
  check('nothing left unsynced', getCloudStateStatus().unsynced === 0, getCloudStateStatus())

  // ── A plain reload takes the cloud value ──
  localStorage.setItem(PAY, JSON.stringify([]))
  const meta = JSON.parse(localStorage.getItem('safaeewala_cloud_state_meta') || '{}')
  localStorage.setItem('safaeewala_cloud_state_meta', JSON.stringify({ ...meta, [PAY]: { ...meta[PAY], dirty: false } }))
  await pullCloudState()
  check('reload restores data from cloud', safeLocalStorageGet<any[]>(PAY, []).length === 1)

  // ── Table missing (migration not run yet) ──
  failing.add('app_state')
  safeLocalStorageSet(PAY, [{ id: 'p3' }])
  await sleep(1000)
  check('upload failure is reported, data stays local', getCloudStateStatus().unsynced === 1 && !!getCloudStateStatus().lastError
    && safeLocalStorageGet<any[]>(PAY, [])[0]?.id === 'p3', getCloudStateStatus())

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
  process.exit(failed ? 1 : 0)
}
void main()
