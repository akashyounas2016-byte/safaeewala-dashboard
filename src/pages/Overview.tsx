import { useState, useRef, useEffect, type ElementType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  CalendarCheck, Users, DollarSign, Star,
  ArrowUpRight, ArrowDownRight, Minus, ArrowRight,
  AlertCircle, Clock, CalendarPlus, FileText, UserCheck, ShoppingCart,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatTime } from '@/lib/utils'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { useCurrentUser } from '@/store/UserContext'
import type { Booking, BookingFrequency } from '@/types'

const serviceTypes = [
  'Standard Clean', 'Deep Clean', 'Move-in', 'Move-out',
  'Commercial', 'Post-construction', 'Office', 'Carpet', 'Window',
]

function CrewSelector({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { employees } = useData()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activeEmps = employees.filter(e => e.status === 'active' || e.status === 'engaged_in_project')
  const filtered = search
    ? activeEmps.filter(e => e.full_name.toLowerCase().includes(search.toLowerCase()))
    : activeEmps
  const selectedEmps = activeEmps.filter(e => selected.includes(e.id))
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }
  return (
    <div>
      <p className="text-[12px] font-semibold text-slate-600 mb-2">Assign Crew</p>
      {selectedEmps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedEmps.map(emp => (
            <span key={emp.id} className="inline-flex items-center gap-1 text-[11.5px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-medium">
              {emp.full_name}
              <button type="button" onClick={() => toggle(emp.id)} className="ml-0.5 hover:text-red-600 font-bold leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative" ref={ref}>
        <input
          type="text"
          placeholder={activeEmps.length === 0 ? 'No active employees — add employees first' : 'Search and select cleaners…'}
          value={search}
          onFocus={() => setOpen(true)}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          disabled={activeEmps.length === 0}
          className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50 focus:outline-none focus:border-emerald-400 placeholder-slate-400 disabled:opacity-50 transition-colors"
        />
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-[#E4E8EC] rounded-xl shadow-xl max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-slate-400 px-4 py-3">No employees match "{search}"</p>
            ) : filtered.map(emp => {
              const checked = selected.includes(emp.id)
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => { toggle(emp.id); setSearch('') }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-[#E4E8EC] last:border-0 transition-colors ${checked ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                    {checked && <span className="text-white text-[9px] font-bold">✓</span>}
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#111827]">{emp.full_name}</p>
                    <p className="text-[10.5px] text-slate-400">{emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {selectedEmps.length > 0 && (
        <p className="text-[11px] text-emerald-600 font-medium mt-1.5">{selectedEmps.length} cleaner{selectedEmps.length > 1 ? 's' : ''} assigned</p>
      )}
    </div>
  )
}

function NewBookingForm({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (b: Omit<Booking, 'id' | 'created_at'>) => void
}) {
  const [selectedCrew, setSelectedCrew] = useState<string[]>([])
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData(formRef.current!)
    onAdd({
      client_id: '',
      client_name: fd.get('client_name') as string,
      client_phone: fd.get('client_phone') as string,
      service_address: fd.get('service_address') as string,
      service_type: fd.get('service_type') as string,
      frequency: (fd.get('frequency') as BookingFrequency) || 'once',
      scheduled_date: fd.get('scheduled_date') as string,
      scheduled_time: fd.get('scheduled_time') as string,
      duration_hours: Number(fd.get('duration_hours')) || 3,
      total_amount: Number(fd.get('total_amount')) || 0,
      notes: fd.get('notes') as string,
      status: 'pending',
      assigned_crew: selectedCrew,
    })
    onClose()
  }

  return (
    <form ref={formRef} className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-4">
        <Input name="client_name" label="Client Name" placeholder="Full name" required />
        <Input name="client_phone" label="Phone" placeholder="+971 50 000 0000" />
      </div>
      <Input name="service_address" label="Service Address" placeholder="Street, unit, neighborhood" />
      <div className="grid grid-cols-2 gap-4">
        <Select name="service_type" label="Service Type">
          <option value="">Select service…</option>
          {serviceTypes.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select name="frequency" label="Frequency">
          <option value="once">One-time</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="monthly">Monthly</option>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input name="scheduled_date" label="Date" type="date" required />
        <Input name="scheduled_time" label="Time" type="time" />
        <Input name="duration_hours" label="Duration (hrs)" type="number" min="1" max="12" defaultValue="3" />
      </div>
      <Input name="total_amount" label="Total Amount (AED)" type="number" placeholder="0.00" />
      <CrewSelector selected={selectedCrew} onChange={setSelectedCrew} />
      <Textarea name="notes" label="Notes" placeholder="Access instructions, special requirements…" rows={3} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Create Booking</Button>
      </div>
    </form>
  )
}

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
function RevenueChart({ bookings }: { bookings: Booking[] }) {
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

  bookings
    .filter(b => b.status === 'completed' || b.status === 'in_progress')
    .forEach(b => {
      const key = b.scheduled_date.slice(0, 7)
      const m = months.find(m => m.key === key)
      if (m) m.revenue += b.total_amount
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
          <p className="text-sm text-[#6B7280] mt-1">Business growth performance overview</p>
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
          <p className="text-sm font-semibold text-[#059669] mt-1">All completed jobs</p>
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
          Complete bookings to see revenue data
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

/* ─── Service mix donut ─── */
const CIRC = 238.76
const donutColors = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#cbd5e1']
function ServiceMixDonut({ bookings }: { bookings: Booking[] }) {
  const counts: Record<string, number> = {}
  bookings.forEach(b => { counts[b.service_type] = (counts[b.service_type] || 0) + 1 })
  const total = bookings.length || 1
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, value: Math.round((count / total) * 100) }))

  let offset = 0
  const segments = breakdown.map(s => {
    const dash = (s.value / 100) * CIRC
    const seg = { ...s, dash, offset }
    offset += dash
    return seg
  })

  return (
    <div className="bg-white rounded-[22px] p-5 border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
      <div className="mb-5">
        <h3 className="text-xl font-bold text-[#111827]">Service Mix</h3>
        <p className="text-sm text-[#6B7280] mt-1">Most booked cleaning services</p>
      </div>

      <div className="flex justify-center my-2">
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="38" fill="none" stroke="#f1f5f9" strokeWidth="11" />
            {segments.length === 0 ? (
              <circle cx="50" cy="50" r="38" fill="none" stroke="#e2e8f0" strokeWidth="11" />
            ) : segments.map((seg, i) => (
              <circle key={seg.name} cx="50" cy="50" r="38" fill="none"
                stroke={donutColors[i % donutColors.length]} strokeWidth="11"
                strokeDasharray={`${seg.dash} ${CIRC}`}
                strokeDashoffset={-seg.offset}
                transform="rotate(-90 50 50)" />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#94a3b8] font-semibold">Jobs</p>
            <p className="text-[28px] font-bold text-[#111827] leading-none mt-0.5">{bookings.length}</p>
            <p className="text-[11px] text-[#94a3b8] mt-0.5">total</p>
          </div>
        </div>
      </div>

      {breakdown.length === 0 ? (
        <p className="text-center text-sm text-slate-400 mt-4">No bookings yet</p>
      ) : (
        <div className="mt-6 space-y-4">
          {breakdown.map((s, i) => (
            <div key={s.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: donutColors[i % donutColors.length] }} />
                <p className="text-sm font-medium text-[#111827]">{s.name}</p>
              </div>
              <span className="text-sm font-semibold text-[#111827]">{s.value}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Overview page ─── */
export function Overview() {
  const { bookings, clients, employees, invoices, inventory, addBooking, dailyExpenses } = useData()
  const currentUser = useCurrentUser()
  const [showNewBooking, setShowNewBooking] = useState(false)
  const navigate = useNavigate()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = currentUser?.full_name?.split(' ')[0] || 'there'

  const nonCancelledCount = bookings.length - bookings.filter(b => b.status === 'cancelled').length
  const completionRatePct = nonCancelledCount > 0
    ? Math.round((bookings.filter(b => b.status === 'completed').length / nonCancelledCount) * 100)
    : 0

  const today = new Date().toISOString().split('T')[0]
  const todayBookings = bookings.filter(b => b.scheduled_date === today)
  const liveCount = todayBookings.filter(b => b.status === 'in_progress').length
  const scheduledCount = todayBookings.filter(b => b.status === 'confirmed').length

  const activeEmps = employees.filter(e => e.status === 'active')
  const pendingInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const lowStockItems = inventory.filter(i => i.current_stock <= i.min_stock)
  const todayRevenue = todayBookings
    .filter(b => b.status === 'completed' || b.status === 'in_progress')
    .reduce((sum, b) => sum + b.total_amount, 0)
  const dispatchedToday = todayBookings.filter(b => b.status !== 'cancelled' && b.status !== 'pending').length
  const crewUtilization = activeEmps.length > 0 ? Math.round((dispatchedToday / activeEmps.length) * 100) : 0

  /* ── Live Activity from real data ── */
  const liveEvents: { icon: string; title: string; sub: string; bg: string; route: string }[] = []
  const recentBookings = [...bookings].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 2)
  recentBookings.forEach(b => liveEvents.push({
    icon: '📅', bg: 'bg-emerald-100', route: '/bookings',
    title: `Booking: ${b.client_name}`,
    sub: `${b.service_type} · ${b.scheduled_date}`,
  }))
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
    { icon: '👋', bg: 'bg-slate-100', route: '', title: 'No activity yet', sub: 'Add a booking or invoice to see events here' },
  ]

  const todayDisplay = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      {/* ── Page Hero ── */}
      <PageHero
        title={`${greeting}, ${firstName} 👋`}
        subtitle={`${todayDisplay} · ${todayBookings.length} jobs scheduled · ${liveCount} live now`}
        statusChip="On track"
        actionLabel="New Booking"
        onAction={() => setShowNewBooking(true)}
      />

      {/* ── KPI Cards ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        <KpiCard
          label="Jobs Today" value={todayBookings.length} sub={`${liveCount} live · ${scheduledCount} scheduled`}
          delta={todayBookings.length > 0 ? `+${todayBookings.length}` : '0'} trend={todayBookings.length > 0 ? 'up' : 'neutral'}
          icon={CalendarCheck} iconBg="#d1fae5" iconColor="#059669"
          onClick={() => navigate('/bookings')}
        />
        <KpiCard
          label="Revenue Today" value={`AED ${todayRevenue.toLocaleString()}`} sub="Completed + live jobs"
          delta={todayRevenue > 0 ? '+today' : 'AED 0'} trend={todayRevenue > 0 ? 'up' : 'neutral'}
          icon={DollarSign} iconBg="#e0f2fe" iconColor="#0369a1"
          onClick={() => navigate('/reports')}
        />
        <KpiCard
          label="Active Cleaners" value={activeEmps.length} sub={`${employees.length} total staff`}
          delta={`${activeEmps.length} active`} trend="neutral"
          icon={Users} iconBg="#fef3c7" iconColor="#d97706"
          onClick={() => navigate('/employees')}
        />
        <KpiCard
          label="Completion Rate" value={`${completionRatePct}%`} sub="Completed vs active"
          delta={`${bookings.filter(b=>b.status==='completed').length} done`} trend="up"
          icon={Star} iconBg="#ede9fe" iconColor="#7c3aed"
          onClick={() => navigate('/reports')}
        />
      </section>

      {/* ── Quick Actions + Live Activity ── */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
        {/* Quick Actions */}
        <div className="xl:col-span-2 bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="mb-5">
            <h3 className="text-xl font-bold text-[#111827] mb-1">Quick Actions</h3>
            <p className="text-sm text-[#6B7280]">Fast operational shortcuts for admin staff</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: CalendarPlus, label: 'New Booking',    sub: 'Create customer appointment', bg: 'bg-emerald-100', color: 'text-emerald-600', hover: 'hover:bg-emerald-50', action: () => setShowNewBooking(true) },
              { icon: FileText,     label: 'Create Invoice', sub: 'Generate VAT invoice',         bg: 'bg-sky-100',     color: 'text-sky-600',     hover: 'hover:bg-sky-50',     action: () => navigate('/invoices') },
              { icon: UserCheck,    label: 'Assign Crew',    sub: 'Manage cleaner schedules',     bg: 'bg-amber-100',   color: 'text-amber-600',   hover: 'hover:bg-amber-50',   action: () => navigate('/dispatch') },
              { icon: ShoppingCart, label: 'Purchase Order', sub: 'Restock cleaning supplies',    bg: 'bg-purple-100',  color: 'text-purple-600',  hover: 'hover:bg-purple-50',  action: () => navigate('/inventory') },
            ].map(action => (
              <button key={action.label}
                onClick={action.action}
                className={`group bg-slate-50 ${action.hover} border border-[#E4E8EC] rounded-2xl p-5 transition-all text-left cursor-pointer`}>
                <div className={`w-12 h-12 rounded-2xl ${action.bg} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                  <action.icon size={20} className={action.color} />
                </div>
                <h4 className="font-semibold text-[#111827] mb-1">{action.label}</h4>
                <p className="text-xs text-[#6B7280]">{action.sub}</p>
              </button>
            ))}
          </div>
        </div>

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

      {/* ── Ops Alert Cards ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div
          onClick={() => navigate('/invoices')}
          className="bg-red-50 border border-red-100 rounded-3xl p-6 cursor-pointer hover:shadow-md transition-all hover:border-red-300"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
              <AlertCircle size={20} className="text-red-600" />
            </div>
            <span className="text-red-700 font-semibold text-sm">Action Required</span>
          </div>
          <h3 className="text-2xl font-bold text-red-700">{pendingInvoices.length}</h3>
          <p className="font-semibold text-[#111827] mt-1">Pending Invoices</p>
          <p className="text-sm text-red-600 mt-2">
            {pendingInvoices.length > 0
              ? `AED ${pendingInvoices.reduce((s, i) => s + i.total, 0).toLocaleString()} outstanding`
              : 'All invoices paid'}
          </p>
        </div>

        <div
          onClick={() => navigate('/inventory')}
          className="bg-amber-50 border border-amber-100 rounded-3xl p-6 cursor-pointer hover:shadow-md transition-all hover:border-amber-300"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
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
          onClick={() => navigate('/dispatch')}
          className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 cursor-pointer hover:shadow-md transition-all hover:border-emerald-300"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Clock size={20} className="text-emerald-600" />
            </div>
            <span className="text-emerald-700 font-semibold text-sm">{crewUtilization >= 70 ? 'Healthy' : 'Low'}</span>
          </div>
          <h3 className="text-2xl font-bold text-emerald-700">{crewUtilization}%</h3>
          <p className="font-semibold text-[#111827] mt-1">Crew Utilization</p>
          <p className="text-sm text-emerald-600 mt-2">{dispatchedToday} cleaners dispatched today</p>
        </div>
      </section>

      {/* ── Smart Operations Row ── */}
      <section className="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-6">
        {/* Business Performance */}
        {(() => {
          const allCompleted = bookings.filter(b => b.status === 'completed')
          const allActive    = bookings.filter(b => b.status !== 'cancelled')
          const completionPct = allActive.length > 0 ? Math.round((allCompleted.length / allActive.length) * 100) : 0
          const totalRevenue  = allCompleted.reduce((s, b) => s + b.total_amount, 0)
          const repeatClients = clients.filter(c => c.total_bookings > 1).length
          const repeatRate    = clients.length > 0 ? Math.round((repeatClients / clients.length) * 100) : 0
          return (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-[#111827]">Business Health</h3>
                  <p className="text-sm text-[#6B7280]">All-time performance</p>
                </div>
                <span className="text-2xl">{completionPct >= 80 ? '🟢' : completionPct >= 60 ? '🟡' : '🔴'}</span>
              </div>
              <div className="space-y-3.5">
                {[
                  { label: 'Total Revenue', value: `AED ${totalRevenue.toLocaleString()}`, pct: Math.min(100, Math.round((totalRevenue / 100000) * 100)), color: '#059669' },
                  { label: 'Completion Rate', value: `${completionPct}%`, pct: completionPct, color: '#0369a1' },
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
              <p className="text-sm text-[#6B7280]">Active workforce status</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          {activeEmps.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No active employees yet</p>
          ) : (
            <div className="space-y-4">
              {activeEmps.slice(0, 3).map((emp, i) => {
                const currentJob = todayBookings.find(b => b.assigned_crew.includes(emp.id) && b.status === 'in_progress')
                const initials = emp.full_name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
                const colors = [{ bg: 'bg-emerald-100', text: 'text-emerald-700' }, { bg: 'bg-amber-100', text: 'text-amber-700' }, { bg: 'bg-sky-100', text: 'text-sky-700' }]
                const c = colors[i % colors.length]
                return (
                  <div key={emp.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${c.bg} flex items-center justify-center font-bold text-sm ${c.text}`}>{initials}</div>
                      <div>
                        <p className="font-medium text-sm text-[#111827]">{emp.full_name}</p>
                        <p className="text-xs text-[#6B7280]">{currentJob ? currentJob.service_address.split(',')[0] : 'Available'}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${currentJob ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {currentJob ? 'Assigned' : 'Free'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Today's Coverage */}
        <div className="xl:col-span-2 bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-[#111827]">Today's Coverage</h3>
              <p className="text-sm text-[#6B7280]">Active service areas — {todayBookings.length} jobs</p>
            </div>
            <button onClick={() => navigate('/dispatch')} className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-semibold hover:bg-emerald-200 transition-colors">
              Open Dispatch
            </button>
          </div>
          {todayBookings.length === 0 ? (
            <div className="h-[180px] rounded-[20px] bg-slate-50 border border-[#E4E8EC] flex items-center justify-center">
              <div className="text-center">
                <p className="text-slate-400 text-sm">No jobs today</p>
                <button onClick={() => setShowNewBooking(true)} className="mt-2 text-emerald-600 font-semibold text-sm hover:underline">+ Schedule a job</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {(() => {
                const areas: Record<string, { total: number; live: number; done: number }> = {}
                todayBookings.forEach(b => {
                  const parts = b.service_address.split(',')
                  const area = (parts[parts.length - 1] ?? b.service_address).trim() || 'Unknown'
                  if (!areas[area]) areas[area] = { total: 0, live: 0, done: 0 }
                  areas[area].total++
                  if (b.status === 'in_progress') areas[area].live++
                  if (b.status === 'completed')   areas[area].done++
                })
                return Object.entries(areas).sort((a, b) => b[1].total - a[1].total).map(([area, counts]) => (
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

      {/* ── Charts ── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-5 mb-6">
        <RevenueChart bookings={bookings} />
        <ServiceMixDonut bookings={bookings} />
      </section>

      {/* ── Today's Dispatch ── */}
      <section className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="p-5 border-b border-[#E4E8EC] flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-[#111827] mb-1">Today's Dispatch</h3>
            <p className="text-sm text-[#6B7280]">{todayBookings.length} jobs · {liveCount} live, {scheduledCount} scheduled</p>
          </div>
          <div className="flex bg-slate-100 rounded-2xl p-1">
            {['All', 'Live', 'Scheduled'].map((f, i) => (
              <button key={f}
                className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all ${i === 0 ? 'bg-white shadow-sm text-[#111827]' : 'text-[#6B7280]'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {todayBookings.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-[15px]">No bookings scheduled for today</p>
            <button onClick={() => setShowNewBooking(true)} className="mt-4 text-emerald-600 font-semibold text-sm hover:underline">
              + Add a booking
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50 text-left text-sm text-[#6B7280]">
                <tr>
                  <th className="px-7 py-4 font-semibold">Time</th>
                  <th className="px-7 py-4 font-semibold">Client</th>
                  <th className="px-7 py-4 font-semibold">Service</th>
                  <th className="px-7 py-4 font-semibold">Status</th>
                  <th className="px-7 py-4 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {todayBookings.map((b, idx) => (
                  <tr key={b.id} className="border-t border-[#E4E8EC] hover:bg-slate-50 transition-all">
                    <td className="px-7 py-5 font-semibold text-[#111827]">
                      {formatTime(`${today}T${b.scheduled_time}`)}
                    </td>
                    <td className="px-7 py-5">
                      <div className="flex items-center gap-4">
                        <Avatar name={b.client_name} idx={idx} />
                        <div>
                          <p className="font-semibold text-[#111827]">{b.client_name}</p>
                          <p className="text-sm text-[#6B7280]">{b.service_address.split(',')[1]?.trim() || b.service_address}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-7 py-5 font-medium text-[#111827]">{b.service_type}</td>
                    <td className="px-7 py-5"><StatusPill status={b.status} /></td>
                    <td className="px-7 py-5 font-bold text-[#111827]">AED {b.total_amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-6 border-t border-[#E4E8EC] flex justify-between items-center">
          <p className="text-sm text-[#6B7280]">Showing {todayBookings.length} today · {bookings.length} total bookings</p>
          <Link to="/bookings" className="text-[#059669] font-semibold hover:underline flex items-center gap-2">
            View all bookings <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── New Booking Modal ── */}
      <Modal open={showNewBooking} onClose={() => setShowNewBooking(false)} title="New Booking" size="lg">
        <NewBookingForm onClose={() => setShowNewBooking(false)} onAdd={addBooking} />
      </Modal>
    </div>
  )
}
