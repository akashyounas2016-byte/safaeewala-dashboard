import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  ChevronLeft, ChevronRight, Calendar, Printer, Download, Plus,
  Trash2, AlertCircle, AlertTriangle, TrendingUp, Users, Briefcase, CloudUpload,
  Upload, CheckCircle, FileSpreadsheet, SlidersHorizontal,
  Clock, DollarSign, Wallet, Search, Filter, X, Pencil, MoreVertical, ChevronDown,
  Receipt, CreditCard, Eye, Settings, Check, Info, GripVertical, ChevronUp, RotateCcw,
  ExternalLink, Sparkles,
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
  ALL_COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
  type ColumnConfig,
  type StaffPalette,
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
import {
  getScheduledMonthlyShiftsForDate,
  syncMonthlySchedulesToDailyJobs,
  buildPendingCalcContext,
  loadClientAdjustments,
  calcJobPending,
  allocateClientCollection,
  type ScheduledShiftPlan,
} from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'
import { todayDubai, calendarDate } from '@/lib/dubaiTime'

/* ─── Main Page ─── */
export function DailyJobSheet() {
  const navigate = useNavigate()
  const { openMenu } = useLayout()
  const { dailyJobs, dailyExpenses, employees, clients, loading, addDailyJob, updateDailyJob, deleteDailyJob, addDailyExpense, updateDailyExpense, deleteDailyExpense, clearDailyData, clearAllDailyData } = useData()

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

  const startInlineEdit = (
    jobId: string,
    field: 'staff_name' | 'start_time' | 'end_time' | 'address' | 'area' | 'charges' | 'received' | 'date',
    initialVal: string
  ) => {
    setInlineEdit({ jobId, field, tempValue: initialVal })
  }

  const saveInlineEdit = (job: DailyJob) => {
    if (!inlineEdit || inlineEdit.jobId !== job.id) return
    const { field, tempValue } = inlineEdit
    const trimmed = tempValue.trim()
    const patch: Partial<DailyJob> = {}

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

    updateDailyJob(job.id, patch)
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
  const jobPending = (job: DailyJob) => calcJobPending(job, pendingCtx)

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

  // AUD-44: rows that look like sheet totals / empty stubs are hidden, never auto-deleted.
  // The owner can show them and delete them by hand.
  const [showHiddenRows, setShowHiddenRows] = useState(false)
  const hiddenRowsInRange = dailyJobs.filter(j => isDateInRange(j.date) && isBogusSummaryJob(j))
  const todayJobs     = dailyJobs.filter(j => isDateInRange(j.date) && (showHiddenRows || !isBogusSummaryJob(j)))
  const todayExpenses = dailyExpenses.filter(e => isDateInRange(e.date))


  // ── Monthly Repeating Schedules Calculation & Auto-Fetch ──
  const monthlySyncStatus = useMemo(() => {
    if (isDateRange) {
      return { totalScheduled: 0, alreadySyncedCount: 0, pendingSyncCount: 0, dayName: 'Monday' as const, shifts: [] }
    }
    return getScheduledMonthlyShiftsForDate(selectedDate, clients, dailyJobs)
  }, [selectedDate, clients, dailyJobs, isDateRange])

  // Automatically fetch repeating monthly schedules when viewing a single date
  useEffect(() => {
    if (!autoSyncMonthly || isDateRange || loading) return
    if (autoSyncedDatesRef.current.has(selectedDate)) return

    if (monthlySyncStatus.pendingSyncCount > 0) {
      autoSyncedDatesRef.current.add(selectedDate)
      const res = syncMonthlySchedulesToDailyJobs(selectedDate, clients, dailyJobs, addDailyJob)
      if (res.insertedCount > 0) {
        setImportNotice({
          jobs: res.insertedCount,
          expenses: 0,
          date: selectedDate,
          fileName: `⚡ Auto-Fetched ${res.insertedCount} Monthly Client Shifts (${res.dayName})`,
        })
      }
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
  const activeStaffSet = new Set(
    todayJobs.flatMap(j => (j.staff_name || '').split(/[,+/&]/).map(s => s.trim().toLowerCase())).filter(Boolean)
  )

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
      const due = calcJobPending(job, pendingCtx)
      if (!isBogusSummaryJob(job) && due > 0) {
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
  }, [todayJobs, todayPendingItems, pendingCtx])

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
        <td>${j.staff_name}</td>
        <td>${formatTimeOnly(j.start_time)}</td>
        <td>${formatTimeOnly(j.end_time)}</td>
        <td>${j.address || '—'}</td>
        <td>${j.area || '—'}</td>
        <td style="text-align:right">${j.payment_mode === 'Monthly' ? (cleanNum(j.charges) > 0 ? cleanNum(j.charges) : '—') : cleanNum(j.charges)}</td>
        <td style="text-align:right">${j.payment_mode === 'Pending' || j.payment_mode === 'Monthly' ? '—' : cleanNum(j.received)}</td>
        <td style="text-align:right">${jobPending(j) > 0 ? jobPending(j) : 'Nil'}</td>
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

      // AUD-46: Excel dates are calendar dates — read them with local fields (SheetJS builds a
      // local-midnight Date), and read text as day/month/year like the UAE sheets are written.
      const toDate = (v: any) => {
        if (!v) return targetDate
        if (v instanceof Date) return isNaN(v.getTime()) ? targetDate : calendarDate(v)
        const s = String(v).trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
        const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
        if (dmy) {
          const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])
          const d = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]))
          return isNaN(d.getTime()) ? targetDate : calendarDate(d)
        }
        const d = new Date(s)
        return isNaN(d.getTime()) ? targetDate : calendarDate(d)
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
              {row.staff_name.trim()[0]?.toUpperCase()}
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
    if (id === 'actions' || id === 'ot_hours') {
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
                    {job.staff_name.trim()[0]?.toUpperCase()}
                  </span>
                  <div>
                    <div className={`font-bold flex items-center gap-1.5 ${isMonthly ? 'text-emerald-950 font-extrabold' : palette.nameColor}`}>
                      {job.staff_name}
                      <Pencil size={11} className="opacity-0 group-hover/cell:opacity-60 text-emerald-700 transition-opacity" />
                    </div>
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
                <Pencil size={10} className="opacity-0 group-hover/cell:opacity-50 text-emerald-700 transition-opacity" />
              </div>
            )}
          </td>
        )

      case 'received':
        return (
          <td
            key={id}
            className={`px-3 py-3 font-semibold whitespace-nowrap group/cell relative ${
              inlineEdit?.jobId === job.id && inlineEdit.field === 'received'
                ? 'bg-white ring-2 ring-emerald-500 rounded'
                : 'hover:bg-black/5 cursor-pointer'
            } ${isMonthly ? 'text-emerald-800 font-medium' : 'text-emerald-700'}`}
            onDoubleClick={() => !isMonthly && startInlineEdit(job.id, 'received', String(job.received || '0'))}
            title={isMonthly ? undefined : 'Double-click to edit Received amount'}
          >
            {inlineEdit?.jobId === job.id && inlineEdit.field === 'received' ? (
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
                <span>{job.payment_mode === 'Pending' || isMonthly ? '—' : `AED ${cleanNum(job.received).toLocaleString()}`}</span>
                {!isMonthly && <Pencil size={10} className="opacity-0 group-hover/cell:opacity-50 text-emerald-700 transition-opacity" />}
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
                onClick={() => setEditJob(job)}
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
                onClick={() => deleteDailyJob(job.id)}
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

            {/* Weekly Schedule ↔ Daily Job Sheet Synchronization Button */}
            {!isDateRange && (
              <button
                type="button"
                onClick={() => setShowMonthlySyncModal(true)}
                title="Weekly Schedule ↔ Daily Job Sheet Synchronization"
                className={`h-11 px-3.5 rounded-2xl border text-[12.5px] font-bold shadow-sm backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer ${
                  monthlySyncStatus.pendingSyncCount > 0
                    ? 'bg-amber-400/25 hover:bg-amber-400/35 border-amber-300/50 text-amber-100 shadow-md ring-2 ring-amber-400/30'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                }`}
              >
                <Sparkles
                  size={15}
                  className={monthlySyncStatus.pendingSyncCount > 0 ? 'text-amber-300 animate-pulse' : 'text-emerald-300'}
                />
                <span className="hidden sm:inline">
                  {monthlySyncStatus.pendingSyncCount > 0
                    ? `Fetch Monthly (${monthlySyncStatus.pendingSyncCount})`
                    : `Monthly Synced (${monthlySyncStatus.totalScheduled})`}
                </span>
                <span className="sm:hidden">
                  {monthlySyncStatus.pendingSyncCount > 0
                    ? `Sync (${monthlySyncStatus.pendingSyncCount})`
                    : `Synced (${monthlySyncStatus.totalScheduled})`}
                </span>
              </button>
            )}

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
            {/* Customize Columns Button with 'i' Icon */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColMenu(p => !p)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer relative shadow-xs group ${
                  showColMenu
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200'
                    : 'border-[#E4E8EC] bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
                title="Customize Columns (Drag & Drop Sequence, Hide/Show Checkboxes)"
                aria-label="Customize Columns"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-100/80 group-hover:bg-emerald-200/90 text-emerald-800 flex items-center justify-center font-serif italic font-black text-[12px] shadow-2xs">
                  i
                </div>
                <span className="hidden sm:inline text-[12px] font-bold text-slate-700 group-hover:text-emerald-800">Columns</span>
                {(activeColumns.length < ALL_COLUMNS.length || isOrderCustomized) && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" title="Custom columns active" />
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

            {/* Excel Sheet Mode Button (Opens in New Window Full Width, No Sidebar) */}
            <button
              type="button"
              onClick={() => window.open(`/daily-job-sheet/spreadsheet?date=${selectedDate}`, '_blank', 'noopener,noreferrer')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[12px] shadow-xs hover:shadow transition-all cursor-pointer group shrink-0"
              title="Open Full Interactive Excel Sheet in a New Window (Full Width, No Sidebar)"
            >
              <FileSpreadsheet size={15} className="text-emerald-700 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">Excel Sheet Mode</span>
              <ExternalLink size={12} className="text-emerald-600 opacity-70 group-hover:opacity-100" />
            </button>

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
          <div className="flex items-center gap-3 text-slate-500 font-medium flex-wrap">
            <button
              type="button"
              onClick={() => window.open(`/daily-job-sheet/spreadsheet?date=${selectedDate}`, '_blank', 'noopener,noreferrer')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[12px] shadow-sm shadow-emerald-700/20 transition-all cursor-pointer mr-1"
              title="Open Full Excel-like Spreadsheet in New Window (Full Width, No Sidebar)"
            >
              <FileSpreadsheet size={14} />
              <span>Open in Excel Sheet View</span>
              <ExternalLink size={12} className="opacity-80" />
            </button>

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
        onAddExpense={() => setShowAddExpense(true)}
        onEditExpense={exp => setEditExpense(exp)}
        onDeleteExpense={id => deleteDailyExpense(id)}
        totalExpenses={totalExpenses}
        driverSummary={driverSummary}
        sortedDrivers={sortedDrivers}
        displayedDrivers={displayedDrivers}
        viewAllDrivers={viewAllDrivers}
        onToggleViewAllDrivers={() => setViewAllDrivers(v => !v)}
        onEditDriverStaff={staff => setEditingDriverStaff(staff)}
        grossCollected={grossCollected}
      />

      {/* ── Reconciliation Widgets: Today Pending, Pending Received, Advance ── */}
      <ReconciliationWidgets
        selectedDate={selectedDate}
        todayPendingEntries={todayPendingEntries}
        todayPendingTotalAmt={todayPendingTotalAmt}
        onAddPending={() => setShowAddPending(true)}
        onSelectPendingDetails={item => setSelectedPendingDetails(item)}
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

      {/* ── Add Job Modal ── */}
      <Modal open={showAddJob} onClose={() => setShowAddJob(false)} title="Add Job Entry" size="lg">
        <AddJobForm
          employees={availableEmps}
          onClose={() => setShowAddJob(false)}
          onSave={j => { addDailyJob({ ...j, date: selectedDate }); setShowAddJob(false) }}
          initial={{ date: selectedDate }}
        />
      </Modal>

      {/* ── Edit Job Modal ── */}
      <Modal open={!!editJob} onClose={() => setEditJob(null)} title="Edit Job Entry" size="lg">
        {editJob && (
          <AddJobForm
            employees={availableEmps}
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

