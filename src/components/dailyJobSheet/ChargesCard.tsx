import { useState } from 'react'
import { CreditCard, Plus, Users, User } from 'lucide-react'
import { PAYMENT_MODES, cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

/** One cleaner's money in Split Mode (inputs kept as text while typing) */
export interface SplitRowInput { charges: string; received: string; payment_mode: string }

const CUSTOM_MODES_KEY = 'safaeewala_custom_payment_modes'   // shared with the Excel Job Sheet Mode column (cloud-synced)
const DELETED_MODES_KEY = 'safaeewala_deleted_payment_modes'
const CUSTOM = '__custom__'

/** Payment modes a job can take: the standard ones (not "Above", which only marks team members) + custom ones */
function useModeOptions() {
  const [custom, setCustom] = useState<string[]>(() => safeLocalStorageGet<string[]>(CUSTOM_MODES_KEY, []))
  const deleted = safeLocalStorageGet<string[]>(DELETED_MODES_KEY, [])
  const options = [...PAYMENT_MODES.filter(m => m !== 'Above'), ...custom].filter((m, i, a) => !deleted.includes(m) && a.indexOf(m) === i)
  const addCustom = (mode: string) => {
    const m = mode.trim()
    if (!m || options.some(o => o.toLowerCase() === m.toLowerCase())) return
    const next = [...custom, m]
    setCustom(next)
    safeLocalStorageSet(CUSTOM_MODES_KEY, next)
  }
  return { options, addCustom }
}

/** Payment mode select with a "Custom value…" entry that is saved for every job (and the Excel Mode column) */
function ModeSelect({ value, onChange, compact = false }: { value: string; onChange: (m: string) => void; compact?: boolean }) {
  const { options, addCustom } = useModeOptions()
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const all = value && !options.includes(value) ? [...options, value] : options
  const base = compact
    ? 'w-full text-[12px] px-1.5 py-1 h-8 border border-slate-200 rounded-md bg-white focus:outline-none focus:border-emerald-500 font-semibold text-slate-800'
    : 'w-full text-[13px] px-3 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white font-semibold text-slate-800'
  if (typing) {
    const save = () => { if (text.trim()) { addCustom(text); onChange(text.trim()) } setTyping(false); setText('') }
    return (
      <div className="flex items-center gap-1">
        <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Cheque"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') setTyping(false) }}
          className={base} />
        <button type="button" onClick={save} title="Add this mode" className="shrink-0 h-8 w-8 rounded-md bg-emerald-600 text-white flex items-center justify-center cursor-pointer"><Plus size={14} /></button>
      </div>
    )
  }
  return (
    <select value={value} onChange={e => (e.target.value === CUSTOM ? setTyping(true) : onChange(e.target.value))} className={`${base} cursor-pointer`}>
      {all.map(m => <option key={m} value={m}>{m}</option>)}
      <option value={CUSTOM}>+ Custom value…</option>
    </select>
  )
}

/**
 * Add Job → Charges (R-PAY-05).
 *  - Lump Sum Mode: Charges, Advance Received (first payment taken at booking) and Payment Mode; the whole
 *    amount is on the lead cleaner's record.
 *  - Split Mode (team jobs): one line per cleaner with charges, received and a compact payment mode.
 */
export function ChargesCard({
  staff, charges, setCharges, received, setReceived, paymentMode, setPaymentMode,
  splitOn, setSplitOn, split, setSplit,
}: {
  staff: string[]
  charges: number | string; setCharges: (v: string) => void
  received: number | string; setReceived: (v: string) => void
  paymentMode: string; setPaymentMode: (m: string) => void
  splitOn: boolean; setSplitOn: (on: boolean) => void
  split: Record<string, SplitRowInput>; setSplit: (fn: (p: Record<string, SplitRowInput>) => Record<string, SplitRowInput>) => void
}) {
  const team = staff.length >= 2
  const split_ = team && splitOn
  const lbl = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5'
  const inp = 'w-full text-[13px] px-3 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-bold'
  const sum = (k: 'charges' | 'received') => staff.reduce((s, n) => s + cleanNum(split[n]?.[k]), 0)

  const turnSplit = (on: boolean) => {
    setSplitOn(on)
    if (on) {
      // start every cleaner with an equal share of the lump sum and its payment mode
      const n = staff.length
      setSplit(prev => Object.fromEntries(staff.map((name, i) => [name, prev[name] || {
        charges: cleanNum(charges) ? String(Math.round((cleanNum(charges) / n) * 100) / 100) : '',
        received: i === 0 && cleanNum(received) ? String(cleanNum(received)) : '',
        payment_mode: paymentMode || 'Cash',
      }])))
    } else {
      setCharges(String(sum('charges') || charges || ''))
      setReceived(String(sum('received') || received || ''))
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5 flex flex-col justify-start">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CreditCard size={15} />
          </div>
          <h4 className="text-[13px] font-bold text-slate-900">Charges</h4>
        </div>
        {team && (
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5" role="tablist" aria-label="Charges mode">
            {([['lump', 'Lump Sum', User], ['split', 'Split Mode', Users]] as const).map(([id, label, Icon]) => {
              const active = (id === 'split') === split_
              return (
                <button key={id} type="button" role="tab" aria-selected={active} onClick={() => turnSplit(id === 'split')}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold flex items-center gap-1 cursor-pointer ${active ? 'bg-white text-emerald-800 shadow-2xs border border-emerald-200' : 'text-slate-500 hover:text-slate-800'}`}>
                  <Icon size={12} /> {label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {!split_ ? (
        /* Lump Sum: the whole amount on the lead cleaner's record */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label className={lbl}>Charges</label>
            <input type="number" min="0" step="0.01" value={charges} onChange={e => setCharges(e.target.value)} placeholder="0.00" className={`${inp} text-slate-800`} />
          </div>
          <div>
            <label className={lbl} title="The first payment taken when the job is entered">Advance Received</label>
            <input type="number" min="0" step="0.01" value={received} onChange={e => setReceived(e.target.value)} placeholder="0.00" className={`${inp} text-emerald-800`} />
          </div>
          <div>
            <label className={lbl}>Payment Mode</label>
            <ModeSelect value={paymentMode} onChange={setPaymentMode} />
          </div>
        </div>
      ) : (
        /* Split: each cleaner's own charges, received and mode */
        <div className="space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>Cleaner</span><span>Charges</span><span>Received</span><span>Mode</span>
          </div>
          {staff.map(name => {
            const row = split[name] || { charges: '', received: '', payment_mode: paymentMode || 'Cash' }
            const set = (patch: Partial<SplitRowInput>) => setSplit(p => ({ ...p, [name]: { ...row, ...patch } }))
            return (
              <div key={name} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-1.5 items-center bg-slate-50/70 border border-slate-200 rounded-lg px-1.5 py-1">
                <span className="text-[12px] font-semibold text-slate-800 truncate px-1" title={name}>{name}</span>
                <input type="number" min="0" step="0.01" value={row.charges} onChange={e => set({ charges: e.target.value })} placeholder="0"
                  className="w-full h-8 text-right text-[12.5px] font-bold text-slate-800 px-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:border-emerald-500" />
                <input type="number" min="0" step="0.01" value={row.received} onChange={e => set({ received: e.target.value })} placeholder="0"
                  className="w-full h-8 text-right text-[12.5px] font-bold text-emerald-800 px-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:border-emerald-500" />
                <ModeSelect compact value={row.payment_mode} onChange={m => set({ payment_mode: m })} />
              </div>
            )
          })}
          <div className="flex justify-end gap-4 px-1 pt-0.5 text-[12px] font-bold text-slate-600">
            <span>Charges: <span className="text-slate-900">AED {sum('charges').toLocaleString()}</span></span>
            <span>Received: <span className="text-emerald-700">AED {sum('received').toLocaleString()}</span></span>
          </div>
        </div>
      )}
    </div>
  )
}
