import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ChevronRight, HeartPulse } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { runDataHealth } from '@/lib/dataHealth'
import { getSyncStatus, SYNC_STATUS_EVENT, type SyncStatus } from '@/lib/syncQueue'
import { listSnapshots } from '@/lib/snapshots'
import { todayDubai } from '@/lib/dubaiTime'
import { fetchErrorReports, type AppErrorReport } from '@/lib/errorReport'

const SEVERITY = {
  high:   { dot: 'bg-rose-500',  text: 'text-rose-700',  label: 'Fix first' },
  medium: { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Soon' },
  low:    { dot: 'bg-sky-500',   text: 'text-sky-700',   label: 'Later' },
}
const SHOW = 25

/** Settings → Data health: everything that needs cleaning, in one list (AUD-67) */
export function DataHealthPanel() {
  const { clients, employees, dailyJobs, invoices } = useData()
  const [sync, setSync] = useState<SyncStatus>(() => getSyncStatus())
  const [open, setOpen] = useState<string | null>(null)
  const [errors, setErrors] = useState<AppErrorReport[] | null>(null)

  useEffect(() => {
    let alive = true
    void fetchErrorReports().then(list => { if (alive) setErrors(list) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onSync = (e: Event) => setSync((e as CustomEvent<SyncStatus>).detail)
    window.addEventListener(SYNC_STATUS_EVENT, onSync)
    return () => window.removeEventListener(SYNC_STATUS_EVENT, onSync)
  }, [])

  const checks = useMemo(
    () => runDataHealth({ clients, employees, dailyJobs, invoices, today: todayDubai(), unsyncedChanges: sync.pending }),
    [clients, employees, dailyJobs, invoices, sync.pending],
  )
  const issues = checks.reduce((n, c) => n + c.items.length, 0)
  const lastCopy = listSnapshots()[0]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><HeartPulse size={16} className="text-emerald-700" /> Data health</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">Duplicates, broken links and unsaved changes — click an item to open the screen where it is fixed.</p>
        </div>
        <div className="text-right">
          <p className={`text-[22px] font-black ${issues ? 'text-amber-700' : 'text-emerald-700'}`}>{issues}</p>
          <p className="text-[11px] text-slate-500">items to look at</p>
        </div>
      </div>

      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] divide-y divide-slate-100 overflow-hidden">
        {checks.map(c => {
          const sev = SEVERITY[c.severity]
          const isOpen = open === c.id
          return (
            <div key={c.id}>
              <button type="button" disabled={c.items.length === 0} onClick={() => setOpen(isOpen ? null : c.id)}
                className="w-full px-5 py-3.5 flex items-center gap-3 text-left hover:bg-slate-50 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default">
                {c.items.length === 0
                  ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  : <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sev.dot}`} />}
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold text-slate-800">{c.title}</span>
                  <span className="block text-[11.5px] text-slate-500">{c.help}</span>
                </span>
                <span className={`text-[13px] font-black ${c.items.length ? sev.text : 'text-emerald-700'}`}>{c.items.length || 'OK'}</span>
                {c.items.length > 0 && (isOpen ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />)}
              </button>
              {isOpen && (
                <ul className="px-5 pb-3 space-y-1">
                  {c.items.slice(0, SHOW).map((it, i) => (
                    <li key={i} className="text-[12px] flex items-start gap-2 pl-5">
                      {it.link ? <Link to={it.link} className="font-semibold text-emerald-800 hover:underline">{it.label}</Link> : <span className="font-semibold text-slate-700">{it.label}</span>}
                      {it.detail && <span className="text-slate-500">— {it.detail}</span>}
                    </li>
                  ))}
                  {c.items.length > SHOW && <li className="text-[11.5px] text-slate-400 pl-5">…and {c.items.length - SHOW} more</li>}
                </ul>
              )}
            </div>
          )
        })}
        <div className="px-5 py-3.5 flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${lastCopy ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          <span className="flex-1 text-[12.5px] text-slate-700">
            <b>Last before-delete copy:</b>{' '}
            {lastCopy ? `${lastCopy.label} · ${new Date(lastCopy.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })}` : 'none yet'}
            <span className="text-slate-400"> · full backups: Settings → Backup</span>
          </span>
        </div>
      </div>

      {/* App errors reported by browsers (TA-24) */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h4 className="text-[13px] font-bold text-slate-800">Recent app errors</h4>
          <p className="text-[11.5px] text-slate-500">Screens that crashed or failed on anyone's device (newest first, last 100 kept on the server).</p>
        </div>
        {errors === null ? <p className="px-5 py-6 text-center text-[12px] text-slate-400">Loading…</p>
          : errors.length === 0 ? <p className="px-5 py-6 text-center text-[12px] text-emerald-700 font-semibold">No errors reported.</p>
          : <ul className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
              {errors.slice(0, 30).map((e, i) => (
                <li key={i} className="px-5 py-2.5 text-[12px]">
                  <p className="font-semibold text-rose-700 break-words">{e.message}</p>
                  <p className="text-slate-500">{new Date(e.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })} · {e.where || e.url}</p>
                </li>
              ))}
            </ul>}
      </div>
    </div>
  )
}
