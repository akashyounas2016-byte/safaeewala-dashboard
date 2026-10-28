import { useEffect, useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, BookOpen, HandCoins, Plus, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useData } from '@/store/DataContext'
import { isBogusJob, jobCollected, splitStaffNames } from '@/lib/clientDataSync'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { notify } from '@/lib/notify'
import type { DailyPendingReceivedItem } from '@/types'
import { todayDubai } from '@/lib/dubaiTime'

/** Cash a crew member handed over to the office (cloud-synced key) */
export interface CashHandover { id: string; date: string; staff: string; amount: number; notes?: string }
const HANDOVER_KEY = 'safaeewala_cash_handovers'

const num = (v: unknown) => Number(v) || 0
const isCashMethod = (m?: string) => !m || /^(cash|petty cash)$/i.test(m.trim())
const aed = (n: number) => `AED ${Math.round(n).toLocaleString()}`

/**
 * Daily cash book (UX-11): opening cash, money in by method, cash expenses, closing cash,
 * and per-crew cash collected vs handed over to the office.
 */
export function CashBook({ receipts }: { receipts: DailyPendingReceivedItem[] }) {
  const { dailyJobs, dailyExpenses } = useData()
  const [date, setDate] = useState(() => todayDubai())
  const [handovers, setHandovers] = useState<CashHandover[]>(() => safeLocalStorageGet<CashHandover[]>(HANDOVER_KEY, []))
  const [form, setForm] = useState({ staff: '', amount: '' })

  useEffect(() => { safeLocalStorageSet(HANDOVER_KEY, handovers) }, [handovers])

  const monthlyPayments = useMemo(
    () => safeLocalStorageGet<{ amount: number; date: string; paymentMethod?: string; clientName?: string }[]>('safaeewala_monthly_client_payments', []),
    [],
  )

  /** Cash in / out on one day — same "collected" rule as Overview (R-FIN-03) */
  const dayFlows = useMemo(() => {
    const byDate = new Map<string, { cashIn: number; onlineIn: number; cashOut: number }>()
    const at = (d: string) => {
      if (!byDate.has(d)) byDate.set(d, { cashIn: 0, onlineIn: 0, cashOut: 0 })
      return byDate.get(d)!
    }
    dailyJobs.forEach(j => {
      if (!j.date || isBogusJob(j)) return
      const amt = jobCollected(j)
      if (amt <= 0) return
      if (String(j.payment_mode).toLowerCase() === 'cash') at(j.date).cashIn += amt
      else at(j.date).onlineIn += amt
    })
    receipts.forEach(r => {
      if (!r.date) return
      at(r.date).cashIn += num(r.cash)
      at(r.date).onlineIn += num(r.online)
    })
    monthlyPayments.forEach(p => {
      if (!p.date) return
      if (isCashMethod(p.paymentMethod)) at(p.date).cashIn += num(p.amount)
      else at(p.date).onlineIn += num(p.amount)
    })
    dailyExpenses.forEach(e => {
      if (!e.date) return
      if (isCashMethod(e.payment_method)) at(e.date).cashOut += num(e.amount)
    })
    return byDate
  }, [dailyJobs, receipts, monthlyPayments, dailyExpenses])

  const book = useMemo(() => {
    let opening = 0
    dayFlows.forEach((f, d) => { if (d < date) opening += f.cashIn - f.cashOut })
    const today = dayFlows.get(date) || { cashIn: 0, onlineIn: 0, cashOut: 0 }
    return { opening, ...today, closing: opening + today.cashIn - today.cashOut }
  }, [dayFlows, date])

  /** Cash each crew member collected on jobs that day (shared shifts split) vs handed over */
  const crew = useMemo(() => {
    const map = new Map<string, { collected: number; handed: number }>()
    const at = (s: string) => {
      if (!map.has(s)) map.set(s, { collected: 0, handed: 0 })
      return map.get(s)!
    }
    dailyJobs.forEach(j => {
      if (j.date !== date || isBogusJob(j) || String(j.payment_mode).toLowerCase() !== 'cash') return
      const amt = jobCollected(j)
      const names = splitStaffNames(j.staff_name || '')
      if (amt <= 0 || names.length === 0) return
      names.forEach(n => { at(n).collected += amt / names.length })
    })
    handovers.filter(h => h.date === date).forEach(h => { at(h.staff).handed += num(h.amount) })
    return Array.from(map.entries()).map(([staff, v]) => ({ staff, ...v, withCrew: v.collected - v.handed }))
      .sort((a, b) => b.withCrew - a.withCrew)
  }, [dailyJobs, handovers, date])

  const dayHandovers = handovers.filter(h => h.date === date)

  const addHandover = () => {
    const amount = Number(form.amount)
    if (!form.staff.trim() || !(amount > 0)) { notify.error('Choose a crew member and enter the amount handed over.'); return }
    setHandovers(prev => [{ id: `ho-${Date.now()}`, date, staff: form.staff.trim(), amount }, ...prev])
    setForm({ staff: '', amount: '' })
    notify.success(`Recorded ${aed(amount)} handed over by ${form.staff.trim()}`)
  }

  const tiles = [
    { label: 'Opening cash', value: book.opening, icon: Wallet, tone: 'text-slate-800', bg: 'bg-slate-50' },
    { label: 'Cash in', value: book.cashIn, icon: ArrowDownCircle, tone: 'text-emerald-700', bg: 'bg-emerald-50' },
    { label: 'Online / bank in', value: book.onlineIn, icon: ArrowDownCircle, tone: 'text-sky-700', bg: 'bg-sky-50' },
    { label: 'Cash expenses', value: book.cashOut, icon: ArrowUpCircle, tone: 'text-rose-700', bg: 'bg-rose-50' },
    { label: 'Closing cash', value: book.closing, icon: BookOpen, tone: 'text-teal-800', bg: 'bg-teal-50' },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-[#111827]">Daily Cash Book</h3>
            <p className="text-[11.5px] text-slate-400">Job collections, recoveries and monthly payments in · cash expenses out</p>
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 text-[12.5px] border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 font-semibold" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {tiles.map(t => (
            <div key={t.label} className={`rounded-2xl p-3.5 ${t.bg}`}>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1"><t.icon size={12} /> {t.label}</p>
              <p className={`text-[18px] font-black mt-1 ${t.tone}`}>{aed(t.value)}</p>
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-slate-400 mt-2">Opening cash = all earlier cash in − cash expenses. Bank / online money is shown separately and not added to cash.</p>
      </div>

      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center gap-2">
          <HandCoins size={16} className="text-amber-600" />
          <h3 className="text-[15px] font-bold text-[#111827]">Crew cash — collected vs handed over</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#f8fafc] text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-left py-2.5 px-4">Crew member</th>
                <th className="text-right py-2.5 px-4">Cash collected</th>
                <th className="text-right py-2.5 px-4">Handed over</th>
                <th className="text-right py-2.5 px-4">Still with crew</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {crew.map(c => (
                <tr key={c.staff}>
                  <td className="py-2.5 px-4 font-semibold text-slate-800">{c.staff}</td>
                  <td className="py-2.5 px-4 text-right">{aed(c.collected)}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-700">{aed(c.handed)}</td>
                  <td className={`py-2.5 px-4 text-right font-bold ${c.withCrew > 0.5 ? 'text-amber-700' : 'text-slate-500'}`}>{aed(c.withCrew)}</td>
                </tr>
              ))}
              {crew.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400">No cash jobs or handovers on this day.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Crew member</label>
            <input list="cashbook-crew" value={form.staff} onChange={e => setForm(f => ({ ...f, staff: e.target.value }))}
              className="px-3 py-1.5 text-[12.5px] border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 w-[200px]" placeholder="Name" />
            <datalist id="cashbook-crew">{crew.map(c => <option key={c.staff} value={c.staff} />)}</datalist>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Amount handed over (AED)</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="px-3 py-1.5 text-[12.5px] border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 w-[160px]" />
          </div>
          <Button type="button" onClick={addHandover} className="h-[34px] bg-amber-600 hover:bg-amber-700 text-white font-bold text-[12px]">
            <Plus size={13} className="mr-1" /> Record handover
          </Button>
        </div>
        {dayHandovers.length > 0 && (
          <div className="px-6 pb-4 space-y-1">
            {dayHandovers.map(h => (
              <div key={h.id} className="flex items-center gap-3 text-[12px] text-slate-600">
                <span className="font-semibold">{h.staff}</span>
                <span>{aed(h.amount)}</span>
                <button type="button" onClick={() => setHandovers(prev => prev.filter(x => x.id !== h.id))}
                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Remove">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
