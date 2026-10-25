import { Search, Bell, Plus } from 'lucide-react'
import { useLayout } from './Layout'

interface PageHeroProps {
  title: string
  subtitle: string
  statusChip?: string
  actionLabel?: string
  onAction?: () => void
  showSearch?: boolean
  searchPlaceholder?: string
  searchValue?: string
  onSearch?: (value: string) => void
  actions?: React.ReactNode
}

export function PageHero({
  title,
  subtitle,
  statusChip,
  actionLabel = 'New Booking',
  onAction,
  showSearch = true,
  searchPlaceholder = 'Search…',
  searchValue = '',
  onSearch,
  actions,
}: PageHeroProps) {
  const { openMenu } = useLayout()

  // Clean any leading "+" sign to prevent double "+" icons
  const cleanActionLabel = actionLabel ? actionLabel.replace(/^\+\s*/, '') : ''

  return (
    <section className="gradient-card rounded-[24px] px-7 py-6 text-white shadow-[0_8px_32px_rgba(15,23,42,0.28)] ring-1 ring-black/10 mb-7 relative overflow-hidden">
      {/* Glow */}
      <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">

        {/* Left: title + subtitle */}
        <div className="min-w-0 flex flex-col justify-center">
          {/* Mobile hamburger */}
          <button
            onClick={openMenu}
            className="lg:hidden mb-3 w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 border border-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          <h2 className="text-3xl font-bold mb-2 tracking-tight">{title}</h2>

          <div className="flex flex-wrap items-center gap-2 text-white/80 text-sm">
            <span>{subtitle}</span>
            {statusChip && (
              <span className="bg-emerald-400/20 border border-emerald-300/20 px-3 py-1 rounded-full text-xs font-semibold text-white">
                {statusChip}
              </span>
            )}
          </div>
        </div>

        {/* Right: search + custom actions + CTA + bell */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap my-auto">

          {/* Search */}
          {showSearch && (
          <div className="flex items-center gap-3 bg-white/10 border border-white/10 rounded-2xl px-4 h-11 backdrop-blur-sm w-full sm:w-[280px] lg:w-[320px]">
            <Search size={14} className="text-white/60 shrink-0" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearch?.(e.target.value)}
              className="bg-transparent outline-none flex-1 text-sm placeholder:text-white/50 text-white"
            />
            <kbd className="hidden sm:inline text-[10px] border border-white/20 rounded px-1.5 py-0.5 text-white/50 font-mono">
              ⌘K
            </kbd>
          </div>
          )}

          {/* Custom actions slot (e.g. Add Client, New Contract) */}
          {actions}

          {/* Primary CTA (e.g. Record Payment / New Booking) */}
          {cleanActionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="h-11 px-5 rounded-2xl bg-white text-emerald-700 font-semibold text-sm shadow-lg hover:bg-emerald-50 transition-colors shrink-0 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>{cleanActionLabel}</span>
            </button>
          )}

          {/* Notification bell */}
          <button
            type="button"
            className="relative w-11 h-11 rounded-2xl border border-white/10 bg-white/10 flex items-center justify-center backdrop-blur-sm hover:bg-white/20 transition-colors shrink-0 cursor-pointer"
            title="Notifications"
          >
            <Bell size={16} className="text-white/80" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

        </div>
      </div>
    </section>
  )
}
