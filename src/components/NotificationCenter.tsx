import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, AlertTriangle, AlertCircle, Clock, Package, DollarSign, Bell } from 'lucide-react'
import { useNotifications } from '@/store/NotificationContext'

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

  const visibleNotifs = notifications.filter(n => !dismissed.has(n.id))

  if (visibleNotifs.length === 0) return null

  return (
    <div className="space-y-2">
      {visibleNotifs.map(notif => {
        const Icon = iconMap[notif.icon]
        const bgColor = notif.type === 'error' ? 'bg-red-50 border-red-200'
          : notif.type === 'warning' ? 'bg-amber-50 border-amber-200'
          : 'bg-blue-50 border-blue-200'
        const iconColor = notif.type === 'error' ? 'text-red-600'
          : notif.type === 'warning' ? 'text-amber-600'
          : 'text-blue-600'
        const textColor = notif.type === 'error' ? 'text-red-800'
          : notif.type === 'warning' ? 'text-amber-800'
          : 'text-blue-800'

        return (
          <div
            key={notif.id}
            className={`border rounded-[16px] px-5 py-3.5 flex items-start gap-3.5 ${bgColor}`}
          >
            <Icon size={18} className={`${iconColor} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-bold ${textColor}`}>{notif.title}</p>
              <p className={`text-[12px] ${textColor} opacity-90 mt-0.5`}>{notif.message}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {notif.actionUrl && (
                <Link
                  to={notif.actionUrl}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    notif.type === 'error'
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : notif.type === 'warning'
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  View
                </Link>
              )}
              {notif.dismissible !== false && (
                <button
                  onClick={() => setDismissed(new Set([...dismissed, notif.id]))}
                  className={`p-1 hover:opacity-70 transition-opacity ${iconColor}`}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        )
      })}
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
