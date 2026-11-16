// R-SCHED-16 (2026-11-16): "Office ABC Trading DMCC" (no service days) could not be saved at all — every edit
// was refused with "Service days (tick at least one)", and with no day the save would have crashed.
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const f = readFileSync('src/components/monthlyClients/AddMonthlyClientModalForm.tsx', 'utf8')
eq(/ok: activeDays\.length > 0 \|\| !!initialClient/.test(f), true, 'an existing client saves without days; a new one still needs a day')
eq(/if \(activeDays\.length === 0\) notify\.warning\(/.test(f), true, 'a warning says no visits are added without a day')
eq(/scheduled_time: firstRow\?\.startTime \?\? initialClient\?\.scheduled_time/.test(f) && /end_time: firstRow\?\.endTime \?\? initialClient\?\.end_time/.test(f), true, 'no crash when no day is ticked')
eq(/R-SCHED-16/.test(readFileSync('rules.md', 'utf8')), true, 'rule written')

// R-SCHED-17: the 7-Day Schedule tab of Edit Monthly Client had no Save button
const modal = readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8')
eq(/\{activeTab === 'profile' && \(/.test(modal), false, 'Save / Cancel are no longer only on the Profile tab')
eq(/form=\{showMonthlyFlow \|\| \(isMonthly && isEdit && activeTab === 'schedule'\) \? 'add-monthly-client-form' : 'client-modal-form'\}/.test(modal), true, 'on the schedule tab Save submits the schedule form')
eq(/R-SCHED-17/.test(readFileSync('rules.md', 'utf8')), true, 'rule written')
