// R-OT-01 — Two-scenario Overtime (OT) Policy & Multi-Shift Cumulative Calculation
import {
  calcOTHours,
  recalculateAllRowsOT,
  calcDailyCleanerShiftsOT,
} from '@/components/dailyJobSheet/jobSheetUtils'

const eq = (a: unknown, b: unknown, m: string) => {
  if (a !== b) {
    console.log('FAIL', m, a, b)
    process.exitCode = 1
  } else {
    console.log('PASS ', m)
  }
}

const day = '2026-10-19'

// ── Test 1: Image 1 Screenshot (Parmila) ──
// Row 1: 01:00 PM - 07:30 PM (6.5h)
// Row 2: 09:00 AM - 12:00 PM (3.0h)
// Row 3: 08:30 PM - 10:30 PM (2.0h)
// Expected: 09:00 AM shift uses 3h basic (0 OT); 01:00 PM shift uses 5h basic + 1.5h excess (1.5h OT); 08:30 PM is post-8pm (2.0h OT)
// Total OT = 3.5h
const parmilaShifts = [
  { id: 'p1', date: day, staff_name: 'Parmila', start_time: '01:00 PM', end_time: '07:30 PM' },
  { id: 'p2', date: day, staff_name: 'Parmila', start_time: '09:00 AM', end_time: '12:00 PM' },
  { id: 'p3', date: day, staff_name: 'Parmila', start_time: '08:30 PM', end_time: '10:30 PM' },
]

const parmilaRecalc = recalculateAllRowsOT(parmilaShifts)
eq(parmilaRecalc[0].ot_hours, 1.5, 'Parmila row 1 (01:00 PM - 07:30 PM) gets 1.5h excess pre-8 PM OT')
eq(parmilaRecalc[1].ot_hours, 0.0, 'Parmila row 2 (09:00 AM - 12:00 PM) gets 0.0h OT (within first 8h basic)')
eq(parmilaRecalc[2].ot_hours, 2.0, 'Parmila row 3 (08:30 PM - 10:30 PM) gets 2.0h post-8 PM OT')

const parmilaTotalOT = parmilaRecalc.reduce((s, r) => s + (r.ot_hours || 0), 0)
eq(parmilaTotalOT, 3.5, 'Parmila total OT across 3 shifts is 3.5h (fixes 2.0h undercounting)')

// ── Test 2: Image 2 Screenshot (Sabirti) ──
// Row 1: 09:00 AM - 12:00 PM (3.0h)
// Row 2: 02:30 PM - 10:30 PM (8.0h)
// Expected: 09:00 AM shift uses 3h basic (0 OT, clears previous 1.00 error);
// 02:30 PM - 10:30 PM has 5.5h pre-8pm (5h basic + 0.5h excess pre-8pm) + 2.5h post-8pm = 3.0h OT.
// Total OT = 3.0h
const sabirtiShifts = [
  { id: 's1', date: day, staff_name: 'Sabirti', start_time: '09:00 AM', end_time: '12:00 PM' },
  { id: 's2', date: day, staff_name: 'Sabirti', start_time: '02:30 PM', end_time: '10:30 PM' },
]

const sabirtiRecalc = recalculateAllRowsOT(sabirtiShifts)
eq(sabirtiRecalc[0].ot_hours, 0.0, 'Sabirti row 1 (09:00 AM - 12:00 PM) gets 0.0h OT (clears erroneous 1.00)')
eq(sabirtiRecalc[1].ot_hours, 3.0, 'Sabirti row 2 (02:30 PM - 10:30 PM) gets 3.0h OT (0.5h excess pre-8 PM + 2.5h post-8 PM)')

const sabirtiTotalOT = sabirtiRecalc.reduce((s, r) => s + (r.ot_hours || 0), 0)
eq(sabirtiTotalOT, 3.0, 'Sabirti total OT across shifts is 3.0h (fixes 1.0h undercounting)')

// ── Test 3: Standalone calcOTHours ──
eq(calcOTHours('09:00 AM', '05:00 PM'), 0.0, '8h standard day shift yields 0 OT')
eq(calcOTHours('08:00 AM', '06:00 PM'), 2.0, '10h shift before 8 PM yields 2.0h OT (Scenario 2)')
eq(calcOTHours('06:00 PM', '10:00 PM'), 2.0, '4h shift crossing 8 PM yields 2.0h OT for 20:00-22:00 (Scenario 1)')
eq(calcOTHours('10:00 AM', '10:00 PM'), 4.0, '12h shift yields 2h pre-8 PM excess + 2h post-8 PM = 4.0h OT')
eq(calcOTHours('09:00 PM', '02:00 AM'), 5.0, 'Midnight crossing shift yields continuous 5.0h OT')

// ── Test 4: calcDailyCleanerShiftsOT Map ──
const otMap = calcDailyCleanerShiftsOT([...parmilaShifts, ...sabirtiShifts])
eq(otMap.get('p1'), 1.5, 'OT map returns exact OT for Parmila shift 1')
eq(otMap.get('p2'), 0.0, 'OT map returns exact OT for Parmila shift 2')
eq(otMap.get('p3'), 2.0, 'OT map returns exact OT for Parmila shift 3')
eq(otMap.get('s1'), 0.0, 'OT map returns exact OT for Sabirti shift 1')
eq(otMap.get('s2'), 3.0, 'OT map returns exact OT for Sabirti shift 2')

// ── Test 5: Explicit is_overtime flag ──
const explicitOtShifts = [
  { id: 'e1', date: day, staff_name: 'Fatima', start_time: '09:00 AM', end_time: '01:00 PM', is_overtime: true },
  { id: 'e2', date: day, staff_name: 'Fatima', start_time: '02:00 PM', end_time: '10:00 PM' },
]
const explicitRecalc = recalculateAllRowsOT(explicitOtShifts)
eq(explicitRecalc[0].ot_hours, 4.0, 'Explicit is_overtime gives full 4.0h OT and preserves basic quota')
eq(explicitRecalc[1].ot_hours, 2.0, 'Second shift takes 6h basic (02:00 PM - 08:00 PM <= 8h) + 2h post-8 PM OT')

// ── Test 6: Screenshot 2026-10-19 — what the wrong flag did ──
// Sabirti's 09:00 AM row was saved with is_overtime=true, so its whole 3h showed as OT (2.5h + 3h = 5.5h)
const sabirtiFlagged = recalculateAllRowsOT([
  { id: 'f1', date: day, staff_name: 'Sabirti', start_time: '09:00 AM', end_time: '12:00 PM', is_overtime: true },
  { id: 'f2', date: day, staff_name: 'Sabirti', start_time: '02:30 PM', end_time: '10:30 PM' },
])
eq(sabirtiFlagged[0].ot_hours, 3.0, 'flagged shift reproduces the screenshot (3h)')
eq(sabirtiFlagged[1].ot_hours, 2.5, 'flagged shift takes no quota, reproduces the screenshot (2.5h)')

// ── Test 7: Overlapping shifts of one cleaner count once ──
const ambika = recalculateAllRowsOT([
  { id: 'a1', date: day, staff_name: 'Ambika', start_time: '09:00 AM', end_time: '12:00 PM' },
  { id: 'a2', date: day, staff_name: 'Ambika', start_time: '09:00 AM', end_time: '12:00 PM' },
  { id: 'a3', date: day, staff_name: 'Ambika', start_time: '03:00 PM', end_time: '05:00 PM' },
  { id: 'a4', date: day, staff_name: 'Ambika', start_time: '05:30 PM', end_time: '07:00 PM' },
])
eq(ambika.reduce((s, r) => s + (r.ot_hours || 0), 0), 0, 'Ambika: 6.5h real duty, no OT (was 1.5h from counting 09:00-12:00 twice)')
eq(ambika[1].duty_hours, 3, 'overlapping row still shows its own duty')
const lateOverlap = recalculateAllRowsOT([
  { id: 'l1', date: day, staff_name: 'Laxmi', start_time: '06:00 PM', end_time: '10:00 PM' },
  { id: 'l2', date: day, staff_name: 'Laxmi', start_time: '09:00 PM', end_time: '11:00 PM' },
])
eq(lateOverlap.reduce((s, r) => s + (r.ot_hours || 0), 0), 3, 'after 8 PM overlap counts once: 20:00-23:00 = 3h')
