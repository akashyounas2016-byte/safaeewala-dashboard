import { useState, type ElementType } from 'react'
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
import { mockStats, revenueData, serviceBreakdown, mockBookings, mockEmployees } from '@/data/mock'
import { PageHero } from '@/components/layout/PageHero'

const serviceTypes = [
  'Standard Clean', 'Deep Clean', 'Move-in', 'Move-out',
  'Commercial', 'Post-construction', 'Office', 'Carpet', 'Window',
]

function NewBookingForm({ onClose }: { onClose: () => void }) {
  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onClose() }}>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Client Name" placeholder="Full name" />
        <Input label="Phone" placeholder="+971 50 000 0000" />
      </div>
      <Input label="Service Address" placeholder="Street, unit, neighborhood" />
      <div className="grid grid-cols-2 gap-4">
        <Select label="Service Type">
          <option value="">Select service…</option>
          {serviceTypes.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select label="Frequency">
          <option value="once">One-time</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="monthly">Monthly</option>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input label="Date" type="date" />
        <Input label="Time" type="time" />
        <Input label="Duration (hrs)" type="number" min="1" max="12" defaultValue="3" />
      </div>
      <Input label="Total Amount (AED)" type="number" placeholder="0.00" />
      <Textarea label="Notes" placeholder="Access instructions, special requirements…" rows={3} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Create Booking</Button>
      </div>
    </form>
  )
}

const todayBookings = mockBookings.filter(b => b.scheduled_date === '2026-05-20')

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
}
function KpiCard({ label, value, sub, delta, trend = 'neutral', icon: Icon, iconColor, iconBg }: KpiCardProps) {
  const trendColor = trend === 'up' ? '#059669' : trend === 'down' ? '#ef4444' : '#475569'
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus
  return (
    <div className="bg-white rounded-[24px] p-6 border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
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
function RevenueChart() {
  return (
    <div className="bg-white rounded-[22px] p-5 border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-[#111827]">Revenue vs Target</h3>
          <p className="text-sm text-[#6B7280] mt-1">Business growth performance overview</p>
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          {['3M', '6M', '1Y'].map(t => (
            <button key={t}
              className={`text-xs px-3 py-2 rounded-xl font-semibold transition-all ${t === '6M' ? 'bg-[#059669] text-white shadow-sm' : 'text-[#6B7280] hover:text-[#111827]'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5 mb-6">
        <div>
          <p className="text-sm text-[#6B7280] mb-1">Total Revenue</p>
          <h4 className="text-xl font-bold text-[#111827]">$194k</h4>
          <p className="text-sm font-semibold text-[#059669] mt-1">+18%</p>
        </div>
        <div>
          <p className="text-sm text-[#6B7280] mb-1">Target Hit</p>
          <h4 className="text-xl font-bold text-[#111827]">5/6</h4>
          <p className="text-sm text-slate-500 mt-1">Months</p>
        </div>
        <div>
          <p className="text-sm text-[#6B7280] mb-1">Monthly Avg</p>
          <h4 className="text-xl font-bold text-[#111827]">$32.3k</h4>
          <p className="text-sm text-slate-500 mt-1">Steady growth</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={revenueData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
            tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={v => [`$${Number(v).toLocaleString()}`, '']}
            contentStyle={{ borderRadius: 12, border: '1px solid #E4E8EC', fontSize: 12, boxShadow: '0 4px 20px rgba(15,23,42,0.08)' }} />
          <Area type="monotone" dataKey="target" stroke="#cbd5e1" strokeWidth={1.5}
            fill="none" strokeDasharray="4 4" name="Target" />
          <Area type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2.5}
            fill="url(#revGrad)" name="Revenue"
            dot={{ r: 3.5, fill: '#fff', stroke: '#059669', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>

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
function ServiceMixDonut() {
  let offset = 0
  const segments = serviceBreakdown.map(s => {
    const dash = (s.value / 100) * CIRC
    const seg = { ...s, dash, offset }
    offset += dash
    return seg
  })
  const colors = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#cbd5e1']

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
            {segments.map((seg, i) => (
              <circle key={seg.name} cx="50" cy="50" r="38" fill="none"
                stroke={colors[i]} strokeWidth="11"
                strokeDasharray={`${seg.dash} ${CIRC}`}
                strokeDashoffset={-seg.offset}
                transform="rotate(-90 50 50)" />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#94a3b8] font-semibold">Jobs</p>
            <p className="text-[28px] font-bold text-[#111827] leading-none mt-0.5">486</p>
            <p className="text-[11px] text-[#94a3b8] mt-0.5">this month</p>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {serviceBreakdown.map((s, i) => (
          <div key={s.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: colors[i] }} />
              <p className="text-sm font-medium text-[#111827]">{s.name}</p>
            </div>
            <span className="text-sm font-semibold text-[#111827]">{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Overview page ─── */
export function Overview() {
  const [showNewBooking, setShowNewBooking] = useState(false)
  const navigate = useNavigate()
  const liveCount = todayBookings.filter(b => b.status === 'in_progress').length
  const scheduledCount = todayBookings.filter(b => b.status === 'confirmed').length

  const activeEmps = mockEmployees.filter(e => e.status === 'active').slice(0, 3)

  return (
    <div>
      {/* ── Page Hero ── */}
      <PageHero
        title="Good morning, Akash 👋"
        subtitle={`Wednesday, 20 May 2026 · ${todayBookings.length} jobs scheduled · ${liveCount} live now`}
        statusChip="On track"
        actionLabel="New Booking"
        onAction={() => setShowNewBooking(true)}
      />

      {/* ── Filters ── */}
      <section className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: 'Date Scope', options: ['This Month', 'Last 7 Days', 'Last 14 Days', 'Last 30 Days', 'Custom Range'] },
            { label: 'Service Type Filter', options: ['All Services', 'Home Cleaning', 'Deep Cleaning', 'Villa Cleaning', 'Commercial'] },
            { label: 'Acquisition Channel', options: ['All Channels', 'Google My Business', 'Facebook Ads', 'WhatsApp', 'Referral', 'Instagram'] },
          ].map(f => (
            <div key={f.label}>
              <label className="text-[11px] uppercase tracking-[0.15em] text-[#6B7280] font-semibold block mb-2">{f.label}</label>
              <select className="w-full h-11 rounded-2xl border border-[#E4E8EC] bg-slate-50 px-4 text-sm font-medium outline-none text-[#111827]">
                {f.options.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      {/* ── KPI Cards ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        <KpiCard label="Jobs Today" value={todayBookings.length} sub="vs avg Wednesday"
          delta="+1 ↑" trend="up" icon={CalendarCheck} iconBg="#d1fae5" iconColor="#059669" />
        <KpiCard label="Revenue Today" value="$2,180" sub="vs last Wednesday"
          delta="+18%" trend="up" icon={DollarSign} iconBg="#e0f2fe" iconColor="#0369a1" />
        <KpiCard label="Active Cleaners" value={mockStats.active_employees} sub="1 on leave today"
          delta="17 active" trend="neutral" icon={Users} iconBg="#fef3c7" iconColor="#d97706" />
        <KpiCard label="Avg Rating" value="4.8" sub="127 total reviews"
          delta="+0.1" trend="up" icon={Star} iconBg="#ede9fe" iconColor="#7c3aed" />
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
              <p className="text-sm text-[#6B7280]">Real-time business events</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="space-y-5">
            {[
              { icon: '💳', title: 'Invoice paid by James Thornton', sub: '$441 received · 12 mins ago', bg: 'bg-emerald-100' },
              { icon: '📍', title: 'Crew dispatched to Dubai Marina', sub: 'Maria Santos checked in', bg: 'bg-sky-100' },
              { icon: '⚠️', title: 'Microfiber cloth stock low', sub: 'Below minimum inventory level', bg: 'bg-red-100' },
            ].map(ev => (
              <div key={ev.title} className="flex gap-4">
                <div className={`w-10 h-10 rounded-full ${ev.bg} flex items-center justify-center shrink-0`}>
                  <span>{ev.icon}</span>
                </div>
                <div>
                  <p className="font-medium text-sm text-[#111827]">{ev.title}</p>
                  <p className="text-xs text-[#6B7280] mt-1">{ev.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ops Alert Cards ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div className="bg-red-50 border border-red-100 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
              <AlertCircle size={20} className="text-red-600" />
            </div>
            <span className="text-red-700 font-semibold text-sm">Action Required</span>
          </div>
          <h3 className="text-2xl font-bold text-red-700">{mockStats.pending_invoices}</h3>
          <p className="font-semibold text-[#111827] mt-1">Pending Invoices</p>
          <p className="text-sm text-red-600 mt-2">$6,820 outstanding</p>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
              <AlertCircle size={20} className="text-amber-600" />
            </div>
            <span className="text-amber-700 font-semibold text-sm">Inventory Alert</span>
          </div>
          <h3 className="text-2xl font-bold text-amber-700">{mockStats.low_stock_items}</h3>
          <p className="font-semibold text-[#111827] mt-1">Low Stock Alerts</p>
          <p className="text-sm text-amber-600 mt-2">1 critical item</p>
        </div>

        <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Clock size={20} className="text-emerald-600" />
            </div>
            <span className="text-emerald-700 font-semibold text-sm">Healthy</span>
          </div>
          <h3 className="text-2xl font-bold text-emerald-700">84%</h3>
          <p className="font-semibold text-[#111827] mt-1">Crew Utilization</p>
          <p className="text-sm text-emerald-600 mt-2">5 cleaners dispatched</p>
        </div>
      </section>

      {/* ── Smart Operations Row ── */}
      <section className="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-6">
        {/* Weather */}
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-[#111827]">Dubai Weather</h3>
              <p className="text-sm text-[#6B7280]">Operational forecast</p>
            </div>
            <span className="text-3xl">☀️</span>
          </div>
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-4xl font-bold text-[#111827]">34°</h2>
              <p className="text-sm text-[#6B7280] mt-1">Feels like 38°</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-emerald-600">Good conditions</p>
              <p className="text-xs text-[#6B7280] mt-1">Humidity 42%</p>
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-sm text-emerald-700 font-medium">
            Window cleaning recommended until 5 PM
          </div>
        </div>

        {/* Crew Availability */}
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-[#111827]">Crew Availability</h3>
              <p className="text-sm text-[#6B7280]">Real-time workforce status</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="space-y-4">
            {activeEmps.map((emp, i) => {
              const currentJob = todayBookings.find(b => b.assigned_crew.includes(emp.id) && b.status === 'in_progress')
              const initials = emp.full_name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
              const colors = [{ bg: 'bg-emerald-100', text: 'text-emerald-700' }, { bg: 'bg-amber-100', text: 'text-amber-700' }, { bg: 'bg-sky-100', text: 'text-sky-700' }]
              const c = colors[i % colors.length]
              return (
                <div key={emp.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${c.bg} flex items-center justify-center font-bold text-sm ${c.text}`}>{initials}</div>
                    <div>
                      <p className="font-medium text-sm text-[#111827]">{emp.full_name.split(' ')[0]} {emp.full_name.split(' ')[1]}</p>
                      <p className="text-xs text-[#6B7280]">{currentJob ? currentJob.service_address.split(',')[0] : 'Available Now'}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${currentJob ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {currentJob ? 'Assigned' : 'Free'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Dispatch Map */}
        <div className="xl:col-span-2 bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-[#111827]">Live Dubai Dispatch Map</h3>
              <p className="text-sm text-[#6B7280]">Real-time crew movement</p>
            </div>
            <button className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-semibold">
              Live Tracking
            </button>
          </div>
          <div className="h-[180px] rounded-[20px] bg-gradient-to-br from-slate-100 to-slate-200 border border-[#E4E8EC] relative overflow-hidden">
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <div className="absolute top-6 left-12 bg-white shadow-lg rounded-2xl px-4 py-3 border border-[#E4E8EC]">
              <p className="font-semibold text-sm text-[#111827]">Dubai Marina</p>
              <p className="text-xs text-[#6B7280] mt-1">2 crews active</p>
            </div>
            <div className="absolute top-16 right-16 bg-white shadow-lg rounded-2xl px-4 py-3 border border-[#E4E8EC]">
              <p className="font-semibold text-sm text-[#111827]">Al Barsha</p>
              <p className="text-xs text-[#6B7280] mt-1">1 live booking</p>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#059669] text-white shadow-lg rounded-2xl px-5 py-3">
              <p className="font-semibold text-sm">5 Active Crews</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Charts ── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-5 mb-6">
        <RevenueChart />
        <ServiceMixDonut />
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
                    {formatTime(`2026-05-20T${b.scheduled_time}`)}
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
                  <td className="px-7 py-5 font-bold text-[#111827]">${b.total_amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-[#E4E8EC] flex justify-between items-center">
          <p className="text-sm text-[#6B7280]">Showing {todayBookings.length} of {mockBookings.length} bookings</p>
          <Link to="/bookings" className="text-[#059669] font-semibold hover:underline flex items-center gap-2">
            View all bookings <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── New Booking Modal ── */}
      <Modal open={showNewBooking} onClose={() => setShowNewBooking(false)} title="New Booking" size="lg">
        <NewBookingForm onClose={() => setShowNewBooking(false)} />
      </Modal>
    </div>
  )
}
