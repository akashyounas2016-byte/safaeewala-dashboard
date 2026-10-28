import { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  Search, Calendar as CalendarIcon, Clock, MapPin, Phone,
  ChevronLeft, ChevronRight, List, CalendarDays, Columns3,
  TrendingUp, CheckCircle, AlertCircle, Upload, Download,
  FileSpreadsheet, MessageCircle, RefreshCw, RotateCcw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatCurrency, formatDate, formatTime, addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { Booking, BookingFrequency, BookingStatus } from '@/types'
import { SourceOriginTag, resolveBookingSource } from '@/lib/sourceTracking'
import { cleanClientNameFromAddress, isBogusJob, isMonthlyClient, crewToStaffName, staffNameToCrew } from '@/lib/clientDataSync'
import { todayDubai } from '@/lib/dubaiTime'

export type BookingDatePreset = 'today' | '7days' | '30days' | '3months' | '6months' | '1year' | 'all' | 'custom'

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

/* ─── Excel import/export helpers ─── */
function toISODate(val: any): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toISOString().split('T')[0]
}

function parseFrequency(v: string): BookingFrequency {
  const s = v?.toLowerCase().replace(/[-\s]/g, '') ?? ''
  if (s === 'weekly')   return 'weekly'
  if (s === 'biweekly') return 'biweekly'
  if (s === 'monthly')  return 'monthly'
  return 'once'
}

function parseBookingStatus(v: string): BookingStatus {
  const s = v?.toLowerCase().trim() ?? ''
  if (s === 'completed')                      return 'completed'
  if (s === 'confirmed' || s === 'scheduled') return 'confirmed'
  if (s === 'in_progress' || s === 'in progress') return 'in_progress'
  if (s === 'cancelled' || s === 'canceled')  return 'cancelled'
  return 'pending'
}

function exportBookingsXLSX(bookings: Booking[]) {
  const rows = bookings.map((b, i) => ({
    'Booking ID':        `BK-${String(i + 1).padStart(3, '0')}`,
    'Client Name':       b.client_name,
    'Phone':             b.client_phone,
    'Service Address':   b.service_address,
    'Service Type':      b.service_type,
    'Frequency':         b.frequency === 'once' ? 'One-time' : b.frequency.charAt(0).toUpperCase() + b.frequency.slice(1),
    'Date':              b.scheduled_date,
    'Time':              b.scheduled_time,
    'Duration (hrs)':    b.duration_hours,
    'Total Amount (AED)': b.total_amount,
    'Status':            b.status.replace('_', ' '),
    'Notes':             b.notes ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bookings')
  XLSX.writeFile(wb, `bookings-${todayDubai()}.xlsx`)
}

async function parseBookingsFile(file: File): Promise<Parameters<(b: any) => void>[0][]> {
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]])
  return rows
    .map(r => {
      const name = String(r['Client Name'] ?? r['client_name'] ?? '').trim()
      if (!name) return null
      return {
        client_id:       '',
        client_name:     name,
        client_phone:    String(r['Phone'] ?? r['client_phone'] ?? '').trim(),
        service_address: String(r['Service Address'] ?? r['service_address'] ?? '').trim(),
        service_type:    String(r['Service Type'] ?? r['service_type'] ?? 'Standard Clean').trim(),
        frequency:       parseFrequency(String(r['Frequency'] ?? '')),
        scheduled_date:  toISODate(r['Date'] ?? r['scheduled_date']),
        scheduled_time:  String(r['Time'] ?? r['scheduled_time'] ?? '09:00').trim(),
        duration_hours:  Number(r['Duration (hrs)'] ?? r['duration_hours']) || 3,
        total_amount:    Number(r['Total Amount (AED)'] ?? r['total_amount']) || 0,
        status:          parseBookingStatus(String(r['Status'] ?? '')),
        notes:           String(r['Notes'] ?? r['notes'] ?? '').trim(),
        assigned_crew:   [],
      }
    })
    .filter(Boolean) as any[]
}

/* ─── Main Bookings page ─── */
export function Bookings() {
  const {
    bookings,
    addBooking,
    updateBooking,
    deleteBooking,
    invoices,
    updateInvoice,
    dailyJobs,
    updateDailyJob,
    deleteDailyJob,
    clients,
    employees,
  } = useData()
  const [view, setView] = useState<'list' | 'calendar' | 'kanban'>('list')
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const [importing,   setImporting]   = useState(false)
  const [datePreset,  setDatePreset]  = useState<BookingDatePreset>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate,   setCustomEndDate]   = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)

  // ── Full Synchronization between Bookings & Daily Job Sheet ──
  const synchronizedBookings = useMemo(() => {
    // 1. Existing bookings, enriched with latest live data from linked dailyJobs
    const enrichedBookings: Booking[] = bookings.map(b => {
      const linkedJob = dailyJobs.find(j =>
        (j.booking_id && j.booking_id === b.id) ||
        (j.date === b.scheduled_date && (
          (j.address && j.address.toLowerCase().includes(b.client_name.toLowerCase())) ||
          (b.client_name && cleanClientNameFromAddress(j.address || '').toLowerCase().includes(b.client_name.toLowerCase()))
        ))
      )

      if (!linkedJob) return b

      // Job sheet stores names; bookings store employee IDs
      const updatedCrew = staffNameToCrew(linkedJob.staff_name, employees)

      return {
        ...b,
        assigned_crew: updatedCrew.length > 0 ? updatedCrew : b.assigned_crew,
        scheduled_time: linkedJob.start_time || b.scheduled_time,
        end_time: linkedJob.end_time || b.end_time,
        duration_hours: linkedJob.duty_hours || b.duration_hours,
        total_amount: linkedJob.charges || b.total_amount,
        status: linkedJob.received > 0 ? 'completed' : b.status,
      }
    })

    // 2. Discover jobs entered on Daily Job Sheet not yet in formal bookings
    const syntheticBookings: Booking[] = []
    const existingBookingIds = new Set(bookings.map(b => b.id))
    const existingDateClientSet = new Set(
      bookings.map(b => `${b.scheduled_date}__${b.client_name.toLowerCase().trim()}`)
    )

    dailyJobs.forEach(j => {
      if (isBogusJob(j)) return
      const rawAddr = (j.address || j.area || '').trim()
      if (!rawAddr || rawAddr === '—' || rawAddr === '-') return
      if (j.booking_id && existingBookingIds.has(j.booking_id)) return

      const clientName = cleanClientNameFromAddress(rawAddr) || rawAddr
      const comboKey = `${j.date}__${clientName.toLowerCase().trim()}`
      if (existingDateClientSet.has(comboKey)) return

      const nowStr = todayDubai()
      let status: BookingStatus = 'confirmed'
      if (j.received > 0) {
        status = 'completed'
      } else if (j.date === nowStr && j.staff_name && j.staff_name !== 'Unassigned') {
        status = 'in_progress'
      } else if (j.date < nowStr) {
        status = 'completed'
      }

      syntheticBookings.push({
        id: `dj-${j.id}`,
        client_id: '',
        client_name: clientName,
        client_phone: '',
        service_address: rawAddr,
        service_type: j.service || (j.material && j.material !== 'No' ? `${j.material} Cleaning` : 'General Cleaning'),
        status,
        frequency: j.payment_mode === 'Monthly' ? 'monthly' : 'once',
        scheduled_date: j.date,
        scheduled_time: j.start_time || '09:00',
        end_time: j.end_time || (j.duty_hours ? addHoursToTime(j.start_time || '09:00', j.duty_hours) : ''),
        duration_hours: j.duty_hours || 0,
        assigned_crew: staffNameToCrew(j.staff_name, employees),
        notes: j.remarks || '',
        total_amount: j.charges || 0,
        created_at: j.created_at || `${j.date}T08:00:00Z`,
        source: 'daily_job_sheet',
      })
    })

    return [...enrichedBookings, ...syntheticBookings]
  }, [bookings, dailyJobs, employees])

  const activeDateRange = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    if (datePreset === 'today') {
      return { start: todayStr, end: todayStr, label: 'Today' }
    }
    if (datePreset === '7days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 7 Days' }
    }
    if (datePreset === '30days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
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

  // Filter bookings by active date range
  const dateFilteredBookings = useMemo(() => {
    return synchronizedBookings.filter(b => {
      const bDate = b.scheduled_date || (b.created_at ? b.created_at.split('T')[0] : '')
      if (activeDateRange.start && bDate < activeDateRange.start) return false
      if (activeDateRange.end && bDate > activeDateRange.end) return false
      return true
    })
  }, [synchronizedBookings, activeDateRange])

  // Filter by search, status, and service type
  const filtered = useMemo(() => {
    return dateFilteredBookings.filter((b) => {
      const matchSearch = b.client_name.toLowerCase().includes(search.toLowerCase()) ||
        b.service_type.toLowerCase().includes(search.toLowerCase()) ||
        b.service_address.toLowerCase().includes(search.toLowerCase())
      const matchStatus  = statusFilter === 'all' || b.status === statusFilter
      const matchService = serviceFilter === 'all' || b.service_type === serviceFilter
      return matchSearch && matchStatus && matchService
    })
  }, [dateFilteredBookings, search, statusFilter, serviceFilter])

  const counts = {
    total:       dateFilteredBookings.length,
    pending:     dateFilteredBookings.filter(b => b.status === 'pending').length,
    confirmed:   dateFilteredBookings.filter(b => b.status === 'confirmed').length,
    in_progress: dateFilteredBookings.filter(b => b.status === 'in_progress').length,
    completed:   dateFilteredBookings.filter(b => b.status === 'completed').length,
  }

  const totalRevenue = dateFilteredBookings
    .filter(b => b.status === 'completed')
    .reduce((s, b) => s + (b.total_amount || 0), 0)

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Bookings"
        subtitle={`${activeDateRange.label} · ${counts.total} jobs · ${counts.in_progress} live now · ${counts.pending} need confirmation`}
        statusChip={datePreset === 'all' ? `${counts.in_progress} Active` : activeDateRange.label}
        actionLabel="New Booking"
        onAction={() => setShowModal(true)}
        searchPlaceholder="Search bookings…"
        searchValue={search}
        onSearch={setSearch}
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
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4 space-y-3.5">
        {/* Row 1: Search, Service Filter, Import/Export, and View Toggle */}
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
            className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer font-medium"
          >
            <option value="all">All Services</option>
            {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Import / Export */}
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              setImporting(true)
              try {
                const rows = await parseBookingsFile(file)
                rows.forEach(r => addBooking(r))
              } finally {
                setImporting(false)
                e.target.value = ''
              }
            }}
          />
          <button
            onClick={() => xlsxInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 text-[12px] px-3 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Upload size={13} /> {importing ? 'Importing…' : 'Import Excel'}
          </button>
          <button
            onClick={() => exportBookingsXLSX(filtered)}
            className="flex items-center gap-1.5 text-[12px] px-3 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={13} /> Export Excel
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
                className={`text-[12px] px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer ${view === v.key ? 'bg-white text-[#111827] shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <v.icon size={13} /> {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Date Range Filter Bar (Today, 7 Days, 30 Days, 3 Months, 6 Months, 1 Year, All Time, Custom Range) */}
        <div className="pt-3 border-t border-[#E4E8EC] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-slate-700 mr-1 flex items-center gap-1.5">
              <CalendarIcon size={14} className="text-emerald-600" />
              <span>Date Filter:</span>
            </span>

            {[
              { id: 'today',   label: 'Today' },
              { id: '7days',   label: '7 Days' },
              { id: '30days',  label: '30 Days' },
              { id: '3months', label: '3 Months' },
              { id: '6months', label: '6 Months' },
              { id: '1year',   label: '1 Year' },
              { id: 'all',     label: 'All Time' },
              { id: 'custom',  label: 'Custom Range' },
            ].map(preset => {
              const active = datePreset === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDatePreset(preset.id as BookingDatePreset)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Custom Date Pickers */}
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

            {datePreset !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setDatePreset('all')
                  setCustomStartDate('')
                  setCustomEndDate('')
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-slate-500 hover:text-emerald-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                title="Reset date filter to All Time"
              >
                <RotateCcw size={12} />
                <span>Reset Date</span>
              </button>
            )}

            <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/60">
              Showing: <span className="text-emerald-600 font-extrabold">{filtered.length}</span> jobs ({activeDateRange.label})
            </span>
          </div>
        </div>

        {/* Row 3: Status chips & Reset All */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-3 border-t border-[#E4E8EC]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-slate-500 mr-1">Status:</span>
            {statusFilters.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors cursor-pointer ${
                  statusFilter === f.value
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {(search || serviceFilter !== 'all' || statusFilter !== 'all' || datePreset !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setServiceFilter('all')
                setStatusFilter('all')
                setDatePreset('all')
                setCustomStartDate('')
                setCustomEndDate('')
              }}
              className="text-[11.5px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
            >
              ✕ Clear All Filters
            </button>
          )}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-semibold text-[#111827] truncate">{b.client_name}</p>
                        {(() => {
                          const matchedClient = clients.find(c => c.id === b.client_id || c.full_name.toLowerCase().trim() === b.client_name.toLowerCase().trim())
                          const isMonthly = b.frequency === 'monthly' || b.frequency === 'weekly' || b.frequency === 'biweekly' || (b.frequency as string) === 'bi-weekly' || (matchedClient && isMonthlyClient(matchedClient, dailyJobs))
                          return isMonthly ? (
                            <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded-full shadow-2xs tracking-wider uppercase">
                              Monthly
                            </span>
                          ) : null
                        })()}
                        <SourceOriginTag source={resolveBookingSource(b)} />
                      </div>
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
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-slate-500">
                      {b.assigned_crew.length} cleaner{b.assigned_crew.length !== 1 ? 's' : ''} assigned
                    </span>
                    {b.frequency !== 'once' && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full capitalize">
                        <RefreshCw size={9} /> {b.frequency}
                      </span>
                    )}
                  </div>
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
            onUpdate={(patch) => {
              if (selectedBooking.id.startsWith('dj-')) {
                const jobId = selectedBooking.id.replace('dj-', '')
                updateDailyJob(jobId, {
                  date: patch.scheduled_date ?? selectedBooking.scheduled_date,
                  start_time: patch.scheduled_time ?? selectedBooking.scheduled_time,
                  end_time: patch.end_time ?? selectedBooking.end_time,
                  duty_hours: patch.duration_hours ?? selectedBooking.duration_hours,
                  charges: patch.total_amount ?? selectedBooking.total_amount,
                  staff_name: crewToStaffName(patch.assigned_crew, employees) || undefined,
                  address: patch.service_address ?? selectedBooking.service_address,
                  service: patch.service_type ?? selectedBooking.service_type,
                  received: patch.status === 'completed' ? (patch.total_amount ?? selectedBooking.total_amount) : undefined,
                })
              } else {
                updateBooking(selectedBooking.id, patch)
              }
              setSelectedBooking(b => b ? { ...b, ...patch } : b)
            }}
            onDelete={() => {
              if (selectedBooking.id.startsWith('dj-')) {
                const jobId = selectedBooking.id.replace('dj-', '')
                deleteDailyJob(jobId)
              } else {
                deleteBooking(selectedBooking.id)
              }
              setSelectedBooking(null)
            }}
            invoices={invoices}
            onUpdateInvoice={updateInvoice}
          />
        )}
      </Modal>
    </div>
  )
}

/* ─── Month Calendar (real, dynamic) ─── */
function WeekCalendar({ bookings, onSelect }: { bookings: Booking[]; onSelect: (b: Booking) => void }) {
  const today = new Date()
  const [curYear,  setCurYear]  = useState(today.getFullYear())
  const [curMonth, setCurMonth] = useState(today.getMonth())

  const todayStr = today.toISOString().split('T')[0]
  const monthName = new Date(curYear, curMonth).toLocaleString('en-GB', { month: 'long', year: 'numeric' })

  function prevMonth() {
    if (curMonth === 0) { setCurMonth(11); setCurYear(y => y - 1) }
    else setCurMonth(m => m - 1)
  }
  function nextMonth() {
    if (curMonth === 11) { setCurMonth(0); setCurYear(y => y + 1) }
    else setCurMonth(m => m + 1)
  }
  function goToday() { setCurYear(today.getFullYear()); setCurMonth(today.getMonth()) }

  // Build grid cells
  const firstDay = new Date(curYear, curMonth, 1).getDay() // 0=Sun
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const bookingsByDate = bookings.reduce<Record<string, Booking[]>>((acc, b) => {
    (acc[b.scheduled_date] ||= []).push(b)
    return acc
  }, {})

  const statusDot: Record<string, string> = {
    completed:   'bg-slate-400',
    confirmed:   'bg-emerald-500',
    in_progress: 'bg-blue-500',
    pending:     'bg-amber-400',
    cancelled:   'bg-red-400',
  }

  const monthRevenue = bookings
    .filter(b => {
      const d = new Date(b.scheduled_date)
      return d.getFullYear() === curYear && d.getMonth() === curMonth && b.status !== 'cancelled'
    })
    .reduce((s, b) => s + b.total_amount, 0)

  const monthJobs = bookings.filter(b => {
    const d = new Date(b.scheduled_date)
    return d.getFullYear() === curYear && d.getMonth() === curMonth
  }).length

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-[17px] font-bold text-[#111827]">{monthName}</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">{monthJobs} jobs · AED {monthRevenue.toLocaleString()} projected</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-[#E4E8EC] rounded-xl overflow-hidden">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-50 transition-colors"><ChevronLeft size={14} /></button>
            <button onClick={goToday} className="text-[12px] px-3 py-2 border-l border-r border-[#E4E8EC] hover:bg-slate-50 font-medium">Today</button>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-50 transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-[#E4E8EC] bg-slate-50">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="py-2.5 text-center text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.08em]">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="min-h-[100px] border-r border-b border-[#E4E8EC] bg-slate-50/40" />
          const dateStr = `${curYear}-${String(curMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const dayBookings = bookingsByDate[dateStr] ?? []
          const isToday = dateStr === todayStr
          return (
            <div key={i} className={`min-h-[100px] border-r border-b border-[#E4E8EC] p-2 ${isToday ? 'bg-emerald-50/50' : 'hover:bg-slate-50/60'} transition-colors`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold mb-1.5 ${isToday ? 'bg-emerald-500 text-white' : 'text-slate-700'}`}>
                {day}
              </div>
              <div className="space-y-1">
                {dayBookings.slice(0, 3).map(b => (
                  <button
                    key={b.id}
                    onClick={() => onSelect(b)}
                    className="w-full text-left flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-white/80 transition-colors group"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[b.status] ?? 'bg-slate-400'}`} />
                    <span className="text-[10.5px] font-medium text-slate-700 truncate group-hover:text-emerald-700">{b.client_name}</span>
                  </button>
                ))}
                {dayBookings.length > 3 && (
                  <p className="text-[10px] text-slate-400 pl-1.5 font-medium">+{dayBookings.length - 3} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-[#E4E8EC] bg-slate-50 flex items-center gap-5 flex-wrap text-[11px] text-slate-500">
        {[
          { label: 'Scheduled', dot: 'bg-emerald-500' },
          { label: 'Live',      dot: 'bg-blue-500' },
          { label: 'Pending',   dot: 'bg-amber-400' },
          { label: 'Completed', dot: 'bg-slate-400' },
          { label: 'Cancelled', dot: 'bg-red-400' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${l.dot}`} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Kanban board ─── */
function KanbanBoard({ bookings, onSelect }: { bookings: Booking[]; onSelect: (b: Booking) => void }) {
  const cols: { key: BookingStatus; label: string; bg: string; border: string; dot: string }[] = [
    { key: 'pending',     label: 'Pending',   bg: 'bg-amber-50',   border: 'border-amber-200',  dot: 'bg-amber-400' },
    { key: 'confirmed',   label: 'Scheduled', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    { key: 'in_progress', label: 'Live Now',  bg: 'bg-blue-50',    border: 'border-blue-200',   dot: 'bg-blue-500' },
    { key: 'completed',   label: 'Completed', bg: 'bg-slate-50',   border: 'border-slate-200',  dot: 'bg-slate-400' },
    { key: 'cancelled',   label: 'Cancelled', bg: 'bg-red-50',     border: 'border-red-200',    dot: 'bg-red-400' },
  ]

  const grouped = cols.reduce((acc, c) => {
    acc[c.key] = bookings.filter(b => b.status === c.key)
    return acc
  }, {} as Record<string, Booking[]>)

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {cols.map(col => (
        <div key={col.key} className="min-w-[240px] flex-1">
          {/* Column header */}
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-2xl border ${col.bg} ${col.border} mb-2`}>
            <span className={`w-2 h-2 rounded-full ${col.dot}`} />
            <span className="text-[12px] font-bold text-slate-700">{col.label}</span>
            <span className="ml-auto text-[11px] font-semibold text-slate-500 bg-white/60 px-2 py-0.5 rounded-full">
              {grouped[col.key]?.length ?? 0}
            </span>
          </div>

          {/* Cards */}
          <div className="space-y-2.5">
            {(grouped[col.key] ?? []).map((b, idx) => (
              <div
                key={b.id}
                onClick={() => onSelect(b)}
                className="bg-white rounded-[18px] border border-[#E4E8EC] p-4 cursor-pointer hover:shadow-[0_4px_16px_rgba(15,23,42,0.10)] hover:border-emerald-200 transition-all"
              >
                <div className="flex items-start gap-2.5 mb-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ background: ['#dcefe7','#fce4d6','#e4dff5','#d6e7f5','#fcecc8'][idx % 5], color: ['#0d8a72','#c66a3a','#6b5bb5','#3a7ab8','#a8842a'][idx % 5] }}
                  >
                    {b.client_name.split(' ').map((p: string) => p[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#111827] truncate">{b.client_name}</p>
                    <p className="text-[11px] text-slate-500 capitalize mt-0.5">{b.service_type}</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon size={11} className="shrink-0" />
                    <span>{b.scheduled_date} · {b.scheduled_time}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} className="shrink-0" />
                    <span className="truncate">{b.service_address}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#E4E8EC]">
                  <span className="text-[11px] text-slate-400">{b.duration_hours}h</span>
                  <span className="text-[13px] font-bold text-[#111827]">AED {b.total_amount.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {(grouped[col.key] ?? []).length === 0 && (
              <div className="bg-slate-50 rounded-2xl border border-dashed border-[#E4E8EC] py-8 text-center">
                <p className="text-[11px] text-slate-400">No {col.label.toLowerCase()} bookings</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Searchable crew selector (works for 100+ employees) ─── */
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

/* ─── New Booking Form ─── */
function NewBookingForm({ onClose, onAdd }: { onClose: () => void; onAdd: (b: any) => void }) {
  const { clients } = useData()
  const [selectedCrew, setSelectedCrew] = useState<string[]>([])
  const [scheduledDate, setScheduledDate] = useState(() => todayDubai())
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState<number>(3)
  const [endTime, setEndTime] = useState(() => addHoursToTime('09:00', 3))
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [serviceAddress, setServiceAddress] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const clientDropdownRef = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLFormElement>(null)

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients.slice(0, 8)
    return clients.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.building_name && c.building_name.toLowerCase().includes(q)) ||
      (c.area && c.area.toLowerCase().includes(q))
    ).slice(0, 12)
  }, [clients, clientSearch])

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const handleSelectClient = (c: any) => {
    setSelectedClientId(c.id)
    setClientSearch(c.full_name)
    setClientPhone(c.phone || c.whatsapp || '')
    const addr = [c.building_name, c.apartment, c.area].filter(Boolean).join(', ')
    setServiceAddress(addr)
    setShowClientDropdown(false)
  }

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
    const f = new FormData(ref.current!)
    const finalClientName = clientSearch.trim() || String(f.get('client_name') || 'New Client')
    const matched = clients.find(c => c.id === selectedClientId || c.full_name.toLowerCase().trim() === finalClientName.toLowerCase())

    onAdd({
      client_name:    finalClientName,
      client_phone:   clientPhone || String(f.get('phone') || ''),
      client_id:      matched?.id || selectedClientId || '',
      service_address:serviceAddress || String(f.get('address') || ''),
      service_type:   String(f.get('service_type') || 'Standard Clean'),
      frequency:      (f.get('frequency') || 'once') as BookingFrequency,
      scheduled_date: scheduledDate,
      scheduled_time: startTime,
      end_time:       endTime,
      duration_hours: duration,
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
        {/* Client Name with searchable autocomplete */}
        <div className="relative" ref={clientDropdownRef}>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
            Client name <span className="text-red-500">*</span>
          </label>
          <input
            name="client_name"
            placeholder="Full name or search existing…"
            required
            value={clientSearch}
            onChange={e => {
              setClientSearch(e.target.value)
              setSelectedClientId('')
              setShowClientDropdown(true)
            }}
            onFocus={() => setShowClientDropdown(true)}
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 font-medium"
          />
          {showClientDropdown && filteredClients.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-[#E4E8EC] rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
              <div className="px-3 py-1.5 bg-slate-50 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Select Client ({filteredClients.length})
              </div>
              {filteredClients.map(c => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => handleSelectClient(c)}
                  className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-[#111827] truncate">{c.full_name}</p>
                    <p className="text-[10.5px] text-slate-400 truncate">
                      {[c.phone, c.building_name, c.area].filter(Boolean).join(' · ') || 'Registered client'}
                    </p>
                  </div>
                  {c.source === 'monthly' && (
                    <span className="text-[9px] bg-teal-50 text-teal-700 font-bold px-1.5 py-0.5 rounded border border-teal-200 shrink-0">
                      Monthly
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
            Phone
          </label>
          <input
            name="phone"
            placeholder="+971 50 000 0000"
            value={clientPhone}
            onChange={e => setClientPhone(e.target.value)}
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 font-medium"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
          Service address
        </label>
        <input
          name="address"
          placeholder="Street, unit, neighborhood"
          value={serviceAddress}
          onChange={e => setServiceAddress(e.target.value)}
          className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 font-medium"
        />
      </div>

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

      {/* ── Start Time, End Time & Duration Row (Auto-Synced) ── */}
      <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-[#E4E8EC] space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Date *</label>
            <input
              type="date"
              name="date"
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
              name="time"
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
              name="duration"
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

      <Input name="amount" label="Total amount (AED)" type="number" placeholder="0.00" />
      <CrewSelector selected={selectedCrew} onChange={setSelectedCrew} />
      <Textarea name="notes" label="Notes" placeholder="Access instructions, special requirements…" rows={2} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold">Create booking</Button>
      </div>
    </form>
  )
}

/* ─── WhatsApp message templates ─── */
function buildConfirmationMsg(b: { client_name: string; scheduled_date: string; scheduled_time: string; service_address: string; service_type: string; duration_hours: number; total_amount: number }) {
  return `Hi ${b.client_name}, your Safaeewala booking is confirmed! ✅\n\n📅 ${formatDate(b.scheduled_date)} at ${b.scheduled_time}\n🏠 ${b.service_address}\n🧹 ${b.service_type} · ${b.duration_hours}h\n💰 AED ${b.total_amount.toLocaleString()}\n\nYour team will arrive on time. To reschedule call: +971 55 628 2374\n\nThank you for choosing Safaeewala! 🙏`
}
function buildReminderMsg(b: { client_name: string; scheduled_date: string; scheduled_time: string; service_address: string; service_type: string }) {
  return `Hi ${b.client_name}, reminder for your Safaeewala appointment tomorrow! 🧹\n\n📅 ${formatDate(b.scheduled_date)} at ${b.scheduled_time}\n🏠 ${b.service_address}\n🧹 ${b.service_type}\n\nPlease ensure access to the property. See you tomorrow!\n\nSafaeewala Team · +971 55 628 2374`
}
function waLink(phone: string, msg: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`
}

/* ─── Booking Detail panel ─── */
type BookingType = ReturnType<typeof useData>['bookings'][0]
function BookingDetail({ booking, onUpdate, onDelete, invoices, onUpdateInvoice }: {
  booking: BookingType
  onUpdate: (patch: Partial<BookingType>) => void
  onDelete: () => void
  invoices: ReturnType<typeof useData>['invoices']
  onUpdateInvoice: (id: string, patch: any) => void
}) {
  const [status,    setStatus]    = useState(booking.status)
  const [isEditing, setIsEditing] = useState(false)
  const [crew,      setCrew]      = useState<string[]>(booking.assigned_crew ?? [])

  const [scheduledDate, setScheduledDate] = useState(booking.scheduled_date)
  const [startTime, setStartTime] = useState(booking.scheduled_time || '09:00')
  const [duration, setDuration] = useState<number>(booking.duration_hours || 3)
  const [endTime, setEndTime] = useState(() => booking.end_time || addHoursToTime(booking.scheduled_time || '09:00', booking.duration_hours || 3))

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart)
    if (newStart && duration > 0) {
      setEndTime(addHoursToTime(newStart, duration))
    }
  }

  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd)
    if (startTime && newEnd) {
      const calcDur = calcDurationFromTimes(startTime, newEnd)
      if (calcDur > 0) {
        setDuration(calcDur)
      }
    }
  }

  const handleDurationChange = (newDur: number) => {
    setDuration(newDur)
    if (startTime && newDur > 0) {
      setEndTime(addHoursToTime(startTime, newDur))
    }
  }

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
            scheduled_date: scheduledDate,
            scheduled_time: startTime,
            end_time:       endTime,
            duration_hours: duration,
            total_amount:   Number(fd.get('total_amount')),
            notes:          fd.get('notes') as string,
            assigned_crew:  crew,
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

        <Input name="total_amount" label="Amount (AED)" type="number" defaultValue={String(booking.total_amount)} />
        <Textarea name="notes" label="Notes" defaultValue={booking.notes} rows={3} />
        <CrewSelector selected={crew} onChange={setCrew} />
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>Cancel</Button>
          <Button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold">Save Changes</Button>
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
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-[#111827] text-[16px]">{booking.client_name}</p>
              <SourceOriginTag source={resolveBookingSource(booking)} />
            </div>
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

      {/* Crew Assignment */}
      <div className="border border-[#E4E8EC] rounded-xl p-3">
        <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-2">Assigned Crew</p>
        <CrewSelector
          selected={crew}
          onChange={ids => { setCrew(ids); onUpdate({ assigned_crew: ids }) }}
        />
      </div>

      {/* Invoice Status */}
      {(() => {
        const relatedInvoice = invoices.find(inv =>
          inv.client_id === booking.client_id ||
          inv.client_name.toLowerCase().trim() === booking.client_name.toLowerCase().trim()
        )
        const invoicePaid = relatedInvoice?.status === 'paid'
        return (
          <div className="border border-[#E4E8EC] rounded-xl p-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={invoicePaid}
                onChange={() => {
                  if (relatedInvoice) {
                    onUpdateInvoice(relatedInvoice.id, { status: invoicePaid ? 'sent' : 'paid' })
                  }
                }}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              <div>
                <p className="text-[13px] font-semibold text-[#111827]">Invoice Paid</p>
                {relatedInvoice ? (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Status: <span className={invoicePaid ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{invoicePaid ? 'Paid' : 'Pending'}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-0.5">No invoice found</p>
                )}
              </div>
            </label>
          </div>
        )
      })()}

      {/* WhatsApp / Call actions */}
      {booking.client_phone && (
        <div className="flex gap-2 flex-wrap">
          <a
            href={`tel:${booking.client_phone}`}
            className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-xl border border-[#E4E8EC] text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Phone size={13} /> Call Client
          </a>
          {(status === 'confirmed' || status === 'in_progress') && (
            <a
              href={waLink(booking.client_phone, buildConfirmationMsg(booking))}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <MessageCircle size={13} /> Send Confirmation
            </a>
          )}
          {status === 'confirmed' && (
            <a
              href={waLink(booking.client_phone, buildReminderMsg(booking))}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <MessageCircle size={13} /> Send Reminder
            </a>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1 flex-wrap">
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

