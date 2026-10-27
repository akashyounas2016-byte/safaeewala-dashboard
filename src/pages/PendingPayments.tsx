import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Clock, AlertCircle, CheckCircle, CheckCircle2, DollarSign,
  TrendingUp, Users, Calendar, Search, X, ChevronLeft, ChevronRight,
  ChevronDown, Download, Plus, Filter, RotateCcw, ClipboardList,
  Building2, Phone, MapPin, Receipt, ArrowUpDown, ExternalLink,
  Wallet, Sparkles, UserCheck, Trash2, Edit2, ShieldAlert
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { notify, confirmAsync } from '@/lib/notify'
import { ReceivablesNav } from '@/components/receivables/ReceivablesNav'
import { ReceivablesByClient, type CollectMode } from '@/components/receivables/ReceivablesByClient'
import { CashBook } from '@/components/receivables/CashBook'
import { Pager, usePagination } from '@/components/common/Pager'
import { invoicedJobIds, invoiceBalance } from '@/lib/receivables'
import type { DailyJob, DailyPendingItem, DailyPendingReceivedItem } from '@/types'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { buildPendingCalcContext, loadClientAdjustments, calcJobCollectable, splitStaffNames, calcJobLaterReceipts, isBogusJob } from '@/lib/clientDataSync'
import * as XLSX from 'xlsx'

export type PendingDatePreset =
  | 'today'
  | '7days'
  | '14days'
  | '28days'
  | 'this_month'
  | 'last_month'
  | '3months'
  | '6months'
  | 'this_year'
  | 'last_year'
  | 'all_time'
  | 'custom'

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const parts = dateStr.split('-').map(Number)
    if (parts.length === 3) {
      const [y, m, d] = parts
      const date = new Date(y, m - 1, d)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    return dateStr
  } catch {
    return dateStr
  }
}

function cleanNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const str = String(val).trim()
  if (!str || str === '—' || str === '-' || str.toLowerCase() === 'nil' || str.toLowerCase() === 'n/a') return 0
  const cleaned = str.replace(/[^0-9.-]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export interface UnifiedPendingRecord {
  id: string
  date: string
  clientName: string
  staffName: string
  address: string
  area: string
  service?: string
  charges: number
  received: number
  pendingAmount: number
  source: 'Daily Job Sheet' | 'Manual / Side Table' | 'Invoice'
  invoiceId?: string
  status: 'pending' | 'partially_paid' | 'collected'
  jobId?: string
  rawJob?: DailyJob
  remarks?: string
  paymentMode?: string
}

export function PendingPayments() {
  const { dailyJobs, invoices, updateInvoice, clients } = useData()
  const [searchParams] = useSearchParams()

  // ── Tab State ──
type PendingTab = 'outstanding' | 'recovered' | 'staff_summary' | 'by_client' | 'cash_book'
  const tabFromUrl = (): PendingTab => {
    const t = searchParams.get('tab')
    return t === 'recovered' || t === 'staff_summary' || t === 'by_client' || t === 'cash_book' ? t : 'outstanding'
  }
  const [activeTab, setActiveTab] = useState<PendingTab>(tabFromUrl)
  // The shared Receivables tab bar (UX-01) switches tabs through the URL
  useEffect(() => { setActiveTab(tabFromUrl()) }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pending Lists from LocalStorage (Synced with Daily Job Sheet) ──
  const [pendingList, setPendingList] = useState<DailyPendingItem[]>(() =>
    safeLocalStorageGet<DailyPendingItem[]>('safaeewala_daily_pending_items', [])
  )

  // Keep every record — this list is written back to storage, so filtering here
  // would delete the Daily Job Sheet's own "Pending Received" entries (pr-*)
  const [pendingRcvdList, setPendingRcvdList] = useState<DailyPendingReceivedItem[]>(() => {
    const list = safeLocalStorageGet<DailyPendingReceivedItem[]>('safaeewala_daily_pending_rcvd_items', [])
    return Array.isArray(list) ? list : []
  })

  const pendingCtx = useMemo(() => buildPendingCalcContext(loadClientAdjustments(), pendingRcvdList), [pendingRcvdList])
  // Jobs billed on a sent invoice are collected through that invoice (UX-18)
  const invoicedIds = useMemo(() => invoicedJobIds(invoices), [invoices])

  useEffect(() => {
    safeLocalStorageSet('safaeewala_daily_pending_items', pendingList)
  }, [pendingList])

  useEffect(() => {
    safeLocalStorageSet('safaeewala_daily_pending_rcvd_items', pendingRcvdList)
  }, [pendingRcvdList])

  // ── Date Filters State ──
  const [datePreset, setDatePreset]           = useState<PendingDatePreset>('28days')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate]     = useState<string>('')
  const [selectedMonth, setSelectedMonth]     = useState<Date>(new Date())
  const [showRangeDropdown, setShowRangeDropdown] = useState(false)

  // ── Search & Filter State ──
  const [search, setSearch]                   = useState('')
  const [staffFilter, setStaffFilter]         = useState('all')
  const [sourceFilter, setSourceFilter]       = useState<'all' | 'job_sheet' | 'manual'>('all')
  const [amountFilter, setAmountFilter]       = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [sortOrder, setSortOrder]             = useState<'highest' | 'lowest' | 'newest' | 'oldest' | 'client_name'>('highest')

  // ── Modal State ──
  const [showAddModal, setShowAddModal]       = useState(false)
  const [collectingRecord, setCollectingRecord] = useState<UnifiedPendingRecord | null>(null)
  const [collectAmount, setCollectAmount]     = useState<string>('')
  const [collectMode, setCollectMode]         = useState<'Cash' | 'Online'>('Cash')
  const [collectNotes, setCollectNotes]       = useState('')
  const [notice, setNotice]                   = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  // Current year constants
  const currentYear = new Date().getFullYear()
  const lastYear = currentYear - 1

  // ── Compute Active Date Range ──
  const activeRange = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    if (datePreset === 'today') {
      return {
        start: todayStr,
        end: todayStr,
        label: 'Today',
        sub: formatDisplayDate(todayStr),
        isAllTime: false,
      }
    }
    if (datePreset === '7days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      const start = d.toISOString().split('T')[0]
      return {
        start,
        end: todayStr,
        label: 'Last 7 Days',
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(todayStr)}`,
        isAllTime: false,
      }
    }
    if (datePreset === '14days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 13)
      const start = d.toISOString().split('T')[0]
      return {
        start,
        end: todayStr,
        label: 'Last 14 Days',
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(todayStr)}`,
        isAllTime: false,
      }
    }
    if (datePreset === '28days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 27)
      const start = d.toISOString().split('T')[0]
      return {
        start,
        end: todayStr,
        label: 'Last 28 Days',
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(todayStr)}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'this_month') {
      const y = selectedMonth.getFullYear()
      const m = String(selectedMonth.getMonth() + 1).padStart(2, '0')
      const lastDay = new Date(y, selectedMonth.getMonth() + 1, 0).getDate()
      const start = `${y}-${m}-01`
      const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
      const mName = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      return {
        start,
        end,
        label: `Month: ${mName}`,
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'last_month') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const y = prev.getFullYear()
      const m = String(prev.getMonth() + 1).padStart(2, '0')
      const lastDay = new Date(y, prev.getMonth() + 1, 0).getDate()
      const start = `${y}-${m}-01`
      const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
      const mName = prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      return {
        start,
        end,
        label: `Last Month (${mName})`,
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`,
        isAllTime: false,
      }
    }
    if (datePreset === '3months') {
      const d = new Date(now)
      d.setDate(d.getDate() - 89)
      const start = d.toISOString().split('T')[0]
      return {
        start,
        end: todayStr,
        label: 'Last 3 Months (90 Days)',
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(todayStr)}`,
        isAllTime: false,
      }
    }
    if (datePreset === '6months') {
      const d = new Date(now)
      d.setDate(d.getDate() - 179)
      const start = d.toISOString().split('T')[0]
      return {
        start,
        end: todayStr,
        label: 'Last 6 Months (180 Days)',
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(todayStr)}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'this_year') {
      return {
        start: `${currentYear}-01-01`,
        end: `${currentYear}-12-31`,
        label: `This Year (${currentYear})`,
        sub: `Jan 01, ${currentYear} – Dec 31, ${currentYear}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'last_year') {
      return {
        start: `${lastYear}-01-01`,
        end: `${lastYear}-12-31`,
        label: `Last Year (${lastYear})`,
        sub: `Jan 01, ${lastYear} – Dec 31, ${lastYear}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'custom') {
      return {
        start: customStartDate,
        end: customEndDate,
        label: 'Custom Range',
        sub: customStartDate && customEndDate
          ? `${formatDisplayDate(customStartDate)} – ${formatDisplayDate(customEndDate)}`
          : 'Pick custom start & end date',
        isAllTime: false,
      }
    }
    // all_time
    return {
      start: '',
      end: '',
      label: 'All-Time Records',
      sub: 'Complete pending history across all recorded shifts',
      isAllTime: true,
    }
  }, [datePreset, selectedMonth, customStartDate, customEndDate, currentYear, lastYear])

  // Helper: check if date is in active range
  const isDateInRange = (dateStr: string) => {
    if (activeRange.isAllTime) return true
    if (!dateStr) return false
    if (activeRange.start && dateStr < activeRange.start) return false
    if (activeRange.end && dateStr > activeRange.end) return false
    return true
  }

  // ── Unified Outstanding Pending Records ──
  const allOutstandingRecords: UnifiedPendingRecord[] = useMemo(() => {
    const list: UnifiedPendingRecord[] = []

    // 1. From Daily Jobs: where charges > received or payment_mode is 'Pending'
    dailyJobs.forEach(job => {
      if (isBogusJob(job)) return
      const chg = cleanNum(job.charges)
      const rec = cleanNum(job.received) + calcJobLaterReceipts(job, pendingCtx)
      const due = calcJobCollectable(job, pendingCtx, invoicedIds)

      // Only real dues — a fully paid row stays out even if its mode says "Pending"
      if (due > 0) {
        const client = job.address || job.area || 'Client'
        list.push({
          id: `job-${job.id}`,
          date: job.date || '',
          clientName: client,
          staffName: job.staff_name || '—',
          address: job.address || '—',
          area: job.area || '—',
          service: job.service || 'Cleaning Shift',
          charges: chg,
          received: rec,
          pendingAmount: due,
          source: 'Daily Job Sheet',
          status: rec > 0 ? 'partially_paid' : 'pending',
          jobId: job.id,
          rawJob: job,
          remarks: job.remarks || '',
          paymentMode: job.payment_mode,
        })
      }
    })

    // 2. From manual/imported Pending Items list (safaeewala_daily_pending_items)
    pendingList.forEach(item => {
      const amt = cleanNum(item.amount)
      if (amt > 0) {
        list.push({
          id: item.id,
          date: item.date || '',
          clientName: item.client || 'Client Account',
          staffName: (item as any).staff || '—',
          address: item.client || '—',
          area: '—',
          service: 'Account Balance Due',
          charges: amt,
          received: 0,
          pendingAmount: amt,
          source: 'Manual / Side Table',
          status: 'pending',
          remarks: (item as any).remarks || 'Pending dues from Daily Job Sheet side widget',
        })
      }
    })

    // 3. Unpaid / partly paid invoices (their visits are not listed separately) — UX-18
    invoices.forEach(inv => {
      if (inv.status === 'draft') return
      const due = invoiceBalance(inv)
      if (due <= 0) return
      list.push({
        id: `inv-${inv.id}`,
        date: (inv.created_at || '').split('T')[0] || inv.due_date,
        clientName: inv.client_name,
        staffName: '—',
        address: inv.client_address || '—',
        area: '—',
        service: `Invoice ${inv.invoice_number}`,
        charges: inv.total,
        received: Number(inv.amount_paid) || 0,
        pendingAmount: due,
        source: 'Invoice',
        status: (Number(inv.amount_paid) || 0) > 0 ? 'partially_paid' : 'pending',
        invoiceId: inv.id,
        remarks: inv.status === 'overdue' ? `Overdue since ${inv.due_date}` : `Due ${inv.due_date}`,
      })
    })

    return list
  }, [dailyJobs, pendingList, pendingCtx, invoices, invoicedIds])

  // Filtered Outstanding Records
  const filteredOutstanding = useMemo(() => {
    return allOutstandingRecords
      .filter(rec => {
        // Date match
        if (!isDateInRange(rec.date)) return false

        // Search match
        const q = search.toLowerCase().trim()
        if (q) {
          const matchClient = rec.clientName?.toLowerCase().includes(q)
          const matchStaff = rec.staffName?.toLowerCase().includes(q)
          const matchAddr = rec.address?.toLowerCase().includes(q)
          const matchArea = rec.area?.toLowerCase().includes(q)
          const matchService = rec.service?.toLowerCase().includes(q)
          const matchRemarks = rec.remarks?.toLowerCase().includes(q)
          const matchAmt = String(rec.pendingAmount).includes(q)
          if (!matchClient && !matchStaff && !matchAddr && !matchArea && !matchService && !matchRemarks && !matchAmt) return false
        }

        // Staff filter
        if (staffFilter !== 'all') {
          const want = staffFilter.toLowerCase().trim()
          if (!splitStaffNames(rec.staffName).some(n => n.toLowerCase().trim() === want)) return false
        }

        // Source filter
        if (sourceFilter !== 'all') {
          if (sourceFilter === 'job_sheet' && rec.source !== 'Daily Job Sheet') return false
          if (sourceFilter === 'manual' && rec.source !== 'Manual / Side Table') return false
        }

        // Amount filter
        if (amountFilter !== 'all') {
          if (amountFilter === 'high' && rec.pendingAmount < 500) return false
          if (amountFilter === 'medium' && (rec.pendingAmount < 200 || rec.pendingAmount >= 500)) return false
          if (amountFilter === 'low' && rec.pendingAmount >= 200) return false
        }

        return true
      })
      .sort((a, b) => {
        if (sortOrder === 'lowest') return a.pendingAmount - b.pendingAmount
        if (sortOrder === 'highest') return b.pendingAmount - a.pendingAmount
        if (sortOrder === 'oldest') return (a.date || '').localeCompare(b.date || '')
        if (sortOrder === 'client_name') return (a.clientName || '').localeCompare(b.clientName || '')
        // Default newest
        return (b.date || '').localeCompare(a.date || '')
      })
  }, [allOutstandingRecords, activeRange, search, staffFilter, sourceFilter, amountFilter, sortOrder])

  // Filtered Recovered / Pending Received Records
  const filteredRecovered = useMemo(() => {
    return pendingRcvdList
      .filter(rec => isDateInRange(rec.date))
      .filter(rec => {
        const q = search.toLowerCase().trim()
        if (!q) return true
        return (
          rec.client?.toLowerCase().includes(q) ||
          String(cleanNum(rec.cash) + cleanNum(rec.online)).includes(q)
        )
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [pendingRcvdList, activeRange, search])

  // ── Executive KPIs Calculations ──
  const totalPendingAmount = useMemo(() => {
    return filteredOutstanding.reduce((sum, r) => sum + r.pendingAmount, 0)
  }, [filteredOutstanding])

  const jobSheetPendingAmount = useMemo(() => {
    return filteredOutstanding
      .filter(r => r.source === 'Daily Job Sheet')
      .reduce((sum, r) => sum + r.pendingAmount, 0)
  }, [filteredOutstanding])

  const manualPendingAmount = useMemo(() => {
    return filteredOutstanding
      .filter(r => r.source === 'Manual / Side Table')
      .reduce((sum, r) => sum + r.pendingAmount, 0)
  }, [filteredOutstanding])

  const totalRecoveredAmount = useMemo(() => {
    return filteredRecovered.reduce((sum, r) => sum + cleanNum(r.cash) + cleanNum(r.online), 0)
  }, [filteredRecovered])

  const highValuePending = useMemo(() => {
    return filteredOutstanding.filter(r => r.pendingAmount >= 500)
  }, [filteredOutstanding])

  const highValueAmount = useMemo(() => {
    return highValuePending.reduce((s, r) => s + r.pendingAmount, 0)
  }, [highValuePending])

  const recoveryRate = useMemo(() => {
    const totalExposure = totalPendingAmount + totalRecoveredAmount
    if (totalExposure === 0) return 0
    return Math.round((totalRecoveredAmount / totalExposure) * 100)
  }, [totalPendingAmount, totalRecoveredAmount])

  // Known staff list for filter
  const distinctStaffList = useMemo(() => {
    const set = new Set<string>()
    allOutstandingRecords.forEach(r => {
      if (r.staffName && r.staffName !== '—') splitStaffNames(r.staffName).forEach(n => set.add(n))
    })
    return Array.from(set).sort()
  }, [allOutstandingRecords])

  // By Staff Summary
  const staffPendingSummary = useMemo(() => {
    const map = new Map<string, { count: number; totalAmount: number; clients: string[] }>()
    filteredOutstanding.forEach(r => {
      // A shared shift ("Sita, Rupa") is split between its cleaners (AUD-26)
      const names = r.staffName && r.staffName !== '—' ? splitStaffNames(r.staffName) : []
      const staffList = names.length > 0 ? names : ['Unassigned / Direct']
      staffList.forEach(staff => {
        if (!map.has(staff)) {
          map.set(staff, { count: 0, totalAmount: 0, clients: [] })
        }
        const entry = map.get(staff)!
        entry.count += 1
        entry.totalAmount += r.pendingAmount / staffList.length
        if (!entry.clients.includes(r.clientName)) {
          entry.clients.push(r.clientName)
        }
      })
    })
    return Array.from(map.entries())
      .map(([staff, data]) => ({ staff, ...data }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
  }, [filteredOutstanding])

  const outPager = usePagination(filteredOutstanding, 25)
  const recPager = usePagination(filteredRecovered, 25)

  // ── Mark as Collected Action ──
  const handleOpenCollectModal = (record: UnifiedPendingRecord) => {
    setCollectingRecord(record)
    setCollectAmount(String(record.pendingAmount))
    setCollectMode('Cash')
    setCollectNotes('')
  }

  /**
   * Apply one received amount to dues, oldest first: job rows get a receipt linked by job_id,
   * manual items are reduced, invoices get amount_paid (and status "paid" when settled).
   * Returns the amount actually applied.
   */
  const applyCollection = (records: UnifiedPendingRecord[], amount: number, mode: CollectMode, notes: string): number => {
    let remaining = amount
    const todayStr = new Date().toISOString().split('T')[0]
    const isCash = mode === 'Cash'
    const receipts: DailyPendingReceivedItem[] = []
    const manualCuts = new Map<string, number>()
    const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    sorted.forEach((rec, i) => {
      if (remaining <= 0) return
      // the last record takes any excess (overpayment), others at most their due
      const pay = i === sorted.length - 1 ? remaining : Math.min(remaining, rec.pendingAmount)
      if (pay <= 0) return
      remaining -= pay
      if (rec.invoiceId) {
        const inv = invoices.find(x => x.id === rec.invoiceId)
        if (!inv) return
        const paid = (Number(inv.amount_paid) || 0) + pay
        updateInvoice(inv.id, paid >= inv.total - 0.01
          ? { amount_paid: inv.total, status: 'paid', paid_date: todayStr }
          : { amount_paid: Math.round(paid * 100) / 100 })
        return
      }
      if (!rec.jobId) manualCuts.set(rec.id, (manualCuts.get(rec.id) || 0) + pay)
      receipts.push({
        id: `rcvd-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        date: todayStr,
        client: rec.clientName,
        cash: isCash ? pay : 0,
        online: isCash ? 0 : pay,
        job_id: rec.jobId,
        method: mode,
        remarks: notes.trim() || undefined,
      })
    })
    if (manualCuts.size > 0) {
      setPendingList(prev => prev
        .map(item => {
          const cut = manualCuts.get(item.id)
          if (!cut) return item
          const left = cleanNum(item.amount) - cut
          return left > 0 ? { ...item, amount: left } : null
        })
        .filter(Boolean) as DailyPendingItem[])
    }
    if (receipts.length > 0) setPendingRcvdList(prev => [...receipts, ...prev])
    return amount - remaining
  }

  const handleCollectForClient = (records: UnifiedPendingRecord[], amount: number, mode: CollectMode, notes: string) => {
    if (!(amount > 0)) { notify.error('Please enter a valid collected amount.'); return }
    const applied = applyCollection(records, amount, mode, notes)
    notify.success(`AED ${applied.toLocaleString()} recorded from ${records[0]?.clientName || 'client'} (${mode})`)
  }

  const handleSaveCollection = async () => {
    if (!collectingRecord) return
    const amt = cleanNum(collectAmount)
    if (amt <= 0) {
      notify.error('Please enter a valid collected amount.')
      return
    }
    if (amt > collectingRecord.pendingAmount + 0.01 &&
        !(await confirmAsync({ title: 'More than the amount due', message: `AED ${amt.toLocaleString()} is more than the AED ${collectingRecord.pendingAmount.toLocaleString()} due. Record it anyway?`, confirmLabel: 'Record' }))) {
      return
    }

    // A job's own `received` is left untouched: the receipt is linked by job_id, so the cash
    // counts on the collection day only (not twice). Notes are kept (AUD-25).
    applyCollection([collectingRecord], amt, collectMode, collectNotes)
    setNotice(`Payment of AED ${amt.toLocaleString()} from ${collectingRecord.clientName} marked as collected (${collectMode})!`)
    setCollectingRecord(null)
  }

  // ── Export to Excel ──
  const handleExportExcel = () => {
    if (filteredOutstanding.length === 0 && filteredRecovered.length === 0) {
      notify.info('No pending records to export for this date range.')
      return
    }

    const wb = XLSX.utils.book_new()

    // Sheet 1: Outstanding
    const outRows = filteredOutstanding.map(r => ({
      'Date': r.date,
      'Client Name': r.clientName,
      'Staff / Cleaner': r.staffName,
      'Address': r.address,
      'Area': r.area,
      'Service': r.service || '—',
      'Total Charges (AED)': r.charges,
      'Received So Far (AED)': r.received,
      'Pending Due (AED)': r.pendingAmount,
      'Source': r.source,
      'Status': r.status,
      'Remarks': r.remarks || '—',
    }))
    const ws1 = XLSX.utils.json_to_sheet(outRows)
    XLSX.utils.book_append_sheet(wb, ws1, 'Outstanding Pending')

    // Sheet 2: Recovered
    const rcvdRows = filteredRecovered.map(r => ({
      'Date': r.date,
      'Client': r.client,
      'Cash (AED)': cleanNum(r.cash),
      'Online (AED)': cleanNum(r.online),
      'Total Recovered (AED)': cleanNum(r.cash) + cleanNum(r.online),
    }))
    const ws2 = XLSX.utils.json_to_sheet(rcvdRows)
    XLSX.utils.book_append_sheet(wb, ws2, 'Recovered Payments')

    const cleanLabel = activeRange.label.replace(/[^a-zA-Z0-9_-]/g, '_')
    XLSX.writeFile(wb, `Safaeewala_Pending_Report_${cleanLabel}.xlsx`)
  }

  return (
    <div className="space-y-6 pb-12">

      {/* Action Notice Banner */}
      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span className="text-[13px] font-bold">{notice}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 text-[13px] font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Hero Header */}
      <PageHero
        title="Pending Payments & Recoveries"
        subtitle={`Live reconciliation of outstanding dues from Daily Job Sheet · ${filteredOutstanding.length} Active Accounts`}
        statusChip={`${activeRange.label} · AED ${totalPendingAmount.toLocaleString()} Outstanding`}
        actionLabel="Record Manual Pending"
        onAction={() => setShowAddModal(true)}
        actions={
          <button
            type="button"
            onClick={handleExportExcel}
            className="h-11 px-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-semibold text-sm backdrop-blur-sm transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            title="Export pending records to Excel"
          >
            <Download size={15} strokeWidth={2.2} />
            <span>Export Report</span>
          </button>
        }
        showSearch={false}
      />

      {/* One Receivables module across Pending and Payments (UX-01) */}
      <ReceivablesNav />

      {/* ── Executive KPI Cards (6 Financial & Recovery Cards) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Total Outstanding Pending */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-red-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Pending</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-red-950">AED {totalPendingAmount.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{filteredOutstanding.length} pending accounts</p>
          </div>
        </div>

        {/* Card 2: Recovered / Received Payments */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Recovered</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-emerald-700">AED {totalRecoveredAmount.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{filteredRecovered.length} recoveries in period</p>
          </div>
        </div>

        {/* Card 3: Recovery Rate */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-teal-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Recovery Rate</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-teal-900">{recoveryRate}%</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Recovered vs total dues</p>
          </div>
        </div>

        {/* Card 4: Job Sheet Shift Dues */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Job Sheet Dues</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <ClipboardList size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-amber-900">AED {jobSheetPendingAmount.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">From daily cleaning shifts</p>
          </div>
        </div>

        {/* Card 5: High-Value Priority Dues (> AED 500) */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-orange-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">High Value (&gt;500)</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <ShieldAlert size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-orange-950">AED {highValueAmount.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{highValuePending.length} priority accounts</p>
          </div>
        </div>

        {/* Card 6: Manual Account Dues */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-purple-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Side Widget Dues</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-purple-900">AED {manualPendingAmount.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Direct client pending logs</p>
          </div>
        </div>
      </div>

      {/* ── Date Preset Filter Bar (Quick Pills & Dropdown Engine) ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex items-center justify-between flex-wrap gap-3">
        {/* Left: Active Date Range Display with Month Stepper */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Calendar size={18} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-extrabold text-[#111827]">
                {activeRange.label}
              </h2>
              <span className="text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                {filteredOutstanding.length} Active {filteredOutstanding.length === 1 ? 'Due' : 'Dues'}
              </span>
            </div>
            <p className="text-[11.5px] text-slate-400 mt-0.5 font-medium">
              {activeRange.sub}
            </p>
          </div>

          {datePreset === 'this_month' && (
            <div className="flex items-center gap-1 ml-2 pl-3 border-l border-slate-200">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(selectedMonth)
                  d.setMonth(d.getMonth() - 1)
                  setSelectedMonth(d)
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(selectedMonth)
                  d.setMonth(d.getMonth() + 1)
                  setSelectedMonth(d)
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Right: Quick Pills + Preset Dropdown */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-[#f8fafc] p-1 rounded-xl border border-[#E4E8EC] flex-wrap">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7days', label: '7 Days' },
                { id: '14days', label: '14 Days' },
                { id: '28days', label: '28 Days' },
                { id: 'this_month', label: 'This Month' },
                { id: '3months', label: '3 Months' },
                { id: '6months', label: '6 Months' },
                { id: 'all_time', label: 'All Time' },
              ] as const
            ).map(pill => {
              const active = datePreset === pill.id
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setDatePreset(pill.id)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {pill.label}
                </button>
              )
            })}
          </div>

          {/* More Presets Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRangeDropdown(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#f8fafc] hover:bg-slate-100 border border-[#E4E8EC] rounded-xl text-[12px] font-bold text-slate-700 transition-colors cursor-pointer"
            >
              <span>More Ranges</span>
              <ChevronDown size={14} />
            </button>

            {showRangeDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowRangeDropdown(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#E4E8EC] rounded-2xl shadow-xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1.5">Preset Ranges</p>
                  {[
                    { id: 'today', label: 'Today' },
                    { id: '7days', label: 'Last 7 Days' },
                    { id: '14days', label: 'Last 14 Days' },
                    { id: '28days', label: 'Last 28 Days' },
                    { id: 'this_month', label: 'This Month' },
                    { id: 'last_month', label: 'Last Month' },
                    { id: '3months', label: 'Last 3 Months (90 Days)' },
                    { id: '6months', label: 'Last 6 Months (180 Days)' },
                    { id: 'this_year', label: `This Year (${currentYear})` },
                    { id: 'last_year', label: `Last Year (${lastYear})` },
                    { id: 'all_time', label: 'All-Time Records' },
                    { id: 'custom', label: 'Custom Date Range…' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDatePreset(opt.id as PendingDatePreset)
                        setShowRangeDropdown(false)
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                        datePreset === opt.id ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {datePreset === opt.id && <span className="w-1.5 h-1.5 rounded-full bg-red-600" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Custom Date Range Pickers (Shown only when 'custom' is active) */}
      {datePreset === 'custom' && (
        <div className="bg-red-50/60 border border-red-200 rounded-2xl p-4 flex items-center gap-4 flex-wrap animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-slate-700">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="text-[12.5px] px-3 py-1.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 font-medium"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-slate-700">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="text-[12.5px] px-3 py-1.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 font-medium"
            />
          </div>
          <span className="text-[11.5px] text-slate-500 italic">
            Filters pending records between specified start and end dates inclusive.
          </span>
        </div>
      )}

      {/* ── Segmented Tabs ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white p-2 rounded-2xl border border-[#E4E8EC] shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveTab('outstanding')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'outstanding'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock size={15} />
            <span>Outstanding Pending Dues</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'outstanding' ? 'bg-red-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {filteredOutstanding.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('recovered')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'recovered'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 size={15} />
            <span>Recovered / Received History</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'recovered' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {filteredRecovered.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('staff_summary')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'staff_summary'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users size={15} />
            <span>Pending By Staff / Driver</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'staff_summary' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {staffPendingSummary.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowAddModal(true)}
            className="text-[12px] h-9 px-3.5 bg-red-600 hover:bg-red-700 text-white font-bold shadow-xs cursor-pointer"
          >
            <Plus size={14} className="mr-1" /> Add Manual Pending
          </Button>
        </div>
      </div>

      {/* ── Toolbar: Search & Multi-Filters ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px] flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client name, cleaner, area, or remarks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-[13px] pl-10 pr-9 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 placeholder-slate-400 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Staff Filter */}
          <select
            value={staffFilter}
            onChange={e => setStaffFilter(e.target.value)}
            className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 text-slate-700 cursor-pointer font-medium"
          >
            <option value="all">All Staff / Cleaners</option>
            {distinctStaffList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value as any)}
            className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 text-slate-700 cursor-pointer font-medium"
          >
            <option value="all">All Sources (Job Sheet + Manual)</option>
            <option value="job_sheet">Daily Job Sheet Shifts</option>
            <option value="manual">Manual / Side Widget Entries</option>
          </select>

          {/* Amount Tier Filter */}
          <select
            value={amountFilter}
            onChange={e => setAmountFilter(e.target.value as any)}
            className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 text-slate-700 cursor-pointer font-medium"
          >
            <option value="all">All Amounts</option>
            <option value="high">High Dues (≥ AED 500)</option>
            <option value="medium">Medium Dues (AED 200 – 499)</option>
            <option value="low">Low Dues (&lt; AED 200)</option>
          </select>

          {/* Sort Order */}
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value as any)}
            className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 text-slate-700 cursor-pointer font-medium"
          >
            <option value="highest">Highest Due Amount First</option>
            <option value="lowest">Lowest Due Amount First</option>
            <option value="newest">Newest Date First</option>
            <option value="oldest">Oldest Date First</option>
            <option value="client_name">Client Name (A–Z)</option>
          </select>

          {(search || staffFilter !== 'all' || sourceFilter !== 'all' || amountFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setStaffFilter('all')
                setSourceFilter('all')
                setAmountFilter('all')
              }}
              className="flex items-center gap-1 text-[12px] font-bold text-red-600 hover:text-red-700 py-1 px-2.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} /> Reset Filters
            </button>
          )}
        </div>

        <div className="px-3.5 py-2 rounded-xl bg-red-50 border border-red-200 text-right">
          <span className="text-[10px] uppercase font-bold text-red-800 tracking-wider block">Filtered Due Total</span>
          <span className="text-[15px] font-black text-red-700">
            AED {totalPendingAmount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TAB 1: OUTSTANDING PENDING DUES
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'outstanding' && (
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-bold text-[#111827]">Active Outstanding Dues</h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                {filteredOutstanding.length} accounts
              </span>
            </div>
            <span className="text-[11.5px] text-slate-400">
              Fetched live from Daily Job Sheet & Side Reconciliation logs
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Client Name / Location</th>
                  <th className="py-3 px-4">Cleaner / Staff</th>
                  <th className="py-3 px-4">Source Origin</th>
                  <th className="py-3 px-4 text-right">Original Charge</th>
                  <th className="py-3 px-4 text-right">Paid So Far</th>
                  <th className="py-3 px-4 text-right">Pending Balance</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E8EC]">
                {outPager.pageItems.map(rec => {
                  const isHigh = rec.pendingAmount >= 500
                  return (
                    <tr key={rec.id} className="hover:bg-red-50/30 transition-colors group">
                      {/* Date */}
                      <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {rec.date ? formatDisplayDate(rec.date) : '—'}
                      </td>

                      {/* Client & Address */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-[#111827]">{rec.clientName}</span>
                          <span className="text-[11px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                            <MapPin size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate max-w-[240px]">{rec.address} ({rec.area || 'Dubai'})</span>
                          </span>
                        </div>
                      </td>

                      {/* Cleaner */}
                      <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-[11.5px] font-semibold border border-slate-200">
                          <Users size={12} className="text-slate-500" />
                          {rec.staffName}
                        </span>
                      </td>

                      {/* Source */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                          rec.source === 'Daily Job Sheet'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-purple-50 text-purple-800 border-purple-200'
                        }`}>
                          {rec.source === 'Daily Job Sheet' ? <ClipboardList size={11} /> : <Building2 size={11} />}
                          {rec.source}
                        </span>
                      </td>

                      {/* Charges */}
                      <td className="py-3.5 px-4 text-right font-medium text-slate-600 whitespace-nowrap">
                        AED {rec.charges.toLocaleString()}
                      </td>

                      {/* Paid so far */}
                      <td className="py-3.5 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap">
                        {rec.received > 0 ? `AED ${rec.received.toLocaleString()}` : 'AED 0'}
                      </td>

                      {/* Pending Balance */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className={`text-[14px] font-black ${isHigh ? 'text-red-700' : 'text-amber-800'}`}>
                          AED {rec.pendingAmount.toLocaleString()}
                        </span>
                        {isHigh && (
                          <span className="block text-[9.5px] font-extrabold text-red-600 uppercase tracking-wider">
                            Priority Due
                          </span>
                        )}
                      </td>

                      {/* Mark Collected Action */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <Button
                          onClick={() => handleOpenCollectModal(rec)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11.5px] font-bold h-8 px-3 shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 size={12} className="mr-1" /> Mark Collected
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {filteredOutstanding.length === 0 && (
              <div className="py-16 text-center">
                <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={46} />
                <p className="text-[15px] font-bold text-slate-800">No Pending Payments Found!</p>
                <p className="text-[12px] text-slate-400 mt-1 max-w-sm mx-auto">
                  {search || staffFilter !== 'all' || sourceFilter !== 'all'
                    ? 'No outstanding dues match your active search and filter criteria.'
                    : 'All customer dues for this period have been settled in full.'}
                </p>
                {(search || staffFilter !== 'all' || sourceFilter !== 'all') && (
                  <Button
                    onClick={() => {
                      setSearch('')
                      setStaffFilter('all')
                      setSourceFilter('all')
                      setAmountFilter('all')
                    }}
                    className="mt-4 bg-slate-800 hover:bg-slate-900 text-white font-bold"
                  >
                    Reset Filters
                  </Button>
                )}
              </div>
            )}
          </div>

          <Pager {...outPager} />
          {filteredOutstanding.length > 0 && (
            <div className="px-6 py-3.5 bg-slate-50 border-t border-[#E4E8EC] flex items-center justify-between text-[12.5px] font-bold text-slate-700">
              <span>Showing {filteredOutstanding.length} pending client accounts</span>
              <span className="text-red-700 font-black text-[14.5px]">Total Balance Due: AED {totalPendingAmount.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 2: RECOVERED / RECEIVED HISTORY
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'recovered' && (
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-bold text-[#111827]">Recovered Pending History</h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {filteredRecovered.length} records
              </span>
            </div>
            <span className="text-[11.5px] text-slate-400">
              Logged via Daily Job Sheet "Pending Received" widget & CRM collection actions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Client Name / Description</th>
                  <th className="py-3 px-4 text-right">Cash Received</th>
                  <th className="py-3 px-4 text-right">Online Received</th>
                  <th className="py-3 px-4 text-right">Total Recovered</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E8EC]">
                {recPager.pageItems.map(item => {
                  const cash = cleanNum(item.cash)
                  const online = cleanNum(item.online)
                  const tot = cash + online
                  return (
                    <tr key={item.id} className="hover:bg-emerald-50/40 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {item.date ? formatDisplayDate(item.date) : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#111827]">
                        {item.client}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-700 whitespace-nowrap">
                        {cash > 0 ? `AED ${cash.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-blue-700 whitespace-nowrap">
                        {online > 0 ? `AED ${online.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-800 whitespace-nowrap text-[14px]">
                        AED {tot.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 size={11} /> Settled
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {filteredRecovered.length === 0 && (
              <div className="py-16 text-center">
                <Wallet className="mx-auto mb-3 text-slate-300" size={42} />
                <p className="text-[14px] font-bold text-slate-700">No Recovered Payments in this Period</p>
                <p className="text-[12px] text-slate-400 mt-1 max-w-sm mx-auto">
                  When outstanding dues are collected, records will appear here automatically.
                </p>
              </div>
            )}
          </div>

          <Pager {...recPager} />
          {filteredRecovered.length > 0 && (
            <div className="px-6 py-3.5 bg-slate-50 border-t border-[#E4E8EC] flex items-center justify-between text-[12.5px] font-bold text-slate-700">
              <span>Showing {filteredRecovered.length} recovery transactions</span>
              <span className="text-emerald-700 font-black text-[14.5px]">Total Recovered: AED {totalRecoveredAmount.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* ── By client (UX-08/09/10) and cash book (UX-11) ── */}
      {activeTab === 'by_client' && (
        <ReceivablesByClient
          rows={filteredOutstanding}
          clients={clients}
          onCollect={(rows, amount, mode, notes) => handleCollectForClient(rows as UnifiedPendingRecord[], amount, mode, notes)}
        />
      )}
      {activeTab === 'cash_book' && <CashBook receipts={pendingRcvdList} />}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 3: PENDING BY STAFF / CLEANER SUMMARY
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'staff_summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staffPendingSummary.map(s => {
            const pct = totalPendingAmount > 0 ? Math.round((s.totalAmount / totalPendingAmount) * 100) : 0
            return (
              <div
                key={s.staff}
                className="bg-white rounded-[22px] border border-[#E4E8EC] p-5 shadow-[0_4px_20px_rgba(15,23,42,0.05)] hover:border-amber-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 font-extrabold flex items-center justify-center text-[13px]">
                        {s.staff.trim()[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <h4 className="text-[14px] font-extrabold text-[#111827]">{s.staff}</h4>
                        <span className="text-[11px] text-slate-400">{s.count} outstanding shifts</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                      {pct}% of Dues
                    </span>
                  </div>

                  <div className="my-3">
                    <p className="text-[20px] font-black text-amber-950">
                      AED {s.totalAmount.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Uncollected driver/cleaner balance</p>
                  </div>

                  {/* Clients list */}
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10.5px] uppercase font-bold text-slate-400 mb-1">Associated Clients:</p>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {s.clients.map(c => (
                        <span key={c} className="text-[10.5px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md truncate max-w-[150px]">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <Button
                    onClick={() => {
                      setStaffFilter(s.staff)
                      setActiveTab('outstanding')
                    }}
                    variant="outline"
                    className="w-full text-[12px] h-8 font-bold"
                  >
                    View Staff Records →
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Mark as Collected Modal ── */}
      {collectingRecord && (
        <Modal
          open={!!collectingRecord}
          onClose={() => setCollectingRecord(null)}
          title={`Mark Payment as Collected — ${collectingRecord.clientName}`}
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-slate-50 border border-[#E4E8EC] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase font-bold text-slate-500">Pending Account Details</span>
                <span className="text-[11px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                  Due: AED {collectingRecord.pendingAmount.toLocaleString()}
                </span>
              </div>
              <p className="text-[14px] font-bold text-[#111827]">{collectingRecord.clientName}</p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Cleaner: <strong className="text-slate-800">{collectingRecord.staffName}</strong> · Date: {formatDisplayDate(collectingRecord.date)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">
                  Amount Collected (AED) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={collectAmount}
                  onChange={e => setCollectAmount(e.target.value)}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-emerald-800"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">
                  Payment Mode <span className="text-red-500">*</span>
                </label>
                <select
                  value={collectMode}
                  onChange={e => setCollectMode(e.target.value as any)}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer font-bold"
                >
                  <option value="Cash">Cash (Driver / Staff Handover)</option>
                  <option value="Online">Online / Bank Transfer</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Receipt / Remarks (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Any receipt note or confirmation details…"
                value={collectNotes}
                onChange={e => setCollectNotes(e.target.value)}
                className="w-full text-[13px] px-3.5 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCollectingRecord(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveCollection}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                <CheckCircle2 size={14} className="mr-1.5" /> Confirm Collection
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add Manual Pending Modal ── */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Record Manual Pending Item" size="md">
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const amt = cleanNum(f.get('amount'))
            if (amt <= 0) {
              notify.error('Please enter a valid pending amount.')
              return
            }
            const client = String(f.get('client') || '').trim()
            if (!client) {
              notify.error('Please enter a client name.')
              return
            }

            const newItem: DailyPendingItem = {
              id: `pend-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              date: String(f.get('date')) || new Date().toISOString().split('T')[0],
              client,
              amount: amt,
            }

            setPendingList(prev => [newItem, ...prev])
            setShowAddModal(false)
            setNotice(`Pending record for ${client} (AED ${amt.toLocaleString()}) saved and synced with Daily Job Sheet!`)
          }}
        >
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="date"
                required
                defaultValue={new Date().toISOString().split('T')[0]}
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Pending Amount (AED) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                required
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 font-bold text-red-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Client Name / Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="client"
              placeholder="e.g. Villa 24 Springs, Ahmed Al Mansoori"
              required
              className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Assigned Staff / Cleaner (Optional)
            </label>
            <input
              type="text"
              name="staff"
              placeholder="e.g. Dinesh, Sharmila, Adnan…"
              className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Remarks / Notes
            </label>
            <textarea
              name="remarks"
              rows={2}
              placeholder="Reason for pending payment, client phone, or follow-up notes…"
              className="w-full text-[13px] px-3.5 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold">
              Save Pending Record
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  )
}
