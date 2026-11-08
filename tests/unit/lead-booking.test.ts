// R-LEAD-02: "Booking" on a website lead opens the Add Job form, filled from the lead, amount empty
import { readFileSync } from 'node:fs'
import { leadDateIso, leadTime, leadToJob } from '@/lib/leadBooking'
import { prefillJob } from '@/components/bookings/NewBookingModal'
import { quickReplyText } from '@/components/whatsapp/TemplateBuilder'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
eq([leadDateIso('30-Oct-26'), leadDateIso('2026-10-30'), leadDateIso('30/10/2026'), leadDateIso('soon')], ['2026-10-30', '2026-10-30', '2026-10-30', ''], 'preferred date read in the usual formats')
eq([leadTime(''), leadTime('2 pm'), leadTime('14:30'), leadTime('10:00 AM')], ['09:00 AM', '02:00 PM', '02:30 PM', '10:00 AM'], 'no time → 09:00 AM')

const lead = { id: 'lead-1', entry_id: 1512, client_name: 'TEST Rinu', phone: '503285219', address: 'Al mamzar Dubai', area: 'Al mamzar Dubai', preferred_date: '30-Oct-26', preferred_time: '', service: 'Move-In / Move-Out Cleaning', property_type: 'Flat', message: '' }
const { initial, hint } = leadToJob(lead, [])
eq([initial.date, initial.start_time, initial.end_time, initial.address, initial.area], ['2026-10-30', '09:00 AM', '01:00 PM', 'Al mamzar Dubai', 'Al mamzar Dubai'], 'date = preferred date, default time, location and area filled')
eq('charges' in initial || 'received' in initial, false, 'no amount — the Booking Amount stays empty')
eq(hint, { name: 'TEST Rinu', phone: '503285219' }, 'name and number go to the new-client popup')
eq(/TEST Rinu 503285219/.test(String(initial.remarks)) && /Flat/.test(String(initial.remarks)), true, 'remarks keep who asked and what for')
const known = leadToJob(lead, [{ id: 'c1', full_name: 'Rinu', phone: '+971 50 328 5219', building_name: 'Al Khair Building', area: 'Al Mamzar' }])
eq([known.initial.address, known.initial.area], ['Al Khair Building', 'Al Mamzar'], 'a known client (same number) brings their building')
eq(prefillJob({ name: 'x', job: { date: '2026-10-30', address: 'A' } }, []).date, '2026-10-30', 'the booking popup takes the lead job')

const page = readFileSync('src/pages/FluentFormsLeads.tsx', 'utf8')
eq(/<Plus size=\{12\} \/> Booking/.test(page) && !/<Plus size=\{12\} \/> Confirmation/.test(page), true, 'the table button says Booking (was Confirmation)')
eq(/<NewBookingModal/.test(page) && !/defaultValue=\{convertingLead\.estimated_value \|\| 500\}/.test(page), true, 'the Add Job popup replaces the old form with 500 AED')
eq(/initialPhone=\{clientHint\?\.phone/.test(readFileSync('src/components/dailyJobSheet/AddJobModal.tsx', 'utf8')), true, 'new client popup gets the number')

// R-WA-06
eq(quickReplyText({ header: { kind: 'text', text: 'hi' }, body: 'Price *20 AED*', footer: 'Safaeewala' } as never), 'hi\n\nPrice *20 AED*\n\nSafaeewala', 'quick reply text = header + body + footer')
