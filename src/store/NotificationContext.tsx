import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Booking, Invoice, InventoryItem } from '@/types'

export interface AppNotification {
  id: string
  type: 'warning' | 'error' | 'info'
  title: string
  message: string
  icon: 'AlertTriangle' | 'AlertCircle' | 'Clock' | 'Package' | 'DollarSign'
  actionUrl?: string
  dismissible?: boolean
}

interface NotificationStore {
  notifications: AppNotification[]
}

const NotificationContext = createContext<NotificationStore | null>(null)

export function NotificationProvider({
  children,
  bookings,
  invoices,
  inventory,
}: {
  children: ReactNode
  bookings: Booking[]
  invoices: Invoice[]
  inventory: InventoryItem[]
}) {
  const notifications: AppNotification[] = useMemo(() => {
    const notifs: AppNotification[] = []
    const today = new Date().toISOString().split('T')[0]

    // Late jobs
    const lateJobs = bookings.filter(b =>
      b.status === 'in_progress' &&
      b.scheduled_date === today &&
      new Date(`${b.scheduled_date}T${b.scheduled_time}`) < new Date(Date.now() - (b.duration_hours * 60 * 60 * 1000))
    )
    if (lateJobs.length > 0) {
      notifs.push({
        id: 'late-jobs',
        type: 'error',
        icon: 'Clock',
        title: `${lateJobs.length} Job${lateJobs.length > 1 ? 's' : ''} Running Late`,
        message: `${lateJobs.map(j => j.client_name).join(', ')} — check progress in Dispatch`,
        actionUrl: '/dispatch',
      })
    }

    // Overdue invoices
    const overdueInvoices = invoices.filter(i =>
      i.status !== 'paid' &&
      new Date(i.due_date) < new Date() &&
      new Date(i.due_date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Within last 30 days
    )
    if (overdueInvoices.length > 0) {
      const totalOverdue = overdueInvoices.reduce((s, i) => s + i.total, 0)
      notifs.push({
        id: 'overdue-invoices',
        type: 'warning',
        icon: 'DollarSign',
        title: `${overdueInvoices.length} Overdue Invoice${overdueInvoices.length > 1 ? 's' : ''}`,
        message: `AED ${totalOverdue.toLocaleString()} outstanding — send reminders in Invoices`,
        actionUrl: '/invoices',
      })
    }

    // Low stock
    const lowStock = inventory.filter(i => i.current_stock <= i.min_stock)
    if (lowStock.length > 0) {
      notifs.push({
        id: 'low-stock',
        type: 'warning',
        icon: 'Package',
        title: `${lowStock.length} Item${lowStock.length > 1 ? 's' : ''} Low on Stock`,
        message: `${lowStock.map(i => i.name).slice(0, 2).join(', ')}${lowStock.length > 2 ? ` +${lowStock.length - 2} more` : ''} — reorder now`,
        actionUrl: '/inventory',
      })
    }

    // Pending user signups (admin only - but we'll show for all, the UI can gate)
    const pendingCount = 0 // This would come from settings data
    if (pendingCount > 0) {
      notifs.push({
        id: 'pending-users',
        type: 'info',
        icon: 'AlertCircle',
        title: `${pendingCount} User Signup${pendingCount > 1 ? 's' : ''} Pending`,
        message: 'Review and approve new user requests in Settings',
        actionUrl: '/settings',
      })
    }

    return notifs
  }, [bookings, invoices, inventory])

  return (
    <NotificationContext.Provider value={{ notifications }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}
