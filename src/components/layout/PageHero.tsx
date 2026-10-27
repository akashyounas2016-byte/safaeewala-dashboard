import { useState, useEffect, useRef } from 'react'
import { Search, Bell, Plus, X } from 'lucide-react'
import { useLayout } from './Layout'

export interface HeroNotification {
  id: string
  title: string
  detail?: string
  tone?: 'danger' | 'warning' | 'info'
  onClick?: () => void
}

const toneDot: Record<NonNullable<HeroNotification['tone']>, string> = {
  danger:  'bg-rose-500',
  warning: 'bg-amber-500',
  info:    'bg-sky-500',
}

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
  /** When given, the bell opens a panel listing these alerts */
  notifications?: HeroNotification[]
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
  notifications,
}: PageHeroProps) {
  const { openMenu } = useLayout()
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!bellOpen) return
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [bellOpen])

  // Clean any leading "+" sign to prevent double "+" icons
  const cleanActionLabel = actionLabel ? actionLabel.replace(/^\+\s*/, '') : ''

  return (
    <section className="gradient-card rounded-[24px] px-7 py-6 text-white shadow-[0_8px_32px_rgba(15,23,42,0.28)] ring-1 ring-black/10 mb-7 relative">
      {/* Glow (clipped separately so the notification panel can overflow the hero) */}
      <div className="absolute inset-0 rounded-[24px] overflow-hidden pointer-events-none">
        <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl" />
      </div>

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
          <div ref={bellRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => notifications && setBellOpen(o => !o)}
              className="relative w-11 h-11 rounded-2xl border border-white/10 bg-white/10 flex items-center justify-center backdrop-blur-sm hover:bg-white/20 transition-colors shrink-0 cursor-pointer"
              title={notifications ? `${notifications.length} notifications` : 'Notifications'}
            >
              <Bell size={16} className="text-white/80" />
              {notifications ? (
                notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] font-black text-white flex items-center justify-center ring-2 ring-white/20">
                    {notifications.length > 99 ? '99+' : notifications.length}
                  </span>
                )
              ) : (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>

            {bellOpen && notifications && (
              <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white text-slate-800 rounded-2xl border border-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.18)] z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <p className="text-[13px] font-black text-slate-900">Notifications ({notifications.length})</p>
                  <button
                    type="button"
                    onClick={() => setBellOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                    title="Close"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[12px] text-slate-400 font-medium">No alerts right now.</p>
                  ) : notifications.map(n => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => { n.onClick?.(); setBellOpen(false) }}
                      className="w-full text-left px-4 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${toneDot[n.tone || 'info']}`} />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-bold text-slate-800 truncate">{n.title}</span>
                        {n.detail && <span className="block text-[11px] text-slate-500 mt-0.5">{n.detail}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  )
}
