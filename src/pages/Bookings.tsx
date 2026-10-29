import { Link, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  Search, Calendar as CalendarIcon, Clock, MapPin, Phone,
  ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Columns3, SlidersHorizontal, CheckSquare, EyeOff, ExternalLink, GripVertical,
  TrendingUp, CheckCircle, CheckCircle2, AlertCircle, Upload, Download,
  FileSpreadsheet, MessageCircle, RefreshCw, RotateCcw,
  LayoutGrid, Table as TableIcon, Eye, User, Users, Sparkles, X, Filter, Repeat, Check, Trash2, Pencil,
  MoreVertical, Briefcase
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { NewBookingModal } from '@/components/bookings/NewBookingModal'
import { PageHero, type HeroNotification } from '@/components/layout/PageHero'
import { formatCurrency, formatDate, formatTime, addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { useData } from '@/store/DataContext'
import type { Booking, BookingFrequency, BookingStatus, Employee, Client, DailyJob } from '@/types'
import { SourceOriginTag, resolveBookingSource } from '@/lib/sourceTracking'
import { cleanClientNameFromAddress, isBogusJob, isMonthlyClient, crewToStaffName, staffNameToCrew, syncMonthlySchedulesToDailyJobs, getScheduledMonthlyShiftsForDate } from '@/lib/clientDataSync'
import { todayDubai } from '@/lib/dubaiTime'

export type BookingDatePreset = 'today' | '7days' | '30days' | '3months' | '6months' | '1year' | 'all' | 'custom'
export type BookingViewMode = 'grid' | 'table' | 'kanban' | 'calendar'

/* ─── Table Columns Definition & Customization ─── */
export interface TableColumnDef {
  id: string
  label: string
  defaultVisible: boolean
  minWidth?: string
  align?: 'left' | 'center' | 'right'
}

export const BOOKING_COLUMNS: TableColumnDef[] = [
  { id: 'ref',            label: 'Ref / Source',        defaultVisible: true,  minWidth: '125px', align: 'left' },
  { id: 'client',         label: 'Client & Contact',    defaultVisible: true,  minWidth: '185px', align: 'left' },
  { id: 'service',        label: 'Service Type',        defaultVisible: true,  minWidth: '150px', align: 'left' },
  { id: 'frequency',      label: 'Frequency',           defaultVisible: true,  minWidth: '120px', align: 'left' },
  { id: 'date',           label: 'Scheduled Date',      defaultVisible: true,  minWidth: '125px', align: 'left' },
  { id: 'time',           label: 'Shift Time',          defaultVisible: true,  minWidth: '120px', align: 'left' },
  { id: 'duty_hours',     label: 'Duty Hours',          defaultVisible: true,  minWidth: '110px', align: 'center' },
  { id: 'cleaners',       label: 'Assigned Cleaners',   defaultVisible: true,  minWidth: '170px', align: 'left' },
  { id: 'crew_size',      label: 'Crew Count',          defaultVisible: false, minWidth: '100px', align: 'center' },
  { id: 'address',        label: 'Service Address',     defaultVisible: true,  minWidth: '220px', align: 'left' },
  { id: 'amount',         label: 'Amount (AED)',        defaultVisible: true,  minWidth: '115px', align: 'right' },
  { id: 'status',         label: 'Status',              defaultVisible: true,  minWidth: '120px', align: 'center' },
  { id: 'payment_method', label: 'Payment Method',      defaultVisible: false, minWidth: '130px', align: 'left' },
  { id: 'notes',          label: 'Special Notes',       defaultVisible: false, minWidth: '200px', align: 'left' },
  { id: 'actions',        label: 'Actions',             defaultVisible: true,  minWidth: '130px', align: 'right' },
]

export function isMonthlyBooking(b: Booking, clients: Client[] = [], dailyJobs: DailyJob[] = []): boolean {
  if (b.frequency === 'monthly' || b.frequency === 'weekly' || b.frequency === 'biweekly' || (b.frequency as string) === 'bi-weekly') {
    return true
  }
  const matchedClient = clients.find(c =>
    (b.client_id && c.id === b.client_id) ||
    (c.full_name && b.client_name && c.full_name.toLowerCase().trim() === b.client_name.toLowerCase().trim())
  )
  if (matchedClient && isMonthlyClient(matchedClient, dailyJobs)) {
    return true
  }
  return false
}


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

/* ─── Normalized Booking Status Helper ─── */
export function normalizeBookingStatus(raw: string | undefined | null): BookingStatus {
  if (!raw) return 'confirmed'
  const s = raw.toLowerCase().trim()
  if (s === 'pending' || s === 'awaiting') return 'pending'
  if (s === 'in_progress' || s === 'live' || s === 'live now' || s === 'active' || s === 'started' || s === 'on site' || s === 'running') return 'in_progress'
  if (s === 'completed' || s === 'done' || s === 'finished' || s === 'closed') return 'completed'
  if (s === 'cancelled' || s === 'canceled' || s === 'rejected') return 'cancelled'
  if (s === 'confirmed' || s === 'scheduled' || s === 'upcoming') return 'confirmed'
  return 'confirmed'
}

/* ─── Status pill ─── */
const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string; border: string }> = {
  confirmed:   { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Scheduled', border: 'border-emerald-200' },
  scheduled:   { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Scheduled', border: 'border-emerald-200' },
  in_progress: { bg: 'bg-sky-50',      text: 'text-sky-700',     dot: 'bg-sky-500 animate-pulse', label: 'Live Now', border: 'border-sky-200' },
  live:        { bg: 'bg-sky-50',      text: 'text-sky-700',     dot: 'bg-sky-500 animate-pulse', label: 'Live Now', border: 'border-sky-200' },
  pending:     { bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-500',   label: 'Pending',   border: 'border-orange-200' },
  cancelled:   { bg: 'bg-rose-50',     text: 'text-rose-700',     dot: 'bg-rose-400',    label: 'Cancelled', border: 'border-rose-200' },
  completed:   { bg: 'bg-slate-100',   text: 'text-slate-700',    dot: 'bg-slate-400',   label: 'Done',      border: 'border-slate-200' },
}
function StatusPill({ status }: { status: string }) {
  const norm = normalizeBookingStatus(status)
  const c = statusConfig[norm] ?? { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-400', label: status, border: 'border-slate-200' }
  return (
    <span className={`text-[11px] px-2.5 py-[3px] rounded-full font-semibold inline-flex items-center gap-1.5 border ${c.bg} ${c.text} ${c.border}`}>
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

/* ─── Helpers for Bookings page ─── */
function getAssignedCrewNames(assignedCrew: string[] | undefined, employees: Employee[]): string[] {
  if (!assignedCrew || assignedCrew.length === 0) return []
  return assignedCrew.map(cId => {
    const emp = employees.find(e => e.id === cId || e.full_name.toLowerCase().trim() === cId.toLowerCase().trim())
    return emp ? emp.full_name : cId
  })
}

function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="bg-white rounded-2xl border border-teal-200/80 shadow-2xs px-4 py-3 flex items-center justify-between flex-wrap gap-3 text-[12.5px]">
      <p className="text-slate-500 font-medium">
        Showing <span className="font-bold text-slate-800">{startItem}</span> to{' '}
        <span className="font-bold text-slate-800">{endItem}</span> of{' '}
        <span className="font-bold text-slate-800">{totalItems}</span> bookings
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-teal-200/80 bg-teal-50/30 hover:bg-teal-100/50 disabled:opacity-40 disabled:pointer-events-none font-bold text-teal-900 transition-colors cursor-pointer"
        >
          <ChevronLeft size={13} />
          <span>Previous</span>
        </button>

        <span className="px-3 py-1 font-bold text-teal-900 bg-teal-50 border border-teal-200/60 rounded-lg">
          Page {currentPage} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-teal-200/80 bg-teal-50/30 hover:bg-teal-100/50 disabled:opacity-40 disabled:pointer-events-none font-bold text-teal-900 transition-colors cursor-pointer"
        >
          <span>Next</span>
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
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
    addDailyJob,
    updateDailyJob,
    deleteDailyJob,
    clients,
    employees,
  } = useData()
  const [view, setView] = useState<BookingViewMode>('grid')
  const [currentPage, setCurrentPage] = useState(1)
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const [importing,   setImporting]   = useState(false)
  const [datePreset,  setDatePreset]  = useState<BookingDatePreset>('today')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate,   setCustomEndDate]   = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false)
  const threeDotMenuRef = useRef<HTMLDivElement>(null)
  const [showAllCards, setShowAllCards] = useState(false)

  // Notifications state with localStorage persistence
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    return safeLocalStorageGet('safaeewala_bookings_read_notifs', [])
  })
  const [deletedNotifIds, setDeletedNotifIds] = useState<string[]>(() => {
    return safeLocalStorageGet('safaeewala_bookings_deleted_notifs', [])
  })

  // Daily Job Sheet auto-sync state
  const [syncedShiftsCount, setSyncedShiftsCount] = useState<number>(0)
  const hasAutoSyncedRef = useRef(false)

  // Close three-dot menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (threeDotMenuRef.current && !threeDotMenuRef.current.contains(e.target as Node)) {
        setShowThreeDotMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

      const matchedClient = clients.find(c =>
        (c.full_name && c.full_name.toLowerCase().trim() === clientName.toLowerCase().trim()) ||
        (j.address && c.full_name && j.address.toLowerCase().includes(c.full_name.toLowerCase()))
      )

      syntheticBookings.push({
        id: `dj-${j.id}`,
        client_id: matchedClient?.id || '',
        client_name: clientName,
        client_phone: matchedClient?.phone || matchedClient?.whatsapp || '',
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

    // 3. Ensure scheduled recurring monthly contracts have a shift card synchronized
    const today = todayDubai()
    const scheduledMonthly = getScheduledMonthlyShiftsForDate(today, clients, dailyJobs)
    scheduledMonthly.shifts.forEach(shift => {
      const shiftClientName = (shift.client?.full_name || '').toLowerCase().trim()
      if (!shiftClientName) return
      const existing = enrichedBookings.some(b => b.scheduled_date === today && b.client_name.toLowerCase().trim() === shiftClientName) ||
                       syntheticBookings.some(b => b.scheduled_date === today && b.client_name.toLowerCase().trim() === shiftClientName)
      if (!existing) {
        syntheticBookings.push({
          id: `monthly-sync-${shift.client?.id || shiftClientName}-${today}`,
          client_id: shift.client?.id || '',
          client_name: shift.client?.full_name || '',
          client_phone: shift.client?.phone || shift.client?.whatsapp || '',
          service_address: shift.address || shift.area || [shift.client?.apartment, shift.client?.building_name, shift.client?.area].filter(Boolean).join(', ') || 'Dubai',
          service_type: shift.service || 'Standard Cleaning',
          status: 'confirmed',
          frequency: 'monthly',
          scheduled_date: today,
          scheduled_time: shift.startTime || '09:00',
          end_time: shift.endTime || (shift.durationHours ? addHoursToTime(shift.startTime || '09:00', shift.durationHours) : '13:00'),
          duration_hours: shift.durationHours || 4,
          assigned_crew: shift.cleanerName ? staffNameToCrew(shift.cleanerName, employees) : [],
          notes: shift.remarks || 'Monthly Recurring Shift',
          total_amount: shift.charges || 0,
          created_at: `${today}T08:00:00Z`,
          source: 'monthly_schedule',
        })
      }
    })

    return [...enrichedBookings, ...syntheticBookings]
  }, [bookings, dailyJobs, employees, clients])

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

  // Filter by search, status, and service type, with date descending sort for consistency across Today & All Time
  const filtered = useMemo(() => {
    return dateFilteredBookings
      .filter((b) => {
        const q = search.toLowerCase().trim()
        const matchSearch = !q ||
          b.client_name.toLowerCase().includes(q) ||
          b.service_type.toLowerCase().includes(q) ||
          b.service_address.toLowerCase().includes(q) ||
          (b.client_phone && b.client_phone.includes(q))
        
        const bStatus = normalizeBookingStatus(b.status)
        const matchStatus = statusFilter === 'all'
          ? true
          : statusFilter === 'unassigned'
          ? (!b.assigned_crew || b.assigned_crew.length === 0) && bStatus !== 'completed' && bStatus !== 'cancelled'
          : statusFilter === 'monthly'
          ? isMonthlyBooking(b, clients, dailyJobs)
          : bStatus === statusFilter

        const matchService = serviceFilter === 'all' ||
          b.service_type.toLowerCase().includes(serviceFilter.toLowerCase())
        
        return matchSearch && matchStatus && matchService
      })
      .sort((a, b) => {
        const dateA = a.scheduled_date || (a.created_at ? a.created_at.split('T')[0] : '')
        const dateB = b.scheduled_date || (b.created_at ? b.created_at.split('T')[0] : '')
        if (dateA !== dateB) return dateB.localeCompare(dateA)
        const timeA = a.scheduled_time || '00:00'
        const timeB = b.scheduled_time || '00:00'
        return timeA.localeCompare(timeB)
      })
  }, [dateFilteredBookings, search, statusFilter, serviceFilter])

  const unassignedCount = useMemo(() => {
    return dateFilteredBookings.filter(
      b => {
        const bStatus = normalizeBookingStatus(b.status)
        return (!b.assigned_crew || b.assigned_crew.length === 0) &&
          bStatus !== 'completed' &&
          bStatus !== 'cancelled'
      }
    ).length
  }, [dateFilteredBookings])

  const totalScheduledHours = useMemo(() => {
    return dateFilteredBookings.reduce((sum, b) => sum + (b.duration_hours || 0), 0)
  }, [dateFilteredBookings])

  const totalWorkloadValue = useMemo(() => {
    return dateFilteredBookings
      .filter(b => normalizeBookingStatus(b.status) !== 'cancelled')
      .reduce((s, b) => s + (b.total_amount || 0), 0)
  }, [dateFilteredBookings])

  const counts = {
    total:       dateFilteredBookings.length,
    pending:     dateFilteredBookings.filter(b => normalizeBookingStatus(b.status) === 'pending').length,
    confirmed:   dateFilteredBookings.filter(b => normalizeBookingStatus(b.status) === 'confirmed').length,
    in_progress: dateFilteredBookings.filter(b => normalizeBookingStatus(b.status) === 'in_progress').length,
    completed:   dateFilteredBookings.filter(b => normalizeBookingStatus(b.status) === 'completed').length,
    cancelled:   dateFilteredBookings.filter(b => normalizeBookingStatus(b.status) === 'cancelled').length,
  }

  const completedRevenue = dateFilteredBookings
    .filter(b => normalizeBookingStatus(b.status) === 'completed')
    .reduce((s, b) => s + (b.total_amount || 0), 0)

  // Auto-reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, serviceFilter, datePreset, customStartDate, customEndDate, view])

  // ── Table View Column Customization & Drag-and-Drop Reordering ──
  const [columnsOrder, setColumnsOrder] = useState<string[]>(() => {
    const saved = safeLocalStorageGet<{ order?: string[] }>('safaeewala_bookings_table_cols_v2', {})
    if (saved.order && Array.isArray(saved.order) && saved.order.length > 0) {
      const validIds = new Set(BOOKING_COLUMNS.map(c => c.id))
      const filteredSaved = saved.order.filter(id => validIds.has(id))
      const missing = BOOKING_COLUMNS.map(c => c.id).filter(id => !filteredSaved.includes(id))
      return [...filteredSaved, ...missing]
    }
    return BOOKING_COLUMNS.map(c => c.id)
  })

  const [columnsVisibility, setColumnsVisibility] = useState<Record<string, boolean>>(() => {
    const saved = safeLocalStorageGet<{ visible?: Record<string, boolean> }>('safaeewala_bookings_table_cols_v2', {})
    const defaults: Record<string, boolean> = {}
    BOOKING_COLUMNS.forEach(c => {
      defaults[c.id] = saved.visible && typeof saved.visible[c.id] === 'boolean'
        ? saved.visible[c.id]
        : c.defaultVisible
    })
    return defaults
  })

  const [showColumnsPopover, setShowColumnsPopover] = useState(false)
  const [draggedColId, setDraggedColId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)
  const columnsPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showColumnsPopover) return
    const handleClickOutside = (e: MouseEvent) => {
      if (columnsPopoverRef.current && !columnsPopoverRef.current.contains(e.target as Node)) {
        setShowColumnsPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showColumnsPopover])

  const saveColumnsConfig = (order: string[], visible: Record<string, boolean>) => {
    setColumnsOrder(order)
    setColumnsVisibility(visible)
    safeLocalStorageSet('safaeewala_bookings_table_cols_v2', { order, visible })
  }

  const handleHeaderDragStart = (e: React.DragEvent, colId: string) => {
    e.dataTransfer.setData('text/plain', colId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedColId(colId)
  }

  const handleHeaderDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColId !== colId) {
      setDragOverColId(colId)
    }
  }

  const handleHeaderDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault()
    setDragOverColId(null)
    const sourceColId = draggedColId || e.dataTransfer.getData('text/plain')
    setDraggedColId(null)
    if (!sourceColId || sourceColId === targetColId) return

    const newOrder = [...columnsOrder]
    const sourceIdx = newOrder.indexOf(sourceColId)
    const targetIdx = newOrder.indexOf(targetColId)
    if (sourceIdx === -1 || targetIdx === -1) return

    newOrder.splice(sourceIdx, 1)
    newOrder.splice(targetIdx, 0, sourceColId)
    saveColumnsConfig(newOrder, columnsVisibility)
  }

  const toggleColumnVisibility = (colId: string) => {
    if (colId === 'client' || colId === 'actions') return
    const next = { ...columnsVisibility, [colId]: !columnsVisibility[colId] }
    saveColumnsConfig(columnsOrder, next)
  }

  const resetColumnsToDefault = () => {
    const defaultOrder = BOOKING_COLUMNS.map(c => c.id)
    const defaultVis: Record<string, boolean> = {}
    BOOKING_COLUMNS.forEach(c => { defaultVis[c.id] = c.defaultVisible })
    saveColumnsConfig(defaultOrder, defaultVis)
  }

  const visibleColumns = useMemo(() => {
    const colMap = new Map(BOOKING_COLUMNS.map(c => [c.id, c]))
    return columnsOrder
      .filter(id => columnsVisibility[id] !== false)
      .map(id => colMap.get(id))
      .filter((c): c is TableColumnDef => !!c)
  }, [columnsOrder, columnsVisibility])

  const pageSize = view === 'table' ? 20 : 12
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginatedBookings = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  const totalPageDutyHours = useMemo(() => {
    return paginatedBookings.reduce((sum, b) => sum + (Number(b.duration_hours) || 0), 0)
  }, [paginatedBookings])

  const totalFilteredDutyHours = useMemo(() => {
    return filtered.reduce((sum, b) => sum + (Number(b.duration_hours) || 0), 0)
  }, [filtered])


  // Auto-sync monthly recurring shifts to Daily Job Sheet for today
  useEffect(() => {
    if (hasAutoSyncedRef.current) return
    const today = todayDubai()
    const res = syncMonthlySchedulesToDailyJobs(today, clients, dailyJobs, addDailyJob)
    if (res.insertedCount > 0) {
      setSyncedShiftsCount(res.insertedCount)
      hasAutoSyncedRef.current = true
    }
  }, [clients, dailyJobs, addDailyJob])

  const handleSyncDailyJobSheet = () => {
    const today = todayDubai()
    const res = syncMonthlySchedulesToDailyJobs(today, clients, dailyJobs, addDailyJob)
    setSyncedShiftsCount(res.insertedCount)
    return res
  }

  // Active Notifications List
  const readSet = useMemo(() => new Set(readNotifIds), [readNotifIds])
  const deletedSet = useMemo(() => new Set(deletedNotifIds), [deletedNotifIds])

  const bookingNotifications = useMemo<HeroNotification[]>(() => {
    const list: HeroNotification[] = []
    const today = todayDubai()

    // 1. Pending bookings awaiting confirmation
    const pendingList = synchronizedBookings.filter(b => b.status === 'pending')
    pendingList.forEach(b => {
      const id = `pending-${b.id}`
      if (deletedSet.has(id)) return
      list.push({
        id,
        title: `Pending Booking: ${b.client_name}`,
        detail: `${b.service_type} on ${b.scheduled_date} at ${b.scheduled_time} awaiting confirmation`,
        tone: 'warning',
        time: b.scheduled_date === today ? 'Today' : b.scheduled_date,
        read: readSet.has(id),
        onClick: () => {
          setStatusFilter('pending')
          setSelectedBooking(b)
        },
      })
    })

    // 2. Unassigned staff on today's active bookings
    const unassignedToday = synchronizedBookings.filter(
      b => b.scheduled_date === today &&
           b.status !== 'completed' &&
           b.status !== 'cancelled' &&
           (!b.assigned_crew || b.assigned_crew.length === 0)
    )
    unassignedToday.forEach(b => {
      const id = `unassigned-${b.id}`
      if (deletedSet.has(id)) return
      list.push({
        id,
        title: `Unassigned Cleaner: ${b.client_name}`,
        detail: `Today at ${b.scheduled_time} (${b.duration_hours}h) needs cleaner assigned!`,
        tone: 'danger',
        time: b.scheduled_time,
        read: readSet.has(id),
        onClick: () => {
          setSelectedBooking(b)
        },
      })
    })

    // 3. Live shifts currently running
    const liveNow = synchronizedBookings.filter(
      b => b.status === 'in_progress' && b.scheduled_date === today
    )
    liveNow.forEach(b => {
      const id = `live-${b.id}`
      if (deletedSet.has(id)) return
      list.push({
        id,
        title: `Shift Live: ${b.client_name}`,
        detail: `Cleaner on-site (${b.scheduled_time} - ${b.end_time}) • ${b.service_type}`,
        tone: 'info',
        time: 'Live',
        read: readSet.has(id),
        onClick: () => {
          setStatusFilter('in_progress')
          setSelectedBooking(b)
        },
      })
    })

    // 4. Monthly recurring shifts auto-synced notice
    if (syncedShiftsCount > 0) {
      const id = `monthly-sync-${today}`
      if (!deletedSet.has(id)) {
        list.push({
          id,
          title: `Daily Job Sheet Synced`,
          detail: `${syncedShiftsCount} monthly recurring shifts generated on Daily Job Sheet for today`,
          tone: 'success',
          time: 'Today',
          read: readSet.has(id),
        })
      }
    }

    return list
  }, [synchronizedBookings, deletedSet, readSet, syncedShiftsCount])

  const handleMarkNotifRead = (id: string) => {
    setReadNotifIds(prev => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      safeLocalStorageSet('safaeewala_bookings_read_notifs', next)
      return next
    })
  }

  const handleMarkAllNotifsRead = () => {
    const allIds = bookingNotifications.map(n => n.id)
    setReadNotifIds(allIds)
    safeLocalStorageSet('safaeewala_bookings_read_notifs', allIds)
  }

  const handleDeleteNotif = (id: string) => {
    setDeletedNotifIds(prev => {
      const next = [...prev, id]
      safeLocalStorageSet('safaeewala_bookings_deleted_notifs', next)
      return next
    })
  }

  const handleClearAllNotifs = () => {
    const allIds = bookingNotifications.map(n => n.id)
    setDeletedNotifIds(prev => {
      const next = Array.from(new Set([...prev, ...allIds]))
      safeLocalStorageSet('safaeewala_bookings_deleted_notifs', next)
      return next
    })
  }

  // Monthly clients count & extra metrics (strictly in sync with dateFilteredBookings)
  const monthlyBookingsInScope = useMemo(() => {
    return dateFilteredBookings.filter(b => isMonthlyBooking(b, clients, dailyJobs)).length
  }, [dateFilteredBookings, clients, dailyJobs])
  const totalRegisteredMonthly = useMemo(() => {
    return clients.filter(c => isMonthlyClient(c, dailyJobs)).length
  }, [clients, dailyJobs])

  const uniqueCleanersOnDuty = useMemo(() => {
    const staffSet = new Set<string>()
    dateFilteredBookings.forEach(b => {
      (b.assigned_crew || []).forEach(c => staffSet.add(c))
    })
    return staffSet.size
  }, [dateFilteredBookings])

  const avgShiftDuration = useMemo(() => {
    if (counts.total === 0) return '0.0'
    return (totalScheduledHours / counts.total).toFixed(1)
  }, [counts.total, totalScheduledHours])

  // Card background styling: consistent status-based pastel color hierarchy across Today, All Time, and all views
  const getCardStatusTheme = (rawStatus: string | undefined | null) => {
    const s = normalizeBookingStatus(rawStatus)
    switch (s) {
      case 'pending':
        // Pending: light orange
        return {
          cardClass: 'bg-orange-50/85 border-orange-200/90 hover:bg-orange-50 hover:border-orange-400 shadow-[0_4px_20px_rgba(249,115,22,0.06)] hover:shadow-xl',
          boxClass: 'bg-white/85 border-orange-200/70',
        }
      case 'confirmed':
        // Scheduled: light green
        return {
          cardClass: 'bg-emerald-50/85 border-emerald-200/90 hover:bg-emerald-50 hover:border-emerald-400 shadow-[0_4px_20px_rgba(16,185,129,0.06)] hover:shadow-xl',
          boxClass: 'bg-white/85 border-emerald-200/70',
        }
      case 'in_progress':
        // Live: light blue
        return {
          cardClass: 'bg-sky-50/85 border-sky-200/90 hover:bg-sky-50 hover:border-sky-400 shadow-[0_4px_20px_rgba(14,165,233,0.08)] hover:shadow-xl',
          boxClass: 'bg-white/85 border-sky-200/70',
        }
      case 'completed':
        // Completed: light grey
        return {
          cardClass: 'bg-slate-100/80 border-slate-200/90 hover:bg-slate-100 hover:border-slate-300 shadow-[0_4px_20px_rgba(15,23,42,0.04)] hover:shadow-xl',
          boxClass: 'bg-white/85 border-slate-200/70',
        }
      case 'cancelled':
        // Cancelled: light red
        return {
          cardClass: 'bg-rose-50/85 border-rose-200/90 hover:bg-rose-50 hover:border-rose-400 shadow-[0_4px_20px_rgba(244,63,94,0.06)] hover:shadow-xl',
          boxClass: 'bg-white/85 border-rose-200/70',
        }
      default:
        return {
          cardClass: 'bg-emerald-50/85 border-emerald-200/90 hover:bg-emerald-50 hover:border-emerald-400 shadow-[0_4px_20px_rgba(16,185,129,0.06)] hover:shadow-xl',
          boxClass: 'bg-white/85 border-emerald-200/70',
        }
    }
  }

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

      {/* ── KPI Summary Cards (Row 1 + View All Expandable Row 2) ── */}
      <div className="space-y-3">
        {/* ROW 1: Essential Operational Metrics & Monthly Clients */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {[
            {
              label: 'Total Bookings',
              value: counts.total,
              sub: `${totalScheduledHours}h total duty`,
              icon: Briefcase,
              iconColor: 'text-teal-700',
              iconBg: 'bg-teal-50',
              badge: `AED ${totalWorkloadValue.toLocaleString()}`,
              badgeColor: 'bg-teal-50 text-teal-800 border-teal-200/80',
              filterKey: 'all',
            },
            {
              label: 'Scheduled',
              value: counts.confirmed,
              sub: 'Confirmed upcoming jobs',
              icon: CalendarIcon,
              iconColor: 'text-teal-600',
              iconBg: 'bg-teal-50',
              badge: `${counts.total > 0 ? Math.round((counts.confirmed / counts.total) * 100) : 0}% of Total`,
              badgeColor: 'bg-teal-50 text-teal-800 border-teal-200/80',
              filterKey: 'confirmed',
            },
            {
              label: 'Live Now',
              value: counts.in_progress,
              sub: 'Cleaners on site today',
              icon: TrendingUp,
              iconColor: 'text-cyan-600',
              iconBg: 'bg-cyan-50',
              badge: counts.in_progress > 0 ? 'Active Shifts' : 'Standby',
              badgeColor: counts.in_progress > 0 ? 'bg-cyan-100 text-cyan-800 border-cyan-300 animate-pulse' : 'bg-slate-50 text-slate-600 border-slate-200',
              filterKey: 'in_progress',
            },
            {
              label: 'Pending',
              value: counts.pending,
              sub: 'Awaiting confirmation',
              icon: AlertCircle,
              iconColor: 'text-amber-500',
              iconBg: 'bg-amber-50',
              badge: counts.pending > 0 ? `${counts.pending} Action Needed` : 'All Clear',
              badgeColor: counts.pending > 0 ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
              filterKey: 'pending',
            },
            {
              label: 'Completed',
              value: counts.completed,
              sub: `AED ${completedRevenue.toLocaleString()} billed`,
              icon: CheckCircle2,
              iconColor: 'text-emerald-600',
              iconBg: 'bg-emerald-50',
              badge: `${counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0}% Done`,
              badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
              filterKey: 'completed',
            },
            {
              label: 'Monthly Clients',
              value: monthlyBookingsInScope,
              sub: `${totalRegisteredMonthly} registered contracts`,
              icon: Repeat,
              iconColor: 'text-teal-700',
              iconBg: 'bg-teal-50',
              badge: 'Job Sheet Synced',
              badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
              filterKey: 'monthly',
            },
          ].map(card => {
            const isActive = statusFilter === card.filterKey && card.filterKey !== 'all'
            return (
              <div
                key={card.label}
                onClick={() => {
                  if (card.filterKey === 'all') {
                    setStatusFilter('all')
                  } else {
                    setStatusFilter(statusFilter === card.filterKey ? 'all' : card.filterKey)
                  }
                }}
                className={`rounded-[22px] border transition-all p-4 cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                  isActive
                    ? 'bg-teal-50/70 border-teal-500 shadow-md ring-2 ring-teal-500/20'
                    : 'bg-white border-teal-100/90 shadow-[0_4px_20px_rgba(13,148,136,0.04)] hover:shadow-md hover:border-teal-300'
                }`}
              >
                <div className="flex items-start justify-between mb-2.5">
                  <div className={`w-9 h-9 rounded-xl ${card.iconBg} border border-teal-100 flex items-center justify-center shrink-0`}>
                    <card.icon size={17} className={card.iconColor} />
                  </div>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border truncate max-w-[110px] ${card.badgeColor}`}>
                    {card.badge}
                  </span>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{card.value}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[12px] font-bold text-slate-800">{card.label}</p>
                    {isActive && (
                      <span className="text-[9.5px] font-black text-teal-800 uppercase tracking-wider bg-teal-100 px-1.5 py-0.5 rounded-md">
                        Filtered
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{card.sub}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* View All Toggle Button */}
        <div className="flex items-center justify-center pt-0.5">
          <button
            type="button"
            onClick={() => setShowAllCards(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-teal-50/80 hover:bg-teal-100 border border-teal-200/80 text-teal-900 text-[11.5px] font-bold shadow-2xs transition-all cursor-pointer group"
          >
            <span>{showAllCards ? 'Collapse Cards' : 'View All Metrics & Cards'}</span>
            <ChevronDown
              size={13}
              className={`transform transition-transform duration-200 text-teal-700 group-hover:text-teal-900 ${
                showAllCards ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* ROW 2: Expanded Operational Metrics (Rendered when showAllCards is true) */}
        {showAllCards && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
            {[
              {
                label: 'Staff Allocated',
                value: `${counts.total - unassignedCount} / ${counts.total}`,
                sub: unassignedCount > 0 ? `${unassignedCount} jobs unassigned` : '100% staff allocated',
                icon: Users,
                iconColor: unassignedCount > 0 ? 'text-amber-600' : 'text-purple-600',
                iconBg: unassignedCount > 0 ? 'bg-amber-50' : 'bg-purple-50',
                badge: unassignedCount > 0 ? `${unassignedCount} Unassigned` : '100% Allocated',
                badgeColor: unassignedCount > 0 ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
                filterKey: 'unassigned',
              },
              {
                label: 'Total Workload',
                value: `AED ${totalWorkloadValue.toLocaleString()}`,
                sub: 'Total booked value',
                icon: Briefcase,
                iconColor: 'text-indigo-600',
                iconBg: 'bg-indigo-50',
                badge: `${counts.total} Orders`,
                badgeColor: 'bg-indigo-50 text-indigo-800 border-indigo-200',
                filterKey: 'all',
              },
              {
                label: 'Billed Revenue',
                value: `AED ${completedRevenue.toLocaleString()}`,
                sub: 'Completed shift dues',
                icon: CheckCircle2,
                iconColor: 'text-emerald-600',
                iconBg: 'bg-emerald-50',
                badge: `${counts.completed} Paid`,
                badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                filterKey: 'completed',
              },
              {
                label: 'Cleaners on Duty',
                value: uniqueCleanersOnDuty,
                sub: 'Active roster on shifts',
                icon: User,
                iconColor: 'text-teal-600',
                iconBg: 'bg-teal-50',
                badge: 'Active Staff',
                badgeColor: 'bg-teal-50 text-teal-800 border-teal-200',
                filterKey: 'all',
              },
              {
                label: 'Avg Shift Duty',
                value: `${avgShiftDuration}h`,
                sub: 'Average duty hours',
                icon: Clock,
                iconColor: 'text-blue-600',
                iconBg: 'bg-blue-50',
                badge: `${totalScheduledHours}h Total`,
                badgeColor: 'bg-blue-50 text-blue-800 border-blue-200',
                filterKey: 'all',
              },
              {
                label: 'Job Sheet Sync',
                value: 'Auto-Sync',
                sub: `${syncedShiftsCount} shifts synced today`,
                icon: RefreshCw,
                iconColor: 'text-emerald-600',
                iconBg: 'bg-emerald-50',
                badge: 'Live Sync',
                badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                filterKey: 'all',
                onClick: handleSyncDailyJobSheet,
              },
            ].map(card => {
              const isActive = statusFilter === card.filterKey && card.filterKey !== 'all'
              return (
                <div
                  key={card.label}
                  onClick={() => {
                    if (card.onClick) {
                      card.onClick()
                    } else if (card.filterKey === 'all') {
                      setStatusFilter('all')
                    } else {
                      setStatusFilter(statusFilter === card.filterKey ? 'all' : card.filterKey)
                    }
                  }}
                  className={`rounded-[22px] border transition-all p-4 cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                    isActive
                      ? 'bg-teal-50/70 border-teal-500 shadow-md ring-2 ring-teal-500/20'
                      : 'bg-white border-teal-100/90 shadow-[0_4px_20px_rgba(13,148,136,0.04)] hover:shadow-md hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2.5">
                    <div className={`w-9 h-9 rounded-xl ${card.iconBg} border border-teal-100 flex items-center justify-center shrink-0`}>
                      <card.icon size={17} className={card.iconColor} />
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border truncate max-w-[110px] ${card.badgeColor}`}>
                      {card.badge}
                    </span>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">{card.value}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[12px] font-bold text-slate-800">{card.label}</p>
                      {isActive && (
                        <span className="text-[9.5px] font-black text-teal-800 uppercase tracking-wider bg-teal-100 px-1.5 py-0.5 rounded-md">
                          Filtered
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{card.sub}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Filters + Unified Toolbar (Two Organized Rows) ── */}
      <div className="bg-white rounded-[22px] border border-teal-200/80 shadow-[0_4px_24px_rgba(13,148,136,0.05)] p-4 space-y-3">
        {/* ── ROW 1 (TOP ROW): Search, All Time, View Toggles, All Services, Three Dot Menu ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left Group: Search, All Time, All Services */}
          <div className="flex flex-1 items-center gap-2.5 flex-wrap min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-600/70" />
              <input
                type="text"
                placeholder="Search client, service, phone, address…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-[13px] pl-9 pr-8 py-2 bg-teal-50/20 border border-teal-200/80 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white placeholder-slate-400 font-medium transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* All Time (Date Preset Dropdown) */}
            <div className="relative">
              <select
                value={datePreset}
                onChange={e => setDatePreset(e.target.value as BookingDatePreset)}
                className="text-[12.5px] px-3.5 py-2 bg-teal-50/30 border border-teal-200/80 rounded-xl focus:outline-none focus:border-teal-500 text-teal-950 font-bold cursor-pointer transition-colors shadow-2xs hover:border-teal-300"
              >
                <option value="today">📅 Today</option>
                <option value="all">📅 All Time</option>
                <option value="7days">📅 Last 7 Days</option>
                <option value="30days">📅 Last 30 Days</option>
                <option value="3months">📅 Last 3 Months</option>
                <option value="6months">📅 Last 6 Months</option>
                <option value="1year">📅 Last 1 Year</option>
                <option value="custom">📅 Custom Range…</option>
              </select>
            </div>

            {/* All Services Dropdown */}
            <div className="relative">
              <select
                value={serviceFilter}
                onChange={e => setServiceFilter(e.target.value)}
                className="text-[12.5px] px-3.5 py-2 bg-teal-50/30 border border-teal-200/80 rounded-xl focus:outline-none focus:border-teal-500 text-teal-950 font-semibold cursor-pointer transition-colors shadow-2xs hover:border-teal-300"
              >
                <option value="all">All Services</option>
                {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Right Group: View Toggles & Three Dot Menu */}
          <div className="flex items-center gap-2 shrink-0">
            {/* View Mode Toggle (Card-Style Buttons without container background border) */}
            <div className="flex items-center p-1 bg-slate-100/80 rounded-2xl gap-1">
              {[
                { key: 'grid', label: 'Cards', icon: LayoutGrid },
                { key: 'table', label: 'Table', icon: TableIcon },
                { key: 'kanban', label: 'Board', icon: Columns3 },
                { key: 'calendar', label: 'Calendar', icon: CalendarDays },
              ].map(item => {
                const active = view === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setView(item.key as BookingViewMode)}
                    className={`text-[12px] px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                      active
                        ? 'bg-white text-teal-950 shadow-[0_2px_8px_rgba(0,0,0,0.08)] font-black ring-1 ring-black/5'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                    title={`${item.label} View`}
                  >
                    <item.icon size={13} className={active ? 'text-teal-700' : 'text-slate-500'} />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Three Dot Menu (Import / Export / Clear) */}
            <div className="relative" ref={threeDotMenuRef}>
              <button
                type="button"
                onClick={() => setShowThreeDotMenu(!showThreeDotMenu)}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                  showThreeDotMenu
                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                    : 'bg-teal-50/40 text-teal-800 border border-teal-200/80 hover:bg-teal-100/50 hover:border-teal-300'
                }`}
                title="More Options (Import / Export)"
              >
                <MoreVertical size={16} />
              </button>

              {showThreeDotMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-2xl border border-teal-200/90 shadow-xl z-50 py-1.5 divide-y divide-teal-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3.5 py-1.5 text-[10.5px] font-black uppercase text-teal-700 tracking-wider">
                    Data & Tools
                  </div>
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowThreeDotMenu(false)
                        xlsxInputRef.current?.click()
                      }}
                      disabled={importing}
                      className="w-full px-3.5 py-2 text-left text-[12.5px] font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-900 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Upload size={14} className="text-teal-600" />
                      <span>{importing ? 'Importing…' : 'Import Bookings (Excel)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowThreeDotMenu(false)
                        exportBookingsXLSX(filtered)
                      }}
                      className="w-full px-3.5 py-2 text-left text-[12.5px] font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-900 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet size={14} className="text-emerald-600" />
                      <span>Export Bookings (Excel)</span>
                    </button>
                  </div>
                  {(search || serviceFilter !== 'all' || statusFilter !== 'all' || datePreset !== 'all') && (
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowThreeDotMenu(false)
                          setSearch('')
                          setServiceFilter('all')
                          setStatusFilter('all')
                          setDatePreset('today')
                          setCustomStartDate('')
                          setCustomEndDate('')
                        }}
                        className="w-full px-3.5 py-2 text-left text-[12.5px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <RotateCcw size={14} />
                        <span>Reset All Filters</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Custom Date Pickers (if datePreset === 'custom') */}
        {datePreset === 'custom' && (
          <div className="pt-2 border-t border-teal-100 flex items-center gap-3 flex-wrap">
            <span className="text-[11.5px] font-black uppercase text-teal-800">Custom Date Range:</span>
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-bold text-slate-500">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="text-[12px] px-2.5 py-1 bg-white border border-teal-200/80 rounded-lg focus:outline-none focus:border-teal-500 font-medium"
              />
              <span className="text-[11.5px] font-bold text-slate-500">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="text-[12px] px-2.5 py-1 bg-white border border-teal-200/80 rounded-lg focus:outline-none focus:border-teal-500 font-medium"
              />
            </div>
          </div>
        )}

        {/* ── ROW 2 (BOTTOM ROW): Just "All Statuses" ── */}
        <div className="pt-2.5 border-t border-teal-100/80 flex items-center justify-between gap-2 flex-wrap">
          {/* Status Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { label: 'All Statuses', value: 'all', count: counts.total, color: 'teal' },
              { label: 'Pending', value: 'pending', count: counts.pending, color: 'amber' },
              { label: 'Scheduled', value: 'confirmed', count: counts.confirmed, color: 'teal' },
              { label: 'Live Now', value: 'in_progress', count: counts.in_progress, color: 'cyan' },
              { label: 'Completed', value: 'completed', count: counts.completed, color: 'emerald' },
              { label: 'Cancelled', value: 'cancelled', count: counts.cancelled, color: 'rose' },
            ].map(tab => {
              const active = statusFilter === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? tab.color === 'amber'
                        ? 'bg-amber-600 text-white shadow-xs border border-amber-600'
                        : tab.color === 'cyan'
                        ? 'bg-cyan-700 text-white shadow-xs border border-cyan-700'
                        : tab.color === 'emerald'
                        ? 'bg-emerald-600 text-white shadow-xs border border-emerald-600'
                        : tab.color === 'rose'
                        ? 'bg-rose-600 text-white shadow-xs border border-rose-600'
                        : 'bg-teal-700 text-white shadow-xs border border-teal-700'
                      : 'bg-teal-50/20 text-slate-600 border border-teal-100/90 hover:border-teal-300 hover:bg-teal-50/50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-slate-700 border border-teal-200/60'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Right: Active Count Indicator or Clear Button */}
          {(search || serviceFilter !== 'all' || statusFilter !== 'all' || datePreset !== 'all') && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-1 rounded-lg">
                Filtered: <strong>{filtered.length}</strong> of {counts.total}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setServiceFilter('all')
                  setStatusFilter('all')
                  setDatePreset('today')
                  setCustomStartDate('')
                  setCustomEndDate('')
                }}
                className="text-[11.5px] font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── CARDS GRID VIEW ── */}
      {view === 'grid' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginatedBookings.map((b, idx) => {
              const assignedNames = getAssignedCrewNames(b.assigned_crew, employees)
              const matchedClient = clients.find(c => c.id === b.client_id || c.full_name.toLowerCase().trim() === b.client_name.toLowerCase().trim())
              const isMonthly = b.frequency === 'monthly' || b.frequency === 'weekly' || b.frequency === 'biweekly' || (b.frequency as string) === 'bi-weekly' || (matchedClient && isMonthlyClient(matchedClient, dailyJobs))
              const clientPhone = b.client_phone || matchedClient?.phone || matchedClient?.whatsapp || ''
              const theme = getCardStatusTheme(b.status)

              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedBooking(b)}
                  className={`${theme.cardClass} rounded-[22px] border p-5 transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden`}
                >
                  {/* Status Indicator Bar at Top */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                    b.status === 'in_progress' ? 'bg-gradient-to-r from-cyan-500 to-teal-500' :
                    b.status === 'confirmed' ? 'bg-gradient-to-r from-emerald-500 to-teal-500' :
                    b.status === 'pending' ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
                    b.status === 'completed' ? 'bg-slate-400' : 'bg-rose-400'
                  }`} />

                  <div>
                    {/* Header: Client & Status */}
                    <div className="flex items-start justify-between gap-2.5 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Initials name={b.client_name} idx={idx} />
                        <div className="min-w-0">
                          <h4 className="text-[14px] font-bold text-slate-900 group-hover:text-teal-700 transition-colors truncate" title={b.client_name}>
                            {b.client_name}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {isMonthly && (
                              <span className="text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Monthly
                              </span>
                            )}
                            <SourceOriginTag source={resolveBookingSource(b)} />
                          </div>
                        </div>
                      </div>
                      <StatusPill status={b.status} />
                    </div>

                    {/* Service & Time details box */}
                    <div className={`${theme.boxClass} rounded-xl p-3 border space-y-2 mb-3`}>
                      <div className="flex items-center justify-between text-[11.5px] font-semibold text-slate-700">
                        <span className="text-teal-800 font-bold flex items-center gap-1.5">
                          <Sparkles size={12} className="text-teal-600" />
                          <span>{b.service_type}</span>
                        </span>
                        <span className="text-slate-500 text-[11px] capitalize bg-white px-2 py-0.5 rounded-md border border-teal-200/60 font-medium">
                          {b.frequency}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11.5px] text-slate-600 pt-1 border-t border-teal-100/60">
                        <div className="flex items-center gap-1.5">
                          <CalendarIcon size={12} className="text-slate-400 shrink-0" />
                          <span className="tabular-nums font-medium">{formatDate(b.scheduled_date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          <Clock size={12} className="text-slate-400 shrink-0" />
                          <span className="tabular-nums font-medium">
                            {formatTime(`${b.scheduled_date}T${b.scheduled_time}`)}
                            {b.duration_hours ? ` (${b.duration_hours}h)` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11.5px] text-slate-600 pt-1 border-t border-teal-100/60">
                        <MapPin size={12} className="text-slate-400 shrink-0" />
                        <span className="truncate" title={b.service_address}>
                          {b.service_address || 'Address not specified'}
                        </span>
                      </div>
                    </div>

                    {/* Assigned Crew Chips */}
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Users size={12} className="text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Assigned Cleaners ({assignedNames.length})
                        </span>
                      </div>
                      {assignedNames.length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          {assignedNames.map((name, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200/80 px-2 py-0.5 rounded-lg"
                            >
                              <User size={10} className="text-teal-600" />
                              <span className="truncate max-w-[120px]">{name}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-lg">
                          <AlertCircle size={10} />
                          <span>No cleaners assigned yet</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Pricing & Quick Actions */}
                  <div className="pt-3 border-t border-teal-100/70 flex items-center justify-between gap-2 mt-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Charges</p>
                      <p className="text-[17px] font-black text-slate-900 tabular-nums">
                        AED {b.total_amount.toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      {clientPhone && (
                        <>
                          <a
                            href={`tel:${clientPhone}`}
                            className="p-1.5 rounded-xl text-slate-500 hover:text-teal-700 hover:bg-teal-50 border border-teal-200/80 hover:border-teal-300 transition-colors cursor-pointer"
                            title={`Call ${clientPhone}`}
                          >
                            <Phone size={13} />
                          </a>
                          <a
                            href={`https://wa.me/${clientPhone.replace(/[^\d+]/g, '').replace(/^\+/, '')}?text=Hello%20${encodeURIComponent(b.client_name)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-xl text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border border-emerald-200/80 hover:border-emerald-300 transition-colors cursor-pointer"
                            title="Chat on WhatsApp"
                          >
                            <MessageCircle size={13} />
                          </a>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedBooking(b)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-teal-50/40 hover:bg-teal-100/60 text-teal-900 text-[11.5px] font-bold border border-teal-200/80 hover:border-teal-300 transition-colors cursor-pointer"
                      >
                        <Eye size={12} />
                        <span>Details</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Empty State */}
          {filtered.length === 0 && (
            <div className="bg-white rounded-[22px] border border-teal-200/80 py-16 text-center">
              <CalendarIcon className="mx-auto mb-3 text-teal-300" size={40} strokeWidth={1.25} />
              <p className="text-[14px] font-bold text-slate-700">No bookings match your filters</p>
              <p className="text-[12px] text-slate-500 mt-1">Try resetting the date range or clear search keywords.</p>
            </div>
          )}

          {/* Pagination */}
          {filtered.length > pageSize && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      )}

      {/* ── TABLE VIEW (Customizable Columns & Drag-and-Drop Reordering) ── */}
      {view === 'table' && (
        <div className="space-y-4">
          {/* Table Customization Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap px-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] font-semibold text-slate-600">
                Showing <span className="font-bold text-teal-900">{paginatedBookings.length}</span> of <span className="font-bold text-teal-900">{filtered.length}</span> bookings
              </span>
              <span className="text-[11px] font-medium text-slate-400">·</span>
              <span className="text-[11.5px] font-bold text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                <Clock size={11} className="text-teal-600" />
                <span>Duty Hours: {totalPageDutyHours}h (Page) / {totalFilteredDutyHours}h (Total)</span>
              </span>
            </div>

            {/* Customize Columns Popover */}
            <div className="relative" ref={columnsPopoverRef}>
              <button
                type="button"
                onClick={() => setShowColumnsPopover(v => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all cursor-pointer shadow-2xs ${
                  showColumnsPopover
                    ? 'bg-teal-900 text-white border-teal-900 ring-2 ring-teal-500/30'
                    : 'bg-white text-teal-950 border-teal-200/80 hover:bg-teal-50/60 hover:border-teal-300'
                }`}
                title="Customize table columns visibility and order"
              >
                <SlidersHorizontal size={13} className={showColumnsPopover ? 'text-teal-300' : 'text-teal-700'} />
                <span>Customize Columns</span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                  showColumnsPopover ? 'bg-teal-800 text-teal-200' : 'bg-teal-100 text-teal-900'
                }`}>
                  {visibleColumns.length}/{BOOKING_COLUMNS.length}
                </span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${showColumnsPopover ? 'rotate-180' : ''}`} />
              </button>

              {/* Popover Dropdown */}
              {showColumnsPopover && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-teal-200/90 shadow-[0_12px_36px_rgba(13,148,136,0.18)] z-50 p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-teal-100">
                    <div>
                      <p className="text-[12.5px] font-black text-teal-950">Table Columns</p>
                      <p className="text-[10.5px] text-slate-500">Hide/Show or drag headers to reorder</p>
                    </div>
                    <button
                      type="button"
                      onClick={resetColumnsToDefault}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 hover:bg-teal-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                      title="Reset to default columns"
                    >
                      <RotateCcw size={11} />
                      <span>Reset</span>
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-[12px]">
                    {BOOKING_COLUMNS.map(col => {
                      const isFixed = col.id === 'client' || col.id === 'actions'
                      const isChecked = isFixed ? true : columnsVisibility[col.id] !== false
                      return (
                        <label
                          key={col.id}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-teal-50/50 border-teal-200/70 text-slate-800'
                              : 'bg-slate-50/50 border-slate-200/60 text-slate-400 hover:bg-slate-50'
                          } ${isFixed ? 'opacity-85 cursor-not-allowed' : ''}`}
                        >
                          <span className="flex items-center gap-2 select-none">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isFixed}
                              onChange={() => toggleColumnVisibility(col.id)}
                              className="rounded text-teal-600 focus:ring-teal-500 h-3.5 w-3.5 accent-teal-600 cursor-pointer"
                            />
                            <span className={`font-semibold ${isChecked ? 'text-slate-800' : 'text-slate-500'}`}>
                              {col.label}
                            </span>
                          </span>
                          {isFixed ? (
                            <span className="text-[9.5px] font-bold text-teal-700 bg-teal-100/70 px-1.5 py-0.5 rounded">
                              Required
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {isChecked ? 'Shown' : 'Hidden'}
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>

                  <div className="pt-2 border-t border-teal-100/80 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Drag header labels to reorder</span>
                    <button
                      type="button"
                      onClick={() => setShowColumnsPopover(false)}
                      className="text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-[22px] border border-teal-200/80 shadow-[0_4px_20px_rgba(13,148,136,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-teal-50/70 border-b border-teal-200/80 text-[11px] font-black uppercase tracking-wider text-teal-950">
                    {visibleColumns.map((col) => {
                      const isDraggable = col.id !== 'actions'
                      const isOver = dragOverColId === col.id
                      return (
                        <th
                          key={col.id}
                          draggable={isDraggable}
                          onDragStart={(e) => handleHeaderDragStart(e, col.id)}
                          onDragOver={(e) => handleHeaderDragOver(e, col.id)}
                          onDrop={(e) => handleHeaderDrop(e, col.id)}
                          style={{ minWidth: col.minWidth }}
                          className={`py-3.5 px-4 select-none transition-all ${
                            col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                          } ${
                            isDraggable ? 'cursor-grab active:cursor-grabbing group hover:bg-teal-100/50' : ''
                          } ${
                            isOver ? 'bg-teal-200/80 border-l-2 border-teal-600' : ''
                          }`}
                          title={isDraggable ? `Drag to reorder column "${col.label}"` : undefined}
                        >
                          <div className={`inline-flex items-center gap-1.5 ${
                            col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'
                          }`}>
                            {isDraggable && (
                              <GripVertical
                                size={11}
                                className="text-teal-400 group-hover:text-teal-700 opacity-40 group-hover:opacity-100 transition-opacity shrink-0"
                              />
                            )}
                            <span>{col.label}</span>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-50/80 text-[12.5px]">
                  {paginatedBookings.map((b, idx) => {
                    const assignedNames = getAssignedCrewNames(b.assigned_crew, employees)
                    const matchedClient = clients.find(c => c.id === b.client_id || (c.full_name && b.client_name && c.full_name.toLowerCase().trim() === b.client_name.toLowerCase().trim()))
                    const isMonthly = isMonthlyBooking(b, clients, dailyJobs)
                    const clientPhone = b.client_phone || matchedClient?.phone || matchedClient?.whatsapp || ''
                    const relatedInvoice = (invoices || []).find(inv => inv.booking_id === b.id || (inv.client_id === b.client_id && inv.created_at?.startsWith(b.scheduled_date)))

                    return (
                      <tr
                        key={b.id}
                        onClick={() => setSelectedBooking(b)}
                        className="hover:bg-teal-50/40 transition-colors cursor-pointer group"
                      >
                        {visibleColumns.map((col) => {
                          if (col.id === 'ref') {
                            return (
                              <td key={col.id} className="py-3 px-4 font-mono font-bold text-[11.5px] text-slate-700 whitespace-nowrap">
                                <div>
                                  <span>{b.id.startsWith('dj-') ? `DJ-${b.id.slice(3, 8)}` : `BK-${b.id.slice(0, 6)}`}</span>
                                  <div className="mt-0.5">
                                    <SourceOriginTag source={resolveBookingSource(b)} />
                                  </div>
                                </div>
                              </td>
                            )
                          }

                          if (col.id === 'client') {
                            return (
                              <td key={col.id} className="py-3 px-4 min-w-[185px]">
                                <div className="flex items-center gap-2.5">
                                  <Initials name={b.client_name} idx={idx} size="sm" />
                                  <div className="min-w-0">
                                    <Link
                                      to={matchedClient ? `/clients/${matchedClient.id}` : `/clients?search=${encodeURIComponent(b.client_name)}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="font-bold text-slate-900 hover:text-teal-700 hover:underline transition-colors truncate block"
                                      title={`Open ${b.client_name}'s full profile`}
                                    >
                                      {b.client_name}
                                    </Link>
                                    {clientPhone && (
                                      <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                                        {clientPhone}
                                      </p>
                                    )}
                                  </div>
                                  {isMonthly && (
                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                      Monthly
                                    </span>
                                  )}
                                </div>
                              </td>
                            )
                          }

                          if (col.id === 'service') {
                            return (
                              <td key={col.id} className="py-3 px-4 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 font-bold text-teal-900">
                                  <Sparkles size={11} className="text-teal-600" />
                                  <span>{b.service_type}</span>
                                </span>
                              </td>
                            )
                          }

                          if (col.id === 'frequency') {
                            return (
                              <td key={col.id} className="py-3 px-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold capitalize ${
                                  b.frequency === 'monthly'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : b.frequency === 'weekly'
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}>
                                  {b.frequency || 'once'}
                                </span>
                              </td>
                            )
                          }

                          if (col.id === 'date') {
                            return (
                              <td key={col.id} className="py-3 px-4 whitespace-nowrap tabular-nums">
                                <p className="font-bold text-slate-800">{formatDate(b.scheduled_date)}</p>
                              </td>
                            )
                          }

                          if (col.id === 'time') {
                            return (
                              <td key={col.id} className="py-3 px-4 whitespace-nowrap tabular-nums">
                                <p className="font-bold text-slate-800">{formatTime(`${b.scheduled_date}T${b.scheduled_time}`)}</p>
                                {b.end_time && (
                                  <p className="text-[11px] text-slate-500">to {formatTime(`${b.scheduled_date}T${b.end_time}`)}</p>
                                )}
                              </td>
                            )
                          }

                          if (col.id === 'duty_hours') {
                            return (
                              <td key={col.id} className="py-3 px-4 text-center whitespace-nowrap tabular-nums">
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-teal-900 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/80">
                                  <Clock size={11} className="text-teal-600" />
                                  <span>{b.duration_hours || 0}h Duty</span>
                                </span>
                              </td>
                            )
                          }

                          if (col.id === 'cleaners') {
                            return (
                              <td key={col.id} className="py-3 px-4 min-w-[150px]">
                                {assignedNames.length > 0 ? (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {assignedNames.map((name, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200/70 px-2 py-0.5 rounded-md"
                                      >
                                        <User size={10} className="text-teal-600" />
                                        <span className="truncate max-w-[100px]">{name}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
                                    Unassigned
                                  </span>
                                )}
                              </td>
                            )
                          }

                          if (col.id === 'crew_size') {
                            return (
                              <td key={col.id} className="py-3 px-4 text-center whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 font-mono font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                                  <Users size={11} className="text-slate-500" />
                                  <span>{b.assigned_crew?.length || 1} Staff</span>
                                </span>
                              </td>
                            )
                          }

                          if (col.id === 'address') {
                            return (
                              <td key={col.id} className="py-3 px-4 max-w-[220px]">
                                <p className="truncate text-slate-600 text-[12px]" title={b.service_address}>
                                  {b.service_address || '—'}
                                </p>
                              </td>
                            )
                          }

                          if (col.id === 'amount') {
                            return (
                              <td key={col.id} className="py-3 px-4 text-right whitespace-nowrap font-black font-mono text-[13.5px] text-slate-900">
                                AED {b.total_amount.toLocaleString()}
                              </td>
                            )
                          }

                          if (col.id === 'status') {
                            return (
                              <td key={col.id} className="py-3 px-4 text-center whitespace-nowrap">
                                <StatusPill status={b.status} />
                              </td>
                            )
                          }

                          if (col.id === 'payment_method') {
                            return (
                              <td key={col.id} className="py-3 px-4 whitespace-nowrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                                  {(b as any).payment_method || (b as any).payment_mode || (relatedInvoice?.status === 'paid' ? 'Paid' : 'Pending')}
                                </span>
                              </td>
                            )
                          }

                          if (col.id === 'notes') {
                            return (
                              <td key={col.id} className="py-3 px-4 max-w-[200px]">
                                <p className="truncate text-slate-600 text-[11.5px]" title={b.notes || (b as any).special_instructions || '—'}>
                                  {b.notes || (b as any).special_instructions || '—'}
                                </p>
                              </td>
                            )
                          }

                          if (col.id === 'actions') {
                            return (
                              <td key={col.id} className="py-3 px-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                <div className="inline-flex items-center gap-1">
                                  {clientPhone && (
                                    <>
                                      <a
                                        href={`tel:${clientPhone}`}
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                        title={`Call ${clientPhone}`}
                                      >
                                        <Phone size={13} />
                                      </a>
                                      <a
                                        href={`https://wa.me/${clientPhone.replace(/[^\d+]/g, '').replace(/^\+/, '')}?text=Hello%20${encodeURIComponent(b.client_name)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                                        title="Chat on WhatsApp"
                                      >
                                        <MessageCircle size={13} />
                                      </a>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedBooking(b)}
                                    className="p-1.5 rounded-lg text-slate-600 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                                    title="View Details"
                                  >
                                    <Eye size={13} />
                                  </button>
                                </div>
                              </td>
                            )
                          }

                          return null
                        })}
                      </tr>
                    )
                  })}
                </tbody>

                {/* Duty Hours Summary Row in Table Footer */}
                {paginatedBookings.length > 0 && (
                  <tfoot className="bg-teal-50/60 border-t-2 border-teal-200/90 text-[12px] font-bold text-teal-950">
                    <tr>
                      {visibleColumns.map((col, cIdx) => {
                        if (cIdx === 0) {
                          return (
                            <td key={col.id} className="py-3 px-4 whitespace-nowrap">
                              <span className="font-extrabold uppercase tracking-wider text-[11px] text-teal-900">
                                Page Summary ({paginatedBookings.length})
                              </span>
                            </td>
                          )
                        }
                        if (col.id === 'duty_hours') {
                          return (
                            <td key={col.id} className="py-3 px-4 text-center whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 font-mono font-black text-teal-950 bg-teal-100/90 px-2.5 py-1 rounded-lg border border-teal-300">
                                <Clock size={11} className="text-teal-700" />
                                <span>{totalPageDutyHours} hrs</span>
                              </span>
                            </td>
                          )
                        }
                        if (col.id === 'amount') {
                          const pageTotalAmount = paginatedBookings.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0)
                          return (
                            <td key={col.id} className="py-3 px-4 text-right whitespace-nowrap font-mono font-black text-[13px] text-slate-900">
                              AED {pageTotalAmount.toLocaleString()}
                            </td>
                          )
                        }
                        return <td key={col.id} className="py-3 px-4"></td>
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Empty State */}
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <CalendarIcon className="mx-auto mb-3 text-slate-300" size={40} strokeWidth={1.25} />
                <p className="text-[14px] font-bold text-slate-700">No bookings match your filters</p>
                <p className="text-[12px] text-slate-500 mt-1">Try resetting the date range or clear search keywords.</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {filtered.length > pageSize && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      )}

      {/* ── KANBAN VIEW ── */}
      {view === 'kanban' && <KanbanBoard bookings={filtered} onSelect={setSelectedBooking} />}

      {/* ── CALENDAR VIEW ── */}
      {view === 'calendar' && <WeekCalendar bookings={filtered} onSelect={setSelectedBooking} />}

      {/* ── Modals ── */}
      <NewBookingModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onAdd={addBooking}
      />

      <BookingDetailModal
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onUpdate={(patch) => {
          if (!selectedBooking) return
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
          setSelectedBooking(prev => prev ? { ...prev, ...patch } : null)
        }}
        onDelete={() => {
          if (!selectedBooking) return
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
        employees={employees}
      />
    </div>
  )
}

/* ─── Month Calendar (Revamped, Highly Professional & Visually Appealing) ─── */
function WeekCalendar({ bookings, onSelect }: { bookings: Booking[]; onSelect: (b: Booking) => void }) {
  const today = new Date()
  const [curYear,  setCurYear]  = useState(today.getFullYear())
  const [curMonth, setCurMonth] = useState(today.getMonth())
  const [expandedDayDate, setExpandedDayDate] = useState<string | null>(null)

  const todayStr = todayDubai()
  const monthDate = new Date(curYear, curMonth, 1)
  const monthName = monthDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })

  function prevMonth() {
    if (curMonth === 0) { setCurMonth(11); setCurYear(y => y - 1) }
    else setCurMonth(m => m - 1)
  }
  function nextMonth() {
    if (curMonth === 11) { setCurMonth(0); setCurYear(y => y + 1) }
    else setCurMonth(m => m + 1)
  }
  function goToday() {
    const now = new Date()
    setCurYear(now.getFullYear())
    setCurMonth(now.getMonth())
  }

  // Build grid cells (Mon to Sun)
  const firstDaySun = new Date(curYear, curMonth, 1).getDay() // 0=Sun
  const firstDayMon = (firstDaySun + 6) % 7 // 0=Mon ... 6=Sun
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDayMon).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const bookingsByDate = useMemo(() => {
    return bookings.reduce<Record<string, Booking[]>>((acc, b) => {
      const date = b.scheduled_date || (b.created_at ? b.created_at.split('T')[0] : '')
      if (date) {
        (acc[date] ||= []).push(b)
      }
      return acc
    }, {})
  }, [bookings])

  const monthBookings = useMemo(() => {
    return bookings.filter(b => {
      const d = b.scheduled_date ? new Date(b.scheduled_date) : null
      return d && d.getFullYear() === curYear && d.getMonth() === curMonth
    })
  }, [bookings, curYear, curMonth])

  const monthRevenue = monthBookings
    .filter(b => b.status !== 'cancelled')
    .reduce((s, b) => s + (b.total_amount || 0), 0)

  const monthJobs = monthBookings.length
  const monthConfirmed = monthBookings.filter(b => b.status === 'confirmed').length
  const monthLive = monthBookings.filter(b => b.status === 'in_progress').length
  const monthCompleted = monthBookings.filter(b => b.status === 'completed').length

  const statusStyle: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    confirmed:   { bg: 'bg-emerald-50 hover:bg-emerald-100/80', text: 'text-emerald-800', dot: 'bg-emerald-500', border: 'border-emerald-200' },
    in_progress: { bg: 'bg-cyan-50 hover:bg-cyan-100/80', text: 'text-cyan-800', dot: 'bg-cyan-500 animate-pulse', border: 'border-cyan-200' },
    pending:     { bg: 'bg-amber-50 hover:bg-amber-100/80', text: 'text-amber-800', dot: 'bg-amber-500', border: 'border-amber-200' },
    completed:   { bg: 'bg-slate-50 hover:bg-slate-100/80', text: 'text-slate-700', dot: 'bg-slate-400', border: 'border-slate-200' },
    cancelled:   { bg: 'bg-rose-50 hover:bg-rose-100/80', text: 'text-rose-700', dot: 'bg-rose-400', border: 'border-rose-200' },
  }

  const expandedBookings = expandedDayDate ? (bookingsByDate[expandedDayDate] ?? []) : []

  return (
    <div className="bg-white rounded-[24px] border border-teal-200/80 shadow-[0_4px_24px_rgba(13,148,136,0.06)] overflow-hidden">
      {/* ── Calendar Header ── */}
      <div className="px-6 py-4 border-b border-teal-100 bg-gradient-to-r from-teal-50/50 via-white to-teal-50/30 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-100/80 text-teal-800 flex items-center justify-center font-bold">
              <CalendarDays size={16} />
            </div>
            <div>
              <h3 className="text-[18px] font-black text-teal-950 tracking-tight">{monthName}</h3>
              <p className="text-[12px] text-slate-500 font-medium">Dubai Timezone (Asia/Dubai) • Operations Schedule</p>
            </div>
          </div>
        </div>

        {/* Month Metrics Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] font-bold px-3 py-1 rounded-xl bg-teal-50 text-teal-900 border border-teal-200/80">
            {monthJobs} Total Shifts
          </span>
          <span className="text-[11.5px] font-bold px-3 py-1 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200/80">
            AED {monthRevenue.toLocaleString()} Projected
          </span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700">
            {monthConfirmed} Scheduled • {monthLive} Live • {monthCompleted} Done
          </span>
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
            title="Previous Month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="text-[12px] px-3 py-1 rounded-xl font-bold text-teal-950 bg-white shadow-2xs hover:bg-teal-50 transition-colors cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
            title="Next Month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Day-of-week header ── */}
      <div className="grid grid-cols-7 border-b border-teal-100 bg-teal-50/40 divide-x divide-teal-100/60">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, idx) => (
          <div
            key={d}
            className={`py-2.5 text-center text-[11px] font-black tracking-wider uppercase ${
              idx >= 5 ? 'text-amber-800 bg-amber-50/20' : 'text-teal-900'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar Grid ── */}
      <div className="grid grid-cols-7 divide-x divide-y divide-teal-100/60 bg-slate-50/20">
        {cells.map((day, i) => {
          if (!day) {
            return (
              <div
                key={`empty-${i}`}
                className="min-h-[120px] bg-slate-50/40 p-2 opacity-50"
              />
            )
          }

          const dateStr = `${curYear}-${String(curMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const dayBookings = bookingsByDate[dateStr] ?? []
          const isToday = dateStr === todayStr
          const isWeekend = (i % 7 === 5) || (i % 7 === 6)

          return (
            <div
              key={`day-${day}`}
              className={`min-h-[120px] p-2 transition-all flex flex-col justify-between group ${
                isToday
                  ? 'bg-emerald-50/60 ring-2 ring-emerald-500/30'
                  : isWeekend
                  ? 'bg-amber-50/15 hover:bg-teal-50/30'
                  : 'bg-white hover:bg-teal-50/25'
              }`}
            >
              <div>
                {/* Cell Header: Day Number & Count */}
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black transition-all ${
                      isToday
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-800 group-hover:text-teal-800'
                    }`}
                  >
                    {day}
                  </span>
                  {dayBookings.length > 0 && (
                    <span className="text-[10px] font-black text-teal-800 bg-teal-50 border border-teal-200/80 px-1.5 py-0.2 rounded-md">
                      {dayBookings.length} {dayBookings.length === 1 ? 'shift' : 'shifts'}
                    </span>
                  )}
                </div>

                {/* Day Bookings List (First 3) */}
                <div className="space-y-1">
                  {dayBookings.slice(0, 3).map(b => {
                    const st = statusStyle[b.status] ?? statusStyle.confirmed
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onSelect(b)}
                        className={`w-full text-left px-2 py-1 rounded-lg border text-[11px] transition-all flex items-center justify-between gap-1 shadow-2xs cursor-pointer ${st.bg} ${st.border}`}
                        title={`${b.client_name} - ${b.service_type} at ${b.scheduled_time} (${b.duration_hours}h)`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                          <span className="font-bold text-slate-800 truncate">{b.client_name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-semibold shrink-0">
                          {b.scheduled_time?.slice(0, 5)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* +X More interactive button */}
              {dayBookings.length > 3 && (
                <button
                  type="button"
                  onClick={() => setExpandedDayDate(dateStr)}
                  className="mt-1 text-[10px] font-bold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 py-0.5 px-1.5 rounded text-center transition-colors cursor-pointer"
                >
                  +{dayBookings.length - 3} more bookings
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Status Legend & Summary Footer ── */}
      <div className="px-6 py-3 border-t border-teal-100 bg-teal-50/30 flex items-center justify-between flex-wrap gap-4 text-[11.5px] text-slate-600">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-bold text-slate-700">Status Legend:</span>
          {[
            { label: 'Scheduled', dot: 'bg-emerald-500', count: monthConfirmed },
            { label: 'Live Now',  dot: 'bg-cyan-500 animate-pulse', count: monthLive },
            { label: 'Pending',   dot: 'bg-amber-400', count: monthBookings.filter(b => b.status === 'pending').length },
            { label: 'Completed', dot: 'bg-slate-400', count: monthCompleted },
            { label: 'Cancelled', dot: 'bg-red-400',   count: monthBookings.filter(b => b.status === 'cancelled').length },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${l.dot}`} />
              <span className="font-medium text-slate-700">{l.label}</span>
              <span className="text-[10px] font-bold text-slate-500 bg-white px-1.5 py-0.2 rounded border border-teal-100">
                {l.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modal: Day Details (When clicking +X more) ── */}
      {expandedDayDate && (
        <Modal
          open={!!expandedDayDate}
          onClose={() => setExpandedDayDate(null)}
          title={`All Bookings on ${expandedDayDate}`}
          size="md"
        >
          <div className="p-4 space-y-3">
            <p className="text-[12px] text-slate-500">
              Showing {expandedBookings.length} scheduled shifts for this date. Click any booking to inspect and edit.
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {expandedBookings.map((b, idx) => {
                const st = statusStyle[b.status] ?? statusStyle.confirmed
                return (
                  <div
                    key={b.id}
                    onClick={() => {
                      setExpandedDayDate(null)
                      onSelect(b)
                    }}
                    className="p-3 rounded-2xl bg-white border border-teal-100/90 hover:border-teal-300 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Initials name={b.client_name} idx={idx} size="sm" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-slate-900 group-hover:text-teal-700 truncate">
                          {b.client_name}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {b.service_type} • {b.scheduled_time} ({b.duration_hours}h)
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${st.bg} ${st.text} ${st.border}`}>
                        {b.status.replace('_', ' ')}
                      </span>
                      <p className="text-[12px] font-black text-teal-950 mt-1">AED {b.total_amount?.toLocaleString()}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ─── Kanban board (Showing First 3 Entries + "View All" Button) ─── */
function KanbanBoard({ bookings, onSelect }: { bookings: Booking[]; onSelect: (b: Booking) => void }) {
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})

  const toggleExpand = (colKey: string) => {
    setExpandedCols(prev => ({ ...prev, [colKey]: !prev[colKey] }))
  }

  const cols: { key: BookingStatus; label: string; bg: string; border: string; dot: string; badgeColor: string; cardClass: string; boxClass: string }[] = [
    { key: 'pending',     label: 'Pending',   bg: 'bg-orange-50/70',  border: 'border-orange-200',  dot: 'bg-orange-500', badgeColor: 'bg-orange-100 text-orange-800', cardClass: 'bg-orange-50/85 border-orange-200/90 hover:border-orange-400', boxClass: 'bg-white/85 border-orange-200/70' },
    { key: 'confirmed',   label: 'Scheduled', bg: 'bg-emerald-50/70', border: 'border-emerald-200', dot: 'bg-emerald-500', badgeColor: 'bg-emerald-100 text-emerald-800', cardClass: 'bg-emerald-50/85 border-emerald-200/90 hover:border-emerald-400', boxClass: 'bg-white/85 border-emerald-200/70' },
    { key: 'in_progress', label: 'Live Now',  bg: 'bg-sky-50/70',     border: 'border-sky-200',     dot: 'bg-sky-500 animate-pulse', badgeColor: 'bg-sky-100 text-sky-800', cardClass: 'bg-sky-50/85 border-sky-200/90 hover:border-sky-400', boxClass: 'bg-white/85 border-sky-200/70' },
    { key: 'completed',   label: 'Completed', bg: 'bg-slate-100/70',  border: 'border-slate-200',   dot: 'bg-slate-400', badgeColor: 'bg-slate-200 text-slate-700', cardClass: 'bg-slate-100/80 border-slate-200/90 hover:border-slate-300', boxClass: 'bg-white/85 border-slate-200/70' },
    { key: 'cancelled',   label: 'Cancelled', bg: 'bg-rose-50/70',    border: 'border-rose-200',    dot: 'bg-rose-400', badgeColor: 'bg-rose-100 text-rose-800', cardClass: 'bg-rose-50/85 border-rose-200/90 hover:border-rose-400', boxClass: 'bg-white/85 border-rose-200/70' },
  ]

  const grouped = cols.reduce((acc, c) => {
    acc[c.key] = bookings.filter(b => normalizeBookingStatus(b.status) === c.key)
    return acc
  }, {} as Record<string, Booking[]>)

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {cols.map(col => {
        const colBookings = grouped[col.key] ?? []
        const isExpanded = Boolean(expandedCols[col.key])
        const displayed = isExpanded ? colBookings : colBookings.slice(0, 3)
        const hasMore = colBookings.length > 3

        return (
          <div key={col.key} className="min-w-[270px] flex-1 flex flex-col">
            {/* Column Header */}
            <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border ${col.bg} ${col.border} mb-2.5 shadow-2xs`}>
              <span className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className="text-[12.5px] font-bold text-slate-800">{col.label}</span>
              <span className={`ml-auto text-[11px] font-black px-2 py-0.5 rounded-full ${col.badgeColor}`}>
                {colBookings.length}
              </span>
            </div>

            {/* Cards List */}
            <div className="space-y-2.5 flex-1">
              {displayed.map((b, idx) => (
                <div
                  key={b.id}
                  onClick={() => onSelect(b)}
                  className={`${col.cardClass} rounded-2xl border p-4 cursor-pointer hover:shadow-lg transition-all flex flex-col justify-between group`}
                >
                  <div className="flex items-start gap-2.5 mb-2.5">
                    <Initials name={b.client_name} idx={idx} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-900 group-hover:text-teal-700 transition-colors truncate">
                        {b.client_name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{b.service_type}</p>
                    </div>
                  </div>

                  <div className={`space-y-1.5 text-[11px] text-slate-500 ${col.boxClass} p-2.5 rounded-xl border`}>
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon size={12} className="text-teal-600 shrink-0" />
                      <span className="font-semibold text-slate-700">{b.scheduled_date} • {b.scheduled_time}</span>
                    </div>
                    {b.service_address && (
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin size={12} className="text-slate-400 shrink-0" />
                        <span className="truncate">{b.service_address}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-[11.5px]">
                    <span className="text-[10.5px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {b.duration_hours || 3}h duty
                    </span>
                    <span className="font-black text-teal-950">AED {b.total_amount?.toLocaleString() || 0}</span>
                  </div>
                </div>
              ))}

              {/* View All Button when column has > 3 entries */}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => toggleExpand(col.key)}
                  className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-teal-50 border border-teal-200/80 text-[11.5px] font-bold text-teal-900 shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>{isExpanded ? 'Show Less' : `View All (${colBookings.length - 3} more)`}</span>
                  <ChevronDown size={13} className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
              )}

              {colBookings.length === 0 && (
                <div className="py-8 text-center bg-teal-50/20 rounded-2xl border border-dashed border-teal-200/80">
                  <p className="text-[11px] text-slate-400">No {col.label.toLowerCase()} bookings</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
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

/* ─── Redesigned Professional Booking Detail Modal ─── */
function BookingDetailModal({
  booking,
  open,
  onClose,
  onUpdate,
  onDelete,
  invoices,
  onUpdateInvoice,
  employees,
}: {
  booking: Booking | null
  open: boolean
  onClose: () => void
  onUpdate: (patch: Partial<Booking>) => void
  onDelete: () => void
  invoices: ReturnType<typeof useData>['invoices']
  onUpdateInvoice: (id: string, patch: any) => void
  employees: Employee[]
}) {
  if (!booking) return null

  const { clients } = useData()
  const matchedClient = useMemo(() => {
    if (!booking) return null
    return (clients || []).find(c =>
      (booking.client_id && c.id === booking.client_id) ||
      (c.full_name && booking.client_name && c.full_name.toLowerCase().trim() === booking.client_name.toLowerCase().trim())
    ) || null
  }, [booking, clients])

  const [isEditing, setIsEditing] = useState(false)
  const [status, setStatus] = useState<BookingStatus>(booking.status)
  const [crew, setCrew] = useState<string[]>(booking.assigned_crew ?? [])

  // Editable fields
  const [clientName, setClientName] = useState(booking.client_name)
  const [clientPhone, setClientPhone] = useState(booking.client_phone || '')
  const [serviceAddress, setServiceAddress] = useState(booking.service_address || '')
  const [serviceType, setServiceType] = useState(booking.service_type)
  const [frequency, setFrequency] = useState<BookingFrequency>(booking.frequency)
  const [scheduledDate, setScheduledDate] = useState(booking.scheduled_date)
  const [startTime, setStartTime] = useState(booking.scheduled_time || '09:00')
  const [duration, setDuration] = useState<number>(booking.duration_hours || 3)
  const [endTime, setEndTime] = useState(() => booking.end_time || addHoursToTime(booking.scheduled_time || '09:00', booking.duration_hours || 3))
  const [totalAmount, setTotalAmount] = useState<number>(booking.total_amount || 0)
  const [notes, setNotes] = useState(booking.notes || '')
  const [saveNotice, setSaveNotice] = useState<string | null>(null)

  // Sync state when booking changes
  useEffect(() => {
    setStatus(booking.status)
    setCrew(booking.assigned_crew ?? [])
    setClientName(booking.client_name)
    setClientPhone(booking.client_phone || '')
    setServiceAddress(booking.service_address || '')
    setServiceType(booking.service_type)
    setFrequency(booking.frequency)
    setScheduledDate(booking.scheduled_date)
    setStartTime(booking.scheduled_time || '09:00')
    setDuration(booking.duration_hours || 3)
    setEndTime(booking.end_time || addHoursToTime(booking.scheduled_time || '09:00', booking.duration_hours || 3))
    setTotalAmount(booking.total_amount || 0)
    setNotes(booking.notes || '')
    setIsEditing(false)
  }, [booking])

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

  const handleApplyStatus = (s: BookingStatus) => {
    setStatus(s)
    onUpdate({ status: s })
    setSaveNotice(`Status updated to ${s.toUpperCase()}`)
    setTimeout(() => setSaveNotice(null), 3000)
  }

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const patch: Partial<Booking> = {
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      service_address: serviceAddress.trim(),
      service_type: serviceType,
      frequency: frequency,
      scheduled_date: scheduledDate,
      scheduled_time: startTime,
      end_time: endTime,
      duration_hours: duration,
      total_amount: Number(totalAmount) || 0,
      notes: notes.trim(),
      assigned_crew: crew,
      status: status,
    }
    onUpdate(patch)
    setIsEditing(false)
    setSaveNotice('Booking changes saved successfully!')
    setTimeout(() => setSaveNotice(null), 3000)
  }

  const relatedInvoice = invoices.find(inv =>
    inv.client_id === booking.client_id ||
    inv.client_name.toLowerCase().trim() === booking.client_name.toLowerCase().trim()
  )
  const invoicePaid = relatedInvoice?.status === 'paid'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      className="max-w-3xl"
      title={
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-extrabold text-[16px] text-slate-900">
            {isEditing ? 'Edit Booking' : 'Booking Details'}
          </span>
          <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">
            #{booking.id.slice(0, 8)}
          </span>
          {saveNotice && (
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 animate-in fade-in">
              ✓ {saveNotice}
            </span>
          )}
        </div>
      }
      headerActions={
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-[12px] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="booking-detail-form"
                className="px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-[12px] shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Check size={13} strokeWidth={2.5} />
                <span>Save</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[12px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Pencil size={12} className="text-slate-500" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => handleSave()}
                className="px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-[12px] shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Check size={13} strokeWidth={2.5} />
                <span>Save</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
                onDelete()
              }
            }}
            className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[12px] flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Delete this booking"
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
        </div>
      }
    >
      {isEditing ? (
        <form id="booking-detail-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Client Name *</label>
              <input
                type="text"
                required
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-medium text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Phone / WhatsApp</label>
              <input
                type="text"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-medium text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Service Address</label>
            <input
              type="text"
              value={serviceAddress}
              onChange={e => setServiceAddress(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-medium text-slate-900"
              placeholder="e.g. Villa 42, Arabian Ranches or Marina Gate Tower 1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Service Type</label>
              <select
                value={serviceType}
                onChange={e => setServiceType(e.target.value)}
                className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-medium text-slate-900"
              >
                {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Frequency</label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value as BookingFrequency)}
                className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-medium text-slate-900"
              >
                <option value="once">One-time Service</option>
                <option value="weekly">Weekly Recurring</option>
                <option value="biweekly">Bi-weekly Recurring</option>
                <option value="monthly">Monthly Contract</option>
              </select>
            </div>
          </div>

          {/* Schedule & Timing Grid */}
          <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-slate-900 mb-1">Start Time *</label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={e => handleStartTimeChange(e.target.value)}
                  className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-teal-800 mb-1">End Time *</label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={e => handleEndTimeChange(e.target.value)}
                  className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-bold text-teal-700"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-emerald-800 mb-1">Duration (Hours)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  value={duration}
                  onChange={e => handleDurationChange(parseFloat(e.target.value) || 0)}
                  className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-bold text-emerald-700"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11.5px] px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 font-medium">
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-emerald-600" />
                <span>Shift: <strong>{startTime || '—'}</strong> to <strong>{endTime || '—'}</strong></span>
              </span>
              <span className="font-extrabold text-emerald-700 bg-white px-2 py-0.5 rounded-md shadow-2xs">
                {duration} Hour{duration !== 1 ? 's' : ''} Duty
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Amount (AED)</label>
              <input
                type="number"
                min="0"
                value={totalAmount}
                onChange={e => setTotalAmount(parseFloat(e.target.value) || 0)}
                className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as BookingStatus)}
                className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-medium text-slate-900"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Scheduled (Confirmed)</option>
                <option value="in_progress">Live Now (In Progress)</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Notes / Instructions</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-[12.5px] px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-medium text-slate-900 resize-none"
              placeholder="Special instructions, gate pass code, pet info..."
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-bold text-slate-700 mb-1.5">Assigned Crew</label>
            <CrewSelector selected={crew} onChange={setCrew} />
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {/* 1. Client & Status Profile Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Initials name={booking.client_name} idx={0} size="lg" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={matchedClient ? `/clients/${matchedClient.id}` : `/clients?search=${encodeURIComponent(booking.client_name)}`}
                    onClick={onClose}
                    className="group inline-flex items-center gap-1.5 text-lg font-black text-white hover:text-teal-300 transition-colors cursor-pointer"
                    title={`Open ${booking.client_name}'s full profile`}
                  >
                    <span className="group-hover:underline">{booking.client_name}</span>
                    <ExternalLink size={14} className="text-teal-400 group-hover:text-teal-200 transition-colors shrink-0" />
                  </Link>
                  <SourceOriginTag source={resolveBookingSource(booking)} />
                  {booking.frequency === 'monthly' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-400 text-emerald-950">
                      Monthly Contract
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[12px] text-slate-300">
                  {booking.client_phone ? (
                    <a href={`tel:${booking.client_phone}`} className="flex items-center gap-1 hover:text-white transition-colors">
                      <Phone size={12} className="text-emerald-400" />
                      <span>{booking.client_phone}</span>
                    </a>
                  ) : (
                    <span className="text-slate-400">No phone recorded</span>
                  )}
                  <span>·</span>
                  <span className="capitalize">{booking.frequency} Cleaning</span>
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <StatusPill status={status} />
            </div>
          </div>

          {/* 2. Structured 4-Card Service & Scheduling Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Card 1: Schedule & Timing */}
            <div className="bg-emerald-50/60 rounded-2xl p-3.5 border border-emerald-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarIcon size={12} />
                  <span>Schedule & Duty</span>
                </span>
                <span className="text-[10.5px] font-extrabold bg-white text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200 shadow-2xs">
                  {duration}h Duration
                </span>
              </div>
              <p className="text-[14px] font-black text-slate-900 mt-1">
                {formatDate(scheduledDate)}
              </p>
              <p className="text-[12px] font-mono font-semibold text-slate-600 mt-0.5 flex items-center gap-1.5">
                <Clock size={12} className="text-slate-400" />
                <span>{startTime || '09:00'} – {endTime || '12:00'}</span>
              </p>
            </div>

            {/* Card 2: Cleaning Service */}
            <div className="bg-teal-50/60 rounded-2xl p-3.5 border border-teal-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10.5px] font-bold text-teal-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={12} />
                  <span>Service Type</span>
                </span>
                <span className="text-[10.5px] font-extrabold bg-white text-teal-800 px-2 py-0.5 rounded-md border border-teal-200 shadow-2xs capitalize">
                  {frequency}
                </span>
              </div>
              <p className="text-[14px] font-black text-slate-900 mt-1">
                {serviceType}
              </p>
              <p className="text-[11.5px] text-slate-500 mt-0.5">
                Standard Professional Cleaning
              </p>
            </div>

            {/* Card 3: Location / Address */}
            <div className="bg-sky-50/60 rounded-2xl p-3.5 border border-sky-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10.5px] font-bold text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin size={12} />
                  <span>Service Address</span>
                </span>
                <span className="text-[10.5px] font-extrabold bg-white text-sky-800 px-2 py-0.5 rounded-md border border-sky-200 shadow-2xs">
                  Dubai
                </span>
              </div>
              <p className="text-[13px] font-bold text-slate-900 mt-1 leading-snug">
                {serviceAddress || 'Address not specified'}
              </p>
            </div>

            {/* Card 4: Charges & Payment */}
            <div className="bg-amber-50/60 rounded-2xl p-3.5 border border-amber-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10.5px] font-bold text-amber-800 uppercase tracking-wider">
                  Total Charges
                </span>
                <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-md border shadow-2xs ${
                  invoicePaid
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-white text-amber-800 border-amber-200'
                }`}>
                  {invoicePaid ? 'Invoice Paid' : 'Payment Pending'}
                </span>
              </div>
              <p className="text-[18px] font-black text-slate-900 mt-0.5">
                AED {totalAmount.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {relatedInvoice ? `Invoice: ${relatedInvoice.invoice_number || 'Generated'}` : 'No invoice generated yet'}
              </p>
            </div>
          </div>

          {/* 3. Assigned Crew */}
          <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <Users size={13} className="text-slate-500" />
                <span>Assigned Cleaners ({crew.length})</span>
              </p>
              <span className="text-[11px] text-slate-400 font-medium">Re-assign below</span>
            </div>
            <CrewSelector
              selected={crew}
              onChange={ids => {
                setCrew(ids)
                onUpdate({ assigned_crew: ids })
              }}
            />
          </div>

          {/* 4. Access & Special Notes (if any) */}
          {notes && (
            <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 text-xs">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <AlertCircle size={12} className="text-amber-600" />
                <span>Access & Special Notes</span>
              </p>
              <p className="text-amber-900 font-medium leading-relaxed">{notes}</p>
            </div>
          )}

          {/* 5. Quick WhatsApp & Phone Communication Bar */}
          {clientPhone && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <a
                href={`tel:${clientPhone}`}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11.5px] flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <Phone size={13} className="text-slate-500" />
                <span>Call Client</span>
              </a>
              {(status === 'confirmed' || status === 'in_progress') && (
                <a
                  href={waLink(clientPhone, buildConfirmationMsg(booking))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11.5px] flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <MessageCircle size={13} className="text-emerald-600" />
                  <span>Send WhatsApp Confirmation</span>
                </a>
              )}
              {status === 'confirmed' && (
                <a
                  href={waLink(clientPhone, buildReminderMsg(booking))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold text-[11.5px] flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <MessageCircle size={13} className="text-sky-600" />
                  <span>Send WhatsApp Reminder</span>
                </a>
              )}
            </div>
          )}

          {/* 6. Workflow Status Action Buttons (NO Edit and NO Delete buttons here!) */}
          <div className="pt-2 border-t border-slate-200 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Status:
            </span>
            {status === 'pending' && (
              <button
                type="button"
                onClick={() => handleApplyStatus('confirmed')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[12px] shadow-xs cursor-pointer flex-1 flex items-center justify-center gap-1.5 transition-all"
              >
                <Check size={14} strokeWidth={2.5} />
                <span>Confirm Booking</span>
              </button>
            )}
            {status === 'confirmed' && (
              <button
                type="button"
                onClick={() => handleApplyStatus('in_progress')}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[12px] shadow-xs cursor-pointer flex-1 flex items-center justify-center gap-1.5 transition-all"
              >
                <Clock size={14} />
                <span>Start Job</span>
              </button>
            )}
            {status === 'in_progress' && (
              <button
                type="button"
                onClick={() => handleApplyStatus('completed')}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[12px] shadow-xs cursor-pointer flex-1 flex items-center justify-center gap-1.5 transition-all"
              >
                <CheckCircle size={14} />
                <span>Mark Complete</span>
              </button>
            )}
            {status !== 'cancelled' && status !== 'completed' && (
              <button
                type="button"
                onClick={() => handleApplyStatus('cancelled')}
                className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-700 font-bold text-[12px] cursor-pointer transition-colors"
              >
                Cancel Shift
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
