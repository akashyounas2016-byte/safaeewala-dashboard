import { useState, useRef, useEffect } from 'react'
import {
  Search, Calendar as CalendarIcon, Clock, MapPin, Phone,
  ChevronLeft, ChevronRight, List, CalendarDays, Columns3,
  TrendingUp, CheckCircle, AlertCircle, Upload, Download,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatCurrency, formatDate, formatTime } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { Booking, BookingStatus, BookingFrequency } from '@/types'

/* ─── Filter chips ─── */
const statusFilters = [
  { label: 'All',       value: 'all' },
  { label: 'Pending',   value: 'pending' },
  { label: 'Scheduled', value: 'confirmed' },
  { label: 'Live',      value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const serviceTypes = [
  'Standard Clean', 'Deep Clean', 'Move-in', 'Move-out',
  'Commercial', 'Post-construction', 'Office', 'Carpet', 'Window',
]

/* ─── Avatar palette ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72' },
  { bg: '#fce4d6', text: '#c66a3a' },
  { bg: '#e4dff5', text: '#6b5bb5' },
  { bg: '#d6e7f5', text: '#3a7ab8' },
  { bg: '#fcecc8', text: '#a8842a' },
]
function Initials({ name, idx, size = 'md' }: { name: string; idx: number; size?: 'sm' | 'md' | 'lg' }) {
  const parts = name.trim().split(' ')
  const init = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  const dims = size === 'lg' ? 'w-12 h-12 text-[14px]' : size === 'sm' ? 'w-7 h-7 text-[10.5px]' : 'w-9 h-9 text-[12px]'
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0`}
      style={{ background: color.bg, color: color.text }}
    >
      {init}
    </div>
  )
}

/* ─── Status pill ─── */
const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  confirmed:   { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Scheduled' },
  in_progress: { bg: 'bg-emerald-500', text: 'text-white',        dot: 'bg-white',       label: 'Live' },
  pending:     { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500',   label: 'Pending' },
  cancelled:   { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-400',     label: 'Cancelled' },
  completed:   { bg: 'bg-slate-100',   text: 'text-slate-600',    dot: 'bg-slate-400',   label: 'Done' },
}
function StatusPill({ status }: { status: string }) {
  const c = statusConfig[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', label: status }
  return (
    <span className={`text-[11px] px-2.5 py-[3px] rounded-full font-semibold inline-flex items-center gap-1.5 ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

/* ─── Calendar block colors ─── */
const crewBlockColors: Record<string, { bg: string; border: string; text: string }> = {
  Maria:   { bg: '#dcefe7', border: '#0d8a72', text: '#0a5b4c' },
  James:   { bg: '#cfe6dc', border: '#0d8a72', text: '#0a5b4c' },
  Aisha:   { bg: '#fcecc8', border: '#a8842a', text: '#6b541a' },
  Tom:     { bg: '#e4dff5', border: '#6b5bb5', text: '#473877' },
  Priya:   { bg: '#fce4d6', border: '#c66a3a', text: '#7a3e1f' },
  default: { bg: '#d6e7f5', border: '#3a7ab8', text: '#234c72' },
}

/* ─── CSV helpers ─── */
function exportBookingsCSV(bookings: Booking[]) {
  const headers = ['Client Name', 'Phone', 'Service Type', 'Date', 'Time', 'Duration (hrs)', 'Amount (AED)', 'Status', 'Address', 'Notes']
  const rows = bookings.map(b => [
    b.client_name, b.client_phone, b.service_type, b.scheduled_date,
    b.scheduled_time, b.duration_hours, b.total_amount, b.status,
    `"${b.service_address.replace(/"/g, '""')}"`,
    `"${(b.notes || '').replace(/"/g, '""')}"`,
  ].join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bookings-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  result.push(cur.trim())
  return result
}

/* ─── Main Bookings page ─── */
export function Bookings() {
  const { bookings, addBooking, updateBooking, deleteBooking } = useData()
  const [view, setView] = useState<'list' | 'calendar' | 'kanban'>('list')
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<typeof bookings[0] | null>(null)

  const filtered = bookings.filter((b) => {
    const matchSearch = b.client_name.toLowerCase().includes(search.toLowerCase()) ||
      b.service_type.toLowerCase().includes(search.toLowerCase()) ||
      b.service_address.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || b.status === statusFilter
    const matchService = serviceFilter === 'all' || b.service_type === serviceFilter
    return matchSearch && matchStatus && matchService
  })

  const counts = {
    pending:     bookings.filter(b => b.status === 'pending').length,
    confirmed:   bookings.filter(b => b.status === 'confirmed').length,
    in_progress: bookings.filter(b => b.status === 'in_progress').length,
    completed:   bookings.filter(b => b.status === 'completed').length,
  }

  const totalRevenue = bookings
    .filter(b => b.status === 'completed')
    .reduce((s, b) => s + b.total_amount, 0)

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Bookings"
        subtitle={`${bookings.length} jobs · ${counts.in_progress} live now · ${counts.pending} need confirmation`}
        statusChip={`${counts.in_progress} Active`}
        actionLabel="New Booking"
        onAction={() => setShowModal(true)}
        searchPlaceholder="Search bookings…"
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Pending',
            value: counts.pending,
            sub: 'Awaiting confirmation',
            icon: AlertCircle,
            iconColor: 'text-amber-500',
            iconBg: 'bg-amber-50',
            delta: '+2',
            deltaUp: true,
          },
          {
            label: 'Scheduled',
            value: counts.confirmed,
            sub: 'Locked in',
            icon: CalendarIcon,
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-50',
            delta: '+5',
            deltaUp: true,
          },
          {
            label: 'Live Now',
            value: counts.in_progress,
            sub: 'Crew on site',
            icon: TrendingUp,
            iconColor: 'text-blue-600',
            iconBg: 'bg-blue-50',
            delta: 'Real-time',
            deltaUp: true,
          },
          {
            label: 'Completed',
            value: counts.completed,
            sub: `AED ${totalRevenue.toLocaleString()} earned`,
            icon: CheckCircle,
            iconColor: 'text-slate-500',
            iconBg: 'bg-slate-100',
            delta: '+12%',
            deltaUp: true,
          },
        ].map(card => (
          <div
            key={card.label}
            onClick={() => setStatusFilter(
              card.label === 'Live Now' ? 'in_progress' :
              card.label === 'Scheduled' ? 'confirmed' :
              card.label.toLowerCase()
            )}
            className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 cursor-pointer hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon size={18} className={card.iconColor} />
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${card.deltaUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {card.delta}
              </span>
            </div>
            <p className="text-3xl font-bold text-[#111827] tracking-tight">{card.value}</p>
            <p className="text-[13px] font-medium text-[#111827] mt-1">{card.label}</p>
            <p className="text-[12px] text-slate-500 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Filters + View Toggle ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search client, service, or address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 focus:bg-white placeholder-slate-400 transition-colors"
            />
          </div>

          {/* Service filter */}
          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
          >
            <option value="all">All Services</option>
            {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Date range */}
          <select className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer">
            <option>This Week</option>
            <option>This Month</option>
            <option>Last 30 Days</option>
            <option>Custom Range</option>
          </select>

          {/* Import / Export */}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = ev => {
                const text = ev.target?.result as string
                const lines = text.split('\n').slice(1).filter(l => l.trim())
                lines.forEach(line => {
                  const [client_name, client_phone, service_type, scheduled_date, scheduled_time, duration_hours, total_amount, , service_address, notes] = parseCSVLine(line)
                  if (!client_name) return
                  addBooking({
                    client_id: '', client_name, client_phone: client_phone || '',
                    service_type: service_type || 'Standard Clean',
                    frequency: 'once' as BookingFrequency,
                    scheduled_date: scheduled_date || new Date().toISOString().split('T')[0],
                    scheduled_time: scheduled_time || '09:00',
                    duration_hours: Number(duration_hours) || 3,
                    total_amount: Number(total_amount) || 0,
                    status: 'pending',
                    service_address: service_address || '',
                    notes: notes || '',
                    assigned_crew: [],
                  })
                })
                e.target.value = ''
              }
              reader.readAsText(file)
            }}
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            className="flex items-center gap-1.5 text-[12px] px-3 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors"
          >
            <Upload size={13} /> Import CSV
          </button>
          <button
            onClick={() => exportBookingsCSV(filtered)}
            className="flex items-center gap-1.5 text-[12px] px-3 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>

          {/* View toggle */}
          <div className="flex gap-1 p-1 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl">
            {([
              { key: 'list',     icon: List,          label: 'List'   },
              { key: 'kanban',   icon: Columns3,      label: 'Board'  },
              { key: 'calendar', icon: CalendarDays,  label: 'Week'   },
            ] as const).map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`text-[12px] px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1.5 transition-all ${view === v.key ? 'bg-white text-[#111827] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <v.icon size={13} /> {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status chips */}
        <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-[#E4E8EC]">
          {statusFilters.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
                statusFilter === f.value
                  ? 'bg-[#111827] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((b, idx) => (
              <div
                key={b.id}
                onClick={() => setSelectedBooking(b)}
                className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] hover:border-emerald-200 transition-all cursor-pointer"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Initials name={b.client_name} idx={idx} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#111827] truncate">{b.client_name}</p>
                      <p className="text-[12px] text-slate-500 mt-0.5 capitalize">{b.service_type} · {b.frequency}</p>
                    </div>
                  </div>
                  <StatusPill status={b.status} />
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-[12px] text-slate-600 mb-4">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon size={13} className="text-slate-400 shrink-0" />
                    <span className="tabular-nums">{formatDate(b.scheduled_date)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400 shrink-0" />
                    <span className="tabular-nums">{formatTime(`${b.scheduled_date}T${b.scheduled_time}`)} · {b.duration_hours}h</span>
                  </div>
                  <div className="flex items-center gap-1.5 col-span-2">
                    <MapPin size={13} className="text-slate-400 shrink-0" />
                    <span className="truncate">{b.service_address}</span>
                  </div>
                  <div className="flex items-center gap-1.5 col-span-2">
                    <Phone size={13} className="text-slate-400 shrink-0" />
                    <span className="tabular-nums">{b.client_phone}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3.5 border-t border-[#E4E8EC]">
                  <span className="text-[12px] text-slate-500">
                    {b.assigned_crew.length} cleaner{b.assigned_crew.length !== 1 ? 's' : ''} assigned
                  </span>
                  <span className="text-[16px] font-bold text-[#111827] tabular-nums">
                    AED {b.total_amount.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] py-16 text-center">
              <CalendarIcon className="mx-auto mb-3 text-slate-300" size={40} strokeWidth={1.25} />
              <p className="text-[13px] text-slate-500">No bookings match your search</p>
            </div>
          )}
        </>
      )}

      {/* ── KANBAN VIEW ── */}
      {view === 'kanban' && <KanbanBoard bookings={filtered} onSelect={setSelectedBooking} />}

      {/* ── CALENDAR VIEW ── */}
      {view === 'calendar' && <WeekCalendar bookings={filtered} onSelect={setSelectedBooking} />}

      {/* ── Modals ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="New booking" size="lg">
        <NewBookingForm onClose={() => setShowModal(false)} onAdd={addBooking} />
      </Modal>

      <Modal open={!!selectedBooking} onClose={() => setSelectedBooking(null)} title="Booking details" size="lg">
        {selectedBooking && (
          <BookingDetail
            booking={selectedBooking}
            onUpdate={(patch) => { updateBooking(selectedBooking.id, patch); setSelectedBooking(b => b ? { ...b, ...patch } : b) }}
            onDelete={() => { deleteBooking(selectedBooking.id); setSelectedBooking(null) }}
          />
        )}
      </Modal>
    </div>
  )
}

/* ─── Week calendar ─── */
function WeekCalendar({
  bookings,
  onSelect,
}: {
  bookings: Booking[]
  onSelect: (b: Booking) => void
}) {
  const days = [
    { label: 'MON', date: 18 },
    { label: 'TUE', date: 19 },
    { label: 'WED', date: 20, today: true },
    { label: 'THU', date: 21 },
    { label: 'FRI', date: 22 },
    { label: 'SAT', date: 23 },
    { label: 'SUN', date: 24 },
  ]
  const hours = Array.from({ length: 11 }, (_, i) => 7 + i)

  const blockFor = (b: Booking) => {
    const start = parseInt(b.scheduled_time.split(':')[0])
    const startMin = parseInt(b.scheduled_time.split(':')[1])
    const top = ((start - 7) + startMin / 60) * 56
    const height = b.duration_hours * 56 - 2
    const crew = b.assigned_crew[0] ?? 'default'
    const color = crewBlockColors[crew] ?? crewBlockColors.default
    return { top, height, color, crew }
  }

  const bookingsByDate = bookings.reduce<Record<string, Booking[]>>((acc, b) => {
    (acc[b.scheduled_date] ||= []).push(b)
    return acc
  }, {})

  const dateKey = (d: number) => `2026-05-${String(d).padStart(2, '0')}`

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-[17px] font-bold text-[#111827] tracking-tight">
            May 2026 <span className="text-slate-400 font-normal">· Week 21</span>
          </h3>
          <span className="text-[12px] text-slate-500">28 jobs · AED 5,840 projected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-[#E4E8EC] rounded-xl overflow-hidden">
            <button className="p-2 hover:bg-slate-50 transition-colors"><ChevronLeft size={14} /></button>
            <button className="text-[12px] px-3 py-2 border-l border-r border-[#E4E8EC] hover:bg-slate-50 transition-colors font-medium">Today</button>
            <button className="p-2 hover:bg-slate-50 transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* Crew filter row */}
      <div className="px-5 py-3 border-b border-[#E4E8EC] bg-slate-50 flex items-center gap-3 flex-wrap">
        <span className="text-[10.5px] uppercase tracking-[0.08em] text-slate-500 font-semibold">Crew</span>
        <div className="flex gap-1.5 flex-wrap">
          {['All', 'Maria', 'James', 'Aisha', 'Tom', 'Priya'].map((c) => {
            const color = c === 'All' ? null : crewBlockColors[c]?.border
            return (
              <button
                key={c}
                className={`text-[11.5px] px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1.5 transition-colors ${
                  c === 'All'
                    ? 'bg-[#111827] text-white'
                    : 'bg-white border border-[#E4E8EC] text-slate-600 hover:border-slate-300'
                }`}
              >
                {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
                {c}
              </button>
            )
          })}
        </div>
        <span className="ml-auto text-[11.5px] text-slate-500">29 jobs · AED 7,250+ this week</span>
      </div>

      {/* Grid */}
      <div className="grid" style={{ gridTemplateColumns: '52px repeat(7, 1fr)' }}>
        {/* Day header row */}
        <div className="border-b border-[#E4E8EC] bg-slate-50" />
        {days.map(d => (
          <div
            key={d.label}
            className={`border-b border-l border-[#E4E8EC] px-2 py-2.5 text-center ${d.today ? 'bg-emerald-50' : 'bg-slate-50'}`}
          >
            <p className={`text-[10.5px] uppercase tracking-[0.1em] font-semibold ${d.today ? 'text-emerald-600' : 'text-slate-500'}`}>
              {d.label}
            </p>
            <p className={`text-[20px] font-bold tracking-tight mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full ${d.today ? 'bg-emerald-500 text-white' : 'text-[#111827]'}`}>
              {d.date}
            </p>
          </div>
        ))}

        {/* Hour rows */}
        <div className="col-span-8 grid relative" style={{ gridTemplateColumns: '52px repeat(7, 1fr)', minHeight: `${56 * 11}px` }}>
          <div className="flex flex-col">
            {hours.map(h => (
              <div key={h} className="h-14 border-b border-[#E4E8EC] text-right pr-2 pt-1">
                <span className="text-[10.5px] text-slate-400 tabular-nums">
                  {h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}
                </span>
              </div>
            ))}
          </div>

          {days.map(d => {
            const dayBookings = bookingsByDate[dateKey(d.date)] ?? []
            return (
              <div
                key={d.label}
                className={`relative border-l border-[#E4E8EC] ${d.today ? 'bg-emerald-50/30' : ''}`}
              >
                {hours.map(h => (
                  <div key={h} className="h-14 border-b border-[#E4E8EC]" />
                ))}
                {dayBookings.map(b => {
                  const { top, height, color, crew } = blockFor(b)
                  return (
                    <button
                      key={b.id}
                      onClick={() => onSelect(b)}
                      className="absolute left-[3px] right-[3px] rounded-xl px-2 py-1.5 text-left overflow-hidden hover:shadow-md transition-shadow border-l-[3px]"
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        background: color.bg,
                        borderLeftColor: color.border,
                        color: color.text,
                      }}
                    >
                      <p className="text-[11.5px] font-semibold leading-tight truncate">{b.client_name}</p>
                      <p className="text-[10.5px] opacity-80 truncate mt-0.5 capitalize">
                        {b.service_type} · {crew}
                      </p>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-[#E4E8EC] bg-slate-50 flex items-center gap-4 flex-wrap text-[11px] text-slate-500">
        <span className="uppercase tracking-[0.08em] font-semibold">Crew colors</span>
        {Object.entries(crewBlockColors).filter(([k]) => k !== 'default').map(([name, c]) => (
          <div key={name} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ background: c.bg, borderLeft: `2px solid ${c.border}` }} />
            {name}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Searchable crew selector (works for 100+ employees) ─── */
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

/* ─── New Booking Form ─── */
function NewBookingForm({ onClose, onAdd }: { onClose: () => void; onAdd: (b: any) => void }) {
  const [selectedCrew, setSelectedCrew] = useState<string[]>([])
  const ref = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const f = new FormData(ref.current!)
    onAdd({
      client_name:    String(f.get('client_name') || 'New Client'),
      client_phone:   String(f.get('phone') || ''),
      client_id:      '',
      service_address:String(f.get('address') || ''),
      service_type:   String(f.get('service_type') || 'Standard Clean'),
      frequency:      (f.get('frequency') || 'once') as BookingFrequency,
      scheduled_date: String(f.get('date') || new Date().toISOString().split('T')[0]),
      scheduled_time: String(f.get('time') || '09:00'),
      duration_hours: Number(f.get('duration') || 3),
      total_amount:   Number(f.get('amount') || 0),
      status:         'pending',
      assigned_crew:  selectedCrew,
      notes:          String(f.get('notes') || ''),
    })
    onClose()
  }

  return (
    <form ref={ref} className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-4">
        <Input name="client_name" label="Client name" placeholder="Full name" />
        <Input name="phone" label="Phone" placeholder="+971 50 000 0000" />
      </div>
      <Input name="address" label="Service address" placeholder="Street, unit, neighborhood" />
      <div className="grid grid-cols-2 gap-4">
        <Select name="service_type" label="Service type">
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
        <Input name="date" label="Date" type="date" />
        <Input name="time" label="Time" type="time" />
        <Input name="duration" label="Duration (hrs)" type="number" min="1" max="12" defaultValue="3" />
      </div>
      <Input name="amount" label="Total amount (AED)" type="number" placeholder="0.00" />
      <CrewSelector selected={selectedCrew} onChange={setSelectedCrew} />
      <Textarea name="notes" label="Notes" placeholder="Access instructions, special requirements…" rows={2} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Create booking</Button>
      </div>
    </form>
  )
}

/* ─── Booking Detail panel ─── */
type BookingType = ReturnType<typeof useData>['bookings'][0]
function BookingDetail({ booking, onUpdate, onDelete }: {
  booking: BookingType
  onUpdate: (patch: Partial<BookingType>) => void
  onDelete: () => void
}) {
  const [status, setStatus] = useState(booking.status)
  const [isEditing, setIsEditing] = useState(false)

  function applyStatus(s: BookingStatus) {
    setStatus(s)
    onUpdate({ status: s })
  }

  if (isEditing) {
    return (
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const patch: Partial<BookingType> = {
            client_name:    fd.get('client_name') as string,
            client_phone:   fd.get('client_phone') as string,
            service_address:fd.get('service_address') as string,
            service_type:   fd.get('service_type') as string,
            frequency:      fd.get('frequency') as BookingFrequency,
            scheduled_date: fd.get('scheduled_date') as string,
            scheduled_time: fd.get('scheduled_time') as string,
            duration_hours: Number(fd.get('duration_hours')),
            total_amount:   Number(fd.get('total_amount')),
            notes:          fd.get('notes') as string,
          }
          onUpdate(patch)
          setIsEditing(false)
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input name="client_name" label="Client Name" defaultValue={booking.client_name} required />
          <Input name="client_phone" label="Phone" defaultValue={booking.client_phone} />
        </div>
        <Input name="service_address" label="Service Address" defaultValue={booking.service_address} />
        <div className="grid grid-cols-2 gap-4">
          <Select name="service_type" label="Service Type" defaultValue={booking.service_type}>
            {serviceTypes.map(s => <option key={s}>{s}</option>)}
          </Select>
          <Select name="frequency" label="Frequency" defaultValue={booking.frequency}>
            <option value="once">One-time</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input name="scheduled_date" label="Date" type="date" defaultValue={booking.scheduled_date} />
          <Input name="scheduled_time" label="Time" type="time" defaultValue={booking.scheduled_time} />
          <Input name="duration_hours" label="Duration (hrs)" type="number" min="1" max="12" defaultValue={String(booking.duration_hours)} />
        </div>
        <Input name="total_amount" label="Amount (AED)" type="number" defaultValue={String(booking.total_amount)} />
        <Textarea name="notes" label="Notes" defaultValue={booking.notes} rows={3} />
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>Cancel</Button>
          <Button type="submit" className="flex-1">Save Changes</Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Initials name={booking.client_name} idx={0} size="lg" />
          <div>
            <p className="font-bold text-[#111827] text-[16px]">{booking.client_name}</p>
            <p className="text-[12.5px] text-slate-500 mt-0.5">{booking.client_phone}</p>
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Service',   value: booking.service_type },
          { label: 'Frequency', value: booking.frequency },
          { label: 'Date',      value: formatDate(booking.scheduled_date) },
          { label: 'Time',      value: formatTime(`${booking.scheduled_date}T${booking.scheduled_time}`) },
          { label: 'Duration',  value: `${booking.duration_hours} Hours` },
          { label: 'Amount',    value: `AED ${booking.total_amount.toLocaleString()}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
            <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold">{label}</p>
            <p className="text-[13px] font-semibold text-[#111827] mt-1 capitalize">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-50 border border-[#E4E8EC] rounded-xl p-3">
        <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold">Address</p>
        <p className="text-[13px] font-semibold text-[#111827] mt-1">{booking.service_address || '—'}</p>
      </div>

      {booking.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-[10.5px] text-amber-700 uppercase tracking-[0.08em] font-semibold">Notes</p>
          <p className="text-[13px] text-amber-700 mt-1">{booking.notes}</p>
        </div>
      )}

      <div className="flex gap-2 pt-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>Edit</Button>
        {status === 'pending'     && <Button className="flex-1" size="sm" onClick={() => applyStatus('confirmed')}>Confirm</Button>}
        {status === 'confirmed'   && <Button className="flex-1" size="sm" onClick={() => applyStatus('in_progress')}>Start Job</Button>}
        {status === 'in_progress' && <Button className="flex-1" size="sm" onClick={() => applyStatus('completed')}>Mark Complete</Button>}
        {status !== 'cancelled' && status !== 'completed' && (
          <Button variant="danger" size="sm" onClick={() => applyStatus('cancelled')}>Cancel</Button>
        )}
        <Button variant="danger" size="sm" onClick={onDelete}>Delete</Button>
      </div>
    </div>
  )
}

/* ─── Kanban Board ─── */
const kanbanCols = [
  { key: 'pending',     label: 'Pending',    color: 'bg-amber-500',   light: 'bg-amber-50 border-amber-200',   text: 'text-amber-700' },
  { key: 'confirmed',   label: 'Scheduled',  color: 'bg-emerald-500', light: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  { key: 'in_progress', label: 'Live',       color: 'bg-blue-500',    light: 'bg-blue-50 border-blue-200',     text: 'text-blue-700' },
  { key: 'completed',   label: 'Done',       color: 'bg-slate-400',   light: 'bg-slate-50 border-slate-200',   text: 'text-slate-600' },
] as const

function KanbanBoard({ bookings, onSelect }: { bookings: Booking[]; onSelect: (b: Booking) => void }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {kanbanCols.map(col => {
        const colBookings = bookings.filter(b => b.status === col.key)
        return (
          <div key={col.key} className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] flex flex-col min-h-[400px]">
            {/* Column header */}
            <div className="px-4 py-3.5 border-b border-[#E4E8EC] flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${col.color}`} />
              <span className="text-[13px] font-bold text-[#111827]">{col.label}</span>
              <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full border ${col.light} ${col.text}`}>
                {colBookings.length}
              </span>
            </div>
            {/* Cards */}
            <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
              {colBookings.length === 0 && (
                <p className="text-center text-[12px] text-slate-400 mt-8">No bookings</p>
              )}
              {colBookings.map((b, idx) => (
                <div
                  key={b.id}
                  onClick={() => onSelect(b)}
                  className="bg-slate-50 border border-[#E4E8EC] rounded-[16px] p-3.5 cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Initials name={b.client_name} idx={idx} size="sm" />
                    <p className="text-[13px] font-semibold text-[#111827] truncate">{b.client_name}</p>
                  </div>
                  <p className="text-[11.5px] text-slate-500 mb-2 capitalize">{b.service_type}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <CalendarIcon size={11} className="text-slate-400" />
                      <span>{formatDate(b.scheduled_date)}</span>
                    </div>
                    <span className="font-bold text-[#111827]">AED {b.total_amount.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
