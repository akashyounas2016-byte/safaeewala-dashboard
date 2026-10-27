import { useState, useRef, useEffect, useMemo, type ElementType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  CalendarCheck, Users, DollarSign, Star,
  ArrowUpRight, ArrowDownRight, Minus, ArrowRight,
  AlertCircle, Clock, CalendarPlus, FileText, UserCheck, ShoppingCart,
  Calendar, RotateCcw,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatTime, addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { useCurrentUser } from '@/store/UserContext'
import type { Booking, BookingFrequency, DailyJob, DailyPendingItem, DailyPendingReceivedItem, Invoice } from '@/types'
import { cleanClientNameFromAddress, buildPendingCalcContext, loadClientAdjustments, calcJobPending } from '@/lib/clientDataSync'
import { safeLocalStorageGet } from '@/lib/storageUtils'

function cleanNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const str = String(val).trim()
  if (!str || str === '—' || str === '-' || str.toLowerCase() === 'nil' || str.toLowerCase() === 'pending' || str.toLowerCase() === 'monthly' || str.toLowerCase() === 'n/a') return 0
  const cleaned = str.replace(/[^0-9.-]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function isBogusSummaryJob(j: DailyJob): boolean {
  if (!j) return true
  const address = (j.address || '').trim()
  const noAddress = !address || address === '—' || address === '-'
  const noTimes = (!j.start_time || j.start_time === '—') && (!j.end_time || j.end_time === '—')
  const duty = Number(j.duty_hours) || 0
  const charges = Number(j.charges) || 0
  const received = Number(j.received) || 0
  const summaryWords = ['gross', 'pending rcvd', 'total', 'expences', 'net total', 'summary']
  const combined = `${j.staff_name || ''} ${address} ${j.area || ''} ${j.remarks || ''}`.toLowerCase()
  if (summaryWords.some(w => combined.includes(w))) return true
  const isEmptyStub = noAddress && charges === 0 && received === 0 && (!j.service || j.service === '—')
  return (noAddress && noTimes) || (noAddress && (charges > 1500 || received > 1500)) || duty > 24 || isEmptyStub
}

/**
 * Money collected for a job-sheet row (AUD-01): the received amount, else the charges for paid-on-site rows.
 * Monthly rows are collected through monthly client payments and Pending rows through recoveries,
 * so counting their charges here would count them twice.
 */
function jobCollected(j: DailyJob): number {
  const rec = cleanNum(j.received)
  if (rec > 0) return rec
  if (j.payment_mode === 'Pending' || j.payment_mode === 'Monthly') return 0
  return cleanNum(j.charges)
}

/** Bookings without a Daily Job Sheet row — a booking with a row is already counted through that row (AUD-01) */
function bookingsWithoutJobRow(bookings: Booking[], dailyJobs: DailyJob[]): Booking[] {
  const linked = new Set(dailyJobs.map(j => j.booking_id).filter(Boolean))
  return bookings.filter(b => !linked.has(b.id))
}

const serviceTypes = [
  'Standard Clean', 'Deep Clean', 'Move-in', 'Move-out',
  'Commercial', 'Post-construction', 'Office', 'Carpet', 'Window',
]


function CrewSelector({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { employees } = useData()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const availableEmps = employees.filter(e => e.status !== 'inactive')
  const filtered = search
    ? availableEmps.filter(e => e.full_name.toLowerCase().includes(search.toLowerCase()))
    : availableEmps
  const selectedEmps = employees.filter(e => selected.includes(e.id))
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
          placeholder={availableEmps.length === 0 ? 'No employees available — add employees first' : 'Search and select cleaners…'}
          value={search}
          onFocus={() => setOpen(true)}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          disabled={availableEmps.length === 0}
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
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left border-b border-[#E4E8EC] last:border-0 transition-colors ${checked ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                      {checked && <span className="text-white text-[9px] font-bold">✓</span>}
                    </div>
                    <div className="truncate">
                      <p className="text-[12.5px] font-semibold text-[#111827] truncate">{emp.full_name}</p>
                      <p className="text-[10.5px] text-slate-400">{emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}</p>
                    </div>
                  </div>
                  {emp.status && emp.status !== 'active' && (
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 capitalize shrink-0 ml-2">
                      {emp.status.replace(/_/g, ' ')}
                    </span>
                  )}
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
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState<number>(3)
  const [endTime, setEndTime] = useState(() => addHoursToTime('09:00', 3))
  const formRef = useRef<HTMLFormElement>(null)

  // 2-Way Synchronization:
  // 1. Changing Start Time recalculates End Time keeping duration intact
  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart)
    if (newStart && duration > 0) {
      setEndTime(addHoursToTime(newStart, duration))
    }
  }

  // 2. Changing End Time automatically recalculates Duration
  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd)
    if (startTime && newEnd) {
      const calcDur = calcDurationFromTimes(startTime, newEnd)
      if (calcDur > 0) {
        setDuration(calcDur)
      }
    }
  }

  // 3. Changing Duration automatically recalculates End Time
  const handleDurationChange = (newDur: number) => {
    setDuration(newDur)
    if (startTime && newDur > 0) {
      setEndTime(addHoursToTime(startTime, newDur))
    }
  }

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
      scheduled_date: scheduledDate,
      scheduled_time: startTime,
      end_time: endTime,
      duration_hours: duration,
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

      {/* ── Start Time, End Time & Duration Row (Auto-Synced) ── */}
      <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-[#E4E8EC] space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Date *</label>
            <input
              type="date"
              name="scheduled_date"
              required
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-500 font-medium"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-[#111827] mb-1">Start Time *</label>
            <input
              type="time"
              name="scheduled_time"
              required
              value={startTime}
              onChange={e => handleStartTimeChange(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-500 font-bold text-[#111827]"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-teal-800 mb-1">End Time *</label>
            <input
              type="time"
              name="end_time"
              required
              value={endTime}
              onChange={e => handleEndTimeChange(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-500 font-bold text-teal-700"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-emerald-800 mb-1">Duration (hrs)</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              name="duration_hours"
              value={duration}
              onChange={e => handleDurationChange(parseFloat(e.target.value) || 0)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-500 font-bold text-emerald-700"
            />
          </div>
        </div>

        {/* ── Auto-calculated session summary pill ── */}
        <div className="flex items-center justify-between text-[11.5px] px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 font-medium">
          <span className="flex items-center gap-1.5">
            <Clock size={13} className="text-emerald-600" />
            <span>Shift Slot: <strong>{startTime || '—'}</strong> to <strong>{endTime || '—'}</strong></span>
          </span>
          <span className="font-extrabold text-emerald-700 bg-white px-2 py-0.5 rounded-md shadow-2xs">
            {duration} Hour{duration !== 1 ? 's' : ''} auto-synced
          </span>
        </div>
      </div>

      <Input name="total_amount" label="Total Amount (AED)" type="number" placeholder="0.00" />
      <CrewSelector selected={selectedCrew} onChange={setSelectedCrew} />
      <Textarea name="notes" label="Notes" placeholder="Access instructions, special requirements…" rows={3} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold">Create Booking</Button>
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
    .filter(j => !isBogusSummaryJob(j))
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

/* ─── Service mix donut ─── */
const CIRC = 238.76
const donutColors = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#cbd5e1']
function ServiceMixDonut({ bookings, dailyJobs }: { bookings: Booking[]; dailyJobs: DailyJob[] }) {
  const counts: Record<string, number> = {}
  bookings.forEach(b => {
    if (b.service_type) counts[b.service_type] = (counts[b.service_type] || 0) + 1
  })
  dailyJobs
    .filter(j => !isBogusSummaryJob(j))
    .forEach(j => {
      const s = (j.service || '').trim()
      if (s && s !== '—') counts[s] = (counts[s] || 0) + 1
    })

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, value: Math.round((count / total) * 100), count }))

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
        <p className="text-sm text-[#6B7280] mt-1">Most booked cleaning services (all operational records)</p>
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
            <p className="text-[28px] font-bold text-[#111827] leading-none mt-0.5">{total}</p>
            <p className="text-[11px] text-[#94a3b8] mt-0.5">total</p>
          </div>
        </div>
      </div>

      {breakdown.length === 0 ? (
        <p className="text-center text-sm text-slate-400 mt-4">No jobs recorded yet</p>
      ) : (
        <div className="mt-6 space-y-4">
          {breakdown.map((s, i) => (
            <div key={s.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: donutColors[i % donutColors.length] }} />
                <p className="text-sm font-medium text-[#111827]">{s.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{s.count} jobs</span>
                <span className="text-sm font-semibold text-[#111827]">{s.value}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


export type OverviewDatePreset = 'today' | 'yesterday' | '7days' | '30days' | '3months' | '6months' | '1year' | 'all' | 'custom'

/* ─── Overview page ─── */
export function Overview() {
  const { bookings, clients, employees, invoices, inventory, addBooking, dailyExpenses, dailyJobs } = useData()
  const currentUser = useCurrentUser()
  const [showNewBooking, setShowNewBooking] = useState(false)
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

  // Calculate active date range
  const activeDateRange = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    if (datePreset === 'today') {
      return { start: todayStr, end: todayStr, label: 'Today' }
    }
    if (datePreset === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const yStr = y.toISOString().split('T')[0]
      return { start: yStr, end: yStr, label: 'Yesterday' }
    }
    if (datePreset === '7days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 7 Days' }
    }
    if (datePreset === '30days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 29)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 30 Days' }
    }
    if (datePreset === '3months') {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 3)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 3 Months' }
    }
    if (datePreset === '6months') {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 6)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 6 Months' }
    }
    if (datePreset === '1year') {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 1)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 1 Year' }
    }
    if (datePreset === 'custom') {
      const label = customStartDate && customEndDate ? `${customStartDate} to ${customEndDate}` : 'Custom Range'
      return { start: customStartDate, end: customEndDate, label }
    }
    return { start: '', end: '', label: 'All Time' }
  }, [datePreset, customStartDate, customEndDate])

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
  const validDailyJobs = useMemo(() => dailyJobs.filter(j => !isBogusSummaryJob(j)), [dailyJobs])

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
      const isPending = j.payment_mode === 'Pending' || (cleanNum(j.charges) > cleanNum(j.received) && cleanNum(j.received) === 0)
      const status: 'in_progress' | 'confirmed' | 'completed' | 'pending' = isPending
        ? 'pending'
        : (j.end_time && j.end_time !== '—' ? 'completed' : 'in_progress')
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
  }, [periodDailyJobs, periodBookings])

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
    const djPendingList = validDailyJobs.filter(j => calcJobPending(j, pendingCtx) > 0)
    const djPendingAmt = djPendingList.reduce((s, j) => s + calcJobPending(j, pendingCtx), 0)

    // 2. Side table pending items
    const sideAmt = pendingList.reduce((s, i) => s + cleanNum(i.amount), 0)

    // 3. Unpaid / overdue invoices
    const pInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
    const invAmt = pInvoices.reduce((s, i) => s + cleanNum(i.total), 0)

    return {
      totalPendingAmount: djPendingAmt + sideAmt + invAmt,
      totalPendingCount: djPendingList.length + pendingList.length + pInvoices.length,
      dailyPendingCount: djPendingList.length,
      sidePendingCount: pendingList.length,
      invoicePendingCount: pInvoices.length,
    }
  }, [validDailyJobs, pendingList, pendingRcvdList, invoices])

  // ── Staff & Utilization ──
  const activeEmps = employees.filter(e => e.status === 'active' || e.status === 'engaged_in_project' || !e.status)
  const lowStockItems = inventory.filter(i => i.current_stock <= i.min_stock)

  const dispatchedStaffSet = useMemo(() => {
    const s = new Set<string>()
    periodDailyJobs.forEach(j => {
      if (j.staff_name && j.staff_name.trim()) s.add(j.staff_name.trim().toLowerCase())
    })
    periodBookings.forEach(b => {
      (b.assigned_crew || []).forEach(id => {
        const emp = employees.find(e => e.id === id)
        if (emp) s.add(emp.full_name.trim().toLowerCase())
      })
    })
    return s
  }, [periodDailyJobs, periodBookings, employees])

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
        actionLabel="New Booking"
        onAction={() => setShowNewBooking(true)}
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
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
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
          sub={`${employees.length} total staff · ${dispatchedStaffSet.size} dispatched`}
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
              { icon: CalendarPlus, label: 'New Booking',     sub: 'Create customer appointment', bg: 'bg-emerald-100', color: 'text-emerald-600', hover: 'hover:bg-emerald-50', action: () => setShowNewBooking(true) },
              { icon: FileText,     label: 'Daily Job Sheet', sub: 'Record staff shifts & cash',   bg: 'bg-teal-100',    color: 'text-teal-600',    hover: 'hover:bg-teal-50',    action: () => navigate('/daily-jobs') },
              { icon: UserCheck,    label: 'Pending Dues',    sub: 'Recover uncollected cash',     bg: 'bg-rose-100',    color: 'text-rose-600',    hover: 'hover:bg-rose-50',    action: () => navigate('/pending') },
              { icon: ShoppingCart, label: 'Purchase Order',  sub: 'Restock cleaning supplies',    bg: 'bg-purple-100',  color: 'text-purple-600',  hover: 'hover:bg-purple-50',  action: () => navigate('/inventory') },
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
          onClick={() => navigate('/pending')}
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
          const repeatClients = clients.filter(c => c.total_bookings > 1).length
          const repeatRate    = clients.length > 0 ? Math.round((repeatClients / clients.length) * 100) : 0
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
                  { label: 'Revenue', value: `AED ${periodRevenue.toLocaleString()}`, pct: Math.min(100, Math.round((periodRevenue / 100000) * 100)), color: '#059669' },
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
              <p className="text-sm text-[#6B7280]">Active workforce status</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          {activeEmps.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No active employees yet</p>
          ) : (
            <div className="space-y-4">
              {activeEmps.slice(0, 3).map((emp, i) => {
                const currentJob = unifiedJobs.find(b => (b.staff.toLowerCase().includes(emp.full_name.toLowerCase()) || emp.full_name.toLowerCase().includes(b.staff.toLowerCase())) && b.status === 'in_progress')
                const initials = emp.full_name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
                const colors = [{ bg: 'bg-emerald-100', text: 'text-emerald-700' }, { bg: 'bg-amber-100', text: 'text-amber-700' }, { bg: 'bg-sky-100', text: 'text-sky-700' }]
                const c = colors[i % colors.length]
                return (
                  <div key={emp.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${c.bg} flex items-center justify-center font-bold text-sm ${c.text}`}>{initials}</div>
                      <div>
                        <p className="font-medium text-sm text-[#111827]">{emp.full_name}</p>
                        <p className="text-xs text-[#6B7280]">{currentJob ? currentJob.address.split(',')[0] : 'Available'}</p>
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
                <button onClick={() => setShowNewBooking(true)} className="mt-2 text-emerald-600 font-semibold text-sm hover:underline">+ Schedule a job</button>
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

      {/* ── Charts ── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-5 mb-6">
        <RevenueChart
          bookings={bookings}
          dailyJobs={validDailyJobs}
          monthlyPayments={monthlyPayments}
          invoices={invoices}
        />
        <ServiceMixDonut
          bookings={periodBookings.length > 0 ? periodBookings : bookings}
          dailyJobs={periodDailyJobs.length > 0 ? periodDailyJobs : validDailyJobs}
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
              <button onClick={() => setShowNewBooking(true)} className="text-emerald-600 font-semibold text-sm hover:underline">
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

      {/* ── New Booking Modal ── */}
      <Modal open={showNewBooking} onClose={() => setShowNewBooking(false)} title="New Booking" size="lg">
        <NewBookingForm onClose={() => setShowNewBooking(false)} onAdd={addBooking} />
      </Modal>
    </div>
  )
}

