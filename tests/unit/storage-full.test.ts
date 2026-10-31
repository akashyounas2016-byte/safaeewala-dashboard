// Full browser storage: cloud tables are cached without embedded files, or skipped — no false alarm
import { safeLocalStorageSet, getStorageProblem } from '@/lib/storageUtils'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m) }

// a tiny quota: values over 3,000 characters are refused like a full browser
const real = localStorage.setItem.bind(localStorage)
;(localStorage as any).setItem = (k: string, v: string) => { if (v.length > 3000) { const e: any = new Error('quota'); e.name = 'QuotaExceededError'; throw e } real(k, v) }

const photo = 'data:image/png;base64,' + 'A'.repeat(5000)
safeLocalStorageSet('safaeewala_agencies', [{ id: 'a1', name: 'TEST Agency', documents: [{ file_data: photo, name: 'licence' }] }])
eq(JSON.parse(localStorage.getItem('safaeewala_agencies') || '[]')[0]?.name, 'TEST Agency', 'agency cached without the embedded file')
eq(JSON.parse(localStorage.getItem('safaeewala_agencies') || '[]')[0]?.documents?.[0]?.file_data, undefined, 'file data left in the cloud')
eq(getStorageProblem(), null, 'no red banner for a cloud table copy')

safeLocalStorageSet('safaeewala_daily_jobs', Array.from({ length: 200 }, (_, i) => ({ id: 'j' + i, staff_name: 'TEST' })))
eq(localStorage.getItem('safaeewala_daily_jobs'), null, 'too big even without files → not cached, no stale copy')
eq(getStorageProblem(), null, 'still no false alarm')

safeLocalStorageSet('safaeewala_daily_pending_items', Array.from({ length: 200 }, (_, i) => ({ id: 'p' + i, client: 'TEST' })))
eq(typeof getStorageProblem(), 'string', 'business list that is not a table still warns')
