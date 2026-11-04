// R-EMP-06: job-sheet cleaners are registered as real employees (same id, never TEST records)
import fs from 'node:fs'
import { staffToRegister, isUnregisteredStaff, isTestStaffName } from '@/lib/staffRegistry'
import type { Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const emp = (id: string, full_name: string) => ({ id, full_name, role: 'cleaner' }) as Employee

const saved = [emp('9ff4-uuid', 'Driver One'), emp('emp-dj-shanti', 'Shanti')]
const shown = [...saved, emp('emp-dj-adnan', 'Adnan'), emp('emp-dj-test cleaner', 'TEST Cleaner')]
eq(staffToRegister(shown, saved).map(e => e.id), ['emp-dj-adnan'], 'only unsaved job-sheet staff, same id, no TEST names')
eq(staffToRegister(saved, saved), [], 'nothing to do once everyone is saved')
eq([isTestStaffName('TEST Ali'), isTestStaffName('Testa Rani')], [true, false], 'TEST prefix is a whole word')
eq([isUnregisteredStaff(shown[2], saved), isUnregisteredStaff(saved[1], saved)], [true, false], 'a saved emp-dj row counts as registered')

const ctx = fs.readFileSync('src/store/DataContext.tsx', 'utf8')
eq(/ignoreDuplicates: true/.test(ctx) && /cloudStaffReadRef\.current/.test(ctx), true, 'registers only after a real cloud read, never overwrites a saved row')
eq(/if \(saved \|\| !id\.startsWith\('emp-dj-'\)\) dbDelete/.test(ctx), true, 'deleting a registered job-sheet cleaner removes the cloud row')
