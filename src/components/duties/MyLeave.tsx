import { useMemo, useState } from 'react'
import { CalendarOff, Plus, X, Clock3 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { notify, confirmAsync } from '@/lib/notify'
import { todayDubai, addDays } from '@/lib/dubaiTime'
import { fmtDate } from '@/components/dailyJobSheet/jobSheetUtils'
import { leaveBalance, splitMarkKey, ANNUAL_LEAVE_DAYS, HALF_DAY, SHORT_LEAVE, type AttendanceOverride } from '@/lib/attendance'
import { LEAVE_KINDS, MAX_LEAVE_DAYS, cancelLeave, leaveDates, submitLeave, type LeaveForm, type LeaveKind } from '@/lib/leaveRequests'

/**
 * R-ATT-12: My leave on My Duties — this year's balance, Apply for leave (annual, sick, emergency, half day, short
 * leave) and the person's requests with their status; a pending one can be cancelled.
 */
export function MyLeave({ employeeId, name, marks, canEdit }: { employeeId: string; name: string; marks: Record<string, AttendanceOverride>; canEdit: boolean }) {
  const today = todayDubai()
  const [extra, setExtra] = useState<Record<string, AttendanceOverride | null>>({}) // shown at once, before the live update arrives
  const all = useMemo(() => {
    const m = { ...marks }
    for (const [k, v] of Object.entries(extra)) { if (v) m[k] = v; else delete m[k] }
    return m
  }, [marks, extra])
  const bal = leaveBalance(all, employeeId, today.slice(0, 4))
  const mine = Object.entries(all)
    .map(([key, m]) => ({ key, m, ...splitMarkKey(key) }))
    .filter(x => x.cleanerKey === `id:${employeeId}` && x.m.status === 'on_leave' && x.date >= `${today.slice(0, 4)}-01-01`)
    .sort((a, b) => (a.date >= today) === (b.date >= today) ? a.date.localeCompare(b.date) : a.date >= today ? -1 : 1)
    .slice(0, 12)

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState<LeaveForm>({ kind: 'Annual Leave', from: addDays(today, 1), to: addDays(today, 1), part: 'Morning', startTime: '14:00', endTime: '16:00', reason: '' })
  const oneDay = f.kind === HALF_DAY || f.kind === SHORT_LEAVE
  const days = leaveDates(f)
  const send = async () => {
    if (!f.reason.trim() && f.kind !== 'Annual Leave') { notify.error('Please write the reason'); return }
    if (f.kind === SHORT_LEAVE && (!f.startTime || !f.endTime || f.endTime <= f.startTime)) { notify.error('Short leave: the end time must be after the start time'); return }
    if (!oneDay && f.to && f.to < f.from) { notify.error('The last day is before the first day'); return }
    setBusy(true)
    const err = await submitLeave(f, employeeId, name)
    setBusy(false)
    if (err) { notify.error(err); return }
    const now = new Date().toISOString()
    setExtra(e => ({ ...e, ...Object.fromEntries(days.map(d => [`${d}_id:${employeeId}`, { status: 'on_leave', category: f.kind, reason: f.reason, approval: 'pending', updatedAt: now, requestedBy: name } as AttendanceOverride])) }))
    notify.success(`Leave request sent (${days.length} day${days.length === 1 ? '' : 's'}) — the office will approve it`)
    setOpen(false); setF(x => ({ ...x, reason: '' }))
  }
  const cancel = async (key: string, date: string) => {
    if (!(await confirmAsync({ title: 'Cancel this leave request?', message: `${fmtDate(date)} — the office will no longer see it.`, confirmLabel: 'Cancel request' }))) return
    const err = await cancelLeave(key)
    if (err) { notify.error(err); return }
    setExtra(e => ({ ...e, [key]: null }))
    notify.success('Leave request cancelled')
  }
  const chip = (m: AttendanceOverride) => m.approval === 'pending' ? 'bg-amber-50 text-amber-800 border-amber-200' : m.approval === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
  const input = 'w-full h-11 px-3 rounded-xl border border-slate-200 text-[14px] bg-white'

  return (
    <section aria-label="My leave" className="bg-white rounded-2xl border border-[#E4E8EC] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-black text-[#111827] flex items-center gap-2"><CalendarOff size={17} className="text-emerald-700" /> My leave</p>
        {canEdit && <button type="button" onClick={() => setOpen(true)} className="h-10 px-3.5 rounded-xl bg-emerald-700 text-white text-[13px] font-bold flex items-center gap-1.5 cursor-pointer active:bg-emerald-800"><Plus size={15} /> Apply for leave</button>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          ['Annual left', `${bal.annualLeft} / ${ANNUAL_LEAVE_DAYS}`],
          ['Sick days', String(bal.sick)],
          ['Half / short', `${bal.halfDays} / ${bal.shortLeaves}`],
          ['Waiting', String(bal.pending)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2">
            <p className="text-[16px] font-black text-[#111827] tabular-nums">{v}</p>
            <p className="text-[11px] font-semibold text-slate-500">{l}</p>
          </div>
        ))}
      </div>
      {mine.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {mine.map(({ key, m, date }) => (
            <li key={key} className="py-2 flex items-center gap-2 text-[13px]">
              <span className="font-bold text-slate-800 w-[108px] shrink-0">{fmtDate(date)}</span>
              <span className="flex-1 min-w-0 truncate text-slate-600" title={m.reason || ''}>{m.category}{m.reason ? ` · ${m.reason}` : ''}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${chip(m)}`}>{m.approval === 'pending' ? 'Waiting' : m.approval === 'rejected' ? 'Rejected' : 'Approved'}</span>
              {canEdit && m.approval === 'pending' && date >= today && (
                <button type="button" onClick={() => void cancel(key, date)} aria-label={`Cancel leave ${date}`} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"><X size={14} /></button>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-[12.5px] text-slate-400">No leave this year.</p>}

      <Modal open={open} onClose={() => setOpen(false)} title="Apply for leave" size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Type of leave">
            {LEAVE_KINDS.map(k => (
              <button key={k.kind} type="button" role="radio" aria-checked={f.kind === k.kind} onClick={() => setF(x => ({ ...x, kind: k.kind as LeaveKind }))}
                className={`text-left rounded-xl border px-3 py-2 cursor-pointer ${f.kind === k.kind ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <span className="block text-[13px] font-bold text-slate-800">{k.label}</span>
                <span className="block text-[11px] text-slate-500">{k.note}</span>
              </button>
            ))}
          </div>
          <div className={`grid gap-2 ${oneDay ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <label className="text-[12px] font-bold text-slate-600">{oneDay ? 'Date' : 'From'}
              <input type="date" min={today} value={f.from} onChange={e => setF(x => ({ ...x, from: e.target.value, to: x.to && x.to < e.target.value ? e.target.value : x.to }))} className={input} />
            </label>
            {!oneDay && (
              <label className="text-[12px] font-bold text-slate-600">To (last day)
                <input type="date" min={f.from} value={f.to} onChange={e => setF(x => ({ ...x, to: e.target.value }))} className={input} />
              </label>
            )}
          </div>
          {f.kind === HALF_DAY && (
            <div className="grid grid-cols-2 gap-2">
              {(['Morning', 'Afternoon'] as const).map(p => (
                <button key={p} type="button" onClick={() => setF(x => ({ ...x, part: p }))} aria-pressed={f.part === p}
                  className={`h-11 rounded-xl border text-[13px] font-bold cursor-pointer ${f.part === p ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700'}`}>{p} off</button>
              ))}
            </div>
          )}
          {f.kind === SHORT_LEAVE && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] font-bold text-slate-600 flex flex-col gap-1"><span className="flex items-center gap-1"><Clock3 size={12} /> From</span>
                <input type="time" value={f.startTime} onChange={e => setF(x => ({ ...x, startTime: e.target.value }))} className={input} /></label>
              <label className="text-[12px] font-bold text-slate-600 flex flex-col gap-1"><span className="flex items-center gap-1"><Clock3 size={12} /> To</span>
                <input type="time" value={f.endTime} onChange={e => setF(x => ({ ...x, endTime: e.target.value }))} className={input} /></label>
            </div>
          )}
          <textarea value={f.reason} onChange={e => setF(x => ({ ...x, reason: e.target.value }))} rows={2}
            placeholder={f.kind === 'Annual Leave' ? 'Reason (optional)' : 'Reason'} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[14px]" />
          <p className="text-[12px] text-slate-500">
            {days.length} day{days.length === 1 ? '' : 's'}{!oneDay && days.length >= MAX_LEAVE_DAYS ? ` (at most ${MAX_LEAVE_DAYS} at once)` : ''} · the office approves or rejects it; you see the answer here.
            {f.kind === 'Annual Leave' && days.length > bal.annualLeft ? <b className="text-amber-700"> More than your {bal.annualLeft} annual days left.</b> : null}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border border-slate-200 font-bold text-[14px] cursor-pointer">Cancel</button>
            <button type="button" disabled={busy} onClick={() => void send()} className="h-11 rounded-xl bg-emerald-700 text-white font-bold text-[14px] cursor-pointer disabled:opacity-50">{busy ? 'Sending…' : 'Send request'}</button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
