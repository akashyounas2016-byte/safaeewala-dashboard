// 2026-11-11 (round 4): Contract widget in the client popup (R-CLI-05); no 6-digit years in date boxes (UX-143)
import { readFileSync } from 'node:fs'
import { CONTRACTS_KEY, contractOfClient, emptyContractDetails, renewalDateOf, saveClientContract } from '@/lib/clientContracts'
import { isMonthlyContractStopped } from '@/lib/clientDataSync'
import { isSaneDate, limitDateYear } from '@/lib/dateInputs'
import type { RecurringContract } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const list = () => JSON.parse(localStorage.getItem(CONTRACTS_KEY) || '[]') as RecurringContract[]

// ── R-CLI-05: contract saved from the client popup ──
localStorage.removeItem(CONTRACTS_KEY)
eq(saveClientContract({ clientName: 'TEST Contract Client', details: emptyContractDetails(), active: true }), null, 'an empty Contract card creates no contract')
const details = { serviceType: 'Regular Cleaning', amount: 1800, frequency: 'monthly' as const, startDate: '2026-11-15', notes: '4 visits a week' }
saveClientContract({ clientName: 'TEST Contract Client', details, active: true, phone: '0501234567' })
const c1 = contractOfClient('TEST Contract Client')
eq([list().length, c1?.amount, c1?.renewalDate, c1?.status, c1?.clientPhone], [1, 1800, '2027-11-15', 'active', '0501234567'], 'filled in → one contract in Monthly Clients → Contracts, renews after a year')
saveClientContract({ clientName: 'TEST Contract Client B', previousName: 'TEST Contract Client', details: { ...details, amount: 2000 }, active: false })
const c2 = contractOfClient('TEST Contract Client B')
eq([list().length, c2?.id === c1?.id, c2?.amount, c2?.status], [1, true, 2000, 'paused'], 'edit / rename updates the same contract; Contract Status Off → paused')
eq(isMonthlyContractStopped({ full_name: 'TEST Contract Client B' }, list()), true, 'a paused contract stops the monthly visits (R-SCHED-05)')
eq(renewalDateOf('2026-02-28'), '2027-02-28', 'renewal date')
const form = readFileSync('src/components/monthlyClients/AddMonthlyClientModalForm.tsx', 'utf8')
const general = readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8')
eq([/<ContractDetailsCard/.test(form), /saveClientContract\(/.test(form), /<ContractDetailsCard/.test(general), /patch\.service_mode !== 'general'/.test(general)], [true, true, true, true], 'the card is on the Monthly and Bi-Weekly client popup; a General client has no contract')

// ── UX-143: 4-digit years ──
class FakeInput { type = 'text'; max = '' }
;(globalThis as unknown as { HTMLInputElement: unknown }).HTMLInputElement = FakeInput // no DOM in the test runner
const box = Object.assign(new FakeInput(), { type: 'date' })
limitDateYear(box as unknown as EventTarget)
const dob = Object.assign(new FakeInput(), { type: 'date', max: '2026-11-11' })
limitDateYear(dob as unknown as EventTarget)
eq([box.max, dob.max], ['9999-12-31', '2026-11-11'], 'a date box without max gets year 9999 as the limit; its own max is kept')
eq([isSaneDate('2027-03-01'), isSaneDate('123123-11-01'), isSaneDate('0227-01-01'), isSaneDate(''), isSaneDate(undefined)], [true, false, false, true, true], '6-digit and typo years are caught')
eq(/installDateYearLimit\(\)/.test(readFileSync('src/main.tsx', 'utf8')), true, 'installed once for the whole app')
eq(/DATE_FIELDS\.find\(\(\[k\]\) => !isSaneDate/.test(readFileSync('src/components/employees/EmployeeFormModal.tsx', 'utf8')), true, 'Add Employee stops a wrong year before saving')
