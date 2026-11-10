import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { attendanceKeyFor, findMark, newAbsenceMark, SHORT_LEAVE, type AttendanceOverride } from '@/lib/attendance'
import { notify } from '@/lib/notify'

/**
 * R-ATT-10: the Attendance column of the Excel Job Sheet (between Mode and Remarks), one per cleaner block.
 * A cleaner with a job that day is Present by default, one without a job is Available (R-ATT-01 — never absent
 * by default). Absent or Short Leave can be chosen; Short Leave needs a reason. Saved in the same attendance
 * marks as the Attendance screen, so both always agree. Leave set by someone who is not admin / manager waits
 * for approval (R-ATT-05).
 */
export function attendanceLabel(mark: AttendanceOverride | undefined, hasJob: boolean): string {
  if (mark?.status === 'absent') return 'Absent'
  if (mark?.status === 'on_leave') {
    const base = mark.category === SHORT_LEAVE ? 'Short Leave' : 'Leave'
    return mark.approval === 'pending' ? `${base} (pending)` : base
  }
  return hasJob ? 'Present' : 'Available'
}

const TONE: Record<string, string> = {
  Present: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Available: 'bg-slate-50 text-slate-600 border-slate-200',
  Absent: 'bg-rose-50 text-rose-700 border-rose-200',
}

export function ExcelAttendanceCell({ name, date, hasJob }: { name: string; date: string; hasJob: boolean }) {
  const { attendanceMarks, saveAttendanceMarks, employees } = useData()
  const { user } = useAuth()
  const emp = employees.find(e => (e.full_name || '').trim().toLowerCase() === name.trim().toLowerCase())
  const mark = findMark(attendanceMarks || {}, date, name, emp?.id)
  const label = attendanceLabel(mark, hasJob)
  const [open, setOpen] = useState(false)
  const [askReason, setAskReason] = useState(false)
  const [reason, setReason] = useState('')
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return
      setOpen(false); setAskReason(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setAskReason(false) } }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const by = user?.full_name || user?.email || 'Office'
  const save = (next: AttendanceOverride | null) => {
    const { key, nameKey } = attendanceKeyFor(date, name, employees)
    const changes = [{ key, mark: next, cleanerName: name.trim() }]
    if (nameKey !== key && attendanceMarks?.[nameKey]) changes.push({ key: nameKey, mark: null, cleanerName: name.trim() })
    saveAttendanceMarks(changes)
    setOpen(false); setAskReason(false); setReason('')
  }
  const choose = (what: 'present' | 'absent' | 'short') => {
    if (what === 'present') return save(null)
    if (what === 'absent') return save(newAbsenceMark('Uninformed Absence', '', user?.role, by))
    setReason(''); setAskReason(true)
  }
  const saveLeave = () => {
    if (!reason.trim()) { notify.error('Write the reason for the leave'); return }
    save(newAbsenceMark(SHORT_LEAVE, reason, user?.role, by))
  }

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 230), top: Math.min(r.bottom + 4, window.innerHeight - 200) })
    setOpen(o => !o); setAskReason(false)
  }

  const tone = TONE[label] || 'bg-amber-50 text-amber-800 border-amber-200'
  return (
    <>
      <button ref={btn} type="button" onClick={toggle} onDoubleClick={e => e.stopPropagation()}
        title={mark?.reason ? `${label} — ${mark.reason}` : `${label} — click to change`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10.5px] font-bold cursor-pointer ${tone}`}>
        <span>{label}</span><ChevronDown size={10} className="opacity-60" />
      </button>
      {open && createPortal(
        <div ref={menu} style={{ left: pos.left, top: pos.top }}
          className="fixed z-[300] w-56 bg-white rounded-xl shadow-2xl border border-slate-200 p-1.5 text-[12px] text-slate-800 font-sans">
          <p className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">{name} · {date}</p>
          {!askReason ? (
            <>
              <button type="button" onClick={() => choose('present')} className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 font-semibold cursor-pointer">
                {hasJob ? 'Present' : 'Available (no mark)'}
              </button>
              <button type="button" onClick={() => choose('absent')} className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-700 font-semibold cursor-pointer">Absent</button>
              <button type="button" onClick={() => choose('short')} className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-amber-50 text-amber-800 font-semibold cursor-pointer">Leave (Short Leave)…</button>
            </>
          ) : (
            <div className="p-1.5 space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700">Reason for the leave *</label>
              <input autoFocus value={reason} onChange={e => setReason(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') saveLeave() }}
                placeholder="e.g. doctor visit 2–4 PM"
                className="w-full text-[12px] px-2 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-amber-500" />
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setAskReason(false)} className="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer">Back</button>
                <button type="button" onClick={saveLeave} disabled={!reason.trim()} className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold disabled:opacity-50 cursor-pointer">Save leave</button>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
