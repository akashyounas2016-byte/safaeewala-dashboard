// UX-68 time lists, UX-69 row colours, R-PAY-05 Lump Sum / Split Mode, R-SYNC-11 row colour saved
import fs from 'node:fs'
import { MORNING_TIMES, EVENING_TIMES, timeSteps } from '@/components/common/Time12hPicker'
import { ROW_COLOR_PRESETS } from '@/components/dailyJobSheet/jobSheetUtils'
import { sanitizeOutboxPayload } from '@/lib/syncQueue'
import { cleanerShare, splitTotals, splitEntryOf } from '@/lib/chargeSplit'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// Times: Morning from 9:00, numbers only; Add Job uses 15-minute steps
eq(MORNING_TIMES.slice(0, 4), ['09:00', '09:30', '10:00', '10:30'], 'booking list: 30-minute steps from 9:00')
eq([EVENING_TIMES[0], EVENING_TIMES[EVENING_TIMES.length - 1]], ['12:00', '11:00'], 'evening list 12:00 → 11:00')
eq(timeSteps(9, 11, 15).slice(0, 5), ['09:00', '09:15', '09:30', '09:45', '10:00'], 'Add Job list: 15-minute steps')
eq(timeSteps(12, 23, 15, false).slice(-2), ['10:45', '11:00'], '15-minute evening list ends 11:00')
eq([...MORNING_TIMES, ...timeSteps(9, 11, 15)].some(t => /am|pm/i.test(t)), false, 'no AM / PM tag in the lists')

// Row colours: unique ids, and no two colours share a hue band (all clearly different)
const hueOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d === 0) return -1
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return Math.round(((h * 60) + 360) % 360)
}
eq(new Set(ROW_COLOR_PRESETS.map(p => p.id)).size, ROW_COLOR_PRESETS.length, 'colour ids are unique')
const vivid = ROW_COLOR_PRESETS.filter(p => p.id !== 'default' && p.id !== 'slate' && p.id !== 'stone').map(p => hueOf(p.circleColor)).sort((a, b) => a - b)
const minGap = Math.min(...vivid.map((h, i) => (i === 0 ? h + 360 - vivid[vivid.length - 1] : h - vivid[i - 1])))
eq(minGap >= 18, true, `colours at least 18° apart on the colour wheel (closest ${minGap}°)`)

// Split Mode: per-cleaner money; totals; equal share when not split
const split = [
  { cleaner: 'Adnan', charges: 150, received: 100, payment_mode: 'Cash' },
  { cleaner: 'Arjun Singh', charges: 150, received: 50, payment_mode: 'Online' },
]
eq(splitTotals(split), { charges: 300, received: 150, payment_mode: 'Cash' }, 'totals; mixed modes → the lead\'s mode')
const job = { staff_name: 'Adnan, Arjun Singh', charges: 300, received: 150, payment_mode: 'Cash', charge_split: split } as unknown as DailyJob
eq(splitEntryOf(job, 'arjun singh')?.received, 50, 'entry found by name, any letter case')
eq(cleanerShare(job, 'Arjun Singh'), { charges: 150, received: 50, payment_mode: 'Online' }, 'split job: own amounts')
eq(cleanerShare({ ...job, charge_split: undefined }, 'Arjun Singh'), { charges: 150, received: 75, payment_mode: 'Cash' }, 'lump sum: equal share')

// charge_split and row_color reach Supabase
const out = sanitizeOutboxPayload('daily_jobs', { id: 'j1', charge_split: split, row_color: 'teal' })
eq([out?.charge_split, out?.row_color], [split, 'teal'], 'split and colour are sent')
const sql = fs.readFileSync('supabase/migrations/2026-11-03_daily_jobs_split_and_color.sql', 'utf8')
eq(/add column if not exists charge_split jsonb/.test(sql) && /add column if not exists row_color text/.test(sql), true, 'migration adds both columns')
