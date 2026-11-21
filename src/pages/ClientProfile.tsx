import { useState, useEffect, useMemo, useRef } from 'react'
import { copyText } from '@/lib/clipboard'
import { formatClientAddress } from '@/lib/clientAddress'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { confirmAsync, notify } from '@/lib/notify'
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Star, MessageCircle,
  Copy, CheckCircle, User, Clock, ExternalLink, Pencil, FileText, Search,
  Wallet, DollarSign, TrendingUp, AlertCircle, Plus, Download, Check, X,
  Tag, FileSpreadsheet, RotateCcw, Filter, AlertTriangle, ShieldCheck,
  CreditCard, ChevronRight, Receipt, Trash2, Save, ChevronDown, Users, MoreVertical, PiggyBank, SlidersHorizontal, CalendarDays
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import { LayoutCustomizer, useLayout, type LayoutItem } from '@/components/ui/LayoutCustomizer'
import { KpiCard, Widget } from '@/components/ui/KpiCard'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { clientDeletionImpact, deletionMessage } from '@/lib/clientChanges'
import { CONTRACTS_KEY } from '@/lib/clientContracts'
import type { Booking, PaymentMode, DailyJob, Invoice, DailyAdvanceItem, Client } from '@/types'
import { advanceMatchesClient } from '@/lib/clientAdvance'
import {
  getClientDailyJobsHistory, calcJobOTHours, isMonthlyJob, normalizeKey, isMonthlyClient,
  buildPendingCalcContext, calcJobAdjustment, calcJobPending, calcClientOpeningPending,
  isJobPaidFromAdvance, loadClientAdjustments, loadPendingReceipts,
} from '@/lib/clientDataSync'
import { formatTimeOnly, cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { SourceOriginTag, resolveClientSource } from '@/lib/sourceTracking'
import { ClientModalForm } from '@/components/clients/ClientModalForm'
import { RecordPaymentModal } from '@/components/payments/RecordPaymentModal'
import type { MonthlyClientPayment } from '@/types'
import { todayDubai } from '@/lib/dubaiTime'
import { upcomingVisits, jobSheetSummary, scheduledVisitsAhead } from '@/lib/clientProfileSummary'

/* ─── Client Financial Adjustment & Advance Types ─── */
export interface ClientFinancialAdjustment {
  id: string
  client_id: string
  client_name?: string
  date: string
  type: 'discount' | 'waiver' | 'advance' | 'credit' | 'settlement' | 'correction' | 'advance_deduction'
  amount: number
  reference_job_id?: string
  notes: string
  created_at: string
}

// R-FIN-10: one copy, in src/lib/clientAdvance.ts
export { advanceMatchesClient }

/* ─── Avatar ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72' },
  { bg: '#fce4d6', text: '#c66a3a' },
  { bg: '#e4dff5', text: '#6b5bb5' },
  { bg: '#d6e7f5', text: '#3a7ab8' },
  { bg: '#fcecc8', text: '#a8842a' },
]
function Avatar({ name, size = 'md', idx = 0 }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; idx?: number }) {
  const parts = name.trim().split(' ')
  const init  = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'CL'
  const dims  = size === 'xl' ? 'w-20 h-20 text-[22px]' : size === 'lg' ? 'w-14 h-14 text-[16px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-[13px]'
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0 shadow-xs`} style={{ background: color.bg, color: color.text }}>
      {init}
    </div>
  )
}

/* ─── Status pill ─── */
const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  pending:     { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  confirmed:   { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400'    },
  in_progress: { bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-400'  },
  completed:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled:   { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-400'     },
}
function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.replace('_', ' ')}
    </span>
  )
}

function PaymentModeBadge({ mode }: { mode: PaymentMode | string }) {
  const cfg: Record<string, string> = {
    Cash:    'bg-emerald-50 text-emerald-800 border-emerald-300',
    Online:  'bg-blue-50 text-blue-800 border-blue-300',
    Pending: 'bg-red-50 text-red-700 border-red-300',
    Monthly: 'bg-purple-50 text-purple-800 border-purple-300',
    Above:   'bg-amber-50 text-amber-800 border-amber-300',
  }
  const cls = cfg[mode] || 'bg-slate-50 text-slate-700 border-slate-300'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shadow-xs ${cls}`}>
      {mode}
    </span>
  )
}

/* ─── Review request persistence ─── */
const REVIEW_KEY = 'safaeewala_review_requests'
function loadReviews(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(REVIEW_KEY) ?? '{}') } catch { return {} }
}
function persistReview(bookingId: string) {
  const data = loadReviews()
  data[bookingId] = new Date().toISOString()
  safeLocalStorageSet(REVIEW_KEY, data) // cloud-synced
}

/* ─── Main component ─── */
const HISTORY_COLUMN_ITEMS: LayoutItem[] = [
  { id: 'date', label: 'Date', locked: true }, { id: 'cleaner', label: 'Cleaner' }, { id: 'timing', label: 'Timing' },
  { id: 'duty', label: 'Duty' }, { id: 'ot', label: 'OT' }, { id: 'charges', label: 'Charges' }, { id: 'received', label: 'Received' },
  { id: 'pending', label: 'Pending' }, { id: 'advance', label: 'Advance' }, { id: 'adjustment', label: 'Adjustment' },
  { id: 'mode', label: 'Mode' }, { id: 'material', label: 'Material' }, { id: 'remarks', label: 'Service & Remarks' }, { id: 'action', label: 'Action' },
]

export function ClientProfile() {
  const { id } = useParams<{ id: string }>()
  const { clients, bookings, employees, invoices, dailyJobs, updateClient, addClient, deleteClient } = useData()
  // UX-108: Service History cards / columns — shown, hidden and order per browser
  // UX-108: ⋮ menu next to Edit Profile with Delete Profile
  const navigateTo = useNavigate()
  const [heroMenuOpen, setHeroMenuOpen] = useState(false)
  const heroMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!heroMenuOpen) return
    const onDown = (e: MouseEvent) => { if (heroMenuRef.current && !heroMenuRef.current.contains(e.target as Node)) setHeroMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [heroMenuOpen])
  const historyCols = useLayout('safaeewala_client_history_columns', HISTORY_COLUMN_ITEMS)

  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') as 'job_sheet' | 'financial_history' | 'bookings' | 'info' | null
  const [activeTab,     setActiveTab]     = useState<'job_sheet' | 'financial_history' | 'bookings' | 'info'>(initialTab || 'job_sheet')
  const [jobSearch,     setJobSearch]     = useState('')
  const [ledgerSearch,  setLedgerSearch]  = useState('')
  const [ledgerFilter,  setLedgerFilter]  = useState<'all' | 'pending' | 'advance' | 'adjustment' | 'invoices'>('all')
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null)
  const [reviewMap,     setReviewMap]     = useState<Record<string, string>>({})
  const [copied,        setCopied]        = useState(false)
  const [editOpen,      setEditOpen]      = useState(false)
  const [showAllUpcoming, setShowAllUpcoming] = useState(false) // UX-162
  const [editSaving,    setEditSaving]    = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentsVersion, setPaymentsVersion]   = useState(0)

  // React to payments added from any screen
  useEffect(() => {
    const handleSync = () => {
      setPaymentsVersion(v => v + 1)
    }
    window.addEventListener('safaeewala_payments_updated', handleSync)
    window.addEventListener('storage', handleSync)
    return () => {
      window.removeEventListener('safaeewala_payments_updated', handleSync)
      window.removeEventListener('storage', handleSync)
    }
  }, [])



  // ── Financial Adjustments & Advances ──
  // Real records only (old demo "adj-seed-*" entries are ignored)
  const [adjustments, setAdjustments] = useState<ClientFinancialAdjustment[]>(
    () => loadClientAdjustments() as ClientFinancialAdjustment[]
  )

  // Pending Received collections, needed for the shared pending formula
  const [pendingReceipts] = useState(() => loadPendingReceipts())

  // Load Daily Advance Items from Advance widget
  const [dailyAdvanceItems, setDailyAdvanceItems] = useState<DailyAdvanceItem[]>(() => {
    return safeLocalStorageGet<DailyAdvanceItem[]>('safaeewala_daily_advance_items', [])
  })

  useEffect(() => {
    const refreshAdvances = () => {
      setDailyAdvanceItems(safeLocalStorageGet<DailyAdvanceItem[]>('safaeewala_daily_advance_items', []))
    }
    window.addEventListener('storage', refreshAdvances)
    return () => window.removeEventListener('storage', refreshAdvances)
  }, [])

  const [newAdjModalOpen, setNewAdjModalOpen] = useState(false)
  const [newAdjType, setNewAdjType] = useState<ClientFinancialAdjustment['type']>('discount')
  const [newAdjAmount, setNewAdjAmount] = useState('')
  const [newAdjDate, setNewAdjDate] = useState(() => todayDubai())
  const [newAdjNotes, setNewAdjNotes] = useState('')
  const [newAdjJobId, setNewAdjJobId] = useState('')

  const saveAdjustments = (newList: ClientFinancialAdjustment[]) => {
    setAdjustments(newList)
    safeLocalStorageSet('safaeewala_client_adjustments', newList)
  }

  useEffect(() => { setReviewMap(loadReviews()) }, [])

  const decodedId = id ? decodeURIComponent(id).toLowerCase().trim() : ''
  const client = useMemo(() => {
    if (!id && !decodedId) return null

    // 1. Direct match by ID (exact or case-insensitive)
    let found = clients.find(c => c.id === id || c.id.toLowerCase() === decodedId)
    if (found) return found

    // 2. Match by full_name
    found = clients.find(c => c.full_name && c.full_name.toLowerCase().trim() === decodedId)
    if (found) return found

    // 3. Match by client_code
    found = clients.find(c => (c as any).client_code && (c as any).client_code.toLowerCase().trim() === decodedId)
    if (found) return found

    // 4. Match by phone or whatsapp
    const cleanId = decodedId.replace(/\D/g, '')
    if (cleanId.length >= 7) {
      found = clients.find(c => {
        const p1 = (c.phone || '').replace(/\D/g, '')
        const p2 = (c.whatsapp || '').replace(/\D/g, '')
        return (p1 && (p1.endsWith(cleanId) || cleanId.endsWith(p1))) ||
               (p2 && (p2.endsWith(cleanId) || cleanId.endsWith(p2)))
      })
      if (found) return found
    }

    // 5. Synthesize client from existing Bookings if not in clients table yet
    const matchingBooking = bookings.find(b =>
      b.client_id === id ||
      (b.client_name && b.client_name.toLowerCase().trim() === decodedId) ||
      (cleanId.length >= 7 && b.client_phone && b.client_phone.replace(/\D/g, '').endsWith(cleanId))
    )
    if (matchingBooking) {
      return {
        id: matchingBooking.client_id || `booking-${matchingBooking.id}`,
        full_name: matchingBooking.client_name,
        phone: matchingBooking.client_phone || '',
        whatsapp: matchingBooking.client_phone || '',
        building_name: matchingBooking.service_address || '',
        apartment: '',
        area: 'Dubai',
        city: 'Dubai',
        source: matchingBooking.source || 'booking',
        service_days: [],
        scheduled_time: matchingBooking.scheduled_time || '09:00',
        duration_hours: matchingBooking.duration_hours || 3,
        created_at: matchingBooking.created_at || matchingBooking.scheduled_date,
        total_bookings: 1,
        total_spent: matchingBooking.total_amount || 0,
      } as unknown as Client
    }

    // 6. Synthesize client from DailyJobs if exists there
    const matchingJob = dailyJobs.find(j => {
      const jc = (j as any).client || (j as any).client_name || ''
      const jp = (j as any).phone || ''
      return (jc && jc.toLowerCase().trim() === decodedId) || (cleanId.length >= 7 && jp && jp.replace(/\D/g, '').endsWith(cleanId))
    })
    if (matchingJob) {
      const jc = (matchingJob as any).client || (matchingJob as any).client_name || 'Client'
      const jp = (matchingJob as any).phone || ''
      return {
        id: `job-${encodeURIComponent(jc)}`,
        full_name: jc,
        phone: jp,
        whatsapp: jp,
        building_name: matchingJob.address || '',
        apartment: '',
        area: 'Dubai',
        city: 'Dubai',
        source: 'daily_job_sheet',
        service_days: [],
        created_at: matchingJob.date,
        total_bookings: 1,
        total_spent: Number((matchingJob as any).charges || 0),
      } as unknown as Client
    }

    return null
  }, [clients, bookings, dailyJobs, id, decodedId])

  const clientIdx = useMemo(() => {
    if (!client) return -1
    return clients.findIndex(c => c.id === client.id)
  }, [clients, client])

  // Live client payments from unified storage
  const clientRecordedPayments = useMemo(() => {
    if (!client) return []
    const all = safeLocalStorageGet<MonthlyClientPayment[]>('safaeewala_monthly_client_payments', [])
    const cName = (client.full_name || '').toLowerCase().trim()
    const cId = client.id
    return all.filter(p => {
      if (p.clientId && p.clientId === cId) return true
      if (p.clientName && p.clientName.toLowerCase().trim() === cName) return true
      if (cName.length >= 4 && p.clientName && (p.clientName.toLowerCase().includes(cName) || cName.includes(p.clientName.toLowerCase()))) return true
      return false
    })
  }, [client, paymentsVersion])

  const recordedPaymentsTotal = useMemo(() => {
    return clientRecordedPayments.reduce((s, p) => s + cleanNum(p.amount), 0)
  }, [clientRecordedPayments])

  // Filter adjustments for this specific client
  const clientAdjustments = useMemo(() => {
    if (!client) return []
    return adjustments.filter(a =>
      a.client_id === client.id ||
      (a.client_name && a.client_name.toLowerCase().trim() === client.full_name.toLowerCase().trim())
    )
  }, [adjustments, client])

  // Advances from the Daily Job Sheet Advance Widget
  const matchedAdvanceWidgetItems = useMemo(() => {
    if (!client) return []
    return dailyAdvanceItems.filter(item => advanceMatchesClient(item, client))
  }, [dailyAdvanceItems, client])

  const widgetAdvanceTotal = useMemo(() => {
    return matchedAdvanceWidgetItems.reduce((s, a) => s + cleanNum(a.advance), 0)
  }, [matchedAdvanceWidgetItems])

  // Automatically fetch complete Daily Job Sheet history for this client
  const clientDailyJobs = useMemo(() => {
    return client ? getClientDailyJobsHistory(client, dailyJobs) : []
  }, [client, dailyJobs])

  const clientBookings = useMemo(() => {
    if (!client) return []
    return bookings
      .filter(b =>
        b.client_id === id ||
        (b.client_name || '').toLowerCase().trim() === client.full_name.toLowerCase().trim()
      )
      .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())
  }, [bookings, id, client])

  // Automatically set default active tab based on available history
  useEffect(() => {
    const tabParam = searchParams.get('tab') as 'job_sheet' | 'financial_history' | 'bookings' | 'info' | null
    if (tabParam) {
      setActiveTab(tabParam)
      return
    }
    if (clientDailyJobs.length > 0) {
      setActiveTab('job_sheet')
    } else if (clientBookings.length > 0) {
      setActiveTab('bookings')
    }
  }, [id, clientDailyJobs.length, clientBookings.length, searchParams])

  // Enrich each job with parsed adjustment, pending, and advance amounts
  // Per business rule: If service amount is deducted from advance, consider it an adjustment with 'ADJ' tag
  const enrichedDailyJobs = useMemo(() => {
    // Same formula as Pending Payments, Overview and Daily Job Sheet
    const pendingCtx = buildPendingCalcContext(clientAdjustments, pendingReceipts)
    return clientDailyJobs.map(job => {
      const charges = cleanNum(job.charges)
      const received = cleanNum(job.received)
      const ot = calcJobOTHours(job)

      // Linked manual adjustments
      const linked = pendingCtx.adjustments.get(job.id)
      const linkedAdvDeduct = clientAdjustments
        .filter(a => a.reference_job_id === job.id && a.type === 'advance_deduction')
        .reduce((s, a) => s + cleanNum(a.amount), 0)

      // Is service amount deducted from advance?
      const isRemarkDeduction = isJobPaidFromAdvance(job)
      const isAdvanceDeducted = linkedAdvDeduct > 0 || isRemarkDeduction
      const advanceDeductionAmount = linkedAdvDeduct > 0
        ? linkedAdvDeduct
        : (isRemarkDeduction ? charges : 0)

      // Total adjustment for this job (includes advance deduction per user rule:
      // "Agar service amount advance mein say deduct ho, toh usay adjustment amount consider kartay huay us par 'ADJ' ka tag lagaya jaye.")
      const totalJobAdjustment = calcJobAdjustment(job, linked)
      const effectiveDue = Math.max(0, charges - totalJobAdjustment)
      const pending = calcJobPending(job, pendingCtx)

      const advance = received > effectiveDue && !isAdvanceDeducted
        ? received - effectiveDue
        : 0

      return {
        ...job,
        cleanCharges: charges,
        cleanReceived: received,
        otHours: ot,
        adjustment: totalJobAdjustment,
        pending,
        advance,
        isAdvanceDeducted,
        advanceDeductionAmount,
      }
    })
  }, [clientDailyJobs, clientAdjustments, pendingReceipts])

  const isClientMonthly = useMemo(() => {
    if (!client) return false
    return isMonthlyClient(client, clientDailyJobs)
  }, [client, clientDailyJobs])

  const handleDeductJobFromAdvance = (job: any) => {
    if (!client) return
    const amt = job.cleanCharges || cleanNum(job.charges)
    if (amt <= 0) return

    const newRecord: ClientFinancialAdjustment = {
      id: `adj-adv-${Date.now()}`,
      client_id: client.id,
      client_name: client.full_name,
      date: job.date || todayDubai(),
      type: 'advance_deduction',
      amount: amt,
      notes: `Service charges deducted from client advance balance [ADJ] (${job.service || 'Shift'})`,
      reference_job_id: job.id,
      created_at: new Date().toISOString(),
    }
    saveAdjustments([newRecord, ...adjustments])
  }

  if (!client) {
    return (
      <div className="space-y-6">
        <Link to="/clients" className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft size={14} /> Back to Clients
        </Link>
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-16 text-center">
          <p className="text-slate-500 font-medium">Client not found.</p>
        </div>
      </div>
    )
  }

  const completed     = clientBookings.filter(b => b.status === 'completed')
  // UX-98 audit: only today or later (past "confirmed" bookings were listed), soonest first, plus visits on the sheet
  // R-SCHED-15: plus the schedule's visits of the next 4 weeks not on the sheet yet
  const upcoming      = [...upcomingVisits(clientBookings, clientDailyJobs, todayDubai()), ...(client ? scheduledVisitsAhead(client, clientDailyJobs, todayDubai()) : [])]
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  // UX-162: one visit row — the Upcoming widget and the full list ("+N more")
  const renderUpcomingVisit = (v: (typeof upcoming)[number]) => {
    const d = new Date(`${v.date}T00:00:00`)
    return (
      <li key={v.key} className="flex items-center gap-3 bg-white/90 rounded-2xl border border-emerald-100 px-3 py-2.5">
        <div className="w-12 shrink-0 rounded-xl bg-emerald-600 text-white text-center py-1 leading-tight">
          <p className="text-[9.5px] font-bold uppercase tracking-wide opacity-90">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</p>
          <p className="text-[16px] font-black">{d.getDate()}</p>
          <p className="text-[9.5px] font-semibold opacity-90">{d.toLocaleDateString('en-GB', { month: 'short' })}</p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-[#111827] truncate">{v.label}</p>
          <p className="text-[11.5px] text-slate-600 flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1"><CalendarDays size={11} className="text-emerald-600" />{d.toLocaleDateString('en-GB', { weekday: 'long' })}, {formatDate(v.date)}</span>
            {v.time && <span className="inline-flex items-center gap-1"><Clock size={11} className="text-emerald-600" />{formatTimeOnly(v.time)}</span>}
          </p>
          <p className="text-[11.5px] mt-0.5 flex items-center gap-1 min-w-0">
            <Users size={11} className="text-emerald-600 shrink-0" />
            {v.cleaners
              ? <span className="font-semibold text-emerald-900 truncate" title={v.cleaners}>{v.cleaners}</span>
              : <span className="text-amber-700 font-semibold">No cleaner yet</span>}
          </p>
        </div>
        {v.status === 'on_sheet'
          ? <span title="Already a row on the Job Sheet for this date — change the time or cleaner there (UX-172)" className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 shrink-0 cursor-help">On sheet</span>
          : v.status === 'scheduled'
            ? <span title="From the monthly schedule — added to the Job Sheet when that day is opened" className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 shrink-0 cursor-help">Scheduled</span>
            : <StatusPill status={v.status} />}
      </li>
    )
  }
  const sheetSummary  = jobSheetSummary(clientDailyJobs, todayDubai())
  const bookingSpent  = completed.reduce((s, b) => s + b.total_amount, 0)
  const reviewedCount = completed.filter(b => reviewMap[b.id]).length

  // Financial summary from Job Sheet & Adjustments (including live recorded payments)
  const totalDJCharges = enrichedDailyJobs.reduce((s, j) => s + j.cleanCharges, 0)
  const totalDJReceived = enrichedDailyJobs.reduce((s, j) => s + j.cleanReceived, 0) + recordedPaymentsTotal
  const totalDJOTHours = Math.round(enrichedDailyJobs.reduce((s, j) => s + j.otHours, 0) * 10) / 10
  const totalDJDutyHours = Math.round(clientDailyJobs.reduce((s, j) => s + (Number(j.duty_hours) || 0), 0) * 10) / 10

  // Standalone adjustments (not tied to specific job) + initial client adjustment
  const standaloneAdjustments = clientAdjustments.filter(a => !a.reference_job_id && a.type !== 'advance' && a.type !== 'advance_deduction')
  const standaloneAdjSum = standaloneAdjustments.reduce((s, a) => s + cleanNum(a.amount), 0)
  const standaloneAdvanceDeductions = clientAdjustments.filter(a => !a.reference_job_id && a.type === 'advance_deduction').reduce((s, a) => s + cleanNum(a.amount), 0)

  // Total adjustments includes all job adjustments (including advance deductions tagged with ADJ), standalone adjustments, and initial adjustment
  const totalDJAdjustment = enrichedDailyJobs.reduce((s, j) => s + j.adjustment, 0) + standaloneAdjSum + standaloneAdvanceDeductions + (client.adjustment_amount || 0)

  // Standalone advance payments + initial client advance + widget advances
  const standaloneAdvance = clientAdjustments.filter(a => a.type === 'advance').reduce((s, a) => s + cleanNum(a.amount), 0)
  const initialClientAdvance = cleanNum(client.advance_amount)
  const totalGrossAdvance = initialClientAdvance + standaloneAdvance + widgetAdvanceTotal + enrichedDailyJobs.reduce((s, j) => s + (!j.isAdvanceDeducted ? j.advance : 0), 0)

  // Total service amount deducted from advance
  const jobsAdvanceDeductionTotal = enrichedDailyJobs.filter(j => j.isAdvanceDeducted).reduce((s, j) => s + j.advanceDeductionAmount, 0)
  const totalServiceDeductedFromAdvance = jobsAdvanceDeductionTotal + standaloneAdvanceDeductions

  // Net remaining advance available
  const netRemainingAdvance = Math.max(0, totalGrossAdvance - totalServiceDeductedFromAdvance)

  // Total Pending: unpaid jobs + opening balance still unpaid after Pending Received collections and client payments
  const totalDJPending = Math.max(0, enrichedDailyJobs.reduce((s, j) => s + j.pending, 0) + calcClientOpeningPending(client, pendingReceipts) - recordedPaymentsTotal)

  // Overall totals — every booking already has a mirrored Daily Job (booking_id),
  // so those jobs are counted once, through the booking
  const clientBookingIds = new Set(clientBookings.map(b => b.id))
  const unlinkedDailyJobs = clientDailyJobs.filter(j => !j.booking_id || !clientBookingIds.has(j.booking_id))
  const unlinkedDJCharges = unlinkedDailyJobs.reduce((s, j) => s + cleanNum(j.charges), 0)
  const totalLifetimeSpent = Math.max(client.total_spent, bookingSpent + unlinkedDJCharges)
  const totalServices = clientBookings.length + unlinkedDailyJobs.length

  // Invoices summary
  const clientInvoices = invoices.filter(i =>
    i.client_id === id || i.client_name.toLowerCase().trim() === client.full_name.toLowerCase().trim()
  )
  const totalInvoiced = clientInvoices.filter(i => i.status !== 'void').reduce((s, i) => s + i.total, 0) // INV-A07: void counts nowhere
  const totalPaid     = clientInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const outstanding   = totalInvoiced - totalPaid

  // Filtered Job Sheet rows by live search
  const filteredDailyJobs = enrichedDailyJobs.filter(j => {
    const q = jobSearch.toLowerCase().trim()
    if (!q) return true
    return (
      (j.date && j.date.includes(q)) ||
      (j.staff_name && j.staff_name.toLowerCase().includes(q)) ||
      (j.service && j.service.toLowerCase().includes(q)) ||
      (j.remarks && j.remarks.toLowerCase().includes(q)) ||
      (j.payment_mode && j.payment_mode.toLowerCase().includes(q)) ||
      (j.address && j.address.toLowerCase().includes(q))
    )
  })

  // Unified Comprehensive Financial History Ledger
  type LedgerSource = 'job_sheet' | 'invoice' | 'adjustment' | 'advance' | 'advance_widget'
  interface LedgerEntry {
    id: string
    date: string
    source: LedgerSource
    title: string
    refNumber: string
    details: string
    cleaner?: string
    charges: number
    received: number
    pending: number
    advance: number
    adjustment: number
    otHours: number
    status: 'paid' | 'pending' | 'advance' | 'adjusted' | 'draft'
  }

  const allLedgerEntries: LedgerEntry[] = [
    // 1. Every Job Sheet Shift
    ...enrichedDailyJobs.map((job): LedgerEntry => {
      const isDeducted = job.isAdvanceDeducted
      return {
        id: `job-${job.id}`,
        date: job.date || '—',
        source: 'job_sheet',
        title: isDeducted ? `${job.service || 'Cleaning Shift'} [ADJ - From Advance]` : (job.service || 'Cleaning Shift'),
        refNumber: isDeducted
          ? `ADJ-SHIFT (${formatTimeOnly(job.start_time)} - ${formatTimeOnly(job.end_time)})`
          : `Shift (${formatTimeOnly(job.start_time)} - ${formatTimeOnly(job.end_time)})`,
        details: [
          job.staff_name ? `Cleaner: ${job.staff_name}` : '',
          job.address || '',
          isDeducted ? `[ADJ] AED ${job.advanceDeductionAmount} deducted from advance credit` : '',
          job.remarks || '',
        ].filter(Boolean).join(' · '),
        cleaner: job.staff_name,
        charges: job.cleanCharges,
        received: job.cleanReceived,
        pending: job.pending,
        advance: job.advance,
        adjustment: job.adjustment,
        otHours: job.otHours,
        status: job.pending > 0 ? 'pending' : job.advance > 0 ? 'advance' : job.adjustment > 0 ? 'adjusted' : 'paid',
      }
    }),

    // 2. Invoices
    ...clientInvoices.map((inv): LedgerEntry => {
      const invPaid = inv.status === 'paid' ? inv.total : 0
      const invPending = inv.status === 'paid' ? 0 : inv.total
      return {
        id: `inv-${inv.id}`,
        date: inv.created_at ? inv.created_at.split('T')[0] : inv.due_date || '—',
        source: 'invoice',
        title: `Tax Invoice`,
        refNumber: inv.invoice_number,
        details: inv.line_items?.map(l => l.description).join(', ') || 'Cleaning & Maintenance Services',
        charges: inv.total,
        received: invPaid,
        pending: invPending,
        advance: 0,
        adjustment: 0,
        otHours: 0,
        status: inv.status === 'paid' ? 'paid' : 'pending',
      }
    }),

    // 3. Standalone Client Adjustments & Advance Deposits
    ...clientAdjustments.map((adj): LedgerEntry => {
      const isAdv = adj.type === 'advance'
      const isAdvDeduct = adj.type === 'advance_deduction'
      const adjAmt = cleanNum(adj.amount)
      return {
        id: `adj-${adj.id}`,
        date: adj.date || '—',
        source: isAdv ? 'advance' : 'adjustment',
        title: isAdv
          ? 'Advance Payment Deposit'
          : isAdvDeduct
            ? 'Service Deducted from Advance [ADJ]'
            : `Financial Adjustment (${adj.type.toUpperCase()}) [ADJ]`,
        refNumber: isAdvDeduct ? 'ADJ-DEDUCT' : isAdv ? `ADV-${adj.id.slice(-4)}` : `ADJ-${adj.id.slice(-4)}`,
        details: adj.notes || (isAdvDeduct ? 'Service charges deducted from client advance balance [ADJ]' : `${adj.type} recorded for client account`),
        charges: 0,
        received: isAdv ? adjAmt : 0,
        pending: 0,
        advance: isAdv ? adjAmt : 0,
        adjustment: isAdv ? 0 : adjAmt,
        otHours: 0,
        status: isAdv ? 'advance' : 'adjusted',
      }
    }),

    // 4. Advances recorded from Daily Job Sheet Advance Widget
    ...matchedAdvanceWidgetItems.map((advItem): LedgerEntry => ({
      id: `adv-widget-${advItem.id}`,
      date: advItem.date || '—',
      source: 'advance_widget',
      title: `Daily Job Sheet Advance Widget`,
      refNumber: `ADV-WIDGET`,
      details: `Advance credit logged on Daily Job Sheet for "${advItem.client}" · Received: AED ${cleanNum(advItem.received).toLocaleString()}`,
      charges: 0,
      received: cleanNum(advItem.received),
      pending: 0,
      advance: cleanNum(advItem.advance),
      adjustment: 0,
      otHours: 0,
      status: 'advance',
    })),

    // 5. Recorded Client Payments (Unified Payments System)
    ...clientRecordedPayments.map((p): LedgerEntry => ({
      id: `pay-${p.id}`,
      date: p.date || '—',
      source: 'advance' as LedgerSource,
      title: `Client Payment (${p.paymentMethod})`,
      refNumber: p.referenceNumber || `PAY-${p.id.slice(-4)}`,
      details: [
        p.invoiceMonth ? `Period: ${p.invoiceMonth}` : '',
        p.notes || '',
        `Recorded via Payments System`,
      ].filter(Boolean).join(' · '),
      cleaner: '—',
      charges: 0,
      received: cleanNum(p.amount),
      pending: 0,
      advance: 0,
      adjustment: 0,
      otHours: 0,
      status: 'paid',
    })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  // Filtered Ledger Entries
  const filteredLedgerEntries = allLedgerEntries.filter(item => {
    // Type filter
    if (ledgerFilter === 'pending' && item.pending <= 0) return false
    if (ledgerFilter === 'advance' && item.advance <= 0) return false
    if (ledgerFilter === 'adjustment' && item.adjustment <= 0) return false
    if (ledgerFilter === 'invoices' && item.source !== 'invoice') return false

    // Search filter
    const q = ledgerSearch.toLowerCase().trim()
    if (!q) return true
    return (
      item.date.includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.refNumber.toLowerCase().includes(q) ||
      item.details.toLowerCase().includes(q) ||
      (item.cleaner && item.cleaner.toLowerCase().includes(q))
    )
  })

  const handleCreateAdjustment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!client) return
    const amt = cleanNum(newAdjAmount)
    if (amt <= 0) return

    const newRecord: ClientFinancialAdjustment = {
      id: `adj-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      client_id: client.id,
      client_name: client.full_name,
      date: newAdjDate || todayDubai(),
      type: newAdjType,
      amount: amt,
      notes: newAdjNotes.trim(),
      reference_job_id: newAdjJobId || undefined,
      created_at: new Date().toISOString(),
    }

    saveAdjustments([newRecord, ...adjustments])
    setNewAdjModalOpen(false)
    setNewAdjAmount('')
    setNewAdjNotes('')
    setNewAdjJobId('')
  }

  const handleDeleteAdjustment = (adjId: string) => {
    if (confirm('Are you sure you want to delete this financial adjustment record?')) {
      saveAdjustments(adjustments.filter(a => a.id !== adjId))
    }
  }

  function crewNames(ids: string[]) {
    return ids.map(cid => employees.find(e => e.id === cid)?.full_name ?? '').filter(Boolean).join(', ')
  }

  function buildMessage(b: Booking) {
    const name = client!.full_name
    return `Hi ${name},\n\nThank you for choosing Safaeewala Cleaning & Maintenance! We hope you were fully satisfied with your ${b.service_type} service on ${formatDate(b.scheduled_date)} at ${b.service_address}.\n\nWe'd love to hear your feedback — a quick review would mean a lot to us and helps us keep our quality high.\n\nThank you for being a valued client! 🙏\n\nSafaeewala Team\n+971 55 628 2374`
  }

  function markSent(b: Booking) {
    persistReview(b.id)
    setReviewMap(m => ({ ...m, [b.id]: new Date().toISOString() }))
  }

  const reviewMsg = reviewBooking ? buildMessage(reviewBooking) : ''
  const waNumber  = (client.whatsapp || client.phone).replace(/\D/g, '')

  return (
    <div className="space-y-6">

      {/* Back nav */}
      <div className="flex items-center justify-between">
        <Link
          to="/clients"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Clients
        </Link>
      </div>

      {/* ── Client Dark Hero Card (CRM Signature Dark Slate-Teal Theme — Unified) ── */}
      <div className="relative rounded-[24px] bg-[#0F1F19] text-white border border-teal-800/60 shadow-[0_14px_45px_rgba(4,47,46,0.35)] p-6 sm:p-7 overflow-hidden">
        {/* Ambient Glow Effects (Indigo & Sapphire) */}
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-teal-400/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-emerald-400/15 blur-3xl pointer-events-none" />

        {/* UX-98: actions inside the header — light primary, outlined secondary, readable on the dark card */}
        <div className="relative z-20 flex items-center gap-2 flex-wrap sm:absolute sm:top-6 sm:right-7 mb-4 sm:mb-0">
          <button
            type="button"
            onClick={() => setShowPaymentModal(true)}
            className="flex items-center gap-2 text-[13px] font-bold px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-[#04201c] shadow-sm transition-colors cursor-pointer"
          >
            <Wallet size={14} /> Record Payment
          </button>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <Pencil size={13} /> Edit Profile
          </button>
          {(client.whatsapp || client.phone) && (
            <button type="button" onClick={() => navigateTo(`/whatsapp-crm?phone=${encodeURIComponent(client.whatsapp || client.phone || '')}&name=${encodeURIComponent(client.full_name || '')}`)}
              title="Open the WhatsApp chat with this client (R-WA-01)"
              className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer">
              <MessageCircle size={13} /> WhatsApp
            </button>
          )}
          <div className="relative" ref={heroMenuRef}>
            <button type="button" onClick={() => setHeroMenuOpen(v => !v)} aria-label="More actions" aria-expanded={heroMenuOpen}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer">
              <MoreVertical size={15} />
            </button>
            {heroMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-[#E2E5E0] shadow-xl py-1.5 z-50">
                <button type="button"
                  onClick={async () => {
                    setHeroMenuOpen(false)
                    const ok = await confirmAsync({ title: 'Delete client', message: deletionMessage(client, clientDeletionImpact(client, dailyJobs, todayDubai(), { bookings, invoices, contractNames: safeLocalStorageGet<{ clientName?: string }[]>(CONTRACTS_KEY, []).map(k => k.clientName || '') })), confirmLabel: 'Delete', tone: 'danger', typeToConfirm: client.full_name }) // UX-165, R-CLI-11
                    if (!ok) return
                    deleteClient(client.id)
                    notify.success(`${client.full_name} deleted`)
                    navigateTo('/clients')
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold text-red-600 hover:bg-red-50 cursor-pointer">
                  <Trash2 size={14} /> Delete Profile
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row items-start gap-5 sm:pr-[300px]">
          <Avatar name={client.full_name} size="xl" idx={clientIdx} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-[22px] sm:text-[26px] font-black text-white tracking-tight">{client.full_name}</h1>
              <SourceOriginTag source={resolveClientSource(client, bookings)} />
              {isClientMonthly && (
                <span className="text-[10px] bg-emerald-500 text-white font-extrabold px-2.5 py-0.5 rounded-full shadow-2xs tracking-wider uppercase">
                  Monthly
                </span>
              )}
              {totalLifetimeSpent > 2000 && (
                <span className="text-[11px] bg-amber-950/80 text-amber-300 border border-amber-600/70 px-2.5 py-0.5 rounded-full font-bold">
                  VIP
                </span>
              )}
              {totalServices >= 2 && !isClientMonthly && ( // UX-100: Monthly already says it repeats
                <span className="text-[11px] bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 px-2.5 py-0.5 rounded-full font-bold">
                  Repeat Client
                </span>
              )}
              {client.pet_info && (
                <span className="text-[11px] bg-rose-950/80 text-rose-300 border border-rose-700/60 px-2.5 py-0.5 rounded-full font-bold">
                  Pet
                </span>
              )}
            </div>

            {client.nationality && <p className="text-[12.5px] text-teal-200/70 mb-2.5">{client.nationality}</p>}

            <div className="flex flex-wrap gap-2 text-[12px] text-slate-200 mt-2">
              {client.phone ? (
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/70 border border-slate-700/70 hover:border-teal-400 hover:text-white transition-colors">
                  <Phone size={12} className="text-teal-400" /> {client.phone}
                </a>
              ) : (
                <span className="text-teal-300/50 text-[11.5px] italic">No phone added</span>
              )}
              {/* R-CLI-14: the client's other numbers */}
              {(client.other_phones || []).filter(Boolean).map(n => (
                <a key={n} href={`tel:${n}`} title="Other number" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/70 border border-slate-700/70 hover:border-teal-400 hover:text-white transition-colors">
                  <Phone size={12} className="text-teal-400/70" /> {n}
                </a>
              ))}
              {client.email && (
                <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/70 border border-slate-700/70 hover:border-teal-400 hover:text-white transition-colors">
                  <Mail size={12} className="text-teal-400" /> {client.email}
                </a>
              )}
              {(client.building_name || client.area) && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/70 border border-slate-700/70 text-slate-200">
                  <MapPin size={12} className="text-teal-400 shrink-0" />
                  {formatClientAddress(client, true)}
                </span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* UX-159: the totals once, under the header (like the Daily Job Sheet) — not repeated in the tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-3.5">
        <KpiCard label="Charges" value={`AED ${totalDJCharges.toLocaleString()}`} sub={`${clientDailyJobs.length} service shift${clientDailyJobs.length === 1 ? '' : 's'}`} icon={FileText} labelColor="text-purple-700" iconSolid="bg-[#7c3aed] shadow-purple-500/25" />
        <KpiCard label="Received" value={`AED ${totalDJReceived.toLocaleString()}`} sub="Cash & online paid" icon={CheckCircle} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" />
        <KpiCard label="Pending" value={`AED ${totalDJPending.toLocaleString()}`} sub="Outstanding dues" icon={AlertCircle} labelColor="text-red-600" iconSolid="bg-[#dc2626] shadow-red-500/25"
          chip={totalDJPending > 0 ? 'View ledger' : undefined} chipTone="down" onClick={totalDJPending > 0 ? () => setActiveTab('financial_history') : undefined} />
        <KpiCard label="Advance" value={`AED ${netRemainingAdvance.toLocaleString()}`} sub={totalServiceDeductedFromAdvance > 0 ? `AED ${totalServiceDeductedFromAdvance.toLocaleString()} used` : 'Available credit'} icon={PiggyBank} labelColor="text-teal-700" iconSolid="bg-[#0d9488] shadow-teal-500/25" />
        <KpiCard label="Adjustment" value={`AED ${totalDJAdjustment.toLocaleString()}`} sub={`${clientAdjustments.length} record${clientAdjustments.length === 1 ? '' : 's'}`} icon={SlidersHorizontal} labelColor="text-indigo-700" iconSolid="bg-[#4f46e5] shadow-indigo-500/25" />
        <KpiCard label="Overtime" value={`${totalDJOTHours}h`} sub={`${totalDJDutyHours}h duty in all`} icon={Clock} labelColor="text-amber-700" iconSolid="bg-[#d97706] shadow-amber-500/25" />
      </div>

      {/* ── UX-98: main content over the full width; the summary widgets below it ── */}
      <div className="space-y-6">

        {/* Service History Tabs */}
        <div className="space-y-4">

          {/* Tab Navigation */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-3 py-3">
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveTab('job_sheet')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
                  activeTab === 'job_sheet'
                    ? 'bg-emerald-700 text-white shadow-xs' /* UX-162: was purple */
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <FileText size={14} />
                Daily Job Sheet History ({clientDailyJobs.length})
              </button>

              <button
                onClick={() => setActiveTab('financial_history')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
                  activeTab === 'financial_history'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Wallet size={14} />
                <span>Financial History & Ledger ({allLedgerEntries.length})</span>
                <span className="text-[9px] bg-indigo-600 text-white font-black px-1.5 py-0.2 rounded uppercase">
                  ADJ
                </span>
              </button>

              <button
                onClick={() => setActiveTab('bookings')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
                  activeTab === 'bookings'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Calendar size={14} />
                Booking Records ({clientBookings.length})
              </button>

              <button
                onClick={() => setActiveTab('info')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
                  activeTab === 'info'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <User size={14} />
                Client Details
              </button>
            </div>
          </div>

          {/* ── Daily Job Sheet History Tab ── */}
          {activeTab === 'job_sheet' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2">
                    <FileText size={16} className="text-emerald-700" />
                    Daily Job Sheet Service History
                  </h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {clientDailyJobs.length} past service record{clientDailyJobs.length !== 1 ? 's' : ''} synchronized from Daily Job Sheet
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search shifts, cleaner, remarks…"
                      value={jobSearch}
                      onChange={e => setJobSearch(e.target.value)}
                      className="text-[12px] pl-8 pr-3 py-1.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* UX-159: the totals are in the cards under the header; Customize keeps only the table columns */}
              <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#E4E8EC] flex justify-end">
                <LayoutCustomizer sections={[{ title: 'Columns', items: HISTORY_COLUMN_ITEMS, layout: historyCols }]} />
              </div>

              {filteredDailyJobs.length === 0 ? (
                <div className="py-16 text-center">
                  <Calendar className="mx-auto mb-3 text-slate-300" size={36} strokeWidth={1.25} />
                  <p className="text-[13px] text-slate-500 font-medium">
                    {clientDailyJobs.length === 0
                      ? 'No service history recorded in Daily Job Sheet for this client.'
                      : 'No shifts match your search filter.'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                    Any new job entries logged with this address or client name in Daily Job Sheet will automatically be aggregated here.
                  </p>
                </div>
              ) : (() => {
                type Row = (typeof filteredDailyJobs)[number]
                const dash = <span className="text-slate-300 font-medium">—</span>
                const cols: Record<string, { th: string; head: string; td: string; cell: (job: Row) => React.ReactNode }> = {
                  date:      { th: 'Date', head: 'py-3 px-4', td: 'py-3 px-4 font-bold text-slate-800 whitespace-nowrap', cell: j => (j.date ? formatDate(j.date) : '—') },
                  cleaner:   { th: 'Cleaner', head: 'py-3 px-3', td: 'py-3 px-3 font-semibold text-slate-700 whitespace-nowrap', cell: j => j.staff_name || '—' },
                  timing:    { th: 'Timing', head: 'py-3 px-3', td: 'py-3 px-3 text-slate-500 whitespace-nowrap', cell: j => `${formatTimeOnly(j.start_time)} - ${formatTimeOnly(j.end_time)}` },
                  duty:      { th: 'Duty', head: 'py-3 px-2 text-center', td: 'py-3 px-2 text-center font-bold text-slate-700', cell: j => (cleanNum(j.duty_hours) ? `${cleanNum(j.duty_hours)}h` : '—') },
                  ot:        { th: 'OT', head: 'py-3 px-2 text-center', td: 'py-3 px-2 text-center', cell: j => (j.otHours > 0
                    ? <span className="inline-block bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full text-[10.5px] border border-amber-200">{j.otHours}h OT</span>
                    : <span className="text-slate-400">0h</span>) },
                  charges:   { th: 'Charges', head: 'py-3 px-3 text-right', td: 'py-3 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap', cell: j => `AED ${j.cleanCharges.toLocaleString()}` },
                  received:  { th: 'Received', head: 'py-3 px-3 text-right', td: 'py-3 px-3 text-right font-semibold text-emerald-700 whitespace-nowrap', cell: j => `AED ${j.cleanReceived.toLocaleString()}` },
                  pending:   { th: 'Pending', head: 'py-3 px-3 text-right', td: 'py-3 px-3 text-right font-bold whitespace-nowrap', cell: j => (j.pending > 0
                    ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-200">AED {j.pending.toLocaleString()}</span> : dash) },
                  advance:   { th: 'Advance', head: 'py-3 px-3 text-right', td: 'py-3 px-3 text-right font-bold whitespace-nowrap', cell: j => (j.advance > 0
                    ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">AED {j.advance.toLocaleString()}</span> : dash) },
                  adjustment:{ th: 'Adjustment', head: 'py-3 px-3 text-center', td: 'py-3 px-3 text-center whitespace-nowrap', cell: j => (j.adjustment > 0 ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full text-[11px] shadow-2xs">
                      <span className="bg-indigo-700 text-white text-[9px] font-black px-1.5 py-0.2 rounded uppercase">ADJ</span>
                      <span>AED {j.adjustment.toLocaleString()}</span>
                      {j.isAdvanceDeducted && <span className="text-[8.5px] bg-purple-100 text-purple-700 px-1 py-0.2 rounded font-extrabold">From Adv</span>}
                    </span>) : dash) },
                  mode:      { th: 'Mode', head: 'py-3 px-3', td: 'py-3 px-3 whitespace-nowrap', cell: j => (
                    <div className="flex items-center gap-1">
                      <PaymentModeBadge mode={j.isAdvanceDeducted ? 'Advance' : j.payment_mode} />
                      {j.isAdvanceDeducted && <span className="bg-indigo-700 text-white text-[8.5px] font-black px-1.5 py-0.2 rounded uppercase" title="Deducted from Advance (Adjustment)">ADJ</span>}
                    </div>) },
                  material:  { th: 'Material', head: 'py-3 px-3', td: 'py-3 px-3 text-slate-600 whitespace-nowrap', cell: j => j.material || 'No' },
                  remarks:   { th: 'Service & Remarks', head: 'py-3 px-4', td: 'py-3 px-4 text-slate-600 max-w-[220px] truncate', cell: j => (<>
                    {j.service && <span className="font-semibold text-slate-700 mr-1.5">{j.service}</span>}
                    {j.remarks || (!j.service ? '—' : '')}
                  </>) },
                  action:    { th: 'Action', head: 'py-3 px-3 text-center', td: 'py-3 px-3 text-center whitespace-nowrap', cell: j => (j.isAdvanceDeducted ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full"><Check size={10} className="text-emerald-600" /> Settled [ADJ]</span>
                  ) : j.pending > 0 && netRemainingAdvance > 0 ? (
                    <button type="button" onClick={() => handleDeductJobFromAdvance(j)}
                      className="inline-flex items-center gap-1 text-[10.5px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                      title="Deduct service charges from client advance balance and tag with ADJ">
                      <span className="bg-indigo-700 text-white text-[8px] font-black px-1 py-0.2 rounded">ADJ</span><span>Deduct Adv</span>
                    </button>
                  ) : dash) },
                }
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <tr>{historyCols.visible.map(id => <th key={id} className={`${cols[id].head} whitespace-nowrap`}>{cols[id].th}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E8EC]">
                        {filteredDailyJobs.map(job => (
                          <tr key={job.id} className="hover:bg-emerald-50/40 transition-colors" title={cols.remarks && job.remarks ? job.remarks : undefined}>
                            {historyCols.visible.map(id => <td key={id} className={cols[id].td}>{cols[id].cell(job)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── Financial History & Ledger Tab ── */}
          {activeTab === 'financial_history' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden space-y-4">
              
              {/* Header with Title and Add Adjustment button */}
              <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-emerald-50/50 via-white to-indigo-50/30">
                <div>
                  <h3 className="text-[16px] font-bold text-[#111827] flex items-center gap-2">
                    <Wallet size={18} className="text-emerald-700" />
                    Complete Financial History & Ledger
                    <span className="text-[10px] bg-indigo-700 text-white font-black px-2 py-0.5 rounded-full uppercase shadow-xs">
                      ADJ Verified
                    </span>
                  </h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Chronological audit trail of all charges, receipts, advances, pending balances, and adjustments
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <Wallet size={13} />
                    <span>Record Payment</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAdjModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-[12px] font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Record Adjustment / Advance</span>
                  </button>
                </div>
              </div>

              {/* ── Daily Job Sheet Advance Widget Records Banner ── */}
              <div className="p-4 bg-amber-50/50 border-b border-amber-200">
                <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-amber-200/70 text-amber-900">
                      <Wallet size={15} />
                    </span>
                    <div>
                      <h4 className="text-[13px] font-bold text-slate-900 flex items-center gap-2">
                        <span>Advance Widget Records (Daily Job Sheet)</span>
                        <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.2 rounded-full border border-amber-300">
                          {matchedAdvanceWidgetItems.length} Recorded
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Advances logged via the Daily Job Sheet Advance Widget matching this client
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10.5px] text-slate-500 font-bold block uppercase tracking-wider">Total Widget Advance</span>
                    <span className="text-[16px] font-black text-amber-800">AED {widgetAdvanceTotal.toLocaleString()}</span>
                  </div>
                </div>

                {matchedAdvanceWidgetItems.length === 0 ? (
                  <div className="p-3 bg-white/80 rounded-xl border border-amber-200/60 text-[12px] text-slate-500 italic">
                    No advances currently logged for "{client.full_name}" in the Daily Job Sheet Advance Widget. Any advance added in the Daily Job Sheet widget will instantly appear here.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {matchedAdvanceWidgetItems.map(item => (
                      <div key={item.id} className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded border border-amber-200">
                              ADV-WIDGET
                            </span>
                            <span className="text-[11px] text-slate-400 font-semibold">{item.date ? formatDate(item.date) : 'Recent'}</span>
                          </div>
                          <p className="text-[12.5px] font-bold text-slate-800 truncate max-w-[170px]" title={item.client}>
                            {item.client}
                          </p>
                          <span className="text-[11px] text-emerald-600 font-medium">Received: AED {cleanNum(item.received).toLocaleString()}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-amber-700 block">Advance Credit</span>
                          <span className="text-[15px] font-black text-amber-800">AED {cleanNum(item.advance).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Filter and Search Bar */}
              <div className="px-6 py-2 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                  {(['all', 'pending', 'advance', 'adjustment', 'invoices'] as const).map(filterKey => {
                    const isSel = ledgerFilter === filterKey
                    const label = filterKey === 'all'
                      ? `All (${allLedgerEntries.length})`
                      : filterKey === 'pending'
                        ? `Pending Due (${allLedgerEntries.filter(i => i.pending > 0).length})`
                        : filterKey === 'advance'
                          ? `Advance Deposits (${allLedgerEntries.filter(i => i.advance > 0).length})`
                          : filterKey === 'adjustment'
                            ? `Adjustments [ADJ] (${allLedgerEntries.filter(i => i.adjustment > 0).length})`
                            : `Invoices (${allLedgerEntries.filter(i => i.source === 'invoice').length})`

                    return (
                      <button
                        key={filterKey}
                        type="button"
                        onClick={() => setLedgerFilter(filterKey)}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          isSel
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>

                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search ledger entries..."
                    value={ledgerSearch}
                    onChange={e => setLedgerSearch(e.target.value)}
                    className="text-[12px] pl-8 pr-3 py-1.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 w-52"
                  />
                </div>
              </div>

              {/* Detailed Financial Ledger Table */}
              {filteredLedgerEntries.length === 0 ? (
                <div className="py-16 text-center">
                  <Wallet className="mx-auto mb-3 text-slate-300" size={36} strokeWidth={1.25} />
                  <p className="text-[13px] text-slate-500 font-medium">No financial transactions match your filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-3">Type & Reference</th>
                        <th className="py-3 px-4">Description / Notes</th>
                        <th className="py-3 px-3 text-right">Charges</th>
                        <th className="py-3 px-3 text-right">Received</th>
                        <th className="py-3 px-3 text-right">Pending</th>
                        <th className="py-3 px-3 text-right">Advance</th>
                        <th className="py-3 px-3 text-center">Adjustment (ADJ)</th>
                        <th className="py-3 px-3 text-center">Status</th>
                        <th className="py-3 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4E8EC]">
                      {filteredLedgerEntries.map(item => {
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                              {item.date && item.date !== '—' ? formatDate(item.date) : '—'}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${
                                item.source === 'job_sheet'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : item.source === 'invoice'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : item.source === 'advance_widget'
                                      ? 'bg-amber-100 text-amber-850 border-amber-300 font-extrabold'
                                      : item.source === 'advance'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}>
                                {item.refNumber}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-700 max-w-[240px] truncate" title={item.details}>
                              <span className="font-semibold block text-slate-800">{item.title}</span>
                              <span className="text-[11px] text-slate-500">{item.details}</span>
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-slate-800 whitespace-nowrap">
                              {item.charges > 0 ? `AED ${item.charges.toLocaleString()}` : '—'}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                              {item.received > 0 ? `AED ${item.received.toLocaleString()}` : '—'}
                            </td>
                            <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                              {item.pending > 0 ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-200">
                                  AED {item.pending.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-medium">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                              {item.advance > 0 ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  AED {item.advance.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-medium">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {item.adjustment > 0 ? (
                                <span className="inline-flex items-center gap-1 font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full text-[11px] shadow-2xs">
                                  <span className="bg-indigo-700 text-white text-[9px] font-black px-1.5 py-0.2 rounded uppercase">
                                    ADJ
                                  </span>
                                  <span>AED {item.adjustment.toLocaleString()}</span>
                                </span>
                              ) : (
                                <span className="text-slate-300 font-medium">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                item.status === 'paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.status === 'pending'
                                    ? 'bg-red-100 text-red-800'
                                    : item.status === 'advance'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-indigo-100 text-indigo-800'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {item.id.startsWith('adj-') && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAdjustment(item.id.replace('adj-', ''))}
                                  className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer p-1"
                                  title="Delete manual entry"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Booking Records Tab ── */}
          {activeTab === 'bookings' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Booking Records</h3>
                <p className="text-[12px] text-slate-500 mt-0.5">{clientBookings.length} total · {completed.length} completed · {reviewedCount} reviews requested</p>
              </div>
              {clientBookings.length === 0 ? (
                <div className="py-16 text-center">
                  <Calendar className="mx-auto mb-3 text-slate-300" size={36} strokeWidth={1.25} />
                  <p className="text-[13px] text-slate-500">No bookings yet for this client</p>
                </div>
              ) : (
                <div className="divide-y divide-[#E4E8EC]">
                  {clientBookings.map(b => (
                    <div key={b.id} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <p className="text-[13px] font-bold text-[#111827]">{b.service_type}</p>
                            <StatusPill status={b.status} />
                            {reviewMap[b.id] && (
                              <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                <CheckCircle size={10} /> Review Requested
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-[12px] text-slate-500">
                            <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(b.scheduled_date)} at {formatTimeOnly(b.scheduled_time)}</span>
                            <span className="flex items-center gap-1"><MapPin size={11} className="shrink-0" /> {b.service_address}</span>
                            {b.assigned_crew?.length > 0 && (
                              <span className="flex items-center gap-1"><User size={11} /> {crewNames(b.assigned_crew)}</span>
                            )}
                            <span className="flex items-center gap-1"><Clock size={11} /> {b.duration_hours}h</span>
                          </div>
                          {b.notes && (
                            <p className="text-[11.5px] text-slate-400 mt-1.5 italic">"{b.notes}"</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[15px] font-bold text-[#111827]">AED {b.total_amount.toLocaleString()}</p>
                          {b.status === 'completed' && (
                            <button
                              onClick={() => { setReviewBooking(b); setCopied(false) }}
                              className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                                reviewMap[b.id]
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              <Star size={11} />
                              {reviewMap[b.id] ? 'Re-request' : 'Ask Review'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Client Info ── */}
          {activeTab === 'info' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-[#111827]">Client Details</h3>
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-[12px] font-semibold text-purple-600 hover:underline cursor-pointer"
                >
                  Edit Information
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  {[
                    { label: 'Full Name',         value: client.full_name },
                    { label: 'Phone',             value: client.phone || '—' },
                    { label: 'WhatsApp',          value: client.whatsapp || client.phone || '—' },
                    { label: 'Email',             value: client.email || '—' },
                    { label: 'Nationality',       value: client.nationality || '—' },
                    { label: 'Building / Villa',  value: client.building_name || '—' },
                    { label: 'Apartment',         value: client.apartment || '—' },
                    { label: 'Area',              value: client.area || '—' },
                    { label: 'City',              value: client.city || 'Dubai' },
                    { label: 'Preferred Cleaner', value: client.preferred_cleaner || '—' },
                    { label: 'Client Since',      value: formatDate(client.created_at) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-2.5 border-b border-[#E4E8EC] last:border-0">
                      <span className="text-[12px] text-slate-500">{label}</span>
                      <span className="text-[12px] font-semibold text-[#111827] text-right ml-4">{value}</span>
                    </div>
                  ))}
                </div>
                {(client.remarks || client.access_notes) && (
                  <div className="mt-4">
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-2">Remarks / Notes</p>
                    <p className="text-[13px] text-slate-700 bg-amber-50 border border-amber-100 rounded-xl p-3">{client.remarks || client.access_notes}</p>
                  </div>
                )}
                {((client.advance_amount ?? 0) > 0 || (client.adjustment_amount ?? 0) > 0 || (client.pending_amount ?? 0) > 0) && (
                  <div className="mt-4 bg-slate-50 border border-[#E4E8EC] rounded-xl p-3">
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-2">Initial Financial Balances</p>
                    <div className="grid grid-cols-3 gap-2 text-[12px]">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-emerald-700 font-bold uppercase">Advance</p>
                        <p className="font-extrabold text-emerald-800">AED {(client.advance_amount ?? 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-indigo-700 font-bold uppercase flex items-center justify-center gap-1">
                          <span>Adjustment</span>
                          <span className="bg-indigo-700 text-white text-[7.5px] font-black px-1 rounded">ADJ</span>
                        </p>
                        <p className="font-extrabold text-indigo-800">AED {(client.adjustment_amount ?? 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-rose-700 font-bold uppercase">Pending</p>
                        <p className="font-extrabold text-rose-800">AED {(client.pending_amount ?? 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── UX-159: summary widgets — Upcoming 60 % · Financial Summary 40 %, the same on every tab ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
          {/* UX-159: Upcoming — wide, light green, day + date + time and the cleaners on each visit */}
          <section className="lg:col-span-3 rounded-[22px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-50/30 shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <header className="px-5 py-4 border-b border-emerald-200/70 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm"><CalendarDays size={17} /></span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-emerald-950 leading-tight">Upcoming Bookings</h3>
                  <p className="text-[11.5px] text-emerald-800/70 leading-tight">Bookings, visits on the sheet and the schedule of the next 4 weeks</p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-white/80 border border-emerald-200 px-2.5 py-0.5 rounded-full shrink-0">{upcoming.length}</span>
            </header>
            <div className="p-4">
              {upcoming.length === 0 ? (
                <p className="text-[12.5px] text-emerald-900/60 text-center py-6">No upcoming bookings or visits</p>
              ) : (
                <ul className="space-y-2">
                  {upcoming.slice(0, 6).map(renderUpcomingVisit)}
                  {upcoming.length > 6 && (
                    <li className="text-center pt-1">
                      <button type="button" onClick={() => setShowAllUpcoming(true)}
                        className="text-[12px] font-bold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 cursor-pointer">
                        +{upcoming.length - 6} more — see all
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </section>

          {/* Financial summary */}
          <Widget title="Financial Summary" note="Charges, payments and balance" icon={Wallet} className="lg:col-span-2 h-full"
            actions={
              <button
                type="button"
                onClick={() => {
                  setActiveTab('financial_history')
                  setNewAdjModalOpen(true)
                }}
                className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
              >
                + ADJ / Advance
              </button>
            }>
            
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between py-1.5 border-b border-[#E4E8EC]">
                <span className="text-slate-500">Total Charges</span>
                <span className="font-extrabold text-[#111827]">AED {totalDJCharges.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E4E8EC]">
                <span className="text-slate-500">Total Received</span>
                <span className="font-bold text-emerald-700">AED {totalDJReceived.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E4E8EC]">
                <span className="text-slate-500">Pending Amount</span>
                <span className={`font-bold ${totalDJPending > 0 ? 'text-red-600 font-extrabold' : 'text-slate-400'}`}>
                  {totalDJPending > 0 ? `AED ${totalDJPending.toLocaleString()}` : 'Nil'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E4E8EC]">
                <span className="text-slate-500">Advance Amount</span>
                <span className="font-bold text-emerald-700">
                  {netRemainingAdvance > 0 ? `AED ${netRemainingAdvance.toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E4E8EC] items-center">
                <span className="text-slate-500 flex items-center gap-1.5">
                  Adjustment
                  <span className="bg-indigo-700 text-white text-[8.5px] font-black px-1.5 py-0.2 rounded uppercase">
                    ADJ
                  </span>
                </span>
                <span className="font-bold text-indigo-700">
                  {totalDJAdjustment > 0 ? `AED ${totalDJAdjustment.toLocaleString()}` : '—'}
                </span>
              </div>
              {clientInvoices.length > 0 && (
                <div className="flex justify-between py-1.5 border-b border-[#E4E8EC]">
                  <span className="text-slate-500">Invoices</span>
                  <span className="text-slate-600">{clientInvoices.length} total</span>
                </div>
              )}
            </div>

            {totalDJPending > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('financial_history')}
                className="w-full mt-3.5 block bg-red-50 border border-red-200 rounded-xl p-2.5 text-center hover:bg-red-100 transition-colors cursor-pointer"
              >
                <p className="text-[11px] font-semibold text-red-700">
                  AED {totalDJPending.toLocaleString()} pending balance — view ledger →
                </p>
              </button>
            )}
          </Widget>

        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          {/* Daily Job Sheet summary widget */}
          {clientDailyJobs.length > 0 && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-1.5">
                  <FileText size={16} className="text-emerald-700" /> Job Sheet Summary
                </h3>
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full" title="Shifts up to today · scheduled ahead">
                  {sheetSummary.worked} worked{sheetSummary.ahead > 0 ? ` · ${sheetSummary.ahead} ahead` : ''}
                </span>
              </div>
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                  <span className="text-slate-500">Charges</span>
                  <span className="font-extrabold text-slate-900">AED {totalDJCharges.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                  <span className="text-slate-500">Overtime (OT)</span>
                  <span className="font-bold text-amber-600">{totalDJOTHours} hrs</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                  <span className="text-slate-500">Duty Hours</span>
                  <span className="font-bold text-slate-700">{totalDJDutyHours} hrs</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                  <span className="text-slate-500">Last worked</span>
                  <span className="font-bold text-slate-700">{sheetSummary.lastWorked ? formatDate(sheetSummary.lastWorked) : '—'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Cleaners</span>
                  <span className="font-medium text-slate-700 text-right truncate ml-2" title={sheetSummary.cleaners.join(', ')}>
                    {sheetSummary.cleaners.join(', ') || '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Last service */}
          {client.last_service && (
            <div className="bg-slate-50 border border-[#E4E8EC] rounded-[22px] p-5">
              <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1">Last Service Date</p>
              <p className="text-[14px] font-bold text-[#111827]">{formatDate(client.last_service)}</p>
            </div>
          )}
        </div>
      </div>
      {/* UX-162: every upcoming booking / visit ("+N more") */}
      <Modal open={showAllUpcoming} onClose={() => setShowAllUpcoming(false)} title={`Upcoming bookings · ${upcoming.length}`} size="lg">
        <ul className="space-y-2">{upcoming.map(renderUpcomingVisit)}</ul>
      </Modal>

      {/* ── Edit Client Modal (Unified with Add New Client pop-up) ── */}
      <ClientModalForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initialClient={client}
        employees={employees}
        isMonthly={isClientMonthly}
        isSaving={editSaving}
        onSave={async patch => {
          if (!client) return
          setEditSaving(true)
          // CM-01: a client built here from a booking or job-sheet row is not in the client list yet —
          // updateClient found nothing and the edit was lost; save it as a client under the same id
          if (clients.some(c => c.id === client.id)) updateClient(client.id, patch)
          else addClient({ ...client, ...patch, id: client.id })

          // Sync initial advance or adjustment to financial adjustments ledger if changed
          const adv = patch.advance_amount ?? 0
          const adj = patch.adjustment_amount ?? 0
          if (adv > 0 || adj > 0) {
            const todayStr = todayDubai()
            const existingAdjs = safeLocalStorageGet<ClientFinancialAdjustment[]>('safaeewala_client_adjustments', []) || []
            let newEntries = [...existingAdjs]

            if (adv > 0 && adv !== (client.advance_amount ?? 0)) {
              newEntries.push({
                id: 'adj-adv-' + Date.now(),
                client_id: client.id,
                client_name: patch.full_name || client.full_name,
                date: todayStr,
                type: 'advance',
                amount: adv,
                notes: 'Updated opening advance balance',
                created_at: new Date().toISOString(),
              })
            }
            if (adj > 0 && adj !== (client.adjustment_amount ?? 0)) {
              newEntries.push({
                id: 'adj-adj-' + Date.now(),
                client_id: client.id,
                client_name: patch.full_name || client.full_name,
                date: todayStr,
                type: 'discount',
                amount: adj,
                notes: 'Updated opening adjustment balance (ADJ)',
                created_at: new Date().toISOString(),
              })
            }
            safeLocalStorageSet('safaeewala_client_adjustments', newEntries)
            setAdjustments(newEntries)
          }

          setEditSaving(false)
          setEditOpen(false)
        }}
      />

      {/* ── Review Request Modal ── */}
      <Modal
        open={!!reviewBooking}
        onClose={() => { setReviewBooking(null); setCopied(false) }}
        title="Request Client Review"
        size="md"
      >
        {reviewBooking && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-[#E4E8EC] rounded-xl p-3">
              <p className="text-[12px] font-semibold text-slate-600">{reviewBooking.service_type} · {formatDate(reviewBooking.scheduled_date)}</p>
              <p className="text-[11.5px] text-slate-500 mt-0.5">{reviewBooking.service_address}</p>
            </div>

            <div>
              <p className="text-[12px] font-bold text-slate-600 uppercase tracking-[0.08em] mb-2">Message Preview</p>
              <textarea
                value={reviewMsg}
                readOnly
                rows={9}
                className="w-full text-[12px] text-slate-700 bg-slate-50 border border-[#E4E8EC] rounded-xl p-3.5 resize-none leading-relaxed"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => {
                  void copyText(reviewMsg)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2500)
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#E4E8EC] text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {copied
                  ? <><CheckCircle size={13} className="text-emerald-600" /> Copied!</>
                  : <><Copy size={13} /> Copy Message</>
                }
              </button>

              {waNumber ? (
                <a
                  href={`https://wa.me/${waNumber}?text=${encodeURIComponent(reviewMsg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => markSent(reviewBooking)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <MessageCircle size={13} /> Send via WhatsApp
                </a>
              ) : (
                <button
                  onClick={() => { markSent(reviewBooking); setReviewBooking(null) }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <CheckCircle size={13} /> Mark as Sent
                </button>
              )}
            </div>

            {reviewMap[reviewBooking.id] ? (
              <p className="text-[11px] text-slate-400 text-center">
                Last requested {new Date(reviewMap[reviewBooking.id]).toLocaleDateString()}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 text-center">
                Clicking "Send via WhatsApp" will open WhatsApp and mark this booking as review requested.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ── Record Financial Adjustment / Advance Modal ── */}
      <Modal
        open={newAdjModalOpen}
        onClose={() => setNewAdjModalOpen(false)}
        title="Record Financial Adjustment / Advance"
        size="md"
      >
        <form onSubmit={handleCreateAdjustment} className="space-y-4">
          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Transaction / Adjustment Type
            </label>
            <select
              value={newAdjType}
              onChange={e => setNewAdjType(e.target.value as any)}
              className="w-full text-[13px] bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-emerald-500"
            >
              <option value="discount">Service Discount (ADJ tag)</option>
              <option value="waiver">Goodwill Waiver (ADJ tag)</option>
              <option value="advance_deduction">Service Deducted from Advance (ADJ tag)</option>
              <option value="credit">Account Credit Adjustment (ADJ tag)</option>
              <option value="settlement">Settlement Adjustment (ADJ tag)</option>
              <option value="correction">Billing Correction (ADJ tag)</option>
              <option value="advance">Advance Payment Deposit</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Amount (AED) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                placeholder="e.g. 50"
                value={newAdjAmount}
                onChange={e => setNewAdjAmount(e.target.value)}
                className="w-full text-[13px] font-bold bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={newAdjDate}
                onChange={e => setNewAdjDate(e.target.value)}
                className="w-full text-[13px] bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {clientDailyJobs.length > 0 && (
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Attach to Specific Shift (Optional)
              </label>
              <select
                value={newAdjJobId}
                onChange={e => setNewAdjJobId(e.target.value)}
                className="w-full text-[12px] bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-emerald-500"
              >
                <option value="">— Standalone Client Adjustment (General) —</option>
                {clientDailyJobs.slice(0, 10).map(j => (
                  <option key={j.id} value={j.id}>
                    {j.date} · {j.service || 'Shift'} by {j.staff_name} (AED {cleanNum(j.charges)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Reason / Notes *
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g. Loyalty discount agreed with client, advance cash deposit for upcoming sessions, etc."
              value={newAdjNotes}
              onChange={e => setNewAdjNotes(e.target.value)}
              className="w-full text-[12px] bg-slate-50 border border-[#E4E8EC] rounded-xl p-3 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E4E8EC]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewAdjModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
            >
              Save Financial Entry
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Record Payment Modal (Fully Synced with Payments System) ── */}
      <RecordPaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        initialClientName={client.full_name}
        initialClientId={client.id}
        initialAmount={totalDJPending > 0 ? totalDJPending : undefined}
        onSuccess={() => setPaymentsVersion(v => v + 1)}
      />
    </div>
  )
}
