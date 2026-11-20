import { useMemo, useState } from 'react'
import { ExternalLink, Search, Save, UserCheck, UserMinus, UserX, CalendarOff, Users, RotateCcw } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { isSheetCleaner, isEmployedOn } from '@/lib/staffRoles'
import { employeeMatchesStaff, splitStaffNames } from '@/lib/clientDataSync'
import { attendanceKeyFor, canApproveLeave, findMark, newAbsenceMark, LEAVE_CATEGORIES, type AttendanceOverride } from '@/lib/attendance'
import { confirmAsync } from '@/lib/notify'
import { formatDate } from '@/lib/utils'
import type { AttendanceMarkChange } from '@/store/useAttendanceMarks'
import type { DailyJob } from '@/types'

type Quick = 'present' | 'available' | 'absent' | 'on_leave'
const STATUS: Record<Quick, { label: string; on: string; card: string; icon: typeof UserCheck; hint: string }> = {
  present:   { label: 'Present',   on: 'bg-emerald-600 text-white border-emerald-600', card: 'from-emerald-50 to-white border-emerald-200 text-emerald-700', icon: UserCheck,   hint: 'Has a job on the sheet' },
  available: { label: 'Available', on: 'bg-sky-600 text-white border-sky-600',         card: 'from-sky-50 to-white border-sky-200 text-sky-700',             icon: UserMinus,   hint: 'No job — not absent' },
  absent:    { label: 'Absent',    on: 'bg-rose-600 text-white border-rose-600',       card: 'from-rose-50 to-white border-rose-200 text-rose-700',          icon: UserX,       hint: 'Marked absent' },
  on_leave:  { label: 'Leave',     on: 'bg-amber-500 text-white border-amber-500',     card: 'from-amber-50 to-white border-amber-200 text-amber-700',       icon: CalendarOff, hint: 'Marked on leave' },
}

/**
 * UX-157 (R-ATT-01): what a cleaner is on the date. Only a marked Absent / Leave counts as away; otherwise the
 * Excel sheet decides — a job that day = Present, no job = Available.
 */
export function quickStatusOf(mark: AttendanceOverride | undefined, hasJob: boolean): Quick {
  if (mark?.status === 'absent' || mark?.status === 'on_leave') return mark.status
  return hasJob ? 'present' : 'available'
}

/** A real job row (not an empty grid row) */
const isWorkRow = (j: Pick<DailyJob, 'duty_hours' | 'charges' | 'start_time'>) =>
  (Number(j.duty_hours) || 0) > 0 || (Number(j.charges) || 0) > 0 || Boolean(String(j.start_time || '').trim())

/** A change waiting for Save: back to the sheet's own status, absent, or leave of a category */
type Pending = { kind: 'auto' } | { kind: 'absent' } | { kind: 'leave'; category: string }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

/**
 * R-ATT-11 / UX-157: Attendance from the Excel Job Sheet without leaving it. Present / Available follow the sheet
 * (also rows not saved yet, `sheetJobs`); Absent and Leave are marked here. Nothing is saved until Save —
 * then once for every user (by employee id; leave from a non-approver waits for approval, R-ATT-05).
 */
export function QuickAttendanceModal({ open, onClose, date, onViewDetails, sheetJobs }: {
  open: boolean; onClose: () => void; date: string; onViewDetails: () => void
  /** Rows of the Excel sheet for this date (unsaved ones included); saved jobs are used when not given */
  sheetJobs?: DailyJob[]
}) {
  const { employees, dailyJobs, attendanceMarks, saveAttendanceMarks } = useData()
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [leaveFor, setLeaveFor] = useState<string | null>(null)
  const [pending, setPending] = useState<Map<string, Pending>>(new Map())
  const approver = canApproveLeave(user?.role)
  const me = user?.full_name || user?.email || 'Unknown user'

  const rows = useMemo(() => {
    const jobs = (sheetJobs ?? dailyJobs).filter(j => j.date === date && isWorkRow(j))
    return employees
      .filter(e => e.status !== 'inactive' && e.full_name && isSheetCleaner(e) && isEmployedOn(e, date)) // R-EMP-16
      .map(e => {
        const name = e.full_name.trim()
        const mark = findMark(attendanceMarks || {}, date, name, e.id)
        const short = (e.short_name || '').trim().toLowerCase()
        // the sheet may show the Short Name (R-SHEET-02)
        const jobCount = jobs.filter(j => splitStaffNames(j.staff_name || '').some(n => employeeMatchesStaff(e, n) || (!!short && n.trim().toLowerCase() === short))).length
        return { emp: e, name, mark, jobCount, saved: quickStatusOf(mark, jobCount > 0) }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, dailyJobs, sheetJobs, attendanceMarks, date])
  // R-ATT-09: office staff (CSR …) are not on the sheet, so not in this list — their leave / absence is still named here
  const awayOffSheet = useMemo(() => employees
    .filter(e => e.status !== 'inactive' && e.full_name && !isSheetCleaner(e))
    .map(e => ({ name: e.full_name.trim(), mark: findMark(attendanceMarks || {}, date, e.full_name.trim(), e.id) }))
    .filter(x => x.mark?.status === 'absent' || x.mark?.status === 'on_leave'), [employees, attendanceMarks, date])

  const statusOf = (r: (typeof rows)[number]): Quick => {
    const p = pending.get(r.name)
    if (!p) return r.saved
    if (p.kind === 'absent') return 'absent'
    if (p.kind === 'leave') return 'on_leave'
    return r.jobCount > 0 ? 'present' : 'available'
  }
  const shown = rows.filter(r => !q.trim() || `${r.name} ${r.emp.short_name || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  const count = (s: Quick) => rows.filter(r => statusOf(r) === s).length
  const locked = (m?: AttendanceOverride) => !approver && !!m && (m.approval === 'approved' || m.approval === 'rejected')

  const stage = (r: (typeof rows)[number], p: Pending) => {
    setPending(prev => {
      const next = new Map(prev)
      const wasAway = r.mark?.status === 'absent' || r.mark?.status === 'on_leave'
      // Choosing what is already saved is no change
      const same = (p.kind === 'auto' && !wasAway) || (p.kind === 'absent' && r.mark?.status === 'absent') ||
        (p.kind === 'leave' && r.mark?.status === 'on_leave' && r.mark?.category === p.category)
      if (same) next.delete(r.name); else next.set(r.name, p)
      return next
    })
    setLeaveFor(null)
  }

  const save = () => {
    const now = new Date().toISOString()
    const changes: AttendanceMarkChange[] = []
    pending.forEach((p, name) => {
      const { key, nameKey } = attendanceKeyFor(date, name, employees)
      const mark: AttendanceOverride | null =
        p.kind === 'auto' ? null // the sheet decides again (Present / Available)
          : p.kind === 'absent' ? newAbsenceMark('Uninformed Absence', '', user?.role, me, now)
            : newAbsenceMark(p.category as (typeof LEAVE_CATEGORIES)[number], '', user?.role, me, now)
      changes.push({ key, mark, cleanerName: name })
      if (nameKey !== key && attendanceMarks?.[nameKey]) changes.push({ key: nameKey, mark: null, cleanerName: name }) // drop an older name-keyed copy
    })
    if (changes.length) saveAttendanceMarks(changes)
    setPending(new Map())
    onClose()
  }
  const close = async () => {
    if (pending.size && !(await confirmAsync({ title: 'Close without saving?', message: `${pending.size} attendance change${pending.size === 1 ? '' : 's'} will be lost.`, confirmLabel: 'Close without saving', tone: 'danger' }))) return
    setPending(new Map())
    onClose()
  }

  return (
    <Modal open={open} onClose={() => { void close() }} title={`Attendance · ${formatDate(date)}`} size="2xl"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="hidden md:block">
            <p className="text-[11.5px] text-slate-500">Present / Available follow the Excel sheet. Only a marked Absent or Leave counts as away.</p>
            {awayOffSheet.length > 0 && <p className="text-[11.5px] text-amber-800 mt-0.5">Also away today (office staff, not on the sheet): {awayOffSheet.map(x => `${x.name} · ${x.mark?.category || (x.mark?.status === 'on_leave' ? 'Leave' : 'Absent')}`).join(', ')}</p>}
          </div>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={onViewDetails} className="px-3.5 py-2 rounded-xl border border-[#E2E5E0] text-slate-700 text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer">
              View details <ExternalLink size={13} />
            </button>
            <button type="button" onClick={() => { void close() }} className="px-4 py-2 rounded-xl border border-[#E2E5E0] text-[13px] font-semibold hover:bg-slate-50 cursor-pointer">Close</button>
            <button type="button" onClick={save} disabled={pending.size === 0}
              className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-[13px] font-bold inline-flex items-center gap-1.5 hover:bg-emerald-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <Save size={14} /> Save{pending.size ? ` (${pending.size})` : ''}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-3.5 py-3">
            <div className="flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Cleaners</p><Users size={15} className="text-slate-400" /></div>
            <p className="text-[24px] font-black text-slate-800 leading-tight mt-1">{rows.length}</p>
            <p className="text-[10.5px] text-slate-400">on the sheet</p>
          </div>
          {(Object.keys(STATUS) as Quick[]).map(s => {
            const Icon = STATUS[s].icon
            const n = count(s)
            return (
              <div key={s} className={`rounded-2xl border bg-gradient-to-br px-3.5 py-3 ${STATUS[s].card}`}>
                <div className="flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-wide">{STATUS[s].label}</p><Icon size={15} /></div>
                <p className="text-[24px] font-black text-slate-800 leading-tight mt-1">{n}</p>
                <p className="text-[10.5px] text-slate-500">{rows.length ? `${Math.round((n / rows.length) * 100)}% · ` : ''}{STATUS[s].hint}</p>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search cleaner…" className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          {pending.size > 0 && (
            <span className="text-[11.5px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">{pending.size} not saved</span>
          )}
        </div>

        <ul className="divide-y divide-slate-100 max-h-[54vh] overflow-y-auto rounded-2xl border border-slate-200">
          {shown.length === 0 && <li className="py-8 text-center text-[12.5px] text-slate-400">No cleaners</li>}
          {shown.map(r => {
            const isLocked = locked(r.mark)
            const st = statusOf(r)
            const changed = pending.has(r.name)
            const auto: Quick = r.jobCount > 0 ? 'present' : 'available'
            return (
              <li key={r.emp.id} className={`px-3.5 py-2.5 ${changed ? 'bg-amber-50/40' : ''}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  {r.emp.photo_url
                    ? <img src={r.emp.photo_url} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0" />
                    : <span className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0 text-[12px] font-black">{initials(r.emp.short_name || r.name)}</span>}
                  <span className="flex-1 min-w-[160px]">
                    <span className="block text-[13px] font-bold text-slate-800">{r.emp.short_name?.trim() ? `${r.emp.short_name.trim()} · ${r.name}` : r.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {r.jobCount ? `${r.jobCount} job${r.jobCount === 1 ? '' : 's'} on the sheet` : 'No job on the sheet'}
                      {st === 'on_leave' && (pending.get(r.name) as { category?: string } | undefined)?.category ? ` · ${(pending.get(r.name) as { category: string }).category}` : (!changed && r.mark?.category ? ` · ${r.mark.category}` : '')}
                      {!changed && r.mark?.approval === 'pending' ? ' · waiting for approval' : ''}
                      {changed ? ' · not saved yet' : ''}
                    </span>
                  </span>
                  <span className="flex gap-1" role="group" aria-label={`Attendance of ${r.name}`}>
                    {(Object.keys(STATUS) as Quick[]).map(s => {
                      // Present / Available come from the sheet: only the one that fits can be chosen (it removes an absence)
                      const isAutoBtn = s === 'present' || s === 'available'
                      const off = isLocked || (isAutoBtn && s !== auto)
                      return (
                        <button key={s} type="button" disabled={off}
                          onClick={() => (s === 'on_leave' ? setLeaveFor(leaveFor === r.name ? null : r.name) : stage(r, s === 'absent' ? { kind: 'absent' } : { kind: 'auto' }))}
                          title={isLocked ? 'Leave already decided by admin / manager' : isAutoBtn ? (s === auto ? 'From the Excel sheet' : (s === 'present' ? 'Present needs a job on the sheet' : 'Has a job on the sheet')) : undefined}
                          className={`h-8 px-3 rounded-lg border text-[11.5px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${st === s ? STATUS[s].on : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                          {STATUS[s].label}
                        </button>
                      )
                    })}
                    {changed && (
                      <button type="button" title="Undo this change" onClick={() => setPending(prev => { const n = new Map(prev); n.delete(r.name); return n })}
                        className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 inline-flex items-center justify-center cursor-pointer"><RotateCcw size={13} /></button>
                    )}
                  </span>
                </div>
                {leaveFor === r.name && (
                  <div className="mt-2 ml-[52px] flex flex-wrap gap-1.5">
                    {LEAVE_CATEGORIES.map(c => (
                      <button key={c} type="button" onClick={() => stage(r, { kind: 'leave', category: c })} className="h-7 px-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-[11.5px] font-bold hover:bg-amber-100 cursor-pointer">{c}</button>
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
