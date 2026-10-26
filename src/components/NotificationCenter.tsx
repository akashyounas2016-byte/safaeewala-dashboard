import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  X, AlertTriangle, AlertCircle, Clock, Package, DollarSign, Bell,
  ChevronLeft, ChevronRight, ArrowRight, EyeOff
} from 'lucide-react'
import { useNotifications, type AppNotification } from '@/store/NotificationContext'

const iconMap = {
  AlertTriangle,
  AlertCircle,
  Clock,
  Package,
  DollarSign,
}

export function NotificationCenter() {
  const { notifications } = useNotifications()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [slideKey, setSlideKey] = useState(0)
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next')

  const visibleNotifs = notifications.filter(n => !dismissed.has(n.id))
  const total = visibleNotifs.length

  // Keep index within bounds whenever visibleNotifs change
  useEffect(() => {
    if (total === 0) return
    if (currentIndex >= total) {
      setCurrentIndex(0)
      setSlideKey(k => k + 1)
    }
  }, [total, currentIndex])

  // Auto-scroll ticker effect (every 4.5 seconds)
  useEffect(() => {
    if (total <= 1 || isPaused) return

    const timer = setInterval(() => {
      setSlideDirection('next')
      setCurrentIndex(prev => (prev + 1) % total)
      setSlideKey(k => k + 1)
    }, 4500)

    return () => clearInterval(timer)
  }, [total, isPaused])

  if (total === 0) return null

  const safeIndex = currentIndex % total
  const notif: AppNotification = visibleNotifs[safeIndex]
  const Icon = iconMap[notif.icon] || AlertCircle

  const handleNext = () => {
    setSlideDirection('next')
    setCurrentIndex(prev => (prev + 1) % total)
    setSlideKey(k => k + 1)
  }

  const handlePrev = () => {
    setSlideDirection('prev')
    setCurrentIndex(prev => (prev - 1 + total) % total)
    setSlideKey(k => k + 1)
  }

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]))
    if (safeIndex >= total - 1) {
      setCurrentIndex(0)
    }
    setSlideKey(k => k + 1)
  }

  const handleDismissAll = () => {
    setDismissed(new Set(notifications.map(n => n.id)))
  }

  // Theme styling based on active notification type
  const isError = notif.type === 'error'
  const isWarning = notif.type === 'warning'

  const containerTheme = isError
    ? 'bg-rose-50/90 border-rose-200/90 text-rose-950 shadow-[0_4px_16px_rgba(244,63,94,0.08)]'
    : isWarning
      ? 'bg-amber-50/90 border-amber-200/90 text-amber-950 shadow-[0_4px_16px_rgba(245,158,11,0.08)]'
      : 'bg-sky-50/90 border-sky-200/90 text-sky-950 shadow-[0_4px_16px_rgba(14,165,233,0.08)]'

  const badgeTheme = isError
    ? 'bg-rose-100 text-rose-800 border-rose-300/80'
    : isWarning
      ? 'bg-amber-100 text-amber-800 border-amber-300/80'
      : 'bg-sky-100 text-sky-800 border-sky-300/80'

  const dotPulseColor = isError ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-sky-500'

  const iconTheme = isError
    ? 'bg-rose-500 text-white shadow-xs'
    : isWarning
      ? 'bg-amber-500 text-white shadow-xs'
      : 'bg-sky-500 text-white shadow-xs'

  const actionBtnTheme = isError
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : isWarning
      ? 'bg-amber-600 hover:bg-amber-700 text-white'
      : 'bg-sky-600 hover:bg-sky-700 text-white'

  const progressBarColor = isError ? '#e11d48' : isWarning ? '#d97706' : '#0284c7'

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`relative overflow-hidden rounded-[18px] border transition-colors duration-500 backdrop-blur-xs ${containerTheme}`}
    >
      <div className="flex items-center justify-between gap-2.5 px-3.5 sm:px-4 py-2.5 min-h-[50px]">

        {/* ── Left Indicator & Status Pill ── */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border shadow-2xs ${badgeTheme}`}>
            <span className={`w-2 h-2 rounded-full animate-pulse ${dotPulseColor}`} />
            <span>
              {total > 1 ? `Alert ${safeIndex + 1} of ${total}` : 'Active Alert'}
            </span>
          </div>

          {/* Direct jump dots (desktop only) */}
          {total > 1 && (
            <div className="hidden lg:flex items-center gap-1 pl-1">
              {visibleNotifs.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentIndex(idx)
                    setSlideKey(k => k + 1)
                  }}
                  title={`Jump to: ${item.title}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === safeIndex
                      ? `w-4 ${idx === safeIndex && isError ? 'bg-rose-600' : idx === safeIndex && isWarning ? 'bg-amber-600' : 'bg-sky-600'}`
                      : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Center: Sliding Notification Content (Single Line) ── */}
        <div className="flex-1 min-w-0 overflow-hidden py-0.5">
          <div
            key={slideKey}
            className="animate-notification-slide flex items-center gap-2.5 min-w-0"
          >
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${iconTheme}`}>
              <Icon size={14} strokeWidth={2.4} />
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <span className="text-[13px] font-bold tracking-tight shrink-0 whitespace-nowrap">
                {notif.title}
              </span>
              <span className="text-slate-400 font-bold shrink-0 hidden sm:inline">
                •
              </span>
              <span className="text-[12.5px] font-medium opacity-90 truncate">
                {notif.message}
              </span>
            </div>
          </div>
        </div>

        {/* ── Right Controls: View Action, Slide Arrows & Dismiss ── */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Action Link Button */}
          {notif.actionUrl && (
            <Link
              to={notif.actionUrl}
              className={`inline-flex items-center gap-1 text-[11.5px] font-bold px-3 py-1 rounded-xl transition-all shadow-xs shrink-0 ${actionBtnTheme}`}
            >
              <span>View</span>
              <ArrowRight size={12} strokeWidth={2.4} />
            </Link>
          )}

          {/* Prev/Next Sliding Controls (Shown when multiple alerts exist) */}
          {total > 1 && (
            <div className="flex items-center gap-0.5 bg-white/80 border border-slate-200/90 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={handlePrev}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/5 text-slate-700 transition-colors"
                title="Previous notification"
              >
                <ChevronLeft size={13} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/5 text-slate-700 transition-colors"
                title="Next notification"
              >
                <ChevronRight size={13} strokeWidth={2.4} />
              </button>
            </div>
          )}

          {/* Dismiss current alert button */}
          {notif.dismissible !== false && (
            <button
              type="button"
              onClick={() => handleDismiss(notif.id)}
              className="w-6 h-6 flex items-center justify-center rounded-xl hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors"
              title="Dismiss this notification"
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          )}

          {/* Dismiss All (if > 1) */}
          {total > 1 && (
            <button
              type="button"
              onClick={handleDismissAll}
              className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-1 rounded-lg hover:bg-black/5 transition-colors"
              title="Dismiss all notifications"
            >
              <EyeOff size={12} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Auto-Slide Progress Bar (Pauses on Hover) ── */}
      {total > 1 && !isPaused && (
        <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-black/5 overflow-hidden">
          <div
            key={slideKey}
            className="h-full rounded-full"
            style={{
              backgroundColor: progressBarColor,
              animation: 'notificationProgress 4.5s linear forwards',
            }}
          />
        </div>
      )}
    </div>
  )
}

export function NotificationBell() {
  const { notifications } = useNotifications()
  const errorCount = notifications.filter(n => n.type === 'error').length
  const warningCount = notifications.filter(n => n.type === 'warning').length

  if (notifications.length === 0) return null

  const bgColor = errorCount > 0 ? 'bg-red-100' : 'bg-amber-100'
  const textColor = errorCount > 0 ? 'text-red-600' : 'text-amber-600'

  return (
    <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${bgColor} relative`}>
      <Bell size={16} className={textColor} />
      <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${errorCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
        {notifications.length}
      </span>
    </div>
  )
}
