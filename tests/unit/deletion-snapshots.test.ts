import { saveDeletionSnapshot, listSnapshots, deleteSnapshot } from '@/lib/snapshots'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m) }
eq(saveDeletionSnapshot('Day 2026-10-01', { dailyJobs: [], dailyExpenses: [] }), null, 'nothing to keep → no copy')
const s1 = saveDeletionSnapshot('Day 2026-10-02', { dailyJobs: [{ id: 'j1' } as any], dailyExpenses: [] })
eq(s1?.counts, { dailyJobs: 1, dailyExpenses: 0 }, 'counts recorded')
for (let i = 0; i < 12; i++) saveDeletionSnapshot(`Day x${i}`, { dailyJobs: [{ id: `j${i}` } as any] })
eq(listSnapshots().length, 10, 'only newest 10 kept')
eq(listSnapshots()[0].label, 'Day x11', 'newest first')
deleteSnapshot(listSnapshots()[0].id)
eq(listSnapshots().length, 9, 'copy removed')
