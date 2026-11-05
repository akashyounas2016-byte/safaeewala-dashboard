import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CloudOff, DatabaseBackup, RefreshCw } from 'lucide-react'
import { backupHealth, nextBackupAt, type BackupStatus } from '@/lib/backupStatus'

const dubai = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })

/** Settings → Backup: result of the nightly database backup on the VPS (UX-93, R-OPS-04) */
export function BackupStatusCard() {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/backup-status')
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setStatus(await res.json() as BackupStatus)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the backup status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const health = status ? backupHealth(status, new Date()) : null
  const tone = health === 'ok' ? 'emerald' : health === 'none' ? 'slate' : 'rose'
  const Icon = health === 'ok' ? CheckCircle2 : health === 'none' ? CloudOff : AlertTriangle

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><DatabaseBackup size={16} className="text-emerald-700" /> Nightly database backup</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Every night at 2:00 AM (Dubai) the server saves the full database, sign-ins and agencies / leads. Daily copies are kept {status?.keep_days || 30} days; the copy of the 1st of each month is kept for good.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1 disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error ? (
        <p className="px-6 py-6 text-[12.5px] text-rose-600">{error}</p>
      ) : !status ? (
        <p className="px-6 py-6 text-center text-[12.5px] text-slate-400">Loading…</p>
      ) : (
        <div className="px-6 py-4 space-y-3">
          <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 border ${
            tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : tone === 'rose' ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
            <Icon size={17} className="mt-0.5 shrink-0" />
            <div className="text-[12.5px]">
              {health === 'none' && <p className="font-bold">No backup has run on the server yet.</p>}
              {health === 'ok' && <p className="font-bold">Last backup OK · {dubai(new Date(status.at!))}</p>}
              {health === 'failed' && <p className="font-bold">Last backup FAILED · {dubai(new Date(status.at!))}</p>}
              {health === 'stale' && <p className="font-bold">No backup for more than a day · last {dubai(new Date(status.at!))}</p>}
              {status.configured && status.message && <p className="mt-0.5">{status.message}</p>}
              {(health === 'failed' || health === 'stale') && <p className="mt-0.5">Tell the developer: the data is still safe in Supabase, but there is no new copy.</p>}
            </div>
          </div>

          {status.configured && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              <div className="rounded-xl border border-slate-200 px-3 py-2"><p className="text-slate-500">Daily copies</p><p className="text-[16px] font-black text-slate-800">{status.daily_count ?? 0}</p></div>
              <div className="rounded-xl border border-slate-200 px-3 py-2"><p className="text-slate-500">Monthly (kept)</p><p className="text-[16px] font-black text-slate-800">{status.monthly_count ?? 0}</p></div>
              <div className="rounded-xl border border-slate-200 px-3 py-2"><p className="text-slate-500">Space used</p><p className="text-[16px] font-black text-slate-800">{status.total_size || '—'}</p></div>
              <div className="rounded-xl border border-slate-200 px-3 py-2"><p className="text-slate-500">Next backup</p><p className="text-[13px] font-bold text-slate-800 mt-0.5">{dubai(nextBackupAt(new Date()))}</p></div>
            </div>
          )}

          {status.configured && !status.offsite && (
            <p className="text-[11.5px] text-amber-700">Copies are kept on the server only. A Google Drive copy is planned.</p>
          )}
        </div>
      )}
    </div>
  )
}
