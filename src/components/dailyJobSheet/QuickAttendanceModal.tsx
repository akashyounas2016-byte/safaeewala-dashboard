import { useMemo, useState } from 'react'
import { ExternalLink, Search, UserCheck } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { isSheetCleaner } from '@/lib/staffRoles'
import { employeeMatchesStaff, splitStaffNames } from '@/lib/clientDataSync'
import { attendanceKeyFor, canApproveLeave, findMark, newAbsenceMark, LEAVE_CATEGORIES, type AttendanceOverride } from '@/lib/attendance'
import { formatDate } from '@/lib/utils'
import type { AttendanceMarkChange } from '@/store/useAttendanceMarks'

type Quick = 'present' | 'available' | 'absent' | 'on_leave'
const STATUS: Record<Quick, { label: string; on: string }> = {
  present:   { label: 'Present',   on: 'bg-emerald-600 text-white border-emerald-600' },
  available: { label: 'Available', on: 'bg-sky-600 text-white border-sky-600' },
  absent:    { label: 'Absent',    on: 'bg-rose-600 text-white border-rose-600' },
  on_leave:  { label: 'Leave',     on: 'bg-amber-500 text-white border-amber-500' },
}

/** What a cleaner is on the date: their own mark first; else a job that day = Present; else Available (R-ATT-01) */
export function quickStatusOf(mark: AttendanceOverride | undefined, hasJob: boolean): Quick {
  if (mark?.status === 'present' || mark?.status === 'absent' || mark?.status === 'on_leave' || mark?.status === 'available') return mark.status
  return hasJob ? 'present' : 'available'
}

/**
 * R-ATT-11: Attendance from the Excel Job Sheet without leaving it — every cleaner with Present / Available /
 * Absent / Leave in one click (saved like the Attendance screen: by employee id, live for every user; leave
 * from a non-approver waits for approval, R-ATT-05). "View details" opens the full Attendance sheet.
 */
export function QuickAttendanceModal({ open, onClose, date, onViewDetails }: { open: boolean; onClose: () => void; date: string; onViewDetails: () => void }) {
  const { employees, dailyJobs, attendanceMarks, saveAttendanceMarks } = useData()
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [leaveFor, setLeaveFor] = useState<string | null>(null)
  const approver = canApproveLeave(user?.role)
  const me = user?.full_name || user?.email || 'Unknown user'

  const rows = useMemo(() => {
    const jobs = dailyJobs.filter(j => j.date === date && ((Number(j.duty_hours) || 0) > 0 || (Number(j.charges) || 0) > 0 || String(j.start_time || '').trim()))
    return employees
      .filter(e => e.status !== 'inactive' && e.full_name && isSheetCleaner(e))
      .map(e => {
        const name = e.full_name.trim()
        const mark = findMark(attendanceMarks || {}, date, name, e.id)
        const jobCount = jobs.filter(j => splitStaffNames(j.staff_name || '').some(n => employeeMatchesStaff(e, n))).length
        return { emp: e, name, mark, jobCount, status: quickStatusOf(mark, jobCount > 0) }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, dailyJobs, attendanceMarks, date])

  const shown = rows.filter(r => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const count = (s: Quick) => rows.filter(r => r.status === s).length

  const put = (name: string, mark: AttendanceOverride | null) => {
    const { key, nameKey } = attendanceKeyFor(date, name, employees)
    const changes: AttendanceMarkChange[] = [{ key, mark, cleanerName: name }]
    if (nameKey !== key && attendanceMarks?.[nameKey]) changes.push({ key: nameKey, mark: null, cleanerName: name }) // drop an older name-keyed copy
    saveAttendanceMarks(changes)
  }
  const set = (name: string, s: Quick, category?: string) => {
    const now = new Date().toISOString()
    if (s === 'present') put(name, { status: 'present', dutyHours: 8, reason: 'Marked present on the Excel Job Sheet', updatedAt: now, requestedBy: me })
    else if (s === 'available') put(name, { status: 'available', updatedAt: now, requestedBy: me })
    else if (s === 'absent') put(name, newAbsenceMark('Uninformed Absence', '', user?.role, me, now))
    else put(name, newAbsenceMark((category || 'Sick Leave') as (typeof LEAVE_CATEGORIES)[number], '', user?.role, me, now))
    setLeaveFor(null)
  }
  const locked = (m?: AttendanceOverride) => !approver && !!m && (m.approval === 'approved' || m.approval === 'rejected')

  return (
    <Modal open={open} onClose={onClose} title={`Attendance · ${formatDate(date)}`} size="lg"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <p className="text-[11.5px] text-slate-500 hidden sm:block">Saved at once for every user. Only marked absences count as absent.</p>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-[#E2E5E0] text-[13px] font-semibold cursor-pointer">Close</button>
            <button type="button" onClick={onViewDetails} className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-[13px] font-bold inline-flex items-center gap-1.5 hover:bg-emerald-800 cursor-pointer">
              View details <ExternalLink size={13} />
            </button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(STATUS) as Quick[]).map(s => (
            <div key={s} className="rounded-xl border border-slate-200 px-3 py-2 text-center">
              <p className="text-[18px] font-black text-slate-800">{count(s)}</p>
              <p className="text-[11px] text-slate-500">{STATUS[s].label}</p>
            </div>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search cleaner…" className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        </div>
        <ul className="divide-y divide-slate-100 max-h-[52vh] overflow-y-auto rounded-xl border border-slate-200">
          {shown.length === 0 && <li className="py-8 text-center text-[12.5px] text-slate-400">No cleaners</li>}
          {shown.map(r => {
            const isLocked = locked(r.mark)
            return (
              <li key={r.emp.id} className="px-3 py-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><UserCheck size={14} /></span>
                  <span className="flex-1 min-w-[140px]">
                    <span className="block text-[13px] font-bold text-slate-800">{r.emp.short_name?.trim() ? `${r.emp.short_name.trim()} · ${r.name}` : r.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {r.jobCount ? `${r.jobCount} job${r.jobCount === 1 ? '' : 's'} today` : 'No job'}
                      {r.mark?.category ? ` · ${r.mark.category}` : ''}
                      {r.mark?.approval === 'pending' ? ' · waiting for approval' : ''}
                    </span>
                  </span>
                  <span className="flex gap-1" role="group" aria-label={`Attendance of ${r.name}`}>
                    {(Object.keys(STATUS) as Quick[]).map(s => (
                      <button key={s} type="button" disabled={isLocked}
                        onClick={() => (s === 'on_leave' ? setLeaveFor(leaveFor === r.name ? null : r.name) : set(r.name, s))}
                        title={isLocked ? 'Leave already decided by admin / manager' : undefined}
                        className={`h-7 px-2.5 rounded-lg border text-[11.5px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${r.status === s ? STATUS[s].on : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                        {STATUS[s].label}
                      </button>
                    ))}
                  </span>
                </div>
                {leaveFor === r.name && (
                  <div className="mt-2 ml-11 flex flex-wrap gap-1.5">
                    {LEAVE_CATEGORIES.map(c => (
                      <button key={c} type="button" onClick={() => set(r.name, 'on_leave', c)} className="h-7 px-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-[11.5px] font-bold hover:bg-amber-100 cursor-pointer">{c}</button>
                    ))}
                    {!approver && <span className="text-[11px] text-slate-500 self-center">Goes to admin / manager for approval</span>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
