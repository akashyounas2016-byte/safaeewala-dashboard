import { useState, useRef, useEffect, useMemo, type ElementType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  CalendarCheck, Users, DollarSign, Star,
  ArrowUpRight, ArrowDownRight, Minus, ArrowRight,
  AlertCircle, Clock, FileText, MessageCircle,
  Calendar, RotateCcw,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { LiveOpsPanel } from '@/components/overview/LiveOpsPanel'
import { usePeriodLeadCounts } from '@/components/overview/usePeriodLeadCounts'
import { overviewRange, jobProgressByTime, crewMembers, dispatchedNames, onJobs, repeatClientRate, dubaiMinutes } from '@/lib/overviewStats'
import { currentJobOf } from '@/lib/liveOps'
import { ReportsPanel } from '@/components/overview/ReportsPanel'
import { Button } from '@/components/ui/Button'
import { formatTime } from '@/lib/utils'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { useCurrentUser } from '@/store/UserContext'
import type { Booking, BookingFrequency, DailyJob, DailyPendingItem, DailyPendingReceivedItem, Invoice } from '@/types'
import { invoicedJobIds, invoiceBalance } from '@/lib/receivables'
import { cleanClientNameFromAddress, isBogusJob, buildPendingCalcContext, loadClientAdjustments, calcJobCollectable, jobCollected } from '@/lib/clientDataSync'
import { safeLocalStorageGet } from '@/lib/storageUtils'
import { todayDubai } from '@/lib/dubaiTime'
import { cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'


/** Bookings without a Daily Job Sheet row — a booking with a row is already counted through that row (AUD-01) */
function bookingsWithoutJobRow(bookings: Booking[], dailyJobs: DailyJob[]): Booking[] {
  const linked = new Set(dailyJobs.map(j => j.booking_id).filter(Boolean))
  return bookings.filter(b => !linked.has(b.id))
}

const serviceTypes = [
  'Standard Clean', 'Deep Clean', 'Move-in', 'Move-out',
  'Commercial', 'Post-construction', 'Office', 'Carpet', 'Window',
]




/* ─── shared avatar palette ─── */
const avatarPalette = [
  { bg: '#d1fae5', text: '#065f46' },
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#ede9fe', text: '#5b21b6' },
  { bg: '#e0f2fe', text: '#0369a1' },
  { bg: '#fce7f3', text: '#9d174d' },
]
function Avatar({ name, idx, size = 'md' }: { name: string; idx: number; size?: 'sm' | 'md' | 'lg' }) {
  const parts = name.trim().split(' ')
  const init = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  const p = avatarPalette[idx % avatarPalette.length]
  const dims = size === 'lg' ? 'w-12 h-12 text-sm' : size === 'sm' ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm'
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0`}
      style={{ background: p.bg, color: p.text }}>
      {init}
    </div>
  )
}

/* ─── Status pill ─── */
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    in_progress: { label: 'Live',      bg: '#d1fae5', text: '#065f46' },
    confirmed:   { label: 'Scheduled', bg: '#e0f2fe', text: '#0369a1' },
    pending:     { label: 'Pending',   bg: '#fef3c7', text: '#92400e' },
    cancelled:   { label: 'Cancelled', bg: '#fee2e2', text: '#991b1b' },
    completed:   { label: 'Done',      bg: '#f1f5f9', text: '#475569' },
  }
  const s = map[status] ?? map.pending
  return (
    <span className="inline-flex items-center text-[12px] font-semibold px-4 py-2 rounded-full"
      style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  )
}

/* ─── KPI Card ─── */
interface KpiCardProps {
  label: string; value: string | number; sub: string
  delta?: string; trend?: 'up' | 'down' | 'neutral'
  icon: ElementType; iconColor: string; iconBg: string
  onClick?: () => void
}
function KpiCard({ label, value, sub, delta, trend = 'neutral', icon: Icon, iconColor, iconBg, onClick }: KpiCardProps) {
  const trendColor = trend === 'up' ? '#059669' : trend === 'down' ? '#ef4444' : '#475569'
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-[24px] p-6 border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] transition-all ${onClick ? 'cursor-pointer hover:shadow-[0_8px_30px_rgba(15,23,42,0.12)] hover:border-emerald-200' : ''}`}
    >
      <div className="flex items-start justify-between mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: iconBg }}>
          <Icon size={20} style={{ color: iconColor }} strokeWidth={2} />
        </div>
        {delta && (
          <div className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full"
            style={{ color: trendColor, background: trend === 'up' ? '#d1fae5' : trend === 'down' ? '#fee2e2' : '#f1f5f9' }}>
            <TrendIcon size={13} strokeWidth={2.5} />
            {delta}
          </div>
        )}
      </div>
      <p className="text-3xl font-bold text-[#111827] leading-none tracking-tight">{value}</p>
      <p className="text-[15px] font-semibold text-[#111827] mt-2">{label}</p>
      <p className="text-sm text-[#6B7280] mt-1">{sub}</p>
    </div>
  )
}

/* ─── Revenue chart ─── */
function RevenueChart({
  bookings,
  dailyJobs,
  monthlyPayments,
  invoices,
}: {
  bookings: Booking[]
  dailyJobs: DailyJob[]
  monthlyPayments: Array<{ amount: number; date: string }>
  invoices: Invoice[]
}) {
  const [range, setRange] = useState<'3M' | '6M' | '1Y'>('6M')
  const count = range === '3M' ? 3 : range === '6M' ? 6 : 12

  const months = Array.from({ length: count }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - (count - 1 - i))
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      revenue: 0,
      target: 0,
    }
  })

  // 1. From Bookings that have no job-sheet row yet
  bookingsWithoutJobRow(bookings, dailyJobs)
    .filter(b => b.status === 'completed' || b.status === 'in_progress')
    .forEach(b => {
      const key = (b.scheduled_date || '').slice(0, 7)
      const m = months.find(m => m.key === key)
      if (m) m.revenue += cleanNum(b.total_amount)
    })

  // 2. From Daily Jobs Sheet collections
  dailyJobs
    .filter(j => !isBogusJob(j))
    .forEach(j => {
      const key = (j.date || '').slice(0, 7)
      const m = months.find(m => m.key === key)
      if (m) {
        m.revenue += jobCollected(j)
      }
    })

  // 3. From Monthly Client Payments
  monthlyPayments.forEach(p => {
    const key = (p.date || '').slice(0, 7)
    const m = months.find(m => m.key === key)
    if (m) m.revenue += cleanNum(p.amount)
  })

  // 4. From Paid Invoices
  invoices
    .filter(i => i.status === 'paid')
    .forEach(i => {
      const key = (i.paid_date || i.due_date || (i.created_at ? i.created_at.slice(0, 7) : '')).slice(0, 7)
      const m = months.find(m => m.key === key)
      if (m) m.revenue += cleanNum(i.total)
    })

  // Target = 110% of average revenue across displayed months (min AED 5,000)
  const nonZeroRevenues = months.map(m => m.revenue).filter(r => r > 0)
  const MONTHLY_TARGET = nonZeroRevenues.length > 0
    ? Math.max(5000, Math.round((nonZeroRevenues.reduce((s, r) => s + r, 0) / nonZeroRevenues.length) * 1.1 / 500) * 500)
    : 10000
  months.forEach(m => { m.target = MONTHLY_TARGET })

  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0)
  const targetHit = months.filter(m => m.revenue >= m.target).length
  const monthlyAvg = Math.round(totalRevenue / count)

  return (
    <div className="bg-white rounded-[22px] p-5 border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-[#111827]">Revenue vs Target</h3>
          <p className="text-sm text-[#6B7280] mt-1">Business growth performance overview (all unified income streams)</p>
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          {(['3M', '6M', '1Y'] as const).map(t => (
            <button key={t} onClick={() => setRange(t)}
              className={`text-xs px-3 py-2 rounded-xl font-semibold transition-all ${t === range ? 'bg-[#059669] text-white shadow-sm' : 'text-[#6B7280] hover:text-[#111827]'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5 mb-6">
        <div>
          <p className="text-sm text-[#6B7280] mb-1">Total Revenue</p>
          <h4 className="text-xl font-bold text-[#111827]">AED {totalRevenue.toLocaleString()}</h4>
          <p className="text-sm font-semibold text-[#059669] mt-1">All collected payments</p>
        </div>
        <div>
          <p className="text-sm text-[#6B7280] mb-1">Target Hit</p>
          <h4 className="text-xl font-bold text-[#111827]">{targetHit}/{count}</h4>
          <p className="text-sm text-slate-500 mt-1">Months</p>
        </div>
        <div>
          <p className="text-sm text-[#6B7280] mb-1">Monthly Avg</p>
          <h4 className="text-xl font-bold text-[#111827]">AED {monthlyAvg.toLocaleString()}</h4>
          <p className="text-sm text-slate-500 mt-1">{count} month period</p>
        </div>
      </div>

      {totalRevenue === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
          No revenue recorded for selected period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={months} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
            <Tooltip formatter={v => [`AED ${Number(v).toLocaleString()}`, '']}
              contentStyle={{ borderRadius: 12, border: '1px solid #E4E8EC', fontSize: 12, boxShadow: '0 4px 20px rgba(15,23,42,0.08)' }} />
            <Area type="monotone" dataKey="target" stroke="#cbd5e1" strokeWidth={1.5}
              fill="none" strokeDasharray="4 4" name="Target" />
            <Area type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2.5}
              fill="url(#revGrad)" name="Revenue"
              dot={{ r: 3.5, fill: '#fff', stroke: '#059669', strokeWidth: 2 }}
              activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}

      <div className="flex gap-5 mt-3">
        <div className="flex items-center gap-2 text-sm text-[#475569]">
          <span className="w-3 h-3 rounded-full bg-[#059669]" />Actual Revenue
        </div>
        <div className="flex items-center gap-2 text-sm text-[#475569]">
          <span className="w-4 h-[2px] block" style={{ background: 'repeating-linear-gradient(90deg,#cbd5e1 0 4px,transparent 4px 8px)' }} />
          Monthly Target
        </div>
      </div>
    </div>
  )
}

export type OverviewDatePreset = 'today' | 'yesterday' | '7days' | '30days' | '3months' | '6months' | '1year' | 'all' | 'custom'

/* ─── Overview page ─── */
export function Overview() {
  const { bookings, clients, employees, invoices, inventory, dailyExpenses, dailyJobs } = useData()
  const currentUser = useCurrentUser()
  const navigate = useNavigate()

  // Synced local collections and pending records from other screens
  const [monthlyPayments] = useState<Array<{ amount: number; date: string }>>(() =>
    safeLocalStorageGet<Array<{ amount: number; date: string }>>('safaeewala_monthly_client_payments', [])
  )
  const [pendingList] = useState<DailyPendingItem[]>(() =>
    safeLocalStorageGet<DailyPendingItem[]>('safaeewala_daily_pending_items', [])
  )
  const [pendingRcvdList] = useState<DailyPendingReceivedItem[]>(() =>
    safeLocalStorageGet<DailyPendingReceivedItem[]>('safaeewala_daily_pending_rcvd_items', [])
  )

  // Date filter state
  const [datePreset, setDatePreset] = useState<OverviewDatePreset>('today')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [dispatchTab, setDispatchTab] = useState<'all' | 'live' | 'scheduled' | 'completed'>('all')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = currentUser?.full_name?.split(' ')[0] || 'there'

  // R-OPS-16: date range on Dubai dates (it used the UTC date — wrong after 8 PM Dubai)
  const todayStr = todayDubai()
  const nowMin = dubaiMinutes()
  const activeDateRange = useMemo(
    () => overviewRange(datePreset, todayStr, { from: customStartDate, to: customEndDate }),
    [datePreset, todayStr, customStartDate, customEndDate],
  )
  const leadCounts = usePeriodLeadCounts(activeDateRange.start, activeDateRange.end)

  // Helper: check if date is in active range
  const isDateInRange = useMemo(() => {
    return (dateStr?: string) => {
      if (!activeDateRange.start && !activeDateRange.end) return true
      if (!dateStr) return false
      const d = dateStr.split('T')[0]
      if (activeDateRange.start && d < activeDateRange.start) return false
      if (activeDateRange.end && d > activeDateRange.end) return false
      return true
    }
  }, [activeDateRange])

  // Valid non-bogus Daily Jobs
  const validDailyJobs = useMemo(() => dailyJobs.filter(j => !isBogusJob(j)), [dailyJobs])

  // Filtered Daily Jobs in period
  const periodDailyJobs = useMemo(() => {
    return validDailyJobs.filter(j => isDateInRange(j.date))
  }, [validDailyJobs, isDateInRange])

  // Filtered Bookings in period (only those without a job-sheet row, so nothing is counted twice)
  const periodBookings = useMemo(() => {
    return bookingsWithoutJobRow(bookings, validDailyJobs).filter(b => {
      const bDate = b.scheduled_date || (b.created_at ? b.created_at.split('T')[0] : '')
      return isDateInRange(bDate)
    })
  }, [bookings, validDailyJobs, isDateInRange])

  // ── Unified Operational Jobs for table & counts ──
  const unifiedJobs = useMemo(() => {
    const list: Array<{
      id: string
      date: string
      time: string
      clientName: string
      address: string
      area: string
      service: string
      status: 'in_progress' | 'confirmed' | 'completed' | 'pending' | 'cancelled'
      amount: number
      paymentMode: string
      staff: string
      source: 'Daily Job Sheet' | 'Booking'
    }> = []

    // 1. Daily Jobs in period
    periodDailyJobs.forEach(j => {
      const cleanClient = cleanClientNameFromAddress(j.address || j.area || 'Client')
      // R-OPS-16: progress from the date and times (Done / Live / Scheduled), not from the payment
      const status: 'in_progress' | 'confirmed' | 'completed' | 'pending' = jobProgressByTime(j, todayStr, nowMin)
      list.push({
        id: `dj-${j.id}`,
        date: j.date || '',
        time: j.start_time && j.end_time ? `${j.start_time} - ${j.end_time}` : (j.start_time || '—'),
        clientName: cleanClient,
        address: j.address || j.area || 'Dubai',
        area: j.area || 'Dubai',
        service: j.service || 'Cleaning Shift',
        status,
        amount: cleanNum(j.charges) || cleanNum(j.received),
        paymentMode: j.payment_mode || 'Cash',
        staff: j.staff_name || 'Staff',
        source: 'Daily Job Sheet',
      })
    })

    // 2. Bookings in period
    periodBookings.forEach(b => {
      list.push({
        id: b.id,
        date: b.scheduled_date,
        time: b.scheduled_time || '—',
        clientName: b.client_name,
        address: b.service_address,
        area: b.service_address.split(',')[1]?.trim() || b.service_address.split(',')[0]?.trim() || 'Dubai',
        service: b.service_type,
        status: b.status as any,
        amount: cleanNum(b.total_amount),
        paymentMode: 'Online / Invoiced',
        staff: b.assigned_crew?.length ? `${b.assigned_crew.length} cleaner(s)` : 'Assigned',
        source: 'Booking',
      })
    })

    // Sort chronologically (newest first)
    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || ''))
    return list
  }, [periodDailyJobs, periodBookings, todayStr, nowMin])

  const nonCancelledJobs  = unifiedJobs.filter(j => j.status !== 'cancelled')
  const periodCompleted   = unifiedJobs.filter(j => j.status === 'completed')
  const periodLive        = unifiedJobs.filter(j => j.status === 'in_progress')
  const periodConfirmed   = unifiedJobs.filter(j => j.status === 'confirmed')

  const completionRatePct = nonCancelledJobs.length > 0
    ? Math.round((periodCompleted.length / nonCancelledJobs.length) * 100)
    : (unifiedJobs.length > 0 ? 100 : 0)

  // ── Unified Revenue / Collections in period ──
  const periodRevenue = useMemo(() => {
    // 1. Daily Jobs collections
    const djRec = periodDailyJobs.reduce((s, j) => s + jobCollected(j), 0)

    // 2. Monthly Client Payments
    const monthlyRec = monthlyPayments
      .filter(p => isDateInRange(p.date))
      .reduce((s, p) => s + cleanNum(p.amount), 0)

    // 3. Pending Recoveries
    const pendingRec = pendingRcvdList
      .filter(p => isDateInRange(p.date))
      .reduce((s, p) => s + cleanNum(p.cash) + cleanNum(p.online), 0)

    // 4. Bookings Completed
    const bookingsRec = periodBookings
      .filter(b => b.status === 'completed' || b.status === 'in_progress')
      .reduce((s, b) => s + cleanNum(b.total_amount), 0)

    return djRec + monthlyRec + pendingRec + bookingsRec
  }, [periodDailyJobs, monthlyPayments, pendingRcvdList, periodBookings, isDateInRange])

  // ── Unified System-Wide Pending Payments & Outstanding Dues ──
  const { totalPendingAmount, totalPendingCount, dailyPendingCount, sidePendingCount, invoicePendingCount } = useMemo(() => {
    // 1. Daily Jobs with pending dues
    // Same per-job formula as Pending Payments, Daily Job Sheet and Client Profile
    const pendingCtx = buildPendingCalcContext(loadClientAdjustments(), pendingRcvdList)
    const invoiced = invoicedJobIds(invoices)
    // R-OPS-16: same as the Pending screen — no visit after today (R-FIN-20), invoices by what is still unpaid
    const djPendingList = validDailyJobs.filter(j => !(j.date && j.date > todayStr) && calcJobCollectable(j, pendingCtx, invoiced) > 0)
    const djPendingAmt = djPendingList.reduce((s, j) => s + calcJobCollectable(j, pendingCtx, invoiced), 0)

    // 2. Side table pending items
    const sideAmt = pendingList.reduce((s, i) => s + cleanNum(i.amount), 0)

    // 3. Unpaid / overdue invoices
    const pInvoices = invoices.filter(i => i.status !== 'draft' && invoiceBalance(i) > 0)
    const invAmt = pInvoices.reduce((s, i) => s + invoiceBalance(i), 0)

    return {
      totalPendingAmount: djPendingAmt + sideAmt + invAmt,
      totalPendingCount: djPendingList.length + pendingList.length + pInvoices.length,
      dailyPendingCount: djPendingList.length,
      sidePendingCount: pendingList.length,
      invoicePendingCount: pInvoices.length,
    }
  }, [validDailyJobs, pendingList, pendingRcvdList, invoices, todayStr])

  // ── Staff & Utilization ──
  // R-OPS-16: crew = cleaners only (not drivers, CSR, supervisors); each cleaner of a team counts
  const activeEmps = useMemo(() => crewMembers(employees), [employees])
  const lowStockItems = inventory.filter(i => i.current_stock <= i.min_stock)

  const dispatchedStaffSet = useMemo(() => {
    const names = dispatchedNames(periodDailyJobs)
    periodBookings.forEach(b => {
      (b.assigned_crew || []).forEach(id => {
        const emp = employees.find(e => e.id === id)
        if (emp) names.add(emp.full_name.trim().toLowerCase())
      })
    })
    return new Set(activeEmps.filter(e => onJobs(e, names)).map(e => e.id))
  }, [periodDailyJobs, periodBookings, employees, activeEmps])

  const crewUtilization = activeEmps.length > 0
    ? Math.min(100, Math.round((dispatchedStaffSet.size / activeEmps.length) * 100))
    : 0

  // Filtered Dispatch Table rows
  const displayDispatchBookings = useMemo(() => {
    if (dispatchTab === 'live') return unifiedJobs.filter(j => j.status === 'in_progress')
    if (dispatchTab === 'scheduled') return unifiedJobs.filter(j => j.status === 'confirmed')
    if (dispatchTab === 'completed') return unifiedJobs.filter(j => j.status === 'completed')
    return unifiedJobs
  }, [unifiedJobs, dispatchTab])

  /* ── Live Activity from real data ── */
  const liveEvents: { icon: string; title: string; sub: string; bg: string; route: string }[] = []
  
  // Recent Daily Jobs
  const recentJobs = [...validDailyJobs].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 2)
  recentJobs.forEach(j => {
    const cleanClient = cleanClientNameFromAddress(j.address || j.area || 'Client')
    liveEvents.push({
      icon: '🧹', bg: 'bg-emerald-100', route: '/daily-jobs',
      title: `Job: ${cleanClient}`,
      sub: `${j.service || 'Cleaning'} · ${j.staff_name} · AED ${(cleanNum(j.charges) || cleanNum(j.received)).toLocaleString()}`,
    })
  })

  // Recent Bookings
  const recentBookings = [...bookings].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 1)
  recentBookings.forEach(b => liveEvents.push({
    icon: '📅', bg: 'bg-teal-100', route: '/bookings',
    title: `Booking: ${b.client_name}`,
    sub: `${b.service_type} · ${b.scheduled_date}`,
  }))

  // Recent Paid Invoices
  const recentPaid = [...invoices].filter(i => i.status === 'paid').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 1)
  recentPaid.forEach(i => liveEvents.push({
    icon: '💳', bg: 'bg-sky-100', route: '/invoices',
    title: `Invoice paid: ${i.client_name}`,
    sub: `AED ${i.total.toLocaleString()} received`,
  }))

  if (lowStockItems.length > 0) liveEvents.push({
    icon: '⚠️', bg: 'bg-red-100', route: '/inventory',
    title: `${lowStockItems[0].name} stock low`,
    sub: `${lowStockItems[0].current_stock} ${lowStockItems[0].unit} remaining · reorder needed`,
  })

  const displayEvents = liveEvents.length > 0 ? liveEvents.slice(0, 4) : [
    { icon: '👋', bg: 'bg-slate-100', route: '', title: 'No activity yet', sub: 'Add a job or invoice to see events here' },
  ]

  return (
    <div>
      {/* ── Page Hero ── */}
      <PageHero
        title={`${greeting}, ${firstName} 👋`}
        subtitle={`${activeDateRange.label} · ${unifiedJobs.length} operational jobs · ${periodLive.length} live now · AED ${periodRevenue.toLocaleString()} revenue collected`}
        statusChip={datePreset === 'today' ? 'On track' : activeDateRange.label}
        actionLabel="" /* R-OPS-15: no New Booking on the Overview header (Bookings has it) */
        showSearch={false}
      />

      {/* ── Date Filters Bar ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-3.5 sm:p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12.5px] font-bold text-slate-700 flex items-center gap-1.5 mr-1">
              <Calendar size={15} className="text-emerald-600" />
              <span>Date Filter:</span>
            </span>

            {[
              { id: 'today',     label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7days',     label: '7 Days' },
              { id: '30days',    label: '30 Days' },
              { id: '3months',   label: '3 Months' },
              { id: '6months',   label: '6 Months' },
              { id: '1year',     label: '1 Year' },
              { id: 'all',       label: 'All Time' },
              { id: 'custom',    label: 'Custom Range' },
            ].map(preset => {
              const active = datePreset === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDatePreset(preset.id as OverviewDatePreset)}
                  className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 bg-[#f8fafc] border border-emerald-200 rounded-xl px-3 py-1.5 animate-in fade-in duration-150">
                <span className="text-[11px] font-bold text-emerald-700">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="text-[12px] px-2 py-1 bg-white border border-[#E4E8EC] rounded-lg focus:outline-none focus:border-emerald-500 font-medium"
                />
                <span className="text-[11px] font-bold text-emerald-700">To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="text-[12px] px-2 py-1 bg-white border border-[#E4E8EC] rounded-lg focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>
            )}

            {datePreset !== 'today' && (
              <button
                type="button"
                onClick={() => {
                  setDatePreset('today')
                  setCustomStartDate('')
                  setCustomEndDate('')
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-slate-500 hover:text-emerald-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                title="Reset date filter to Today"
              >
                <RotateCcw size={12} />
                <span>Reset to Today</span>
              </button>
            )}

            <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/60">
              Showing: <span className="text-emerald-600 font-extrabold">{unifiedJobs.length}</span> jobs ({activeDateRange.label})
            </span>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mb-6">
        <KpiCard
          label={datePreset === 'today' ? 'Jobs Today' : datePreset === 'yesterday' ? 'Jobs Yesterday' : datePreset === 'all' ? 'Total Jobs' : `Jobs (${activeDateRange.label})`}
          value={unifiedJobs.length}
          sub={`${periodLive.length} live · ${periodConfirmed.length} scheduled · ${periodCompleted.length} done`}
          delta={unifiedJobs.length > 0 ? `+${unifiedJobs.length}` : '0'}
          trend={unifiedJobs.length > 0 ? 'up' : 'neutral'}
          icon={CalendarCheck} iconBg="#d1fae5" iconColor="#059669"
          onClick={() => navigate('/daily-jobs')}
        />
        <KpiCard
          label={datePreset === 'today' ? 'Revenue Today' : datePreset === 'yesterday' ? 'Revenue Yesterday' : datePreset === 'all' ? 'Total Revenue' : `Revenue (${activeDateRange.label})`}
          value={`AED ${periodRevenue.toLocaleString()}`}
          sub={`From ${periodCompleted.length + periodLive.length} completed & live jobs`}
          delta={periodRevenue > 0 ? `AED ${periodRevenue.toLocaleString()}` : 'AED 0'}
          trend={periodRevenue > 0 ? 'up' : 'neutral'}
          icon={DollarSign} iconBg="#e0f2fe" iconColor="#0369a1"
          onClick={() => navigate('/payment-processing')}
        />
        <KpiCard
          label="Active Cleaners"
          value={activeEmps.length}
          sub={`${dispatchedStaffSet.size} on jobs ${datePreset === 'today' ? 'today' : 'in period'} · ${employees.length} total staff`}
          delta={`${activeEmps.length} active`}
          trend="neutral"
          icon={Users} iconBg="#fef3c7" iconColor="#d97706"
          onClick={() => navigate('/employees')}
        />
        <KpiCard
          label="Completion Rate"
          value={`${completionRatePct}%`}
          sub={`${periodCompleted.length} of ${nonCancelledJobs.length} active jobs`}
          delta={`${completionRatePct}% rate`}
          trend="up"
          icon={Star} iconBg="#ede9fe" iconColor="#7c3aed"
          onClick={() => navigate('/reports')}
        />
        {/* R-LEAD-15: website leads of the chosen period */}
        <KpiCard
          label={`Fluent Form Leads (${activeDateRange.label})`}
          value={leadCounts.forms ?? '…'}
          sub={leadCounts.formsNew == null ? 'Website form submissions' : `${leadCounts.formsNew} still new · website forms`}
          delta={leadCounts.forms ? `+${leadCounts.forms}` : '0'}
          trend={leadCounts.forms ? 'up' : 'neutral'}
          icon={FileText} iconBg="#e0e7ff" iconColor="#4f46e5"
          onClick={() => navigate('/fluent-forms')}
        />
        <KpiCard
          label={`WhatsApp Clicks (${activeDateRange.label})`}
          value={leadCounts.clicks ?? '…'}
          sub={leadCounts.clicksMobile == null ? 'WhatsApp buttons on the website' : `${leadCounts.clicksMobile} from mobile · website buttons`}
          delta={leadCounts.clicks ? `+${leadCounts.clicks}` : '0'}
          trend={leadCounts.clicks ? 'up' : 'neutral'}
          icon={MessageCircle} iconBg="#dcfce7" iconColor="#16a34a"
          onClick={() => navigate('/whatsapp-clicks')}
        />
      </section>

      {/* ── R-OPS-13: Reports (Daily / Yesterday / Last 7 / 30 days) + Live Activity. R-OPS-15: Quick Actions removed ── */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6 items-start">
        <div className="xl:col-span-2"><ReportsPanel /></div>

        {/* Live Activity */}
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-xl font-bold text-[#111827] mb-1">Live Activity</h3>
              <p className="text-sm text-[#6B7280]">Recent business events</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="space-y-2">
            {displayEvents.map((ev, i) => (
              <div
                key={i}
                onClick={() => ev.route && navigate(ev.route)}
                className={`flex gap-4 p-2 rounded-xl transition-colors ${ev.route ? 'cursor-pointer hover:bg-slate-50' : ''}`}
              >
                <div className={`w-10 h-10 rounded-full ${ev.bg} flex items-center justify-center shrink-0`}>
                  <span>{ev.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-[#111827]">{ev.title}</p>
                  <p className="text-xs text-[#6B7280] mt-1">{ev.sub}</p>
                </div>
                {ev.route && <span className="text-slate-300 self-center text-[11px]">→</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── R-OPS-14: live map of cleaners, drivers and CSR ── */}
      <section className="mb-6">
        <LiveOpsPanel />
      </section>

      {/* ── Ops Alert Cards ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div
          onClick={() => navigate('/payments?tab=outstanding')}
          className="bg-red-50 border border-red-100 rounded-3xl p-6 cursor-pointer hover:shadow-md transition-all hover:border-red-300 group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center group-hover:scale-105 transition-transform">
              <AlertCircle size={20} className="text-red-600" />
            </div>
            <span className="text-red-700 font-bold text-xs bg-red-100 px-3 py-1 rounded-full flex items-center gap-1">
              <span>{totalPendingCount > 0 ? 'Pending Collection' : 'All Settled'}</span>
              <ArrowRight size={12} />
            </span>
          </div>
          <h3 className="text-2xl font-bold text-red-700">AED {totalPendingAmount.toLocaleString()}</h3>
          <p className="font-semibold text-[#111827] mt-1">Pending Payments & Receivables</p>
          <p className="text-sm text-red-600 mt-2">
            {totalPendingCount > 0
              ? `${totalPendingCount} pending items (${dailyPendingCount + sidePendingCount} Job Sheet · ${invoicePendingCount} Invoices)`
              : 'Zero outstanding balances · All payments collected'}
          </p>
        </div>

        <div
          onClick={() => navigate('/inventory')}
          className="bg-amber-50 border border-amber-100 rounded-3xl p-6 cursor-pointer hover:shadow-md transition-all hover:border-amber-300 group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center group-hover:scale-105 transition-transform">
              <AlertCircle size={20} className="text-amber-600" />
            </div>
            <span className="text-amber-700 font-semibold text-sm">Inventory Alert</span>
          </div>
          <h3 className="text-2xl font-bold text-amber-700">{lowStockItems.length}</h3>
          <p className="font-semibold text-[#111827] mt-1">Low Stock Alerts</p>
          <p className="text-sm text-amber-600 mt-2">
            {lowStockItems.length > 0 ? `${lowStockItems[0].name} needs reorder` : 'All items stocked'}
          </p>
        </div>

        <div
          onClick={() => navigate('/employees')}
          className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 cursor-pointer hover:shadow-md transition-all hover:border-emerald-300 group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Clock size={20} className="text-emerald-600" />
            </div>
            <span className="text-emerald-700 font-semibold text-sm">{crewUtilization >= 70 ? 'Healthy' : 'Low'}</span>
          </div>
          <h3 className="text-2xl font-bold text-emerald-700">{crewUtilization}%</h3>
          <p className="font-semibold text-[#111827] mt-1">Crew Utilization</p>
          <p className="text-sm text-emerald-600 mt-2">
            {dispatchedStaffSet.size} cleaners dispatched {datePreset === 'today' ? 'today' : 'in period'}
          </p>
        </div>
      </section>

      {/* ── Smart Operations Row ── */}
      <section className="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-6">
        {/* Business Performance */}
        {(() => {
          // R-OPS-16: repeat clients from the job sheet (total_bookings is not kept up to date)
          const repeatRate = repeatClientRate(validDailyJobs, clients.length)
          return (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-[#111827]">Business Health</h3>
                  <p className="text-sm text-[#6B7280]">
                    {datePreset === 'today' ? 'Today performance' : `${activeDateRange.label} performance`}
                  </p>
                </div>
                <span className="text-2xl">{completionRatePct >= 80 ? '🟢' : completionRatePct >= 60 ? '🟡' : '🔴'}</span>
              </div>
              <div className="space-y-3.5">
                {[
                  { label: 'Collected', value: `AED ${periodRevenue.toLocaleString()}`, pct: Math.min(100, Math.round((periodRevenue / 100000) * 100)), color: '#059669' },
                  { label: 'Completion Rate', value: `${completionRatePct}%`, pct: completionRatePct, color: '#0369a1' },
                  { label: 'Repeat Client Rate', value: `${repeatRate}%`, pct: repeatRate, color: '#d97706' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[12px] text-slate-600 font-medium">{item.label}</span>
                      <span className="text-[12px] font-bold text-[#111827]">{item.value}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${item.pct}%`, background: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Crew Availability */}
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-[#111827]">Crew Availability</h3>
              <p className="text-sm text-[#6B7280]">Cleaners right now (Dubai time)</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          {activeEmps.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No active employees yet</p>
          ) : (
            <div className="space-y-4">
              {(() => {
                // R-OPS-16: cleaners right now (Dubai time) — working, next job today, or free; working first
                const rows = activeEmps.map(emp => ({ emp, cur: currentJobOf(emp, validDailyJobs, todayStr, nowMin) }))
                const rank = (r: typeof rows[number]) => (r.cur?.when === 'now' ? 0 : r.cur?.when === 'next' ? 1 : 2)
                rows.sort((x, y) => rank(x) - rank(y) || x.emp.full_name.localeCompare(y.emp.full_name))
                const working = rows.filter(r => r.cur?.when === 'now').length
                const colors = [{ bg: 'bg-emerald-100', text: 'text-emerald-700' }, { bg: 'bg-amber-100', text: 'text-amber-700' }, { bg: 'bg-sky-100', text: 'text-sky-700' }]
                return (<>
                  <p className="text-[12px] text-slate-500 -mt-2"><b className="text-slate-800">{working}</b> working now · <b className="text-slate-800">{rows.filter(r => r.cur?.when === 'next').length}</b> with a job later · <b className="text-slate-800">{rows.filter(r => !r.cur || r.cur.when === 'last').length}</b> free now</p>
                  {rows.slice(0, 5).map(({ emp, cur }, i) => {
                    const initials = emp.full_name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
                    const c = colors[i % colors.length]
                    const tag = cur?.when === 'now' ? { t: 'Working', cls: 'bg-sky-100 text-sky-700' } : cur?.when === 'next' ? { t: `Next ${cur.job.start_time || ''}`.trim(), cls: 'bg-amber-100 text-amber-700' } : { t: 'Free', cls: 'bg-emerald-100 text-emerald-700' }
                    return (
                      <div key={emp.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-full ${c.bg} flex items-center justify-center font-bold text-sm ${c.text} shrink-0`}>{initials}</div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-[#111827] truncate">{emp.full_name}</p>
                            <p className="text-xs text-[#6B7280] truncate">{cur && cur.when !== 'last' ? (cur.job.address || cur.job.area || 'Job') : 'Available'}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${tag.cls}`}>{tag.t}</span>
                      </div>
                    )
                  })}
                </>)
              })()}
            </div>
          )}
        </div>

        {/* Coverage */}
        <div className="xl:col-span-2 bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-[#111827]">
                {datePreset === 'today' ? "Today's Coverage" : `Coverage (${activeDateRange.label})`}
              </h3>
              <p className="text-sm text-[#6B7280]">Active service areas — {unifiedJobs.length} jobs</p>
            </div>
            <button onClick={() => navigate('/daily-jobs')} className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-semibold hover:bg-emerald-200 transition-colors">
              Open Daily Sheet
            </button>
          </div>
          {unifiedJobs.length === 0 ? (
            <div className="h-[180px] rounded-[20px] bg-slate-50 border border-[#E4E8EC] flex items-center justify-center">
              <div className="text-center">
                <p className="text-slate-400 text-sm">No jobs in this period</p>
                <button onClick={() => navigate('/bookings')} className="mt-2 text-emerald-600 font-semibold text-sm hover:underline">+ Schedule a job</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {(() => {
                const areas: Record<string, { total: number; live: number; done: number }> = {}
                unifiedJobs.forEach(b => {
                  const area = b.area || b.address.split(',')[1]?.trim() || b.address.split(',')[0]?.trim() || 'Dubai'
                  if (!areas[area]) areas[area] = { total: 0, live: 0, done: 0 }
                  areas[area].total++
                  if (b.status === 'in_progress') areas[area].live++
                  if (b.status === 'completed')   areas[area].done++
                })
                return Object.entries(areas).sort((a, b) => b[1].total - a[1].total).slice(0, 4).map(([area, counts]) => (
                  <div key={area} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-[#E4E8EC]">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${counts.live > 0 ? 'bg-emerald-500' : counts.done === counts.total ? 'bg-slate-400' : 'bg-blue-400'}`} />
                    <span className="text-[13px] font-semibold text-[#111827] flex-1 truncate">{area}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {counts.live > 0 && <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{counts.live} live</span>}
                      <span className="text-[11px] text-slate-500">{counts.total} job{counts.total > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      </section>

      {/* ── Charts (R-OPS-16: Service Mix removed) ── */}
      <section className="mb-6">
        <RevenueChart
          bookings={bookings}
          dailyJobs={validDailyJobs}
          monthlyPayments={monthlyPayments}
          invoices={invoices}
        />
      </section>

      {/* ── Dispatch & Bookings Table ── */}
      <section className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="p-5 border-b border-[#E4E8EC] flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-bold text-[#111827] mb-1">
              {datePreset === 'today' ? "Today's Dispatch & Shifts" : `Operational Jobs & Dispatch (${activeDateRange.label})`}
            </h3>
            <p className="text-sm text-[#6B7280]">
              {displayDispatchBookings.length} jobs · {periodLive.length} live, {periodConfirmed.length} scheduled, {periodCompleted.length} completed
            </p>
          </div>
          <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'live', label: 'Live' },
              { id: 'scheduled', label: 'Scheduled' },
              { id: 'completed', label: 'Completed' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setDispatchTab(tab.id as any)}
                className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  dispatchTab === tab.id
                    ? 'bg-white shadow-xs text-[#111827]'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {displayDispatchBookings.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-[15px]">
              No jobs or bookings {datePreset === 'today' ? 'scheduled for today' : `found for ${activeDateRange.label}`}
            </p>
            <div className="flex items-center justify-center gap-4 mt-4">
              <button onClick={() => navigate('/bookings')} className="text-emerald-600 font-semibold text-sm hover:underline">
                + Add a booking
              </button>
              <button onClick={() => navigate('/daily-jobs')} className="text-teal-600 font-semibold text-sm hover:underline">
                → Open Daily Job Sheet
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50 text-left text-sm text-[#6B7280]">
                <tr>
                  <th className="px-7 py-4 font-semibold">{datePreset === 'today' ? 'Time' : 'Date & Time'}</th>
                  <th className="px-7 py-4 font-semibold">Client</th>
                  <th className="px-7 py-4 font-semibold">Service</th>
                  <th className="px-7 py-4 font-semibold">Staff / Crew</th>
                  <th className="px-7 py-4 font-semibold">Status</th>
                  <th className="px-7 py-4 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {displayDispatchBookings.map((b, idx) => (
                  <tr key={b.id} className="border-t border-[#E4E8EC] hover:bg-slate-50 transition-all">
                    <td className="px-7 py-5 font-semibold text-[#111827]">
                      {datePreset === 'today' ? (
                        formatTime(`${b.date}T${b.time}`) || b.time
                      ) : (
                        <div>
                          <p className="font-bold text-[#111827] text-[13px]">{b.date}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{b.time}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-7 py-5">
                      <div className="flex items-center gap-4">
                        <Avatar name={b.clientName} idx={idx} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-[#111827]">{b.clientName}</p>
                            {(b as any).isMonthly && (
                              <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                                Monthly
                              </span>
                            )}
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {b.source}
                            </span>
                          </div>
                          <p className="text-sm text-[#6B7280]">{b.address}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-7 py-5 font-medium text-[#111827]">{b.service}</td>
                    <td className="px-7 py-5 text-sm text-slate-600 font-medium">{b.staff}</td>
                    <td className="px-7 py-5"><StatusPill status={b.status} /></td>
                    <td className="px-7 py-5 font-bold text-[#111827]">
                      AED {b.amount.toLocaleString()}
                      {b.paymentMode && (
                        <span className="block text-[11px] font-normal text-slate-400 mt-0.5">
                          {b.paymentMode}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-6 border-t border-[#E4E8EC] flex justify-between items-center">
          <p className="text-sm text-[#6B7280]">
            Showing {displayDispatchBookings.length} {activeDateRange.label} · {unifiedJobs.length} total period records
          </p>
          <div className="flex items-center gap-4">
            <Link to="/daily-jobs" className="text-[#059669] font-semibold hover:underline flex items-center gap-1.5 text-sm">
              Daily Job Sheet <ArrowRight size={14} />
            </Link>
            <Link to="/bookings" className="text-[#059669] font-semibold hover:underline flex items-center gap-1.5 text-sm">
              Bookings <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}

