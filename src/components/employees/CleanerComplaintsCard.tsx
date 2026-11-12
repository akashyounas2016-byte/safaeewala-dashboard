import { Link } from 'react-router-dom'
import { MessageSquareWarning, ExternalLink } from 'lucide-react'
import { COMPLAINT_STATUSES, type Complaint } from '@/lib/complaints'
import { COMPLAINT_PENALTY } from '@/lib/employeeHealth'
import { formatDate } from '@/lib/utils'

const PRIORITY_TONE: Record<Complaint['priority'], string> = {
  high: 'bg-rose-50 text-rose-700 border-rose-200', medium: 'bg-amber-50 text-amber-700 border-amber-200', low: 'bg-slate-100 text-slate-600 border-slate-200',
}

/**
 * R-EMP-13: the cleaner's complaints on their profile — each with its status, severity and resolution, and
 * the points it takes off the Health Score (last 90 days).
 */
export function CleanerComplaintsCard({ complaints, name, deduction, loading }: { complaints: Complaint[]; name: string; deduction: number; loading: boolean }) {
  const open = complaints.filter(c => c.status === 'open' || c.status === 'in_progress').length
  const resolved = complaints.filter(c => c.status === 'resolved' || c.status === 'closed').length
  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><MessageSquareWarning size={16} className="text-rose-600" /> Complaints</h3>
        {deduction > 0 && <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200" title="Points taken off the Health Score (last 90 days)">−{deduction} health</span>}
      </div>
      {loading ? <p className="text-[12px] text-slate-400">Loading…</p> : complaints.length === 0 ? (
        <p className="text-[12px] text-emerald-700 font-semibold">No complaints on record.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="rounded-xl bg-slate-50 py-1.5"><p className="text-[16px] font-black text-slate-800">{complaints.length}</p><p className="text-[10.5px] text-slate-500">Total</p></div>
            <div className="rounded-xl bg-rose-50 py-1.5"><p className="text-[16px] font-black text-rose-700">{open}</p><p className="text-[10.5px] text-rose-600">Open</p></div>
            <div className="rounded-xl bg-emerald-50 py-1.5"><p className="text-[16px] font-black text-emerald-700">{resolved}</p><p className="text-[10.5px] text-emerald-600">Resolved</p></div>
          </div>
          <ul className="space-y-2">
            {complaints.slice(0, 6).map(c => {
              const st = COMPLAINT_STATUSES.find(s => s.key === c.status)
              return (
                <li key={c.id}>
                  <Link to={`/complaints?open=${encodeURIComponent(c.id)}`} className="block rounded-xl border border-slate-200 px-3 py-2 hover:border-emerald-300 hover:bg-emerald-50/30">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10.5px] font-bold text-slate-500">{c.ref || '—'}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border capitalize ${PRIORITY_TONE[c.priority]}`}>{c.priority} · −{COMPLAINT_PENALTY[c.priority]}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${st?.tone || ''}`}>{st?.label || c.status}</span>
                      <span className="text-[10.5px] text-slate-400 ml-auto">{formatDate((c.job_date || c.created_at).slice(0, 10))}</span>
                    </div>
                    <p className="text-[11.5px] font-semibold text-slate-700 mt-1 truncate">{c.category} · {c.client_name}</p>
                    <p className="text-[11.5px] text-slate-500 line-clamp-2">{c.description}</p>
                    {c.resolution && <p className="text-[11px] text-emerald-700 line-clamp-1">✓ {c.resolution}</p>}
                  </Link>
                </li>
              )
            })}
          </ul>
          <Link to={`/complaints?cleaner=${encodeURIComponent(name)}`} className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700 hover:underline">
            All complaints of {name.split(' ')[0]} <ExternalLink size={11} />
          </Link>
        </>
      )}
      <p className="text-[10.5px] text-slate-400 mt-3">Health Score: −{COMPLAINT_PENALTY.high} high, −{COMPLAINT_PENALTY.medium} medium, −{COMPLAINT_PENALTY.low} low per complaint in the last 90 days (at most −40).</p>
    </div>
  )
}
