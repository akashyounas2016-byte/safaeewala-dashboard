import { ChevronLeft, ChevronRight, Clock, Copy, Phone } from 'lucide-react'
import type { FluentFormLead, LeadStatus } from '@/types'

export const LEAD_STAGES: { status: LeadStatus; label: string; tone: string }[] = [
  { status: 'new',       label: 'New',       tone: 'border-sky-300 bg-sky-50/60' },
  { status: 'contacted', label: 'Contacted', tone: 'border-indigo-300 bg-indigo-50/60' },
  { status: 'quoted',    label: 'Quoted',    tone: 'border-amber-300 bg-amber-50/60' },
  { status: 'converted', label: 'Converted', tone: 'border-emerald-300 bg-emerald-50/60' },
  { status: 'lost',      label: 'Lost',      tone: 'border-slate-300 bg-slate-50' },
]

const hoursBetween = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000)
const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`)

/** Response time: how long a lead waited before its first status change (UX-23) */
export function responseInfo(lead: FluentFormLead & { responded_at?: string }): { text: string; late: boolean } | null {
  if (!lead.created_at) return null
  if (lead.status === 'new') {
    const h = hoursBetween(lead.created_at, new Date().toISOString())
    return { text: `waiting ${fmtHours(h)}`, late: h > 4 }
  }
  if (lead.responded_at) {
    const h = hoursBetween(lead.created_at, lead.responded_at)
    return { text: `answered in ${fmtHours(h)}`, late: h > 4 }
  }
  return null
}

const phoneKey = (p?: string) => (p || '').replace(/\D/g, '').slice(-8)

/**
 * Leads that repeat an earlier lead's phone within 7 days → id of that earlier lead (UX-24)
 */
export function findDuplicateLeads(leads: FluentFormLead[]): Map<string, FluentFormLead> {
  const dup = new Map<string, FluentFormLead>()
  const byPhone = new Map<string, FluentFormLead[]>()
  ;[...leads].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')).forEach(l => {
    const k = phoneKey(l.phone || l.whatsapp)
    if (k.length < 7) return
    const earlier = (byPhone.get(k) || []).find(e => hoursBetween(e.created_at, l.created_at) <= 7 * 24)
    if (earlier) dup.set(l.id, earlier)
    byPhone.set(k, [...(byPhone.get(k) || []), l])
  })
  return dup
}

/** Pipeline board new → contacted → quoted → converted / lost (UX-23) */
export function LeadsKanban({ leads, duplicates, onMove, onOpen }: {
  leads: (FluentFormLead & { responded_at?: string })[]
  duplicates: Map<string, FluentFormLead>
  onMove: (id: string, status: LeadStatus) => void
  onOpen: (lead: FluentFormLead) => void
}) {
  return (
    <div className="overflow-x-auto p-4">
      <div className="grid grid-cols-5 gap-3 min-w-[1000px]">
        {LEAD_STAGES.map((stage, si) => {
          const col = leads.filter(l => l.status === stage.status)
          return (
            <div key={stage.status} className={`rounded-2xl border ${stage.tone} p-2.5 min-h-[200px]`}>
              <p className="text-[11.5px] font-black uppercase tracking-wider text-slate-600 px-1 mb-2">{stage.label} · {col.length}</p>
              <div className="space-y-2">
                {col.map(l => {
                  const resp = responseInfo(l)
                  const dup = duplicates.get(l.id)
                  return (
                    <div key={l.id} className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs">
                      <button type="button" onClick={() => onOpen(l)} className="text-left w-full cursor-pointer">
                        <p className="font-bold text-[12.5px] text-slate-800 truncate">{l.client_name || 'Guest Client'}</p>
                        <p className="text-[11px] text-slate-500 truncate">{l.service || l.category}</p>
                      </button>
                      {l.phone && <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5"><Phone size={10} /> {l.phone}</p>}
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        {resp && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${resp.late ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                            <Clock size={9} /> {resp.text}
                          </span>
                        )}
                        {dup && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 flex items-center gap-1" title={`Same phone as ${dup.client_name} on ${dup.created_at?.split('T')[0]}`}>
                            <Copy size={9} /> Duplicate?
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <button type="button" disabled={si === 0} onClick={() => onMove(l.id, LEAD_STAGES[si - 1].status)}
                          className="p-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 cursor-pointer" title="Move back">
                          <ChevronLeft size={12} />
                        </button>
                        <button type="button" disabled={si === LEAD_STAGES.length - 1} onClick={() => onMove(l.id, LEAD_STAGES[si + 1].status)}
                          className="p-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 cursor-pointer" title="Move forward">
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
