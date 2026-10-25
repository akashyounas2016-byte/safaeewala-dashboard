import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  ChevronLeft, ChevronRight, Calendar, Printer, Download, Plus,
  Trash2, AlertCircle, AlertTriangle, TrendingUp, Users, Briefcase, CloudUpload,
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
import {
  authorizeGoogleDrive,
  getAccessToken,
  uploadToDrive,
  gdriveConfigured,
  getDriveWebhookUrl,
  sendDailySheetBackupViaWebhook,
} from '@/lib/googleDrive'
import { useLayout } from '@/components/layout/Layout'

import {
  MATERIALS,
  PAYMENT_MODES,
  EXPENSE_CATEGORIES,
  COMMON_SERVICES,
  cleanNum,
  formatTimeOnly,
  calcHours,
  calcOTHours,
  fmtDate,
  addDaysToYMD,
  STAFF_COLOR_PALETTES,
  PaymentBadge,
  AddressCell,
  ALL_COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
  type ColumnConfig,
  type StaffPalette,
} from '@/components/dailyJobSheet/jobSheetUtils'
import { AddJobForm } from '@/components/dailyJobSheet/AddJobModal'
import {
  AddExpenseModal,
  EditExpenseModal,
  DeleteDayConfirmModal,
  DeleteAllConfirmModal,
  DriverStaffModal,
  AddPendingModal,
  EditPendingModal,
  AddPendingReceivedModal,
  EditPendingReceivedModal,
  AddAdvanceModal,
  EditAdvanceModal,
  PendingDetailsModal,
} from '@/components/dailyJobSheet/DailyJobModals'
import { GoogleDriveWebhookModal } from '@/components/dailyJobSheet/GoogleDriveWebhookModal'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'

/* ─── Main Page ─── */
export function DailyJobSheet() {
  const { openMenu } = useLayout()
  const { dailyJobs, dailyExpenses, employees, loading, addDailyJob, updateDailyJob, deleteDailyJob, addDailyExpense, updateDailyExpense, deleteDailyExpense, clearDailyData, clearAllDailyData } = useData()

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
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const [deleteSuccessNotice, setDeleteSuccessNotice] = useState<string | null>(null)
  const [driveStatus, setDriveStatus]       = useState<'idle' | 'connecting' | 'uploading' | 'done' | 'error'>('idle')
  const [driveLink, setDriveLink]           = useState('')
  const [driveError, setDriveError]         = useState('')
  const [showDriveModal, setShowDriveModal] = useState(false)
  const [importNotice, setImportNotice]     = useState<{ jobs: number; expenses: number; date: string; pendingCount?: number; pendingRcvdCount?: number; advanceCount?: number; fileName?: string } | null>(null)

  // Auto-dismiss import notification after 30 seconds
  useEffect(() => {
    if (!importNotice) return
    const timer = setTimeout(() => {
      setImportNotice(null)
    }, 30000)
    return () => clearTimeout(timer)
  }, [importNotice])

  // Auto-dismiss delete notification after 10 seconds
  useEffect(() => {
    if (!deleteSuccessNotice) return
    const timer = setTimeout(() => {
      setDeleteSuccessNotice(null)
    }, 10000)
    return () => clearTimeout(timer)
  }, [deleteSuccessNotice])

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
    let start = end
    if (preset === '7days') {
      start = addDaysToYMD(end, -6)
    } else if (preset === '14days') {
      start = addDaysToYMD(end, -13)
    } else if (preset === '28days') {
      start = addDaysToYMD(end, -27)
    } else if (preset === '3months') {
      start = addDaysToYMD(end, -90)
    } else if (preset === '6months') {
      start = addDaysToYMD(end, -180)
    } else if (preset === '1year') {
      start = addDaysToYMD(end, -365)
    } else if (preset === '2years') {
      start = addDaysToYMD(end, -730)
    }
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

  const getPresetDisplayName = (preset: DateRangePreset): string => {
    switch (preset) {
      case 'today': return 'Today'
      case '7days': return 'Last 7 Days'
      case '14days': return 'Last 14 Days'
      case '28days': return 'Last 28 Days'
      case '3months': return 'Last 3 Months'
      case '6months': return 'Last 6 Months'
      case '1year': return 'One Year'
      case '2years': return 'Two Years'
      default: return 'Today'
    }
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
  const [pendingList, setPendingList] = useState<DailyPendingItem[]>(() =>
    safeLocalStorageGet<DailyPendingItem[]>('safaeewala_daily_pending_items', [])
  )

  const [pendingRcvdList, setPendingRcvdList] = useState<DailyPendingReceivedItem[]>(() => {
    const list = safeLocalStorageGet<DailyPendingReceivedItem[]>('safaeewala_daily_pending_rcvd_items', [])
    return Array.isArray(list) ? list.filter(item => !item.id?.startsWith('pr-')) : []
  })

  const [advanceList, setAdvanceList] = useState<DailyAdvanceItem[]>(() => {
    const list = safeLocalStorageGet<DailyAdvanceItem[]>('safaeewala_daily_advance_items', [])
    return Array.isArray(list) ? list.filter(item => !item.id?.startsWith('adv-')) : []
  })

  const [showAddPending, setShowAddPending]         = useState(false)
  const [showAddPendingRcvd, setShowAddPendingRcvd] = useState(false)
  const [showAddAdvance, setShowAddAdvance]         = useState(false)
  const [editingPending, setEditingPending]         = useState<DailyPendingItem | null>(null)
  const [editingPendingRcvd, setEditingPendingRcvd] = useState<DailyPendingReceivedItem | null>(null)
  const [editingAdvance, setEditingAdvance]         = useState<DailyAdvanceItem | null>(null)

  useEffect(() => {
    safeLocalStorageSet('safaeewala_daily_pending_items', pendingList)
  }, [pendingList])

  useEffect(() => {
    safeLocalStorageSet('safaeewala_daily_pending_rcvd_items', pendingRcvdList)
  }, [pendingRcvdList])

  useEffect(() => {
    safeLocalStorageSet('safaeewala_daily_advance_items', advanceList)
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
  // Guard: if no data has been uploaded/imported for this date (todayJobs is empty),
  // or if store is loading, keep nilRows empty so staff names/absent rows do not appear on empty days.
  const nilRows: Array<any> = (todayJobs.length === 0 || (loading && dailyJobs.length === 0)) ? [] : allKnownCleaners
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

  // ── Date navigation (Timezone-safe without day skipping or date freeze) ──
  function prevDay() {
    setDateRangePreset('today')
    setSelectedDate(addDaysToYMD(selectedDate, -1))
  }
  function nextDay() {
    setDateRangePreset('today')
    setSelectedDate(addDaysToYMD(selectedDate, 1))
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

  // ── Google Drive & n8n Backup ──
  async function backupToDrive() {
    const webhookUrl = getDriveWebhookUrl()

    // 1. Preferred Automation: n8n / Webhook Backup
    if (webhookUrl) {
      try {
        setDriveStatus('uploading')
        setDriveError('')
        const wb = buildWorkbook()
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const filename = `DailyJobSheet-${selectedDate}.xlsx`

        const summary = {
          date: selectedDate,
          total_charges: totalCharges,
          gross_collected: grossCollected,
          pending_cash_received: pendingCashRcvdForNet,
          expenses: totalExpenses,
          net_total: netTotal,
          pending: pendingTotal,
          online: onlineTotal,
          ot_hours: totalOTHours,
          staff_on_duty: staffOnDuty,
          jobs_count: jobsCount,
        }

        const result = await sendDailySheetBackupViaWebhook({
          date: selectedDate,
          filename,
          blob,
          summary,
          jobs: todayJobs,
          expenses: todayExpenses,
          pending: todayPendingItems,
          webhookUrl,
        })

        if (result.driveUrl) {
          setDriveLink(result.driveUrl)
        }
        setDriveStatus('done')
      } catch (err: any) {
        setDriveError(err.message || 'Webhook backup failed')
        setDriveStatus('error')
      }
      return
    }

    // 2. Direct Google Drive OAuth fallback (if CLIENT_ID configured)
    if (gdriveConfigured) {
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
      return
    }

    // 3. If no webhook and no Google Client ID configured, prompt setup modal
    setShowDriveModal(true)
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

      {/* ── Import Notice Banner (with 30s auto-dismiss progress) ── */}
      {importNotice && (
        <div className="relative overflow-hidden bg-gradient-to-r from-emerald-50 via-teal-50/40 to-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[13px] shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-600/30">
              <CheckCircle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-emerald-950 text-[13.5px]">
                  Excel Sheet Imported Successfully!
                </p>
                <code className="bg-emerald-100/90 text-emerald-900 px-2 py-0.5 rounded-md text-[12px] font-mono font-semibold">
                  {importNotice.fileName || 'Uploaded Sheet'}
                </code>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  Auto-closes in 30s
                </span>
              </div>
              <p className="text-[12px] text-emerald-800 mt-1">
                Target Date (derived from file name): <strong className="text-emerald-950 font-bold">{fmtDate(importNotice.date)} ({importNotice.date})</strong> · Added <strong>{importNotice.jobs} jobs</strong>, <strong>{importNotice.expenses} expenses</strong>
                {importNotice.pendingRcvdCount ? <>, <strong>{importNotice.pendingRcvdCount} pending received</strong></> : null}
                {importNotice.advanceCount ? <>, <strong>{importNotice.advanceCount} advance</strong></> : null}
                {importNotice.pendingCount ? <>, <strong>{importNotice.pendingCount} pending</strong></> : null}.
              </p>
            </div>
          </div>
          <button
            onClick={() => setImportNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold text-[13px] px-2.5 py-1 rounded-lg hover:bg-emerald-100/80 transition-colors shrink-0 self-end sm:self-center"
            title="Dismiss now"
          >
            Dismiss ✕
          </button>
          {/* Animated 30-second countdown indicator line */}
          <div
            className="absolute bottom-0 left-0 h-[3px] bg-emerald-500 rounded-full"
            style={{ animation: 'autoDismissBar 30s linear forwards' }}
          />
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

      {/* ── Single Merged Hero Header (Green Gradient matching Clients & Fluent Forms) ── */}
      <section className="gradient-card rounded-[24px] px-6 sm:px-7 py-4 sm:py-5 text-white shadow-[0_8px_32px_rgba(15,23,42,0.25)] ring-1 ring-black/10 relative z-30">
        {/* Isolated Glow Container (overflow-hidden keeps glow inside rounded card while letting popups overflow) */}
        <div className="absolute inset-0 rounded-[24px] overflow-hidden pointer-events-none">
          <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
          {/* Left: Title + Scope Tag + Live Subtitle */}
          <div className="min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={openMenu}
              className="lg:hidden mb-3 w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 border border-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <div className="flex items-center gap-3 flex-wrap mb-1.5">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Daily Job Sheet
              </h1>

              {/* Status Badge */}
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-white text-emerald-900 font-extrabold text-[12px] rounded-full shadow-md border border-white/90">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600" />
                </span>
                {isDateRange ? getPresetDisplayName(dateRangePreset) : 'Live Daily Schedule'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-white/80 text-[13px]">
              <span>Operations & Scheduling · {isDateRange ? getPresetDisplayName(dateRangePreset) : fmtDate(selectedDate)}</span>
              <span className="text-white/40 hidden sm:inline">·</span>
              <span className="text-emerald-300 font-semibold">{jobsCount} Active Jobs</span>
              <span className="text-white/40 hidden sm:inline">·</span>
              <span className="text-white/95">{staffOnDuty} Staff on Duty</span>
            </div>
          </div>

          {/* Right: Date navigation & Action Buttons */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Date Navigation (Previous Day, Date Picker, Next Day) - Sleek unified capsule without bulky nested box */}
            <div className="h-11 flex items-center bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl backdrop-blur-md shadow-sm transition-all">
              <button
                type="button"
                onClick={prevDay}
                className="h-full px-2.5 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 rounded-l-2xl transition-colors cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft size={17} />
              </button>

              <div className="w-px h-5 bg-white/20" />

              <div className="relative flex items-center px-1">
                {isDateRange ? (
                  <button
                    type="button"
                    onClick={() => setShowRangeMenu(true)}
                    className="h-10 px-3 flex items-center gap-1.5 text-white font-bold text-[12.5px] hover:text-emerald-200 transition-colors cursor-pointer"
                    title="Active Preset (Click to change)"
                  >
                    <span>{getPresetDisplayName(dateRangePreset)}</span>
                  </button>
                ) : (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => {
                      setDateRangePreset('today')
                      setSelectedDate(e.target.value)
                    }}
                    className="h-10 px-2.5 bg-transparent text-white font-bold text-[12.5px] focus:outline-none cursor-pointer transition-all [color-scheme:dark]"
                    title="Select Date"
                  />
                )}
              </div>

              <div className="w-px h-5 bg-white/20" />

              <button
                type="button"
                onClick={nextDay}
                className="h-full px-2.5 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 rounded-r-2xl transition-colors cursor-pointer"
                title="Next Day"
              >
                <ChevronRight size={17} />
              </button>
            </div>

            {/* Date Range Preset Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRangeMenu(p => !p)}
                className={`h-11 px-3.5 rounded-2xl border text-[12.5px] font-bold transition-all cursor-pointer backdrop-blur-md shadow-sm flex items-center gap-2 ${
                  isDateRange || showRangeMenu
                    ? 'bg-white text-emerald-900 border-white shadow-md'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                }`}
              >
                <Calendar size={14} className={isDateRange || showRangeMenu ? 'text-emerald-700' : 'text-emerald-300'} />
                <span>{getPresetDisplayName(dateRangePreset)}</span>
                <ChevronDown size={14} className={isDateRange || showRangeMenu ? 'text-emerald-700' : 'text-white/70'} />
              </button>

              {showRangeMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowRangeMenu(false)} />
                  <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-56 bg-white rounded-2xl border border-[#E4E8EC] shadow-[0_16px_48px_rgba(15,23,42,0.22)] py-2 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-[min(480px,calc(100vh-200px))] overflow-y-auto text-slate-800">
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
                    </button>

                    <div className="px-3 pt-2 pb-1 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recent Days</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => selectPreset('7days')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '7days'
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '7days' ? 'bg-emerald-600' : 'bg-transparent'}`} />
                        <span>Last 7 Days</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('14days')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '14days'
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '14days' ? 'bg-emerald-600' : 'bg-transparent'}`} />
                        <span>Last 14 Days</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('28days')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '28days'
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '28days' ? 'bg-emerald-600' : 'bg-transparent'}`} />
                        <span>Last 28 Days</span>
                      </div>
                    </button>

                    <div className="px-3 pt-2 pb-1 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Extended History</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => selectPreset('3months')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '3months'
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '3months' ? 'bg-emerald-600' : 'bg-transparent'}`} />
                        <span>Last 3 Months</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('6months')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '6months'
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '6months' ? 'bg-emerald-600' : 'bg-transparent'}`} />
                        <span>Last 6 Months</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('1year')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '1year'
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '1year' ? 'bg-emerald-600' : 'bg-transparent'}`} />
                        <span>One Year</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('2years')}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors cursor-pointer ${
                        dateRangePreset === '2years'
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dateRangePreset === '2years' ? 'bg-emerald-600' : 'bg-transparent'}`} />
                        <span>Two Years</span>
                      </div>
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

            {/* Hidden Excel Import File Input */}
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

            {/* Import Button */}
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              disabled={importing}
              title="Import Excel: Sheet ki date file name say automatically set hoti hai"
              className="h-11 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-[12.5px] shadow-sm backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Upload size={15} className="text-emerald-300" />
              <span>{importing ? 'Importing…' : 'Import'}</span>
            </button>

            {/* Primary Action: Add Job Button (Solid White with Green text, matching Clients/Fluent Forms) */}
            <button
              type="button"
              onClick={() => setShowAddJob(true)}
              className="h-11 px-5 rounded-2xl bg-white text-emerald-800 font-extrabold text-[13px] shadow-lg hover:bg-emerald-50 transition-all shrink-0 flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} strokeWidth={2.5} className="text-emerald-700" />
              <span>Add Job</span>
            </button>

            {/* Three-dot menu containing Print, Export, Template, Delete */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHeaderMenu(p => !p)}
                className={`h-11 w-11 rounded-2xl border transition-all cursor-pointer flex items-center justify-center backdrop-blur-md shadow-sm ${
                  showHeaderMenu
                    ? 'bg-white text-emerald-800 border-white shadow-md'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                }`}
                title="More actions (Print, Export, Template, Delete)"
              >
                <MoreVertical size={18} />
              </button>

              {showHeaderMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowHeaderMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-2xl border border-[#E4E8EC] shadow-[0_16px_48px_rgba(15,23,42,0.22)] py-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-slate-800">
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
                    <button
                      type="button"
                      disabled={driveStatus === 'connecting' || driveStatus === 'uploading'}
                      onClick={() => {
                        setShowHeaderMenu(false)
                        const webhookUrl = getDriveWebhookUrl()
                        if (!webhookUrl && !gdriveConfigured) {
                          setShowDriveModal(true)
                        } else {
                          backupToDrive()
                        }
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer text-left disabled:opacity-50"
                    >
                      <CloudUpload size={15} className="text-blue-600" />
                      <span>Send to Google Drive</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowHeaderMenu(false)
                        setShowDriveModal(true)
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors cursor-pointer text-left pl-9"
                    >
                      <Settings size={13} className="text-slate-400" />
                      <span>Drive & n8n Settings</span>
                    </button>
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
                    <button
                      type="button"
                      disabled={dailyJobs.length === 0 && dailyExpenses.length === 0}
                      onClick={() => { setShowHeaderMenu(false); setShowDeleteAllConfirm(true) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-bold text-red-700 hover:bg-red-100/70 transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed border-t border-red-100/60 bg-red-50/40"
                    >
                      <AlertTriangle size={15} className="text-red-600" />
                      <span>Delete All Data</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Delete Feedback */}
        {deleteSuccessNotice && (
          <div className="mt-4 bg-white/15 border border-white/20 rounded-xl px-4 py-2.5 flex items-center justify-between text-white backdrop-blur-md animate-in fade-in duration-200">
            <p className="text-[12px] font-bold text-white flex items-center gap-2">
              <CheckCircle size={15} className="text-emerald-300" />
              <span>✓ {deleteSuccessNotice}</span>
            </p>
            <button
              type="button"
              onClick={() => setDeleteSuccessNotice(null)}
              className="text-white/70 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Drive feedback */}
        {driveStatus === 'done' && (
          <div className="mt-4 bg-white/15 border border-white/20 rounded-xl px-4 py-2.5 flex items-center justify-between text-white backdrop-blur-md">
            <p className="text-[12px] font-bold text-white">✓ Daily Job Sheet backed up to Google Drive</p>
            {driveLink ? (
              <a href={driveLink} target="_blank" rel="noopener noreferrer" className="text-[12px] text-emerald-300 underline font-semibold flex items-center gap-1">Open file ↗</a>
            ) : (
              <button
                type="button"
                onClick={() => setShowDriveModal(true)}
                className="text-[11.5px] text-emerald-200 hover:text-white underline font-semibold cursor-pointer"
              >
                View Details
              </button>
            )}
          </div>
        )}
        {driveStatus === 'error' && (
          <div className="mt-4 bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-2.5 flex items-center justify-between text-white backdrop-blur-md">
            <p className="text-[12px] font-semibold">{driveError}</p>
            <button
              type="button"
              onClick={() => setShowDriveModal(true)}
              className="text-[11.5px] underline font-bold text-amber-200 hover:text-white cursor-pointer"
            >
              Configure n8n Webhook
            </button>
          </div>
        )}
      </section>

      {/* ── KPI Cards (Structured 2-Row Modern Executive Layout - Clickable) ── */}
      <div className="space-y-3 sm:space-y-3.5">
        {/* Row 1: Primary Financial & Net Revenue Flow (Charges card first!) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
          {[
            {
              id: 'charges',
              label: 'CHARGES',
              sublabel: 'Total billed amount',
              value: `AED ${totalCharges.toLocaleString()}`,
              valueColor: 'text-indigo-950',
              labelColor: 'text-indigo-700',
              sublabelColor: 'text-slate-500',
              bg: 'bg-gradient-to-br from-indigo-50/95 via-indigo-50/40 to-white hover:from-indigo-100/90 hover:to-indigo-50/70',
              border: 'border-2 border-indigo-200 hover:border-indigo-400',
              icon: Receipt,
              iconBg: 'bg-[#4f46e5] text-white shadow-md shadow-indigo-500/25',
              tooltip: 'Click to view Jobs Table & Charges column',
              onClick: () => {
                setPaymentFilter('ALL')
                scrollToElement('jobs-table-section')
              },
            },
            {
              id: 'collection',
              label: isDateRange ? 'GROSS COLLECTED' : 'TODAY COLLECTION',
              sublabel: isDateRange ? 'Direct collections' : 'Cash & direct today',
              value: `AED ${grossCollected.toLocaleString()}`,
              valueColor: 'text-emerald-950',
              labelColor: 'text-emerald-700',
              sublabelColor: 'text-slate-500',
              bg: 'bg-gradient-to-br from-emerald-50/95 via-emerald-50/40 to-white hover:from-emerald-100/90 hover:to-emerald-50/70',
              border: 'border-2 border-emerald-300 hover:border-emerald-400',
              icon: Wallet,
              iconBg: 'bg-[#059669] text-white shadow-md shadow-emerald-500/25',
              tooltip: 'Click to view Driver & Staff Collections Summary',
              onClick: () => {
                scrollToElement('driver-summary-widget')
              },
            },
            {
              id: 'pending-rcvd',
              label: 'PENDING CASH RECEIVED',
              sublabel: 'Recovered cash dues',
              value: `AED ${pendingCashRcvdForNet.toLocaleString()}`,
              valueColor: 'text-[#0f766e]',
              labelColor: 'text-teal-700',
              sublabelColor: 'text-slate-500',
              bg: 'bg-gradient-to-br from-teal-50/95 via-teal-50/40 to-white hover:from-teal-100/90 hover:to-teal-50/70',
              border: 'border-2 border-teal-300 hover:border-teal-400',
              icon: CheckCircle,
              iconBg: 'bg-[#008f7a] text-white shadow-md shadow-teal-500/25',
              tooltip: 'Click to view Pending Received Reconciliation widget',
              onClick: () => {
                scrollToElement('pending-received-widget')
              },
            },
            {
              id: 'expenses',
              label: 'EXPENSES',
              sublabel: 'Fuel, supplies & others',
              value: `AED ${totalExpenses.toLocaleString()}`,
              valueColor: 'text-[#b45309]',
              labelColor: 'text-amber-800',
              sublabelColor: 'text-slate-500',
              bg: 'bg-gradient-to-br from-amber-50/95 via-amber-50/40 to-white hover:from-amber-100/90 hover:to-amber-50/70',
              border: 'border-2 border-amber-300 hover:border-amber-400',
              icon: TrendingUp,
              iconBg: 'bg-[#ea580c] text-white shadow-md shadow-amber-500/25',
              tooltip: 'Click to view Expenses Log widget',
              onClick: () => {
                scrollToElement('expenses-log-widget')
              },
            },
            {
              id: 'net-total',
              label: 'NET TOTAL',
              sublabel: 'Net bottom line in hand',
              value: `AED ${netTotal.toLocaleString()}`,
              valueColor: 'text-white drop-shadow-xs',
              labelColor: 'text-white/95',
              sublabelColor: 'text-emerald-100',
              bg: netTotal >= 0
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30',
              border: netTotal >= 0 ? 'border-2 border-emerald-400/90' : 'border-2 border-rose-400/90',
              icon: DollarSign,
              iconBg: 'bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-xs shadow-xs',
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
                className={`group relative rounded-[22px] ${c.border} ${c.bg} p-4 sm:p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] cursor-pointer flex flex-col justify-between text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1`}
              >
                <div className="flex items-start justify-between gap-2 mb-2 w-full">
                  <span className={`text-[11px] font-bold tracking-wider uppercase truncate ${c.labelColor}`}>
                    {c.label}
                  </span>
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${c.iconBg}`}
                  >
                    <Icon size={18} strokeWidth={2.2} />
                  </div>
                </div>

                <div className="w-full">
                  <p className={`text-[23px] sm:text-[26px] font-black tracking-tight leading-tight truncate ${c.valueColor}`}>
                    {c.value}
                  </p>
                  <p className={`text-[11px] sm:text-[11.5px] font-medium mt-1 truncate ${c.sublabelColor}`}>
                    {c.sublabel}
                  </p>
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
              label: 'PENDING',
              sublabel: 'Uncollected balances',
              value: `AED ${pendingTotal.toLocaleString()}`,
              valueColor: 'text-rose-900',
              labelColor: 'text-rose-700',
              sublabelColor: 'text-slate-500',
              bg: 'bg-gradient-to-br from-rose-50/95 via-rose-50/40 to-white hover:from-rose-100/90 hover:to-rose-50/70',
              border: 'border-2 border-rose-300 hover:border-rose-400',
              icon: AlertCircle,
              iconBg: 'bg-[#e11d48] text-white shadow-md shadow-rose-500/25',
              tooltip: 'Click to view Today Pending Records widget',
              onClick: () => {
                scrollToElement('today-pending-widget')
              },
            },
            {
              id: 'online',
              label: 'ONLINE',
              sublabel: 'Card & bank transfers',
              value: `AED ${onlineTotal.toLocaleString()}`,
              valueColor: 'text-sky-900',
              labelColor: 'text-sky-700',
              sublabelColor: 'text-slate-500',
              bg: 'bg-gradient-to-br from-sky-50/95 via-sky-50/40 to-white hover:from-sky-100/90 hover:to-sky-50/70',
              border: 'border-2 border-sky-300 hover:border-sky-400',
              icon: CreditCard,
              iconBg: 'bg-[#0284c7] text-white shadow-md shadow-sky-500/25',
              tooltip: 'Click to filter Jobs Table by Online Mode',
              onClick: () => {
                setPaymentFilter('Online')
                scrollToElement('jobs-table-section')
              },
            },
            {
              id: 'ot',
              label: 'OT (OVERTIME)',
              sublabel: 'Total approved OT',
              value: `${totalOTHours}h`,
              valueColor: 'text-[#c2410c]',
              labelColor: 'text-orange-800',
              sublabelColor: 'text-slate-500',
              bg: 'bg-gradient-to-br from-orange-50/95 via-orange-50/40 to-white hover:from-orange-100/90 hover:to-orange-50/70',
              border: 'border-2 border-orange-300 hover:border-orange-400',
              icon: Clock,
              iconBg: 'bg-[#ea580c] text-white shadow-md shadow-orange-500/25',
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
              label: isDateRange ? 'ACTIVE STAFF' : 'STAFF ON DUTY',
              sublabel: isDateRange ? 'Cleaners deployed' : 'Present on shift',
              value: String(staffOnDuty),
              valueColor: 'text-[#065f46]',
              labelColor: 'text-emerald-800',
              sublabelColor: 'text-slate-500',
              bg: 'bg-gradient-to-br from-emerald-50/95 via-emerald-50/40 to-white hover:from-emerald-100/90 hover:to-emerald-50/70',
              border: 'border-2 border-emerald-300 hover:border-emerald-400',
              icon: Users,
              iconBg: 'bg-[#047857] text-white shadow-md shadow-emerald-500/25',
              tooltip: 'Click to view Driver / Staff Summary widget',
              onClick: () => {
                scrollToElement('driver-summary-widget')
              },
            },
            {
              id: 'jobs',
              label: isDateRange ? 'TOTAL JOBS' : 'JOBS TODAY',
              sublabel: isDateRange ? 'Total assignments' : 'Bookings scheduled',
              value: String(jobsCount),
              valueColor: 'text-blue-950',
              labelColor: 'text-blue-700',
              sublabelColor: 'text-slate-500',
              bg: 'bg-gradient-to-br from-blue-50/95 via-blue-50/40 to-white hover:from-blue-100/90 hover:to-blue-50/70',
              border: 'border-2 border-blue-300 hover:border-blue-400',
              icon: Briefcase,
              iconBg: 'bg-[#2563eb] text-white shadow-md shadow-blue-500/25',
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
                className={`group relative rounded-[22px] ${c.border} ${c.bg} p-4 sm:p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] cursor-pointer flex flex-col justify-between text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1`}
              >
                <div className="flex items-start justify-between gap-2 mb-2 w-full">
                  <span className={`text-[11px] font-bold tracking-wider uppercase truncate ${c.labelColor}`}>
                    {c.label}
                  </span>
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${c.iconBg}`}
                  >
                    <Icon size={18} strokeWidth={2.2} />
                  </div>
                </div>

                <div className="w-full">
                  <p className={`text-[23px] sm:text-[26px] font-black tracking-tight leading-tight truncate ${c.valueColor}`}>
                    {c.value}
                  </p>
                  <p className={`text-[11px] sm:text-[11.5px] font-medium mt-1 truncate ${c.sublabelColor}`}>
                    {c.sublabel}
                  </p>
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
                {isDateRange ? getPresetDisplayName(dateRangePreset) : fmtDate(selectedDate)}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              {todayJobs.length === 0 ? (
                <span>No jobs recorded for this date</span>
              ) : (
                <span>
                  {filteredActiveJobRows.length} active {filteredActiveJobRows.length === 1 ? 'job' : 'jobs'}
                  {filteredNilRows.length > 0 && ` · ${filteredNilRows.length} absentees / nil`}
                </span>
              )}
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
          <div className="w-[34px] sm:w-[38px] flex-shrink-0 bg-[#f8fafc] border-r border-[#E4E8EC] py-2 flex flex-col items-center gap-0.5 select-none text-[10px] max-h-[calc(100vh-210px)] overflow-y-auto overscroll-contain">
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
          <div className="flex-1 overflow-auto max-h-[calc(100vh-210px)] min-w-0 relative overscroll-contain table-scroll-container">
            <table
              className="w-full text-[12px] border-collapse relative"
              style={{ minWidth: Math.max(500, Object.values(visibleColumns).filter(Boolean).length * 80) }}
            >
              <thead className="sticky top-0 z-30 shadow-[0_2px_4px_rgba(0,0,0,0.06)] bg-slate-100">
                <tr className="bg-slate-100 border-b border-[#E4E8EC]">
                  {visibleColumns.staff && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Staff</th>}
                  {visibleColumns.start_time && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Start</th>}
                  {visibleColumns.end_time && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">End</th>}
                  {visibleColumns.address && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Address</th>}
                  {visibleColumns.area && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Location</th>}
                  {visibleColumns.charges && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Charges</th>}
                  {visibleColumns.received && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Received</th>}
                  {visibleColumns.pending && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Pending</th>}
                  {visibleColumns.duty_hours && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Duty Hrs</th>}
                  {visibleColumns.ot_hours && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">OT Hrs</th>}
                  {visibleColumns.material && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Material</th>}
                  {visibleColumns.payment_mode && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Mode</th>}
                  {visibleColumns.remarks && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Remarks</th>}
                  {visibleColumns.service && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]">Service</th>}
                  {visibleColumns.actions && <th className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]"></th>}
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
      <AddExpenseModal
        open={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        selectedDate={selectedDate}
        onAdd={addDailyExpense}
      />

      {/* ── Edit Expense Modal ── */}
      <EditExpenseModal
        expense={editExpense}
        onClose={() => setEditExpense(null)}
        onUpdate={updateDailyExpense}
      />

      {/* ── Confirm Delete Day Data Modal ── */}
      <DeleteDayConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        selectedDate={selectedDate}
        jobsCount={todayJobs.length}
        expensesCount={todayExpenses.length}
        onConfirm={() => {
          clearDailyData(selectedDate)
          setPendingList(prev => prev.filter(x => x.date !== selectedDate))
          setPendingRcvdList(prev => prev.filter(x => x.date !== selectedDate))
          setAdvanceList(prev => prev.filter(x => x.date !== selectedDate))
          setShowDeleteConfirm(false)
          setDeleteSuccessNotice(fmtDate(selectedDate) + " data deleted")
        }}
      />

      {/* ── Confirm Delete All Data Modal ── */}
      <DeleteAllConfirmModal
        open={showDeleteAllConfirm}
        onClose={() => setShowDeleteAllConfirm(false)}
        totalJobsCount={dailyJobs.length}
        totalExpensesCount={dailyExpenses.length}
        onConfirm={async () => {
          await clearAllDailyData()
          setPendingList([])
          setPendingRcvdList([])
          setAdvanceList([])
          safeLocalStorageSet('safaeewala_daily_pending_items', [])
          safeLocalStorageSet('safaeewala_daily_pending_rcvd_items', [])
          safeLocalStorageSet('safaeewala_daily_advance_items', [])
          setShowDeleteAllConfirm(false)
          setDeleteSuccessNotice('All database records have been permanently deleted')
        }}
      />

      {/* ── Edit Driver / Staff Summary Modal ── */}
      <DriverStaffModal
        staff={editingDriverStaff}
        selectedDate={selectedDate}
        todayJobs={todayJobs}
        onClose={() => setEditingDriverStaff(null)}
        onEditJob={job => setEditJob(job)}
      />

      {/* ── Add Pending Item Modal ── */}
      <AddPendingModal
        open={showAddPending}
        selectedDate={selectedDate}
        onClose={() => setShowAddPending(false)}
        onAdd={item => setPendingList(prev => [item, ...prev])}
      />

      {/* ── Edit Pending Item Modal ── */}
      <EditPendingModal
        item={editingPending}
        onClose={() => setEditingPending(null)}
        onSave={(id, client, amount) => {
          setPendingList(prev => prev.map(x => x.id === id ? { ...x, client, amount } : x))
        }}
      />

      {/* ── Add Pending Received Item Modal ── */}
      <AddPendingReceivedModal
        open={showAddPendingRcvd}
        selectedDate={selectedDate}
        onClose={() => setShowAddPendingRcvd(false)}
        onAdd={item => setPendingRcvdList(prev => [item, ...prev])}
      />

      {/* ── Edit Pending Received Item Modal ── */}
      <EditPendingReceivedModal
        item={editingPendingRcvd}
        onClose={() => setEditingPendingRcvd(null)}
        onSave={(id, client, cash, online) => {
          setPendingRcvdList(prev => prev.map(x => x.id === id ? { ...x, client, cash, online } : x))
        }}
      />

      {/* ── Add Advance Item Modal ── */}
      <AddAdvanceModal
        open={showAddAdvance}
        selectedDate={selectedDate}
        onClose={() => setShowAddAdvance(false)}
        onAdd={item => setAdvanceList(prev => [item, ...prev])}
      />

      {/* ── Edit Advance Item Modal ── */}
      <EditAdvanceModal
        item={editingAdvance}
        onClose={() => setEditingAdvance(null)}
        onSave={(id, client, received, advance) => {
          setAdvanceList(prev => prev.map(x => x.id === id ? { ...x, client, received, advance } : x))
        }}
      />

      {/* ── Today Pending Details Pop-up Modal ── */}
      <PendingDetailsModal
        details={selectedPendingDetails}
        onClose={() => setSelectedPendingDetails(null)}
        onEditJob={job => setEditJob(job)}
        onEditPending={item => setEditingPending(item)}
        onMarkCollected={details => {
          if (details.job) {
            updateDailyJob(details.job.id, {
              payment_mode: 'Cash',
              received: cleanNum(details.job.charges),
            })
          } else {
            setPendingList(prev => prev.filter(x => x.id !== details.id))
          }
        }}
      />

      {/* ── Google Drive & n8n Automation Modal ── */}
      <GoogleDriveWebhookModal
        open={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        selectedDate={selectedDate}
        todayJobsCount={todayJobs.length}
        onSendBackupNow={async () => {
          await backupToDrive()
        }}
        isUploading={driveStatus === 'uploading' || driveStatus === 'connecting'}
        driveStatus={driveStatus}
        driveLink={driveLink}
        driveError={driveError}
      />

    </div>
  )
}
