import { useState } from 'react'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import { cleanAddresses, type ClientAddress } from '@/lib/clientAddress'

/**
 * R-CLI-09: more addresses of one client (another villa, office, …). Kept in a hidden field `addresses_json`
 * of the surrounding form, so the form's own submit reads them like every other field.
 */
export function AddressesEditor({ initial }: { initial?: ClientAddress[] | null }) {
  const [list, setList] = useState<ClientAddress[]>(() => cleanAddresses(initial))
  const set = (i: number, patch: Partial<ClientAddress>) => setList(p => p.map((a, k) => (k === i ? { ...a, ...patch } : a)))
  return (
    <div className="space-y-2" data-field="addresses">
      <input type="hidden" name="addresses_json" value={JSON.stringify(list)} readOnly />
      {list.map((a, i) => (
        <div key={a.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50/70 border border-slate-200 rounded-xl p-2">
          <input value={a.label} onChange={e => set(i, { label: e.target.value })} placeholder="Label (e.g. Office, Villa 2)" aria-label="Address label"
            className="md:col-span-3 h-9 px-3 text-[12.5px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-500" />
          <input value={a.address} onChange={e => set(i, { address: e.target.value })} placeholder="Address (building, villa, apartment)" aria-label="Address"
            className="md:col-span-5 h-9 px-3 text-[12.5px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-500" />
          <input value={a.area || ''} onChange={e => set(i, { area: e.target.value })} placeholder="Area" aria-label="Area"
            className="md:col-span-3 h-9 px-3 text-[12.5px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-500" />
          <button type="button" onClick={() => setList(p => p.filter((_, k) => k !== i))} title="Remove this address" aria-label="Remove address"
            className="md:col-span-1 h-9 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center cursor-pointer">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setList(p => [...p, { id: `addr-${Date.now().toString(36)}`, label: '', address: '', area: '' }])}
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-teal-700 hover:text-teal-900 px-2.5 py-1.5 rounded-lg border border-dashed border-teal-300 hover:bg-teal-50 cursor-pointer">
        <Plus size={13} /> <MapPin size={12} /> Add another address
      </button>
    </div>
  )
}
