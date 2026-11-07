// Employees go-live audit 2026-11-06: no silent loss in the outbox, cleared fields reach Supabase,
// an empty cloud read is not filled from an old browser copy, import fills blank fields (R-SYNC-13, R-EMP-07)
import { readFileSync } from 'node:fs'
import { db, failing } from '@/lib/supabase'
import { dbUpdate, dbInsert, flushOutbox, getSyncStatus, isTransientError, MAX_TRIES } from '@/lib/syncQueue'
import { blankFieldsFromImport } from '@/lib/employeeImport'
import { safeLocalStorageGet } from '@/lib/storageUtils'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const tick = () => new Promise(r => setTimeout(r, 20))

// R-SYNC-13: offline tries do not count; a rejected change is kept and reported, not dropped after 5 tries
eq([isTransientError('TypeError: Failed to fetch'), isTransientError('timeout'), isTransientError('stub failure on employees')], [true, true, false], 'network errors are told apart from rejections')
failing.add('employees')
dbInsert('employees', { id: 'TEST-e1', full_name: 'TEST Rupa' })
await tick()
for (let i = 0; i < 10; i++) await flushOutbox()
eq(getSyncStatus().pending, 1, 'still waiting after 10 failed retries (was dropped after 5)')
for (let i = 0; i < MAX_TRIES; i++) await flushOutbox()
eq(getSyncStatus().pending, 0, 'given up only after MAX_TRIES')
eq(safeLocalStorageGet<{ rowId: string }[]>('safaeewala_sync_failed', []).map(e => e.rowId), ['TEST-e1'], 'the given-up change is kept for recovery')
failing.delete('employees')

// cleared fields are sent as null
db.employees = [{ id: 'TEST-e2', full_name: 'TEST Mina', visa_expiry: '2027-01-01' }]
const dc = readFileSync('src/store/DataContext.tsx', 'utf8')
eq(/dbUpdate\('employees', id, withoutInlineDocs\(Object\.fromEntries\(Object\.entries\(patch\)\.map\(\(\[k, v\]\) => \[k, v === undefined \? null : v\]\)\), EMP_FILE_FIELDS\)\)/.test(dc), true, 'updateEmployee sends a cleared field as null (files left out, R-SYNC-15)')
dbUpdate('employees', 'TEST-e2', { visa_expiry: null })
await tick()
eq(db.employees.find(r => r.id === 'TEST-e2')?.visa_expiry ?? null, null, 'null clears the value in Supabase')

// an empty but successful read is the truth
eq(/return applyOutbox\(table, server\)/.test(dc) && !/return saved\.length > 0 \? withPending\(table, saved\) : \[\]/.test(dc), true, 'empty cloud table is not refilled from the browser copy')

// R-EMP-07: import fills only blanks
eq(blankFieldsFromImport({ full_name: 'Maria', phone: '', nationality: 'Nepal', monthly_salary: 0 }, { full_name: 'Maria', phone: '0501234567', nationality: 'India', monthly_salary: 1800, email: undefined }),
  { phone: '0501234567', monthly_salary: 1800 }, 'blank phone / salary filled, existing nationality kept')
eq(/blankFieldsFromImport\(known, r\)/.test(readFileSync('src/pages/Employees.tsx', 'utf8')), true, 'Employees import uses it for people already on the list')
