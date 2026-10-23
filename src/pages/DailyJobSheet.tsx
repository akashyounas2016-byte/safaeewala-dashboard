import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  ChevronLeft, ChevronRight, Calendar, Printer, Download, Plus,
  Trash2, AlertCircle, TrendingUp, Users, Briefcase, CloudUpload,
  Upload, CheckCircle, FileSpreadsheet, SlidersHorizontal,
  Clock, DollarSign, Wallet, Search, Filter, X, Pencil, MoreVertical, ChevronDown,
  Receipt, CreditCard, Eye, Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import type {
  DailyJob, DailyExpense, PaymentMode, MaterialType,
  DailyPendingItem, DailyPendingReceivedItem, DailyAdvanceItem,
} from '@/types'
import { authorizeGoogleDrive, getAccessToken, uploadToDrive, gdriveConfigured } from '@/lib/googleDrive'



const MATERIALS: MaterialType[] = ['No', 'Yes', 'Sofa', 'Ladder', 'Sofa Seat']
const PAYMENT_MODES: PaymentMode[] = ['Cash', 'Online', 'Pending', 'Monthly', 'Above']
const EXPENSE_CATEGORIES = ['Fuel', 'Parking', 'Toll', 'Vehicle maintenance', 'Supplies', 'Other']
const COMMON_SERVICES = ['House', 'Deep', 'Sofa', 'Window', 'Office', 'Villa', 'Apartment', 'Carpet', 'Move-in', 'Move-out', 'Other']

function cleanNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const str = String(val).trim()
  if (!str || str === '—' || str === '-' || str.toLowerCase() === 'nil' || str.toLowerCase() === 'pending' || str.toLowerCase() === 'monthly' || str.toLowerCase() === 'n/a') return 0
  const cleaned = str.replace(/[^0-9.-]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function formatTimeOnly(val: any): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'number') {
    if (isNaN(val)) return '—'
    // Excel time is stored as fraction of 24h day (e.g. 0.4166666666666667 = 10:00, 0.625 = 15:00)
    const frac = val >= 1 ? val - Math.floor(val) : val
    if (frac >= 0) {
      const totalMinutes = Math.round(frac * 24 * 60)
      const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')
      const mm = String(totalMinutes % 60).padStart(2, '0')
      return `${hh}:${mm}`
    }
  }
  if (val instanceof Date) {
    const hh = String(val.getHours()).padStart(2, '0')
    const mm = String(val.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const str = String(val).trim()
  if (!str || str === '—') return '—'

  // Match 12-hour AM/PM format (e.g. "10:00 AM", "03:00 PM")
  const ampmMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)\b/i)
  if (ampmMatch) {
    let hh = parseInt(ampmMatch[1], 10)
    const mm = ampmMatch[2]
    const mer = ampmMatch[3].toUpperCase()
    if (mer === 'PM' && hh < 12) hh += 12
    if (mer === 'AM' && hh === 12) hh = 0
    return `${String(hh).padStart(2, '0')}:${mm}`
  }

  // Match HH:MM or HH:MM:SS in string (e.g. "09:00", "09:00:00", "Sat Dec 30 1899 09:00:00 GMT...")
  const timeMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/)
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, '0')
    const mm = timeMatch[2]
    return `${hh}:${mm}`
  }

  // Fallback try Date parse
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const hh = String(parsed.getHours()).padStart(2, '0')
    const mm = String(parsed.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  return str
}

function calcHours(start: string, end: string): number {
  const s = formatTimeOnly(start)
  const e = formatTimeOnly(end)
  if (s === '—' || e === '—' || !s.includes(':') || !e.includes(':')) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60
  return diff > 0 ? Math.round(diff / 60 * 10) / 10 : 0
}

// Basic hours: 08:00–20:00. Anything after 20:00 is OT.
function calcOTHours(start: string, end: string): number {
  const s = formatTimeOnly(start)
  const e = formatTimeOnly(end)
  if (s === '—' || e === '—' || !s.includes(':') || !e.includes(':')) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0
  const endMins   = eh * 60 + em
  const OT_CUTOFF = 20 * 60 // 8 PM
  if (endMins <= OT_CUTOFF) return 0
  const otStartMins = Math.max(sh * 60 + sm, OT_CUTOFF)
  const otMins = endMins - otStartMins
  return otMins > 0 ? Math.round(otMins / 60 * 10) / 10 : 0
}

function fmtDate(d: string) {
  if (!d) return '—'
  const parsed = new Date(d.includes('T') ? d : d + 'T00:00:00')
  if (isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

interface StaffPalette {
  name: string
  rowBg: string
  borderLeft: string
  nameColor: string
  avatarBg: string
  badgeBg: string
}

const STAFF_COLOR_PALETTES: StaffPalette[] = [
  {
    name: 'Emerald',
    rowBg: 'bg-emerald-50/70 hover:bg-emerald-100/70',
    borderLeft: 'border-l-[5px] border-l-emerald-500',
    nameColor: 'text-emerald-950 font-bold',
    avatarBg: 'bg-emerald-600 text-white',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    name: 'Sky Blue',
    rowBg: 'bg-sky-50/70 hover:bg-sky-100/70',
    borderLeft: 'border-l-[5px] border-l-sky-500',
    nameColor: 'text-sky-950 font-bold',
    avatarBg: 'bg-sky-600 text-white',
    badgeBg: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  {
    name: 'Violet',
    rowBg: 'bg-purple-50/70 hover:bg-purple-100/70',
    borderLeft: 'border-l-[5px] border-l-purple-500',
    nameColor: 'text-purple-950 font-bold',
    avatarBg: 'bg-purple-600 text-white',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    name: 'Amber',
    rowBg: 'bg-amber-50/70 hover:bg-amber-100/70',
    borderLeft: 'border-l-[5px] border-l-amber-500',
    nameColor: 'text-amber-950 font-bold',
    avatarBg: 'bg-amber-600 text-white',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    name: 'Teal',
    rowBg: 'bg-teal-50/70 hover:bg-teal-100/70',
    borderLeft: 'border-l-[5px] border-l-teal-500',
    nameColor: 'text-teal-950 font-bold',
    avatarBg: 'bg-teal-600 text-white',
    badgeBg: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  {
    name: 'Indigo',
    rowBg: 'bg-indigo-50/70 hover:bg-indigo-100/70',
    borderLeft: 'border-l-[5px] border-l-indigo-500',
    nameColor: 'text-indigo-950 font-bold',
    avatarBg: 'bg-indigo-600 text-white',
    badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  {
    name: 'Rose',
    rowBg: 'bg-rose-50/70 hover:bg-rose-100/70',
    borderLeft: 'border-l-[5px] border-l-rose-500',
    nameColor: 'text-rose-950 font-bold',
    avatarBg: 'bg-rose-600 text-white',
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  {
    name: 'Orange',
    rowBg: 'bg-orange-50/70 hover:bg-orange-100/70',
    borderLeft: 'border-l-[5px] border-l-orange-500',
    nameColor: 'text-orange-950 font-bold',
    avatarBg: 'bg-orange-600 text-white',
    badgeBg: 'bg-orange-100 text-orange-800 border-orange-200',
  },
]

function PaymentBadge({ mode }: { mode: PaymentMode }) {
  const cfg: Record<PaymentMode, string> = {
    Cash:    'bg-emerald-50 text-emerald-800 border-emerald-300',
    Online:  'bg-blue-50 text-blue-800 border-blue-300',
    Pending: 'bg-red-50 text-red-700 border-red-300',
    Monthly: 'bg-purple-50 text-purple-800 border-purple-300',
    Above:   'bg-amber-50 text-amber-800 border-amber-300',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shadow-xs ${cfg[mode]}`}>
      {mode}
    </span>
  )
}

/* ── Interactive Address Hover Cell with Instant Popover (Light Theme) ── */
function AddressCell({ address, area, isDark }: { address: string; area?: string; isDark?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [showPopover, setShowPopover] = useState(false)
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)

  if (!address || address === '—' || address === '-') {
    return <span className={isDark ? "text-emerald-700 font-medium" : "text-slate-400"}>—</span>
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setCoords({ x: rect.left, y: rect.top })
    setShowPopover(true)
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="relative inline-block max-w-[170px] group select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowPopover(false)}
    >
      <div className={`truncate font-medium cursor-pointer flex items-center gap-1 ${
        isDark
          ? 'text-emerald-950 group-hover:text-emerald-700 group-hover:underline'
          : 'text-slate-700 group-hover:text-emerald-700 group-hover:underline'
      }`}>
        <span className="truncate">{address}</span>
      </div>

      {showPopover && coords && (
        <div
          className="fixed z-50 w-80 p-3.5 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 text-[12px] animate-in fade-in zoom-in-95 pointer-events-auto ring-1 ring-slate-900/10"
          style={{
            left: Math.max(10, Math.min(coords.x, window.innerWidth - 340)),
            top: coords.y - 8,
            transform: 'translateY(-100%)',
          }}
          onMouseEnter={() => setShowPopover(true)}
          onMouseLeave={() => setShowPopover(false)}
        >
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
            <span className="text-[10.5px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
              📍 Full Address
            </span>
            <button
              onClick={handleCopy}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10.5px] font-bold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer border border-slate-200"
              title="Copy to clipboard"
            >
              {copied ? <span className="text-emerald-600 font-bold">✓ Copied</span> : <span>📋 Copy</span>}
            </button>
          </div>
          <p className="font-semibold text-[13px] leading-relaxed text-slate-800 break-words select-text">
            {address}
          </p>
          {area && (
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Location / Zone:</span>
              <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">{area}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Columns Configuration for Custom Visibility ── */
interface ColumnConfig {
  id: string
  label: string
}

const ALL_COLUMNS: ColumnConfig[] = [
  { id: 'staff',        label: 'Staff' },
  { id: 'start_time',   label: 'Start Time' },
  { id: 'end_time',     label: 'End Time' },
  { id: 'address',      label: 'Address' },
  { id: 'area',         label: 'Location / Zone' },
  { id: 'charges',      label: 'Charges' },
  { id: 'received',     label: 'Received' },
  { id: 'pending',      label: 'Pending' },
  { id: 'duty_hours',   label: 'Duty Hrs' },
  { id: 'ot_hours',     label: 'OT Hrs' },
  { id: 'material',     label: 'Material' },
  { id: 'payment_mode', label: 'Payment Mode' },
  { id: 'remarks',      label: 'Remarks' },
  { id: 'service',      label: 'Service' },
  { id: 'actions',      label: 'Actions' },
]

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  staff:        true,
  start_time:   true,
  end_time:     true,
  address:      true,
  area:         true,
  charges:      true,
  received:     true,
  pending:      true,
  duty_hours:   true,
  ot_hours:     true,
  material:     true,
  payment_mode: true,
  remarks:      true,
  service:      true,
  actions:      true,
}

/* ─── Add Job Form ─── */
function AddJobForm({
  employees, onSave, onClose, initial,
}: {
  employees: { full_name: string }[]
  onSave: (j: Omit<DailyJob, 'id' | 'created_at'>) => void
  onClose: () => void
  initial?: Partial<DailyJob>
}) {
  const [startTime, setStartTime] = useState(initial?.start_time ?? '')
  const [endTime, setEndTime]     = useState(initial?.end_time ?? '')
  const dutyHours = calcHours(startTime, endTime)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    onSave({
      date:         fd.get('date') as string,
      staff_name:   fd.get('staff_name') as string,
      start_time:   startTime,
      end_time:     endTime,
      duty_hours:   dutyHours,
      ot_hours:     cleanNum(fd.get('ot_hours')),
      address:      fd.get('address') as string,
      area:         fd.get('area') as string,
      material:     (fd.get('material') as MaterialType) || 'No',
      charges:      cleanNum(fd.get('charges')),
      received:     cleanNum(fd.get('received')),
      payment_mode: (fd.get('payment_mode') as PaymentMode) || 'Cash',
      is_overtime:  fd.get('is_overtime') === 'on' || cleanNum(fd.get('ot_hours')) > 0,
      remarks:      fd.get('remarks') as string,
      service:      (fd.get('service') as string)?.trim() || '',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Staff Name</label>
          <select
            name="staff_name"
            defaultValue={initial?.staff_name ?? ''}
            required
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700"
          >
            <option value="">Select staff…</option>
            {employees.map(e => <option key={e.full_name} value={e.full_name}>{e.full_name}</option>)}
          </select>
        </div>
        <Input name="date" label="Date" type="date" defaultValue={initial?.date ?? new Date().toISOString().split('T')[0]} required />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">End Time</label>
          <input
            type="time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Duty Hours</label>
          <div className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-100 text-slate-700 font-bold">
            {dutyHours > 0 ? `${dutyHours}h` : '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input name="address" label="Address" defaultValue={initial?.address ?? ''} placeholder="e.g. 202 Escape Tower, 608 altelal…" />
        <Input name="area" label="Location / Area" defaultValue={initial?.area ?? ''} placeholder="e.g. Buz Bay, NH, Mirdif…" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input name="charges" label="Charges (AED)" type="number" min="0" step="0.01" defaultValue={initial?.charges ?? ''} placeholder="0.00" />
        <Input name="received" label="Received (AED)" type="number" min="0" step="0.01" defaultValue={initial?.received ?? ''} placeholder="0.00" />
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Payment Mode</label>
          <select name="payment_mode" defaultValue={initial?.payment_mode ?? 'Cash'} className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700">
            {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Service</label>
          <input
            name="service"
            list="service-options"
            defaultValue={initial?.service ?? ''}
            placeholder="e.g. Sofa, Deep, House…"
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700"
          />
          <datalist id="service-options">
            {COMMON_SERVICES.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Material</label>
          <select name="material" defaultValue={initial?.material ?? 'No'} className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700">
            {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">OT Hours</label>
          <input
            name="ot_hours"
            type="number"
            step="0.5"
            min="0"
            defaultValue={initial?.ot_hours ?? ''}
            placeholder="0.0"
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input type="checkbox" id="is_overtime" name="is_overtime" defaultChecked={initial?.is_overtime} className="w-4 h-4 rounded accent-emerald-500" />
        <label htmlFor="is_overtime" className="text-[13px] font-medium text-slate-700 cursor-pointer">Overtime (OT) Flag</label>
      </div>

      <Input name="remarks" label="Remarks" defaultValue={initial?.remarks ?? ''} placeholder="e.g. Deep clean, Sofa machine, Online…" />

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Save Job</Button>
      </div>
    </form>
  )
}

/* ─── Main Page ─── */
export function DailyJobSheet() {
  const { dailyJobs, dailyExpenses, employees, loading, addDailyJob, updateDailyJob, deleteDailyJob, addDailyExpense, updateDailyExpense, deleteDailyExpense, clearDailyData } = useData()

  const [searchParams, setSearchParams] = useSearchParams()
  const qDate = searchParams.get('date')
  const initialDate = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)
    ? qDate
    : new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDateState] = useState(initialDate)

  const setSelectedDate = (d: string) => {
    setSelectedDateState(d)
    setSearchParams({ date: d }, { replace: true })
  }

  useEffect(() => {
    const curQ = searchParams.get('date')
    if (curQ && /^\d{4}-\d{2}-\d{2}$/.test(curQ) && curQ !== selectedDate) {
      setSelectedDateState(curQ)
    }
  }, [searchParams])
  const [showAddJob, setShowAddJob]         = useState(false)
  const [editJob, setEditJob]               = useState<DailyJob | null>(null)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [editExpense, setEditExpense]       = useState<DailyExpense | null>(null)
  const [editingDriverStaff, setEditingDriverStaff] = useState<{ name: string; currentAmount: number } | null>(null)
  const [selectedPendingDetails, setSelectedPendingDetails] = useState<{
    id: string
    date: string
    client: string
    amount: number
    staff: string
    address: string
    area: string
    remarks: string
    job?: DailyJob
    isJob: boolean
  } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteSuccessNotice, setDeleteSuccessNotice] = useState<string | null>(null)
  const [driveStatus, setDriveStatus]       = useState<'idle' | 'connecting' | 'uploading' | 'done' | 'error'>('idle')
  const [driveLink, setDriveLink]           = useState('')
  const [driveError, setDriveError]         = useState('')
  const [importNotice, setImportNotice]     = useState<{ jobs: number; expenses: number; date: string; pendingCount?: number; pendingRcvdCount?: number; advanceCount?: number; fileName?: string } | null>(null)

  // Pagination & View All state
  const [pageSize, setPageSize]       = useState<number | 'all'>(10)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [selectedLetter, setSelectedLetter] = useState<string>('ALL')

  // Search & Payment Category Filters
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [searchQuery, setSearchQuery]           = useState('')
  const [paymentFilter, setPaymentFilter]       = useState<'ALL' | 'Monthly' | 'Cash' | 'Online' | 'Pending'>('ALL')
  const searchInputRef                          = useRef<HTMLInputElement>(null)
  const searchContainerRef                      = useRef<HTMLDivElement>(null)

  // Collapse search input on outside click when query is empty
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        if (!searchQuery) {
          setIsSearchExpanded(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [searchQuery])

  // Header 3-dot dropdown menu state
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)

  // Date Range state & presets (Today, Last 7 Days, Last 14 Days, Last 28 Days, Last 3 Months, Last 6 Months, One Year, Two Years)
  type DateRangePreset =
    | 'today'
    | '7days'
    | '14days'
    | '28days'
    | '3months'
    | '6months'
    | '1year'
    | '2years'

  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('today')
  const [rangeStartDate, setRangeStartDate] = useState<string>('')
  const [rangeEndDate, setRangeEndDate] = useState<string>('')
  const [showRangeMenu, setShowRangeMenu] = useState(false)

  const getRangeBounds = (preset: Exclude<DateRangePreset, 'today'>) => {
    const end = selectedDate || new Date().toISOString().split('T')[0]
    const d = new Date(end + 'T00:00:00')
    if (preset === '7days') {
      d.setDate(d.getDate() - 6)
    } else if (preset === '14days') {
      d.setDate(d.getDate() - 13)
    } else if (preset === '28days') {
      d.setDate(d.getDate() - 27)
    } else if (preset === '3months') {
      d.setMonth(d.getMonth() - 3)
    } else if (preset === '6months') {
      d.setMonth(d.getMonth() - 6)
    } else if (preset === '1year') {
      d.setFullYear(d.getFullYear() - 1)
    } else if (preset === '2years') {
      d.setFullYear(d.getFullYear() - 2)
    }
    const start = d.toISOString().split('T')[0]
    return { start, end }
  }

  const selectPreset = (preset: DateRangePreset) => {
    if (preset === 'today') {
      setDateRangePreset('today')
      setRangeStartDate('')
      setRangeEndDate('')
      setSelectedDate(new Date().toISOString().split('T')[0])
      setShowRangeMenu(false)
      return
    }
    const { start, end } = getRangeBounds(preset)
    setRangeStartDate(start)
    setRangeEndDate(end)
    setDateRangePreset(preset)
    setShowRangeMenu(false)
  }

  const isDateRange = dateRangePreset !== 'today'
  const effectiveStartDate = isDateRange ? rangeStartDate : selectedDate
  const effectiveEndDate   = isDateRange ? rangeEndDate : selectedDate

  const isDateInRange = (dateStr?: string) => {
    if (!dateStr) return false
    if (!isDateRange) return dateStr === selectedDate
    return dateStr >= effectiveStartDate && dateStr <= effectiveEndDate
  }

  // Column visibility customization state (persisted in localStorage)
  const [showColMenu, setShowColMenu] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('safaeewala_daily_job_cols')
      if (saved) return { ...DEFAULT_VISIBLE_COLUMNS, ...JSON.parse(saved) }
    } catch {}
    return DEFAULT_VISIBLE_COLUMNS
  })

  const toggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [colId]: !prev[colId] }
      try {
        localStorage.setItem('safaeewala_daily_job_cols', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
    try {
      localStorage.removeItem('safaeewala_daily_job_cols')
    } catch {}
  }

  // Widgets view all / collapse state (default shows 4 items)
  const [viewAllExpenses, setViewAllExpenses] = useState(false)
  const [viewAllDrivers, setViewAllDrivers] = useState(false)

  // Extra reconciliation widgets state (Pending, Pending Received, Advance)
  const [pendingList, setPendingList] = useState<DailyPendingItem[]>(() => {
    try {
      const saved = localStorage.getItem('safaeewala_daily_pending_items')
      if (saved) return JSON.parse(saved)
    } catch {}
    return []
  })

  const [pendingRcvdList, setPendingRcvdList] = useState<DailyPendingReceivedItem[]>(() => {
    try {
      const saved = localStorage.getItem('safaeewala_daily_pending_rcvd_items')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // Purge legacy mock data (pr-1 .. pr-7)
          return parsed.filter(item => !item.id?.startsWith('pr-'))
        }
      }
    } catch {}
    return []
  })

  const [advanceList, setAdvanceList] = useState<DailyAdvanceItem[]>(() => {
    try {
      const saved = localStorage.getItem('safaeewala_daily_advance_items')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // Purge legacy mock data (adv-1 .. adv-2)
          return parsed.filter(item => !item.id?.startsWith('adv-'))
        }
      }
    } catch {}
    return []
  })

  const [showAddPending, setShowAddPending]         = useState(false)
  const [showAddPendingRcvd, setShowAddPendingRcvd] = useState(false)
  const [showAddAdvance, setShowAddAdvance]         = useState(false)
  const [editingPending, setEditingPending]         = useState<DailyPendingItem | null>(null)
  const [editingPendingRcvd, setEditingPendingRcvd] = useState<DailyPendingReceivedItem | null>(null)
  const [editingAdvance, setEditingAdvance]         = useState<DailyAdvanceItem | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('safaeewala_daily_pending_items', JSON.stringify(pendingList))
    } catch {}
  }, [pendingList])

  useEffect(() => {
    try {
      localStorage.setItem('safaeewala_daily_pending_rcvd_items', JSON.stringify(pendingRcvdList))
    } catch {}
  }, [pendingRcvdList])

  useEffect(() => {
    try {
      localStorage.setItem('safaeewala_daily_advance_items', JSON.stringify(advanceList))
    } catch {}
  }, [advanceList])

  useEffect(() => {
    setCurrentPage(1)
    setViewAllExpenses(false)
    setViewAllDrivers(false)
  }, [selectedDate, pageSize, selectedLetter])

  // Helper to identify and skip accidental imported sheet total/summary rows or empty stubs
  const isBogusSummaryJob = (j: DailyJob) => {
    const noAddress = !j.address || j.address === '—' || j.address.trim() === ''
    const noTimes = (!j.start_time || j.start_time === '—') && (!j.end_time || j.end_time === '—')
    const hasSummaryNums = cleanNum(j.duty_hours) > 24 || cleanNum(j.charges) > 2000 || cleanNum(j.received) > 2000
    // Detect empty/broken stub jobs that have no address, 0 charges, 0 received, and no service/remarks
    const isEmptyStub = noAddress && cleanNum(j.charges) === 0 && cleanNum(j.received) === 0 && (!j.service || j.service === '—') && (!j.remarks || j.remarks === '—')
    return (noAddress && noTimes) || (noAddress && hasSummaryNums) || cleanNum(j.duty_hours) > 24 || isEmptyStub
  }

  const todayJobs     = dailyJobs.filter(j => isDateInRange(j.date) && !isBogusSummaryJob(j))
  const todayExpenses = dailyExpenses.filter(e => isDateInRange(e.date))

  // Automatically purge any accidental summary rows (such as sheet totals imported under Qasim)
  useEffect(() => {
    const bogusJobs = dailyJobs.filter(isBogusSummaryJob)
    if (bogusJobs.length > 0) {
      bogusJobs.forEach(b => {
        deleteDailyJob(b.id)
      })
    }
  }, [dailyJobs, deleteDailyJob])

  // Group active jobs by staff member so multiple shifts for an employee display sequentially adjacent
  const groupedJobs = todayJobs.reduce((acc, job) => {
    const s = job.staff_name.trim()
    if (!acc[s]) acc[s] = []
    acc[s].push(job)
    return acc
  }, {} as Record<string, DailyJob[]>)

  // Sort each employee's shifts chronologically by start_time
  Object.keys(groupedJobs).forEach(staff => {
    groupedJobs[staff].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  })

  // Sequential active jobs list (ordered by earliest shift start time or staff name)
  const activeJobRows: Array<DailyJob & { isNil?: boolean }> = []
  Object.keys(groupedJobs)
    .sort((a, b) => (groupedJobs[a][0]?.start_time || '').localeCompare(groupedJobs[b][0]?.start_time || '') || a.localeCompare(b))
    .forEach(staff => {
      activeJobRows.push(...groupedJobs[staff])
    })

  // Absentees / active employees with nil records (0 jobs today) placed at the bottom
  const activeStaffSet = new Set(todayJobs.map(j => j.staff_name.trim().toLowerCase()))

  const allKnownCleaners = useMemo(() => {
    const map = new Map<string, string>() // lower -> display
    // From employees list in store
    employees.forEach(e => {
      if (e.status === 'active' || e.status === 'engaged_in_project' || !e.status) {
        map.set(e.full_name.trim().toLowerCase(), e.full_name.trim())
      }
    })
    // From daily jobs history
    dailyJobs.forEach(j => {
      if (j.staff_name && j.staff_name.trim()) {
        const s = j.staff_name.trim()
        if (!map.has(s.toLowerCase())) map.set(s.toLowerCase(), s)
      }
    })
    // Standard cleaners from schedule roster (ensures Dinesh, Adnan, Qasim are recognized as absent when having 0 jobs)
    const defaultScheduleRoster = [
      'Sharmila', 'Sharada', 'Uma Kumari', 'Ambika', 'Asmita', 'Bimala',
      'Gau Maya', 'Khima', 'Laxmi Rani', 'Rupa', 'Nim Kumari', 'Uma Sunar',
      'Parmila', 'Sita', 'Shanti', 'Sabirti', 'Kamala', 'Krishna',
      'Nobel', 'Ishwor', 'Sushanta', 'Sandesh', 'Ibrahim', 'Dinesh',
      'Adnan', 'Qasim'
    ]
    defaultScheduleRoster.forEach(name => {
      if (!map.has(name.toLowerCase())) map.set(name.toLowerCase(), name)
    })
    return Array.from(map.values())
  }, [employees, dailyJobs])

  // Absentees / active employees with nil records (0 jobs today) placed at the bottom
  // Guard: if data is still loading and store has no jobs yet, do NOT falsely show everyone as absent
  const nilRows: Array<any> = (loading && dailyJobs.length === 0) ? [] : allKnownCleaners
    .filter(name => !activeStaffSet.has(name.trim().toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({
      id: `nil-${name.toLowerCase().replace(/\s+/g, '-')}`,
      isNil: true,
      staff_name: name,
      date: selectedDate,
    }))

  // Unique staff list for color mapping (alphabetically consistent)
  const uniqueStaffList = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    activeJobRows.forEach(j => {
      const s = j.staff_name.trim()
      if (s && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase())
        list.push(s)
      }
    })
    return list
  }, [activeJobRows])

  // Color mapping: each cleaner gets their own unique palette
  const staffColorMap = useMemo(() => {
    const map = new Map<string, StaffPalette>()
    uniqueStaffList.forEach((name, i) => {
      map.set(name.toLowerCase(), STAFF_COLOR_PALETTES[i % STAFF_COLOR_PALETTES.length])
    })
    return map
  }, [uniqueStaffList])

  // Available first letters across active staff and nil staff
  const availableLetters = useMemo(() => {
    const set = new Set<string>()
    activeJobRows.forEach(j => {
      const ch = (j.staff_name || '').trim()[0]?.toUpperCase()
      if (ch && /[A-Z]/.test(ch)) set.add(ch)
    })
    nilRows.forEach(n => {
      const ch = (n.staff_name || '').trim()[0]?.toUpperCase()
      if (ch && /[A-Z]/.test(ch)) set.add(ch)
    })
    return set
  }, [activeJobRows, nilRows])

  // Count of cleaners per starting letter
  const letterCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const seen = new Set<string>()
    activeJobRows.forEach(j => {
      const s = j.staff_name.trim()
      if (s && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase())
        const ch = s[0]?.toUpperCase()
        if (ch && /[A-Z]/.test(ch)) {
          counts[ch] = (counts[ch] || 0) + 1
        }
      }
    })
    return counts
  }, [activeJobRows])

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [paymentFilter, searchQuery, selectedLetter])

  // Filter jobs by selected letter, payment category, and search query
  const filteredActiveJobRows = useMemo(() => {
    let list = activeJobRows

    // 1. Filter by letter
    if (selectedLetter !== 'ALL') {
      list = list.filter(j => j.staff_name.trim().toUpperCase().startsWith(selectedLetter))
    }

    // 2. Filter by payment category (Monthly, Cash, Online, Pending)
    if (paymentFilter !== 'ALL') {
      if (paymentFilter === 'Monthly') {
        list = list.filter(j => j.payment_mode === 'Monthly')
      } else if (paymentFilter === 'Cash') {
        list = list.filter(j => j.payment_mode === 'Cash')
      } else if (paymentFilter === 'Online') {
        list = list.filter(j => j.payment_mode === 'Online')
      } else if (paymentFilter === 'Pending') {
        list = list.filter(j => j.payment_mode === 'Pending' || cleanNum(j.charges) > cleanNum(j.received))
      }
    }

    // 3. Search query filter
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(j => {
        const staff = (j.staff_name || '').toLowerCase()
        const addr  = (j.address || '').toLowerCase()
        const area  = (j.area || '').toLowerCase()
        const rem   = (j.remarks || '').toLowerCase()
        const srv   = (j.service || '').toLowerCase()
        const mode  = (j.payment_mode || '').toLowerCase()
        const chg   = String(j.charges || '')
        const rcv   = String(j.received || '')
        return staff.includes(q) || addr.includes(q) || area.includes(q) || rem.includes(q) || srv.includes(q) || mode.includes(q) || chg.includes(q) || rcv.includes(q)
      })
    }

    return list
  }, [activeJobRows, selectedLetter, paymentFilter, searchQuery])

  const filteredNilRows = useMemo(() => {
    // If a specific payment filter is active (Monthly, Cash, Online, Pending), do not show absent cleaners
    if (paymentFilter !== 'ALL') return []

    let list = nilRows
    if (selectedLetter !== 'ALL') {
      list = list.filter(n => n.staff_name.trim().toUpperCase().startsWith(selectedLetter))
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(n => (n.staff_name || '').toLowerCase().includes(q))
    }
    return list
  }, [nilRows, selectedLetter, paymentFilter, searchQuery])

  // Combined sheet entries after letter filtering
  const allSheetRows = [...filteredActiveJobRows, ...filteredNilRows]

  const totalRows  = allSheetRows.length
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalRows / pageSize) || 1
  const activePage = Math.min(currentPage, totalPages)

  const displayedRows = pageSize === 'all'
    ? allSheetRows
    : allSheetRows.slice((activePage - 1) * (pageSize as number), activePage * (pageSize as number))

  // Extra reconciliation widgets calculations
  const todayPendingItems     = useMemo(() => pendingList.filter(p => isDateInRange(p.date)), [pendingList, selectedDate, dateRangePreset, rangeStartDate, rangeEndDate])
  const todayPendingRcvdItems = useMemo(() => pendingRcvdList.filter(p => isDateInRange(p.date)), [pendingRcvdList, selectedDate, dateRangePreset, rangeStartDate, rangeEndDate])
  const todayAdvanceItems     = useMemo(() => advanceList.filter(p => isDateInRange(p.date)), [advanceList, selectedDate, dateRangePreset, rangeStartDate, rangeEndDate])

  // Today Pending entries (from todayJobs + any todayPendingItems)
  const todayPendingEntries = useMemo(() => {
    const list: Array<{
      id: string
      date: string
      client: string
      amount: number
      staff: string
      address: string
      area: string
      remarks: string
      job?: DailyJob
      isJob: boolean
    }> = []

    // 1. Pending jobs from todayJobs (charges > received or payment_mode is 'Pending')
    todayJobs.forEach(job => {
      const due = Math.max(0, cleanNum(job.charges) - cleanNum(job.received))
      if (!isBogusSummaryJob(job) && (due > 0 || job.payment_mode === 'Pending')) {
        list.push({
          id: `job-${job.id}`,
          date: job.date,
          client: job.address || job.area || 'Client',
          amount: due,
          staff: job.staff_name || '—',
          address: job.address || '—',
          area: job.area || '—',
          remarks: job.remarks || '—',
          job,
          isJob: true,
        })
      }
    })

    // 2. Extra items in pendingList for today (manual entries or imported pending)
    todayPendingItems.forEach(item => {
      list.push({
        id: item.id,
        date: item.date,
        client: item.client,
        amount: cleanNum(item.amount),
        staff: (item as any).staff || '—',
        address: item.client,
        area: '—',
        remarks: '—',
        isJob: false,
      })
    })

    return list
  }, [todayJobs, todayPendingItems])

  const todayPendingTotalAmt   = todayPendingEntries.reduce((s, i) => s + cleanNum(i.amount), 0)
  const pendingTotalAmt        = todayPendingTotalAmt
  const pendingRcvdTotalCash   = todayPendingRcvdItems.reduce((s, i) => s + cleanNum(i.cash), 0)
  const pendingRcvdTotalOnline = todayPendingRcvdItems.reduce((s, i) => s + cleanNum(i.online), 0)
  const pendingRcvdGrandTotal  = pendingRcvdTotalCash + pendingRcvdTotalOnline
  const advanceTotalRcvd       = todayAdvanceItems.reduce((s, i) => s + cleanNum(i.received), 0)
  const advanceTotalAmt        = todayAdvanceItems.reduce((s, i) => s + cleanNum(i.advance), 0)

  // ── Auto-calculations ──
  const totalCharges   = todayJobs.reduce((s, j) => s + cleanNum(j.charges), 0)
  const grossCollected = todayJobs.filter(j => j.payment_mode !== 'Monthly').reduce((s, j) => s + cleanNum(j.received), 0)
  const pendingTotal   = todayPendingTotalAmt
  const onlineTotal    = todayJobs.filter(j => j.payment_mode === 'Online').reduce((s, j) => s + cleanNum(j.received), 0)
  const totalExpenses  = todayExpenses.reduce((s, e) => s + cleanNum(e.amount), 0)

  // Net Total updated formula: (Gross Collected + Pending Cash Received) - Total Expenses
  const pendingCashRcvdForNet = pendingRcvdTotalCash > 0 ? pendingRcvdTotalCash : pendingRcvdGrandTotal
  const netTotal       = (grossCollected + pendingCashRcvdForNet) - totalExpenses

  const totalOTHours   = Math.round(todayJobs.reduce((s, j) => s + (cleanNum(j.ot_hours) || calcOTHours(j.start_time, j.end_time)), 0) * 10) / 10
  const staffOnDuty    = new Set(todayJobs.map(j => j.staff_name)).size
  const jobsCount      = todayJobs.length

  // Driver summary — collected per staff (excluding Monthly + Pending)
  const driverSummary = todayJobs.reduce((acc, job) => {
    if (job.payment_mode !== 'Monthly' && job.payment_mode !== 'Pending') {
      acc[job.staff_name] = (acc[job.staff_name] || 0) + cleanNum(job.received)
    }
    return acc
  }, {} as Record<string, number>)

  // 3 items display logic for bottom widgets (Sirf Expense Log aur Driver Staff Summary widgets mein teen rows dikhayen)
  const displayedExpenses = viewAllExpenses ? todayExpenses : todayExpenses.slice(0, 3)

  const sortedDrivers = useMemo(() => {
    return Object.entries(driverSummary).sort((a, b) => b[1] - a[1])
  }, [driverSummary])

  const displayedDrivers = viewAllDrivers ? sortedDrivers : sortedDrivers.slice(0, 3)

  // ── Date navigation ──
  function prevDay() {
    setDateRangePreset('today')
    const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() - 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }
  function nextDay() {
    setDateRangePreset('today')
    const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() + 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  // Smooth scroll helper with highlight pulse for card navigation
  const scrollToElement = (elementId: string) => {
    const el = document.getElementById(elementId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('ring-4', 'ring-emerald-400', 'ring-offset-2', 'transition-all', 'duration-300')
      setTimeout(() => {
        el.classList.remove('ring-4', 'ring-emerald-400', 'ring-offset-2')
      }, 1800)
    }
  }

  // ── Excel export ──
  function buildWorkbook() {
    const wb = XLSX.utils.book_new()
    const jobRows = todayJobs.map(j => ({
      Staff: j.staff_name,
      'Start time': formatTimeOnly(j.start_time),
      'End time': formatTimeOnly(j.end_time),
      Address: j.address,
      Location: j.area,
      Charges: cleanNum(j.charges),
      Receive: cleanNum(j.received),
      Pending: cleanNum(j.charges) > cleanNum(j.received) ? cleanNum(j.charges) - cleanNum(j.received) : 'Nil',
      'Duty H': cleanNum(j.duty_hours),
      OT: cleanNum(j.ot_hours) || calcOTHours(j.start_time, j.end_time),
      Material: j.material,
      Mod: j.payment_mode,
      Remarks: j.remarks,
      Service: j.service || '',
      Date: j.date,
    }))
    const expRows = todayExpenses.map(e => ({
      Date: e.date, Name: e.name, Category: e.category, 'Amount AED': cleanNum(e.amount),
    }))
    const summary = [{
      Date: selectedDate,
      'Charges': totalCharges,
      'Today Collection': grossCollected,
      'Pending Cash Received': pendingCashRcvdForNet,
      'Expenses': totalExpenses,
      'Net Total': netTotal,
      'Pending': pendingTotal,
      'Online': onlineTotal,
      'OT Hours': totalOTHours,
      'Staff on Duty': staffOnDuty,
      'Jobs Count': jobsCount,
    }]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary),  'Summary')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobRows),  'Jobs')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows),  'Expenses')
    if (todayPendingItems.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todayPendingItems.map(p => ({
        Client: p.client, Amount: cleanNum(p.amount), Date: p.date,
      }))), 'Pending')
    }
    if (todayPendingRcvdItems.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todayPendingRcvdItems.map(p => ({
        Client: p.client, Cash: cleanNum(p.cash), Online: cleanNum(p.online), Date: p.date,
      }))), 'Pending Received')
    }
    if (todayAdvanceItems.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todayAdvanceItems.map(a => ({
        Client: a.client, Received: cleanNum(a.received), Advance: cleanNum(a.advance), Date: a.date,
      }))), 'Advance')
    }
    return wb
  }

  function exportExcel() {
    const wb = buildWorkbook()
    const fileName = isDateRange
      ? `DailyJobSheet-${effectiveStartDate}_to_${effectiveEndDate}.xlsx`
      : `DailyJobSheet-${selectedDate}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  // ── Sample Excel Template Download ──
  function downloadSampleTemplate() {
    const sampleData = [
      {
        Staff: 'Sharmila',
        'Start time': '10:00 AM',
        'End time': '03:00 PM',
        Address: '202 Escape Tower',
        Location: 'Buz Bay',
        Charges: 160,
        Receive: 160,
        Pending: 'Nil',
        'Duty H': 5,
        OT: 0,
        Material: 'NO',
        Mod: 'Cash',
        Remarks: '',
        Service: 'Sofa',
      },
      {
        Staff: 'Sharada',
        'Start time': '03:00 PM',
        'End time': '05:00 PM',
        Address: '608 altelal 17',
        Location: 'NH',
        Charges: 260,
        Receive: 260,
        Pending: 'Nil',
        'Duty H': 2,
        OT: 0,
        Material: 'NO',
        Mod: 'Online',
        Remarks: '',
        Service: 'House',
      },
      {
        Staff: 'Uma Kumari',
        'Start time': '10:30 AM',
        'End time': '02:30 PM',
        Address: '413 Tamasha restau',
        Location: 'Al Nhada 1',
        Charges: 100,
        Receive: 100,
        Pending: 'Nil',
        'Duty H': 4,
        OT: 0,
        Material: 'YES',
        Mod: 'Cash',
        Remarks: 'Deep/lader/Online',
        Service: 'Window',
      },
      {
        Staff: 'Ambika',
        'Start time': '09:00 AM',
        'End time': '12:00 PM',
        Address: 'Office Luxam Tradin',
        Location: 'Khawaneej',
        Charges: 0,
        Receive: 0,
        Pending: 'Nil',
        'Duty H': 3,
        OT: 0,
        Material: 'NO',
        Mod: 'Monthly',
        Remarks: '',
        Service: 'Office',
      },
      {
        Staff: 'Asmita',
        'Start time': '10:00 AM',
        'End time': '12:00 PM',
        Address: '306 Bldg 8B Gharoo',
        Location: 'Mirdif',
        Charges: 60,
        Receive: 0,
        Pending: 60,
        'Duty H': 2,
        OT: 0,
        Material: 'NO',
        Mod: 'Pending',
        Remarks: '',
        Service: 'Apartment',
      },
    ]

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(sampleData)
    ws['!cols'] = [
      { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 16 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
      { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 14 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Jobs')
    XLSX.writeFile(wb, 'DailyJobSheet-Sample-Template.xlsx')
  }

  // ── Print ──
  function printSheet() {
    const jobRows = todayJobs.map(j => {
      const otH = calcOTHours(j.start_time, j.end_time)
      const otDisplay = cleanNum(j.ot_hours) || otH
      const isMonthly = j.payment_mode === 'Monthly'
      const rowStyle = isMonthly
        ? 'background:#d1fae5;color:#065f46;font-weight:600'
        : j.payment_mode === 'Pending'
          ? 'background:#fee2e2'
          : ''
      return `<tr style="${rowStyle}">
        <td>${j.staff_name}</td>
        <td>${formatTimeOnly(j.start_time)}</td>
        <td>${formatTimeOnly(j.end_time)}</td>
        <td>${j.address || '—'}</td>
        <td>${j.area || '—'}</td>
        <td style="text-align:right">${j.payment_mode === 'Monthly' ? (cleanNum(j.charges) > 0 ? cleanNum(j.charges) : '—') : cleanNum(j.charges)}</td>
        <td style="text-align:right">${j.payment_mode === 'Pending' || j.payment_mode === 'Monthly' ? '—' : cleanNum(j.received)}</td>
        <td style="text-align:right">${cleanNum(j.charges) > cleanNum(j.received) ? cleanNum(j.charges) - cleanNum(j.received) : 'Nil'}</td>
        <td style="text-align:center">${cleanNum(j.duty_hours)}h</td>
        <td style="text-align:center">${otDisplay > 0 ? otDisplay + 'h OT' : '0'}</td>
        <td>${j.material}</td>
        <td>${j.payment_mode}</td>
        <td>${j.remarks}</td>
        <td>${j.service || '—'}</td>
      </tr>`}).join('')

    const nilPrintRows = filteredNilRows.map(n => `
      <tr style="background:#fee2e2;color:#991b1b;font-weight:600">
        <td>${n.staff_name}</td>
        <td>—</td><td>—</td>
        <td>Absent (No jobs assigned)</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
        <td><span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:bold">ABSENT</span></td>
        <td>—</td><td>—</td>
      </tr>`).join('')

    const expRows = todayExpenses.map(e => `
      <tr><td>${e.name}</td><td>${e.category}</td><td style="text-align:right">AED ${cleanNum(e.amount)}</td></tr>`).join('')

    const driverRows = Object.entries(driverSummary).map(([name, amt]) =>
      `<tr><td>${name}</td><td style="text-align:right">AED ${amt}</td></tr>`).join('')

    const win = window.open('', '_blank', 'width=1100,height=800')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Daily Job Sheet — ${isDateRange ? `${fmtDate(effectiveStartDate)} to ${fmtDate(effectiveEndDate)}` : selectedDate}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:32px;font-size:11px;color:#111}
        h1{font-size:18px;margin-bottom:4px}
        .sub{color:#666;font-size:11px;margin-bottom:20px}
        .kpis{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
        .kpi{background:#f3f4f6;padding:10px 16px;border-radius:8px;min-width:100px}
        .kpi-val{font-size:16px;font-weight:700;color:#111}
        .kpi-lbl{font-size:10px;color:#666;margin-top:2px}
        table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px}
        th{background:#111827;color:white;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
        td{padding:5px 8px;border-bottom:1px solid #e5e7eb}
        tr:nth-child(even)td{background:#f9fafb}
        .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}
        h3{font-size:13px;font-weight:700;margin-bottom:8px}
        @media print{body{padding:16px}}
      </style>
    </head><body>
      <h1>Daily Job Sheet</h1>
      <p class="sub">Safaeewala Cleaning & Maintenance LLC &nbsp;·&nbsp; ${isDateRange ? `${fmtDate(effectiveStartDate)} to ${fmtDate(effectiveEndDate)}` : fmtDate(selectedDate)}</p>
      <div class="kpis">
        <div class="kpi"><div class="kpi-val">AED ${grossCollected.toLocaleString()}</div><div class="kpi-lbl">${isDateRange ? 'Gross Collected' : 'Today Collection'}</div></div>
        <div class="kpi"><div class="kpi-val">AED ${totalCharges.toLocaleString()}</div><div class="kpi-lbl">Charges</div></div>
        <div class="kpi"><div class="kpi-val">AED ${pendingCashRcvdForNet.toLocaleString()}</div><div class="kpi-lbl">Pending Cash Received</div></div>
        <div class="kpi"><div class="kpi-val">AED ${totalExpenses.toLocaleString()}</div><div class="kpi-lbl">Expenses</div></div>
        <div class="kpi"><div class="kpi-val">AED ${netTotal.toLocaleString()}</div><div class="kpi-lbl">Net Total</div></div>
        <div class="kpi"><div class="kpi-val">AED ${pendingTotal.toLocaleString()}</div><div class="kpi-lbl">Pending</div></div>
        <div class="kpi"><div class="kpi-val">AED ${onlineTotal.toLocaleString()}</div><div class="kpi-lbl">Online</div></div>
        <div class="kpi"><div class="kpi-val">${totalOTHours}h</div><div class="kpi-lbl">OT</div></div>
        <div class="kpi"><div class="kpi-val">${staffOnDuty}</div><div class="kpi-lbl">${isDateRange ? 'Active Staff' : 'Staff on Duty'}</div></div>
        <div class="kpi"><div class="kpi-val">${jobsCount}</div><div class="kpi-lbl">${isDateRange ? 'Total Jobs' : 'Jobs'}</div></div>
      </div>
      <table>
        <thead><tr><th>Staff</th><th>Start</th><th>End</th><th>Address</th><th>Location</th><th>Charges</th><th>Received</th><th>Pending</th><th>Duty H</th><th>OT</th><th>Material</th><th>Mode</th><th>Remarks</th><th>Service</th></tr></thead>
        <tbody>${(jobRows + nilPrintRows) || '<tr><td colspan="14" style="text-align:center;color:#999">No jobs</td></tr>'}</tbody>
        <tfoot><tr style="font-weight:700;background:#f3f4f6">
          <td colspan="5">Totals</td>
          <td style="text-align:right">AED ${todayJobs.reduce((s,j)=>s+cleanNum(j.charges),0).toLocaleString()}</td>
          <td style="text-align:right">AED ${grossCollected.toLocaleString()}</td>
          <td style="text-align:right">AED ${todayJobs.reduce((s,j)=>s+Math.max(0,cleanNum(j.charges)-cleanNum(j.received)),0).toLocaleString()}</td>
          <td style="text-align:center">${Math.round(todayJobs.reduce((s,j)=>s+cleanNum(j.duty_hours),0)*10)/10}h</td>
          <td style="text-align:center">${Math.round(todayJobs.reduce((s,j)=>s+(cleanNum(j.ot_hours)||calcOTHours(j.start_time,j.end_time)),0)*10)/10}h</td>
          <td colspan="4"></td>
        </tr></tfoot>
      </table>
      <div class="two-col">
        <div>
          <h3>Expenses</h3>
          <table>
            <thead><tr><th>Name</th><th>Category</th><th>Amount</th></tr></thead>
            <tbody>${expRows || '<tr><td colspan="3" style="text-align:center;color:#999">No expenses</td></tr>'}</tbody>
            <tfoot><tr style="font-weight:700"><td colspan="2">Total</td><td style="text-align:right">AED ${totalExpenses.toLocaleString()}</td></tr></tfoot>
          </table>
        </div>
        <div>
          <h3>Driver Summary</h3>
          <table>
            <thead><tr><th>Staff</th><th>Collected</th></tr></thead>
            <tbody>${driverRows || '<tr><td colspan="2" style="text-align:center;color:#999">No data</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`)
    win.document.close()
  }

  // ── Google Drive backup ──
  async function backupToDrive() {
    try {
      setDriveStatus('connecting')
      setDriveError('')
      let token = getAccessToken()
      if (!token) token = await authorizeGoogleDrive()
      setDriveStatus('uploading')
      const wb = buildWorkbook()
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const link = await uploadToDrive(blob, `DailyJobSheet-${selectedDate}.xlsx`, token)
      setDriveLink(link)
      setDriveStatus('done')
    } catch (err: any) {
      setDriveError(err.message || 'Upload failed')
      setDriveStatus('error')
    }
  }

  /**
   * Resolves date strictly from the uploaded Excel filename.
   * Rules: FILE KA NAME HI DATE HOGI.
   * Supports:
   * - YYYY-MM-DD, YYYY_MM_DD, YYYY.MM.DD (e.g. "2026-10-23.xlsx")
   * - DD-MM-YYYY, DD_MM_YYYY, DD.MM.YYYY (e.g. "23-10-2026.xlsx")
   * - YYYYMMDD (e.g. "20261023.xlsx")
   * - DDMMYYYY (e.g. "23102026.xlsx")
   * - Month text: "Apr 26", "26 Apr 2026", "26-October-2026", "Oct 23 Schedule.xlsx"
   * - Single day: "23.xlsx", "Day 23.xlsx" (infers year & month from selectedDate)
   * - Fallback: selectedDate
   */
  function extractDateFromFilename(fileName: string, fallbackDate: string): string {
    if (!fileName) return fallbackDate

    // Clean extension
    const base = fileName.replace(/\.[^/.]+$/, '').trim()

    // 1. Check YYYY-MM-DD or YYYY.MM.DD or YYYY_MM_DD
    const ymd = base.match(/\b(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})\b/)
    if (ymd) {
      const y = ymd[1]
      const m = String(parseInt(ymd[2], 10)).padStart(2, '0')
      const d = String(parseInt(ymd[3], 10)).padStart(2, '0')
      const mNum = parseInt(m, 10)
      const dNum = parseInt(d, 10)
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
        return `${y}-${m}-${d}`
      }
    }

    // 2. Check DD-MM-YYYY or DD.MM.YYYY or DD_MM_YYYY
    const dmy = base.match(/\b(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})\b/)
    if (dmy) {
      const d = String(parseInt(dmy[1], 10)).padStart(2, '0')
      const m = String(parseInt(dmy[2], 10)).padStart(2, '0')
      const y = dmy[3]
      const mNum = parseInt(m, 10)
      const dNum = parseInt(d, 10)
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
        return `${y}-${m}-${d}`
      }
    }

    // 3. Month text: e.g. "Apr 26", "26 Apr 2026", "26 October 2026", "Oct-26-2026"
    const monthNames = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    }

    // Case 3a: Month Day Year (e.g. "Oct 23 2026" or "October 23, 2026" or "Oct-23")
    const mdyRegex = new RegExp(`\\b(${monthNames})[\\s_-]*(\\d{1,2})(?:st|nd|rd|th)?[\\s,_-]*(?:(20\\d{2}|\\d{2}))?\\b`, 'i')
    const mdyMatch = base.match(mdyRegex)
    if (mdyMatch) {
      const mKey = mdyMatch[1].toLowerCase().slice(0, 3)
      const m = monthMap[mKey]
      const d = String(parseInt(mdyMatch[2], 10)).padStart(2, '0')
      let y = mdyMatch[3] ? mdyMatch[3] : (fallbackDate.split('-')[0] || String(new Date().getFullYear()))
      if (y.length === 2) y = '20' + y
      return `${y}-${m}-${d}`
    }

    // Case 3b: Day Month Year (e.g. "23 Oct 2026" or "23rd October 2026" or "23-Oct")
    const dmyTextRegex = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s,_-]*(${monthNames})[\\s,_-]*(?:(20\\d{2}|\\d{2}))?\\b`, 'i')
    const dmyTextMatch = base.match(dmyTextRegex)
    if (dmyTextMatch) {
      const d = String(parseInt(dmyTextMatch[1], 10)).padStart(2, '0')
      const mKey = dmyTextMatch[2].toLowerCase().slice(0, 3)
      const m = monthMap[mKey]
      let y = dmyTextMatch[3] ? dmyTextMatch[3] : (fallbackDate.split('-')[0] || String(new Date().getFullYear()))
      if (y.length === 2) y = '20' + y
      return `${y}-${m}-${d}`
    }

    // 4. Compact numeric: YYYYMMDD (8 digits)
    const compactYMD = base.match(/\b(20\d{2})(\d{2})(\d{2})\b/)
    if (compactYMD) {
      const y = compactYMD[1]
      const m = compactYMD[2]
      const d = compactYMD[3]
      const mNum = parseInt(m, 10)
      const dNum = parseInt(d, 10)
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
        return `${y}-${m}-${d}`
      }
    }

    // 5. Compact numeric: DDMMYYYY (8 digits)
    const compactDMY = base.match(/\b(\d{2})(\d{2})(20\d{2})\b/)
    if (compactDMY) {
      const d = compactDMY[1]
      const m = compactDMY[2]
      const y = compactDMY[3]
      const mNum = parseInt(m, 10)
      const dNum = parseInt(d, 10)
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
        return `${y}-${m}-${d}`
      }
    }

    // 6. Isolated day number only: e.g. "23.xlsx", "Day 23", "Sheet 23"
    const dayOnlyMatch = base.match(/(?:^|\b)(?:day[\s_-]*)?([1-9]|[12]\d|3[01])(?:st|nd|rd|th)?(?:\b|$)/i)
    if (dayOnlyMatch) {
      const d = String(parseInt(dayOnlyMatch[1], 10)).padStart(2, '0')
      const parts = fallbackDate.split('-')
      const y = parts[0] || String(new Date().getFullYear())
      const m = parts[1] || '01'
      return `${y}-${m}-${d}`
    }

    return fallbackDate
  }

  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  async function importJobs(file: File) {
    setImporting(true)
    setImportNotice(null)
    try {
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })

      // FILE KA NAME HI DATE HOGI: Extract authoritative date from filename
      const targetDate = extractDateFromFilename(file.name, selectedDate)

      // Reset date range presets so view immediately switches to the imported date
      setDateRangePreset('today')
      setRangeStartDate('')
      setRangeEndDate('')
      setSelectedDate(targetDate)

      // Clear existing data for this target date so re-importing updates cleanly without duplicating
      clearDailyData(targetDate)

      // Smart sheet matching with Header Scoring:
      // Real job sheets contain: Staff, Address, Charges, Received, Location, Duty Hrs, Mode, Service
      const REQUIRED_JOB_COLS = ['staff', 'address', 'charges', 'received', 'location', 'start time', 'end time', 'duty hrs', 'mode', 'service']

      const scoreSheet = (sheet: XLSX.WorkSheet | undefined): number => {
        if (!sheet || !sheet['!ref']) return 0
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })
        if (!rows || rows.length === 0) return 0
        let bestScore = 0
        for (let r = 0; r < Math.min(rows.length, 6); r++) {
          const row = rows[r]
          if (!Array.isArray(row)) continue
          let s = 0
          const texts = row.map(cell => String(cell || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
          REQUIRED_JOB_COLS.forEach(col => {
            const normalized = col.replace(/[^a-z0-9]/g, '')
            if (texts.some(t => t.includes(normalized))) s += 2
          })
          if (texts.some(t => t.includes('expense'))) s += 1
          if (texts.some(t => t.includes('pending'))) s += 1
          if (texts.some(t => t.includes('advance'))) s += 1
          if (s > bestScore) bestScore = s
        }
        return bestScore
      }

      const dayNum = parseInt(targetDate.split('-')[2] || '0', 10)
      const scoredSheets = wb.SheetNames.map(sn => ({
        name: sn,
        score: scoreSheet(wb.Sheets[sn]),
        isDayMatch: dayNum > 0 && Boolean(sn.match(/^(\d+)/) && parseInt(sn.match(/^(\d+)/)![1], 10) === dayNum),
        isJobsName: sn.toLowerCase() === 'jobs' || sn.toLowerCase().includes('job sheet') || sn.toLowerCase().includes('schedule')
      }))

      // Prefer sheets with real job columns (score >= 4)
      const validSheets = scoredSheets.filter(s => s.score >= 4)

      let sheetName = wb.SheetNames[0]
      if (validSheets.length > 0) {
        const dayMatch = validSheets.find(s => s.isDayMatch)
        if (dayMatch) {
          sheetName = dayMatch.name
        } else {
          const jobsMatch = validSheets.find(s => s.isJobsName)
          if (jobsMatch) {
            sheetName = jobsMatch.name
          } else {
            validSheets.sort((a, b) => b.score - a.score)
            sheetName = validSheets[0].name
          }
        }
      } else {
        if (wb.SheetNames.includes('Jobs')) {
          sheetName = 'Jobs'
        } else if (dayNum > 0) {
          const matchingSheet = wb.SheetNames.find(sn => {
            const m = sn.match(/^(\d+)/)
            return m && parseInt(m[1], 10) === dayNum
          })
          if (matchingSheet) sheetName = matchingSheet
        }
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName])
      if (!rows || rows.length === 0) {
        alert('No rows found in the Excel sheet.')
        return
      }

      const toDate = (v: any) => {
        if (!v) return targetDate
        if (v instanceof Date) return v.toISOString().split('T')[0]
        const s = String(v).trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
        const d = new Date(s)
        return isNaN(d.getTime()) ? targetDate : d.toISOString().split('T')[0]
      }

      let importedJobCount = 0
      let importedExpCount = 0
      let lastStaff = ''

      rows.forEach(r => {
        // Robust column matching across case, symbols, and alternate names from Excel
        const nm = (...keys: string[]) => {
          for (const k of keys) {
            const normalized = k.toLowerCase().replace(/\s*\([^)]*\)\s*/g, '').replace(/[^a-z0-9]/g, '')
            for (const [key, val] of Object.entries(r)) {
              const keyNorm = String(key).toLowerCase().replace(/\s*\([^)]*\)\s*/g, '').replace(/[^a-z0-9]/g, '')
              if (keyNorm === normalized && val !== undefined && val !== null && val !== '') return val
            }
          }
          return ''
        }

        const rawStaff = String(nm('Staff', 'staff_name', 'Employee', 'Name') || '').trim()
        const rawAddress = String(nm('Address', 'address') || '').trim()
        const rawStart = nm('Start time', 'Start', 'start_time', 'Start Time')
        const rawEnd = nm('End time', 'End', 'end_time', 'End Time')
        const rawCharges = nm('Charges', 'charges_aed', 'charges', 'Charge')
        const rawReceived = nm('Received', 'Receive', 'received_aed', 'received', 'Recv', 'Paid')

        // Skip summary / footer rows (e.g. 'Gross', 'Total', 'Pending Rcvd cash', 'Expences', 'Net Total', or numeric totals)
        // Check ONLY in main job columns, NOT in side columns (which contain "Advance" and "Total" headers/summaries)
        const jobColText = [rawStaff, rawAddress, String(nm('Location', 'area', 'Area', 'location') || ''), String(rawCharges)].join(' ').toLowerCase()
        const isFooterWord = ['gross', 'pending rcvd', 'total', 'expences', 'net total', 'summary'].some(f => jobColText.includes(f))

        const hasNoAddressOrTimes = !rawAddress && (!rawStart || String(rawStart).trim() === '—') && (!rawEnd || String(rawEnd).trim() === '—')
        const dutyHCheck = cleanNum(nm('Duty Hrs', 'Duty H', 'Duty Hours', 'Duty', 'duty_hours', 'dutyhrs', 'Hrs'))
        const isNumericTotalRow = hasNoAddressOrTimes && (dutyHCheck > 24 || cleanNum(rawCharges) > 1500 || cleanNum(rawReceived) > 1500)

        // Absent cleaner check (e.g. Nobel where 'Start time' is 'Absent')
        const isAbsent = String(rawStart).toLowerCase().includes('absent') || String(rawAddress).toLowerCase().includes('absent') || String(rawStaff).toLowerCase().includes('absent')

        if (isFooterWord || isNumericTotalRow || isAbsent) {
          lastStaff = ''
          return
        }

        if (rawStaff) {
          lastStaff = rawStaff
        }

        // A valid job has an address OR valid start and end times OR charges > 0
        const hasJobInfo = Boolean(rawAddress) || cleanNum(rawCharges) > 0 || (Boolean(rawStart) && Boolean(rawEnd) && String(rawStart).trim() !== '—' && String(rawEnd).trim() !== '—')

        if (hasJobInfo && lastStaff) {
          const sTime = formatTimeOnly(rawStart)
          const eTime = formatTimeOnly(rawEnd)

          // Header variations: "Duty Hrs", "Duty H", "Duty Hours", "Hrs"
          let dutyH = cleanNum(nm('Duty Hrs', 'Duty H', 'Duty Hours', 'Duty', 'duty_hours', 'dutyhrs', 'Hrs'))
          if (dutyH <= 0 && sTime !== '—' && eTime !== '—') {
            dutyH = calcHours(sTime, eTime)
          }
          dutyH = Math.round(dutyH * 10) / 10

          const otVal = Math.round(cleanNum(nm('OT', 'ot_hours', 'overtime', 'OT Hours', 'OTHrs')) * 10) / 10
          const isOt = String(nm('OT', 'is_overtime')).toLowerCase() === 'yes' || otVal > 0

          let mat = String(nm('Material', 'material', 'Mat') || 'No').trim()
          if (mat.toUpperCase() === 'YES') mat = 'Yes'
          else if (mat.toUpperCase() === 'NO') mat = 'No'

          const serviceVal = String(nm('Service', 'service_type', 'service') || '').trim()
          const locationVal = String(nm('Location', 'area', 'Area', 'location') || '').trim()
          const modeVal = (String(nm('Mode', 'Mod', 'payment_mode') || 'Cash').trim()) as PaymentMode

          addDailyJob({
            date:         targetDate, // FILE KA NAME HI DATE HOGI! Strict and authoritative date source
            staff_name:   lastStaff,
            start_time:   sTime,
            end_time:     eTime,
            duty_hours:   dutyH,
            ot_hours:     otVal,
            address:      rawAddress,
            area:         locationVal,
            material:     mat as MaterialType,
            charges:      cleanNum(rawCharges),
            received:     cleanNum(rawReceived),
            payment_mode: modeVal,
            is_overtime:  isOt,
            remarks:      String(nm('Remarks', 'remarks') || '').trim(),
            service:      serviceVal,
          })
          importedJobCount++
        }

        // Check if row has an expense in side columns (e.g. 'Expenses' column)
        let expName = ''
        let expAmount = 0
        for (const [k, v] of Object.entries(r)) {
          if (k.toLowerCase().includes('expense') && typeof v === 'string' && v.trim()) {
            expName = v.trim()
          }
        }
        if (expName && expName.toLowerCase() !== 'items') {
          const keys = Object.keys(r)
          const idx = keys.findIndex(k => k.toLowerCase().includes('expense'))
          if (idx !== -1 && idx + 1 < keys.length) {
            const nextVal = r[keys[idx + 1]]
            if (typeof nextVal === 'number' && nextVal > 0) expAmount = nextVal
          }
          if (expAmount > 0 && !expName.toLowerCase().includes('total')) {
            let cat = 'Other'
            const l = expName.toLowerCase()
            if (l.includes('fuel') || l.includes('petrol')) cat = 'Fuel'
            else if (l.includes('parking')) cat = 'Parking'
            else if (l.includes('toll') || l.includes('salik')) cat = 'Toll'
            else if (l.includes('oil') || l.includes('maintenance') || l.includes('labor')) cat = 'Vehicle maintenance'
            else if (l.includes('supplies') || l.includes('material')) cat = 'Supplies'

            addDailyExpense({
              date:     targetDate,
              name:     expName,
              category: cat,
              amount:   expAmount,
            })
            importedExpCount++
          }
        }
      })

      // Also check if workbook has a dedicated 'Expenses' sheet
      if (wb.SheetNames.includes('Expenses')) {
        const expSheetRows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets['Expenses'])
        expSheetRows.forEach(er => {
          const nmE = (...keys: string[]) => {
            for (const k of keys) {
              const normalized = k.toLowerCase().replace(/[^a-z0-9]/g, '')
              for (const [key, val] of Object.entries(er)) {
                if (String(key).toLowerCase().replace(/[^a-z0-9]/g, '') === normalized && val !== undefined && val !== null && val !== '') return val
              }
            }
            return ''
          }
          const eName = String(nmE('name', 'description', 'expense', 'item') || '').trim()
          const eAmt = cleanNum(nmE('amount', 'cost', 'aed'))
          if (eName && eAmt > 0 && !eName.toLowerCase().includes('total')) {
            addDailyExpense({
              date:     targetDate,
              name:     eName,
              category: String(nmE('category', 'cat') || 'Other').trim(),
              amount:   eAmt,
            })
            importedExpCount++
          }
        })
      }

      // Extract Pending, Pending Received, and Advance from side columns (e.g. Q through X)
      let importedPendingCount = 0
      let importedPendingRcvdCount = 0
      let importedAdvanceCount = 0

      const currentSheet = wb.Sheets[sheetName]
      if (currentSheet) {
        const range = XLSX.utils.decode_range(currentSheet['!ref'] || 'A1:AS105')
        const getCell = (r: number, c: number) => {
          const cell = currentSheet[XLSX.utils.encode_cell({ r, c })]
          return cell ? cell.v : undefined
        }

        let pCol = -1, prCol = -1, advCol = -1
        let dataStartRow = 2

        for (let r = 0; r <= 3; r++) {
          for (let c = 10; c <= range.e.c; c++) {
            const val = String(getCell(r, c) || '').toLowerCase().trim()
            if (val === 'pending' && pCol === -1) {
              pCol = c
              dataStartRow = Math.max(dataStartRow, r + 2)
            }
            if ((val.includes('pending rcvd') || val.includes('pending received')) && prCol === -1) {
              prCol = c
              dataStartRow = Math.max(dataStartRow, r + 2)
            }
            if (val === 'advance' && advCol === -1) {
              advCol = c
              dataStartRow = Math.max(dataStartRow, r + 2)
            }
          }
        }

        if (pCol === -1 && range.e.c >= 17) pCol = 16
        if (prCol === -1 && range.e.c >= 20) prCol = 18
        if (advCol === -1 && range.e.c >= 23) advCol = 21

        const newPendingItems: DailyPendingItem[] = []
        const newPendingRcvdItems: DailyPendingReceivedItem[] = []
        const newAdvanceItems: DailyAdvanceItem[] = []

        for (let r = dataStartRow; r <= Math.min(range.e.r, 60); r++) {
          const vP = pCol >= 0 ? String(getCell(r, pCol) || '').trim() : ''
          const vPR = prCol >= 0 ? String(getCell(r, prCol) || '').trim() : ''
          const vAdv = advCol >= 0 ? String(getCell(r, advCol) || '').trim() : ''

          if (pCol >= 0 && vP && !vP.toLowerCase().includes('total')) {
            const amt = parseFloat(String(getCell(r, pCol + 1) || '0')) || 0
            newPendingItems.push({
              id: `${Date.now()}-p-${r}`,
              date: targetDate,
              client: vP,
              amount: amt,
            })
          }

          if (prCol >= 0 && vPR && !vPR.toLowerCase().includes('total')) {
            const cash = parseFloat(String(getCell(r, prCol + 1) || '0')) || 0
            const online = parseFloat(String(getCell(r, prCol + 2) || '0')) || 0
            newPendingRcvdItems.push({
              id: `${Date.now()}-pr-${r}`,
              date: targetDate,
              client: vPR,
              cash,
              online,
            })
          }

          if (advCol >= 0 && vAdv && !vAdv.toLowerCase().includes('total')) {
            const rcvd = parseFloat(String(getCell(r, advCol + 1) || '0')) || 0
            const adv = parseFloat(String(getCell(r, advCol + 2) || '0')) || 0
            newAdvanceItems.push({
              id: `${Date.now()}-adv-${r}`,
              date: targetDate,
              client: vAdv,
              received: rcvd,
              advance: adv,
            })
          }
        }

        // Fallback: If side table didn't have Pending Rcvd, check footer summary for 'Pending Rcvd cash'
        if (newPendingRcvdItems.length === 0) {
          for (let r = Math.max(0, range.e.r - 20); r <= range.e.r; r++) {
            for (let c = 0; c <= Math.min(range.e.c, 10); c++) {
              const val = String(getCell(r, c) || '').toLowerCase().trim()
              if (val.includes('pending rcvd') || val.includes('pending received')) {
                for (let offset = 1; offset <= 3; offset++) {
                  const numVal = parseFloat(String(getCell(r, c + offset) || '0'))
                  if (numVal > 0 && numVal < 100000) {
                    newPendingRcvdItems.push({
                      id: `${Date.now()}-pr-footer-${r}`,
                      date: targetDate,
                      client: 'Pending Rcvd cash',
                      cash: numVal,
                      online: 0,
                    })
                    break
                  }
                }
              }
            }
          }
        }

        if (newPendingItems.length > 0) {
          importedPendingCount = newPendingItems.length
          setPendingList(prev => [...prev.filter(x => x.date !== targetDate), ...newPendingItems])
        }
        if (newPendingRcvdItems.length > 0) {
          importedPendingRcvdCount = newPendingRcvdItems.length
          setPendingRcvdList(prev => [...prev.filter(x => x.date !== targetDate), ...newPendingRcvdItems])
        }
        if (newAdvanceItems.length > 0) {
          importedAdvanceCount = newAdvanceItems.length
          setAdvanceList(prev => [...prev.filter(x => x.date !== targetDate), ...newAdvanceItems])
        }
      }

      setImportNotice({
        jobs: importedJobCount,
        expenses: importedExpCount,
        pendingCount: importedPendingCount,
        pendingRcvdCount: importedPendingRcvdCount,
        advanceCount: importedAdvanceCount,
        date: targetDate,
        fileName: file.name,
      })
    } catch (err: any) {
      alert('Failed to import Excel: ' + (err.message || String(err)))
    } finally {
      setImporting(false)
    }
  }

  const activeEmps = employees.filter(e => e.status === 'active' || e.status === 'engaged_in_project')

  return (
    <div className="space-y-6 pb-10">

      {/* ── Import Notice Banner ── */}
      {importNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl px-5 py-3.5 flex items-center justify-between text-[13px] shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-emerald-900">
                Excel Sheet <code className="bg-emerald-100/80 text-emerald-900 px-1.5 py-0.5 rounded text-[12px] font-mono">{importNotice.fileName || 'Uploaded Sheet'}</code> Imported Successfully!
              </p>
              <p className="text-[12px] text-emerald-700 mt-0.5">
                Target Date (derived from file name): <strong className="text-emerald-950 font-bold">{fmtDate(importNotice.date)} ({importNotice.date})</strong> · Added <strong>{importNotice.jobs} jobs</strong>, <strong>{importNotice.expenses} expenses</strong>
                {importNotice.pendingRcvdCount ? <>, <strong>{importNotice.pendingRcvdCount} pending received</strong></> : null}
                {importNotice.advanceCount ? <>, <strong>{importNotice.advanceCount} advance</strong></> : null}
                {importNotice.pendingCount ? <>, <strong>{importNotice.pendingCount} pending</strong></> : null}.
              </p>
            </div>
          </div>
          <button
            onClick={() => setImportNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-[14px] px-2 py-0.5 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Delete Success Banner ── */}
      {deleteSuccessNotice && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-5 py-3.5 flex items-center justify-between text-[13px] shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <Trash2 size={18} className="text-amber-600 flex-shrink-0" />
            <span>
              All jobs and expenses for <strong>{deleteSuccessNotice}</strong> have been deleted successfully.
            </span>
          </div>
          <button
            onClick={() => setDeleteSuccessNotice(null)}
            className="text-amber-700 hover:text-amber-900 font-bold text-[14px] px-2 py-0.5 rounded-lg hover:bg-amber-100 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-[20px] font-black text-[#111827] tracking-tight">Daily Job Sheet</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">Admin view · All data saved to Supabase</p>
          </div>

          {/* Date navigation & Date Range Picker */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={prevDay}
              className="p-2 rounded-xl border border-[#E4E8EC] hover:bg-slate-50 transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft size={16} className="text-slate-600" />
            </button>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={e => {
                  setDateRangePreset('today')
                  setSelectedDate(e.target.value)
                }}
                className={`text-[13px] font-semibold px-4 py-2 border rounded-xl bg-slate-50 focus:outline-none focus:border-emerald-400 cursor-pointer transition-colors ${
                  isDateRange ? 'border-indigo-300 text-indigo-900 bg-indigo-50/40' : 'border-[#E4E8EC] text-[#111827]'
                }`}
                title={isDateRange ? `Anchor Date (Range ends: ${selectedDate})` : 'Select Date'}
              />
            </div>
            <button
              onClick={nextDay}
              className="p-2 rounded-xl border border-[#E4E8EC] hover:bg-slate-50 transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight size={16} className="text-slate-600" />
            </button>

            {/* Date Range Picker Dropdown (replacing "Today" button) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRangeMenu(p => !p)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-bold transition-all cursor-pointer ${
                  isDateRange
                    ? 'border-indigo-400 bg-indigo-600 text-white shadow-xs hover:bg-indigo-700'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <Calendar size={13} className={isDateRange ? 'text-indigo-200' : 'text-emerald-700'} />
                <span>
                  {dateRangePreset === 'today'
                    ? 'Today'
                    : dateRangePreset === '7days'
                      ? 'Last 7 Days'
                      : dateRangePreset === '14days'
                        ? 'Last 14 Days'
                        : dateRangePreset === '28days'
                          ? 'Last 28 Days'
                          : dateRangePreset === '3months'
                            ? 'Last 3 Months'
                            : dateRangePreset === '6months'
                              ? 'Last 6 Months'
                              : dateRangePreset === '1year'
                                ? 'One Year'
                                : 'Two Years'}
                </span>
                <ChevronDown size={13} className={isDateRange ? 'text-indigo-200 ml-0.5' : 'text-emerald-600 ml-0.5'} />
              </button>

              {showRangeMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowRangeMenu(false)} />
                  <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-2xl border border-[#E4E8EC] shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-[460px] overflow-y-auto">
                    <div className="px-3 pb-2 mb-1 border-b border-slate-100">
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Date Presets</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => selectPreset('today')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === 'today'
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === 'today' ? 'bg-emerald-500' : 'bg-transparent'}`} />
                        <span>Today</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">Single Day</span>
                    </button>

                    <div className="px-3 pt-2 pb-1 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recent Days</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => selectPreset('7days')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '7days'
                          ? 'bg-indigo-50 text-indigo-900 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '7days' ? 'bg-indigo-600' : 'bg-transparent'}`} />
                        <span>Last 7 Days</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">
                        {fmtDate(getRangeBounds('7days').start).replace(/\s\d{4}$/, '')} – {fmtDate(getRangeBounds('7days').end).replace(/\s\d{4}$/, '')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('14days')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '14days'
                          ? 'bg-indigo-50 text-indigo-900 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '14days' ? 'bg-indigo-600' : 'bg-transparent'}`} />
                        <span>Last 14 Days</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">
                        {fmtDate(getRangeBounds('14days').start).replace(/\s\d{4}$/, '')} – {fmtDate(getRangeBounds('14days').end).replace(/\s\d{4}$/, '')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('28days')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '28days'
                          ? 'bg-indigo-50 text-indigo-900 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '28days' ? 'bg-indigo-600' : 'bg-transparent'}`} />
                        <span>Last 28 Days</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">
                        {fmtDate(getRangeBounds('28days').start).replace(/\s\d{4}$/, '')} – {fmtDate(getRangeBounds('28days').end).replace(/\s\d{4}$/, '')}
                      </span>
                    </button>

                    <div className="px-3 pt-2 pb-1 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Extended History</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => selectPreset('3months')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '3months'
                          ? 'bg-indigo-50 text-indigo-900 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '3months' ? 'bg-indigo-600' : 'bg-transparent'}`} />
                        <span>Last 3 Months</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">
                        {fmtDate(getRangeBounds('3months').start)} – {fmtDate(getRangeBounds('3months').end)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('6months')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '6months'
                          ? 'bg-indigo-50 text-indigo-900 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '6months' ? 'bg-indigo-600' : 'bg-transparent'}`} />
                        <span>Last 6 Months</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">
                        {fmtDate(getRangeBounds('6months').start)} – {fmtDate(getRangeBounds('6months').end)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('1year')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '1year'
                          ? 'bg-indigo-50 text-indigo-900 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '1year' ? 'bg-indigo-600' : 'bg-transparent'}`} />
                        <span>One Year</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">
                        {fmtDate(getRangeBounds('1year').start)} – {fmtDate(getRangeBounds('1year').end)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('2years')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '2years'
                          ? 'bg-indigo-50 text-indigo-900 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '2years' ? 'bg-indigo-600' : 'bg-transparent'}`} />
                        <span>Two Years</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">
                        {fmtDate(getRangeBounds('2years').start)} – {fmtDate(getRangeBounds('2years').end)}
                      </span>
                    </button>

                    {isDateRange && (
                      <div className="pt-2 mt-1 border-t border-slate-100 px-3">
                        <button
                          type="button"
                          onClick={() => selectPreset('today')}
                          className="w-full py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <X size={12} /> Reset to Today View
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {isDateRange && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11.5px] font-bold">
                <span>{fmtDate(effectiveStartDate)} – {fmtDate(effectiveEndDate)}</span>
                <button
                  type="button"
                  onClick={() => selectPreset('today')}
                  className="hover:text-red-600 transition-colors cursor-pointer ml-1"
                  title="Clear range"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          {/* Actions (Clean Header: Import, Add Job, and 3-dot Menu) */}
          <div className="flex items-center gap-2">
            <input
              ref={importRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0]
                if (file) await importJobs(file)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => importRef.current?.click()}
              disabled={importing}
              title="Import Excel: Sheet ki date file name say automatically set hoti hai (e.g. 2026-10-23.xlsx ya 23 Oct.xlsx)"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E4E8EC] text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <Upload size={13} /> {importing ? 'Importing…' : 'Import'}
            </button>

            <Button size="sm" onClick={() => setShowAddJob(true)}>
              <Plus size={13} className="mr-1" /> Add Job
            </Button>

            {/* Three-dot dropdown menu containing Print, Export, Template, Delete */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHeaderMenu(p => !p)}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  showHeaderMenu
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-xs'
                    : 'border-[#E4E8EC] text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="More actions (Print, Export, Template, Delete)"
              >
                <MoreVertical size={16} />
              </button>

              {showHeaderMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowHeaderMenu(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-2xl border border-[#E4E8EC] shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => { setShowHeaderMenu(false); printSheet() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                    >
                      <Printer size={15} className="text-slate-500" />
                      <span>Print Sheet</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowHeaderMenu(false); exportExcel() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                    >
                      <Download size={15} className="text-slate-500" />
                      <span>Export to Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowHeaderMenu(false); downloadSampleTemplate() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                    >
                      <FileSpreadsheet size={15} className="text-emerald-600" />
                      <span>Download Template</span>
                    </button>
                    {gdriveConfigured && (
                      <button
                        type="button"
                        disabled={driveStatus === 'connecting' || driveStatus === 'uploading'}
                        onClick={() => { setShowHeaderMenu(false); backupToDrive() }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer text-left disabled:opacity-50"
                      >
                        <CloudUpload size={15} className="text-blue-600" />
                        <span>Google Drive Backup</span>
                      </button>
                    )}
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      disabled={todayJobs.length === 0 && todayExpenses.length === 0}
                      onClick={() => { setShowHeaderMenu(false); setShowDeleteConfirm(true) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={15} className="text-red-500" />
                      <span>Delete Day's Data</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Drive feedback */}
        {driveStatus === 'done' && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <p className="text-[12px] text-emerald-700 font-semibold">Uploaded to Google Drive</p>
            <a href={driveLink} target="_blank" rel="noopener noreferrer" className="text-[12px] text-emerald-600 underline font-medium">Open file</a>
          </div>
        )}
        {driveStatus === 'error' && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <p className="text-[12px] text-red-700">{driveError}</p>
          </div>
        )}
      </div>

      {/* ── KPI Cards (Structured 2-Row Modern Executive Layout - Clickable) ── */}
      <div className="space-y-3 sm:space-y-3.5">
        {/* Row 1: Primary Financial & Net Revenue Flow (Charges card first!) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
          {[
            {
              id: 'charges',
              label: 'Charges',
              sublabel: 'Total billed amount',
              value: `AED ${totalCharges.toLocaleString()}`,
              color: 'text-indigo-700',
              bg: 'bg-indigo-50/70 hover:bg-indigo-100/70',
              border: 'border-indigo-200/80',
              icon: Receipt,
              iconBg: 'bg-indigo-100 text-indigo-700',
              tooltip: 'Click to view Jobs Table & Charges column',
              onClick: () => {
                setPaymentFilter('ALL')
                scrollToElement('jobs-table-section')
              },
            },
            {
              id: 'collection',
              label: isDateRange ? 'Gross Collected' : 'Today Collection',
              sublabel: isDateRange ? 'Direct collections' : 'Cash & direct today',
              value: `AED ${grossCollected.toLocaleString()}`,
              color: 'text-emerald-700',
              bg: 'bg-emerald-50/70 hover:bg-emerald-100/70',
              border: 'border-emerald-200/80',
              icon: Wallet,
              iconBg: 'bg-emerald-100 text-emerald-700',
              tooltip: 'Click to view Driver & Staff Collections Summary',
              onClick: () => {
                scrollToElement('driver-summary-widget')
              },
            },
            {
              id: 'pending-rcvd',
              label: 'Pending Cash Received',
              sublabel: 'Recovered cash dues',
              value: `AED ${pendingCashRcvdForNet.toLocaleString()}`,
              color: 'text-teal-700',
              bg: 'bg-teal-50/70 hover:bg-teal-100/70',
              border: 'border-teal-200/80',
              icon: CheckCircle,
              iconBg: 'bg-teal-100 text-teal-700',
              tooltip: 'Click to view Pending Received Reconciliation widget',
              onClick: () => {
                scrollToElement('pending-received-widget')
              },
            },
            {
              id: 'expenses',
              label: 'Expenses',
              sublabel: 'Fuel, supplies & others',
              value: `AED ${totalExpenses.toLocaleString()}`,
              color: 'text-amber-700',
              bg: 'bg-amber-50/70 hover:bg-amber-100/70',
              border: 'border-amber-200/80',
              icon: TrendingUp,
              iconBg: 'bg-amber-100 text-amber-700',
              tooltip: 'Click to view Expenses Log widget',
              onClick: () => {
                scrollToElement('expenses-log-widget')
              },
            },
            {
              id: 'net-total',
              label: 'Net Total',
              sublabel: 'Net bottom line in hand',
              value: `AED ${netTotal.toLocaleString()}`,
              isHero: true,
              color: 'text-white',
              bg: netTotal >= 0
                ? 'bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 shadow-md shadow-emerald-600/20 text-white hover:brightness-105'
                : 'bg-gradient-to-br from-red-600 to-rose-700 shadow-md shadow-red-600/20 text-white hover:brightness-105',
              border: netTotal >= 0 ? 'border-emerald-500' : 'border-red-500',
              icon: DollarSign,
              iconBg: 'bg-white/20 text-white',
              tooltip: 'Click to view Financial Breakdown & Summary',
              onClick: () => {
                scrollToElement('bottom-panels-section')
              },
            },
          ].map(c => {
            const Icon = c.icon
            return (
              <button
                key={c.id}
                type="button"
                onClick={c.onClick}
                title={c.tooltip}
                className={`group relative rounded-2xl border ${c.border} ${c.bg} p-3.5 sm:p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md active:scale-[0.98] cursor-pointer flex flex-col justify-between text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1`}
              >
                <div className="flex items-center justify-between gap-2 mb-2 w-full">
                  <span
                    className={`text-[11px] font-bold tracking-tight uppercase truncate ${
                      c.isHero ? 'text-emerald-100' : 'text-slate-500'
                    }`}
                  >
                    {c.label}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 ${c.iconBg}`}
                  >
                    <Icon size={14} />
                  </div>
                </div>

                <div className="w-full">
                  <p className={`text-[19px] sm:text-[21px] font-black tracking-tight leading-tight truncate ${c.color}`}>
                    {c.value}
                  </p>
                  <div className="flex items-center justify-between gap-1 mt-1">
                    <p
                      className={`text-[10.5px] font-medium truncate ${
                        c.isHero ? 'text-emerald-200/90' : 'text-slate-400'
                      }`}
                    >
                      {c.sublabel}
                    </p>
                    <span
                      className={`text-[9.5px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ${
                        c.isHero ? 'text-emerald-100' : 'text-slate-400'
                      }`}
                    >
                      View ↓
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Row 2: Breakdowns & Operational Workload (5 Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
          {[
            {
              id: 'pending',
              label: 'Pending',
              sublabel: 'Uncollected balances',
              value: `AED ${pendingTotal.toLocaleString()}`,
              color: 'text-rose-700',
              bg: 'bg-rose-50/70 hover:bg-rose-100/70',
              border: 'border-rose-200/80',
              icon: AlertCircle,
              iconBg: 'bg-rose-100 text-rose-700',
              tooltip: 'Click to view Today Pending Records widget',
              onClick: () => {
                scrollToElement('today-pending-widget')
              },
            },
            {
              id: 'online',
              label: 'Online',
              sublabel: 'Card & bank transfers',
              value: `AED ${onlineTotal.toLocaleString()}`,
              color: 'text-sky-700',
              bg: 'bg-sky-50/70 hover:bg-sky-100/70',
              border: 'border-sky-200/80',
              icon: CreditCard,
              iconBg: 'bg-sky-100 text-sky-700',
              tooltip: 'Click to filter Jobs Table by Online Mode',
              onClick: () => {
                setPaymentFilter('Online')
                scrollToElement('jobs-table-section')
              },
            },
            {
              id: 'ot',
              label: 'OT (Overtime)',
              sublabel: 'Total approved OT',
              value: `${totalOTHours}h`,
              color: 'text-orange-700',
              bg: 'bg-orange-50/70 hover:bg-orange-100/70',
              border: 'border-orange-200/80',
              icon: Clock,
              iconBg: 'bg-orange-100 text-orange-700',
              tooltip: 'Click to view Overtime in Jobs Table',
              onClick: () => {
                if (!visibleColumns.ot_hours) {
                  setVisibleColumns(p => ({ ...p, ot_hours: true }))
                }
                scrollToElement('jobs-table-section')
              },
            },
            {
              id: 'staff',
              label: isDateRange ? 'Active Staff' : 'Staff on Duty',
              sublabel: isDateRange ? 'Cleaners deployed' : 'Present on shift',
              value: String(staffOnDuty),
              color: 'text-purple-700',
              bg: 'bg-purple-50/70 hover:bg-purple-100/70',
              border: 'border-purple-200/80',
              icon: Users,
              iconBg: 'bg-purple-100 text-purple-700',
              tooltip: 'Click to view Driver / Staff Summary widget',
              onClick: () => {
                scrollToElement('driver-summary-widget')
              },
            },
            {
              id: 'jobs',
              label: isDateRange ? 'Total Jobs' : 'Jobs Today',
              sublabel: isDateRange ? 'Total assignments' : 'Bookings scheduled',
              value: String(jobsCount),
              color: 'text-slate-800',
              bg: 'bg-slate-100/80 hover:bg-slate-200/80',
              border: 'border-slate-200',
              icon: Briefcase,
              iconBg: 'bg-slate-200 text-slate-700',
              tooltip: 'Click to view All Jobs in Table',
              onClick: () => {
                setPaymentFilter('ALL')
                scrollToElement('jobs-table-section')
              },
            },
          ].map(c => {
            const Icon = c.icon
            return (
              <button
                key={c.id}
                type="button"
                onClick={c.onClick}
                title={c.tooltip}
                className={`group relative rounded-2xl border ${c.border} ${c.bg} p-3.5 sm:p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md active:scale-[0.98] cursor-pointer flex flex-col justify-between text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1`}
              >
                <div className="flex items-center justify-between gap-2 mb-2 w-full">
                  <span className="text-[11px] font-bold tracking-tight uppercase text-slate-500 truncate">
                    {c.label}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 ${c.iconBg}`}
                  >
                    <Icon size={14} />
                  </div>
                </div>

                <div className="w-full">
                  <p className={`text-[19px] sm:text-[21px] font-black tracking-tight leading-tight truncate ${c.color}`}>
                    {c.value}
                  </p>
                  <div className="flex items-center justify-between gap-1 mt-1">
                    <p className="text-[10.5px] font-medium text-slate-400 mt-1 truncate">
                      {c.sublabel}
                    </p>
                    <span className="text-[9.5px] font-semibold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      View ↓
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Jobs Table ── */}
      <div id="jobs-table-section" className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden scroll-mt-6">
        <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-[#111827]">
              Jobs —{' '}
              <span className="text-slate-400 font-normal">
                {isDateRange
                  ? `${fmtDate(effectiveStartDate)} – ${fmtDate(effectiveEndDate)} (${
                      dateRangePreset === '7days'
                        ? 'Last 7 Days'
                        : dateRangePreset === '14days'
                          ? 'Last 14 Days'
                          : dateRangePreset === '28days'
                            ? 'Last 28 Days'
                            : dateRangePreset === '3months'
                              ? 'Last 3 Months'
                              : dateRangePreset === '6months'
                                ? 'Last 6 Months'
                                : dateRangePreset === '1year'
                                  ? 'One Year'
                                  : 'Two Years'
                    })`
                  : fmtDate(selectedDate)}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>
                {filteredActiveJobRows.length} active {filteredActiveJobRows.length === 1 ? 'job' : 'jobs'} · {filteredNilRows.length} absentees / nil
              </span>
              {paymentFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10.5px]">
                  Mode: {paymentFilter}
                  <button
                    onClick={() => setPaymentFilter('ALL')}
                    className="hover:text-red-600 transition-colors cursor-pointer text-[10px] font-black"
                    title="Clear mode filter"
                  >
                    ✕
                  </button>
                </span>
              )}
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10.5px]">
                  Search: "{searchQuery}"
                  <button
                    onClick={() => setSearchQuery('')}
                    className="hover:text-red-600 transition-colors cursor-pointer text-[10px] font-black"
                    title="Clear search"
                  >
                    ✕
                  </button>
                </span>
              )}
              {selectedLetter !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10.5px]">
                  Letter: "{selectedLetter}"
                  <button
                    onClick={() => setSelectedLetter('ALL')}
                    className="hover:text-red-600 transition-colors cursor-pointer text-[11px] font-black"
                    title="Reset letter filter"
                  >
                    ✕
                  </button>
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Expandable Inline Search Bar */}
            <div
              ref={searchContainerRef}
              className={`relative flex items-center transition-all duration-300 ease-in-out h-8.5 rounded-xl border overflow-hidden ${
                isSearchExpanded || searchQuery
                  ? 'w-52 sm:w-64 md:w-72 bg-white border-emerald-500 ring-2 ring-emerald-500/10 shadow-xs'
                  : 'w-9 bg-slate-50 border-[#E4E8EC] hover:bg-slate-100 hover:border-slate-300 cursor-pointer'
              }`}
              onClick={() => {
                if (!isSearchExpanded) {
                  setIsSearchExpanded(true)
                  setTimeout(() => searchInputRef.current?.focus(), 50)
                }
              }}
              title={!isSearchExpanded && !searchQuery ? "Search jobs, cleaner, address, service..." : undefined}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (!isSearchExpanded) {
                    setIsSearchExpanded(true)
                    setTimeout(() => searchInputRef.current?.focus(), 50)
                  } else if (!searchQuery) {
                    setIsSearchExpanded(false)
                  }
                }}
                className="h-full px-2.5 flex items-center justify-center shrink-0 cursor-pointer text-slate-500 hover:text-emerald-600 transition-colors"
                aria-label="Search"
              >
                <Search
                  size={14}
                  className={isSearchExpanded || searchQuery ? 'text-emerald-600' : 'text-slate-500'}
                />
              </button>

              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchExpanded(true)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    if (searchQuery) setSearchQuery('')
                    else setIsSearchExpanded(false)
                  }
                }}
                placeholder="Search staff, address, mode..."
                className={`w-full h-full text-[12px] bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none transition-opacity duration-200 ${
                  isSearchExpanded || searchQuery ? 'opacity-100 pr-7' : 'opacity-0 pointer-events-none w-0'
                }`}
              />

              {(isSearchExpanded || searchQuery) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSearchQuery('')
                    setIsSearchExpanded(false)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Clear and close search"
                  aria-label="Clear and close search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Payment Category Filters (Monthly, Cash, Online, Pending) */}
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-[#E4E8EC] text-[11.5px] font-bold">
              {(['ALL', 'Monthly', 'Cash', 'Online', 'Pending'] as const).map(mode => {
                const isSelected = paymentFilter === mode
                const count = mode === 'ALL'
                  ? todayJobs.length
                  : mode === 'Monthly'
                    ? todayJobs.filter(j => j.payment_mode === 'Monthly').length
                    : mode === 'Cash'
                      ? todayJobs.filter(j => j.payment_mode === 'Cash').length
                      : mode === 'Online'
                        ? todayJobs.filter(j => j.payment_mode === 'Online').length
                        : todayJobs.filter(j => j.payment_mode === 'Pending' || cleanNum(j.charges) > cleanNum(j.received)).length

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentFilter(mode)}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? mode === 'Monthly'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : mode === 'Cash'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : mode === 'Online'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : mode === 'Pending'
                                ? 'bg-red-600 text-white shadow-xs'
                                : 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <span>{mode === 'ALL' ? 'All' : mode}</span>
                    <span className={`text-[10px] px-1 rounded-full ${
                      isSelected ? 'bg-black/25 text-white' : 'bg-slate-200/90 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
            {/* Customize Columns Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowColMenu(p => !p)}
                className="flex items-center justify-center w-9 h-8.5 rounded-xl border border-[#E4E8EC] bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer relative"
                title="Customize Columns (Show / Hide)"
                aria-label="Customize Columns"
              >
                <Eye size={15} className="text-slate-600" />
                {Object.values(visibleColumns).filter(Boolean).length < ALL_COLUMNS.length && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" title="Some columns are hidden" />
                )}
              </button>

              {showColMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowColMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-[#E4E8EC] rounded-2xl shadow-2xl z-50 p-3.5 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E4E8EC]">
                      <span className="text-[12px] font-bold text-slate-800">Customize Columns</span>
                      <button
                        onClick={resetColumns}
                        className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                      >
                        Reset All
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                      {ALL_COLUMNS.map(col => (
                        <label
                          key={col.id}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-[12px] transition-colors select-none"
                        >
                          <span className={`font-medium ${visibleColumns[col.id] ? 'text-slate-800' : 'text-slate-400'}`}>
                            {col.label}
                          </span>
                          <input
                            type="checkbox"
                            checked={!!visibleColumns[col.id]}
                            onChange={() => toggleColumn(col.id)}
                            className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-[#E4E8EC] text-[10.5px] text-slate-400 text-center">
                      Auto-saved to your browser
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* View All / Page size selector */}
            <div className="flex items-center">
              <select
                value={pageSize}
                onChange={e => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="text-[12px] font-semibold text-slate-700 bg-slate-50 border border-[#E4E8EC] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-400 cursor-pointer"
                title="Rows Per Page"
              >
                <option value={10}>10 Rows Per Page</option>
                <option value={20}>20 Rows Per Page</option>
                <option value={50}>50 Rows Per Page</option>
                <option value="all">View All ({totalRows} entries)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Table Container with Vertical A-Z Rail (Matching red line in user image) ── */}
        <div className="flex">
          {/* Vertical A-Z Rail */}
          <div className="w-[34px] sm:w-[38px] flex-shrink-0 bg-[#f8fafc] border-r border-[#E4E8EC] py-2 flex flex-col items-center gap-0.5 select-none text-[10px] max-h-[calc(100vh-210px)] overflow-y-auto">
            <button
              onClick={() => setSelectedLetter('ALL')}
              title="Show All Cleaners"
              className={`w-7 h-5 rounded text-[8.5px] font-black uppercase transition-all mb-1 ${
                selectedLetter === 'ALL'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              ALL
            </button>
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(char => {
              const hasData = availableLetters.has(char)
              const count = letterCounts[char] || 0
              const isSelected = selectedLetter === char
              return (
                <button
                  key={char}
                  onClick={() => setSelectedLetter(isSelected ? 'ALL' : char)}
                  title={hasData ? `${char} — ${count} cleaner${count === 1 ? '' : 's'}` : `No cleaners starting with ${char}`}
                  className={`w-6 h-[19px] rounded flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-emerald-600 text-white font-black shadow-sm scale-110'
                      : hasData
                        ? 'text-slate-900 font-extrabold hover:bg-emerald-100 hover:text-emerald-700 cursor-pointer'
                        : 'text-slate-300 font-normal hover:bg-slate-100/60 cursor-pointer'
                  }`}
                >
                  {char}
                </button>
              )
            })}
          </div>

          {/* Main Table Area */}
          <div className="flex-1 overflow-auto max-h-[calc(100vh-210px)] min-w-0 relative">
            <table
              className="w-full text-[12px] border-collapse relative"
              style={{ minWidth: Math.max(500, Object.values(visibleColumns).filter(Boolean).length * 80) }}
            >
              <thead className="sticky top-0 z-30 shadow-[0_2px_4px_rgba(0,0,0,0.06)] bg-slate-100">
                <tr className="bg-slate-100/95 backdrop-blur-xs border-b border-[#E4E8EC]">
                  {visibleColumns.staff && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Staff</th>}
                  {visibleColumns.start_time && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Start</th>}
                  {visibleColumns.end_time && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">End</th>}
                  {visibleColumns.address && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Address</th>}
                  {visibleColumns.area && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Location</th>}
                  {visibleColumns.charges && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Charges</th>}
                  {visibleColumns.received && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Received</th>}
                  {visibleColumns.pending && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Pending</th>}
                  {visibleColumns.duty_hours && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Duty Hrs</th>}
                  {visibleColumns.ot_hours && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">OT Hrs</th>}
                  {visibleColumns.material && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Material</th>}
                  {visibleColumns.payment_mode && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Mode</th>}
                  {visibleColumns.remarks && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Remarks</th>}
                  {visibleColumns.service && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Service</th>}
                  {visibleColumns.actions && <th className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E8EC]/70">
                {displayedRows.map((row, idx) => {
                  if (row.isNil) {
                    return (
                      <tr key={row.id} className="bg-red-100/90 hover:bg-red-200/90 transition-colors border-l-[5px] border-l-red-600 border-t border-t-red-200">
                        {visibleColumns.staff && (
                          <td className="px-3 py-3 font-semibold whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black bg-red-600 text-white shadow-xs">
                                {row.staff_name.trim()[0]?.toUpperCase()}
                              </span>
                              <span className="text-red-950 font-bold">{row.staff_name}</span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.start_time && <td className="px-3 py-3 text-red-400 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.end_time && <td className="px-3 py-3 text-red-400 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.address && (
                          <td className="px-3 py-3 text-red-700 italic font-semibold max-w-[160px] truncate">
                            Absent (No jobs assigned)
                          </td>
                        )}
                        {visibleColumns.area && <td className="px-3 py-3 text-red-400 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.charges && <td className="px-3 py-3 text-red-400 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.received && <td className="px-3 py-3 text-red-400 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.pending && <td className="px-3 py-3 text-red-400 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.duty_hours && <td className="px-3 py-3 text-red-400 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.ot_hours && <td className="px-3 py-3 text-red-300 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.material && <td className="px-3 py-3 text-red-400 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.payment_mode && (
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-red-600 text-white border border-red-700 shadow-xs uppercase tracking-wider">
                              Absent
                            </span>
                          </td>
                        )}
                        {visibleColumns.remarks && <td className="px-3 py-3 text-red-400 max-w-[140px] truncate">—</td>}
                        {visibleColumns.service && <td className="px-3 py-3 text-red-400 font-medium whitespace-nowrap">—</td>}
                        {visibleColumns.actions && <td className="px-3 py-3 text-red-300">—</td>}
                      </tr>
                    )
                  }

                  const job = row as DailyJob
                  const isMonthly = job.payment_mode === 'Monthly'
                  const otHrs = calcOTHours(job.start_time, job.end_time)
                  const otDisplay = cleanNum(job.ot_hours) || otHrs

                  // Cleaner unique color palette
                  const palette = staffColorMap.get(job.staff_name.trim().toLowerCase()) || STAFF_COLOR_PALETTES[0]

                  // Detect first shift of this staff in the visible list for clear separation
                  const prevRow = idx > 0 ? displayedRows[idx - 1] : null
                  const isFirstShiftOfStaff = !prevRow || prevRow.staff_name?.trim().toLowerCase() !== job.staff_name.trim().toLowerCase()

                  // If monthly client, apply lighter green background; otherwise staff color palette
                  const rowClass = isMonthly
                    ? `transition-colors bg-emerald-100/90 hover:bg-emerald-200/90 text-emerald-950 border-l-[5px] border-l-emerald-600 ${
                        isFirstShiftOfStaff
                          ? 'border-t-2 border-t-emerald-300 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]'
                          : 'border-t border-t-emerald-200/70'
                      }`
                    : `transition-colors ${palette.rowBg} ${palette.borderLeft} ${
                        isFirstShiftOfStaff
                          ? 'border-t-2 border-t-slate-300 shadow-[inset_0_1px_0_rgba(0,0,0,0.03)]'
                          : 'border-t border-t-slate-200/50'
                      }`

                  return (
                    <tr key={job.id} className={rowClass}>
                      {visibleColumns.staff && (
                        <td className="px-3 py-3 font-semibold whitespace-nowrap">
                          {isFirstShiftOfStaff ? (
                            <div className="flex items-center gap-2">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm ${
                                isMonthly ? 'bg-emerald-600 text-white' : palette.avatarBg
                              }`}>
                                {job.staff_name.trim()[0]?.toUpperCase()}
                              </span>
                              <div>
                                <div className={`font-bold ${isMonthly ? 'text-emerald-950 font-extrabold' : palette.nameColor}`}>{job.staff_name}</div>
                                {isDateRange && (
                                  <div className="text-[10px] text-slate-500 font-normal">{fmtDate(job.date)}</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 pl-3">
                              <span className={`font-bold text-[11px] ${isMonthly ? 'text-emerald-600' : 'text-slate-400'}`}>↳</span>
                              <div>
                                <span className={`text-[12px] font-semibold ${isMonthly ? 'text-emerald-950 font-bold' : palette.nameColor}`}>{job.staff_name}</span>
                                {isDateRange && (
                                  <span className="text-[10px] text-slate-500 font-normal ml-1.5">({fmtDate(job.date)})</span>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.start_time && (
                        <td className={`px-3 py-3 font-medium whitespace-nowrap ${isMonthly ? 'text-emerald-950 font-semibold' : 'text-slate-600'}`}>{formatTimeOnly(job.start_time)}</td>
                      )}
                      {visibleColumns.end_time && (
                        <td className={`px-3 py-3 font-medium whitespace-nowrap ${isMonthly ? 'text-emerald-950 font-semibold' : 'text-slate-600'}`}>{formatTimeOnly(job.end_time)}</td>
                      )}
                      {visibleColumns.address && (
                        <td className="px-3 py-3">
                          <AddressCell address={job.address} area={job.area} isDark={false} />
                        </td>
                      )}
                      {visibleColumns.area && (
                        <td className={`px-3 py-3 whitespace-nowrap font-medium ${isMonthly ? 'text-emerald-900 font-semibold' : 'text-slate-600'}`}>{job.area || '—'}</td>
                      )}
                      {visibleColumns.charges && (
                        <td className="px-3 py-3 font-semibold whitespace-nowrap">
                          {isMonthly ? (
                            cleanNum(job.charges) > 0 ? (
                              <span className="text-emerald-950 font-bold">AED {cleanNum(job.charges).toLocaleString()}</span>
                            ) : (
                              <span className="text-emerald-700 font-bold">—</span>
                            )
                          ) : (
                            <span className="text-[#111827]">AED {cleanNum(job.charges).toLocaleString()}</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.received && (
                        <td className={`px-3 py-3 font-semibold whitespace-nowrap ${isMonthly ? 'text-emerald-800 font-medium' : 'text-emerald-700'}`}>
                          {job.payment_mode === 'Pending' || isMonthly ? '—' : `AED ${cleanNum(job.received).toLocaleString()}`}
                        </td>
                      )}
                      {visibleColumns.pending && (
                        <td className="px-3 py-3 font-semibold whitespace-nowrap">
                          {cleanNum(job.charges) > cleanNum(job.received) ? (
                            <span className="text-red-500 font-bold">AED {(cleanNum(job.charges) - cleanNum(job.received)).toLocaleString()}</span>
                          ) : (
                            <span className={isMonthly ? 'text-emerald-700 font-medium' : 'text-slate-400 font-medium'}>Nil</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.duty_hours && (
                        <td className={`px-3 py-3 font-semibold whitespace-nowrap ${isMonthly ? 'text-emerald-950 font-bold' : 'text-slate-800'}`}>
                          {cleanNum(job.duty_hours) > 0 ? `${cleanNum(job.duty_hours)}h` : '—'}
                        </td>
                      )}
                      {visibleColumns.ot_hours && (
                        <td className="px-3 py-3 whitespace-nowrap">
                          {otDisplay > 0
                            ? <span className="text-[11px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200">{otDisplay}h OT</span>
                            : <span className={isMonthly ? 'text-emerald-700' : 'text-slate-300'}>0</span>}
                        </td>
                      )}
                      {visibleColumns.material && (
                        <td className={`px-3 py-3 whitespace-nowrap font-medium ${isMonthly ? 'text-emerald-950' : 'text-slate-600'}`}>{job.material || 'No'}</td>
                      )}
                      {visibleColumns.payment_mode && (
                        <td className="px-3 py-3">
                          {isMonthly ? (
                            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-700 text-white shadow-xs whitespace-nowrap uppercase tracking-wider">
                              Monthly
                            </span>
                          ) : (
                            <PaymentBadge mode={job.payment_mode} />
                          )}
                        </td>
                      )}
                      {visibleColumns.remarks && (
                        <td className={`px-3 py-3 max-w-[140px] truncate ${isMonthly ? 'text-emerald-900 font-medium' : 'text-slate-600'}`} title={job.remarks}>
                          {job.remarks || '—'}
                        </td>
                      )}
                      {visibleColumns.service && (
                        <td className="px-3 py-3 whitespace-nowrap">
                          {job.service ? (
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm ${
                              isMonthly
                                ? 'bg-emerald-200/90 text-emerald-950 border border-emerald-300'
                                : 'bg-white/90 text-slate-700 border border-slate-300'
                            }`}>
                              {job.service}
                            </span>
                          ) : (
                            <span className={isMonthly ? 'text-emerald-700' : 'text-slate-300'}>—</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="px-3 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => setEditJob(job)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isMonthly
                                  ? 'hover:bg-emerald-200 text-emerald-800 hover:text-emerald-950'
                                  : 'hover:bg-white/80 text-slate-400 hover:text-slate-700'
                              }`}
                              title="Edit"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => deleteDailyJob(job.id)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isMonthly
                                  ? 'hover:bg-red-100 text-emerald-800 hover:text-red-600'
                                  : 'hover:bg-red-50 text-slate-400 hover:text-red-600'
                              }`}
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              {filteredActiveJobRows.length > 0 && (() => {
                const colsBeforeCharges = ['staff', 'start_time', 'end_time', 'address', 'area'].filter(id => visibleColumns[id]).length
                const colsAfterOT = ['material', 'payment_mode', 'remarks', 'service', 'actions'].filter(id => visibleColumns[id]).length
                return (
                  <tfoot className="sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.06)] bg-slate-100 border-t-2 border-[#E4E8EC]">
                    <tr className="bg-slate-100 border-t-2 border-[#E4E8EC] font-bold text-[12px]">
                      {colsBeforeCharges > 0 && (
                        <td colSpan={colsBeforeCharges} className="sticky bottom-0 bg-slate-100 px-3 py-3 text-slate-700">
                          Totals {selectedLetter !== 'ALL' ? `(Filtered: "${selectedLetter}")` : ''}
                        </td>
                      )}
                      {visibleColumns.charges && (
                        <td className="sticky bottom-0 bg-slate-100 px-3 py-3 text-[#111827]">AED {filteredActiveJobRows.reduce((s, j) => s + cleanNum(j.charges), 0).toLocaleString()}</td>
                      )}
                      {visibleColumns.received && (
                        <td className="sticky bottom-0 bg-slate-100 px-3 py-3 text-emerald-700">AED {filteredActiveJobRows.reduce((s, j) => s + cleanNum(j.received), 0).toLocaleString()}</td>
                      )}
                      {visibleColumns.pending && (
                        <td className="sticky bottom-0 bg-slate-100 px-3 py-3 text-red-600">AED {filteredActiveJobRows.reduce((s, j) => s + Math.max(0, cleanNum(j.charges) - cleanNum(j.received)), 0).toLocaleString()}</td>
                      )}
                      {visibleColumns.duty_hours && (
                        <td className="sticky bottom-0 bg-slate-100 px-3 py-3 text-slate-700 font-semibold">{Math.round(filteredActiveJobRows.reduce((s, j) => s + cleanNum(j.duty_hours), 0) * 10) / 10}h</td>
                      )}
                      {visibleColumns.ot_hours && (
                        <td className="sticky bottom-0 bg-slate-100 px-3 py-3 text-orange-700 font-semibold">{Math.round(filteredActiveJobRows.reduce((s, j) => s + (cleanNum(j.ot_hours) || calcOTHours(j.start_time, j.end_time)), 0) * 10) / 10}h</td>
                      )}
                      {colsAfterOT > 0 && <td colSpan={colsAfterOT} className="sticky bottom-0 bg-slate-100" />}
                    </tr>
                  </tfoot>
                )
              })()}
            </table>

            {totalRows === 0 && (
              <div className="py-16 text-center">
                <Briefcase className="mx-auto mb-3 text-slate-300" size={36} strokeWidth={1.25} />
                <p className="text-[13px] text-slate-500 mb-3">
                  {selectedLetter !== 'ALL'
                    ? `No cleaners starting with letter "${selectedLetter}" found for ${fmtDate(selectedDate)}`
                    : `No jobs recorded for ${fmtDate(selectedDate)}`}
                </p>
                {selectedLetter !== 'ALL' ? (
                  <Button size="sm" variant="outline" onClick={() => setSelectedLetter('ALL')}>
                    Show All Cleaners
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setShowAddJob(true)}>
                    <Plus size={13} className="mr-1" /> Add First Job
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Pagination / View All Bar ── */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3 text-[12px]">
          <div className="flex items-center gap-2 text-slate-500 font-medium">
            <span>
              Showing <span className="font-semibold text-slate-700">{pageSize === 'all' ? (totalRows > 0 ? 1 : 0) : Math.min(((activePage - 1) * (pageSize as number)) + 1, totalRows)}</span> to{' '}
              <span className="font-semibold text-slate-700">{pageSize === 'all' ? totalRows : Math.min(activePage * (pageSize as number), totalRows)}</span> of{' '}
              <span className="font-semibold text-slate-700">{totalRows}</span> total entries
            </span>
            {pageSize !== 'all' && totalRows > (pageSize as number) && (
              <button
                onClick={() => setPageSize('all')}
                className="ml-2 font-semibold text-emerald-600 hover:text-emerald-700 underline transition-colors"
              >
                View All ({totalRows})
              </button>
            )}
            {pageSize === 'all' && totalRows > 10 && (
              <button
                onClick={() => setPageSize(10)}
                className="ml-2 font-semibold text-slate-500 hover:text-slate-700 underline transition-colors"
              >
                Collapse view (10 rows)
              </button>
            )}
          </div>

          {pageSize !== 'all' && totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={activePage === 1}
                className="p-1.5 rounded-xl border border-[#E4E8EC] bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-40 transition-colors shadow-sm"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="px-3 py-1 font-semibold text-slate-700 bg-white border border-[#E4E8EC] rounded-xl shadow-sm">
                Page {activePage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={activePage === totalPages}
                className="p-1.5 rounded-xl border border-[#E4E8EC] bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-40 transition-colors shadow-sm"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom panels ── */}
      <div id="bottom-panels-section" className="grid grid-cols-1 xl:grid-cols-2 gap-6 scroll-mt-6">

        {/* Expenses Log */}
        <div id="expenses-log-widget" className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col justify-between scroll-mt-6">
          <div>
            <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-[#111827]">Expenses Log</h3>
                {todayExpenses.length > 3 && (
                  <span className="text-[10.5px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    {viewAllExpenses ? `Showing all ${todayExpenses.length}` : `Showing 3 of ${todayExpenses.length}`}
                  </span>
                )}
              </div>
              <button onClick={() => setShowAddExpense(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                <Plus size={13} /> Add Expense
              </button>
            </div>
            <div className="divide-y divide-[#E4E8EC]">
              {displayedExpenses.map(exp => (
                <div key={exp.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#111827]">{exp.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{exp.category}</p>
                  </div>
                  <span className="text-[13px] font-bold text-amber-700 shrink-0">AED {exp.amount.toLocaleString()}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditExpense(exp)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-emerald-700 transition-colors cursor-pointer"
                      title="Edit Expense"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDailyExpense(exp.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                      title="Delete Expense"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {todayExpenses.length === 0 && (
                <p className="text-[12px] text-slate-400 text-center py-8">No expenses for this day</p>
              )}
            </div>

            {/* View All toggle */}
            {todayExpenses.length > 3 && (
              <div className="px-5 py-2.5 bg-slate-50/80 border-t border-[#E4E8EC] text-center">
                <button
                  type="button"
                  onClick={() => setViewAllExpenses(v => !v)}
                  className="text-[12px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center justify-center gap-1.5 py-1 px-3 rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors"
                >
                  {viewAllExpenses ? (
                    <>Show Less (3 only) ↑</>
                  ) : (
                    <>View All ({todayExpenses.length} Expenses) ↓</>
                  )}
                </button>
              </div>
            )}
          </div>

          {todayExpenses.length > 0 && (
            <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-amber-800">Total Expenses</span>
              <span className="text-[14px] font-black text-amber-700">AED {totalExpenses.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Driver Summary */}
        <div id="driver-summary-widget" className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col justify-between scroll-mt-6">
          <div>
            <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-[#111827]">Driver / Staff Summary</h3>
                {sortedDrivers.length > 3 && (
                  <span className="text-[10.5px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    {viewAllDrivers ? `Showing all ${sortedDrivers.length}` : `Showing 3 of ${sortedDrivers.length}`}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400">Cash + Online collected</span>
            </div>
            <div className="divide-y divide-[#E4E8EC]">
              {sortedDrivers.length === 0 ? (
                <p className="text-[12px] text-slate-400 text-center py-8">No collections yet</p>
              ) : (
                displayedDrivers.map(([name, amount]) => {
                  const max = Math.max(...Object.values(driverSummary))
                  const pct = Math.round((amount / max) * 100)
                  return (
                    <div key={name} className="px-5 py-3.5 hover:bg-slate-50/50 transition-colors group">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-[13px] font-semibold text-[#111827] truncate">{name}</p>
                          <button
                            type="button"
                            onClick={() => setEditingDriverStaff({ name, currentAmount: amount })}
                            className="p-1 rounded-md text-slate-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title={`Edit ${name}'s Jobs & Collections`}
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                        <span className="text-[13px] font-bold text-emerald-700">AED {amount.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* View All toggle */}
            {sortedDrivers.length > 3 && (
              <div className="px-5 py-2.5 bg-slate-50/80 border-t border-[#E4E8EC] text-center">
                <button
                  type="button"
                  onClick={() => setViewAllDrivers(v => !v)}
                  className="text-[12px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center justify-center gap-1.5 py-1 px-3 rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors"
                >
                  {viewAllDrivers ? (
                    <>Show Less (3 only) ↑</>
                  ) : (
                    <>View All ({sortedDrivers.length} Drivers) ↓</>
                  )}
                </button>
              </div>
            )}
          </div>

          {Object.keys(driverSummary).length > 0 && (
            <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-emerald-800">Total Collected</span>
              <span className="text-[14px] font-black text-emerald-700">AED {grossCollected.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Reconciliation Widgets: Today Pending, Pending Received, Advance ── */}
      <div id="reconciliation-widgets-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6 scroll-mt-6">

        {/* 1. Today Pending (Light Red) */}
        <div id="today-pending-widget" className="bg-red-50/80 border border-red-200 rounded-[22px] shadow-[0_4px_20px_rgba(239,68,68,0.06)] overflow-hidden flex flex-col justify-between scroll-mt-6">
          <div>
            <div className="px-5 py-4 bg-red-100/70 border-b border-red-200/90 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-red-200/90 text-red-700 flex items-center justify-center">
                  <Clock size={15} />
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-red-950">Today Pending</h3>
                  <p className="text-[10.5px] text-red-700/80">{todayPendingEntries.length} records</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-black text-red-800 bg-red-200/80 border border-red-300 px-2.5 py-0.5 rounded-full">
                  AED {todayPendingTotalAmt.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddPending(true)}
                  className="w-6 h-6 rounded-lg bg-white/90 hover:bg-white text-red-700 flex items-center justify-center shadow-xs transition-colors cursor-pointer border border-red-200"
                  title="Add Pending item"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-red-100/50 border-b border-red-200/80 text-red-900 font-bold text-[10.5px] uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">Client Name</th>
                    <th className="text-right px-3 py-2.5">Amount Pending</th>
                    <th className="text-right px-4 py-2.5">Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-200/60">
                  {todayPendingEntries.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-red-600/70 text-[12px]">
                        No pending items for {fmtDate(selectedDate)}
                      </td>
                    </tr>
                  ) : (
                    todayPendingEntries.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedPendingDetails(item)}
                        className="hover:bg-red-100/60 transition-colors group cursor-pointer"
                        title="Click to view details & mark as collected"
                      >
                        <td className="px-4 py-2.5 font-semibold text-slate-800 break-words group-hover:text-red-950">
                          {item.client}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-red-700 whitespace-nowrap">
                          AED {cleanNum(item.amount).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap group-hover:text-slate-900">
                          {item.staff}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-5 py-3 bg-red-100/70 border-t border-red-200/90 flex items-center justify-between text-red-950 font-bold">
            <span className="text-[12px]">Total</span>
            <span className="text-[14px] font-black text-red-800">AED {todayPendingTotalAmt.toLocaleString()}</span>
          </div>
        </div>

        {/* 2. Pending Received (Light Green) */}
        <div id="pending-received-widget" className="bg-emerald-50/80 border border-emerald-200 rounded-[22px] shadow-[0_4px_20px_rgba(16,185,129,0.06)] overflow-hidden flex flex-col justify-between scroll-mt-6">
          <div>
            <div className="px-5 py-4 bg-emerald-100/70 border-b border-emerald-200/90 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-200/90 text-emerald-700 flex items-center justify-center">
                  <CheckCircle size={15} />
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-emerald-950">Pending Received</h3>
                  <p className="text-[10.5px] text-emerald-700/80">{todayPendingRcvdItems.length} records</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-black text-emerald-800 bg-emerald-200/80 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                  AED {pendingRcvdGrandTotal.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddPendingRcvd(true)}
                  className="w-6 h-6 rounded-lg bg-white/90 hover:bg-white text-emerald-700 flex items-center justify-center shadow-xs transition-colors cursor-pointer border border-emerald-200"
                  title="Add Pending Received item"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-emerald-100/50 border-b border-emerald-200/80 text-emerald-900 font-bold text-[10.5px] uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">Client</th>
                    <th className="text-right px-3 py-2.5">Cash</th>
                    <th className="text-right px-3 py-2.5">Online</th>
                    <th className="w-14"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-200/60">
                  {todayPendingRcvdItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-emerald-600/70 text-[12px]">
                        No pending received items for {fmtDate(selectedDate)}
                      </td>
                    </tr>
                  ) : (
                    todayPendingRcvdItems.map(item => (
                      <tr key={item.id} className="hover:bg-emerald-100/40 transition-colors group">
                        <td className="px-4 py-2.5 font-semibold text-slate-800 break-words">{item.client}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-800 whitespace-nowrap">
                          {cleanNum(item.cash) > 0 ? `AED ${cleanNum(item.cash).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-blue-700 whitespace-nowrap">
                          {cleanNum(item.online) > 0 ? `AED ${cleanNum(item.online).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-2 py-2.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => setEditingPendingRcvd(item)}
                              className="text-slate-400 hover:text-emerald-700 transition-colors p-1 rounded hover:bg-emerald-50 cursor-pointer"
                              title="Edit Pending Received"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingRcvdList(prev => prev.filter(x => x.id !== item.id))}
                              className="text-emerald-500 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-5 py-3 bg-emerald-100/70 border-t border-emerald-200/90 flex items-center justify-between text-[11.5px] text-emerald-950 font-bold">
            <div className="flex items-center gap-3">
              <span>Cash: <strong className="text-emerald-800">AED {pendingRcvdTotalCash.toLocaleString()}</strong></span>
              <span>Online: <strong className="text-blue-800">AED {pendingRcvdTotalOnline.toLocaleString()}</strong></span>
            </div>
            <span className="text-[13.5px] font-black text-emerald-900">AED {pendingRcvdGrandTotal.toLocaleString()}</span>
          </div>
        </div>

        {/* 3. Advance (Yellow / Amber) */}
        <div className="bg-amber-50/80 border border-amber-200 rounded-[22px] shadow-[0_4px_20px_rgba(245,158,11,0.06)] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 bg-amber-100/70 border-b border-amber-200/90 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-200/90 text-amber-700 flex items-center justify-center">
                  <Wallet size={15} />
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-amber-950">Advance</h3>
                  <p className="text-[10.5px] text-amber-700/80">{todayAdvanceItems.length} records</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-black text-amber-800 bg-amber-200/80 border border-amber-300 px-2.5 py-0.5 rounded-full">
                  AED {advanceTotalAmt.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddAdvance(true)}
                  className="w-6 h-6 rounded-lg bg-white/90 hover:bg-white text-amber-700 flex items-center justify-center shadow-xs transition-colors cursor-pointer border border-amber-200"
                  title="Add Advance item"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-amber-100/50 border-b border-amber-200/80 text-amber-900 font-bold text-[10.5px] uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">Client</th>
                    <th className="text-right px-3 py-2.5">Rcvd</th>
                    <th className="text-right px-3 py-2.5">Advance</th>
                    <th className="w-14"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200/60">
                  {todayAdvanceItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-amber-600/70 text-[12px]">
                        No advance items for {fmtDate(selectedDate)}
                      </td>
                    </tr>
                  ) : (
                    todayAdvanceItems.map(item => (
                      <tr key={item.id} className="hover:bg-amber-100/40 transition-colors group">
                        <td className="px-4 py-2.5 font-semibold text-slate-800 break-words">{item.client}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-amber-800 whitespace-nowrap">
                          {cleanNum(item.received) > 0 ? `AED ${cleanNum(item.received).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-black text-amber-900 whitespace-nowrap">
                          {cleanNum(item.advance) > 0 ? `AED ${cleanNum(item.advance).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-2 py-2.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => setEditingAdvance(item)}
                              className="text-slate-400 hover:text-amber-700 transition-colors p-1 rounded hover:bg-amber-50 cursor-pointer"
                              title="Edit Advance"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdvanceList(prev => prev.filter(x => x.id !== item.id))}
                              className="text-amber-500 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-5 py-3 bg-amber-100/70 border-t border-amber-200/90 flex items-center justify-between text-[11.5px] text-amber-950 font-bold">
            <span>Rcvd: <strong className="text-amber-800">AED {advanceTotalRcvd.toLocaleString()}</strong></span>
            <span>Advance: <strong className="text-[13.5px] font-black text-amber-900">AED {advanceTotalAmt.toLocaleString()}</strong></span>
          </div>
        </div>

      </div>

      {/* ── Supabase setup notice (shown when no data ever) ── */}
      {dailyJobs.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[22px] p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-amber-800 mb-2">One-time Supabase setup required</p>
              <p className="text-[12px] text-amber-700 mb-3">Run this SQL in your Supabase project (Dashboard → SQL Editor):</p>
              <pre className="bg-slate-900 text-emerald-400 text-[11px] p-4 rounded-xl overflow-x-auto leading-relaxed">{`CREATE TABLE daily_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL,
  staff_name TEXT NOT NULL DEFAULT '',
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  duty_hours NUMERIC DEFAULT 0,
  ot_hours NUMERIC DEFAULT 0,
  address TEXT DEFAULT '',
  area TEXT DEFAULT '',
  material TEXT DEFAULT 'No',
  charges NUMERIC DEFAULT 0,
  received NUMERIC DEFAULT 0,
  payment_mode TEXT DEFAULT 'Cash',
  is_overtime BOOLEAN DEFAULT FALSE,
  remarks TEXT DEFAULT '',
  service TEXT DEFAULT ''
);

-- If table already exists, run this to add the columns:
-- ALTER TABLE daily_jobs ADD COLUMN IF NOT EXISTS service TEXT DEFAULT '';
-- ALTER TABLE daily_jobs ADD COLUMN IF NOT EXISTS ot_hours NUMERIC DEFAULT 0;

CREATE TABLE daily_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT '',
  amount NUMERIC DEFAULT 0
);`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Job Modal ── */}
      <Modal open={showAddJob} onClose={() => setShowAddJob(false)} title="Add Job Entry" size="lg">
        <AddJobForm
          employees={activeEmps}
          onClose={() => setShowAddJob(false)}
          onSave={j => { addDailyJob({ ...j, date: selectedDate }); setShowAddJob(false) }}
          initial={{ date: selectedDate }}
        />
      </Modal>

      {/* ── Edit Job Modal ── */}
      <Modal open={!!editJob} onClose={() => setEditJob(null)} title="Edit Job Entry" size="lg">
        {editJob && (
          <AddJobForm
            employees={activeEmps}
            onClose={() => setEditJob(null)}
            onSave={j => { updateDailyJob(editJob.id, j); setEditJob(null) }}
            initial={editJob}
          />
        )}
      </Modal>

      {/* ── Add Expense Modal ── */}
      <Modal open={showAddExpense} onClose={() => setShowAddExpense(false)} title="Add Expense" size="sm">
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget as HTMLFormElement)
          addDailyExpense({
            date:     selectedDate,
            name:     fd.get('name') as string,
            category: fd.get('category') as string,
            amount:   cleanNum(fd.get('amount')),
          })
          setShowAddExpense(false)
        }}>
          <Input name="name" label="Driver / Person Name" placeholder="e.g. Ahmed, Raju…" required />
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Category</label>
            <select name="category" className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700">
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Input name="amount" label="Amount (AED)" type="number" min="0" step="0.01" placeholder="0.00" required />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddExpense(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Add Expense</Button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm Delete Day Data Modal ── */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Day's Data" size="sm">
        <div className="space-y-4 pt-1">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <AlertCircle size={22} />
            </div>
            <div>
              <h4 className="text-[14px] font-bold text-slate-900">
                Delete all data for {fmtDate(selectedDate)}?
              </h4>
              <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">
                This will permanently delete all <strong>{todayJobs.length} jobs</strong> and <strong>{todayExpenses.length} expenses</strong> recorded for this date.
              </p>
            </div>
          </div>

          <div className="bg-red-50/80 border border-red-200 rounded-xl p-3 text-[11.5px] text-red-700 leading-relaxed">
            ⚠️ <strong>Warning:</strong> This action cannot be undone. All entries for this day will be permanently removed.
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <button
              type="button"
              onClick={() => {
                clearDailyData(selectedDate)
                setPendingList(prev => prev.filter(x => x.date !== selectedDate))
                setPendingRcvdList(prev => prev.filter(x => x.date !== selectedDate))
                setAdvanceList(prev => prev.filter(x => x.date !== selectedDate))
                setShowDeleteConfirm(false)
                setDeleteSuccessNotice(fmtDate(selectedDate))
              }}
              className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] shadow-sm transition-all cursor-pointer"
            >
              Yes, Delete All
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Add Pending Item Modal ── */}
      <Modal open={showAddPending} onClose={() => setShowAddPending(false)} title="Add Pending Item" size="sm">
        <form
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const client = String(fd.get('client') || '').trim()
            const amount = cleanNum(fd.get('amount'))
            if (!client) return
            setPendingList(prev => [
              {
                id: `p-${Date.now()}`,
                date: selectedDate,
                client,
                amount,
              },
              ...prev,
            ])
            setShowAddPending(false)
          }}
          className="space-y-4 pt-2"
        >
          <Input name="client" label="Client Name / Description" placeholder="e.g. Villa 96C, Office 12..." required autoFocus />
          <Input name="amount" label="Pending Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" required />
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddPending(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white">Add Pending</Button>
          </div>
        </form>
      </Modal>

      {/* ── Add Pending Received Item Modal ── */}
      <Modal open={showAddPendingRcvd} onClose={() => setShowAddPendingRcvd(false)} title="Add Pending Received Item" size="sm">
        <form
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const client = String(fd.get('client') || '').trim()
            const cash = cleanNum(fd.get('cash'))
            const online = cleanNum(fd.get('online'))
            if (!client) return
            setPendingRcvdList(prev => [
              {
                id: `pr-${Date.now()}`,
                date: selectedDate,
                client,
                cash,
                online,
              },
              ...prev,
            ])
            setShowAddPendingRcvd(false)
          }}
          className="space-y-4 pt-2"
        >
          <Input name="client" label="Client Name / Description" placeholder="e.g. Villa 63B Street 62B..." required autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Input name="cash" label="Cash Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" defaultValue="0" />
            <Input name="online" label="Online Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" defaultValue="0" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddPendingRcvd(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">Add Record</Button>
          </div>
        </form>
      </Modal>

      {/* ── Add Advance Item Modal ── */}
      <Modal open={showAddAdvance} onClose={() => setShowAddAdvance(false)} title="Add Advance Item" size="sm">
        <form
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const client = String(fd.get('client') || '').trim()
            const received = cleanNum(fd.get('received'))
            const advance = cleanNum(fd.get('advance'))
            if (!client) return
            setAdvanceList(prev => [
              {
                id: `adv-${Date.now()}`,
                date: selectedDate,
                client,
                received,
                advance,
              },
              ...prev,
            ])
            setShowAddAdvance(false)
          }}
          className="space-y-4 pt-2"
        >
          <Input name="client" label="Client Name / Description" placeholder="e.g. 615 Zarooni 2..." required autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Input name="received" label="Received Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" defaultValue="0" />
            <Input name="advance" label="Advance Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" required />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddAdvance(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">Add Advance</Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Expense Modal ── */}
      <Modal open={!!editExpense} onClose={() => setEditExpense(null)} title="Edit Expense" size="sm">
        {editExpense && (
          <form
            className="space-y-4 pt-1"
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget as HTMLFormElement)
              updateDailyExpense(editExpense.id, {
                name:     fd.get('name') as string,
                category: fd.get('category') as string,
                amount:   cleanNum(fd.get('amount')),
              })
              setEditExpense(null)
            }}
          >
            <Input name="name" label="Driver / Person Name" defaultValue={editExpense.name} required />
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Category</label>
              <select
                name="category"
                defaultValue={editExpense.category}
                className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700"
              >
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Input name="amount" label="Amount (AED)" type="number" min="0" step="0.01" defaultValue={editExpense.amount} required />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditExpense(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Edit Driver / Staff Summary Modal ── */}
      <Modal
        open={!!editingDriverStaff}
        onClose={() => setEditingDriverStaff(null)}
        title={`Staff / Driver — ${editingDriverStaff?.name ?? ''}`}
        size="md"
      >
        {editingDriverStaff && (() => {
          const staffJobs = todayJobs.filter(j => j.staff_name.trim().toLowerCase() === editingDriverStaff.name.trim().toLowerCase())
          return (
            <div className="space-y-4 pt-1">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-[12.5px]">
                <div>
                  <span className="text-emerald-800 font-semibold">Staff Member:</span>{' '}
                  <strong className="text-emerald-950 font-bold">{editingDriverStaff.name}</strong>
                  <span className="text-slate-500 ml-2">({staffJobs.length} job{staffJobs.length !== 1 ? 's' : ''} on {fmtDate(selectedDate)})</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-emerald-700 font-medium">Total Collected:</span>{' '}
                  <span className="text-[14px] font-black text-emerald-900">AED {editingDriverStaff.currentAmount.toLocaleString()}</span>
                </div>
              </div>

              <div>
                <h5 className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-2">Assigned Jobs & Received Amounts</h5>
                {staffJobs.length === 0 ? (
                  <p className="text-[12px] text-slate-400 py-3 text-center">No active jobs found for {editingDriverStaff.name}</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    {staffJobs.map(job => (
                      <div key={job.id} className="p-3 flex items-center justify-between gap-3 text-[12px] hover:bg-slate-50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 truncate">{job.address || 'No address'}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {formatTimeOnly(job.start_time)} – {formatTimeOnly(job.end_time)} · Mode: <strong className="text-slate-600">{job.payment_mode}</strong> · Charges: AED {cleanNum(job.charges)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block font-medium">Received</span>
                            <span className="font-bold text-emerald-700">AED {cleanNum(job.received)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDriverStaff(null)
                              setEditJob(job)
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Edit this job"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingDriverStaff(null)}>
                  Close
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Edit Pending Item Modal ── */}
      <Modal open={!!editingPending} onClose={() => setEditingPending(null)} title="Edit Pending Item" size="sm">
        {editingPending && (
          <form
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const client = String(fd.get('client') || '').trim()
              const amount = cleanNum(fd.get('amount'))
              if (!client) return
              setPendingList(prev => prev.map(x => x.id === editingPending.id ? { ...x, client, amount } : x))
              setEditingPending(null)
            }}
            className="space-y-4 pt-2"
          >
            <Input name="client" label="Client Name / Description" defaultValue={editingPending.client} required autoFocus />
            <Input name="amount" label="Pending Amount (AED)" type="number" step="0.01" min="0" defaultValue={editingPending.amount} required />
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingPending(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white">Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Edit Pending Received Item Modal ── */}
      <Modal open={!!editingPendingRcvd} onClose={() => setEditingPendingRcvd(null)} title="Edit Pending Received Item" size="sm">
        {editingPendingRcvd && (
          <form
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const client = String(fd.get('client') || '').trim()
              const cash = cleanNum(fd.get('cash'))
              const online = cleanNum(fd.get('online'))
              if (!client) return
              setPendingRcvdList(prev => prev.map(x => x.id === editingPendingRcvd.id ? { ...x, client, cash, online } : x))
              setEditingPendingRcvd(null)
            }}
            className="space-y-4 pt-2"
          >
            <Input name="client" label="Client Name / Description" defaultValue={editingPendingRcvd.client} required autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <Input name="cash" label="Cash Amount (AED)" type="number" step="0.01" min="0" defaultValue={editingPendingRcvd.cash} />
              <Input name="online" label="Online Amount (AED)" type="number" step="0.01" min="0" defaultValue={editingPendingRcvd.online} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingPendingRcvd(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Edit Advance Item Modal ── */}
      <Modal open={!!editingAdvance} onClose={() => setEditingAdvance(null)} title="Edit Advance Item" size="sm">
        {editingAdvance && (
          <form
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const client = String(fd.get('client') || '').trim()
              const received = cleanNum(fd.get('received'))
              const advance = cleanNum(fd.get('advance'))
              if (!client) return
              setAdvanceList(prev => prev.map(x => x.id === editingAdvance.id ? { ...x, client, received, advance } : x))
              setEditingAdvance(null)
            }}
            className="space-y-4 pt-2"
          >
            <Input name="client" label="Client Name / Description" defaultValue={editingAdvance.client} required autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <Input name="received" label="Received Amount (AED)" type="number" step="0.01" min="0" defaultValue={editingAdvance.received} />
              <Input name="advance" label="Advance Amount (AED)" type="number" step="0.01" min="0" defaultValue={editingAdvance.advance} required />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingAdvance(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Today Pending Details Pop-up Modal ── */}
      <Modal
        open={!!selectedPendingDetails}
        onClose={() => setSelectedPendingDetails(null)}
        title="Pending Job Details"
        size="sm"
      >
        {selectedPendingDetails && (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10.5px] uppercase tracking-wider font-bold text-red-800 block">Amount Due</span>
                <span className="text-[20px] font-black text-red-700">AED {selectedPendingDetails.amount.toLocaleString()}</span>
              </div>
              <div className="text-right">
                <span className="text-[10.5px] text-slate-500 block">Date</span>
                <span className="text-[12px] font-bold text-slate-800">{fmtDate(selectedPendingDetails.date)}</span>
              </div>
            </div>

            <div className="space-y-2.5 text-[12.5px] bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                <span className="text-slate-500 font-medium">Staff:</span>
                <strong className="text-slate-900 font-bold">{selectedPendingDetails.staff}</strong>
              </div>
              <div className="flex items-start justify-between border-b border-slate-200/70 pb-2 gap-3">
                <span className="text-slate-500 font-medium shrink-0">Address:</span>
                <span className="text-slate-800 font-semibold text-right break-words">{selectedPendingDetails.address || '—'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                <span className="text-slate-500 font-medium">Area / Zone:</span>
                <span className="text-slate-800 font-semibold">{selectedPendingDetails.area || '—'}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-500 font-medium shrink-0">Remarks:</span>
                <span className="text-slate-700 italic text-right break-words">{selectedPendingDetails.remarks || '—'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setSelectedPendingDetails(null)}
              >
                Close
              </Button>
              <button
                type="button"
                onClick={() => {
                  if (selectedPendingDetails.job) {
                    setEditJob(selectedPendingDetails.job)
                  } else {
                    setEditingPending(selectedPendingDetails as any)
                  }
                  setSelectedPendingDetails(null)
                }}
                className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1.5 font-semibold text-[12px]"
                title="Edit Job / Entry"
              >
                <Pencil size={13} /> Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedPendingDetails.job) {
                    updateDailyJob(selectedPendingDetails.job.id, {
                      payment_mode: 'Cash',
                      received: cleanNum(selectedPendingDetails.job.charges),
                    })
                  } else {
                    setPendingList(prev => prev.filter(x => x.id !== selectedPendingDetails.id))
                  }
                  setSelectedPendingDetails(null)
                }}
                className="flex-[1.5] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[13px] shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle size={14} /> Mark as Collected
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}
