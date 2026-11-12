import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, RefreshCw, ServerCrash } from 'lucide-react'
import { fetchErrorReports, groupErrors, type AppErrorReport, type ErrorKind } from '@/lib/errorReport'
import { copyText } from '@/lib/clipboard'
import { screenOfPath } from '@/lib/auditLog'

const KIND: Record<ErrorKind, { label: string; tone: string; dot: string }> = {
  sync:   { label: 'Not saved to database', tone: 'bg-rose-50 text-rose-700 border-rose-200',   dot: 'bg-rose-500' },
  server: { label: 'Server (VPS)',          tone: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  crash:  { label: 'Screen crashed',        tone: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  error:  { label: 'Background error',      tone: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
}
type Period = '24h' | '7d' | 'all'
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })

/** Settings → Data health → App errors (TA-24, R-OPS-07): grouped by cause, with the effect on the data */
export function AppErrorsPanel() {
  const [reports, setReports] = useState<AppErrorReport[] | null>(null)
  const [period, setPeriod] = useState<Period>('7d')
  const [open, setOpen] = useState<string | null>(null)
  const [copied, setCopied] = useState('')

  const load = () => { setReports(null); void fetchErrorReports().then(setReports) }
  useEffect(() => { let alive = true; void fetchErrorReports().then(r => { if (alive) setReports(r) }); return () => { alive = false } }, [])

  const groups = useMemo(() => {
    if (!reports) return []
    const since = period === 'all' ? '' : new Date(Date.now() - (period === '24h' ? 1 : 7) * 86400000).toISOString()
    return groupErrors(reports.filter(r => !since || r.at >= since))
  }, [reports, period])
  const byKind = (k: ErrorKind) => groups.filter(g => g.kind === k).reduce((n, g) => n + g.count, 0)

  const copyGroup = (key: string) => {
    const g = groups.find(x => x.key === key)
    if (!g) return
    const r = g.latest
    void copyText([
      `Error: ${g.message}`, `Kind: ${KIND[g.kind].label} · ${g.count}× · first ${when(g.first)} · last ${when(g.last)}`,
      `Effect on data: ${g.impact}`, `Screens: ${g.screens.join(', ') || '—'}`, `People: ${g.users.join(', ') || '—'}`,
      `App version: ${g.versions.join(', ') || '—'}${g.tables.length ? ` · tables: ${g.tables.join(', ')}` : ''}`,
      `Latest: online ${r.online !== false ? 'yes' : 'no'} · unsaved changes ${r.pendingWrites ?? '—'} · ${r.where || ''} · ${r.userAgent}`,
      r.stack ? `\n${r.stack}` : '',
    ].join('\n'))
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-[13px] font-bold text-slate-800 flex items-center gap-2"><ServerCrash size={15} className="text-rose-600" /> Recent app errors</h4>
          <p className="text-[11.5px] text-slate-500">From every device and the server (VPS), grouped by cause — with what it means for the data. The last 300 are kept.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(['24h', '7d', 'all'] as Period[]).map(p => (
              <button key={p} type="button" onClick={() => setPeriod(p)} className={`px-2.5 h-6 rounded-md text-[11px] font-bold cursor-pointer ${period === p ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'}`}>
                {p === '24h' ? '24 h' : p === '7d' ? '7 days' : 'All'}
              </button>
            ))}
          </div>
          <button type="button" onClick={load} aria-label="Refresh errors" className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"><RefreshCw size={12} /></button>
        </div>
      </div>

      {reports === null ? <p className="px-5 py-6 text-center text-[12px] text-slate-400">Loading…</p>
        : groups.length === 0 ? <p className="px-5 py-6 text-center text-[12px] text-emerald-700 font-semibold">No errors reported in this period.</p>
        : (
          <>
            <div className="px-5 py-2.5 flex flex-wrap gap-2 border-b border-slate-100">
              {(Object.keys(KIND) as ErrorKind[]).map(k => byKind(k) > 0 && (
                <span key={k} className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${KIND[k].tone}`}>{KIND[k].label}: {byKind(k)}</span>
              ))}
            </div>
            <ul className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
              {groups.map(g => {
                const isOpen = open === g.key
                const r = g.latest
                return (
                  <li key={g.key}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} className="w-full px-5 py-2.5 flex items-start gap-3 text-left hover:bg-slate-50 cursor-pointer">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${KIND[g.kind].dot}`} />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${KIND[g.kind].tone}`}>{KIND[g.kind].label}</span>
                          {g.count > 1 && <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full bg-slate-800 text-white">{g.count}×</span>}
                          <span className="text-[11px] text-slate-500">last {when(g.last)}</span>
                        </span>
                        <span className="block text-[12px] font-semibold text-slate-800 break-words mt-0.5">{g.message}</span>
                        <span className="block text-[11.5px] text-slate-500 mt-0.5">{g.impact}</span>
                      </span>
                      {isOpen ? <ChevronDown size={14} className="text-slate-400 mt-1" /> : <ChevronRight size={14} className="text-slate-400 mt-1" />}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-3 pl-[42px] text-[11.5px] text-slate-600 space-y-1">
                        <p><b>Screens:</b> {g.screens.map(s => screenOfPath(s) || s).join(', ') || '—'}</p>
                        <p><b>People:</b> {g.users.join(', ') || 'not known (older report)'}</p>
                        <p><b>First seen:</b> {when(g.first)} · <b>App version:</b> {g.versions.join(', ') || '—'}{g.tables.length ? <> · <b>Table:</b> {g.tables.join(', ')}</> : null}</p>
                        <p><b>Latest device:</b> {r.online === false ? 'offline' : 'online'} · {r.pendingWrites != null ? `${r.pendingWrites} change(s) waiting to be saved` : 'unsaved changes not known'} · {r.userAgent}</p>
                        {r.stack && <pre className="mt-1 max-h-40 overflow-auto text-[10.5px] font-mono bg-slate-900 text-slate-200 p-2.5 rounded-lg whitespace-pre-wrap">{r.stack}</pre>}
                        <button type="button" onClick={() => copyGroup(g.key)} className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-700 hover:underline cursor-pointer">
                          <Copy size={11} /> {copied === g.key ? 'Copied' : 'Copy report for the developer'}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
    </div>
  )
}
