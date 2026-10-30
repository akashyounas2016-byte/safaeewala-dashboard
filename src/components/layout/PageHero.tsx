import { useState, useEffect, useRef } from 'react'
import { Search, Bell, Plus, X, CheckCheck, Check, Trash2 } from 'lucide-react'
import { useLayout } from './Layout'

export interface HeroNotification {
  id: string
  title: string
  detail?: string
  tone?: 'danger' | 'warning' | 'info' | 'success'
  time?: string
  read?: boolean
  onClick?: () => void
  onDelete?: () => void
}

const toneDot: Record<NonNullable<HeroNotification['tone']>, string> = {
  danger:  'bg-rose-500',
  warning: 'bg-amber-500',
  info:    'bg-sky-500',
  success: 'bg-emerald-500',
}

interface PageHeroProps {
  title: string
  subtitle: string
  statusChip?: string
  liveTag?: string
  actionLabel?: string
  onAction?: () => void
  showSearch?: boolean
  searchPlaceholder?: string
  searchValue?: string
  onSearch?: (value: string) => void
  actions?: React.ReactNode
  /** When given, the bell opens a panel listing these alerts */
  notifications?: HeroNotification[]
  onMarkNotificationRead?: (id: string) => void
  onMarkAllNotificationsRead?: () => void
  onDeleteNotification?: (id: string) => void
  onClearAllNotifications?: () => void
}

export function PageHero({
  title,
  subtitle,
  statusChip,
  liveTag,
  actionLabel = 'New Booking',
  onAction,
  showSearch = true,
  searchPlaceholder = 'Search…',
  searchValue = '',
  onSearch,
  actions,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onDeleteNotification,
  onClearAllNotifications,
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

  const unreadCount = notifications
    ? notifications.filter(n => !n.read).length
    : 0

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

          {liveTag && (
            <div className="mb-2 inline-flex items-center">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white text-emerald-900 font-extrabold text-[10.5px] rounded-full shadow-md border border-white/90 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                </span>
                <span>{liveTag}</span>
              </span>
            </div>
          )}

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
              title={notifications ? `${notifications.length} notifications (${unreadCount} unread)` : 'Notifications'}
            >
              <Bell size={16} className="text-white/80" />
              {notifications && unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 bg-red-500 rounded-full text-[10px] font-black text-white flex items-center justify-center ring-2 ring-emerald-900 shadow-sm animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : notifications && notifications.length > 0 ? (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-emerald-900" />
              ) : null}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-2rem)] bg-white text-slate-800 rounded-2xl border border-slate-200 shadow-[0_20px_50px_rgba(15,23,42,0.22)] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-black text-slate-900">Notifications</p>
                    {notifications && notifications.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {notifications && unreadCount > 0 && onMarkAllNotificationsRead && (
                      <button
                        type="button"
                        onClick={onMarkAllNotificationsRead}
                        className="text-[11px] font-bold text-teal-700 hover:text-teal-900 hover:bg-teal-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        title="Mark all notifications as read"
                      >
                        <CheckCheck size={13} />
                        <span>Read All</span>
                      </button>
                    )}
                    {notifications && notifications.length > 0 && onClearAllNotifications && (
                      <button
                        type="button"
                        onClick={onClearAllNotifications}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                        title="Clear all notifications"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setBellOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer transition-colors"
                      title="Close"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Notifications List */}
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                  {!notifications || notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center mx-auto mb-2">
                        <Bell size={18} />
                      </div>
                      <p className="text-[12.5px] font-bold text-slate-700">All caught up!</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">No alerts or notifications right now.</p>
                    </div>
                  ) : notifications.map(n => {
                    const isUnread = !n.read
                    return (
                      <div
                        key={n.id}
                        className={`group px-4 py-3 flex items-start gap-3 transition-colors ${
                          isUnread ? 'bg-teal-50/30 hover:bg-teal-50/60' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${toneDot[n.tone || 'info']}`} />
                        <div
                          className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            if (isUnread && onMarkNotificationRead) onMarkNotificationRead(n.id)
                            n.onClick?.()
                            setBellOpen(false)
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[12.5px] truncate block ${
                              isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
                            }`}>
                              {n.title}
                            </span>
                            {n.time && (
                              <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                                {n.time}
                              </span>
                            )}
                          </div>
                          {n.detail && (
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                              {n.detail}
                            </p>
                          )}
                        </div>

                        {/* Item Actions */}
                        <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                          {isUnread && onMarkNotificationRead && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onMarkNotificationRead(n.id)
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-teal-700 hover:bg-teal-100/50 transition-colors cursor-pointer"
                              title="Mark as read"
                            >
                              <Check size={12} strokeWidth={2.5} />
                            </button>
                          )}
                          {(n.onDelete || onDeleteNotification) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                n.onDelete ? n.onDelete() : onDeleteNotification?.(n.id)
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete notification"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  )
}
