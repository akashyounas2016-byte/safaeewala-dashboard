import { useMemo, useState } from 'react'
import { AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { fmtDate } from '@/components/dailyJobSheet/jobSheetUtils'
import type { DailyAdvanceItem, DailyExpense, DailyJob, DailyPendingItem, DailyPendingReceivedItem } from '@/types'

/** Everything parsed from an Excel day sheet — nothing is saved until the user confirms (UX-28) */
export interface ImportPlan {
  fileName: string
  sheetName: string
  sheetNames: string[]
  date: string
  jobs: Omit<DailyJob, 'id' | 'created_at'>[]
  expenses: Omit<DailyExpense, 'id' | 'created_at'>[]
  pending: DailyPendingItem[]
  pendingRcvd: DailyPendingReceivedItem[]
  advances: DailyAdvanceItem[]
}

const rowKey = (j: Pick<DailyJob, 'staff_name' | 'address' | 'start_time'>) =>
  `${(j.staff_name || '').trim().toLowerCase()}|${(j.address || '').trim().toLowerCase()}|${j.start_time || ''}`

/**
 * Import preview (UX-28): shows the detected sheet and date, the parsed rows, duplicates inside the
 * file and what the import will replace on that date. The day is replaced only after "Import".
 */
export function ImportPreviewModal({ plan, existingJobs, existingExpenses, onCancel, onConfirm }: {
  plan: ImportPlan | null
  existingJobs: (date: string) => DailyJob[]
  existingExpenses: (date: string) => DailyExpense[]
  onCancel: () => void
  onConfirm: (plan: ImportPlan) => void
}) {
  const [dateOverride, setDateOverride] = useState<{ file: string; date: string } | null>(null)
  const date = plan && dateOverride?.file === plan.fileName ? dateOverride.date : plan?.date || ''

  const duplicates = useMemo(() => {
    if (!plan) return new Set<number>()
    const seen = new Map<string, number>()
    const dup = new Set<number>()
    plan.jobs.forEach((j, i) => {
      const k = rowKey(j)
      if (seen.has(k)) { dup.add(i); dup.add(seen.get(k)!) } else seen.set(k, i)
    })
    return dup
  }, [plan])

  if (!plan) return null
  const replacingJobs = existingJobs(date)
  const replacingExpenses = existingExpenses(date)
  const charges = plan.jobs.reduce((s, j) => s + (Number(j.charges) || 0), 0)
  const received = plan.jobs.reduce((s, j) => s + (Number(j.received) || 0), 0)

  return (
    <Modal
      open
      onClose={onCancel}
      size="2xl"
      title={<span className="flex items-center gap-2"><FileSpreadsheet size={18} className="text-emerald-600" /> Import preview</span>}
      headerActions={
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-xl border border-slate-200 text-[12.5px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button
            type="button"
            disabled={plan.jobs.length + plan.expenses.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
            onClick={() => onConfirm({ ...plan, date, jobs: plan.jobs.map(j => ({ ...j, date })), expenses: plan.expenses.map(e => ({ ...e, date })),
              pending: plan.pending.map(p => ({ ...p, date })), pendingRcvd: plan.pendingRcvd.map(p => ({ ...p, date })), advances: plan.advances.map(a => ({ ...a, date })) })}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-[12.5px] font-black hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            Import {plan.jobs.length} job{plan.jobs.length === 1 ? '' : 's'}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-[12.5px]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">File · sheet</p>
            <p className="font-bold text-slate-800 truncate" title={plan.fileName}>{plan.fileName}</p>
            <p className="text-slate-500">Sheet “{plan.sheetName}”{plan.sheetNames.length > 1 ? ` of ${plan.sheetNames.length}` : ''}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 block">Date (from the file name)</label>
            <input type="date" value={date} onChange={e => setDateOverride({ file: plan.fileName, date: e.target.value })}
              className="mt-1 px-2 py-1 rounded-lg border border-emerald-200 font-bold text-emerald-900 bg-white" />
            {date && <p className="text-emerald-700 mt-0.5">{fmtDate(date)}</p>}
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Found</p>
            <p className="text-slate-800"><b>{plan.jobs.length}</b> jobs · <b>{plan.expenses.length}</b> expenses</p>
            <p className="text-slate-500">{plan.pending.length} pending · {plan.pendingRcvd.length} received · {plan.advances.length} advance</p>
            <p className="text-slate-500">Charges AED {charges.toLocaleString()} · received AED {received.toLocaleString()}</p>
          </div>
        </div>

        {(replacingJobs.length > 0 || replacingExpenses.length > 0) && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900">
            <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <span>{fmtDate(date)} already has <b>{replacingJobs.length} job{replacingJobs.length === 1 ? '' : 's'}</b> and <b>{replacingExpenses.length} expense{replacingExpenses.length === 1 ? '' : 's'}</b>. Importing replaces them with the rows below.</span>
          </div>
        )}
        {duplicates.size > 0 && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-900">
            <AlertTriangle size={15} className="text-rose-600 mt-0.5 shrink-0" />
            <span>{duplicates.size} rows look like duplicates in the file (same staff, address and start time) — highlighted below.</span>
          </div>
        )}

        <div className="max-h-[45vh] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-2 py-2">#</th>
                <th className="text-left px-2 py-2">Staff</th>
                <th className="text-left px-2 py-2">Time</th>
                <th className="text-left px-2 py-2">Address</th>
                <th className="text-left px-2 py-2">Service</th>
                <th className="text-right px-2 py-2">Charges</th>
                <th className="text-right px-2 py-2">Received</th>
                <th className="text-left px-2 py-2">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.jobs.map((j, i) => (
                <tr key={i} className={duplicates.has(i) ? 'bg-rose-50' : ''}>
                  <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                  <td className="px-2 py-1.5 font-semibold text-slate-800">{j.staff_name}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{j.start_time} – {j.end_time}</td>
                  <td className="px-2 py-1.5 max-w-[260px] truncate" title={j.address}>{j.address || '—'}</td>
                  <td className="px-2 py-1.5">{j.service || '—'}</td>
                  <td className="px-2 py-1.5 text-right">{Number(j.charges || 0).toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right">{Number(j.received || 0).toLocaleString()}</td>
                  <td className="px-2 py-1.5">{j.payment_mode}</td>
                </tr>
              ))}
              {plan.jobs.length === 0 && (
                <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-400">No job rows found in this sheet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
