// R-SYNC-19 (audit 2026-11-15, B6): an item deleted on one device does not come back from another device
// that still had it and had unsaved changes. "Cloud Test" contracts against the in-memory Supabase.
import { db, failing } from '@/lib/supabase'
import { pullCloudState, retryCloudState, mergeTombstones, mergeValues, TOMBSTONES_KEY, CLOUD_SYNCED_KEYS } from '@/lib/cloudState'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let failed = 0
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`)
  if (!cond) failed++
}
const KEY = 'safaeewala_recurring_contracts'
const ids = (v: unknown) => ((v as { id: string }[]) || []).map(x => x.id).sort().join(',')
const cloud = (k: string) => db.app_state.find(r => r.key === k)?.value

async function main() {
  // pure helpers
  const now = Date.parse('2026-11-16T10:00:00Z')
  check('later marker wins', mergeTombstones({ a: 'd:2026-11-16T09:00:00Z' }, { a: 'r:2026-11-16T09:30:00Z' }, now).a === 'r:2026-11-16T09:30:00Z')
  check('markers older than 120 days are dropped', Object.keys(mergeTombstones({ old: 'd:2026-01-01T00:00:00Z' }, {}, now)).length === 0)
  check('merge leaves a deleted item out', ids(mergeValues([{ id: 'x' }, { id: 'z' }], [{ id: 'x' }, { id: 'y' }], KEY, { [`${KEY}|id:x`]: 'd:2026-11-16T09:00:00Z' })) === 'y,z')
  check('records (objects) too', JSON.stringify(mergeValues({ a: 1 }, { a: 1, b: 2 }, 'k', { 'k|key:b': 'd:2026-11-16T09:00:00Z' })) === '{"a":1}')
  check('markers sync before the lists', CLOUD_SYNCED_KEYS[0] === TOMBSTONES_KEY)

  // ── the live case ──
  db.app_state = [{ key: KEY, value: [{ id: 'x', clientName: 'Cloud Test X' }, { id: 'y', clientName: 'Cloud Test Y' }], updated_at: '2026-11-16T08:00:00.000Z' }]
  localStorage.clear()
  await pullCloudState() // device B opens the CRM
  // B goes offline and adds a contract (unsaved)
  failing.add('app_state')
  safeLocalStorageSet(KEY, [...safeLocalStorageGet<unknown[]>(KEY, []), { id: 'z', clientName: 'Cloud Test Z' }])
  await sleep(900)
  // meanwhile device A deletes contract x
  db.app_state = [
    { key: KEY, value: [{ id: 'y', clientName: 'Cloud Test Y' }], updated_at: '2026-11-16T09:00:00.000Z' },
    { key: TOMBSTONES_KEY, value: { [`${KEY}|id:x`]: 'd:2026-11-16T09:00:00.000Z' }, updated_at: '2026-11-16T09:00:00.000Z' },
  ]
  // B comes back online
  failing.delete('app_state')
  retryCloudState()
  await sleep(200)
  check('deleted on device A → not brought back by device B', ids(cloud(KEY)) === 'y,z', cloud(KEY))
  check('device B shows it gone too', ids(safeLocalStorageGet(KEY, [])) === 'y,z', safeLocalStorageGet(KEY, []))

  // B deletes y → marker uploaded first, then the list
  safeLocalStorageSet(KEY, safeLocalStorageGet<{ id: string }[]>(KEY, []).filter(c => c.id !== 'y'))
  await sleep(1000)
  const marks = cloud(TOMBSTONES_KEY) as Record<string, string>
  check('a deletion uploads a marker', /^d:/.test(marks?.[`${KEY}|id:y`] || ''), marks)
  check('list uploaded without it', ids(cloud(KEY)) === 'z', cloud(KEY))

  // restore: adding y again wins over its marker
  safeLocalStorageSet(KEY, [...safeLocalStorageGet<unknown[]>(KEY, []), { id: 'y', clientName: 'Cloud Test Y' }])
  await sleep(1000)
  check('restored item marked "added again"', /^r:/.test((cloud(TOMBSTONES_KEY) as Record<string, string>)[`${KEY}|id:y`] || ''), cloud(TOMBSTONES_KEY))
  check('restored item stays in the cloud', ids(cloud(KEY)) === 'y,z', cloud(KEY))

  // Excel colours never make markers
  safeLocalStorageSet('safaeewala_excel_cell_colors', { c1: 'red' })
  safeLocalStorageSet('safaeewala_excel_cell_colors', {})
  await sleep(1000)
  check('no markers for colours', !Object.keys((cloud(TOMBSTONES_KEY) || {}) as object).some(k => k.startsWith('safaeewala_excel_cell_colors')), cloud(TOMBSTONES_KEY))

  if (failed) process.exitCode = 1
}
void main()
