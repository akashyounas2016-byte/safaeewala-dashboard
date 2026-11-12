import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Download, ExternalLink, Pencil, Plus, RefreshCw, Search, Trash2, Repeat, History } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { copyText } from '@/lib/clipboard'
import { changesOf, type AuditEntry } from '@/lib/auditLog'
import { toDubaiDate, todayDubai, addDays } from '@/lib/dubaiTime'

/**
 * Settings → Activity Log (R-OPS-06): who did what, when, on which screen, and every field that changed.
 * Filters by period, record type, action and person; grouped by day; a CSV of the list can be downloaded.
 */
export const AUDIT_SQL = `-- Run this once in Supabase SQL Editor:
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_name text,
  action text,
  entity text,
  entity_id text,
  entity_name text,
  details text,
  screen text,
  changes jsonb
);
alter table public.audit_log enable row level security;
create policy "allow all authenticated" on public.audit_log
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);`

const PAGE = 200
const ENTITY_LABEL: Record<string, string> = {
  daily_job: 'Job', booking: 'Booking', client: 'Client', employee: 'Employee', invoice: 'Invoice', agency: 'Agency',
  inventory: 'Inventory', expense: 'Expense', day: 'Whole day', snapshot: 'Restore',
}
const ENTITY_TONE: Record<string, string> = {
  daily_job: 'bg-teal-50 text-teal-700 border-teal-200', booking: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  client: 'bg-blue-50 text-blue-700 border-blue-200', employee: 'bg-amber-50 text-amber-700 border-amber-200',
  invoice: 'bg-purple-50 text-purple-700 border-purple-200', agency: 'bg-orange-50 text-orange-700 border-orange-200',
  expense: 'bg-rose-50 text-rose-700 border-rose-200', day: 'bg-rose-50 text-rose-700 border-rose-200',
}
const ACTION = {
  created:        { label: 'Added',          icon: Plus,    tone: 'bg-emerald-100 text-emerald-700' },
  updated:        { label: 'Changed',        icon: Pencil,  tone: 'bg-sky-100 text-sky-700' },
  status_changed: { label: 'Status changed', icon: Repeat,  tone: 'bg-violet-100 text-violet-700' },
  deleted:        { label: 'Deleted',        icon: Trash2,  tone: 'bg-rose-100 text-rose-700' },
  restored:       { label: 'Restored',       icon: History, tone: 'bg-amber-100 text-amber-700' },
} as const
type Period = 'today' | '7d' | '30d' | 'all'
const PERIODS: { id: Period; label: string }[] = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'all', label: 'All' }]

const dubaiTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' })
const dayLabel = (d: string) => {
  const t = todayDubai()
  if (d === t) return 'Today'
  if (d === addDays(t, -1)) return 'Yesterday'
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
}
/** Text written into older entries as "[Screen]" (before the screen column existed) */
const screenOf = (e: AuditEntry) => e.screen || /\[([^\]]+)\]$/.exec(e.details || '')?.[1] || ''
const detailText = (e: AuditEntry) => (e.details || '').replace(/\s?\[[^\]]+\]$/, '')

/** The screen where the record can be opened (nothing for a deleted one) */
export function recordLink(e: Pick<AuditEntry, 'entity' | 'entity_id' | 'entity_name' | 'action'>): string {
  if (e.action === 'deleted' || !e.entity_id) return ''
  const date = /(\d{4}-\d{2}-\d{2})/.exec(e.entity_name || '')?.[1]
  switch (e.entity) {
    case 'daily_job': return `/daily-job-sheet?${date ? `date=${date}&` : ''}job=${encodeURIComponent(e.entity_id)}`
    case 'client':    return `/clients/${encodeURIComponent(e.entity_id)}`
    case 'employee':  return `/employees/${encodeURIComponent(e.entity_id)}`
    case 'agency':    return `/agencies/${encodeURIComponent(e.entity_id)}`
    case 'booking':   return '/bookings'
    case 'invoice':   return '/invoices'
    case 'expense':   return date ? `/daily-job-sheet?date=${date}` : '/expenses'
    case 'inventory': return '/inventory'
    default:          return ''
  }
}

export function ActivityLogPanel() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [tableExists, setTableExists] = useState(true)
  const [copied, setCopied] = useState(false)
  const [period, setPeriod] = useState<Period>('7d')
  const [entity, setEntity] = useState('all')
  const [action, setAction] = useState('all')
  const [user, setUser] = useState('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = async (append = false) => {
    setLoading(true)
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false })
    if (period !== 'all') {
      const from = period === 'today' ? todayDubai() : addDays(todayDubai(), period === '7d' ? -6 : -29)
      q = q.gte('created_at', new Date(`${from}T00:00:00+04:00`).toISOString())
    }
    if (entity !== 'all') q = q.eq('entity', entity)
    if (action !== 'all') q = q.eq('action', action)
    if (user !== 'all') q = q.eq('user_name', user)
    const start = append ? logs.length : 0
    const { data, error } = await q.range(start, start + PAGE - 1)
    if (error) { if (!append) setTableExists(false) }
    else {
      const rows = (data ?? []) as AuditEntry[]
      setLogs(prev => (append ? [...prev, ...rows] : rows))
      setMore(rows.length === PAGE)
    }
    setLoading(false)
  }
  useEffect(() => { void load() }, [period, entity, action, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return logs
    return logs.filter(e => [e.entity_name, e.details, e.user_name, screenOf(e), ENTITY_LABEL[e.entity] || e.entity].some(v => String(v || '').toLowerCase().includes(s)))
  }, [logs, search])
  const users = useMemo(() => Array.from(new Set(logs.map(e => e.user_name || 'System'))).sort(), [logs])
  const byDay = useMemo(() => {
    const groups = new Map<string, AuditEntry[]>()
    shown.forEach(e => { const d = toDubaiDate(new Date(e.created_at)); groups.set(d, [...(groups.get(d) || []), e]) })
    return Array.from(groups.entries())
  }, [shown])
  const count = (a: string) => shown.filter(e => e.action === a).length
  const oldTable = logs.length > 0 && !('screen' in logs[0])

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['When (Dubai)', 'Person', 'Action', 'Record type', 'Record', 'Screen', 'Changes / details'].map(esc).join(',')]
    shown.forEach(e => {
      const ch = changesOf(e)
      lines.push([
        new Date(e.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' }), e.user_name || 'System',
        ACTION[e.action as keyof typeof ACTION]?.label || e.action, ENTITY_LABEL[e.entity] || e.entity, e.entity_name, screenOf(e),
        ch.length ? ch.map(c => `${c.field}: ${c.from || '—'} → ${c.to || '—'}`).join('; ') : detailText(e),
      ].map(esc).join(','))
    })
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + lines.join('\n')], { type: 'text/csv;charset=utf-8' })) // BOM: Excel reads Arabic / Urdu names
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-log-${todayDubai()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!tableExists) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-[22px] p-5">
        <p className="text-[13px] font-bold text-amber-800 mb-1">One-time setup required</p>
        <p className="text-[12px] text-amber-700 mb-3">The activity log needs a table in Supabase. Run the SQL below in your Supabase SQL Editor, then refresh the page.</p>
        <div className="relative">
          <pre className="text-[11px] font-mono bg-slate-900 text-emerald-400 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap">{AUDIT_SQL}</pre>
          <button type="button" onClick={() => { void copyText(AUDIT_SQL); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="absolute top-2 right-2 text-[11px] font-semibold bg-white/10 text-white px-2.5 py-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    )
  }

  const sel = 'h-9 px-3 rounded-xl border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700 cursor-pointer'
  return (
    <div className="space-y-4">
      {/* Header + summary */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><History size={16} className="text-emerald-700" /> Activity Log</h3>
            <p className="text-[12px] text-slate-500 mt-0.5">Every add, change and delete: who did it, when, on which screen, and each field before → after.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className="h-9 px-3 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button type="button" onClick={exportCsv} disabled={shown.length === 0} className="h-9 px-3 rounded-xl bg-emerald-700 text-white text-[12px] font-bold hover:bg-emerald-800 cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
              <Download size={13} /> CSV
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { label: 'Entries', value: shown.length, tone: 'text-slate-900' },
            { label: 'Added', value: count('created'), tone: 'text-emerald-700' },
            { label: 'Changed', value: count('updated') + count('status_changed'), tone: 'text-sky-700' },
            { label: 'Deleted', value: count('deleted'), tone: 'text-rose-700' },
            { label: 'People', value: new Set(shown.map(e => e.user_name || 'System')).size, tone: 'text-violet-700' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
              <p className="text-[11px] text-slate-500">{s.label}</p>
              <p className={`text-[18px] font-black ${s.tone}`}>{s.value}{more && s.label === 'Entries' ? '+' : ''}</p>
            </div>
          ))}
        </div>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {PERIODS.map(p => (
              <button key={p.id} type="button" onClick={() => setPeriod(p.id)}
                className={`px-3 h-7 rounded-lg text-[12px] font-bold cursor-pointer ${period === p.id ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>{p.label}</button>
            ))}
          </div>
          <select aria-label="Record type" className={sel} value={entity} onChange={e => setEntity(e.target.value)}>
            <option value="all">All records</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="Action" className={sel} value={action} onChange={e => setAction(e.target.value)}>
            <option value="all">All actions</option>
            {Object.entries(ACTION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select aria-label="Person" className={sel} value={user} onChange={e => setUser(e.target.value)}>
            <option value="all">Everyone</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, cleaner, address, field…"
              className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
        </div>
        {oldTable && (
          <p className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Screen and field details are kept in the text for now. Run <code className="font-mono">supabase/migrations/2026-11-12_audit_log_details.sql</code> in Supabase for faster filters.
          </p>
        )}
      </div>

      {/* Entries by day */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading && logs.length === 0 ? <p className="text-[13px] text-slate-400 text-center py-10">Loading…</p>
          : shown.length === 0 ? <p className="text-[13px] text-slate-400 text-center py-10">No activity for these filters</p>
          : byDay.map(([day, entries]) => (
            <section key={day}>
              <div className="sticky top-0 z-[1] px-5 py-2 bg-slate-50 border-y border-slate-100 flex items-center justify-between">
                <span className="text-[12px] font-black text-slate-700">{dayLabel(day)}</span>
                <span className="text-[11px] text-slate-500">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {entries.map(e => {
                  const act = ACTION[e.action as keyof typeof ACTION] || ACTION.updated
                  const Icon = act.icon
                  const changes = changesOf(e)
                  const link = recordLink(e)
                  const screen = screenOf(e)
                  const isOpen = open === e.id
                  const canOpen = changes.length > 0 || Boolean(detailText(e))
                  return (
                    <li key={e.id}>
                      <button type="button" onClick={() => setOpen(isOpen ? null : e.id)} disabled={!canOpen}
                        className="w-full px-5 py-3 flex items-start gap-3 text-left hover:bg-slate-50/80 cursor-pointer disabled:cursor-default">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${act.tone}`}><Icon size={15} /></span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${ENTITY_TONE[e.entity] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{ENTITY_LABEL[e.entity] || e.entity}</span>
                            <span className="text-[12.5px] font-bold text-slate-900 truncate max-w-[340px]">{e.entity_name || '—'}</span>
                            <span className="text-[12px] text-slate-500">{act.label}</span>
                            {changes.length > 0 && <span className="text-[11px] text-slate-400">· {changes.length} field{changes.length === 1 ? '' : 's'}</span>}
                          </span>
                          <span className="block text-[11.5px] text-slate-500 mt-0.5">
                            <b className="font-semibold text-slate-700">{e.user_name || 'System'}</b> · {dubaiTime(e.created_at)}{screen ? ` · on ${screen}` : ''}
                          </span>
                          {!isOpen && changes.length > 0 && (
                            <span className="block text-[11.5px] text-slate-500 mt-0.5 truncate">{changes.slice(0, 3).map(c => `${c.field.replace(/_/g, ' ')}: ${c.from || '—'} → ${c.to || '—'}`).join(' · ')}</span>
                          )}
                        </span>
                        {canOpen && (isOpen ? <ChevronDown size={15} className="text-slate-400 mt-2" /> : <ChevronRight size={15} className="text-slate-400 mt-2" />)}
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-3.5 pl-[64px] space-y-2">
                          {changes.length > 0 ? (
                            <table className="w-full max-w-[720px] text-[12px] border border-slate-200 rounded-xl overflow-hidden">
                              <thead><tr className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
                                <th className="text-left px-3 py-1.5 font-bold">Field</th><th className="text-left px-3 py-1.5 font-bold">Before</th><th className="text-left px-3 py-1.5 font-bold">After</th>
                              </tr></thead>
                              <tbody className="divide-y divide-slate-100">
                                {changes.map((c, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-1.5 font-semibold text-slate-700 capitalize">{c.field.replace(/_/g, ' ')}</td>
                                    <td className="px-3 py-1.5 text-rose-700 line-through decoration-rose-300">{c.from || '—'}</td>
                                    <td className="px-3 py-1.5 text-emerald-800 font-semibold">{c.to || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : <p className="text-[12px] text-slate-600">{detailText(e)}</p>}
                          <p className="text-[11px] text-slate-400">{new Date(e.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'full', timeStyle: 'medium' })} (Dubai)</p>
                          {link && <Link to={link} className="inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700 hover:underline">Open this record <ExternalLink size={11} /></Link>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        {more && (
          <div className="px-5 py-3 border-t border-slate-100 flex justify-center">
            <button type="button" onClick={() => void load(true)} disabled={loading} className="px-4 h-8 rounded-full border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
              {loading ? 'Loading…' : 'Load older entries'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
