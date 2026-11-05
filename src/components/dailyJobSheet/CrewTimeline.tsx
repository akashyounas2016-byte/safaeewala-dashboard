import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, UserPlus } from 'lucide-react'
import type { DailyJob } from '@/types'
import { blockPosition, OT_FROM_MIN, type CrewLane, type CrewTimeline as Timeline, type TimelineBlock } from '@/lib/crewTimeline'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

const COLLAPSED_KEY = 'safaeewala_crew_timeline_collapsed'
const MAX_ISSUES = 4

const STATE_TEXT: Record<CrewLane['state'], { color: string; avatar: string }> = {
  working:   { color: 'text-[#0B6B4F]', avatar: 'bg-[#D3EADF] text-[#0B4A3A]' },
  available: { color: 'text-[#5B6660]', avatar: 'bg-[#E7EAE5] text-[#14201B]' },
  absent:    { color: 'text-[#B42318]', avatar: 'bg-[#F6E0DE] text-[#7A1A12]' },
  leave:     { color: 'text-[#8A5300]', avatar: 'bg-[#FDF1DC] text-[#6B4100]' },
  open:      { color: 'text-[#8A5300]', avatar: 'bg-[#FDF1DC] text-[#6B4100]' },
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`

function laneNote(l: CrewLane): string {
  if (l.state === 'open') return `${l.blocks.length} job${l.blocks.length === 1 ? '' : 's'} need${l.blocks.length === 1 ? 's' : ''} a cleaner`
  if (l.state === 'working') return `Working · ${fmtHours(l.hours)}${l.blocks.some(b => b.clash) ? ' · clash' : ''}`
  if (l.state === 'absent') return 'Absent · marked'
  if (l.state === 'leave') return 'On leave · marked'
  return 'Available'
}

function blockStyle(b: TimelineBlock): React.CSSProperties {
  const base = b.open ? '#FDF1DC' : b.monthly ? '#D3EADF' : '#DCE5FB'
  const otFrom = b.endMin > OT_FROM_MIN ? Math.max(0, (OT_FROM_MIN - b.startMin) / (b.endMin - b.startMin) * 100) : null
  return {
    background: otFrom === null ? base : `linear-gradient(to right, ${base} ${otFrom}%, #FBE3C8 ${otFrom}%)`,
    border: b.clash ? '2px solid #B42318' : b.open ? '2px dashed #C98A1B' : '1px solid rgba(20,32,27,.06)',
    color: b.open ? '#6B4100' : b.monthly ? '#0B4A3A' : '#1E3A8A',
  }
}

/** UX-94: issues and the crew timeline of one day (V1 design) */
export function CrewTimeline({ timeline, onOpenJob, canEdit }: { timeline: Timeline; onOpenJob: (job: DailyJob) => void; canEdit: boolean }) {
  const [collapsed, setCollapsed] = useState(() => safeLocalStorageGet<boolean>(COLLAPSED_KEY, false))
  const [showAllIssues, setShowAllIssues] = useState(false)
  const toggle = () => { setCollapsed(v => { safeLocalStorageSet(COLLAPSED_KEY, !v); return !v }) }

  const { lanes, startMin, endMin, issues } = timeline
  if (lanes.length === 0) return null
  const free = lanes.filter(l => l.state === 'available').map(l => l.name)
  const hours: number[] = []
  for (let m = startMin + 60; m < endMin; m += 60) hours.push(m)
  const otLeft = OT_FROM_MIN < endMin ? blockPosition(OT_FROM_MIN, endMin, startMin, endMin).left : null
  const shownIssues = showAllIssues ? issues : issues.slice(0, MAX_ISSUES)

  return (
    <div className="space-y-3">
      {issues.length > 0 && (
        <section aria-label="Needs attention" className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {shownIssues.map((it, i) => (
            <div key={`${it.kind}-${it.job.id}-${i}`}
              className={`flex items-start gap-3 rounded-[14px] border px-3.5 py-3 ${it.kind === 'clash' ? 'bg-[#FDECEA] border-[#F5C6C0]' : 'bg-[#FDF1DC] border-[#F1D3A0]'}`}>
              {it.kind === 'clash'
                ? <AlertTriangle size={17} className="text-[#B42318] shrink-0 mt-0.5" />
                : <UserPlus size={17} className="text-[#8A5300] shrink-0 mt-0.5" />}
              <p className={`flex-1 text-[12.5px] ${it.kind === 'clash' ? 'text-[#7A1A12]' : 'text-[#6B4100]'}`}>
                <b>{it.kind === 'clash' ? `Clash · ${it.staff}` : 'No cleaner'}</b>{' '}{it.text}
                {it.kind === 'open' && free.length > 0 && <> Available: {free.slice(0, 3).join(', ')}{free.length > 3 ? '…' : ''}.</>}
              </p>
              {canEdit && (
                <button type="button" onClick={() => onOpenJob(it.job)}
                  className={`shrink-0 text-[12px] font-bold text-white px-3 py-1.5 rounded-[9px] cursor-pointer ${it.kind === 'clash' ? 'bg-[#B42318] hover:bg-[#931B12]' : 'bg-[#8A5300] hover:bg-[#6B4100]'}`}>
                  {it.kind === 'clash' ? 'Resolve' : 'Assign'}
                </button>
              )}
            </div>
          ))}
          {issues.length > MAX_ISSUES && (
            <button type="button" onClick={() => setShowAllIssues(v => !v)} className="lg:col-span-2 text-[12px] font-bold text-[#5B6660] hover:text-[#14201B] cursor-pointer">
              {showAllIssues ? 'Show fewer' : `Show all ${issues.length} issues`}
            </button>
          )}
        </section>
      )}

      <section aria-label="Crew timeline" className="bg-white border border-[#E2E5E0] rounded-[18px] overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap px-[18px] py-3.5 border-b border-[#E2E5E0]">
          <h2 className="text-[16px] font-extrabold text-[#14201B]">Crew timeline</h2>
          <div className="flex items-center gap-3.5 flex-wrap text-[12px] text-[#5B6660]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-[#D3EADF]" />Monthly</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-[#DCE5FB]" />Other jobs</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-[#FBE3C8]" />OT after 8 PM</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] border-2 border-[#B42318]" />Clash</span>
            <button type="button" onClick={toggle} aria-expanded={!collapsed}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#D5DAD3] text-[#14201B] font-bold hover:bg-[#FAFBF9] cursor-pointer">
              {collapsed ? <><ChevronDown size={13} /> Show</> : <><ChevronUp size={13} /> Hide</>}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="flex border-b border-[#E2E5E0] bg-[#FAFBF9]">
                <div className="w-[220px] shrink-0 px-[18px] py-2 text-[11px] font-bold tracking-[0.06em] uppercase text-[#5B6660]">Cleaner</div>
                <div className="flex-1 relative h-8">
                  {hours.map(m => (
                    <span key={m} className="absolute top-[9px] -translate-x-1/2 text-[11px] text-[#5B6660] tabular-nums"
                      style={{ left: `${blockPosition(m, m + 1, startMin, endMin).left}%` }}>
                      {String(Math.floor(m / 60) % 24).padStart(2, '0')}:00
                    </span>
                  ))}
                </div>
              </div>

              {lanes.map(l => {
                const st = STATE_TEXT[l.state]
                const idle = l.blocks.length === 0
                return (
                  <div key={l.name} className={`flex border-b border-[#EEF0EC] ${idle ? 'min-h-[48px]' : 'min-h-[62px]'}`}>
                    <div className="w-[220px] shrink-0 px-[18px] py-2 flex items-center gap-2.5">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${st.avatar}`}>{l.state === 'open' ? '?' : initials(l.name)}</span>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-bold text-[#14201B] truncate">{l.name}</p>
                        <p className={`text-[11.5px] font-semibold ${st.color}`}>{laneNote(l)}</p>
                      </div>
                    </div>
                    <div className="flex-1 relative"
                      style={{ backgroundImage: 'linear-gradient(to right, #F0F2EE 1px, transparent 1px)', backgroundSize: `${100 / Math.max(1, (endMin - startMin) / 60)}% 100%` }}>
                      {otLeft !== null && <div className="absolute inset-y-0 right-0 bg-[#FFF7EC]" style={{ left: `${otLeft}%` }} />}
                      {(l.state === 'absent' || l.state === 'leave') && (
                        <div className="absolute inset-x-3 inset-y-2 rounded-[10px] border border-dashed border-[#E3C9C6] flex items-center px-3.5 text-[12.5px] font-semibold text-[#8A2C22]"
                          style={{ background: 'repeating-linear-gradient(135deg, #F6F1F1, #F6F1F1 8px, #FFFFFF 8px, #FFFFFF 16px)' }}>
                          {l.state === 'leave' ? 'On leave · marked in Attendance' : 'Absent · marked in Attendance'}
                        </div>
                      )}
                      {l.state === 'available' && (
                        <div className="absolute inset-x-3 inset-y-2 rounded-[10px] border border-dashed border-[#C8D3CC] flex items-center px-3.5 text-[12.5px] text-[#5B6660]">
                          Available · no job assigned
                        </div>
                      )}
                      {l.blocks.map(b => {
                        const pos = blockPosition(b.startMin, b.endMin, startMin, endMin)
                        return (
                          <button key={`${b.job.id}-${b.startMin}`} type="button" onClick={() => onOpenJob(b.job)} disabled={!canEdit}
                            title={`${b.address} · ${b.start}–${b.end}${b.clash ? ' · clash' : ''}`}
                            className="absolute top-2 bottom-2 rounded-[10px] px-2.5 py-1.5 text-left overflow-hidden box-border cursor-pointer disabled:cursor-default hover:brightness-[0.97]"
                            style={{ left: `${pos.left}%`, width: `calc(${pos.width}% - 4px)`, ...blockStyle(b) }}>
                            <span className="block text-[12px] font-bold truncate">{b.address}</span>
                            <span className="block text-[11px] tabular-nums whitespace-nowrap">{b.start}–{b.end}{b.endMin > OT_FROM_MIN ? ` · OT ${((b.endMin - Math.max(b.startMin, OT_FROM_MIN)) / 60).toFixed(1)} h` : ''}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
