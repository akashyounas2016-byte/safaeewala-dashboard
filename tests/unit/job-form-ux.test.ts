// UX-68 time lists, UX-69 row colours, R-PAY-05 received split, R-SYNC-11 row colour saved
import fs from 'node:fs'
import { MORNING_TIMES, EVENING_TIMES } from '@/components/common/Time12hPicker'
import { ROW_COLOR_PRESETS } from '@/components/dailyJobSheet/jobSheetUtils'
import { sanitizeOutboxPayload } from '@/lib/syncQueue'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// Morning starts at 9:00, 30-minute steps, numbers only (AM / PM chosen separately)
eq(MORNING_TIMES.slice(0, 4), ['09:00', '09:30', '10:00', '10:30'], 'morning list starts 9:00 in 30-minute steps')
eq(MORNING_TIMES[MORNING_TIMES.length - 1], '11:30', 'morning list ends 11:30')
eq([EVENING_TIMES[0], EVENING_TIMES[2], EVENING_TIMES[EVENING_TIMES.length - 1]], ['12:00', '01:00', '11:00'], 'evening list 12:00 → 11:00')
eq([...MORNING_TIMES, ...EVENING_TIMES].some(t => /am|pm/i.test(t)), false, 'no AM / PM tag in the lists')

// 20 more light colours, ids unique
eq(ROW_COLOR_PRESETS.length, 38, '18 + 20 row colours')
eq(new Set(ROW_COLOR_PRESETS.map(p => p.id)).size, ROW_COLOR_PRESETS.length, 'colour ids are unique')

// received_split and row_color now reach Supabase (they were stripped before)
const out = sanitizeOutboxPayload('daily_jobs', { id: 'j1', received: 150, received_split: { Adnan: 100, 'Arjun Singh': 50 }, row_color: 'mint' })
eq([out?.received_split, out?.row_color], [{ Adnan: 100, 'Arjun Singh': 50 }, 'mint'], 'split and colour are sent')
const sql = fs.readFileSync('supabase/migrations/2026-11-03_daily_jobs_split_and_color.sql', 'utf8')
eq(/add column if not exists received_split jsonb/.test(sql) && /add column if not exists row_color text/.test(sql), true, 'migration adds both columns')
