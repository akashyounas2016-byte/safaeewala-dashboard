import { useState, useRef, useEffect, type ElementType } from 'react'
import { Menu, Search, Bell, Plus, Package, FileText, Clock, Users } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { useNavigate } from 'react-router-dom'

interface HeaderProps {
  title: string
  subtitle?: string
  eyebrow?: string
  onMenuClick: () => void
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { invoices, inventory, employees, bookings } = useData()
  const navigate = useNavigate()
  const now = new Date()

  const overdueInvoices = invoices.filter(i => i.status === 'overdue')
  const lowStock = inventory.filter(i => i.current_stock <= i.min_stock)

  const expiringDocs = employees.filter(e => {
    const dates = [e.visa_expiry, e.work_permit_expiry, e.passport_expiry, e.medical_insurance_expiry]
    return dates.some(d => {
      if (!d) return false
      const diff = (new Date(d).getTime() - now.getTime()) / 86400000
      return diff >= 0 && diff <= 30
    })
  })

  const pendingBookings = bookings.filter(b => b.status === 'pending')

  type Notif = { id: string; icon: ElementType; iconBg: string; iconColor: string; title: string; sub: string; route: string }
  const notifications: Notif[] = [
    ...overdueInvoices.map(i => ({
      id: i.id, icon: FileText, iconBg: 'bg-red-50', iconColor: 'text-red-500',
      title: `Overdue invoice — ${i.client_name}`,
      sub: `AED ${i.total.toLocaleString()} · Due ${i.due_date}`,
      route: '/invoices',
    })),
    ...lowStock.map(i => ({
      id: i.id, icon: Package, iconBg: 'bg-amber-50', iconColor: 'text-amber-600',
      title: `Low stock — ${i.name}`,
      sub: `${i.current_stock} ${i.unit}s left (min ${i.min_stock})`,
      route: '/inventory',
    })),
    ...expiringDocs.map(e => ({
      id: e.id, icon: Users, iconBg: 'bg-orange-50', iconColor: 'text-orange-600',
      title: `Document expiring — ${e.full_name}`,
      sub: 'Visa / permit / passport within 30 days',
      route: '/employees',
    })),
    ...pendingBookings.map(b => ({
      id: b.id, icon: Clock, iconBg: 'bg-blue-50', iconColor: 'text-blue-600',
      title: `Pending confirmation — ${b.client_name}`,
      sub: `${b.service_type} · ${b.scheduled_date}`,
      route: '/bookings',
    })),
  ]

  return (
    <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl border border-[#E4E8EC] shadow-[0_16px_48px_rgba(15,23,42,0.15)] z-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E4E8EC] flex items-center justify-between">
        <p className="text-[13px] font-bold text-[#111827]">Notifications</p>
        {notifications.length > 0 && (
          <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
            {notifications.length} new
          </span>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-[#E4E8EC]">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell size={24} className="mx-auto mb-2 text-slate-300" strokeWidth={1.25} />
            <p className="text-[12px] text-slate-400">All clear — no alerts</p>
          </div>
        ) : notifications.map(n => (
          <button
            key={n.id}
            onClick={() => { navigate(n.route); onClose() }}
            className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
          >
            <div className={`w-8 h-8 rounded-xl ${n.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
              <n.icon size={14} className={n.iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold text-[#111827] leading-snug">{n.title}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{n.sub}</p>
            </div>
          </button>
        ))}
      </div>

      {notifications.length > 0 && (
        <div className="px-4 py-3 border-t border-[#E4E8EC]">
          <button onClick={onClose} className="text-[11px] text-slate-400 hover:text-slate-600 w-full text-center">
            Dismiss all
          </button>
        </div>
      )}
    </div>
  )
}

export function Header({ title, subtitle, eyebrow, onMenuClick }: HeaderProps) {
  const { invoices, inventory, employees, bookings } = useData()
  const [showNotifs, setShowNotifs] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const alertCount =
    invoices.filter(i => i.status === 'overdue').length +
    inventory.filter(i => i.current_stock <= i.min_stock).length +
    employees.filter(e => {
      const dates = [e.visa_expiry, e.work_permit_expiry, e.passport_expiry]
      return dates.some(d => {
        if (!d) return false
        const diff = (new Date(d).getTime() - now.getTime()) / 86400000
        return diff >= 0 && diff <= 30
      })
    }).length +
    bookings.filter(b => b.status === 'pending').length

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowNotifs(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  return (
    <header className="h-16 bg-white border-b border-[#e2e8f0] flex items-center px-6 gap-4 shrink-0">

      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-[#94a3b8] hover:text-[#475569] hover:bg-[#f8fafc] transition-colors cursor-pointer shrink-0"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1 min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-[0.14em] leading-none mb-0.5 hidden lg:block">{eyebrow}</p>
        )}
        <h1 className="text-[16px] font-semibold text-[#0f172a] leading-none truncate">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-[#94a3b8] mt-[3px] truncate hidden sm:block">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-[13px] text-[#94a3b8] hover:border-[#cbd5e1] transition-colors cursor-pointer w-44">
          <Search size={14} strokeWidth={2} />
          <span className="text-[12.5px]">Search…</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 bg-white border border-[#e2e8f0] rounded text-[#94a3b8] font-mono leading-none">⌘K</kbd>
        </div>

        <button className="md:hidden w-9 h-9 rounded-lg border border-[#e2e8f0] bg-white flex items-center justify-center text-[#94a3b8] hover:text-[#475569] hover:bg-[#f8fafc] transition-colors cursor-pointer">
          <Search size={16} />
        </button>

        {/* Notification bell */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowNotifs(v => !v)}
            className="relative w-9 h-9 rounded-lg border border-[#e2e8f0] bg-white flex items-center justify-center text-[#94a3b8] hover:text-[#475569] hover:bg-[#f8fafc] transition-colors cursor-pointer"
          >
            <Bell size={16} />
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-white">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>
          {showNotifs && <NotificationPanel onClose={() => setShowNotifs(false)} />}
        </div>

        <button className="flex items-center gap-2 px-4 py-2 bg-[#059669] hover:bg-[#047857] active:bg-[#065f46] text-white text-[13px] font-semibold rounded-lg transition-colors cursor-pointer shadow-sm">
          <Plus size={15} strokeWidth={2.5} />
          <span className="hidden sm:inline">New Booking</span>
        </button>

      </div>
    </header>
  )
}
