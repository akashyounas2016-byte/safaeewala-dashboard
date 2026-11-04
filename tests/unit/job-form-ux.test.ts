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

// Row colours: 40 light colours, unique ids, every pair clearly different (CIE Lab distance)
const lab = (hex: string) => {
  const f = (i: number) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const [R, G, B] = [f(1), f(3), f(5)]
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116)
  const X = t((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), Y = t(R * 0.2126 + G * 0.7152 + B * 0.0722), Z = t((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883)
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]
}
const colours = ROW_COLOR_PRESETS.filter(p => p.id !== 'default')
eq(colours.length, 40, '40 row colours')
eq(new Set(ROW_COLOR_PRESETS.map(p => p.id)).size, ROW_COLOR_PRESETS.length, 'colour ids are unique')
eq(new Set(ROW_COLOR_PRESETS.map(p => p.label)).size, ROW_COLOR_PRESETS.length, 'colour names are unique')
let minDist = Infinity
colours.forEach((p, i) => colours.slice(i + 1).forEach(q => { const [a1, b1] = [lab(p.circleColor), lab(q.circleColor)]; minDist = Math.min(minDist, Math.hypot(a1[0] - b1[0], a1[1] - b1[1], a1[2] - b1[2])) }))
eq(minDist >= 7, true, `no two colours look alike (closest Lab distance ${minDist.toFixed(1)})`)
eq(colours.every(p => lab(p.circleColor)[0] >= 82), true, 'all colours are fully light')
eq(['rose', 'orange', 'teal', 'blue', 'slate'].every(id => ROW_COLOR_PRESETS.some(p => p.id === id)), true, 'older ids still have a colour')

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
