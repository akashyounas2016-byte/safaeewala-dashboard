import { useState, useRef, useEffect, useMemo, Fragment, type ElementType, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  CalendarCheck, Users, DollarSign, Star,
  ArrowUpRight, ArrowDownRight, Minus, ArrowRight,
  AlertCircle, Clock, FileText, MessageCircle,
  Calendar, RotateCcw, Package, Gauge, Timer, UserPlus, Receipt, Pencil, Search, ExternalLink, Activity, Columns3,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { LiveOpsPanel } from '@/components/overview/LiveOpsPanel'
import { usePeriodLeadCounts } from '@/components/overview/usePeriodLeadCounts'
import { overviewRange, jobProgressByTime, crewMembers, dispatchedNames, onJobs, repeatClientRate, dubaiMinutes } from '@/lib/overviewStats'
import { currentJobOf } from '@/lib/liveOps'
import { ReportsPanel } from '@/components/overview/ReportsPanel'
import { useFolded, FoldButton, FoldSection } from '@/components/overview/Foldable'
import { CardsCustomizer, useCardPrefs } from '@/components/overview/CardsCustomizer'
import { EditJobModal } from '@/components/dailyJobSheet/EditJobModal'
import { CLOSED_DAYS_KEY, type ClosedDay } from '@/lib/closedDays'
import { notify } from '@/lib/notify'
import { useModuleAccess } from '@/store/useModuleAccess'
import { Button } from '@/components/ui/Button'
import { crewMotion, fmtMin, type CrewMotion } from '@/lib/crewMotion'
import { useJobCheckins } from '@/lib/jobCheckins'
import { parseTimeToMinutes } from '@/components/dailyJobSheet/jobSheetUtils'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { useCurrentUser } from '@/store/UserContext'
import type { Booking, BookingFrequency, DailyJob, DailyPendingItem, DailyPendingReceivedItem, Invoice } from '@/types'
import { invoicedJobIds, invoiceBalance } from '@/lib/receivables'
import { cleanClientNameFromAddress, isBogusJob, buildPendingCalcContext, loadClientAdjustments, calcJobCollectable, jobCollected } from '@/lib/clientDataSync'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { todayDubai, toDubaiDate } from '@/lib/dubaiTime'
import { cleanNum, formatTime12h } from '@/components/dailyJobSheet/jobSheetUtils'


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

/** R-OPS-23: the Overview cards (default order) for the Cards pop-up */
const OV_CARDS = [{ id: 'jobs', label: 'Jobs' }, { id: 'collected', label: 'Collected' }, { id: 'pending', label: 'Pending Collection' }, { id: 'completion', label: 'Completion Rate' }, { id: 'active_cleaners', label: 'Active Cleaners' }, { id: 'crew_util', label: 'Crew Utilization' }, { id: 'hours', label: 'Hours Worked' }, { id: 'low_stock', label: 'Low Stock Alerts' }, { id: 'leads', label: 'Fluent Form Leads' }, { id: 'wa_clicks', label: 'WhatsApp Clicks' }, { id: 'new_clients', label: 'New Clients' }, { id: 'expenses', label: 'Expenses' }]
/** R-OPS-24: hidden at first (shown again under "Cards") — a cleaner first screen */
const OV_CARDS_HIDDEN = ['leads', 'wa_clicks', 'low_stock', 'completion']

/* ─── KPI Card — R-OPS-17: compact, 4 per row ─── */
interface KpiCardProps {
  label: string; value: string | number; sub: string
  delta?: string; trend?: 'up' | 'down' | 'neutral'
  icon: ElementType; iconColor: string; iconBg: string
  onClick?: () => void
  /** a soft tint for the alert cards (pending money, low stock, crew) */
  tint?: string
}
function KpiCard({ label, value, sub, delta, trend = 'neutral', icon: Icon, iconColor, iconBg, onClick, tint }: KpiCardProps) {
  const trendColor = trend === 'up' ? '#059669' : trend === 'down' ? '#ef4444' : '#475569'
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus
  return (
    <div
      onClick={onClick}
      // R-OPS-20: each card a light shade of its own colour, a soft sweep on hover (index.css .ov-card)
      className={`ov-card rounded-[18px] p-4 border shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-300 min-w-0 ${onClick ? 'cursor-pointer hover:shadow-[0_10px_28px_rgba(15,23,42,0.12)] hover:-translate-y-1' : ''}`}
      style={{ background: `linear-gradient(145deg, ${iconBg} 0%, ${tint || '#ffffff'} 62%)`, borderColor: `${iconColor}26` }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="ov-card-icon w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 shadow-sm" style={{ background: '#ffffffcc', boxShadow: `0 0 0 1px ${iconColor}22` }}>
          <Icon size={17} style={{ color: iconColor }} strokeWidth={2.2} />
        </div>
        {delta && (
          <div className="flex items-center gap-0.5 text-[10.5px] font-bold px-2 py-1 rounded-full truncate max-w-[60%]"
            style={{ color: trendColor, background: trend === 'up' ? '#d1fae5' : trend === 'down' ? '#fee2e2' : '#f1f5f9' }}>
            <TrendIcon size={11} strokeWidth={2.5} className="shrink-0" />
            <span className="truncate">{delta}</span>
          </div>
        )}
      </div>
      <p className="text-[22px] font-black text-[#111827] leading-none tracking-tight truncate">{value}</p>
      <p className="text-[12.5px] font-bold text-[#111827] mt-1.5 truncate" title={label}>{label}</p>
      <p className="text-[11.5px] text-[#6B7280] mt-0.5 truncate" title={sub}>{sub}</p>
    </div>
  )
}

/* ─── Live Activity — R-OPS-17: full width, can be hidden. R-OPS-20: the crew in motion on top ─── */
const CREW_STYLE: Record<CrewMotion['state'], { label: string; tone: string; bg: string; bar: string }> = {
  working: { label: 'Cleaning', tone: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', bar: 'bg-emerald-500' },
  on_way: { label: 'On the way', tone: 'text-sky-700', bg: 'bg-sky-50 border-sky-200', bar: 'bg-sky-500' },
  later: { label: 'Later today', tone: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', bar: 'bg-slate-400' },
  done: { label: 'Day done', tone: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', bar: 'bg-violet-500' },
}
function CrewCard({ c }: { c: CrewMotion }) {
  const st = CREW_STYLE[c.state]
  const initials = c.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div className={`ov-pop rounded-xl border p-3 min-w-0 ${st.bg}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="relative w-9 h-9 rounded-full bg-white border border-white shadow-sm flex items-center justify-center text-[11px] font-black text-slate-700 shrink-0">
          {initials}
          {c.state === 'working' && <span className="absolute -right-1 -bottom-1 text-[13px] ov-scrub" aria-hidden>🧽</span>}
          {c.state === 'done' && <span className="absolute -right-1 -bottom-1 text-[12px]" aria-hidden>✅</span>}
          {c.state === 'working' && <span className="absolute inset-0 rounded-full ring-2 ring-emerald-400/60 animate-ping" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold text-[#111827] truncate" title={c.name}>{c.name}</p>
          <p className={`text-[11px] font-bold ${st.tone} truncate`}>{st.label}{c.fromStep ? ' · from My Duties' : ''}</p>
        </div>
        <span className="text-[10.5px] font-bold text-slate-500 shrink-0 tabular-nums">{c.jobsDone}/{c.jobsToday}</span>
      </div>
      <p className="text-[11px] text-slate-600 mt-2 truncate" title={c.place}>{c.state === 'on_way' ? 'To ' : c.state === 'done' ? 'Last: ' : ''}{c.place}{c.area ? ` · ${c.area}` : ''}</p>
      {c.state === 'working' && (
        <div className="mt-1.5">
          <div className="h-1.5 rounded-full bg-white overflow-hidden"><div className={`h-full rounded-full ov-progress ${st.bar}`} style={{ width: `${c.progress}%` }} /></div>
          <p className="text-[10.5px] text-slate-500 mt-1 tabular-nums">{fmtMin(c.start)} – {fmtMin(c.end)} · {c.progress}%</p>
        </div>
      )}
      {c.state === 'on_way' && (
        <div className="mt-1.5">
          <div className="relative h-4"><div className="absolute inset-x-0 top-1/2 h-0.5 ov-road" /><span className="ov-van text-[14px]" aria-hidden>🚐</span></div>
          <p className="text-[10.5px] text-slate-500 tabular-nums">Starts {fmtMin(c.start)}</p>
        </div>
      )}
      {(c.state === 'later' || c.state === 'done') && (
        <p className="text-[10.5px] text-slate-500 mt-1 tabular-nums">{c.state === 'later' ? `Next ${fmtMin(c.start)} – ${fmtMin(c.end)}` : `Finished ${fmtMin(c.end)}`}</p>
      )}
    </div>
  )
}
function LiveActivityPanel({ events, crew, onOpen }: { events: { icon: string; title: string; sub: string; bg: string; route: string }[]; crew: CrewMotion[]; onOpen: (route: string) => void }) {
  const [folded, toggle] = useFolded('liveActivity', true) // R-OPS-26: starts folded
  const [showAll, setShowAll] = useState(false)
  const n = (st: CrewMotion['state']) => crew.filter(c => c.state === st).length
  const shownCrew = showAll ? crew : crew.slice(0, 8)
  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <div className={`flex items-center justify-between gap-3 flex-wrap ${folded ? '' : 'mb-4'}`}>
        <div>
          <h3 className="text-xl font-bold text-[#111827] mb-1 flex items-center gap-2"><Activity size={19} className="text-emerald-600" /> Live Activity
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" /></h3>
          <p className="text-sm text-[#6B7280]">Who is cleaning, who is on the way, and the latest business events</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {!folded && crew.length > 0 && (['working', 'on_way', 'later', 'done'] as const).map(st => (
            <span key={st} className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${CREW_STYLE[st].bg} ${CREW_STYLE[st].tone}`}>{CREW_STYLE[st].label} {n(st)}</span>
          ))}
          <FoldButton folded={folded} onToggle={toggle} />
        </div>
      </div>
      {!folded && (
        <>
          {crew.length > 0 && (
            <div className="mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {shownCrew.map(c => <CrewCard key={c.name} c={c} />)}
              </div>
              {crew.length > 8 && (
                <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 text-[12px] font-bold text-emerald-700 hover:underline cursor-pointer">
                  {showAll ? 'Show less' : `Show all ${crew.length} cleaners`}
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Latest events</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {events.map((ev, i) => (
              <div key={i} onClick={() => ev.route && onOpen(ev.route)} style={{ animationDelay: `${i * 40}ms` }}
                className={`ov-pop flex gap-3 p-3 rounded-xl border border-slate-100 transition-colors min-w-0 ${ev.route ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                <div className={`w-10 h-10 rounded-full ${ev.bg} flex items-center justify-center shrink-0`}><span>{ev.icon}</span></div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13px] text-[#111827] truncate" title={ev.title}>{ev.title}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5 truncate" title={ev.sub}>{ev.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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
  const { bookings, clients, employees, invoices, inventory, dailyExpenses, dailyJobs, updateDailyJob } = useData()
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
  // R-OPS-18: Dispatch table — search and edit a job right here (same Edit Job pop-up as the Daily Job Sheet)
  const [dispatchQ, setDispatchQ] = useState('')
  // R-OPS-20: Dispatch columns can be hidden (remembered on this computer)
  const [hiddenCols, setHiddenCols] = useState<string[]>(() => safeLocalStorageGet<string[]>('safaeewala_overview_dispatch_hidden', []))
  const [colsOpen, setColsOpen] = useState(false)
  const toggleCol = (id: string) => setHiddenCols(prev => { const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]; safeLocalStorageSet('safaeewala_overview_dispatch_hidden', next); return next })
  const showCol = (id: string) => !hiddenCols.includes(id)
  // R-OPS-23: which cards show and in what order (saved on this computer)
  const [cardPrefs, setCardPrefs] = useCardPrefs(OV_CARDS.map(c => c.id), OV_CARDS_HIDDEN)
  const [editJob, setEditJob] = useState<DailyJob | null>(null)
  const canEditJobs = useModuleAccess('Daily Job Sheet')

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
      /** R-OPS-20: start and end shown together in the Time column */
      start: string
      end: string
      clientName: string
      address: string
      area: string
      service: string
      status: 'in_progress' | 'confirmed' | 'completed' | 'pending' | 'cancelled'
      amount: number
      paymentMode: string
      staff: string
      source: 'Daily Job Sheet' | 'Booking'
      job?: DailyJob
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
        start: j.start_time || '',
        end: j.end_time || '',
        clientName: cleanClient,
        address: j.address || j.area || 'Dubai',
        area: j.area || 'Dubai',
        service: j.service || 'Cleaning Shift',
        status,
        amount: cleanNum(j.charges) || cleanNum(j.received),
        paymentMode: j.payment_mode || 'Cash',
        staff: j.staff_name || 'Staff',
        source: 'Daily Job Sheet',
        job: j,
      })
    })

    // 2. Bookings in period
    periodBookings.forEach(b => {
      list.push({
        id: b.id,
        date: b.scheduled_date,
        time: b.scheduled_time || '—',
        start: b.scheduled_time || '',
        end: b.end_time || (() => { const m = parseTimeToMinutes(b.scheduled_time); return m !== null && Number(b.duration_hours) > 0 ? fmtMin(m + Math.round(Number(b.duration_hours) * 60)) : '' })(),
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
    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || ((parseTimeToMinutes(a.start) ?? 9999) - (parseTimeToMinutes(b.start) ?? 9999)))
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
    const byTab = dispatchTab === 'live' ? unifiedJobs.filter(j => j.status === 'in_progress')
      : dispatchTab === 'scheduled' ? unifiedJobs.filter(j => j.status === 'confirmed')
      : dispatchTab === 'completed' ? unifiedJobs.filter(j => j.status === 'completed')
      : unifiedJobs
    const t = dispatchQ.trim().toLowerCase()
    return t ? byTab.filter(j => [j.clientName, j.address, j.area, j.service, j.staff, j.paymentMode].some(v => String(v || '').toLowerCase().includes(t))) : byTab
  }, [unifiedJobs, dispatchTab, dispatchQ])

  // R-OPS-17: more cards — hours worked, new clients, expenses of the period
  const periodHours = Math.round(periodDailyJobs.reduce((s, j) => s + cleanNum(j.duty_hours), 0) * 10) / 10
  const periodNewClients = clients.filter(c => c.created_at && isDateInRange(toDubaiDate(new Date(c.created_at)))).length
  const periodExpenseList = dailyExpenses.filter(e => isDateInRange(e.date))
  const periodExpenses = periodExpenseList.reduce((s, e) => s + cleanNum(e.amount), 0)
  const periodWord = datePreset === 'today' ? 'today' : datePreset === 'yesterday' ? 'yesterday' : activeDateRange.label

  // R-OPS-18: a closed day stays locked here too (Daily Job Sheet → Close Day)
  const openEdit = (job: DailyJob) => {
    const closed = safeLocalStorageGet<Record<string, ClosedDay>>(CLOSED_DAYS_KEY, {})
    if (closed[job.date]) { notify.error(`${job.date} is closed. Reopen the day on the Daily Job Sheet to change it.`); return }
    setEditJob(job)
  }

  // R-OPS-20: what each cleaner is doing now (job steps from My Duties win over the clock)
  const todayCheckins = useJobCheckins(todayStr)
  const crew = useMemo(() => crewMotion(dailyJobs, Object.values(todayCheckins.rows), todayStr, nowMin), [dailyJobs, todayCheckins.rows, todayStr, nowMin])

  /* ── Live Activity from real data ── */
  const liveEvents: { icon: string; title: string; sub: string; bg: string; route: string }[] = []
  
  // Recent Daily Jobs
  const recentJobs = [...validDailyJobs].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 4)
  recentJobs.forEach(j => {
    const cleanClient = cleanClientNameFromAddress(j.address || j.area || 'Client')
    liveEvents.push({
      icon: '🧹', bg: 'bg-emerald-100', route: '/daily-job-sheet',
      title: `Job: ${cleanClient}`,
      sub: `${j.service || 'Cleaning'} · ${j.staff_name} · AED ${(cleanNum(j.charges) || cleanNum(j.received)).toLocaleString()}`,
    })
  })

  // Recent Bookings
  const recentBookings = [...bookings].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 2)
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

  const displayEvents = liveEvents.length > 0 ? liveEvents.slice(0, 8) : [
    { icon: '👋', bg: 'bg-slate-100', route: '', title: 'No activity yet', sub: 'Add a job or invoice to see events here' },
  ]

  // R-OPS-23: the cards by id — shown in the order and with the hidden ones chosen under "Cards"
  const cardNodes: Record<string, ReactNode> = {
    jobs: (
        <KpiCard
        label={datePreset === 'today' ? 'Jobs Today' : datePreset === 'yesterday' ? 'Jobs Yesterday' : datePreset === 'all' ? 'Total Jobs' : `Jobs (${activeDateRange.label})`}
        value={unifiedJobs.length}
        sub={`${periodLive.length} live · ${periodConfirmed.length} scheduled · ${periodCompleted.length} done`}
        delta={unifiedJobs.length > 0 ? `+${unifiedJobs.length}` : '0'}
        trend={unifiedJobs.length > 0 ? 'up' : 'neutral'}
        icon={CalendarCheck} iconBg="#d1fae5" iconColor="#059669"
        onClick={() => navigate('/daily-job-sheet')}
      />
    ),
    collected: (
        <KpiCard
        label={datePreset === 'today' ? 'Collected Today' : datePreset === 'yesterday' ? 'Collected Yesterday' : datePreset === 'all' ? 'Total Collected' : `Collected (${activeDateRange.label})`}
        value={`AED ${periodRevenue.toLocaleString()}`}
        sub={`From ${periodCompleted.length + periodLive.length} done & live jobs`}
        trend={periodRevenue > 0 ? 'up' : 'neutral'}
        icon={DollarSign} iconBg="#e0f2fe" iconColor="#0369a1"
        onClick={() => navigate('/payments?tab=history')}
      />
    ),
    pending: (
        <KpiCard
        label="Pending Collection"
        value={`AED ${totalPendingAmount.toLocaleString()}`}
        sub={totalPendingCount > 0 ? `${totalPendingCount} items · ${dailyPendingCount + sidePendingCount} Job Sheet · ${invoicePendingCount} invoices` : 'All payments collected'}
        delta={totalPendingCount > 0 ? `${totalPendingCount} open` : 'settled'}
        trend={totalPendingCount > 0 ? 'down' : 'up'}
        icon={AlertCircle} iconBg="#fee2e2" iconColor="#dc2626" tint="#fff7f7"
        onClick={() => navigate('/payments?tab=outstanding')}
      />
    ),
    completion: (
        <KpiCard
        label="Completion Rate"
        value={`${completionRatePct}%`}
        sub={`${periodCompleted.length} of ${nonCancelledJobs.length} jobs done`}
        delta={completionRatePct >= 80 ? 'on track' : 'in progress'}
        trend={completionRatePct >= 80 ? 'up' : 'neutral'}
        icon={Star} iconBg="#ede9fe" iconColor="#7c3aed"
        onClick={() => navigate('/reports')}
      />
    ),
    active_cleaners: (
        <KpiCard
        label="Active Cleaners"
        value={activeEmps.length}
        sub={`${dispatchedStaffSet.size} on jobs ${periodWord} · ${employees.length} total staff`}
        icon={Users} iconBg="#fef3c7" iconColor="#d97706"
        onClick={() => navigate('/employees')}
      />
    ),
    crew_util: (
        <KpiCard
        label="Crew Utilization"
        value={`${crewUtilization}%`}
        sub={`${dispatchedStaffSet.size} of ${activeEmps.length} cleaners dispatched ${periodWord}`}
        delta={crewUtilization >= 70 ? 'healthy' : 'low'}
        trend={crewUtilization >= 70 ? 'up' : 'down'}
        icon={Gauge} iconBg="#d1fae5" iconColor="#047857" tint="#f6fdf9"
        onClick={() => navigate('/employees')}
      />
    ),
    hours: (
        <KpiCard
        label={`Hours Worked (${activeDateRange.label})`}
        value={`${periodHours.toLocaleString()} h`}
        sub={`${periodDailyJobs.length} Job Sheet rows · duty hours`}
        icon={Timer} iconBg="#cffafe" iconColor="#0e7490"
        onClick={() => navigate('/attendance')}
      />
    ),
    low_stock: (
        <KpiCard
        label="Low Stock Alerts"
        value={lowStockItems.length}
        sub={lowStockItems.length > 0 ? `${lowStockItems[0].name} needs reorder` : 'All items stocked'}
        delta={lowStockItems.length > 0 ? 'reorder' : 'ok'}
        trend={lowStockItems.length > 0 ? 'down' : 'up'}
        icon={Package} iconBg="#fef3c7" iconColor="#b45309" tint={lowStockItems.length > 0 ? '#fffbeb' : undefined}
        onClick={() => navigate('/inventory')}
      />
    ),
    leads: (
        <KpiCard
        label={`Fluent Form Leads (${activeDateRange.label})`}
        value={leadCounts.forms ?? '…'}
        sub={leadCounts.formsNew == null ? 'Website form submissions' : `${leadCounts.formsNew} still new · website forms`}
        delta={leadCounts.forms ? `+${leadCounts.forms}` : '0'}
        trend={leadCounts.forms ? 'up' : 'neutral'}
        icon={FileText} iconBg="#e0e7ff" iconColor="#4f46e5"
        onClick={() => navigate('/fluent-forms')}
      />
    ),
    wa_clicks: (
        <KpiCard
        label={`WhatsApp Clicks (${activeDateRange.label})`}
        value={leadCounts.clicks ?? '…'}
        sub={leadCounts.clicksMobile == null ? 'WhatsApp buttons on the website' : `${leadCounts.clicksMobile} from mobile · website buttons`}
        delta={leadCounts.clicks ? `+${leadCounts.clicks}` : '0'}
        trend={leadCounts.clicks ? 'up' : 'neutral'}
        icon={MessageCircle} iconBg="#dcfce7" iconColor="#16a34a"
        onClick={() => navigate('/whatsapp-clicks')}
      />
    ),
    new_clients: (
        <KpiCard
        label={`New Clients (${activeDateRange.label})`}
        value={periodNewClients}
        sub={`${clients.length} clients in total`}
        delta={periodNewClients ? `+${periodNewClients}` : '0'}
        trend={periodNewClients ? 'up' : 'neutral'}
        icon={UserPlus} iconBg="#fce7f3" iconColor="#be185d"
        onClick={() => navigate('/clients')}
      />
    ),
    expenses: (
        <KpiCard
        label={`Expenses (${activeDateRange.label})`}
        value={`AED ${periodExpenses.toLocaleString()}`}
        sub={`${periodExpenseList.length} expense${periodExpenseList.length === 1 ? '' : 's'} · Daily Job Sheet & direct`}
        icon={Receipt} iconBg="#f1f5f9" iconColor="#475569"
        onClick={() => navigate('/expenses')}
      />
    ),
  }
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
          <CardsCustomizer cards={OV_CARDS} prefs={cardPrefs} onChange={setCardPrefs} defaultHidden={OV_CARDS_HIDDEN} />
        </div>
      </div>

      {/* ── KPI Cards — R-OPS-17: compact, 4 per row; Pending, Low Stock and Crew Utilization moved up here ── */}
      <section className="ov-cards grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 mb-6">
        {cardPrefs.order.filter(id => !cardPrefs.hidden.includes(id) && cardNodes[id]).map(id => <Fragment key={id}>{cardNodes[id]}</Fragment>)}
      </section>

      {/* ── R-OPS-20: Live Map right after the cards, then Live Activity and Reports (each full width, each can be hidden) ── */}
      <section className="mb-6"><LiveOpsPanel /></section>
      <section className="mb-6"><LiveActivityPanel events={displayEvents} crew={datePreset === 'today' ? crew : []} onOpen={route => navigate(route)} /></section>
      <section className="mb-6"><ReportsPanel /></section>

      {/* R-OPS-26: the data widgets start folded — one line each, Show to open (kept per computer) */}
      <FoldSection id="crewCoverage" title="Crew Availability · Today's Coverage" note="Cleaners now and the areas covered">
      {/* ── R-OPS-17: Crew Availability and Today's Coverage, half and half ── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
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
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-[#111827]">
                {datePreset === 'today' ? "Today's Coverage" : `Coverage (${activeDateRange.label})`}
              </h3>
              <p className="text-sm text-[#6B7280]">Active service areas — {unifiedJobs.length} jobs</p>
            </div>
            <button onClick={() => navigate('/daily-job-sheet')} className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-semibold hover:bg-emerald-200 transition-colors">
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

      </FoldSection>
      <FoldSection id="revenueHealth" title="Revenue vs Target · Business Health" note="Monthly revenue and the health of the period">
      {/* ── R-OPS-17: Revenue vs Target (70 %) and Business Health (30 %). R-OPS-16: Service Mix removed ── */}
      <section className="grid grid-cols-1 lg:grid-cols-10 gap-5 items-stretch">
        <div className="lg:col-span-7 min-w-0">
          <RevenueChart
            bookings={bookings}
            dailyJobs={validDailyJobs}
            monthlyPayments={monthlyPayments}
            invoices={invoices}
          />
        </div>
        {/* Business Performance */}
        {(() => {
          // R-OPS-16: repeat clients from the job sheet (total_bookings is not kept up to date)
          const repeatRate = repeatClientRate(validDailyJobs, clients.length)
          // R-OPS-17: collection rate = collected on the period's Job Sheet rows / billed on them
          const billed = periodDailyJobs.reduce((s, j) => s + cleanNum(j.charges), 0)
          const collectedOnJobs = periodDailyJobs.reduce((s, j) => s + jobCollected(j), 0)
          const collectionRate = billed > 0 ? Math.min(100, Math.round((collectedOnJobs / billed) * 100)) : 0
          return (
            <div className="lg:col-span-3 bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
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
                  { label: 'Crew Utilization', value: `${crewUtilization}%`, pct: crewUtilization, color: '#047857' },
                  { label: 'Collection Rate (Job Sheet)', value: billed > 0 ? `${collectionRate}% of AED ${billed.toLocaleString()}` : '—', pct: collectionRate, color: '#7c3aed' },
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

      </section>

      </FoldSection>
      <FoldSection id="dispatch" title={datePreset === 'today' ? "Today's Dispatch & Shifts" : 'Operational Jobs & Dispatch'} note={`${displayDispatchBookings.length} jobs · ${periodLive.length} live`}>
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
          <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={dispatchQ} onChange={e => setDispatchQ(e.target.value)} placeholder="Search client, area, cleaner…" aria-label="Search jobs"
              className="w-[230px] text-[12.5px] pl-9 pr-3 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500" />
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
          <div className="relative">
            <button type="button" onClick={() => setColsOpen(v => !v)} aria-expanded={colsOpen} aria-label="Columns"
              className="h-9 px-3 rounded-xl border border-[#E4E8EC] bg-white text-[12px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer">
              <Columns3 size={14} /> Columns{hiddenCols.length > 0 ? ` (${hiddenCols.length} hidden)` : ''}
            </button>
            {colsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setColsOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#E4E8EC] rounded-2xl shadow-xl z-50 p-2">
                  {([['time', 'Time'], ['client', 'Client'], ['staff', 'Staff / Crew'], ['status', 'Status'], ['amount', 'Amount']] as const).map(([id, label]) => (
                    <label key={id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-[12.5px] font-semibold text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={showCol(id)} onChange={() => toggleCol(id)} className="accent-emerald-600" /> {label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          </div>
        </div>

        {displayDispatchBookings.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-[15px]">
              {dispatchQ.trim() ? `No job matches "${dispatchQ.trim()}"` : <>No jobs or bookings {datePreset === 'today' ? 'scheduled for today' : `found for ${activeDateRange.label}`}</>}
            </p>
            <div className="flex items-center justify-center gap-4 mt-4">
              <button onClick={() => navigate('/bookings')} className="text-emerald-600 font-semibold text-sm hover:underline">
                + Add a booking
              </button>
              <button onClick={() => navigate('/daily-job-sheet')} className="text-teal-600 font-semibold text-sm hover:underline">
                → Open Daily Job Sheet
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50 text-left text-sm text-[#6B7280]">
                <tr>
                  {/* R-OPS-20: Service column removed; Time shows start – end; columns can be hidden */}
                  {showCol('time') && <th className="px-6 py-4 font-semibold">{datePreset === 'today' ? 'Time' : 'Date & Time'}</th>}
                  {showCol('client') && <th className="px-6 py-4 font-semibold">Client</th>}
                  {showCol('staff') && <th className="px-6 py-4 font-semibold">Staff / Crew</th>}
                  {showCol('status') && <th className="px-6 py-4 font-semibold">Status</th>}
                  {showCol('amount') && <th className="px-6 py-4 font-semibold">Amount</th>}
                  <th className="px-5 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayDispatchBookings.map((b, idx) => (
                  <tr key={b.id} className="border-t border-[#E4E8EC] hover:bg-slate-50 transition-all">
                    {showCol('time') && <td className="px-6 py-5 whitespace-nowrap">
                      {datePreset !== 'today' && <p className="font-bold text-[#111827] text-[13px]">{b.date}</p>}
                      <p className="font-semibold text-[#111827] text-[13px] tabular-nums">{b.start ? formatTime12h(b.start) : '—'}</p>
                      <p className="text-[11.5px] text-slate-500 tabular-nums">{b.end ? `to ${formatTime12h(b.end)}` : ''}</p>
                    </td>}
                    {showCol('client') && <td className="px-6 py-5">
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
                    </td>}
                    {showCol('staff') && <td className="px-6 py-5 text-sm text-slate-600 font-medium">{b.staff}</td>}
                    {showCol('status') && <td className="px-6 py-5"><StatusPill status={b.status} /></td>}
                    {showCol('amount') && <td className="px-6 py-5 font-bold text-[#111827]">
                      AED {b.amount.toLocaleString()}
                      {b.paymentMode && (
                        <span className="block text-[11px] font-normal text-slate-400 mt-0.5">
                          {b.paymentMode}
                        </span>
                      )}
                    </td>}
                    <td className="px-5 py-5">
                      {/* R-OPS-18: edit this date's row (R-SCHED-01: only this row, never the monthly schedule) or open it */}
                      <div className="flex justify-end gap-1.5">
                        {b.job && canEditJobs && (
                          <button type="button" onClick={() => openEdit(b.job!)} title="Edit this job" aria-label="Edit job"
                            className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-emerald-700 hover:border-emerald-300 flex items-center justify-center cursor-pointer"><Pencil size={14} /></button>
                        )}
                        <button type="button" onClick={() => navigate(b.job ? `/daily-job-sheet?date=${b.date}` : '/bookings')} title={b.job ? 'Open on the Daily Job Sheet' : 'Open in Bookings'} aria-label="Open"
                          className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-sky-700 hover:border-sky-300 flex items-center justify-center cursor-pointer"><ExternalLink size={14} /></button>
                      </div>
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
            <Link to="/daily-job-sheet" className="text-[#059669] font-semibold hover:underline flex items-center gap-1.5 text-sm">
              Daily Job Sheet <ArrowRight size={14} />
            </Link>
            <Link to="/bookings" className="text-[#059669] font-semibold hover:underline flex items-center gap-1.5 text-sm">
              Bookings <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
      </FoldSection>

      {/* R-OPS-18: same Edit Job pop-up as the Daily Job Sheet; OT is worked out again from the times (R-OT-01) */}
      <EditJobModal
        open={!!editJob}
        job={editJob}
        onClose={() => setEditJob(null)}
        onSave={(id, patch) => { updateDailyJob(id, patch); notify.success('Job updated') }}
        employees={employees}
        existingJobsForDate={editJob ? validDailyJobs.filter(j => j.date === editJob.date) : []}
      />
    </div>
  )
}

