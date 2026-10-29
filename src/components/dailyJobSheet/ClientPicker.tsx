import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Phone, Search, X } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { calcClientPendingBalance, getAssignableClients } from '@/lib/clientDataSync'
import type { Client } from '@/types'

const MAX_ROWS = 50

/**
 * Client search used by the Daily Job Sheet money pop-ups (Pending Received, Advance).
 * The list is the same live client list the Clients screen shows (registered + job-sheet clients,
 * no demo data), sorted by their real outstanding balance — so it is always in sync.
 */
export function ClientPicker({ selected, onSelect, search, onSearch, accent = 'emerald', allowCustom = true, label = 'Client *' }: {
  selected: Client | null
  onSelect: (c: Client | null) => void
  search: string
  onSearch: (s: string) => void
  accent?: 'emerald' | 'amber'
  allowCustom?: boolean
  label?: string
}) {
  const { clients, dailyJobs } = useData()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pool = useMemo(() => getAssignableClients(clients), [clients])
  // Real balance per client (opening balance + unpaid jobs − receipts); only computed while the list is open
  const dues = useMemo(() => {
    const m = new Map<string, number>()
    if (open) pool.forEach(c => m.set(c.id, calcClientPendingBalance(c, dailyJobs)))
    return m
  }, [open, pool, dailyJobs])
  const selectedDue = useMemo(() => (selected ? calcClientPendingBalance(selected, dailyJobs) : 0), [selected, dailyJobs])

  const matches = useMemo(() => {
    const q = search.toLowerCase().trim()
    const list = q
      ? pool.filter(c => [c.full_name, c.phone, c.whatsapp, c.building_name, c.apartment, c.area]
          .some(v => (v || '').toLowerCase().includes(q)))
      : [...pool].sort((a, b) => (dues.get(b.id) || 0) - (dues.get(a.id) || 0) || a.full_name.localeCompare(b.full_name))
    return list
  }, [pool, search, dues])

  const ring = accent === 'amber' ? 'focus:border-amber-500' : 'focus:border-emerald-500'
  const hover = accent === 'amber' ? 'hover:bg-amber-50/60' : 'hover:bg-emerald-50/60'

  if (selected) {
    return (
      <div>
        <label className="block text-[12px] font-bold text-slate-700 mb-1">{label}</label>
        <div className={`p-3.5 rounded-2xl border shadow-2xs ${accent === 'amber' ? 'bg-gradient-to-r from-amber-50/80 to-slate-50 border-amber-200' : 'bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-slate-50 border-emerald-200'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-xl text-white font-bold flex items-center justify-center text-[13px] shrink-0 ${accent === 'amber' ? 'bg-amber-600' : 'bg-emerald-600'}`}>
                {selected.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="text-[14px] font-bold text-slate-900 leading-tight truncate">{selected.full_name}</h4>
                {(selected.phone || selected.whatsapp) && (
                  <p className="text-[11.5px] text-slate-500 flex items-center gap-1 mt-0.5"><Phone size={11} /> {selected.phone || selected.whatsapp}</p>
                )}
              </div>
            </div>
            <button type="button" onClick={() => { onSelect(null); onSearch(''); setOpen(true) }}
              className="text-[11px] font-bold text-slate-500 hover:text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50 border border-slate-200 bg-white cursor-pointer">
              Change Client
            </button>
          </div>
          {(selected.building_name || selected.area || selected.apartment) && (
            <p className="mt-2.5 pt-2 border-t border-slate-200/70 text-[11.5px] text-slate-600 flex items-center gap-1.5">
              <MapPin size={11} className="text-slate-400 shrink-0" />
              {[selected.building_name, selected.apartment, selected.area, selected.city].filter(Boolean).join(', ')}
            </p>
          )}
          <div className="mt-3 p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Outstanding balance</span>
              <span className={`text-[18px] font-black ${selectedDue > 0 ? 'text-red-600' : 'text-emerald-700'}`}>AED {selectedDue.toLocaleString()}</span>
            </div>
            <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${selectedDue > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {selectedDue > 0 ? 'Dues pending' : 'No dues'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <label className="block text-[12px] font-bold text-slate-700 mb-1">{label}</label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          required
          autoFocus
          placeholder="Search client name, phone, building, apartment…"
          value={search}
          onChange={e => { onSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className={`w-full text-[13px] pl-9 pr-8 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none ${ring} font-medium`}
        />
        {search && (
          <button type="button" onClick={() => { onSearch(''); setOpen(true) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200">
            <X size={12} />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-[#E4E8EC] rounded-2xl shadow-xl max-h-72 overflow-y-auto divide-y divide-[#E4E8EC]/70">
          <div className="p-2 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider sticky top-0">
            {search.trim() ? `${matches.length} matching clients` : `${pool.length} clients · highest balance first`}
          </div>
          {matches.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-[12px]">
              No client found on the Clients screen{allowCustom && search.trim() ? ` — "${search.trim()}" will be saved as typed` : ''}.
            </div>
          ) : (
            matches.slice(0, MAX_ROWS).map(c => {
              const due = dues.get(c.id) || 0
              return (
                <button key={c.id} type="button" onClick={() => { onSelect(c); onSearch(c.full_name); setOpen(false) }}
                  className={`w-full p-3 text-left ${hover} flex items-center justify-between gap-3 cursor-pointer`}>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-800 truncate">{c.full_name}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {[c.building_name, c.apartment, c.area].filter(Boolean).join(', ') || c.phone || 'No address'}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${due > 0 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-600'}`}>
                    {due > 0 ? `Due: AED ${due.toLocaleString()}` : 'No due'}
                  </span>
                </button>
              )
            })
          )}
          {matches.length > MAX_ROWS && (
            <p className="p-2 text-center text-[11px] text-slate-400">Showing {MAX_ROWS} of {matches.length} — type to narrow down</p>
          )}
          {allowCustom && search.trim() && (
            <button type="button" onClick={() => setOpen(false)}
              className="w-full p-2.5 text-center bg-slate-50 text-[12px] font-bold text-slate-700 hover:bg-slate-100">
              Use "{search.trim()}" as typed (not on the Clients screen)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
