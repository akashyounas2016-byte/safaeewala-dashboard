// R-SCHED-16..20 (2026-11-16): the monthly client in the one client popup.
// "Office ABC Trading DMCC" (no service days) could not be saved; the 7-Day Schedule tab had no Save; two tabs had
// two Contract sections; now one popup for every Mode with the weekly schedule card for Monthly.
import { readFileSync } from 'node:fs'
import { initialWeekSchedule, monthlyFieldsOf, activeDaysOf } from '@/components/monthlyClients/WeeklyScheduleCard'
import type { Client } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const modal = readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8')
const card = readFileSync('src/components/monthlyClients/WeeklyScheduleCard.tsx', 'utf8')
const rules = readFileSync('rules.md', 'utf8')

// ── R-SCHED-16: an existing client saves without days; its times and cleaner stay ──
const abc = { full_name: 'Cloud Test ABC', service_days: [], scheduled_time: '10:00', end_time: '14:00', preferred_cleaner: 'Cloud Test Misbah' } as unknown as Client
const none = Object.fromEntries(Object.entries(initialWeekSchedule()).map(([d, r]) => [d, { ...r, enabled: false }]))
const f0 = monthlyFieldsOf(none, abc)
eq([f0.service_days, f0.scheduled_time, f0.end_time, f0.preferred_cleaner], [[], '10:00', '14:00', 'Cloud Test Misbah'], 'no day ticked → no crash; times and cleaner kept')
eq(/ok: mode !== 'monthly' \|\| activeDaysOf\(week\)\.length > 0 \|\| isEdit/.test(modal), true, 'a new Monthly client needs a day; an existing one saves without')
eq(/if \(active\.length === 0\) notify\.warning\(/.test(modal), true, 'a warning says no visits are added without a day')

// a week with days → the client fields
const w = initialWeekSchedule({ service_days: ['Tuesday'], day_schedules: { Tuesday: { startTime: '09:00', endTime: '12:00', cleaner: 'Cloud Test Nobel', duration: 3 } } } as unknown as Client)
const f1 = monthlyFieldsOf(w)
eq([activeDaysOf(w), f1.service_days, f1.day_cleaner_assignments, f1.preferred_cleaner, f1.duration_hours], [['Tuesday'], ['Tuesday'], { Tuesday: 'Cloud Test Nobel' }, 'Cloud Test Nobel', 3], 'a saved week comes back and is saved the same')

// ── R-SCHED-17 / 18 / 20: one popup, Save always, Mode changeable ──
eq(/activeTab/.test(modal) || /7-Day Schedule<\/span>/.test(modal), false, 'no Profile / 7-Day Schedule tabs')
eq(/form="client-modal-form"/.test(modal) && !/add-monthly-client-form/.test(modal), true, 'one form, one Save')
eq(/\{mode === 'monthly' && <WeeklyScheduleCard value=\{week\} onChange=\{setWeek\}/.test(modal) && /\{mode !== 'general' && <ContractDetailsCard/.test(modal), true, 'Monthly: weekly schedule and contract in the same popup')
eq(/disabled=\{monthlyEdit\}/.test(modal), false, 'Mode can be changed for an existing client')
eq(/mode === 'monthly' \? 'Edit Monthly Client' : mode === 'biweekly' \? 'Edit Bi-Weekly Client' : 'Edit Client Profile'/.test(modal), true, 'title follows the Mode')
eq(/if \(hadMonthlySchedule && mode !== 'monthly'\) \{\s*patch\.service_days = \[\]/.test(modal), true, 'Monthly → General / Bi-Weekly clears the weekly schedule')
eq(/findMonthlyScheduleClashes\(/.test(modal), true, 'monthly time clashes are checked before saving')
eq(/<ClientModalForm[\s\S]{0,200}prefill=\{\{ service_mode: 'monthly' \}\}/.test(readFileSync('src/pages/MonthlyClients.tsx', 'utf8')), true, 'Monthly Clients → Add opens the same popup in Monthly mode')

// ── UX-161: Weekly Schedule card ──
eq(/Apply Mon Times|Apply Mon Staff/.test(card), false, 'Apply Mon Times / Staff removed')
eq(/onClick=\{toggleSchedule\}/.test(card) && /scheduleOpen \|\| activeDays\.length === 0 \? 'overflow-x-auto' : 'hidden'/.test(card), true, 'Hide / Show; shown while no day is ticked')

eq(['R-SCHED-16', 'R-SCHED-17', 'R-SCHED-18', 'R-SCHED-20'].every(id => rules.includes(id)), true, 'rules written')
