// A field without a database column no longer blocks the whole row (cloud audit 2026-11-01)
import { db, missingColumns } from '@/lib/supabase'
import { dbInsert, dbUpdate, getSyncStatus } from '@/lib/syncQueue'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m) }
const tick = () => new Promise(r => setTimeout(r, 30))

missingColumns.employees = ['nickname']
dbInsert('employees', { id: 'e1', full_name: 'TEST Rupa', nickname: 'R' } as any)
await tick()
eq(db.employees?.[0], { id: 'e1', full_name: 'TEST Rupa' }, 'row saved without the unknown field')
eq(getSyncStatus().pending, 0, 'nothing stuck in the outbox')

dbUpdate('employees', 'e1', { nickname: 'Ru' })
await tick()
eq(getSyncStatus().pending, 0, 'an update with only an unknown field is dropped, not stuck')

dbInsert('daily_jobs', { id: 'j1', date: '2026-11-01', staff_name: 'TEST Rupa', team_name: 'Project Team' } as any)
await tick()
eq(db.daily_jobs?.[0]?.team_name, 'Project Team', 'team_name now reaches the cloud')
