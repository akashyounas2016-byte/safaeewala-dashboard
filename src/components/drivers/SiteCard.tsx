import { Clock, MapPin, Users } from 'lucide-react'
import type { Employee } from '@/types'
import type { RouteSite } from '@/lib/driverRoutes'

/** One colour-coded stop: the site, its cleaners, drop and pick-up time (R-DRV-01) */
export function SiteCard({ site, index, drivers, driverId, onAssign }: {
  site: RouteSite
  index: number
  drivers?: Employee[]
  driverId?: string
  onAssign?: (driverId: string) => void
}) {
  const c = site.color
  return (
    <div className={`rounded-2xl border-2 ${c.border} ${c.bg} p-3.5 flex flex-col gap-2`}>
      <div className="flex items-start gap-2">
        <span className={`w-6 h-6 rounded-full ${c.dot} text-white text-[11px] font-black flex items-center justify-center shrink-0`}>{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-[13.5px] font-black ${c.text} leading-tight`}>{site.name}</p>
          <p className="text-[11.5px] text-slate-600 flex items-center gap-1 mt-0.5 truncate" title={site.address}>
            <MapPin size={11} className="shrink-0" /> {[site.area, site.address !== site.name ? site.address : ''].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[12px] font-bold text-slate-700">
        <span className="flex items-center gap-1"><Clock size={12} /> Drop {site.dropTime || '—'}</span>
        <span className="flex items-center gap-1"><Clock size={12} /> Pick-up {site.pickupTime || '—'}</span>
      </div>
      <div className="flex items-start gap-1.5">
        <Users size={13} className="text-slate-500 mt-0.5 shrink-0" />
        <div className="flex flex-wrap gap-1">
          {site.cleaners.map(n => <span key={n} className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-800">{n}</span>)}
          {site.cleaners.length === 0 && <span className="text-[11.5px] text-slate-400">No cleaner</span>}
        </div>
      </div>
      {(site.payment || site.remarks) && (
        <p className="text-[11.5px] text-slate-600">{[site.payment, site.remarks].filter(Boolean).join(' · ')}</p>
      )}
      {drivers && onAssign && (
        <select value={driverId || ''} onChange={e => onAssign(e.target.value)}
          className="mt-1 w-full px-2.5 py-1.5 text-[12px] font-semibold border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-emerald-500">
          <option value="">— Not assigned —</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select>
      )}
    </div>
  )
}
