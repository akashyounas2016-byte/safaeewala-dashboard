import type { LucideIcon } from 'lucide-react'

/**
 * UX-106: the Daily Job Sheet KPI card (white, coloured uppercase label, solid icon tile, chip),
 * shared by Analytics, Reports and Payments. A long title wraps to a 2nd line beside the icon (UX-101).
 */
export interface KpiCardProps {
  label: string
  value: React.ReactNode
  sub?: string
  icon: LucideIcon
  /** e.g. 'text-blue-700' */
  labelColor: string
  /** e.g. 'bg-[#2563eb] shadow-blue-500/25' */
  iconSolid: string
  chip?: string
  chipTone?: 'up' | 'down' | 'warn' | 'plain'
  active?: boolean
  onClick?: () => void
  title?: string
}

const CHIP: Record<NonNullable<KpiCardProps['chipTone']>, string> = {
  up: 'bg-emerald-50 text-emerald-700',
  down: 'bg-red-50 text-red-600',
  warn: 'bg-amber-50 text-amber-700',
  plain: 'bg-slate-100 text-slate-600',
}

export function KpiCard({ label, value, sub, icon: Icon, labelColor, iconSolid, chip, chipTone = 'plain', active, onClick, title }: KpiCardProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': !!active } : {})}
      title={title}
      className={`group relative text-left rounded-[16px] p-4 sm:p-5 transition-all duration-200 flex flex-col justify-between w-full ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1' : ''
      } ${active ? 'bg-emerald-50/50 border-2 border-emerald-500' : 'bg-white border border-[#E2E5E0] hover:border-[#C9D2CC]'} shadow-[0_1px_2px_rgba(20,32,27,0.04)]`}
    >
      <div className="flex items-start justify-between gap-2 mb-2 w-full">
        <span className={`text-[11px] font-bold tracking-wider uppercase leading-[1.3] line-clamp-2 break-words min-w-0 ${labelColor}`}>{label}</span>
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-md transition-transform duration-200 group-hover:scale-105 ${iconSolid}`}>
          <Icon size={18} strokeWidth={2.2} />
        </div>
      </div>
      <div className="w-full">
        <p className="text-[23px] sm:text-[26px] font-black tracking-tight leading-tight truncate text-[#111827]">{value}</p>
        {sub && <p className="text-[11px] sm:text-[11.5px] font-medium mt-1 truncate text-slate-500">{sub}</p>}
        {chip && <span className={`inline-block mt-1.5 text-[10.5px] font-bold px-2 py-0.5 rounded-full truncate max-w-full ${CHIP[chipTone]}`}>{chip}</span>}
      </div>
    </Tag>
  )
}

/** A white widget with the Daily Job Sheet header (icon tile, title, note) */
export function Widget({ title, note, icon: Icon, children, className = '', actions }: { title: string; note?: string; icon: LucideIcon; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col ${className}`}>
      <header className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0"><Icon size={17} /></span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-[#111827] leading-tight truncate">{title}</h3>
            {note && <p className="text-[11.5px] text-slate-500 leading-tight truncate">{note}</p>}
          </div>
        </div>
        {actions}
      </header>
      <div className="p-5 flex-1">{children}</div>
    </section>
  )
}
