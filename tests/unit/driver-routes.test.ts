import { buildRouteSites, driverSheetRows, SHEET_COLUMNS, driverSheetText, googleMapsRouteUrl, sheetSignature, whatsappUrl, activeDrivers } from '@/lib/driverRoutes'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m) }
const job = (o: any) => ({ id: o.id, date: '2026-10-31', staff_name: 'TEST Rupa', start_time: '09:00', end_time: '13:00', address: 'TEST Villa 12', area: 'JLT', charges: 200, received: 0, payment_mode: 'Cash', duty_hours: 4, ot_hours: 2, is_overtime: true, material: 'Yes', service: 'Deep', remarks: '', created_at: '', ...o })
const jobs: any[] = [
  job({ id: 'a' }),
  job({ id: 'b', staff_name: 'TEST Sita, TEST Gita', start_time: '08:00', end_time: '14:00', payment_mode: 'Monthly', charges: 0 }),
  job({ id: 'c', staff_name: 'TEST Uma', address: 'TEST Office 5', area: 'Marina', start_time: '07:30', end_time: '11:00', payment_mode: 'Online' }),
  job({ id: 'd', date: '2026-10-30', address: 'Other day' }),
]
const sites = buildRouteSites(jobs, '2026-10-31')
eq(sites.length, 2, 'two sites on the date (same villa grouped)')
eq(sites[0].name, 'TEST Office 5', 'earliest drop first')
eq(sites[1].cleaners, ['TEST Rupa', 'TEST Sita', 'TEST Gita'], 'cleaners of one site clubbed, shared rows split')
eq([sites[1].dropTime, sites[1].pickupTime], ['08:00 AM', '02:00 PM'], 'drop = earliest start, pick-up = latest end')
eq(sites[0].color.hex !== sites[1].color.hex, true, 'each site has its own colour')
eq(sites[1].payment, 'Cash AED 200, Monthly', 'payment shows cash to collect')
const cols = SHEET_COLUMNS.join(' ').toLowerCase()
eq(cols.includes('ot') || cols.includes('material'), false, 'sheet has no OT / Material column')
const text = driverSheetText('TEST Driver', '31 Oct 2026', sites).toLowerCase()
eq(text.includes(' ot') || text.includes('material') || text.includes('overtime'), false, 'WhatsApp text has no OT / Material')
eq(driverSheetRows(sites)[0].length, SHEET_COLUMNS.length, 'rows match columns')
const url = googleMapsRouteUrl(sites)
eq(url.includes('destination=TEST%20Villa%2012') && url.includes('waypoints=TEST%20Office%205'), true, 'route goes through stops in order')
eq(whatsappUrl('050 123 4567', 'hi'), 'https://wa.me/971501234567?text=hi', 'whatsapp link uses UAE number')
const changed = buildRouteSites([...jobs, job({ id: 'e', staff_name: 'TEST New' })], '2026-10-31')
eq(sheetSignature(sites) !== sheetSignature(changed), true, 'job sheet change is detected after sending')
eq(activeDrivers([{ id: '1', full_name: 'B', role: 'driver', status: 'active' }, { id: '2', full_name: 'A', role: 'cleaner', status: 'active' }, { id: '3', full_name: 'C', role: 'driver', status: 'inactive' }] as any).map(d => d.id), ['1'], 'only active drivers')
import { minutesOf } from '@/lib/driverRoutes'
eq([minutesOf('02:00 PM'), minutesOf('11:30 AM'), minutesOf('12:15 AM'), minutesOf('14:05')], [840, 690, 15, 845], 'AM/PM read as real times')
const pm = buildRouteSites([job({ id: 'x', start_time: '11:00', end_time: '14:00' }), job({ id: 'y', start_time: '13:00', end_time: '16:30' })], '2026-10-31')
eq([pm[0].dropTime, pm[0].pickupTime], ['11:00 AM', '04:30 PM'], 'PM pick-up is later than AM')
