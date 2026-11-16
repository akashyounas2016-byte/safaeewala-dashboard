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
eq(/form=\{showMonthlyFlow \? 'add-monthly-client-form' : 'client-modal-form'\}/.test(modal), true, 'Save sends the form that is shown (R-SCHED-18)')

// R-SCHED-18: one form, chosen by the Mode; Mode can be changed after the client is created
eq(/activeTab/.test(modal) || /7-Day Schedule<\/span>/.test(modal), false, 'no Profile / 7-Day Schedule tabs')
eq(/const showMonthlyFlow = mode === 'monthly'/.test(modal), true, 'Monthly (new or existing) → the monthly form with contract, profile, balances and schedule')
eq(/disabled=\{monthlyEdit\}/.test(modal), false, 'Mode can be changed for an existing client')
eq(/mode === 'monthly' \? 'Edit Monthly Client' : mode === 'biweekly' \? 'Edit Bi-Weekly Client' : 'Edit Client Profile'/.test(modal), true, '"Edit Monthly Client" only for Monthly; Bi-Weekly / General have their own title')
eq(/if \(hadMonthlySchedule\) \{\s*patch\.service_days = \[\]/.test(modal), true, 'Monthly → General / Bi-Weekly clears the weekly schedule (no more monthly visits)')
eq(/R-SCHED-18/.test(readFileSync('rules.md', 'utf8')), true, 'R-SCHED-18 written')

// UX-161: Weekly Schedule section can be hidden; Apply Mon Times / Staff removed
eq(/Apply Mon Times|Apply Mon Staff/.test(f), false, 'Apply Mon Times / Staff removed')
eq(/onClick=\{toggleSchedule\}/.test(f) && /className=\{scheduleOpen \? 'overflow-x-auto' : 'hidden'\} data-field="schedule_days"/.test(f), true, 'Hide / Show toggle; the table stays in the form when hidden')
eq(/if \(activeDays\.length === 0 && !initialClient\) setScheduleOpen\(true\)/.test(f), true, 'opens again when a day must be ticked')
eq(/R-SCHED-17/.test(readFileSync('rules.md', 'utf8')), true, 'rule written')
