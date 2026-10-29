import { useEffect, useState } from 'react'
import { Download, History, RotateCcw, Trash2 } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { confirmAsync, notify } from '@/lib/notify'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { SNAPSHOT_EVENT, deleteSnapshot, downloadSnapshot, listSnapshots, type DeletionSnapshot } from '@/lib/snapshots'

const LABELS: Record<string, string> = { dailyJobs: 'jobs', dailyExpenses: 'expenses', employees: 'employees', agencies: 'agencies', appState: 'pending/advance lists' }

/** Settings → Backup: copies saved automatically before Delete All, day replace and agency delete (BAK-5) */
export function BeforeDeleteCopies() {
  const { restoreRecords } = useData()
  const [snaps, setSnaps] = useState<DeletionSnapshot[]>(() => listSnapshots())

  useEffect(() => {
    const refresh = () => setSnaps(listSnapshots())
    window.addEventListener(SNAPSHOT_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener(SNAPSHOT_EVENT, refresh); window.removeEventListener('storage', refresh) }
  }, [])

  const restore = async (s: DeletionSnapshot) => {
    const what = Object.entries(s.counts).map(([k, n]) => `${n} ${LABELS[k] || k}`).join(', ')
    const ok = await confirmAsync({
      title: `Restore "${s.label}"?`,
      message: `Puts back ${what}. Records that still exist are not duplicated.`,
      confirmLabel: 'Restore',
    })
    if (!ok) return
    const n = restoreRecords(s.data)
    // Pending / received / advance lists: add back items that are missing (by id)
    let listItems = 0
    for (const [key, value] of Object.entries(s.data.appState || {})) {
      if (!Array.isArray(value)) continue
      const current = safeLocalStorageGet<{ id?: string }[]>(key, [])
      const have = new Set(current.map(x => x?.id))
      const missing = (value as { id?: string }[]).filter(x => x?.id && !have.has(x.id))
      if (missing.length) { safeLocalStorageSet(key, [...current, ...missing]); listItems += missing.length }
    }
    notify.success(`Restored ${n + listItems} record${n + listItems === 1 ? '' : 's'}${listItems ? ' — reload the page to see pending/advance items' : ''}`)
  }

  const remove = async (s: DeletionSnapshot) => {
    const ok = await confirmAsync({ title: 'Remove this copy?', message: `"${s.label}" will be removed from this browser. Download it first if you may need it.`, confirmLabel: 'Remove', tone: 'danger' })
    if (ok) deleteSnapshot(s.id)
  }

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E4E8EC]">
        <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><History size={16} className="text-emerald-700" /> Before-delete copies</h3>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Saved automatically before <b>Delete All Data</b> (also downloaded as a file), before a day is deleted or re-imported, and before an agency is deleted with its staff. Kept in this browser — newest 10.
        </p>
      </div>
      {snaps.length === 0 ? (
        <p className="px-6 py-8 text-center text-[12.5px] text-slate-400">No copies yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {snaps.map(s => (
            <li key={s.id} className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[13px] font-bold text-slate-800">{s.label}</p>
                <p className="text-[11.5px] text-slate-500">
                  {new Date(s.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })} (Dubai) ·{' '}
                  {Object.entries(s.counts).map(([k, n]) => `${n} ${LABELS[k] || k}`).join(' · ')}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => void restore(s)} className="px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white text-[12px] font-bold hover:bg-emerald-800 cursor-pointer flex items-center gap-1"><RotateCcw size={12} /> Restore</button>
                <button type="button" onClick={() => downloadSnapshot(s)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1"><Download size={12} /> File</button>
                <button type="button" onClick={() => void remove(s)} title="Remove copy" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"><Trash2 size={13} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
