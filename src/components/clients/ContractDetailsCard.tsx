import { FileSignature } from 'lucide-react'
import { Input, Select } from '@/components/ui/Input'
import { renewalDateOf, type ContractDetails } from '@/lib/clientContracts'
import { formatDate } from '@/lib/utils'

const SERVICES = ['Regular Cleaning', 'Deep Cleaning', 'Office Cleaning', 'Villa Cleaning', 'Maid Service']

/**
 * R-CLI-05: Contract widget of the Monthly / Bi-Weekly client popup. Saved as the client's contract in
 * Monthly Clients → Contracts. Optional: an empty card creates no contract.
 */
export function ContractDetailsCard({ value, onChange, existing }: { value: ContractDetails; onChange: (v: ContractDetails) => void; existing: boolean }) {
  const set = (patch: Partial<ContractDetails>) => onChange({ ...value, ...patch })
  const renewal = renewalDateOf(value.startDate)
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3" data-field="contract_details">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center"><FileSignature size={14} /></span>
          <div>
            <p className="text-[13px] font-black text-slate-800">Contract</p>
            <p className="text-[11px] text-slate-500">{existing ? 'Saved in Monthly Clients → Contracts. Changes here update it.' : 'Optional. Filled in → saved in Monthly Clients → Contracts.'}</p>
          </div>
        </div>
        {renewal && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Renews {formatDate(renewal)}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Input name="contract_service" label="Service" list="contract-services" placeholder="e.g. Regular Cleaning" value={value.serviceType} onChange={e => set({ serviceType: e.target.value })} />
          <datalist id="contract-services">{SERVICES.map(s => <option key={s} value={s} />)}</datalist>
        </div>
        <Input name="contract_amount" label="Contract Amount (AED)" type="number" min={0} step="any" placeholder="e.g. 1800" value={value.amount || ''} onChange={e => set({ amount: Math.max(0, Number(e.target.value) || 0) })} />
        <Select name="contract_frequency" label="Billing" value={value.frequency} onChange={e => set({ frequency: e.target.value as ContractDetails['frequency'] })}>
          <option value="monthly">Monthly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="weekly">Weekly</option>
        </Select>
        <Input name="contract_start" label="Contract Start" type="date" value={value.startDate} onChange={e => set({ startDate: e.target.value })} />
      </div>
      <Input name="contract_notes" label="Contract Notes" placeholder="e.g. 4 visits a week, material included" value={value.notes} onChange={e => set({ notes: e.target.value })} />
    </div>
  )
}
