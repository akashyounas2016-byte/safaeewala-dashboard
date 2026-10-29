import { useState, useMemo, useEffect } from 'react'
import {
  Plus, Trash2, TrendingDown, DollarSign, PieChart, Filter, Download,
  Calendar, Search, X, ChevronLeft, ChevronRight, ChevronDown,
  Building2, CreditCard, Wallet, CheckCircle, AlertCircle, Edit2,
  FileSpreadsheet, RotateCcw, Truck, Receipt, Tag, ArrowUpDown
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { notify, confirmAsync } from '@/lib/notify'
import type { DailyExpense, DailyPendingReceivedItem } from '@/types'
import { isBogusJob, jobCollected, getEmployeeMonthlySalary } from '@/lib/clientDataSync'
import { isParentCompanyEmployee } from '@/lib/utils'
import { ExpenseBudgets } from '@/components/expenses/ExpenseBudgets'
import { Pager } from '@/components/common/Pager'
import { usePagination } from '@/hooks/usePagination'

/** Shrink a picked receipt image to a small JPEG data URL (PDFs kept as-is up to 1.5 MB) — UX-13 */
async function readReceipt(file: File): Promise<string> {
  const asDataUrl = (blob: Blob) => new Promise<string>((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob)
  })
  if (!file.type.startsWith('image/')) {
    if (file.size > 1.5 * 1024 * 1024) throw new Error('File is larger than 1.5 MB')
    return asDataUrl(file)
  }
  const src = await asDataUrl(file)
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.8)
}
import { safeLocalStorageGet } from '@/lib/storageUtils'
import * as XLSX from 'xlsx'
import { todayDubai } from '@/lib/dubaiTime'

export type ExpenseDatePreset =
  | 'today'
  | '7days'
  | '14days'
  | '28days'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | '2_years_ago'
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

export const EXPENSE_CATEGORIES = [
  'Vehicle & Fuel',
  'Supplies & Materials',
  'Equipment & Tools',
  'Maintenance & Repairs',
  'Parking & Tolls',
  'Salaries & Wages',
  'Utilities',
  'Rent & Facilities',
  'Marketing & Advertising',
  'Insurance',
  'Professional Services',
  'Travel & Transport',
  'Other Operational',
] as const

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Vehicle & Fuel':        { bg: 'bg-amber-100/80',   text: 'text-amber-900',   border: 'border-amber-200' },
  'Fuel':                  { bg: 'bg-amber-100/80',   text: 'text-amber-900',   border: 'border-amber-200' },
  'Supplies & Materials':  { bg: 'bg-blue-100/80',    text: 'text-blue-900',    border: 'border-blue-200' },
  'Supplies':              { bg: 'bg-blue-100/80',    text: 'text-blue-900',    border: 'border-blue-200' },
  'Equipment & Tools':     { bg: 'bg-purple-100/80',  text: 'text-purple-900',  border: 'border-purple-200' },
  'Maintenance & Repairs': { bg: 'bg-slate-100',      text: 'text-slate-800',   border: 'border-slate-300' },
  'Vehicle maintenance':   { bg: 'bg-slate-100',      text: 'text-slate-800',   border: 'border-slate-300' },
  'Parking & Tolls':       { bg: 'bg-cyan-100/80',    text: 'text-cyan-900',    border: 'border-cyan-200' },
  'Parking':               { bg: 'bg-cyan-100/80',    text: 'text-cyan-900',    border: 'border-cyan-200' },
  'Toll':                  { bg: 'bg-teal-100/80',    text: 'text-teal-900',    border: 'border-teal-200' },
  'Salaries & Wages':      { bg: 'bg-rose-100/80',    text: 'text-rose-900',    border: 'border-rose-200' },
  'Utilities':             { bg: 'bg-yellow-100/80',  text: 'text-yellow-900',  border: 'border-yellow-200' },
  'Rent & Facilities':     { bg: 'bg-indigo-100/80',  text: 'text-indigo-900',  border: 'border-indigo-200' },
  'Marketing & Advertising':{ bg: 'bg-pink-100/80',   text: 'text-pink-900',    border: 'border-pink-200' },
  'Insurance':             { bg: 'bg-emerald-100/80', text: 'text-emerald-900', border: 'border-emerald-200' },
  'Professional Services': { bg: 'bg-teal-100/80',    text: 'text-teal-900',    border: 'border-teal-200' },
  'Travel & Transport':    { bg: 'bg-orange-100/80',  text: 'text-orange-900',  border: 'border-orange-200' },
  'Other Operational':     { bg: 'bg-slate-100',      text: 'text-slate-700',   border: 'border-slate-200' },
  'Other':                 { bg: 'bg-slate-100',      text: 'text-slate-700',   border: 'border-slate-200' },
}

export function Expenses() {
  const { bookings, dailyJobs, dailyExpenses, addDailyExpense, updateDailyExpense, deleteDailyExpense, employees, agencies } = useData()
  const [receiptData, setReceiptData] = useState<string | undefined>(undefined)

  // ── Date Filters State ──
  const [datePreset, setDatePreset]           = useState<ExpenseDatePreset>('this_month')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate]     = useState<string>('')
  const [selectedMonth, setSelectedMonth]     = useState<Date>(new Date())
  const [showRangeDropdown, setShowRangeDropdown] = useState(false)

  // ── Filters & Search ──
  const [search, setSearch]                   = useState('')
  const [categoryFilter, setCategoryFilter]   = useState('all')
  const [sourceFilter, setSourceFilter]       = useState<'all' | 'daily_job_sheet' | 'direct'>('all')
  const [sortOrder, setSortOrder]             = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest')

  // ── Modals State ──
  const [showAddModal, setShowAddModal]       = useState(false)
  const [editingExpense, setEditingExpense]   = useState<DailyExpense | null>(null)
  const [notice, setNotice]                   = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  // Current year constants
  const currentYear = new Date().getFullYear()
  const lastYear = currentYear - 1
  const twoYearsAgo = currentYear - 2

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
    if (datePreset === '2_years_ago') {
      return {
        start: `${twoYearsAgo}-01-01`,
        end: `${twoYearsAgo}-12-31`,
        label: `2 Years Ago (${twoYearsAgo})`,
        sub: `Jan 01, ${twoYearsAgo} – Dec 31, ${twoYearsAgo}`,
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
      sub: 'Complete history across all operational periods',
      isAllTime: true,
    }
  }, [datePreset, selectedMonth, customStartDate, customEndDate, currentYear, lastYear, twoYearsAgo])

  // Helper: check if date is in active range
  const isDateInRange = (dateStr: string) => {
    if (activeRange.isAllTime) return true
    if (!dateStr) return false
    if (activeRange.start && dateStr < activeRange.start) return false
    if (activeRange.end && dateStr > activeRange.end) return false
    return true
  }

  // ── Source classification helper ──
  const getExpenseSource = (exp: DailyExpense): 'Daily Job Sheet' | 'Direct / Office' => {
    if (exp.source) {
      const s = exp.source.toLowerCase()
      if (s.includes('job sheet') || s.includes('field') || s.includes('ops') || s.includes('driver')) {
        return 'Daily Job Sheet'
      }
      return 'Direct / Office'
    }
    const cat = (exp.category || '').toLowerCase()
    if (cat.includes('fuel') || cat.includes('parking') || cat.includes('toll') || cat.includes('vehicle')) {
      return 'Daily Job Sheet'
    }
    return 'Direct / Office'
  }

  // ── Filtered & Sorted Expenses ──
  const filteredExpenses = useMemo(() => {
    return dailyExpenses
      .filter(exp => {
        // Date match
        if (!isDateInRange(exp.date)) return false

        // Search match
        const q = search.toLowerCase().trim()
        if (q) {
          const matchName = exp.name?.toLowerCase().includes(q)
          const matchCat = exp.category?.toLowerCase().includes(q)
          const matchNotes = exp.notes?.toLowerCase().includes(q)
          const matchVendor = exp.vendor?.toLowerCase().includes(q)
          const matchRef = exp.reference_number?.toLowerCase().includes(q)
          const matchAmt = String(exp.amount).includes(q)
          if (!matchName && !matchCat && !matchNotes && !matchVendor && !matchRef && !matchAmt) return false
        }

        // Category filter
        if (categoryFilter !== 'all') {
          const normFilter = categoryFilter.toLowerCase()
          const normCat = (exp.category || '').toLowerCase()
          if (!normCat.includes(normFilter) && !normFilter.includes(normCat)) return false
        }

        // Source filter
        if (sourceFilter !== 'all') {
          const src = getExpenseSource(exp)
          if (sourceFilter === 'daily_job_sheet' && src !== 'Daily Job Sheet') return false
          if (sourceFilter === 'direct' && src !== 'Direct / Office') return false
        }

        return true
      })
      .sort((a, b) => {
        if (sortOrder === 'oldest') return (a.date || '').localeCompare(b.date || '')
        if (sortOrder === 'highest') return (Number(b.amount) || 0) - (Number(a.amount) || 0)
        if (sortOrder === 'lowest') return (Number(a.amount) || 0) - (Number(b.amount) || 0)
        // Default newest
        return (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || '')
      })
  }, [dailyExpenses, activeRange, search, categoryFilter, sourceFilter, sortOrder])

  // ── Executive KPIs Calculations ──
  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  }, [filteredExpenses])

  const jobSheetExpensesTotal = useMemo(() => {
    return filteredExpenses
      .filter(e => getExpenseSource(e) === 'Daily Job Sheet')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  }, [filteredExpenses])

  const officeExpensesTotal = useMemo(() => {
    return filteredExpenses
      .filter(e => getExpenseSource(e) === 'Direct / Office')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  }, [filteredExpenses])

  // By Category Breakdown
  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of filteredExpenses) {
      const cat = e.category || 'Other Operational'
      map.set(cat, (map.get(cat) || 0) + (Number(e.amount) || 0))
    }
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [filteredExpenses])

  const topCategory = byCategory[0] || null
  const expPager = usePagination(filteredExpenses, 30) // UX-03

  // Distinct active days in range
  const activeExpenseDays = useMemo(() => {
    return new Set(filteredExpenses.map(e => e.date).filter(Boolean)).size
  }, [filteredExpenses])

  const avgDailyExpense = useMemo(() => {
    if (activeExpenseDays === 0) return 0
    return Math.round(totalExpenses / activeExpenseDays)
  }, [totalExpenses, activeExpenseDays])

  // Money collected in the same period — same definition as Overview (R-FIN-03, AUD-30):
  // job-sheet collections (no Excel total rows), monthly client payments, pending recoveries,
  // and bookings that have no job-sheet row yet
  const periodRevenue = useMemo(() => {
    const jobRev = dailyJobs
      .filter(j => !isBogusJob(j) && isDateInRange(j.date))
      .reduce((s, j) => s + jobCollected(j), 0)
    const monthlyRev = safeLocalStorageGet<{ amount: number; date: string }[]>('safaeewala_monthly_client_payments', [])
      .filter(p => isDateInRange(p.date))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const recoveries = safeLocalStorageGet<DailyPendingReceivedItem[]>('safaeewala_daily_pending_rcvd_items', [])
      .filter(r => isDateInRange(r.date))
      .reduce((s, r) => s + (Number(r.cash) || 0) + (Number(r.online) || 0), 0)
    const linked = new Set(dailyJobs.map(j => j.booking_id).filter(Boolean))
    const bookingRev = bookings
      .filter(b => !linked.has(b.id) && (b.status === 'completed' || b.status === 'in_progress') && isDateInRange(b.scheduled_date))
      .reduce((s, b) => s + (b.total_amount || 0), 0)
    return jobRev + monthlyRev + recoveries + bookingRev
  }, [dailyJobs, bookings, activeRange])

  // Payroll of in-house (parent company) staff for the period, from monthly salaries (UX-14).
  // Third-party staff are paid through agency payouts, counted separately below.
  const periodDays = useMemo(() => {
    if (activeRange.isAllTime || !activeRange.start || !activeRange.end) return 0
    return Math.round((new Date(activeRange.end).getTime() - new Date(activeRange.start).getTime()) / 86_400_000) + 1
  }, [activeRange])
  const periodPayroll = useMemo(() => {
    if (!periodDays) return 0
    const monthly = employees
      .filter(e => (e.status === 'active' || e.status === 'engaged_in_project') && !e.id.startsWith('emp-dj-') && isParentCompanyEmployee(e))
      .reduce((s, e) => s + getEmployeeMonthlySalary(e), 0)
    return Math.round(monthly * (periodDays / 30))
  }, [employees, periodDays])
  const periodAgencyPayouts = useMemo(() => agencies.reduce((sum, a) =>
    sum + (a.payouts || []).filter(p => p.status === 'paid' && isDateInRange(p.payment_date)).reduce((s, p) => s + (Number(p.amount) || 0), 0), 0),
  [agencies, activeRange]) // eslint-disable-line react-hooks/exhaustive-deps
  const netAfterPayroll = periodRevenue - totalExpenses - periodPayroll - periodAgencyPayouts

  const profit = periodRevenue - totalExpenses
  const profitMargin = periodRevenue > 0 ? Math.round((profit / periodRevenue) * 100) : 0
  const expenseRatio = periodRevenue > 0 ? Math.round((totalExpenses / periodRevenue) * 100) : 0

  // ── Export to Excel ──
  const handleExportExcel = () => {
    if (filteredExpenses.length === 0) {
      notify.info('No expense records to export for this date range.')
      return
    }

    const rows = filteredExpenses.map(e => ({
      'Date': e.date,
      'Description / Title': e.name,
      'Category': e.category,
      'Source / Origin': getExpenseSource(e),
      'Amount (AED)': Number(e.amount) || 0,
      'Payment Method': e.payment_method || 'Cash',
      'Vendor / Payee': e.vendor || '—',
      'Reference #': e.reference_number || '—',
      'Notes': e.notes || '—',
      'Created At': e.created_at || '—',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses')
    const cleanLabel = activeRange.label.replace(/[^a-zA-Z0-9_-]/g, '_')
    XLSX.writeFile(wb, `Safaeewala_Expenses_${cleanLabel}.xlsx`)
  }

  // ── Delete Handler ──
  const handleDeleteExpense = async (id: string, name: string) => {
    if (await confirmAsync({ title: 'Delete expense', message: `Delete expense "${name}"?`, confirmLabel: 'Delete', tone: 'danger' })) {
      deleteDailyExpense(id)
      setNotice(`Expense record "${name}" deleted.`)
    }
  }

  return (
    <div className="space-y-6 pb-12">

      {/* Action Notice Banner */}
      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle size={18} className="text-emerald-600 shrink-0" />
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

      {/* Unified Page Hero Header */}
      <PageHero
        title="Expenses & Operational Costs"
        subtitle={`Unified expense records from Daily Job Sheet & Office Management · ${filteredExpenses.length} Records`}
        statusChip={`${activeRange.label} · AED ${totalExpenses.toLocaleString()} Total`}
        actionLabel="Add Expense"
        onAction={() => setShowAddModal(true)}
        actions={
          <button
            type="button"
            onClick={handleExportExcel}
            className="h-11 px-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-semibold text-sm backdrop-blur-sm transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            title="Export filtered expenses to Excel"
          >
            <Download size={15} strokeWidth={2.2} />
            <span>Export Excel</span>
          </button>
        }
        showSearch={false}
      />

      {/* ── Executive KPI Cards (6 Financial & Operational Cards) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Total Expenses */}
        <div title="All expenses in the period (Daily Job Sheet + office)" className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Expenses</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <TrendingDown size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-slate-900">AED {totalExpenses.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{filteredExpenses.length} records ({activeRange.label})</p>
          </div>
        </div>

        {/* Card 2: Job Sheet Field Expenses */}
        <div title="Expenses recorded on the Daily Job Sheet" className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Job Sheet Ops</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Truck size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-amber-900">AED {jobSheetExpensesTotal.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Field fuel, parking & drivers</p>
          </div>
        </div>

        {/* Card 3: Office & Admin Expenses */}
        <div title="Expenses entered directly (office / admin)" className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-purple-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Office & Admin</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Building2 size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-purple-900">AED {officeExpensesTotal.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Facilities, tools & supplies</p>
          </div>
        </div>

        {/* Card 4: Top Category */}
        <div title="Category with the highest spend in the period" className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-blue-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Top Category</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <PieChart size={16} />
            </div>
          </div>
          <div>
            <p className="text-[18px] font-extrabold text-blue-900 truncate" title={topCategory?.category || 'None'}>
              {topCategory?.category || 'None'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {topCategory ? `AED ${topCategory.amount.toLocaleString()} (${totalExpenses > 0 ? Math.round((topCategory.amount / totalExpenses) * 100) : 0}%)` : 'No data'}
            </p>
          </div>
        </div>

        {/* Card 5: Daily Average Expense */}
        <div title="Total expenses ÷ days that have expenses" className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-teal-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Daily Average</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Calendar size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-teal-900">AED {avgDailyExpense.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Across {activeExpenseDays} active days</p>
          </div>
        </div>

        {/* Card 6: Revenue Ratio & Profit */}
        <div title="Collected money (job sheet, recoveries, monthly payments, bookings without a job row) against expenses, in-house payroll and paid agency payouts" className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Expense Ratio</span>
            <div className={`w-8 h-8 rounded-lg ${profit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'} flex items-center justify-center`}>
              <DollarSign size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-emerald-700">{expenseRatio}%</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Collected − Expenses: <strong className={profit >= 0 ? 'text-emerald-700' : 'text-red-600'}>AED {profit.toLocaleString()}</strong>
            </p>
            {/* Full picture: collected − expenses − payroll − agency payouts (UX-14) */}
            <div className="mt-2 space-y-0.5 text-[11px]">
              <div className="flex justify-between text-slate-500"><span>Collected</span><span>AED {Math.round(periodRevenue).toLocaleString()}</span></div>
              <div className="flex justify-between text-slate-500"><span>− Expenses</span><span>AED {Math.round(totalExpenses).toLocaleString()}</span></div>
              <div className="flex justify-between text-slate-500" title="In-house staff monthly salaries, prorated to the period">
                <span>− Payroll</span><span>{periodDays ? `AED ${periodPayroll.toLocaleString()}` : 'pick a period'}</span>
              </div>
              <div className="flex justify-between text-slate-500"><span>− Agency payouts</span><span>AED {Math.round(periodAgencyPayouts).toLocaleString()}</span></div>
              <div className={`flex justify-between font-black pt-0.5 border-t border-slate-100 ${netAfterPayroll >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                <span>Net</span><span>{periodDays ? `AED ${Math.round(netAfterPayroll).toLocaleString()}` : '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly category budgets (UX-13) ── */}
      <ExpenseBudgets expenses={dailyExpenses} categories={Object.keys(CATEGORY_COLORS)} />

      {/* ── Date Preset Filter Bar (Quick Pills & Dropdown Engine) ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex items-center justify-between flex-wrap gap-3">
        {/* Left: Active Date Range Display with Month Stepper */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Calendar size={18} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-extrabold text-[#111827]">
                {activeRange.label}
              </h2>
              <span className="text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {filteredExpenses.length} {filteredExpenses.length === 1 ? 'Expense' : 'Expenses'}
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
          <div className="flex items-center gap-1 bg-[#f8fafc] p-1 rounded-xl border border-[#E4E8EC]">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7days', label: '7 Days' },
                { id: '14days', label: '14 Days' },
                { id: '28days', label: '28 Days' },
                { id: 'this_month', label: 'This Month' },
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
                      ? 'bg-slate-900 text-white shadow-xs'
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
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1.5">Date Ranges</p>
                  {[
                    { id: 'today', label: 'Today' },
                    { id: '7days', label: 'Last 7 Days' },
                    { id: '14days', label: 'Last 14 Days' },
                    { id: '28days', label: 'Last 28 Days' },
                    { id: 'this_month', label: 'This Month' },
                    { id: 'last_month', label: 'Last Month' },
                    { id: 'this_year', label: `This Year (${currentYear})` },
                    { id: 'last_year', label: `Last Year (${lastYear})` },
                    { id: '2_years_ago', label: `2 Years Ago (${twoYearsAgo})` },
                    { id: 'all_time', label: 'All-Time Records' },
                    { id: 'custom', label: 'Custom Date Range…' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDatePreset(opt.id as ExpenseDatePreset)
                        setShowRangeDropdown(false)
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                        datePreset === opt.id ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {datePreset === opt.id && <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
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
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-4 flex-wrap animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-slate-700">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="text-[12.5px] px-3 py-1.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-slate-700">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="text-[12.5px] px-3 py-1.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium"
            />
          </div>
          <span className="text-[11.5px] text-slate-500 italic">
            Filters records between specified start and end dates inclusive.
          </span>
        </div>
      )}

      {/* ── Toolbar: Search, Category Filter, Source Filter & Sorting ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px] flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search expenses by description, category, staff, vendor…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-[13px] pl-10 pr-9 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 placeholder-slate-400 transition-colors"
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

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 text-slate-700 cursor-pointer font-medium"
          >
            <option value="all">All Categories</option>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value as any)}
            className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 text-slate-700 cursor-pointer font-medium"
          >
            <option value="all">All Sources (Daily Job Sheet + Direct)</option>
            <option value="daily_job_sheet">Daily Job Sheet (Field / Ops)</option>
            <option value="direct">Direct / Office Expenses</option>
          </select>

          {/* Sort Order */}
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value as any)}
            className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 text-slate-700 cursor-pointer font-medium"
          >
            <option value="newest">Newest Date First</option>
            <option value="oldest">Oldest Date First</option>
            <option value="highest">Highest Amount</option>
            <option value="lowest">Lowest Amount</option>
          </select>

          {(search || categoryFilter !== 'all' || sourceFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setCategoryFilter('all')
                setSourceFilter('all')
              }}
              className="flex items-center gap-1 text-[12px] font-bold text-slate-500 hover:text-slate-800 py-1 px-2.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} /> Reset Filters
            </button>
          )}
        </div>

        {/* Right CTA */}
        <div className="flex items-center gap-2">
          <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Filtered Total</span>
            <span className="text-[15px] font-black text-slate-900">
              AED {totalExpenses.toLocaleString()}
            </span>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-[12px] h-10 px-4 shadow-xs"
          >
            <Plus size={14} className="mr-1" /> Add Expense
          </Button>
        </div>
      </div>

      {/* ── Main Content Grid: Comprehensive History Table + Analytics Sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Complete Expense History Table (Takes 2 Columns on XL) */}
        <div className="xl:col-span-2 bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-bold text-[#111827]">Complete Expense History</h3>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {filteredExpenses.length} records
                </span>
              </div>
              <span className="text-[11.5px] text-slate-400">
                Auto-synced from Daily Job Sheet & Office
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Description / Payee</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {expPager.pageItems.map(exp => {
                    const src = getExpenseSource(exp)
                    const isJobSheet = src === 'Daily Job Sheet'
                    const catStyle = CATEGORY_COLORS[exp.category] || CATEGORY_COLORS['Other Operational']

                    return (
                      <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors group">
                        {/* Date */}
                        <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {exp.date ? formatDisplayDate(exp.date) : '—'}
                        </td>

                        {/* Description */}
                        <td className="py-3.5 px-4 font-bold text-[#111827]">
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1.5">
                              {exp.name}
                              {exp.receipt_url && (
                                <a href={exp.receipt_url} target="_blank" rel="noreferrer" className="text-[10.5px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 rounded" title="Open receipt">Receipt</a>
                              )}
                            </span>
                            {(exp.vendor || exp.reference_number || exp.notes) && (
                              <span className="text-[11px] text-slate-400 font-normal mt-0.5 max-w-[260px] truncate" title={exp.notes || exp.vendor || exp.reference_number}>
                                {exp.vendor ? `Vendor: ${exp.vendor} ` : ''}
                                {exp.reference_number ? `· Ref: ${exp.reference_number} ` : ''}
                                {exp.notes ? `· ${exp.notes}` : ''}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                            <Tag size={10} />
                            {exp.category}
                          </span>
                        </td>

                        {/* Source */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                            isJobSheet
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-purple-50 text-purple-800 border-purple-200'
                          }`}>
                            {isJobSheet ? <Truck size={11} /> : <Building2 size={11} />}
                            {src}
                          </span>
                        </td>

                        {/* Payment Method */}
                        <td className="py-3.5 px-4 text-slate-600 text-[12px] whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-medium">
                            <CreditCard size={11} className="text-slate-400" />
                            {exp.payment_method || 'Cash'}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 text-right font-black text-slate-800 whitespace-nowrap text-[14px]">
                          AED {Number(exp.amount || 0).toLocaleString()}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingExpense(exp)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
                              title="Edit Expense"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(exp.id, exp.name)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                              title="Delete Expense"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <Pager {...expPager} />

              {filteredExpenses.length === 0 && (
                <div className="py-16 text-center">
                  <TrendingDown className="mx-auto mb-3 text-slate-300" size={42} />
                  <p className="text-[14px] font-bold text-slate-700">No Expenses Found</p>
                  <p className="text-[12px] text-slate-400 mt-1 max-w-sm mx-auto">
                    {search || categoryFilter !== 'all' || sourceFilter !== 'all'
                      ? 'No expenses match your search query or active filter settings.'
                      : 'No expenses have been recorded for this period yet. Add expenses here or import via Daily Job Sheet.'}
                  </p>
                  <Button
                    onClick={() => setShowAddModal(true)}
                    className="mt-4 bg-teal-700 hover:bg-teal-800 text-white font-bold"
                  >
                    <Plus size={14} className="mr-1" /> Add Expense
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Table Footer */}
          {filteredExpenses.length > 0 && (
            <div className="px-6 py-3.5 bg-slate-50 border-t border-[#E4E8EC] flex items-center justify-between text-[12.5px] font-bold text-slate-700">
              <span>Showing {filteredExpenses.length} expense transactions</span>
              <span className="text-slate-900 font-black text-[14px]">Total: AED {totalExpenses.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Analytics & Category Breakdown Sidebar (1 Column on XL) */}
        <div className="space-y-6">

          {/* By Category Breakdown */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2">
                <PieChart size={16} className="text-teal-700" />
                <span>By Category</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-semibold">{byCategory.length} categories</span>
            </div>

            {byCategory.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-8">No expenses in this period</p>
            ) : (
              <div className="space-y-3.5">
                {byCategory.map(({ category, amount }) => {
                  const pct = totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0
                  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS['Other Operational']
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="font-semibold text-slate-700 truncate">{category}</span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="font-extrabold text-slate-900">AED {amount.toLocaleString()}</span>
                          <span className="text-[11px] text-slate-400 font-bold">({pct}%)</span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${pct}%`,
                            background: color.bg.includes('amber') ? '#f59e0b' :
                              color.bg.includes('blue') ? '#3b82f6' :
                              color.bg.includes('cyan') ? '#06b6d4' :
                              color.bg.includes('purple') ? '#8b5cf6' :
                              color.bg.includes('rose') ? '#f43f5e' : '#ea580c'
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* By Source Distribution */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <h3 className="text-[15px] font-bold text-[#111827] mb-3 flex items-center gap-2">
              <Truck size={16} className="text-amber-600" />
              <span>Source Distribution</span>
            </h3>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-[12px] font-bold mb-1">
                  <span className="text-amber-800 flex items-center gap-1">
                    <Truck size={13} /> Daily Job Sheet Field Ops
                  </span>
                  <span className="text-amber-900">AED {jobSheetExpensesTotal.toLocaleString()}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${totalExpenses > 0 ? (jobSheetExpensesTotal / totalExpenses) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[10.5px] text-slate-400 mt-0.5 block">
                  {totalExpenses > 0 ? Math.round((jobSheetExpensesTotal / totalExpenses) * 100) : 0}% of total costs
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between text-[12px] font-bold mb-1">
                  <span className="text-purple-800 flex items-center gap-1">
                    <Building2 size={13} /> Direct / Office Management
                  </span>
                  <span className="text-purple-900">AED {officeExpensesTotal.toLocaleString()}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${totalExpenses > 0 ? (officeExpensesTotal / totalExpenses) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[10.5px] text-slate-400 mt-0.5 block">
                  {totalExpenses > 0 ? Math.round((officeExpensesTotal / totalExpenses) * 100) : 0}% of total costs
                </span>
              </div>
            </div>
          </div>

          {/* Quick Add CTA Card */}
          <div className="bg-gradient-to-br from-slate-50 via-teal-50/30 to-emerald-50/20 border border-teal-200/60 rounded-[22px] p-5 text-center">
            <Receipt className="mx-auto text-teal-700 mb-2" size={32} />
            <h4 className="text-[14px] font-bold text-slate-900">Add Operational Expense</h4>
            <p className="text-[11.5px] text-slate-500 mt-1 max-w-xs mx-auto">
              Fuel receipts, equipment purchases, chemicals, or driver daily parking.
            </p>
            <Button
              onClick={() => setShowAddModal(true)}
              className="mt-3.5 w-full bg-teal-700 hover:bg-teal-800 text-white font-bold"
            >
              <Plus size={14} className="mr-1" /> Record New Expense
            </Button>
          </div>

        </div>

      </div>

      {/* ── Add Expense Modal ── */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Expense Record" size="md">
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const amt = Number(f.get('amount')) || 0
            if (amt <= 0) {
              notify.error('Please enter a valid expense amount.')
              return
            }
            const name = String(f.get('name') || '').trim()
            if (!name) {
              notify.error('Please enter a description or payee name.')
              return
            }

            addDailyExpense({
              date: String(f.get('date')) || todayDubai(),
              name,
              category: String(f.get('category')) || 'Other Operational',
              amount: amt,
              source: (f.get('source') as string) || 'Direct Expense',
              payment_method: (f.get('payment_method') as string) || 'Cash',
              vendor: String(f.get('vendor') || '').trim() || undefined,
              reference_number: String(f.get('reference_number') || '').trim() || undefined,
              notes: String(f.get('notes') || '').trim() || undefined,
              receipt_url: receiptData,
            })
            setReceiptData(undefined)
            setShowAddModal(false)
            setNotice(`Expense "${name}" (AED ${amt.toLocaleString()}) recorded successfully!`)
          }}
        >
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="date"
                required
                defaultValue={todayDubai()}
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Amount (AED) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                required
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-bold text-red-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Description / Payee <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              placeholder="e.g. Fuel for Toyota Hiace Van 1, Cleaning Mops & Chemical Agents"
              required
              className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                name="category"
                required
                defaultValue="Vehicle & Fuel"
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 cursor-pointer font-medium"
              >
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Origin / Source
              </label>
              <select
                name="source"
                defaultValue="Direct Expense"
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 cursor-pointer font-medium"
              >
                <option value="Daily Job Sheet">Daily Job Sheet (Field / Ops)</option>
                <option value="Direct Expense">Direct / Office Expense</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                name="payment_method"
                defaultValue="Cash"
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 cursor-pointer font-medium"
              >
                <option value="Cash">Cash</option>
                <option value="Credit Card">Company Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Petty Cash">Petty Cash</option>
                <option value="Online">Online Payment</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Reference / Receipt #
              </label>
              <input
                type="text"
                name="reference_number"
                placeholder="e.g. REC-9842, TRX-102"
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-mono text-[12px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Vendor / Payee / Store
            </label>
            <input
              type="text"
              name="vendor"
              placeholder="e.g. Emarat Petrol Station, Carrefour, RTA Dubai"
              className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Notes / Remarks
            </label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Any operational notes or invoice details…"
              className="w-full text-[13px] px-3.5 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">Receipt (photo or PDF)</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) { setReceiptData(undefined); return }
                try { setReceiptData(await readReceipt(file)) } catch (err) { notify.error(err instanceof Error ? err.message : 'Could not read the receipt'); e.target.value = '' }
              }}
              className="w-full text-[12px] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold"
            />
            {receiptData && <p className="text-[11px] text-emerald-700 mt-1 font-semibold">Receipt attached ✓</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { setReceiptData(undefined); setShowAddModal(false) }}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-teal-700 hover:bg-teal-800 text-white font-bold">
              Save Expense Record
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Expense Modal ── */}
      {editingExpense && (
        <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense Record" size="md">
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              const amt = Number(f.get('amount')) || 0
              if (amt <= 0) {
                notify.error('Please enter a valid expense amount.')
                return
              }
              const name = String(f.get('name') || '').trim()
              if (!name) {
                notify.error('Please enter a description or payee name.')
                return
              }

              updateDailyExpense(editingExpense.id, {
                date: String(f.get('date')) || editingExpense.date,
                name,
                category: String(f.get('category')) || editingExpense.category,
                amount: amt,
                source: (f.get('source') as string) || editingExpense.source,
                payment_method: (f.get('payment_method') as string) || editingExpense.payment_method,
                vendor: String(f.get('vendor') || '').trim() || undefined,
                reference_number: String(f.get('reference_number') || '').trim() || undefined,
                notes: String(f.get('notes') || '').trim() || undefined,
              })
              setEditingExpense(null)
              setNotice(`Expense "${name}" updated.`)
            }}
          >
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={editingExpense.date}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">
                  Amount (AED) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="amount"
                  step="0.01"
                  min="0.01"
                  required
                  defaultValue={editingExpense.amount}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-bold text-red-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Description / Payee <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                required
                defaultValue={editingExpense.name}
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  name="category"
                  required
                  defaultValue={editingExpense.category}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 cursor-pointer font-medium"
                >
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">
                  Origin / Source
                </label>
                <select
                  name="source"
                  defaultValue={getExpenseSource(editingExpense)}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 cursor-pointer font-medium"
                >
                  <option value="Daily Job Sheet">Daily Job Sheet (Field / Ops)</option>
                  <option value="Direct Expense">Direct / Office Expense</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">
                  Payment Method
                </label>
                <select
                  name="payment_method"
                  defaultValue={editingExpense.payment_method || 'Cash'}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 cursor-pointer font-medium"
                >
                  <option value="Cash">Cash</option>
                  <option value="Credit Card">Company Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Petty Cash">Petty Cash</option>
                  <option value="Online">Online Payment</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">
                  Reference / Receipt #
                </label>
                <input
                  type="text"
                  name="reference_number"
                  defaultValue={editingExpense.reference_number || ''}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-mono text-[12px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Vendor / Payee / Store
              </label>
              <input
                type="text"
                name="vendor"
                defaultValue={editingExpense.vendor || ''}
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Notes / Remarks
              </label>
              <textarea
                name="notes"
                rows={2}
                defaultValue={editingExpense.notes || ''}
                className="w-full text-[13px] px-3.5 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingExpense(null)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-teal-700 hover:bg-teal-800 text-white font-bold">
                Update Expense
              </Button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  )
}
