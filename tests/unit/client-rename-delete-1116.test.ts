// R-CLI-10 / R-CLI-11 (2026-11-16): renaming a client ("def" → "def1") shows on the sheet; deleting says what goes
import { readFileSync } from 'node:fs'
import { renamedRowAddress, clientDeletionImpact, deletionMessage } from '@/lib/clientChanges'
import type { Client, DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const before = { id: 'dj-def', full_name: 'Zayan', building_name: 'apt# 2 CDG' } as Client
eq(renamedRowAddress('def', before, { full_name: 'def1', building_name: 'def1' }), 'def1', 'row built from "def" (dj-def) → new address')
const mon = { id: 'c1', full_name: 'Cloud Test Sara', building_name: 'Al Khair' } as Client
eq(renamedRowAddress('Al Khair - Cloud Test Sara', mon, { ...mon, full_name: 'Cloud Test Sara K' }), 'Al Khair - Cloud Test Sara K', 'monthly visit address follows the new name')
eq(renamedRowAddress('Al Khair', mon, { ...mon, building_name: 'Al Khair Tower' }), 'Al Khair Tower', 'building renamed')
eq(renamedRowAddress('Some other villa', mon, { ...mon, full_name: 'X' }), null, 'other text on the row stays')

const job = (id: string, date: string, received = 0) => ({ id, date, address: 'Al Khair - Cloud Test Sara', staff_name: 'A', start_time: '09:00', end_time: '13:00', charges: 100, received, payment_mode: 'Monthly', remarks: 'Monthly Contract' }) as unknown as DailyJob
const jobs = [job('p1', '2026-11-01', 100), job('p2', '2026-11-10'), job('f1', '2026-11-20'), job('f2', '2026-11-27', 100)]
const impact = clientDeletionImpact(mon, jobs, '2026-11-16', { bookings: [{ client_id: 'c1', client_name: '' }], invoices: [], contractNames: ['Cloud Test Sara', 'Other'] })
eq(impact, { upcoming: 1, past: 3, contracts: 1, bookings: 1, invoices: 0 }, 'upcoming unpaid visits go; past / paid rows, bookings stay')
const msg = deletionMessage(mon, impact)
eq(/1 upcoming unpaid visit on the Job Sheet/.test(msg) && /3 past or paid job rows/.test(msg) && /Before-delete copies/.test(msg), true, 'popup text lists what goes and what stays')

const ctx = readFileSync('src/store/DataContext.tsx', 'utf8')
eq(/if \(before && identityChanged\) renameRowsOfClient\(before, \{ \.\.\.before, \.\.\.patch \}, id\)/.test(ctx) && /if \(\(j\.date \|\| ''\)\.slice\(0, 10\) < today\) return/.test(ctx), true, 'rows from today on get the new address; past rows stay')
eq(/clients: saved \? \[saved\] : \[\], contracts: ownContracts/.test(ctx) && /putBack\(r\.clients, clients, setClients/.test(ctx), true, 'the delete copy keeps the client and contracts; Restore brings them back')
const cl = readFileSync('src/pages/Clients.tsx', 'utf8')
eq((cl.match(/message: deleteText\(c\)/g) || []).length === 2 && /\{deleteText\(selected\)\}/.test(cl) && /deletionMessage\(client, clientDeletionImpact/.test(readFileSync('src/pages/ClientProfile.tsx', 'utf8')), true, 'every client delete shows it')
eq(/R-CLI-10/.test(readFileSync('rules.md', 'utf8')) && /R-CLI-11/.test(readFileSync('rules.md', 'utf8')), true, 'rules written')
