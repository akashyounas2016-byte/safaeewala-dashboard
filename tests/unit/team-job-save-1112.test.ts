// 2026-11-12: a new 2-cleaner job added on the Excel sheet saves without "Not saved — 1 row(s) changed on another screen" (R-SYNC-18)
import { readFileSync } from 'node:fs'
import { teamJobsDeletedElsewhere } from '@/lib/excelSheet/rows'
import { expandTeamJob } from '@/lib/excelTeams'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// Add Job → Ishwor + Kamala → one row each, folded back into one job on Save
const newJob = { id: 'new-1762950000000-ab12c', date: '2026-11-12', staff_name: 'Ishwor, Kamala', start_time: '09:00 AM', end_time: '01:00 PM', address: 'TEST apt# 5 Greece cluster', area: 'Intl City', charges: 100, received: 0, payment_mode: 'Cash' } as unknown as DailyJob
const rows = expandTeamJob(newJob, 'Team C')
eq(rows.map(r => [r.staff_name, (r as { _originalJobId?: string })._originalJobId]), [['Ishwor', newJob.id], ['Kamala', newJob.id]], 'a new team job is one grid row per cleaner')

const loaded = new Map<string, DailyJob>()              // nothing about it was loaded from the database
const live = new Map<string, DailyJob>()                // and it is not in the database yet
eq(teamJobsDeletedElsewhere([newJob.id], loaded, live, () => true), [], 'a team job just added is not "changed on another screen" — it saves')

const saved = { ...newJob, id: 'job-1' }
loaded.set('job-1', saved)
eq(teamJobsDeletedElsewhere(['job-1'], loaded, live, () => true), ['job-1'], 'a saved team job deleted on another screen still asks before saving over it')
live.set('job-1', saved)
eq(teamJobsDeletedElsewhere(['job-1'], loaded, live, () => true), [], 'a saved team job still there is no conflict')
loaded.set('job-2', saved)
eq(teamJobsDeletedElsewhere(['job-2'], loaded, live, () => false), [], 'every row of it emptied here — a deletion, no conflict (R-SYNC-17)')

const page = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/teamJobsDeletedElsewhere\(splitJobIds, loadedRawRef\.current, live,/.test(page), true, 'the Excel sheet save uses this check')
