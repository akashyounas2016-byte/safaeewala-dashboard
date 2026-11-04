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
// CIEDE2000: the colour difference that follows how people see colour (above 5 = clearly different)
const de2000 = ([L1, a1, b1]: number[], [L2, a2, b2]: number[]) => {
  const rad = Math.PI / 180, deg = 180 / Math.PI
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  const hue = (y: number, x: number) => { if (y === 0 && x === 0) return 0; const v = Math.atan2(y, x) * deg; return v < 0 ? v + 360 : v }
  const h1p = hue(b1, a1p), h2p = hue(b2, a2p), dL = L2 - L1, dC = C2p - C1p
  let dh = 0; if (C1p * C2p !== 0) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360 }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad), Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2
  let hb = h1p + h2p; if (C1p * C2p !== 0) hb = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad)
  const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T, RT = -Math.sin(2 * dTh * rad) * RC
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH))
}
let minDist = Infinity
colours.forEach((p, i) => colours.slice(i + 1).forEach(q => { minDist = Math.min(minDist, de2000(lab(p.circleColor), lab(q.circleColor))) }))
eq(minDist >= 7, true, `no two colours look alike (closest CIEDE2000 ${minDist.toFixed(1)})`)
eq(colours.every(p => lab(p.circleColor)[0] >= 80), true, 'all colours are fully light')
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
