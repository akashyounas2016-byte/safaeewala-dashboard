import { Check, Clock, MessageCircle } from 'lucide-react'
import type { RouteSite } from '@/lib/driverRoutes'
import type { DayPlan } from '@/lib/driverPlans'

/**
 * R-APP-04: the driver's pickup manifest for one stop — each cleaner with Dropped / Picked up (time saved in the day
 * plan, which the office sees too), and "Tell I'm late" (WhatsApp text the driver sends to whom it concerns).
 */
export function DriverManifest({ site, plan, onChange, canEdit }: {
  site: RouteSite
  plan: DayPlan
  onChange: (fn: (p: DayPlan) => DayPlan) => void
  canEdit: boolean
}) {
  const marks = plan.manifest?.[site.key] || {}
  const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }) : '')
  const toggle = (cleaner: string, what: 'dropped' | 'picked') => onChange(p => {
    const k = cleaner.trim().toLowerCase()
    const siteMarks = { ...(p.manifest?.[site.key] || {}) }
    const cur = { ...(siteMarks[k] || {}) }
    if (cur[what]) delete cur[what]; else cur[what] = new Date().toISOString()
    siteMarks[k] = cur
    return { ...p, manifest: { ...(p.manifest || {}), [site.key]: siteMarks } }
  })
  const lateText = encodeURIComponent(`Safaeewala driver: I am running about 15 minutes late for ${site.name}${site.area ? ` (${site.area})` : ''}. Sorry for the wait.`)
  const done = site.cleaners.filter(c => marks[c.trim().toLowerCase()]?.picked).length
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-1.5" aria-label={`Manifest ${site.name}`}>
      <div className="flex items-center justify-between text-[11.5px] font-bold text-slate-500 px-0.5">
        <span>Manifest · {site.cleaners.length} cleaner{site.cleaners.length === 1 ? '' : 's'}</span>
        <span>{done}/{site.cleaners.length} picked up</span>
      </div>
      {site.cleaners.map(c => {
        const m = marks[c.trim().toLowerCase()] || {}
        const btn = (on: boolean) => `flex-1 min-h-[38px] rounded-lg text-[12px] font-bold flex items-center justify-center gap-1 border cursor-pointer disabled:opacity-50 ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-700'}`
        return (
          <div key={c} className="flex items-center gap-2">
            <span className="w-[38%] min-w-0 text-[12.5px] font-semibold text-slate-800 truncate" title={c}>{c}</span>
            <button type="button" disabled={!canEdit} onClick={() => toggle(c, 'dropped')} aria-pressed={!!m.dropped} className={btn(!!m.dropped)}>
              {m.dropped ? <><Check size={13} /> Dropped {time(m.dropped)}</> : 'Dropped'}
            </button>
            <button type="button" disabled={!canEdit} onClick={() => toggle(c, 'picked')} aria-pressed={!!m.picked} className={btn(!!m.picked)}>
              {m.picked ? <><Check size={13} /> Picked {time(m.picked)}</> : 'Picked up'}
            </button>
          </div>
        )
      })}
      {canEdit && (
        <a href={`https://wa.me/?text=${lateText}`} target="_blank" rel="noopener noreferrer"
          className="min-h-[38px] rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-[12px] font-bold flex items-center justify-center gap-1.5">
          <Clock size={13} /> Tell I'm late <MessageCircle size={13} />
        </a>
      )}
    </div>
  )
}
