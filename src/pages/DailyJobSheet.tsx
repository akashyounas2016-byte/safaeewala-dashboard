import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  ChevronLeft, ChevronRight, Calendar, Printer, Download, Plus,
  Trash2, AlertCircle, AlertTriangle, Lock, TrendingUp, Users, Briefcase, CloudUpload,
  Upload, CheckCircle, FileSpreadsheet, SlidersHorizontal,
  Clock, DollarSign, Wallet, Search, Filter, X, Pencil, MoreVertical, ChevronDown,
  Receipt, CreditCard, Eye, Settings, Check, Info, GripVertical, ChevronUp, RotateCcw,
  ExternalLink, Sparkles, ArrowDownToLine, RefreshCw, CheckCircle2, Palette,
  Layers, Table, Building2, MapPin,
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
  formatTime12h,
  calcHours,
  calcOTHours,
  fmtDate,
  addDaysToYMD,
  STAFF_COLOR_PALETTES,
  ALL_COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
  type ColumnConfig,
  type StaffPalette,
  ROW_COLOR_PRESETS,
} from '@/components/dailyJobSheet/jobSheetUtils'
import { PaymentBadge, AddressCell } from '@/components/dailyJobSheet/JobSheetBadges'
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
import { MonthlyScheduleSyncModal } from '@/components/dailyJobSheet/MonthlyScheduleSyncModal'
import { JobSheetKPIs } from '@/components/dailyJobSheet/JobSheetKPIs'
import { ExpensesAndDriversPanel } from '@/components/dailyJobSheet/ExpensesAndDriversPanel'
import { ReconciliationWidgets } from '@/components/dailyJobSheet/ReconciliationWidgets'
import { EditJobModal } from '@/components/dailyJobSheet/EditJobModal'
import {
  getScheduledMonthlyShiftsForDate,
  splitStaffNames,
  syncMonthlySchedulesToDailyJobs,
  syncMonthlySchedulesForDateRange,
  buildPendingCalcContext,
  loadClientAdjustments,
  calcJobCollectable,
  jobCollected,
  isBogusJob,
  allocateClientCollection,
  type ScheduledShiftPlan,
} from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'
import { todayDubai } from '@/lib/dubaiTime'
import { escapeHtml } from '@/lib/html'
import { invoicedJobIds } from '@/lib/receivables'
import { notify, confirmAsync } from '@/lib/notify'
import { ImportPreviewModal, type ImportPlan } from '@/components/dailyJobSheet/ImportPreviewModal'
import { buildCleanerRoster } from '@/lib/attendance'
import { buildRowChecks } from '@/lib/jobChecks'
import { parseJobSheetWorkbook } from '@/lib/jobSheetImport'
import { CLOSED_DAYS_KEY, type ClosedDay } from '@/lib/closedDays'

/* ─── Main Page ─── */
export function DailyJobSheet() {
  const navigate = useNavigate()
  const { openMenu } = useLayout()
  const { dailyJobs, dailyExpenses, employees, clients, invoices, loading, addDailyJob, updateDailyJob, deleteDailyJob, addDailyExpense, updateDailyExpense, deleteDailyExpense, clearDailyData, clearAllDailyData } = useData()

  const [searchParams, setSearchParams] = useSearchParams()
  const qDate = searchParams.get('date')
  const initialDate = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)
    ? qDate
    : todayDubai()
  const [selectedDate, setSelectedDateState] = useState(initialDate)

  // ── Weekly Schedule ↔ Daily Job Sheet Synchronization State ──
  const [showMonthlySyncModal, setShowMonthlySyncModal] = useState(false)
  const [autoSyncMonthly, setAutoSyncMonthly] = useState<boolean>(() => {
    return safeLocalStorageGet('safaeewala_auto_sync_monthly_schedules', true)
  })
  const autoSyncedDatesRef = useRef<Set<string>>(new Set())

  // Inline Cell Editing State & Functions
  const [inlineEdit, setInlineEdit] = useState<{
    jobId: string
    field: 'staff_name' | 'start_time' | 'end_time' | 'address' | 'area' | 'charges' | 'received' | 'date'
    tempValue: string
  } | null>(null)

  const inlineInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inlineEdit) {
      setTimeout(() => inlineInputRef.current?.focus(), 25)
    }
  }, [inlineEdit])

  // UX-26: a closed day is locked against edits until it is reopened
  const [closedDays, setClosedDays] = useState<Record<string, ClosedDay>>(() => safeLocalStorageGet<Record<string, ClosedDay>>(CLOSED_DAYS_KEY, {}))
  useEffect(() => { safeLocalStorageSet(CLOSED_DAYS_KEY, closedDays) }, [closedDays])
  const isDayClosed = (date: string) => Boolean(closedDays[date])
  /** True (and a message) when the date is closed — callers stop */
  const blockIfClosed = (date: string = selectedDate) => {
    if (!isDayClosed(date)) return false
    notify.error(`${fmtDate(date)} is closed. Reopen the day to change it.`)
    return true
  }

  const startInlineEdit = (
    jobId: string,
    field: 'staff_name' | 'start_time' | 'end_time' | 'address' | 'area' | 'charges' | 'received' | 'date',
    initialVal: string
  ) => {
    const job = dailyJobs.find(j => j.id === jobId)
    if (blockIfClosed(job?.date)) return
    setInlineEdit({ jobId, field, tempValue: initialVal })
  }

  const saveInlineEdit = (job: DailyJob) => {
    if (!inlineEdit || inlineEdit.jobId !== job.id) return
    const { field, tempValue } = inlineEdit
    const trimmed = tempValue.trim()
    const patch: Partial<DailyJob> = {}
    const targetJobId = (job as any)._originalJobId || job.id

    if (field === 'staff_name') {
      patch.staff_name = trimmed || job.staff_name
    } else if (field === 'start_time') {
      const formatted = formatTimeOnly(trimmed)
      patch.start_time = formatted !== '—' ? formatted : trimmed
      const s = patch.start_time
      const e = job.end_time
      if (s && e && s !== '—' && e !== '—') {
        patch.duty_hours = Math.round(calcHours(s, e) * 10) / 10
        patch.ot_hours = Math.round(calcOTHours(s, e) * 10) / 10
      }
    } else if (field === 'end_time') {
      const formatted = formatTimeOnly(trimmed)
      patch.end_time = formatted !== '—' ? formatted : trimmed
      const s = job.start_time
      const e = patch.end_time
      if (s && e && s !== '—' && e !== '—') {
        patch.duty_hours = Math.round(calcHours(s, e) * 10) / 10
        patch.ot_hours = Math.round(calcOTHours(s, e) * 10) / 10
      }
    } else if (field === 'address') {
      patch.address = trimmed
    } else if (field === 'area') {
      patch.area = trimmed
    } else if (field === 'charges') {
      patch.charges = cleanNum(trimmed)
    } else if (field === 'received') {
      patch.received = cleanNum(trimmed)
    } else if (field === 'date') {
      patch.date = trimmed || job.date
    }

    updateDailyJob(targetJobId, patch)
    setInlineEdit(null)
  }

  const cancelInlineEdit = () => {
    setInlineEdit(null)
  }

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
  const [addJobStaff, setAddJobStaff]       = useState('')
  const openAddJob = (staff = '') => { setAddJobStaff(staff); setShowAddJob(true) }
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
  const [paymentFilter, setPaymentFilter]       = useState<'ALL' | 'Project' | 'Monthly' | 'Cash' | 'Online' | 'Pending' | 'Checks'>('ALL')
  const [projectBoardView, setProjectBoardView] = useState<'board' | 'table'>('board')
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
    const end = selectedDate || todayDubai()
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
      setSelectedDate(todayDubai())
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

  // Category Row Background Color Customization State (persisted in localStorage)
  // Per user instruction: adjusting these colors changes the matching table rows' background color
  const DEFAULT_CATEGORY_ROW_COLORS: Record<string, string> = {
    ALL: '#ffffff',       // Pure Clean White default
    Project: '#f5f3ff',   // Soft Violet Tint (Project Teams)
    Monthly: '#d1fae5',   // Soft Emerald Tint (Monthly rows)
    Cash: '#ffffff',      // Pure Clean White
    Online: '#f0f9ff',    // Soft Sky Tint
    Pending: '#fee2e2',   // Soft Red Tint
    Checks: '#fef3c7',    // Soft Amber Tint
  }
  const [filterColors, setFilterColors] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('safaeewala_row_filter_colors_v2')
      if (saved) return { ...DEFAULT_CATEGORY_ROW_COLORS, ...JSON.parse(saved) }
    } catch {}
    return DEFAULT_CATEGORY_ROW_COLORS
  })
  const [showFilterColorMenu, setShowFilterColorMenu] = useState(false)

  const updateFilterColor = (mode: string, color: string) => {
    const updated = { ...filterColors, [mode]: color }
    setFilterColors(updated)
    try {
      localStorage.setItem('safaeewala_row_filter_colors_v2', JSON.stringify(updated))
    } catch {}
  }

  const resetFilterColors = () => {
    setFilterColors(DEFAULT_CATEGORY_ROW_COLORS)
    try {
      localStorage.removeItem('safaeewala_row_filter_colors_v2')
    } catch {}
  }

  // Column visibility & sequence customization state (persisted in localStorage)
  const [showColMenu, setShowColMenu] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('safaeewala_daily_job_cols')
      if (saved) return { ...DEFAULT_VISIBLE_COLUMNS, ...JSON.parse(saved) }
    } catch {}
    return DEFAULT_VISIBLE_COLUMNS
  })

  // Column order sequence state (persisted in localStorage)
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('safaeewala_daily_job_col_order')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validSaved = parsed.filter(id => ALL_COLUMNS.some(c => c.id === id))
          const missing = ALL_COLUMNS.filter(c => !validSaved.includes(c.id)).map(c => c.id)
          return [...validSaved, ...missing]
        }
      }
    } catch {}
    return ALL_COLUMNS.map(c => c.id)
  })

  // Drag and drop tracking
  const [draggedColId, setDraggedColId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedColId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedColId && draggedColId !== id && dragOverColId !== id) {
      setDragOverColId(id)
    }
  }

  const handleDragLeave = () => {
    setDragOverColId(null)
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedColId || draggedColId === targetId) {
      setDraggedColId(null)
      setDragOverColId(null)
      return
    }
    setColumnOrder(prev => {
      const fromIndex = prev.indexOf(draggedColId)
      const toIndex = prev.indexOf(targetId)
      if (fromIndex === -1 || toIndex === -1) return prev
      const updated = [...prev]
      const [moved] = updated.splice(fromIndex, 1)
      updated.splice(toIndex, 0, moved)
      try {
        localStorage.setItem('safaeewala_daily_job_col_order', JSON.stringify(updated))
      } catch {}
      return updated
    })
    setDraggedColId(null)
    setDragOverColId(null)
  }

  const handleDragEnd = () => {
    setDraggedColId(null)
    setDragOverColId(null)
  }

  const moveColumn = (id: string, direction: 'up' | 'down') => {
    setColumnOrder(prev => {
      const idx = prev.indexOf(id)
      if (idx === -1) return prev
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= prev.length) return prev
      const updated = [...prev]
      const [moved] = updated.splice(idx, 1)
      updated.splice(targetIdx, 0, moved)
      try {
        localStorage.setItem('safaeewala_daily_job_col_order', JSON.stringify(updated))
      } catch {}
      return updated
    })
  }

  const toggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [colId]: !prev[colId] }
      try {
        localStorage.setItem('safaeewala_daily_job_cols', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const setAllColumnsVisibility = (visible: boolean) => {
    const next: Record<string, boolean> = {}
    ALL_COLUMNS.forEach(c => {
      next[c.id] = visible
    })
    setVisibleColumns(next)
    try {
      localStorage.setItem('safaeewala_daily_job_cols', JSON.stringify(next))
    } catch {}
  }

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
    const defaultOrder = ALL_COLUMNS.map(c => c.id)
    setColumnOrder(defaultOrder)
    try {
      localStorage.removeItem('safaeewala_daily_job_cols')
      localStorage.removeItem('safaeewala_daily_job_col_order')
    } catch {}
  }

  const colMap = useMemo(() => new Map(ALL_COLUMNS.map(c => [c.id, c])), [])

  const orderedAllColumns = useMemo(() => {
    return columnOrder.map(id => colMap.get(id)).filter(Boolean) as ColumnConfig[]
  }, [columnOrder, colMap])

  const activeColumns = useMemo(() => {
    return orderedAllColumns.filter(c => visibleColumns[c.id])
  }, [orderedAllColumns, visibleColumns])

  const isOrderCustomized = useMemo(() => {
    const defaultOrder = ALL_COLUMNS.map(c => c.id)
    return columnOrder.some((id, idx) => id !== defaultOrder[idx])
  }, [columnOrder])

  // Widgets view all / collapse state (default shows 4 items)
  const [viewAllExpenses, setViewAllExpenses] = useState(false)
  const [viewAllDrivers, setViewAllDrivers] = useState(false)

  // Extra reconciliation widgets state (Pending, Pending Received, Advance)
  const [pendingList, setPendingList] = useState<DailyPendingItem[]>(() =>
    safeLocalStorageGet<DailyPendingItem[]>('safaeewala_daily_pending_items', [])
  )

  const [pendingRcvdList, setPendingRcvdList] = useState<DailyPendingReceivedItem[]>(() => {
    return safeLocalStorageGet<DailyPendingReceivedItem[]>('safaeewala_daily_pending_rcvd_items', [])
  })

  const [advanceList, setAdvanceList] = useState<DailyAdvanceItem[]>(() => {
    return safeLocalStorageGet<DailyAdvanceItem[]>('safaeewala_daily_advance_items', [])
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

  // Shared pending formula (adjustments, advance deductions and later collections included)
  const pendingCtx = useMemo(() => buildPendingCalcContext(loadClientAdjustments(), pendingRcvdList), [pendingRcvdList])
  // AUD-53: same receivable rule as Pending / Payments / Overview — monthly-contract visits are
  // settled on Monthly Clients and invoiced visits on the invoice (R-FIN-05, R-FIN-06)
  const invoicedIds = useMemo(() => invoicedJobIds(invoices), [invoices])
  const jobPending = (job: DailyJob) => calcJobCollectable(job, pendingCtx, invoicedIds)

  useEffect(() => {
    safeLocalStorageSet('safaeewala_daily_advance_items', advanceList)
  }, [advanceList])

  useEffect(() => {
    setCurrentPage(1)
    setViewAllExpenses(false)
    setViewAllDrivers(false)
  }, [selectedDate, pageSize, selectedLetter])

  // AUD-52: one rule for sheet totals / empty rows everywhere (R-DATA-01)
  const isBogusSummaryJob = isBogusJob


  // AUD-44: rows that look like sheet totals / empty stubs are hidden, never auto-deleted.
  // The owner can show them and delete them by hand.
  const [showHiddenRows, setShowHiddenRows] = useState(false)
  const hiddenRowsInRange = dailyJobs.filter(j => isDateInRange(j.date) && isBogusSummaryJob(j))
  const todayJobs     = dailyJobs.filter(j => isDateInRange(j.date) && (showHiddenRows || !isBogusSummaryJob(j)))
  const todayExpenses = dailyExpenses.filter(e => isDateInRange(e.date))
  // UX-27: warnings per row (times, amounts, monthly cash, unregistered staff, duplicates)
  const rowChecks = useMemo(() => buildRowChecks(todayJobs, employees), [todayJobs, employees])


  // ── Monthly Repeating Schedules Calculation & Auto-Fetch ──
  const monthlySyncStatus = useMemo(() => {
    if (isDateRange) {
      return { totalScheduled: 0, alreadySyncedCount: 0, pendingSyncCount: 0, dayName: 'Monday' as const, shifts: [] }
    }
    return getScheduledMonthlyShiftsForDate(selectedDate, clients, dailyJobs)
  }, [selectedDate, clients, dailyJobs, isDateRange])

  // Automatically generate repeating monthly client shifts when viewing a single date
  const isSyncingMonthlyRef = useRef(false)
  useEffect(() => {
    if (!autoSyncMonthly || isDateRange || loading) return
    if (isSyncingMonthlyRef.current) return

    if (monthlySyncStatus.pendingSyncCount > 0) {
      isSyncingMonthlyRef.current = true
      const res = syncMonthlySchedulesToDailyJobs(selectedDate, clients, dailyJobs, addDailyJob)
      if (res.insertedCount > 0) {
        setImportNotice({
          jobs: res.insertedCount,
          expenses: 0,
          date: selectedDate,
          fileName: `⚡ Auto-Generated ${res.insertedCount} Monthly Client Shifts (${res.dayName})`,
        })
      }
      setTimeout(() => {
        isSyncingMonthlyRef.current = false
      }, 600)
    }
  }, [selectedDate, autoSyncMonthly, isDateRange, loading, monthlySyncStatus.pendingSyncCount, clients, dailyJobs, addDailyJob])

  const handleSyncAllMonthlyShifts = () => {
    const res = syncMonthlySchedulesToDailyJobs(selectedDate, clients, dailyJobs, addDailyJob)
    if (res.insertedCount > 0) {
      setImportNotice({
        jobs: res.insertedCount,
        expenses: 0,
        date: selectedDate,
        fileName: `⚡ Synced ${res.insertedCount} Monthly Client Shifts (${res.dayName})`,
      })
    }
    setShowMonthlySyncModal(false)
  }

  const handleSyncDateRange = (dateList: string[]) => {
    const res = syncMonthlySchedulesForDateRange(dateList, clients, dailyJobs, addDailyJob)
    if (res.totalInserted > 0) {
      setImportNotice({
        jobs: res.totalInserted,
        expenses: 0,
        date: selectedDate,
        fileName: `⚡ Auto-Generated ${res.totalInserted} Monthly Shifts across ${dateList.length} days`,
      })
    }
    setShowMonthlySyncModal(false)
  }

  const handleSyncSingleShift = (shift: ScheduledShiftPlan) => {
    addDailyJob({
      date: selectedDate,
      staff_name: shift.cleanerName,
      start_time: shift.startTime,
      end_time: shift.endTime,
      duty_hours: shift.durationHours,
      ot_hours: 0,
      address: shift.address,
      area: shift.area,
      material: 'No',
      charges: shift.charges,
      received: 0,
      payment_mode: 'Monthly',
      is_overtime: false,
      remarks: shift.remarks,
      service: shift.service,
    })
  }

  // Map multi-cleaner jobs to consistent Team references (e.g. Team A, Team B, or custom team_name)
  const multiCleanerJobs = todayJobs.filter(j => splitStaffNames(j.staff_name).length > 1 || Boolean(j.team_name))
  const jobTeamMap = new Map<string, string>()
  multiCleanerJobs.forEach((job, idx) => {
    if (job.team_name && job.team_name.trim()) {
      jobTeamMap.set(job.id, job.team_name.trim())
    } else {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      jobTeamMap.set(job.id, `Team ${letters[idx % letters.length]}`)
    }
  })

  // ── Project Teams Data Structure (for Team-wise Columnar Display) ──
  const projectTeamsData = useMemo(() => {
    const teamJobs = todayJobs.filter(j => splitStaffNames(j.staff_name).length > 1 || Boolean(j.team_name))
    const teamsMap = new Map<string, {
      teamName: string
      cleaners: string[]
      leadCleaner: string
      jobs: DailyJob[]
      totalCharges: number
      totalReceived: number
      totalHours: number
    }>()

    teamJobs.forEach((job, idx) => {
      const cleaners = splitStaffNames(job.staff_name)
      const teamRef = job.team_name?.trim() || jobTeamMap.get(job.id) || `Team ${String.fromCharCode(65 + (idx % 26))}`
      
      if (!teamsMap.has(teamRef)) {
        teamsMap.set(teamRef, {
          teamName: teamRef,
          cleaners: [],
          leadCleaner: cleaners[0] || 'Lead Cleaner',
          jobs: [],
          totalCharges: 0,
          totalReceived: 0,
          totalHours: 0,
        })
      }

      const tObj = teamsMap.get(teamRef)!
      cleaners.forEach(c => {
        const trimmed = c.trim()
        if (trimmed && !tObj.cleaners.includes(trimmed)) {
          tObj.cleaners.push(trimmed)
        }
      })
      if (!tObj.leadCleaner && cleaners[0]) {
        tObj.leadCleaner = cleaners[0]
      }

      if (!tObj.jobs.some(j => j.id === job.id)) {
        tObj.jobs.push(job)
        tObj.totalCharges += cleanNum(job.charges)
        tObj.totalReceived += cleanNum(job.received)
        tObj.totalHours += cleanNum(job.duty_hours) || calcHours(job.start_time, job.end_time)
      }
    })

    return Array.from(teamsMap.values()).sort((a, b) => a.teamName.localeCompare(b.teamName))
  }, [todayJobs, jobTeamMap])

  // Group active jobs by staff member so multiple shifts for an employee display sequentially adjacent
  // Multi-cleaner assignment (e.g. 3 cleaners) creates individual rows for each cleaner grouped by employee
  const groupedJobs = todayJobs.reduce((acc, job) => {
    const cleaners = splitStaffNames(job.staff_name)
    if (cleaners.length <= 1) {
      const s = (cleaners[0] || job.staff_name || 'Unassigned Staff').trim()
      if (!acc[s]) acc[s] = []
      acc[s].push(job)
    } else {
      const teamRef = jobTeamMap.get(job.id) || job.team_name || 'Team A'
      // Split into distinct shift rows per cleaner so each employee's shifts are grouped together
      cleaners.forEach((cleaner, cIdx) => {
        const s = cleaner.trim()
        if (!acc[s]) acc[s] = []
        const isPrimary = cIdx === 0
        // Multi-cleaner display rule:
        // Primary cleaner holds the full charges & received amount so sheet figures are accurate and not duplicated.
        // Secondary staff hold 0 charges/received and display Team Reference ('Team A' / 'Team B').
        acc[s].push({
          ...job,
          id: `${job.id}-cleaner-${cleaner.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          staff_name: cleaner,
          charges: isPrimary ? cleanNum(job.charges) : 0,
          received: isPrimary ? cleanNum(job.received) : 0,
          _originalJobId: job.id,
          _isSplitShift: true,
          _isPrimaryCleaner: isPrimary,
          _isSecondaryCleaner: !isPrimary,
          _primaryCleanerName: cleaners[0],
          _teamReference: teamRef,
          _allCleaners: cleaners,
          _cleanerIndex: cIdx + 1,
        } as DailyJob)
      })
    }
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
  const activeStaffSet = new Set(
    todayJobs.flatMap(j => (j.staff_name || '').split(/[,+/&]/).map(s => s.trim().toLowerCase())).filter(Boolean)
  )

  // AUD-51: same cleaner list as Attendance — no hard-coded roster, shared rows split (R-ATT-04)
  const allKnownCleaners = useMemo(() => buildCleanerRoster(employees, dailyJobs, selectedDate), [employees, dailyJobs, selectedDate])

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
      const s = (j.staff_name || '').trim()
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
      const s = (j.staff_name || '').trim()
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
      list = list.filter(j => (j.staff_name || '').trim().toUpperCase().startsWith(selectedLetter))
    }

    // 2. Filter by payment category (Project, Monthly, Cash, Online, Pending, Checks)
    if (paymentFilter !== 'ALL') {
      if (paymentFilter === 'Project') {
        list = list.filter(j => (j as any)._isSplitShift || (j as any)._isSecondaryCleaner || (j as any)._isPrimaryCleaner || splitStaffNames(j.staff_name).length > 1 || Boolean(j.team_name))
      } else if (paymentFilter === 'Monthly') {
        list = list.filter(j => j.payment_mode === 'Monthly')
      } else if (paymentFilter === 'Cash') {
        list = list.filter(j => j.payment_mode === 'Cash')
      } else if (paymentFilter === 'Online') {
        list = list.filter(j => j.payment_mode === 'Online')
      } else if (paymentFilter === 'Pending') {
        list = list.filter(j => jobPending(j) > 0)
      } else if (paymentFilter === 'Checks') {
        list = list.filter(j => rowChecks.has(j.id))
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
  }, [activeJobRows, selectedLetter, paymentFilter, searchQuery, rowChecks])

  const filteredNilRows = useMemo(() => {
    // If a specific payment filter is active (Monthly, Cash, Online, Pending), do not show absent cleaners
    if (paymentFilter !== 'ALL') return []

    let list = nilRows
    if (selectedLetter !== 'ALL') {
      list = list.filter(n => (n.staff_name || '').trim().toUpperCase().startsWith(selectedLetter))
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
      const due = calcJobCollectable(job, pendingCtx, invoicedIds)
      if (!isBogusJob(job) && due > 0) {
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
  }, [todayJobs, todayPendingItems, pendingCtx, invoicedIds])

  const todayPendingTotalAmt   = todayPendingEntries.reduce((s, i) => s + cleanNum(i.amount), 0)
  const pendingTotalAmt        = todayPendingTotalAmt
  const pendingRcvdTotalCash   = todayPendingRcvdItems.reduce((s, i) => s + cleanNum(i.cash), 0)
  const pendingRcvdTotalOnline = todayPendingRcvdItems.reduce((s, i) => s + cleanNum(i.online), 0)
  const pendingRcvdGrandTotal  = pendingRcvdTotalCash + pendingRcvdTotalOnline
  const advanceTotalRcvd       = todayAdvanceItems.reduce((s, i) => s + cleanNum(i.received), 0)
  const advanceTotalAmt        = todayAdvanceItems.reduce((s, i) => s + cleanNum(i.advance), 0)

  // ── Auto-calculations ──
  const totalCharges   = todayJobs.reduce((s, j) => s + cleanNum(j.charges), 0)
  // AUD-54: collected uses the Overview rule (jobCollected, R-FIN-03)
  const grossCollected = todayJobs.reduce((s, j) => s + jobCollected(j), 0)
  const pendingTotal   = todayPendingTotalAmt
  const onlineTotal    = todayJobs.filter(j => j.payment_mode === 'Online').reduce((s, j) => s + jobCollected(j), 0)
  const totalExpenses  = todayExpenses.reduce((s, e) => s + cleanNum(e.amount), 0)

  // Net Total updated formula: (Gross Collected + Pending Cash Received) - Total Expenses
  const pendingCashRcvdForNet = pendingRcvdTotalCash > 0 ? pendingRcvdTotalCash : pendingRcvdGrandTotal
  const netTotal       = (grossCollected + pendingCashRcvdForNet) - totalExpenses

  const totalOTHours   = Math.round(todayJobs.reduce((s, j) => s + (cleanNum(j.ot_hours) || calcOTHours(j.start_time, j.end_time)), 0) * 10) / 10
  const staffOnDuty    = new Set(todayJobs.map(j => j.staff_name)).size
  const jobsCount      = todayJobs.length

  // Driver summary — collected per staff (Synchronized with Shifts, Advances, and Pending Received)
  const driverSummary = useMemo(() => {
    const summary: Record<string, number> = {}

    // 1. Shift collections (Cash + Online, excluding Monthly & Pending)
    todayJobs.forEach(job => {
      if (job.payment_mode !== 'Monthly' && job.payment_mode !== 'Pending') {
        const staff = (job.staff_name || '').trim()
        if (staff) {
          summary[staff] = (summary[staff] || 0) + jobCollected(job)
        }
      }
    })

    // 2. Pending Received collections (synced with driver/cleaner)
    todayPendingRcvdItems.forEach(item => {
      const staffRef = (item as any).staff || (item as any).driver || (item.remarks && employees.find(e => item.remarks?.toLowerCase().includes(e.full_name.toLowerCase()))?.full_name)
      if (staffRef) {
        const amt = cleanNum(item.cash) + cleanNum(item.online)
        summary[staffRef] = (summary[staffRef] || 0) + amt
      }
    })

    // 3. Advance collections (synced with driver/cleaner)
    todayAdvanceItems.forEach(item => {
      const staffRef = (item as any).staff || (item as any).cleaner || (item as any).driver || (item.notes && employees.find(e => item.notes?.toLowerCase().includes(e.full_name.toLowerCase()))?.full_name)
      if (staffRef) {
        summary[staffRef] = (summary[staffRef] || 0) + cleanNum(item.received)
      }
    })

    return summary
  }, [todayJobs, todayPendingRcvdItems, todayAdvanceItems, employees])

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
    if (!el) return
    const container = document.getElementById('main-content-scroll')
    if (container) {
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const targetScrollTop = container.scrollTop + (elRect.top - containerRect.top) - 30
      container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    el.classList.add('ring-4', 'ring-emerald-400', 'ring-offset-2', 'transition-all', 'duration-300')
    setTimeout(() => {
      el.classList.remove('ring-4', 'ring-emerald-400', 'ring-offset-2')
    }, 1800)
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
      Pending: jobPending(j) > 0 ? jobPending(j) : 'Nil',
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
        <td>${escapeHtml(j.staff_name)}</td>
        <td>${formatTimeOnly(j.start_time)}</td>
        <td>${formatTimeOnly(j.end_time)}</td>
        <td>${escapeHtml(j.address || '—')}</td>
        <td>${escapeHtml(j.area || '—')}</td>
        <td style="text-align:right">${j.payment_mode === 'Monthly' ? (cleanNum(j.charges) > 0 ? cleanNum(j.charges) : '—') : cleanNum(j.charges)}</td>
        <td style="text-align:right">${j.payment_mode === 'Pending' || j.payment_mode === 'Monthly' ? '—' : cleanNum(j.received)}</td>
        <td style="text-align:right">${jobPending(j) > 0 ? jobPending(j) : 'Nil'}</td>
        <td style="text-align:center">${cleanNum(j.duty_hours)}h</td>
        <td style="text-align:center">${otDisplay > 0 ? otDisplay + 'h OT' : '0'}</td>
        <td>${escapeHtml(j.material)}</td>
        <td>${escapeHtml(j.payment_mode)}</td>
        <td>${escapeHtml(j.remarks || '')}</td>
        <td>${escapeHtml(j.service || '—')}</td>
      </tr>`}).join('')

    const nilPrintRows = filteredNilRows.map(n => `
      <tr style="background:#e0f2fe;color:#075985;font-weight:600">
        <td>${escapeHtml(n.staff_name)}</td>
        <td>—</td><td>—</td>
        <td>Available (no job assigned)</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
        <td><span style="background:#0284c7;color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:bold">AVAILABLE</span></td>
        <td>—</td><td>—</td>
      </tr>`).join('')

    const expRows = todayExpenses.map(e => `
      <tr><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.category)}</td><td style="text-align:right">AED ${cleanNum(e.amount)}</td></tr>`).join('')

    const driverRows = Object.entries(driverSummary).map(([name, amt]) =>
      `<tr><td>${escapeHtml(name)}</td><td style="text-align:right">AED ${amt}</td></tr>`).join('')

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
          <td style="text-align:right">AED ${todayJobs.reduce((s,j)=>s+jobPending(j),0).toLocaleString()}</td>
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
      <script>window.onload=()=>{window.print()}</script>
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

  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null)

  /** UX-26: close the selected day after showing its cash summary */
  async function closeDay() {
    const cashIn = todayJobs.filter(j => String(j.payment_mode).toLowerCase() === 'cash').reduce((s, j) => s + jobCollected(j), 0)
    const summary = `${todayJobs.length} jobs · collected AED ${grossCollected.toLocaleString()} (cash AED ${cashIn.toLocaleString()}) · expenses AED ${totalExpenses.toLocaleString()} · net AED ${netTotal.toLocaleString()}`
    const ok = await confirmAsync({
      title: `Close ${fmtDate(selectedDate)}?`,
      message: `${summary}.${rowChecks.size ? ` ${rowChecks.size} row(s) still have checks.` : ''} Compare with the Cash Book, then close. Closed days cannot be edited until reopened.`,
      confirmLabel: 'Close day',
    })
    if (!ok) return
    setClosedDays(prev => ({ ...prev, [selectedDate]: { closedAt: new Date().toISOString(), summary } }))
    notify.success(`${fmtDate(selectedDate)} closed`)
  }
  async function reopenDay() {
    const ok = await confirmAsync({ title: 'Reopen day?', message: `Reopen ${fmtDate(selectedDate)} so its entries can be changed again?`, confirmLabel: 'Reopen', tone: 'danger' })
    if (!ok) return
    setClosedDays(prev => { const next = { ...prev }; delete next[selectedDate]; return next })
  }

  /** UX-28: save the previewed import — replaces the day's jobs and expenses only now */
  function commitImport(plan: ImportPlan) {
    const targetDate = plan.date
    if (blockIfClosed(targetDate)) return
    setImportPlan(null)
    setDateRangePreset('today')
    setRangeStartDate('')
    setRangeEndDate('')
    setSelectedDate(targetDate)
    // Re-importing a day replaces it cleanly instead of duplicating rows
    clearDailyData(targetDate)
    plan.jobs.forEach(j => addDailyJob(j))
    plan.expenses.forEach(e => addDailyExpense(e))
    if (plan.pending.length > 0) setPendingList(prev => [...prev.filter(x => x.date !== targetDate), ...plan.pending])
    if (plan.pendingRcvd.length > 0) setPendingRcvdList(prev => [...prev.filter(x => x.date !== targetDate), ...plan.pendingRcvd])
    if (plan.advances.length > 0) setAdvanceList(prev => [...prev.filter(x => x.date !== targetDate), ...plan.advances])
    setImportNotice({
      jobs: plan.jobs.length,
      expenses: plan.expenses.length,
      pendingCount: plan.pending.length,
      pendingRcvdCount: plan.pendingRcvd.length,
      advanceCount: plan.advances.length,
      date: targetDate,
      fileName: plan.fileName,
    })
  }

  async function importJobs(file: File) {
    setImporting(true)
    setImportNotice(null)
    try {
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
      // UX-28: parse only — the preview's "Import" button clears the day and saves
      setImportPlan(parseJobSheetWorkbook(wb, file.name, selectedDate))
    } catch (err: any) {
      notify.error('Failed to import Excel: ' + (err.message || String(err)))
    } finally {
      setImporting(false)
    }
  }

  // ── Dynamic Column Cell Renderers ──
  const renderHeaderCell = (id: string) => {
    const col = colMap.get(id)
    const label = id === 'start_time' ? 'Start' : id === 'end_time' ? 'End' : id === 'area' ? 'Location' : id === 'payment_mode' ? 'Mode' : id === 'actions' ? '' : (col?.label || id)

    return (
      <th
        key={id}
        className="sticky top-0 bg-slate-100 z-30 text-left px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-[0.07em] whitespace-nowrap border-b border-[#E4E8EC]"
      >
        {label}
      </th>
    )
  }

  const renderNilCell = (id: string, row: any) => {
    if (id === 'staff') {
      return (
        <td key={id} className="px-3 py-3 font-semibold whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black bg-sky-500 text-white shadow-xs">
              {(row.staff_name || 'U').trim()[0]?.toUpperCase() || 'U'}
            </span>
            <span className="text-slate-800 font-bold">{row.staff_name}</span>
          </div>
        </td>
      )
    }
    if (id === 'address') {
      return (
        <td key={id} className="px-3 py-3 text-sky-700 italic font-medium max-w-[180px] truncate">
          Available (No jobs assigned)
        </td>
      )
    }
    if (id === 'payment_mode') {
      return (
        <td key={id} className="px-3 py-3 whitespace-nowrap">
          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300 shadow-xs uppercase tracking-wider">
            Available
          </span>
        </td>
      )
    }
    if (id === 'remarks') {
      return <td key={id} className="px-3 py-3 text-slate-400 max-w-[140px] truncate">Standby</td>
    }
    if (id === 'actions') {
      // UX-30: one click to give an available cleaner a job
      return (
        <td key={id} className="px-3 py-3 whitespace-nowrap">
          {!isDateRange && !isDayClosed(selectedDate) && (
            <button type="button" onClick={() => openAddJob(row.staff_name)}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-sky-600 text-white hover:bg-sky-700 cursor-pointer">
              + Assign job
            </button>
          )}
        </td>
      )
    }
    if (id === 'ot_hours') {
      return <td key={id} className="px-3 py-3 text-slate-300 font-medium whitespace-nowrap">—</td>
    }
    return <td key={id} className="px-3 py-3 text-slate-400 font-medium whitespace-nowrap">—</td>
  }

  const renderJobCell = (
    id: string,
    job: DailyJob,
    isMonthly: boolean,
    palette: StaffPalette,
    isFirstShiftOfStaff: boolean,
    otDisplay: number
  ) => {
    switch (id) {
      case 'staff':
        return (
          <td
            key={id}
            className={`px-3 py-3 font-semibold whitespace-nowrap group/cell relative ${
              inlineEdit?.jobId === job.id && inlineEdit.field === 'staff_name'
                ? 'bg-white ring-2 ring-emerald-500 rounded'
                : 'hover:bg-black/5 cursor-pointer'
            }`}
            onDoubleClick={() => startInlineEdit(job.id, 'staff_name', job.staff_name)}
            title="Double-click to edit Staff Name"
          >
            {inlineEdit?.jobId === job.id && inlineEdit.field === 'staff_name' ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <input
                  ref={inlineInputRef}
                  type="text"
                  value={inlineEdit.tempValue}
                  onChange={e => setInlineEdit({ ...inlineEdit, tempValue: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveInlineEdit(job)
                    if (e.key === 'Escape') cancelInlineEdit()
                  }}
                  className="px-2 py-1 text-xs font-semibold bg-white border border-emerald-500 rounded shadow-inner text-slate-800 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => saveInlineEdit(job)}
                  className="p-1 text-white bg-emerald-600 rounded hover:bg-emerald-700 shadow-xs cursor-pointer"
                  title="Save (Enter)"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={cancelInlineEdit}
                  className="p-1 text-slate-600 bg-slate-200 rounded hover:bg-slate-300 cursor-pointer"
                  title="Cancel (Esc)"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              isFirstShiftOfStaff ? (
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm ${
                    isMonthly ? 'bg-emerald-600 text-white' : palette.avatarBg
                  }`}>
                    {(job.staff_name || 'U').trim()[0]?.toUpperCase() || 'U'}
                  </span>
                  <div>
                    <div className={`font-bold flex items-center gap-1.5 ${isMonthly ? 'text-emerald-950 font-extrabold' : palette.nameColor}`}>
                      {job.staff_name}
                      <Pencil size={11} className="opacity-0 group-hover/cell:opacity-60 text-emerald-700 transition-opacity" />
                    </div>
                    {(job as any)._isSplitShift && (
                      <div className="mt-0.5">
                        <span className="text-[9px] font-bold text-teal-800 bg-teal-100/70 border border-teal-200/90 px-1.5 py-0.2 rounded-full inline-block" title={`Shared job with ${(job as any)._allCleaners?.join(', ')}`}>
                          Team of {(job as any)._allCleaners?.length}
                        </span>
                      </div>
                    )}
                    {isDateRange && (
                      <div className="text-[10px] text-slate-500 font-normal">{fmtDate(job.date)}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-3">
                  <span className={`font-bold text-[11px] ${isMonthly ? 'text-emerald-600' : 'text-slate-400'}`}>↳</span>
                  <div>
                    <span className={`text-[12px] font-semibold flex items-center gap-1.5 ${isMonthly ? 'text-emerald-950 font-bold' : palette.nameColor}`}>
                      {job.staff_name}
                      <Pencil size={11} className="opacity-0 group-hover/cell:opacity-60 text-emerald-700 transition-opacity" />
                    </span>
                    {isDateRange && (
                      <span className="text-[10px] text-slate-500 font-normal ml-1.5">({fmtDate(job.date)})</span>
                    )}
                  </div>
                </div>
              )
            )}
            {/* UX-27: inline row checks (warnings only) */}
            {rowChecks.has(job.id) && (
              <span
                className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200"
                title={rowChecks.get(job.id)!.join('\n')}
              >
                <AlertTriangle size={10} /> {rowChecks.get(job.id)!.length} check{rowChecks.get(job.id)!.length === 1 ? '' : 's'}
              </span>
            )}
          </td>
        )

      case 'start_time':
        return (
          <td
            key={id}
            className={`px-3 py-3 font-medium whitespace-nowrap group/cell relative ${
              inlineEdit?.jobId === job.id && inlineEdit.field === 'start_time'
                ? 'bg-white ring-2 ring-emerald-500 rounded'
                : 'hover:bg-black/5 cursor-pointer'
            } ${isMonthly ? 'text-emerald-950 font-semibold' : 'text-slate-600'}`}
            onDoubleClick={() => startInlineEdit(job.id, 'start_time', job.start_time)}
            title="Double-click to edit Start Time"
          >
            {inlineEdit?.jobId === job.id && inlineEdit.field === 'start_time' ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  ref={inlineInputRef}
                  type="text"
                  placeholder="08:00 AM"
                  value={inlineEdit.tempValue}
                  onChange={e => setInlineEdit({ ...inlineEdit, tempValue: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveInlineEdit(job)
                    if (e.key === 'Escape') cancelInlineEdit()
                  }}
                  className="px-2 py-1 text-xs font-mono bg-white border border-emerald-500 rounded shadow-inner text-slate-800 w-24 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => saveInlineEdit(job)}
                  className="p-1 text-white bg-emerald-600 rounded hover:bg-emerald-700 shadow-xs cursor-pointer"
                  title="Save (Enter)"
                >
                  <Check size={11} />
                </button>
                <button
                  type="button"
                  onClick={cancelInlineEdit}
                  className="p-1 text-slate-600 bg-slate-200 rounded hover:bg-slate-300 cursor-pointer"
                  title="Cancel (Esc)"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <span className="flex items-center gap-1.5">
                {formatTimeOnly(job.start_time)}
                <Pencil size={10} className="opacity-0 group-hover/cell:opacity-50 text-emerald-700 transition-opacity" />
              </span>
            )}
          </td>
        )

      case 'end_time':
        return (
          <td
            key={id}
            className={`px-3 py-3 font-medium whitespace-nowrap group/cell relative ${
              inlineEdit?.jobId === job.id && inlineEdit.field === 'end_time'
                ? 'bg-white ring-2 ring-emerald-500 rounded'
                : 'hover:bg-black/5 cursor-pointer'
            } ${isMonthly ? 'text-emerald-950 font-semibold' : 'text-slate-600'}`}
            onDoubleClick={() => startInlineEdit(job.id, 'end_time', job.end_time)}
            title="Double-click to edit End Time"
          >
            {inlineEdit?.jobId === job.id && inlineEdit.field === 'end_time' ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  ref={inlineInputRef}
                  type="text"
                  placeholder="05:00 PM"
                  value={inlineEdit.tempValue}
                  onChange={e => setInlineEdit({ ...inlineEdit, tempValue: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveInlineEdit(job)
                    if (e.key === 'Escape') cancelInlineEdit()
                  }}
                  className="px-2 py-1 text-xs font-mono bg-white border border-emerald-500 rounded shadow-inner text-slate-800 w-24 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => saveInlineEdit(job)}
                  className="p-1 text-white bg-emerald-600 rounded hover:bg-emerald-700 shadow-xs cursor-pointer"
                  title="Save (Enter)"
                >
                  <Check size={11} />
                </button>
                <button
                  type="button"
                  onClick={cancelInlineEdit}
                  className="p-1 text-slate-600 bg-slate-200 rounded hover:bg-slate-300 cursor-pointer"
                  title="Cancel (Esc)"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <span className="flex items-center gap-1.5">
                {formatTimeOnly(job.end_time)}
                <Pencil size={10} className="opacity-0 group-hover/cell:opacity-50 text-emerald-700 transition-opacity" />
              </span>
            )}
          </td>
        )

      case 'address':
        return (
          <td
            key={id}
            className={`px-3 py-3 group/cell relative ${
              inlineEdit?.jobId === job.id && inlineEdit.field === 'address'
                ? 'bg-white ring-2 ring-emerald-500 rounded'
                : 'hover:bg-black/5 cursor-pointer'
            }`}
            onDoubleClick={() => startInlineEdit(job.id, 'address', job.address || '')}
            title="Double-click to edit Address"
          >
            {inlineEdit?.jobId === job.id && inlineEdit.field === 'address' ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  ref={inlineInputRef}
                  type="text"
                  placeholder="Client Name or Full Address"
                  value={inlineEdit.tempValue}
                  onChange={e => setInlineEdit({ ...inlineEdit, tempValue: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveInlineEdit(job)
                    if (e.key === 'Escape') cancelInlineEdit()
                  }}
                  className="px-2 py-1 text-xs bg-white border border-emerald-500 rounded shadow-inner text-slate-800 w-64 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => saveInlineEdit(job)}
                  className="p-1 text-white bg-emerald-600 rounded hover:bg-emerald-700 shadow-xs cursor-pointer"
                  title="Save (Enter)"
                >
                  <Check size={11} />
                </button>
                <button
                  type="button"
                  onClick={cancelInlineEdit}
                  className="p-1 text-slate-600 bg-slate-200 rounded hover:bg-slate-300 cursor-pointer"
                  title="Cancel (Esc)"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-1">
                <AddressCell address={job.address} area={job.area} isDark={false} />
                <Pencil size={10} className="opacity-0 group-hover/cell:opacity-50 text-emerald-700 transition-opacity mt-1 shrink-0" />
              </div>
            )}
          </td>
        )

      case 'area':
        return (
          <td
            key={id}
            className={`px-3 py-3 whitespace-nowrap font-medium group/cell relative ${
              inlineEdit?.jobId === job.id && inlineEdit.field === 'area'
                ? 'bg-white ring-2 ring-emerald-500 rounded'
                : 'hover:bg-black/5 cursor-pointer'
            } ${isMonthly ? 'text-emerald-900 font-semibold' : 'text-slate-600'}`}
            onDoubleClick={() => startInlineEdit(job.id, 'area', job.area || '')}
            title="Double-click to edit Location / Area"
          >
            {inlineEdit?.jobId === job.id && inlineEdit.field === 'area' ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  ref={inlineInputRef}
                  type="text"
                  placeholder="Area"
                  value={inlineEdit.tempValue}
                  onChange={e => setInlineEdit({ ...inlineEdit, tempValue: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveInlineEdit(job)
                    if (e.key === 'Escape') cancelInlineEdit()
                  }}
                  className="px-2 py-1 text-xs bg-white border border-emerald-500 rounded shadow-inner text-slate-800 w-28 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => saveInlineEdit(job)}
                  className="p-1 text-white bg-emerald-600 rounded hover:bg-emerald-700 shadow-xs cursor-pointer"
                  title="Save (Enter)"
                >
                  <Check size={11} />
                </button>
                <button
                  type="button"
                  onClick={cancelInlineEdit}
                  className="p-1 text-slate-600 bg-slate-200 rounded hover:bg-slate-300 cursor-pointer"
                  title="Cancel (Esc)"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <span className="flex items-center gap-1.5">
                {job.area || '—'}
                <Pencil size={10} className="opacity-0 group-hover/cell:opacity-50 text-emerald-700 transition-opacity" />
              </span>
            )}
          </td>
        )

      case 'charges':
        if ((job as any)._isSecondaryCleaner) {
          return (
            <td key={id} className="px-3 py-3 font-semibold whitespace-nowrap text-slate-400 text-[11.5px]" title={`Charges recorded under primary cleaner ${(job as any)._primaryCleanerName || ''}`}>
              <span className="italic">Included ({(job as any)._teamReference || 'Team A'})</span>
            </td>
          )
        }
        return (
          <td
            key={id}
            className={`px-3 py-3 font-semibold whitespace-nowrap group/cell relative ${
              inlineEdit?.jobId === job.id && inlineEdit.field === 'charges'
                ? 'bg-white ring-2 ring-emerald-500 rounded'
                : 'hover:bg-black/5 cursor-pointer'
            }`}
            onDoubleClick={() => startInlineEdit(job.id, 'charges', String(job.charges || '0'))}
            title="Double-click to edit Charges"
          >
            {inlineEdit?.jobId === job.id && inlineEdit.field === 'charges' ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <span className="text-[10px] font-bold text-slate-500">AED</span>
                <input
                  ref={inlineInputRef}
                  type="number"
                  placeholder="0"
                  value={inlineEdit.tempValue}
                  onChange={e => setInlineEdit({ ...inlineEdit, tempValue: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveInlineEdit(job)
                    if (e.key === 'Escape') cancelInlineEdit()
                  }}
                  className="px-2 py-1 text-xs font-bold bg-white border border-emerald-500 rounded shadow-inner text-slate-800 w-20 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => saveInlineEdit(job)}
                  className="p-1 text-white bg-emerald-600 rounded hover:bg-emerald-700 shadow-xs cursor-pointer"
                  title="Save (Enter)"
                >
                  <Check size={11} />
                </button>
                <button
                  type="button"
                  onClick={cancelInlineEdit}
                  className="p-1 text-slate-600 bg-slate-200 rounded hover:bg-slate-300 cursor-pointer"
                  title="Cancel (Esc)"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {isMonthly ? (
                  cleanNum(job.charges) > 0 ? (
                    <span className="text-emerald-950 font-bold">AED {cleanNum(job.charges).toLocaleString()}</span>
                  ) : (
                    <span className="text-emerald-700 font-bold">—</span>
                  )
                ) : (
                  <span className="text-[#111827]">AED {cleanNum(job.charges).toLocaleString()}</span>
                )}
                {(job as any)._isPrimaryCleaner && (job as any)._allCleaners && (
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                    {(job as any)._allCleaners.length} staff
                  </span>
                )}
                <Pencil size={10} className="opacity-0 group-hover/cell:opacity-50 text-emerald-700 transition-opacity" />
              </div>
            )}
          </td>
        )

      case 'received':
        if ((job as any)._isSecondaryCleaner) {
          return (
            <td key={id} className="px-3 py-3 font-semibold whitespace-nowrap">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/90 font-bold text-[11px] shadow-2xs"
                title={`Payment received recorded under primary cleaner: ${(job as any)._primaryCleanerName || 'Lead cleaner'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span>{(job as any)._teamReference || 'Team A'}</span>
              </span>
            </td>
          )
        }
        return (
          <td
            key={id}
            className={`px-3 py-3 font-semibold whitespace-nowrap group/cell relative ${
              inlineEdit?.jobId === job.id && inlineEdit.field === 'received'
                ? 'bg-white ring-2 ring-emerald-500 rounded'
                : 'hover:bg-emerald-50/70 cursor-pointer'
            } ${isMonthly ? 'text-emerald-800 font-medium' : 'text-emerald-700'}`}
            onDoubleClick={() => startInlineEdit(job.id, 'received', String(job.received || '0'))}
            title="Click pencil or double-click to edit Received amount"
          >
            {inlineEdit?.jobId === job.id && inlineEdit.field === 'received' ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <span className="text-[10px] font-bold text-slate-500">AED</span>
                <input
                  ref={inlineInputRef}
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={inlineEdit.tempValue}
                  onChange={e => setInlineEdit({ ...inlineEdit, tempValue: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveInlineEdit(job)
                    if (e.key === 'Escape') cancelInlineEdit()
                  }}
                  className="px-2 py-1 text-xs font-bold bg-white border border-emerald-500 rounded shadow-inner text-slate-800 w-24 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => saveInlineEdit(job)}
                  className="p-1 text-white bg-emerald-600 rounded hover:bg-emerald-700 shadow-xs cursor-pointer"
                  title="Save (Enter)"
                >
                  <Check size={11} />
                </button>
                <button
                  type="button"
                  onClick={cancelInlineEdit}
                  className="p-1 text-slate-600 bg-slate-200 rounded hover:bg-slate-300 cursor-pointer"
                  title="Cancel (Esc)"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  startInlineEdit(job.id, 'received', String(job.received || '0'))
                }}
              >
                <span className="font-mono font-bold">
                  {cleanNum(job.received) > 0 ? `AED ${cleanNum(job.received).toLocaleString()}` : (job.payment_mode === 'Pending' || isMonthly ? '—' : 'AED 0')}
                </span>
                {(job as any)._isPrimaryCleaner && (job as any)._teamReference && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-2xs"
                    title={`Multi-cleaner team lead (${(job as any)._allCleaners?.join(', ')})`}
                  >
                    {(job as any)._teamReference} (Lead)
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    startInlineEdit(job.id, 'received', String(job.received || '0'))
                  }}
                  className="p-0.5 rounded text-slate-400 hover:text-emerald-700 hover:bg-emerald-100/60 opacity-0 group-hover/cell:opacity-100 transition-opacity cursor-pointer"
                  title="Edit Received amount"
                >
                  <Pencil size={11} />
                </button>
              </div>
            )}
          </td>
        )

      case 'pending':
        return (
          <td key={id} className="px-3 py-3 font-semibold whitespace-nowrap">
            {jobPending(job) > 0 ? (
              <span className="text-red-500 font-bold">AED {jobPending(job).toLocaleString()}</span>
            ) : (
              <span className={isMonthly ? 'text-emerald-700 font-medium' : 'text-slate-400 font-medium'}>Nil</span>
            )}
          </td>
        )

      case 'duty_hours':
        return (
          <td key={id} className={`px-3 py-3 font-semibold whitespace-nowrap ${isMonthly ? 'text-emerald-950 font-bold' : 'text-slate-800'}`}>
            {cleanNum(job.duty_hours) > 0 ? `${cleanNum(job.duty_hours)}h` : '—'}
          </td>
        )

      case 'ot_hours':
        return (
          <td key={id} className="px-3 py-3 whitespace-nowrap">
            {otDisplay > 0
              ? <span className="text-[11px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200">{otDisplay}h OT</span>
              : <span className={isMonthly ? 'text-emerald-700' : 'text-slate-300'}>0</span>}
          </td>
        )

      case 'material':
        return (
          <td key={id} className={`px-3 py-3 whitespace-nowrap font-medium ${isMonthly ? 'text-emerald-950' : 'text-slate-600'}`}>{job.material || 'No'}</td>
        )

      case 'payment_mode':
        if ((job as any)._isSecondaryCleaner) {
          return (
            <td key={id} className="px-3 py-3">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px]"
                title={`Payment managed by primary cleaner ${(job as any)._primaryCleanerName || 'Lead'}`}
              >
                <Users size={12} className="text-slate-400" />
                <span>{(job as any)._teamReference || 'Team A'}</span>
              </span>
            </td>
          )
        }
        return (
          <td key={id} className="px-3 py-3">
            {isMonthly ? (
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-700 text-white shadow-xs whitespace-nowrap uppercase tracking-wider">
                Monthly
              </span>
            ) : (
              <PaymentBadge mode={job.payment_mode} />
            )}
          </td>
        )

      case 'remarks':
        return (
          <td key={id} className={`px-3 py-3 max-w-[140px] truncate ${isMonthly ? 'text-emerald-900 font-medium' : 'text-slate-600'}`} title={job.remarks}>
            {job.remarks || '—'}
          </td>
        )

      case 'service':
        return (
          <td key={id} className="px-3 py-3 whitespace-nowrap">
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
        )

      case 'actions':
        return (
          <td key={id} className="px-3 py-3">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => { if (!blockIfClosed(job.date)) { const target = (job as any)._originalJobId ? (dailyJobs.find(j => j.id === (job as any)._originalJobId) || job) : job; setEditJob(target); } }}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isMonthly
                    ? 'hover:bg-emerald-200 text-emerald-800 hover:text-emerald-950'
                    : 'hover:bg-white/80 text-slate-400 hover:text-slate-700'
                }`}
                title="Edit"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => { if (!blockIfClosed(job.date)) { const targetId = (job as any)._originalJobId || job.id; deleteDailyJob(targetId); } }}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
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
        )

      default:
        return <td key={id} className="px-3 py-3">—</td>
    }
  }

  const availableEmps = employees.filter(e => e.status !== 'inactive')

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

            <div className="flex items-center flex-wrap mb-1.5">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white inline-flex items-center flex-wrap sm:flex-nowrap">
                <span>Daily Job Sheet</span>
                <span className="relative -top-2 sm:-top-2.5 ml-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white text-emerald-900 font-extrabold text-[10.5px] sm:text-[11px] rounded-full shadow-md border border-white/90 shrink-0 align-top">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                  </span>
                  <span>{isDateRange ? getPresetDisplayName(dateRangePreset) : 'LIVE Daily Schedule'}</span>
                </span>
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-white/80 text-[13px]">
              <span>{isDateRange ? getPresetDisplayName(dateRangePreset) : fmtDate(selectedDate)}</span>
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

                    {/* Custom Date Selection inside Today / Date Presets dropdown */}
                    <div className="px-3 pt-2 pb-1 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custom Date Selection</p>
                    </div>
                    <div className="px-3 py-1.5 space-y-1">
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={e => {
                          if (e.target.value) {
                            setSelectedDate(e.target.value)
                            setDateRangePreset('today')
                            setShowRangeMenu(false)
                          }
                        }}
                        className="w-full text-[12px] px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 font-bold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                        title="Pick Custom Date"
                      />
                    </div>

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
              onClick={() => { if (!blockIfClosed()) openAddJob() }}
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
                      onClick={() => { setShowHeaderMenu(false); setShowMonthlySyncModal(true) }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <Sparkles size={15} className="text-emerald-600" />
                        <span>Monthly Clients Sync</span>
                      </div>
                      {monthlySyncStatus.pendingSyncCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                          {monthlySyncStatus.pendingSyncCount} Pending
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {monthlySyncStatus.totalScheduled} Synced
                        </span>
                      )}
                    </button>

                    {monthlySyncStatus.pendingSyncCount > 0 && !isDateRange && (
                      <button
                        type="button"
                        onClick={() => { setShowHeaderMenu(false); handleSyncAllMonthlyShifts() }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-[11.5px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer text-left pl-9"
                      >
                        <ArrowDownToLine size={13} />
                        <span>Generate Missing Shifts ({monthlySyncStatus.pendingSyncCount})</span>
                      </button>
                    )}

                    {!isDateRange && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowHeaderMenu(false)
                          if (isDayClosed(selectedDate)) {
                            reopenDay()
                          } else {
                            closeDay()
                          }
                        }}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold transition-colors cursor-pointer text-left ${
                          isDayClosed(selectedDate)
                            ? 'text-amber-800 hover:bg-amber-50'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Lock size={15} className={isDayClosed(selectedDate) ? 'text-amber-600' : 'text-slate-500'} />
                        <span>{isDayClosed(selectedDate) ? 'Reopen Day (Unlock Edits)' : 'Close Day (Lock Edits)'}</span>
                      </button>
                    )}
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
      <JobSheetKPIs
        isDateRange={isDateRange}
        totalCharges={totalCharges}
        grossCollected={grossCollected}
        pendingCashRcvdForNet={pendingCashRcvdForNet}
        totalExpenses={totalExpenses}
        netTotal={netTotal}
        pendingTotal={pendingTotal}
        onlineTotal={onlineTotal}
        totalOTHours={totalOTHours}
        staffOnDuty={staffOnDuty}
        jobsCount={jobsCount}
        onPaymentFilter={setPaymentFilter}
        onScrollTo={scrollToElement}
        onEnableOTColumn={() => {
          if (!visibleColumns.ot_hours) {
            setVisibleColumns(p => ({ ...p, ot_hours: true }))
          }
        }}
      />

      {/* ── Hidden rows notice (AUD-44: review instead of auto-delete) ── */}
      {hiddenRowsInRange.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50 text-[12.5px] text-amber-900">
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            {hiddenRowsInRange.length} row{hiddenRowsInRange.length === 1 ? '' : 's'} on this date look like sheet totals or empty rows and {showHiddenRows ? 'are shown below' : 'are hidden'}. Nothing was deleted.
          </span>
          <button
            type="button"
            onClick={() => setShowHiddenRows(v => !v)}
            className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 font-bold text-amber-800 hover:bg-amber-100 cursor-pointer"
          >
            {showHiddenRows ? 'Hide them' : 'Show to review'}
          </button>
        </div>
      )}

      {/* ── Jobs Table ── */}
      <div id="jobs-table-section" className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden scroll-mt-6">
        <div className="gradient-card px-5 py-3.5 border-b border-emerald-800/40 text-white flex items-center justify-between flex-wrap gap-3 relative z-30 shadow-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-[16px] font-black tracking-tight text-white flex items-center gap-2">
              <Briefcase size={16} className="text-emerald-300" />
              <span>Jobs</span>
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {paymentFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 text-white font-bold text-[11px] border border-white/20">
                  Mode: {paymentFilter}
                  <button
                    onClick={() => setPaymentFilter('ALL')}
                    className="hover:text-red-300 transition-colors cursor-pointer text-[10px] font-black ml-0.5"
                    title="Clear mode filter"
                  >
                    ✕
                  </button>
                </span>
              )}
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 text-white font-bold text-[11px] border border-white/20">
                  Search: "{searchQuery}"
                  <button
                    onClick={() => setSearchQuery('')}
                    className="hover:text-red-300 transition-colors cursor-pointer text-[10px] font-black ml-0.5"
                    title="Clear search"
                  >
                    ✕
                  </button>
                </span>
              )}
              {selectedLetter !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white font-bold text-[11px] border border-white/20">
                  Letter: "{selectedLetter}"
                  <button
                    onClick={() => setSelectedLetter('ALL')}
                    className="hover:text-red-300 transition-colors cursor-pointer text-[11px] font-black ml-0.5"
                    title="Reset letter filter"
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Expandable Inline Search Bar */}
            <div
              ref={searchContainerRef}
              className={`relative flex items-center transition-all duration-300 ease-in-out h-8.5 rounded-xl border overflow-hidden ${
                isSearchExpanded || searchQuery
                  ? 'w-52 sm:w-64 md:w-72 bg-white border-white ring-2 ring-white/40 shadow-md text-slate-900'
                  : 'w-9 bg-white/15 border-white/20 hover:bg-white/25 hover:border-white/40 cursor-pointer text-white'
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
                className={`h-full px-2.5 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                  isSearchExpanded || searchQuery ? 'text-slate-500 hover:text-emerald-700' : 'text-white/80 hover:text-white'
                }`}
                aria-label="Search"
              >
                <Search
                  size={14}
                  className={isSearchExpanded || searchQuery ? 'text-emerald-700' : 'text-white'}
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
                className={`w-full h-full text-[12px] bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none transition-opacity duration-200 ${
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

            {/* Payment Category Filters (Project, Monthly, Cash, Online, Pending, Checks) + Three-Dot Color Customizer */}
            <div className="flex items-center bg-black/25 p-0.5 rounded-xl border border-white/20 text-[11.5px] font-bold backdrop-blur-sm">
              {(['ALL', 'Project', 'Monthly', 'Cash', 'Online', 'Pending', 'Checks'] as const).map(mode => {
                const isSelected = paymentFilter === mode
                const count = mode === 'ALL'
                  ? todayJobs.length
                  : mode === 'Project'
                    ? projectTeamsData.length
                    : mode === 'Monthly'
                      ? todayJobs.filter(j => j.payment_mode === 'Monthly').length
                      : mode === 'Cash'
                        ? todayJobs.filter(j => j.payment_mode === 'Cash').length
                        : mode === 'Online'
                          ? todayJobs.filter(j => j.payment_mode === 'Online').length
                          : mode === 'Pending'
                            ? todayJobs.filter(j => jobPending(j) > 0).length
                            : rowChecks.size

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentFilter(mode)}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-white text-emerald-950 shadow-sm font-black'
                        : 'text-white/80 hover:text-white hover:bg-white/10 font-bold'
                    }`}
                  >
                    <span>{mode === 'ALL' ? 'All' : mode}</span>
                    <span className={`text-[10px] px-1 rounded-full ${
                      isSelected ? 'bg-emerald-100 text-emerald-950 font-black' : 'bg-white/20 text-white'
                    }`}>
                      {count}
                    </span>
                  </button>
                )
              })}

              {/* Three-Dot Menu for Category Row Color Customization */}
              <div className="relative pl-0.5 pr-1">
                <button
                  type="button"
                  onClick={() => setShowFilterColorMenu(p => !p)}
                  className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  title="Customize Row Colors by Category"
                  aria-label="Customize Row Colors by Category"
                >
                  <MoreVertical size={14} />
                </button>

                {showFilterColorMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowFilterColorMenu(false)} />
                    <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-72 bg-white border border-[#E4E8EC] rounded-2xl shadow-2xl z-50 p-3.5 animate-in fade-in zoom-in-95 text-slate-800">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E4E8EC]">
                        <div className="flex items-center gap-1.5 font-bold text-[12px] text-slate-900">
                          <Palette size={14} className="text-emerald-700" />
                          <span>Customize Row Colors</span>
                        </div>
                        <button
                          type="button"
                          onClick={resetFilterColors}
                          className="text-[10.5px] font-bold text-slate-400 hover:text-slate-700 underline cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2.5">Set row background colors for each category:</p>
                      <div className="space-y-2">
                        {(['ALL', 'Project', 'Monthly', 'Cash', 'Online', 'Pending', 'Checks'] as const).map(mode => (
                          <div key={mode} className="flex items-center justify-between text-[11.5px]">
                            <span className="font-semibold text-slate-700">{mode === 'ALL' ? 'All Rows' : mode}</span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={filterColors[mode] || DEFAULT_CATEGORY_ROW_COLORS[mode]}
                                onChange={e => updateFilterColor(mode, e.target.value)}
                                className="w-6 h-6 rounded-md border border-slate-200 cursor-pointer p-0 bg-transparent"
                              />
                              <span className="text-[10px] font-mono text-slate-400 uppercase w-14 text-right">
                                {filterColors[mode] || DEFAULT_CATEGORY_ROW_COLORS[mode]}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* When Project filter is selected: Toggle between Team-Wise Column Board and Standard Table */}
            {paymentFilter === 'Project' && (
              <div className="flex items-center bg-white/20 p-0.5 rounded-xl border border-white/30 text-[11px] font-bold text-white animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  onClick={() => setProjectBoardView('board')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    projectBoardView === 'board'
                      ? 'bg-white text-emerald-950 shadow-xs font-black'
                      : 'text-white/80 hover:bg-white/10 font-semibold'
                  }`}
                  title="Team-Wise Columnar Board View"
                >
                  <Layers size={13} />
                  <span>Team Columns ({projectTeamsData.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProjectBoardView('table')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    projectBoardView === 'table'
                      ? 'bg-white text-emerald-950 shadow-xs font-black'
                      : 'text-white/80 hover:bg-white/10 font-semibold'
                  }`}
                  title="Standard Table View"
                >
                  <Table size={13} />
                  <span>Table View</span>
                </button>
              </div>
            )}

            {/* Customize Columns Dropdown */}
            {/* Customize Columns Button with Eye Icon (Green circle icon removed per user instruction) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColMenu(p => !p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer relative shadow-xs group ${
                  showColMenu
                    ? 'border-white bg-white text-emerald-950 ring-2 ring-white/50'
                    : 'border-white/20 bg-white/15 text-white hover:bg-white/25 hover:border-white/30'
                }`}
                title="Customize Columns (Drag & Drop Sequence, Hide/Show Checkboxes)"
                aria-label="Customize Columns"
              >
                <Eye size={14} className={showColMenu ? 'text-emerald-900' : 'text-white/80 group-hover:text-white'} />
                <span className="hidden sm:inline text-[12px] font-bold">Columns</span>
                {(activeColumns.length < ALL_COLUMNS.length || isOrderCustomized) && (
                  <span className="w-2 h-2 rounded-full bg-emerald-300 ring-2 ring-emerald-900 animate-pulse" title="Custom columns active" />
                )}
              </button>

              {showColMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowColMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-[#E4E8EC] rounded-2xl shadow-2xl z-50 p-4 animate-in fade-in zoom-in-95">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 mb-2.5 border-b border-[#E4E8EC]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 font-serif italic font-black text-xs">
                          i
                        </div>
                        <div>
                          <h4 className="text-[13px] font-bold text-slate-900 leading-tight">Customize Columns</h4>
                          <p className="text-[10.5px] text-slate-500 leading-tight">Drag to reorder sequence · Check to show/hide</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowColMenu(false)}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                        title="Close"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    {/* Quick Filter & Reset Controls */}
                    <div className="flex items-center justify-between gap-1.5 py-1.5 px-2 bg-slate-50 rounded-xl mb-3 text-[11px] border border-slate-200/70">
                      <div className="flex items-center gap-1.5 font-bold text-slate-600">
                        <span className="px-1.5 py-0.5 rounded bg-white text-emerald-700 border border-slate-200 text-[10.5px]">
                          {activeColumns.length} / {ALL_COLUMNS.length}
                        </span>
                        <span>Visible</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAllColumnsVisibility(true)}
                          className="font-semibold text-emerald-700 hover:underline hover:text-emerald-800 cursor-pointer"
                        >
                          Show All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setAllColumnsVisibility(false)}
                          className="font-semibold text-slate-500 hover:underline hover:text-slate-700 cursor-pointer"
                        >
                          Hide All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={resetColumns}
                          className="font-semibold text-emerald-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                          title="Reset sequence and visibility to defaults"
                        >
                          <RotateCcw size={11} /> Reset
                        </button>
                      </div>
                    </div>

                    {/* Draggable Column List */}
                    <div className="max-h-[340px] overflow-y-auto space-y-1.5 pr-1 select-none">
                      {orderedAllColumns.map((col, idx) => {
                        const isVisible = !!visibleColumns[col.id]
                        const isDragging = draggedColId === col.id
                        const isDragOver = dragOverColId === col.id

                        return (
                          <div
                            key={col.id}
                            draggable
                            onDragStart={e => handleDragStart(e, col.id)}
                            onDragOver={e => handleDragOver(e, col.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={e => handleDrop(e, col.id)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl border text-[12px] transition-all cursor-move group ${
                              isDragging
                                ? 'opacity-40 border-dashed border-emerald-500 bg-emerald-50 scale-[0.98]'
                                : isDragOver
                                  ? 'border-t-2 border-t-emerald-600 bg-emerald-50/70 border-emerald-300 shadow-sm'
                                  : isVisible
                                    ? 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-2xs'
                                    : 'bg-slate-50/70 hover:bg-slate-100/70 border-slate-200/60 opacity-60'
                            }`}
                          >
                            {/* Left: Drag Handle, Sequence Number & Label */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="text-slate-400 group-hover:text-slate-700 cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-slate-200 transition-colors"
                                title="Drag up/down to reorder sequence"
                              >
                                <GripVertical size={15} />
                              </span>
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 group-hover:text-emerald-700 group-hover:bg-emerald-50">
                                #{idx + 1}
                              </span>
                              <span className={`truncate font-semibold ${isVisible ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                                {col.label}
                              </span>
                            </div>

                            {/* Right: Quick Up/Down arrows & Checkbox */}
                            <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => moveColumn(col.id, 'up')}
                                  className={`w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    idx === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                                  }`}
                                  title="Move Up"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === orderedAllColumns.length - 1}
                                  onClick={() => moveColumn(col.id, 'down')}
                                  className={`w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    idx === orderedAllColumns.length - 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                                  }`}
                                  title="Move Down"
                                >
                                  <ChevronDown size={13} />
                                </button>
                              </div>

                              <label className="flex items-center cursor-pointer p-1">
                                <input
                                  type="checkbox"
                                  checked={isVisible}
                                  onChange={() => toggleColumn(col.id)}
                                  className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                                  title={isVisible ? 'Click to hide column' : 'Click to show column'}
                                />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Footer */}
                    <div className="mt-3 pt-2.5 border-t border-[#E4E8EC] flex items-center justify-between text-[10.5px] text-slate-500">
                      <span className="flex items-center gap-1 text-slate-400">
                        <Check size={12} className="text-emerald-600" />
                        Saved automatically
                      </span>
                      <button
                        type="button"
                        onClick={resetColumns}
                        className="text-slate-600 hover:text-emerald-700 font-semibold hover:underline cursor-pointer"
                      >
                        Reset Sequence & Visibility
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Excel Sheet Button */}
            <button
              type="button"
              onClick={() => window.open(`/daily-job-sheet/spreadsheet?date=${selectedDate}`, '_blank', 'noopener,noreferrer')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-emerald-900 hover:bg-emerald-50 font-black text-[12px] shadow-sm hover:shadow transition-all cursor-pointer group shrink-0 border border-white/80 active:scale-95"
              title="Open Full Interactive Excel Sheet in a New Window (Full Width, No Sidebar)"
            >
              <FileSpreadsheet size={14} className="text-emerald-800 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">Excel Sheet</span>
              <ExternalLink size={12} className="text-emerald-700 opacity-70 group-hover:opacity-100" />
            </button>

            {/* View All / Page size selector */}
            <div className="flex items-center">
              <select
                value={pageSize}
                onChange={e => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="text-[12px] font-bold text-slate-800 bg-white border border-white/40 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer shadow-xs"
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

        {/* ── Table Container / Project Teams Columnar Board ── */}
        {paymentFilter === 'Project' && projectBoardView === 'board' ? (
          <div className="p-4 sm:p-6 bg-slate-50/70 min-h-[420px]">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-indigo-200/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold shadow-xs">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="text-[15px] font-black text-slate-900 flex items-center gap-2">
                    <span>Active Project Teams ({projectTeamsData.length})</span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-200">
                      Team-Wise Column View
                    </span>
                  </h3>
                  <p className="text-[11.5px] text-slate-500">
                    Column-wise operational breakdown of all teams and multi-cleaner project assignments for {fmtDate(selectedDate)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-white px-3 py-1.5 rounded-xl border border-indigo-100 shadow-2xs">
                <span className="text-[11.5px] font-semibold text-slate-600">
                  Total Project Shifts: <b className="text-indigo-900">{projectTeamsData.reduce((s, t) => s + t.jobs.length, 0)}</b>
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-[11.5px] font-semibold text-slate-600">
                  Total Hours: <b className="text-indigo-900">{Math.round(projectTeamsData.reduce((s, t) => s + t.totalHours, 0) * 10) / 10}h</b>
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-[11.5px] font-semibold text-slate-600">
                  Total Charges: <b className="text-emerald-700">AED {projectTeamsData.reduce((s, t) => s + t.totalCharges, 0).toLocaleString()}</b>
                </span>
              </div>
            </div>

            {projectTeamsData.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
                <Layers size={36} className="mx-auto text-slate-300 mb-3" />
                <h4 className="text-[14px] font-bold text-slate-700">No Project Teams Found</h4>
                <p className="text-[12px] text-slate-400 mt-1 max-w-md mx-auto">
                  No multi-cleaner shifts or teams assigned on {fmtDate(selectedDate)}. Any shift with 2 or more cleaners automatically forms a project team here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
                {projectTeamsData.map((team) => {
                  return (
                    <div
                      key={team.teamName}
                      className="bg-white rounded-2xl border border-indigo-200/90 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
                    >
                      {/* Team Card Header */}
                      <div className="p-3.5 bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-white border-b border-indigo-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-[12px] shadow-xs">
                            <Users size={12} />
                            {team.teamName}
                          </span>
                          <span className="text-[11px] font-extrabold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                            {team.jobs.length} Shift{team.jobs.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        {/* Cleaners list */}
                        <div className="mt-2 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Team Cleaners:</div>
                          <div className="flex flex-wrap gap-1">
                            {team.cleaners.map((c, cIdx) => (
                              <span
                                key={c}
                                className={`text-[11px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                                  cIdx === 0
                                    ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {c}
                                {cIdx === 0 && <span className="text-[9px] font-black text-indigo-600">(Lead)</span>}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Team summary metrics */}
                        <div className="grid grid-cols-3 gap-1.5 mt-3 pt-2 border-t border-indigo-100/70 text-center">
                          <div className="bg-white/90 rounded-lg p-1 border border-indigo-100">
                            <div className="text-[9.5px] font-bold text-slate-400 uppercase">Hours</div>
                            <div className="text-[11.5px] font-black text-slate-800">{Math.round(team.totalHours * 10) / 10}h</div>
                          </div>
                          <div className="bg-white/90 rounded-lg p-1 border border-indigo-100">
                            <div className="text-[9.5px] font-bold text-slate-400 uppercase">Charges</div>
                            <div className="text-[11.5px] font-black text-slate-900">AED {team.totalCharges}</div>
                          </div>
                          <div className="bg-white/90 rounded-lg p-1 border border-indigo-100">
                            <div className="text-[9.5px] font-bold text-emerald-600 uppercase">Received</div>
                            <div className="text-[11.5px] font-black text-emerald-700">AED {team.totalReceived}</div>
                          </div>
                        </div>
                      </div>

                      {/* Team Shift Cards (Column Data) */}
                      <div className="p-3 space-y-2.5 bg-slate-50/40 divide-y divide-slate-100">
                        {team.jobs.map(j => {
                          const jHours = cleanNum(j.duty_hours) || calcHours(j.start_time, j.end_time)
                          const jPending = jobPending(j)
                          return (
                            <div
                              key={j.id}
                              className="pt-2.5 first:pt-0 bg-white p-3 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors shadow-2xs group"
                            >
                              <div className="flex items-center justify-between text-[11px] mb-1.5">
                                <span className="font-bold text-indigo-900 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                  <Clock size={11} className="text-indigo-600" />
                                  {formatTime12h(j.start_time)} – {formatTime12h(j.end_time)}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500">
                                  {jHours} hrs
                                </span>
                              </div>

                              <div className="text-[12.5px] font-bold text-slate-900 flex items-center gap-1.5 truncate">
                                <Building2 size={13} className="text-slate-400 shrink-0" />
                                <span className="truncate">{j.address || 'No Address'}</span>
                              </div>
                              {j.area && (
                                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate pl-4">
                                  <MapPin size={11} className="text-slate-400 shrink-0" />
                                  <span className="truncate">{j.area}</span>
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-slate-800">AED {cleanNum(j.charges)}</span>
                                  <span className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border ${
                                    j.payment_mode === 'Cash'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : j.payment_mode === 'Online'
                                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  }`}>
                                    {j.payment_mode}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  {jPending > 0 && (
                                    <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                      Due {jPending}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setEditJob(j)}
                                    className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                                    title="Edit Shift"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                </div>
                              </div>

                              {j.material && String(j.material).toLowerCase() !== 'no' && (
                                <div className="mt-1.5 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded truncate">
                                  Material: {j.material}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
        <div className="flex">
          {/* Vertical A-Z Rail */}
          <div className="w-[34px] sm:w-[38px] flex-shrink-0 bg-[#f8fafc] border-r border-[#E4E8EC] py-2 flex flex-col items-center gap-0.5 select-none text-[10px]">
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
          <div
            className="flex-1 overflow-x-auto min-w-0 relative table-scroll-container"
            onWheel={e => {
              if (e.shiftKey) {
                const el = e.currentTarget
                if (el) el.scrollLeft += e.deltaY
              }
              // Normal vertical wheel scroll bubbles naturally without e.preventDefault()
              // so the entire page scrolls smoothly when cursor is over the table
            }}
          >
            <table
              className="w-full text-[12px] border-collapse relative"
              style={{ minWidth: Math.max(500, activeColumns.length * 80) }}
            >
              <thead className="sticky top-0 z-30 shadow-[0_2px_4px_rgba(0,0,0,0.06)] bg-slate-100">
                <tr className="bg-slate-100 border-b border-[#E4E8EC]">
                  {activeColumns.map(col => renderHeaderCell(col.id))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E8EC]/70">
                {displayedRows.map((row, idx) => {
                  if (row.isNil) {
                    return (
                      <tr key={row.id} className="bg-sky-50/70 hover:bg-sky-100/70 transition-colors border-l-[5px] border-l-sky-500 border-t border-t-sky-200">
                        {activeColumns.map(col => renderNilCell(col.id, row))}
                      </tr>
                    )
                  }

                  const job = row as DailyJob
                  const isMonthly = job.payment_mode === 'Monthly'
                  const otHrs = calcOTHours(job.start_time, job.end_time)
                  const otDisplay = cleanNum(job.ot_hours) || otHrs

                  // Cleaner unique color palette & custom row color preset
                  const staffKey = (job.staff_name || '').trim().toLowerCase()
                  const palette = staffColorMap.get(staffKey) || STAFF_COLOR_PALETTES[0]
                  const customColorPreset = job.row_color ? ROW_COLOR_PRESETS.find(p => p.id === job.row_color) : null

                  // Detect first shift of this staff in the visible list for clear separation
                  const prevRow = idx > 0 ? displayedRows[idx - 1] : null
                  const isFirstShiftOfStaff = !prevRow || (prevRow.staff_name || '').trim().toLowerCase() !== staffKey

                  // Dynamic row background calculation from Category Row Colors (Requirement 1)
                  const isCheckedRow = rowChecks.has(job.id)
                  const isPendingRow = jobPending(job) > 0 || job.payment_mode === 'Pending'
                  const isCashRow = job.payment_mode === 'Cash'
                  const isOnlineRow = job.payment_mode === 'Online'
                  const isProjectRow = (job as any)._isSplitShift || (job as any)._isSecondaryCleaner || (job as any)._isPrimaryCleaner || splitStaffNames(job.staff_name).length > 1 || Boolean(job.team_name)

                  let dynamicRowBg = '#ffffff'
                  if (customColorPreset && customColorPreset.circleColor) {
                    dynamicRowBg = customColorPreset.circleColor
                  } else if (isProjectRow && filterColors.Project && filterColors.Project !== DEFAULT_CATEGORY_ROW_COLORS.Project) {
                    dynamicRowBg = filterColors.Project
                  } else if (isCheckedRow && filterColors.Checks && filterColors.Checks !== DEFAULT_CATEGORY_ROW_COLORS.Checks) {
                    dynamicRowBg = filterColors.Checks
                  } else if (isPendingRow && filterColors.Pending && filterColors.Pending !== DEFAULT_CATEGORY_ROW_COLORS.Pending) {
                    dynamicRowBg = filterColors.Pending
                  } else if (isMonthly && filterColors.Monthly) {
                    dynamicRowBg = filterColors.Monthly
                  } else if (isCashRow && filterColors.Cash && filterColors.Cash !== DEFAULT_CATEGORY_ROW_COLORS.Cash) {
                    dynamicRowBg = filterColors.Cash
                  } else if (isOnlineRow && filterColors.Online && filterColors.Online !== DEFAULT_CATEGORY_ROW_COLORS.Online) {
                    dynamicRowBg = filterColors.Online
                  } else if (isProjectRow && filterColors.Project) {
                    dynamicRowBg = filterColors.Project
                  } else if (isCheckedRow && filterColors.Checks) {
                    dynamicRowBg = filterColors.Checks
                  } else if (isPendingRow && filterColors.Pending) {
                    dynamicRowBg = filterColors.Pending
                  } else if (filterColors.ALL && filterColors.ALL !== DEFAULT_CATEGORY_ROW_COLORS.ALL) {
                    dynamicRowBg = filterColors.ALL
                  } else if (isMonthly) {
                    dynamicRowBg = filterColors.Monthly || '#d1fae5'
                  }

                  const borderClass = isFirstShiftOfStaff
                    ? 'border-t-2 border-t-slate-300 shadow-[inset_0_1px_0_rgba(0,0,0,0.03)]'
                    : 'border-t border-t-slate-200/50'

                  const borderLeftClass = customColorPreset?.borderLeft
                    ? customColorPreset.borderLeft
                    : isMonthly
                    ? 'border-l-[5px] border-l-emerald-600'
                    : palette.borderLeft

                  return (
                    <tr
                      key={job.id}
                      style={{ backgroundColor: dynamicRowBg }}
                      className={`transition-colors group hover:brightness-[0.98] ${borderClass} ${borderLeftClass}`}
                    >
                      {activeColumns.map(col => renderJobCell(col.id, job, isMonthly, palette, isFirstShiftOfStaff, otDisplay))}
                    </tr>
                  )
                })}
              </tbody>
              {filteredActiveJobRows.length > 0 && (() => {
                const totalCharges = filteredActiveJobRows.reduce((s, j) => s + cleanNum(j.charges), 0)
                const totalReceived = filteredActiveJobRows.reduce((s, j) => s + cleanNum(j.received), 0)
                const totalPending = filteredActiveJobRows.reduce((s, j) => s + jobPending(j), 0)
                const totalDuty = Math.round(filteredActiveJobRows.reduce((s, j) => s + cleanNum(j.duty_hours), 0) * 10) / 10
                const totalOT = Math.round(filteredActiveJobRows.reduce((s, j) => s + (cleanNum(j.ot_hours) || calcOTHours(j.start_time, j.end_time)), 0) * 10) / 10
                const firstLabelColId = activeColumns.find(c => !['charges', 'received', 'pending', 'duty_hours', 'ot_hours'].includes(c.id))?.id

                return (
                  <tfoot className="sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.06)] bg-slate-100 border-t-2 border-[#E4E8EC]">
                    <tr className="bg-slate-100 border-t-2 border-[#E4E8EC] font-bold text-[12px]">
                      {activeColumns.map(col => {
                        if (col.id === 'charges') {
                          return (
                            <td key={col.id} className="sticky bottom-0 bg-slate-100 px-3 py-3 text-[#111827]">
                              AED {totalCharges.toLocaleString()}
                            </td>
                          )
                        }
                        if (col.id === 'received') {
                          return (
                            <td key={col.id} className="sticky bottom-0 bg-slate-100 px-3 py-3 text-emerald-700">
                              AED {totalReceived.toLocaleString()}
                            </td>
                          )
                        }
                        if (col.id === 'pending') {
                          return (
                            <td key={col.id} className="sticky bottom-0 bg-slate-100 px-3 py-3 text-red-600">
                              AED {totalPending.toLocaleString()}
                            </td>
                          )
                        }
                        if (col.id === 'duty_hours') {
                          return (
                            <td key={col.id} className="sticky bottom-0 bg-slate-100 px-3 py-3 text-slate-700 font-semibold">
                              {totalDuty}h
                            </td>
                          )
                        }
                        if (col.id === 'ot_hours') {
                          return (
                            <td key={col.id} className="sticky bottom-0 bg-slate-100 px-3 py-3 text-orange-700 font-semibold">
                              {totalOT}h
                            </td>
                          )
                        }
                        if (col.id === firstLabelColId) {
                          return (
                            <td key={col.id} className="sticky bottom-0 bg-slate-100 px-3 py-3 text-slate-700">
                              Totals {selectedLetter !== 'ALL' ? `(Filtered: "${selectedLetter}")` : ''}
                            </td>
                          )
                        }
                        return <td key={col.id} className="sticky bottom-0 bg-slate-100 px-3 py-3" />
                      })}
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
                  <Button size="sm" onClick={() => { if (!blockIfClosed()) openAddJob() }}>
                    <Plus size={13} className="mr-1" /> Add First Job
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Pagination / View All Bar ── */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3 text-[12px]">
          <div className="flex items-center gap-3 text-slate-500 font-medium flex-wrap">
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
      <ExpensesAndDriversPanel
        todayExpenses={todayExpenses}
        displayedExpenses={displayedExpenses}
        viewAllExpenses={viewAllExpenses}
        onToggleViewAllExpenses={() => setViewAllExpenses(v => !v)}
        onAddExpense={() => { if (!blockIfClosed()) setShowAddExpense(true) }}
        onEditExpense={exp => { if (!blockIfClosed(exp.date)) setEditExpense(exp) }}
        onDeleteExpense={id => { if (!blockIfClosed()) deleteDailyExpense(id) }}
        totalExpenses={totalExpenses}
        driverSummary={driverSummary}
        sortedDrivers={sortedDrivers}
        displayedDrivers={displayedDrivers}
        viewAllDrivers={viewAllDrivers}
        onToggleViewAllDrivers={() => setViewAllDrivers(v => !v)}
        onEditDriverStaff={staff => setEditingDriverStaff(staff)}
        onOpenDriverModal={() => {
          const first = sortedDrivers[0]
          setEditingDriverStaff({
            name: first ? first[0] : (employees[0]?.full_name || 'Staff'),
            currentAmount: first ? first[1] : 0
          })
        }}
        grossCollected={grossCollected}
      />

      {/* ── Reconciliation Widgets: Today Pending, Pending Received, Advance ── */}
      <ReconciliationWidgets
        selectedDate={selectedDate}
        todayPendingEntries={todayPendingEntries}
        todayPendingTotalAmt={todayPendingTotalAmt}
        onAddPending={() => setShowAddPending(true)}
        onSelectPendingDetails={item => setSelectedPendingDetails(item)}
        onEditPendingEntry={item => {
          if (item.isJob && item.job) {
            if (!blockIfClosed(item.job.date)) setEditJob(item.job)
          } else {
            const raw = pendingList.find(p => p.id === item.id)
            if (raw) setEditingPending(raw)
            else setSelectedPendingDetails(item)
          }
        }}
        onDeletePendingEntry={item => {
          if (window.confirm(`Are you sure you want to remove pending entry for "${item.client}"?`)) {
            if (item.isJob && item.job) {
              if (!blockIfClosed(item.job.date)) deleteDailyJob(item.job.id)
            } else {
              setPendingList(prev => prev.filter(x => x.id !== item.id))
            }
          }
        }}
        todayPendingRcvdItems={todayPendingRcvdItems}
        pendingRcvdGrandTotal={pendingRcvdGrandTotal}
        pendingRcvdTotalCash={pendingRcvdTotalCash}
        pendingRcvdTotalOnline={pendingRcvdTotalOnline}
        onAddPendingRcvd={() => setShowAddPendingRcvd(true)}
        onEditPendingRcvd={item => setEditingPendingRcvd(item)}
        onDeletePendingRcvd={id => setPendingRcvdList(prev => prev.filter(x => x.id !== id))}
        todayAdvanceItems={todayAdvanceItems}
        advanceTotalAmt={advanceTotalAmt}
        advanceTotalRcvd={advanceTotalRcvd}
        onAddAdvance={() => setShowAddAdvance(true)}
        onEditAdvance={item => setEditingAdvance(item)}
        onDeleteAdvance={id => setAdvanceList(prev => prev.filter(x => x.id !== id))}
      />

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

      {/* ── Import preview (UX-28) ── */}
      <ImportPreviewModal
        plan={importPlan}
        existingJobs={d => dailyJobs.filter(j => j.date === d)}
        existingExpenses={d => dailyExpenses.filter(e => e.date === d)}
        onCancel={() => setImportPlan(null)}
        onConfirm={commitImport}
      />

      {/* ── Add Job Modal ── */}
      <Modal
        open={showAddJob}
        onClose={() => setShowAddJob(false)}
        title="Add Job Entry"
        size="2xl"
        className="max-w-6xl w-full"
        headerActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddJob(false)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-[12px] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-job-entry-form"
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[12.5px] shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus size={15} className="stroke-[3]" />
              <span>Add Job</span>
            </button>
          </div>
        }
      >
        <AddJobForm
          employees={availableEmps}
          clients={clients}
          onClose={() => setShowAddJob(false)}
          onSave={j => { addDailyJob({ ...j, date: selectedDate }); setShowAddJob(false) }}
          key={addJobStaff || 'new'}
          initial={{ date: selectedDate, ...(addJobStaff ? { staff_name: addJobStaff } : {}) }}
          existingJobsForDate={todayJobs}
        />
      </Modal>

      {/* ── Edit Job Modal (Executive Light Themed Layout) ── */}
      <EditJobModal
        open={!!editJob}
        job={editJob}
        onClose={() => setEditJob(null)}
        onSave={(id, patch) => updateDailyJob(id, patch)}
        employees={employees}
      />

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

      {/* ── Edit Driver / Staff Summary Modal with Advance & Pending Sync ── */}
      <DriverStaffModal
        staff={editingDriverStaff}
        selectedDate={selectedDate}
        todayJobs={todayJobs}
        employees={employees}
        driverSummary={driverSummary}
        todayAdvanceItems={todayAdvanceItems}
        todayPendingRcvdItems={todayPendingRcvdItems}
        todayPendingEntries={todayPendingEntries}
        onClose={() => setEditingDriverStaff(null)}
        onEditJob={job => { if (!blockIfClosed(job.date)) setEditJob(job) }}
        onSelectStaff={staff => setEditingDriverStaff(staff)}
        onAddAdvance={item => setAdvanceList(prev => [item, ...prev])}
        onAddPendingRcvd={item => setPendingRcvdList(prev => [item, ...prev])}
        onDeleteAdvance={id => setAdvanceList(prev => prev.filter(x => x.id !== id))}
        onDeletePendingRcvd={id => setPendingRcvdList(prev => prev.filter(x => x.id !== id))}
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
        onSave={(id, client, cash, online, remarks) => {
          setPendingRcvdList(prev => prev.map(x => {
            if (x.id !== id) return x
            const updated = { ...x, client, cash, online, remarks, notes: remarks }
            // Amount changed → re-split it over the client's dues (excluding this record itself)
            const linkedClient = x.client_id ? clients.find(c => c.id === x.client_id) : undefined
            if (linkedClient && (x.allocations || x.opening_applied !== undefined)) {
              const alloc = allocateClientCollection(linkedClient, cash + online, dailyJobs, prev.filter(p => p.id !== id))
              updated.opening_applied = alloc.opening_applied
              updated.allocations = alloc.allocations
            }
            return updated
          }))
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
        onSave={(id, client, received, advance, notes) => {
          setAdvanceList(prev => prev.map(x => x.id === id ? { ...x, client, received, advance, notes } : x))
        }}
      />

      {/* ── Today Pending Details Pop-up Modal ── */}
      <PendingDetailsModal
        details={selectedPendingDetails}
        onClose={() => setSelectedPendingDetails(null)}
        onEditJob={job => { if (!blockIfClosed(job.date)) setEditJob(job) }}
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

      {/* ── Monthly Schedule Synchronization Modal ── */}
      {showMonthlySyncModal && (
        <MonthlyScheduleSyncModal
          open={showMonthlySyncModal}
          onClose={() => setShowMonthlySyncModal(false)}
          dateStr={selectedDate}
          clients={clients}
          dailyJobs={dailyJobs}
          onSyncAll={handleSyncAllMonthlyShifts}
          onSyncShift={handleSyncSingleShift}
          onSyncDateRange={handleSyncDateRange}
          autoSyncEnabled={autoSyncMonthly}
          onToggleAutoSync={val => {
            setAutoSyncMonthly(val)
            safeLocalStorageSet('safaeewala_auto_sync_monthly_schedules', val)
          }}
        />
      )}

    </div>
  )
}

