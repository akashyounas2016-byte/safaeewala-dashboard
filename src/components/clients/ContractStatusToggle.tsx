import { Power } from 'lucide-react'

/**
 * R-SCHED-08: Contract Status of a Monthly / Bi-Weekly client. On: visits keep syncing to the Daily Job Sheet.
 * Off: syncing stops at once and the client's synced visits from today on leave the sheet.
 */
export function ContractStatusToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${on ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'}`}>
      <div className="flex items-start gap-2.5 min-w-0">
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          <Power size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-black text-slate-800">Contract Status: {on ? 'On' : 'Off'}</p>
          <p className="text-[11.5px] text-slate-600">
            {on
              ? 'Visits sync to the Daily Job Sheet automatically.'
              : 'No visits sync. Synced visits from today on are taken off the Daily Job Sheet when you save; past visits stay.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Contract status"
        onClick={() => onChange(!on)}
        className={`relative w-12 h-7 rounded-full shrink-0 transition-colors cursor-pointer ${on ? 'bg-emerald-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  )
}
