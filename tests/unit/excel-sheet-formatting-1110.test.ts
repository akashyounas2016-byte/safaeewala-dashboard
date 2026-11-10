// Tests for Excel Job Sheet formatting updates (11-10)
import { memberChargesLabel, memberReceivedLabel, getLeadShortName, TIME_SUGGESTIONS } from '@/lib/excelSheet/sheetConfig'
import { parseTimeToMinutes, formatTime12h, formatTimeOnly } from '@/components/dailyJobSheet/jobSheetUtils'
import { ensureThreeRowsPerStaff } from '@/lib/excelSheet/rows'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b))
    process.exitCode = 1
  } else {
    console.log('PASS ', m)
  }
}

// 1. memberChargesLabel displays team name directly (e.g. "Team A") instead of "Added Team A"
const sampleRow = { id: 'r1', staff_name: 'Asmita Tamang', charges: 0, received: 0 } as DailyJob
eq(memberChargesLabel(sampleRow, 'Team A'), 'Team A', 'charges label is team name directly')
eq(memberChargesLabel(sampleRow, 'Team B'), 'Team B', 'charges label is Team B directly')

// 2. getLeadShortName & memberReceivedLabel display "REF: [Cleaner's Short Name]"
const employees = [
  { full_name: 'Ambika Devi Tharu', short_name: 'Ambika' },
  { full_name: 'Asmita Tamang', short_name: 'Asmita' },
  { full_name: 'John Doe' } // no short_name, fallbacks to first word
]
eq(getLeadShortName('Ambika Devi Tharu', employees), 'Ambika', 'uses employee short_name')
eq(getLeadShortName('John Doe', employees), 'John', 'falls back to first word when short_name not set')
eq(memberReceivedLabel(sampleRow, 'Ambika Devi Tharu', employees), 'REF: Ambika', 'received label format is REF: [Short Name]')
eq(memberReceivedLabel(sampleRow, 'John Doe', employees), 'REF: John', 'received label format with fallback name')

// 3. TIME_SUGGESTIONS has 15-minute intervals
eq(TIME_SUGGESTIONS.includes('09:00 AM'), true, 'has 09:00 AM')
eq(TIME_SUGGESTIONS.includes('09:15 AM'), true, 'has 09:15 AM')
eq(TIME_SUGGESTIONS.includes('09:30 AM'), true, 'has 09:30 AM')
eq(TIME_SUGGESTIONS.includes('09:45 AM'), true, 'has 09:45 AM')
eq(TIME_SUGGESTIONS.includes('01:15 PM'), true, 'has 01:15 PM')

// 4. parseTimeToMinutes and formatTimeOnly handle diverse manual custom entries
eq(parseTimeToMinutes('9:15'), 555, 'parses 9:15')
eq(formatTimeOnly('9:15'), '09:15 AM', 'formats 9:15 to 09:15 AM')
eq(parseTimeToMinutes('9.15'), 555, 'parses 9.15 with dot')
eq(formatTimeOnly('9.15'), '09:15 AM', 'formats 9.15 to 09:15 AM')
eq(parseTimeToMinutes('9:15am'), 555, 'parses 9:15am')
eq(parseTimeToMinutes('9:15pm'), 1275, 'parses 9:15pm')
eq(formatTimeOnly('9:15pm'), '09:15 PM', 'formats 9:15pm to 09:15 PM')
eq(parseTimeToMinutes('9am'), 540, 'parses 9am')
eq(formatTimeOnly('9am'), '09:00 AM', 'formats 9am to 09:00 AM')
eq(parseTimeToMinutes('1pm'), 780, 'parses 1pm')
eq(formatTimeOnly('1pm'), '01:00 PM', 'formats 1pm to 01:00 PM')
eq(parseTimeToMinutes('0915'), 555, 'parses 0915 digits')
eq(parseTimeToMinutes('9'), 540, 'parses single digit 9')
eq(parseTimeToMinutes('1'), 780, 'parses single digit 1 as afternoon 1pm')

// 5. ensureThreeRowsPerStaff strictly limits default rows to 3 per cleaner
const day = '2026-11-10'
// Case A: 1 real job and 4 blank rows (e.g. from draft or DB)
const bloatedRows: DailyJob[] = [
  { id: 'j1', date: day, staff_name: 'Ambika', start_time: '09:00 AM', end_time: '01:00 PM', address: 'Villa 1', charges: 100, received: 100 } as DailyJob,
  { id: 'b1', date: day, staff_name: 'Ambika', start_time: '', end_time: '', address: '', charges: 0, received: 0 } as DailyJob,
  { id: 'b2', date: day, staff_name: 'Ambika', start_time: '', end_time: '', address: '', charges: 0, received: 0 } as DailyJob,
  { id: 'b3', date: day, staff_name: 'Ambika', start_time: '', end_time: '', address: '', charges: 0, received: 0 } as DailyJob,
  { id: 'b4', date: day, staff_name: 'Ambika', start_time: '', end_time: '', address: '', charges: 0, received: 0 } as DailyJob,
]
const trimmed = ensureThreeRowsPerStaff(bloatedRows, day)
eq(trimmed.length, 3, 'trimmed excess blank rows to strictly 3 rows')
eq(trimmed[0].id, 'j1', 'preserved real job')

// Case B: 0 real jobs -> strictly 3 blank rows
const emptyRows: DailyJob[] = [
  { id: 'b1', date: day, staff_name: 'Kamla', start_time: '', end_time: '', address: '', charges: 0, received: 0 } as DailyJob,
]
const paddedEmpty = ensureThreeRowsPerStaff(emptyRows, day)
eq(paddedEmpty.length, 3, 'padded to exactly 3 rows')

// Case C: 4 real jobs -> preserves all 4 real jobs
const fourJobs: DailyJob[] = [1, 2, 3, 4].map(n => ({
  id: `j${n}`, date: day, staff_name: 'Sita', start_time: `0${n + 7}:00 AM`, end_time: `0${n + 8}:00 AM`, address: `Office ${n}`, charges: 50, received: 50
} as DailyJob))
const fourResult = ensureThreeRowsPerStaff(fourJobs, day)
eq(fourResult.length, 4, 'keeps all 4 real jobs without extra padding')

