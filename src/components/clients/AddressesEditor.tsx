import { useState } from 'react'
import { Check, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { cleanAddresses, type ClientAddress } from '@/lib/clientAddress'

/**
 * R-CLI-09 / UX-164: more addresses of one client (another villa, office, …). Saved addresses are a clean list
 * (label · address · area) with an Edit (pencil) and a Delete icon; Edit or "Add another address" opens the row's
 * fields. Kept in a hidden field `addresses_json` of the surrounding form, read by its own submit.
 */
export function AddressesEditor({ initial }: { initial?: ClientAddress[] | null }) {
  const [list, setList] = useState<ClientAddress[]>(() => cleanAddresses(initial))
  const [editing, setEditing] = useState<Set<string>>(() => new Set())
  const set = (id: string, patch: Partial<ClientAddress>) => setList(p => p.map(a => (a.id === id ? { ...a, ...patch } : a)))
  const openRow = (id: string, on: boolean) => setEditing(p => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n })
  const remove = (id: string) => { setList(p => p.filter(a => a.id !== id)); openRow(id, false) }
  const done = (a: ClientAddress) => (a.address.trim() ? openRow(a.id, false) : remove(a.id)) // an empty row is dropped

  return (
    <div className="space-y-2" data-field="addresses">
      <input type="hidden" name="addresses_json" value={JSON.stringify(list.filter(a => a.address.trim()))} readOnly />
      {list.length > 0 && <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">Other addresses</p>}
      {list.map(a => editing.has(a.id) ? (
        <div key={a.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-teal-50/40 border border-teal-200 rounded-xl p-2">
          <input value={a.label} onChange={e => set(a.id, { label: e.target.value })} placeholder="Label (e.g. Office, Villa 2)" aria-label="Address label"
            className="md:col-span-3 h-9 px-3 text-[12.5px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-500" />
          <input value={a.address} onChange={e => set(a.id, { address: e.target.value })} placeholder="Address (building, villa, apartment)" aria-label="Address"
            className="md:col-span-5 h-9 px-3 text-[12.5px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-500" />
          <input value={a.area || ''} onChange={e => set(a.id, { area: e.target.value })} placeholder="Area" aria-label="Area"
            className="md:col-span-3 h-9 px-3 text-[12.5px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-500" />
          <button type="button" onClick={() => done(a)} title="Done" aria-label="Done"
            className="md:col-span-1 h-9 rounded-lg bg-teal-600 hover:bg-teal-700 text-white inline-flex items-center justify-center cursor-pointer">
            <Check size={14} />
          </button>
        </div>
      ) : (
        <div key={a.id} className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <MapPin size={14} className="text-teal-600 shrink-0" />
          <div className="flex-1 min-w-0 text-[12.5px]">
            {a.label && <span className="font-bold text-slate-800 mr-1.5">{a.label}</span>}
            <span className="text-slate-700">{a.address}</span>
            {a.area && <span className="text-slate-400"> · {a.area}</span>}
          </div>
          <button type="button" onClick={() => openRow(a.id, true)} title="Edit this address" aria-label="Edit address"
            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center cursor-pointer"><Pencil size={13} /></button>
          <button type="button" onClick={() => remove(a.id)} title="Remove this address" aria-label="Remove address"
            className="w-8 h-8 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center cursor-pointer"><Trash2 size={13} /></button>
        </div>
      ))}
      <button type="button" onClick={() => { const id = `addr-${Date.now().toString(36)}`; setList(p => [...p, { id, label: '', address: '', area: '' }]); openRow(id, true) }}
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-teal-700 hover:text-teal-900 px-2.5 py-1.5 rounded-lg border border-dashed border-teal-300 hover:bg-teal-50 cursor-pointer">
        <Plus size={13} /> <MapPin size={12} /> Add another address
      </button>
    </div>
  )
}
