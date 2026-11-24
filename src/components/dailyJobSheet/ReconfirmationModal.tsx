import { CheckCircle2, AlertTriangle, Copy } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { notify } from '@/lib/notify'
import { reconfirmationText, type Reconfirmation } from '@/lib/excelSheet/reconfirm'

/** R-SHEET-03: the Reconfirmation pop-up of the Excel Job Sheet footer (same layout as the office's Excel check) */
export function ReconfirmationModal({ open, onClose, data, label, onGoToRow }: {
  open: boolean; onClose: () => void; data: Reconfirmation; label: string; onGoToRow?: (jobId: string) => void
}) {
  const aed = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const ok = data.finalBalance === 0
  const lines: { left?: string; label: string; value: number; strong?: boolean; tone?: string }[] = [
    { label: 'Charges', value: data.charges },
    { left: 'Less', label: 'Rcvd', value: data.received },
    { label: 'Pending', value: data.pending, tone: 'text-rose-700' },
    { label: 'Balance', value: data.balance, strong: true },
    { left: 'Add', label: 'Adv', value: data.advance, tone: 'text-amber-800' },
  ]
  const copy = async () => {
    try { await navigator.clipboard.writeText(reconfirmationText(data, label)); notify.success('Reconfirmation copied') } catch { notify.error('Could not copy') }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Reconfirmation — ${label}`} size="lg"
      footer={<div className="flex justify-between gap-2">
        <button type="button" onClick={() => void copy()} className="h-9 px-4 rounded-xl border border-slate-200 text-[12.5px] font-semibold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><Copy size={14} /> Copy</button>
        <button type="button" onClick={onClose} className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-bold cursor-pointer">Close</button>
      </div>}>
      <p className="text-[12px] text-slate-500 mb-3">{data.rows} rows on the sheet · Balance = Charges − Rcvd − Pending, then + Advance. It should end at 0.</p>
      <div className="rounded-xl border border-slate-200 overflow-hidden font-mono text-[14px]">
        {lines.map(l => (
          <div key={l.label} className={`grid grid-cols-[70px_1fr_140px] items-center px-4 py-2 border-b border-slate-100 ${l.strong ? 'bg-slate-50' : ''}`}>
            <span className="text-slate-500 font-sans text-[12.5px]">{l.left || ''}</span>
            <span className={`font-sans text-[13px] ${l.strong ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{l.label}</span>
            <span className={`text-right font-bold ${l.tone || 'text-slate-900'}`}>{aed(l.value)}</span>
          </div>
        ))}
        <div className={`grid grid-cols-[70px_1fr_140px] items-center px-4 py-3 ${ok ? 'bg-emerald-50' : 'bg-rose-50'}`}>
          <span />
          <span className="font-sans text-[13.5px] font-black text-slate-900">Balance</span>
          <span className={`text-right text-[16px] font-black ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{aed(data.finalBalance)}</span>
        </div>
      </div>

      <div className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12.5px] ${ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
        {ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
        <span>{ok ? 'The sheet adds up — every dirham is received, pending or advance.' : `The sheet is off by AED ${aed(data.finalBalance)}. The rows below do not add up on their own (often a pending already covered by a client advance or a pending adjustment).`}</span>
      </div>

      <p className="mt-3 text-[12px] text-slate-500">Received: cash <b className="text-slate-800">AED {aed(data.cash)}</b> · online / card <b className="text-slate-800">AED {aed(data.online)}</b></p>

      {data.gaps.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-3 py-2 bg-amber-50 text-[11px] font-bold uppercase tracking-wider text-amber-800">Rows that do not add up ({data.gaps.length})</div>
          <table className="w-full text-[12px]">
            <thead><tr className="text-left text-slate-500"><th className="px-3 py-1.5">Date</th><th className="px-3 py-1.5">Staff</th><th className="px-3 py-1.5">Address</th><th className="px-3 py-1.5 text-right">Chg</th><th className="px-3 py-1.5 text-right">Rcvd</th><th className="px-3 py-1.5 text-right">Pend</th><th className="px-3 py-1.5 text-right">Adv</th><th className="px-3 py-1.5 text-right">Off by</th></tr></thead>
            <tbody>
              {data.gaps.slice(0, 50).map(g => (
                <tr key={g.job.id} className={`border-t border-slate-100 ${onGoToRow ? 'cursor-pointer hover:bg-amber-50/60' : ''}`} onClick={() => onGoToRow?.(g.job.id)}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{g.job.date}</td>
                  <td className="px-3 py-1.5 truncate max-w-[140px]">{g.job.staff_name}</td>
                  <td className="px-3 py-1.5 truncate max-w-[180px]">{g.job.address}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{aed(g.charges)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{aed(g.received)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{aed(g.pending)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{aed(g.advance)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-rose-700">{aed(g.gap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
