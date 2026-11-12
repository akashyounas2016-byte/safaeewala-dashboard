import React, { useState, useEffect, useMemo, useRef } from 'react'
import { awayCleanerNames } from '@/lib/attendance'
import { monthlyJobsNeedingCover, replaceCleanerOnRow, isFreeFor, pasteRowInto } from '@/lib/excelSheet/replacement'
import { SearchSelect } from '@/components/common/SearchSelect'
import { isSheetCleaner, shortStaffLabel, isAssignable } from '@/lib/staffRoles'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { ArrowLeft, FileSpreadsheet, Plus, Trash2, Save, Download, RotateCcw, Search, Check, X, Sparkles, Filter, Copy, Maximize2, Minimize2, Undo2, Redo2, Palette, Layers, Table, Printer, MoreVertical, ChevronDown, ExternalLink, ChevronUp, Eye, SlidersHorizontal, ArrowUp, ArrowDown, ArrowUpCircle, ArrowDownCircle, CloudUpload, Calendar, GripVertical, Info, History, Pencil, Building2, Star, Package, MapPin, Clock, CreditCard, UserPlus, Users, AlignLeft, AlignCenter, AlignRight, UserCheck, Rows, ClipboardPaste, UserCog } from 'lucide-react'
import { AddJobForm } from '@/components/dailyJobSheet/AddJobModal'
import { ExcelCellPopover, ExcelPopoverItem, ExcelPopoverCustom, ExcelPopoverEmpty, popoverMove, popoverPick } from '@/components/dailyJobSheet/ExcelCellPopover'
import { SpreadsheetEditModal } from '@/components/dailyJobSheet/SpreadsheetEditModal'
import { Modal } from '@/components/ui/Modal'
import { QuickNewClientModal } from '@/components/common/QuickNewClientModal'
import { useData } from '@/store/DataContext'
import type { DailyJob, PaymentMode } from '@/types'
import { calcHours, calcOTHours, recalculateAllRowsOT, formatTimeOnly, formatTime12h, cleanNum, fmtDate, addDaysToYMD, ROW_COLOR_PRESETS, checkTimesOverlap } from '@/components/dailyJobSheet/jobSheetUtils'
import { authorizeGoogleDrive, getAccessToken, uploadToDrive, gdriveConfigured, getDriveWebhookUrl, sendDailySheetBackupViaWebhook } from '@/lib/googleDrive'
import { GoogleDriveWebhookModal } from '@/components/dailyJobSheet/GoogleDriveWebhookModal'
import { MonthlyScheduleSyncModal } from '@/components/dailyJobSheet/MonthlyScheduleSyncModal'
import { getScheduledMonthlyShiftsForDate, syncMonthlySchedulesToDailyJobs, buildPendingCalcContext, calcJobCollectable, getAssignableClients, splitStaffNames, type ScheduledShiftPlan } from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'
import { todayDubai } from '@/lib/dubaiTime'
import { confirmAsync, notify } from '@/lib/notify'
import { findClashAmong, clashMessage, timingChanged, findAllClashes, type StaffClash } from '@/lib/shiftClash'
import { invoicedJobIds } from '@/lib/receivables'
import { fetchRecordHistory, type AuditEntry } from '@/lib/auditLog'
import { ChangeLogHistoryModal } from '@/components/dailyJobSheet/ChangeLogHistoryModal'
import { cleanAddressDisplay, normalizeJobAddress, isGenericAddress } from '@/lib/utils'
import { expandTeamJob, nextTeamRef, placeRowsInCleanerBlocks, padCleanerBlocks, buildTeamColorMap } from '@/lib/excelTeams'
import { splitTotals, isSplitJob } from '@/lib/chargeSplit'
import { type ColumnDef, DEFAULT_COLUMN_DEFS, mergeNewColumns, buildColumnsWithLetters, COLUMNS, type ExcelDatePresetKey, EXCEL_DATE_PRESETS, chargesPerHour } from '@/lib/excelSheet/columns'
import { type BlockPalette, BLOCK_PALETTES, SOLID_PALETTE_KEYS, LIGHT_PALETTE_KEYS, PALETTE_KEYS, hslToHex, makeHexPalette } from '@/lib/excelSheet/palettes'
import { QuickAttendanceModal } from '@/components/dailyJobSheet/QuickAttendanceModal'
import { newRowId, sameJobRow, isBlankNewRow, isClearedRow, teamJobsDeletedElsewhere, type MultiCleanerPaymentInfo, getMultiCleanerPaymentInfo, ensureThreeRowsPerStaff, withIdleCleaners, syncDutyWithTimes } from '@/lib/excelSheet/rows'
import { DRAFT_PREFIX, COLUMN_PRESETS, READ_ONLY_COLS, DEFAULT_ROW_BG, projectKeyOf, memberChargesLabel, memberReceivedLabel, memberModeLabel, refMoney, DROPDOWN_COLS, TIME_SUGGESTIONS, DUBAI_AREAS, RENDER_PAGE, safeGet, safeSet, rowColorConflict } from '@/lib/excelSheet/sheetConfig'
import { evaluateFormula } from '@/lib/excelSheet/formula'
import { jobFlags, splitSyncNote, type JobFlag } from '@/lib/jobFlags'
import { JobFlagIcon } from '@/components/dailyJobSheet/JobFlagIcon'
import { ExcelAttendanceCell } from '@/components/dailyJobSheet/ExcelAttendanceCell'

/** E2E-02: one overlap check for the whole app (12h / 24h, overnight shifts) — kept as an export for older imports */
export { checkTimesOverlap } from '@/components/dailyJobSheet/jobSheetUtils'

/** CODE-A01: grid columns, palettes, row logic, settings and formulas live in src/lib/excelSheet/ */
export function JobSheetSpreadsheet() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { dailyJobs, clients, employees, invoices, addDailyJob, updateDailyJob, deleteDailyJob, attendanceMarks } = useData()

  // ── Target Date Selection & Dynamic Date Presets ──
  const qDate = searchParams.get('date')
  const initialDate = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)
    ? qDate
    : todayDubai()
  const [selectedDate, setSelectedDate] = useState(initialDate)
  // Default display is Date Range function as requested
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'today' | 'yesterday' | 'range' | 'all'>('range')
  const [rangeStart, setRangeStart] = useState<string>(initialDate)
  const [rangeEnd, setRangeEnd] = useState<string>(initialDate)
  const [activeDatePreset, setActiveDatePreset] = useState<
    'today' | 'yesterday' | 'last_month' | 'last_3_months' | 'last_6_months' | 'last_year' | 'two_years' | 'custom' | 'all' | 'single'
  >('today') // 'single': one date picked in the date box (UX-136)
  const [showDatePresetDropdown, setShowDatePresetDropdown] = useState(false)
  const datePresetRef = useRef<HTMLDivElement>(null)
  const threeDotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePresetRef.current && !datePresetRef.current.contains(e.target as Node)) {
        setShowDatePresetDropdown(false)
      }
      if (threeDotRef.current && !threeDotRef.current.contains(e.target as Node)) {
        setShowThreeDotMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Weekly Schedule ↔ Daily Job Sheet Synchronization State ──
  const [showMonthlySyncModal, setShowMonthlySyncModal] = useState(false)
  const [autoSyncMonthly, setAutoSyncMonthly] = useState<boolean>(() => {
    return safeLocalStorageGet('safaeewala_auto_sync_monthly_schedules', true)
  })
  const autoSyncedDatesRef = useRef<Set<string>>(new Set())

  const effectiveTargetDate = useMemo(() => {
    if (dateFilterMode === 'today') return todayDubai()
    if (dateFilterMode === 'yesterday') return addDaysToYMD(todayDubai(), -1)
    if (rangeStart) return rangeStart
    return selectedDate
  }, [selectedDate, dateFilterMode, rangeStart])

  const monthlySyncStatus = useMemo(() => {
    if (dateFilterMode !== 'single' && dateFilterMode !== 'today' && dateFilterMode !== 'yesterday') {
      return { totalScheduled: 0, alreadySyncedCount: 0, pendingSyncCount: 0, dayName: 'Monday' as const, shifts: [] }
    }
    return getScheduledMonthlyShiftsForDate(effectiveTargetDate, clients, dailyJobs)
  }, [effectiveTargetDate, dateFilterMode, clients, dailyJobs])

  // Auto-fetch repeating schedules for the target date if enabled
  useEffect(() => {
    if (!autoSyncMonthly) return
    if (dateFilterMode !== 'single' && dateFilterMode !== 'today' && dateFilterMode !== 'yesterday') return
    if (autoSyncedDatesRef.current.has(effectiveTargetDate)) return

    if (monthlySyncStatus.pendingSyncCount > 0) {
      autoSyncedDatesRef.current.add(effectiveTargetDate)
      const res = syncMonthlySchedulesToDailyJobs(effectiveTargetDate, clients, dailyJobs, addDailyJob)
      if (res.insertedCount > 0) {
        setToastMessage(`⚡ Auto-Fetched ${res.insertedCount} Monthly Client Shifts (${res.dayName})`)
        setTimeout(() => setToastMessage(null), 3500)
      }
    }
  }, [effectiveTargetDate, autoSyncMonthly, dateFilterMode, monthlySyncStatus.pendingSyncCount, clients, dailyJobs, addDailyJob])

  const handleSyncAllMonthlyShifts = () => {
    const res = syncMonthlySchedulesToDailyJobs(effectiveTargetDate, clients, dailyJobs, addDailyJob)
    if (res.insertedCount > 0) {
      setToastMessage(`⚡ Fetched ${res.insertedCount} Monthly Client Shifts (${res.dayName})`)
      setTimeout(() => setToastMessage(null), 3500)
    }
    setShowMonthlySyncModal(false)
  }

  const handleSyncSingleShift = (shift: ScheduledShiftPlan) => {
    addDailyJob({
      date: effectiveTargetDate,
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

  // ── Drag & Drop Column Sequence (Persisted in localStorage) ──
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const defaultList = DEFAULT_COLUMN_DEFS.map(c => c.id)
    const saved = safeLocalStorageGet<string[]>('safaeewala_excel_columns_order_v6', [])
    if (!Array.isArray(saved) || saved.length === 0) return defaultList
    const valid = saved.filter(id => defaultList.includes(id as any) && id !== 'service')
    mergeNewColumns(valid, defaultList)
    return valid
  })

  // ── Column Visibility State (Persisted in localStorage) ──
  const [hiddenColIds, setHiddenColIds] = useState<string[]>(() => {
    return safeLocalStorageGet<string[]>('safaeewala_excel_hidden_columns', [])
  })

  // ── Column Customization Modal State ──
  const [showColumnsModal, setShowColumnsModal] = useState(false)
  const [modalDragId, setModalDragId] = useState<string | null>(null)
  const [modalDragOverId, setModalDragOverId] = useState<string | null>(null)

  const columns = useMemo(() => {
    return buildColumnsWithLetters(columnOrder, hiddenColIds)
  }, [columnOrder, hiddenColIds])

  // Row history (UX-40) — from audit_log
  const [rowHistory, setRowHistory] = useState<{ label: string; loading: boolean; entries: AuditEntry[] } | null>(null)
  const openRowHistory = (job: DailyJob) => {
    setContextMenu(null)
    const label = `${job.staff_name || '—'} · ${job.date}`
    setRowHistory({ label, loading: true, entries: [] })
    void fetchRecordHistory(job.id).then(entries => setRowHistory(h => (h && h.label === label ? { label, loading: false, entries } : h)))
  }

  /** UX-39: show only the columns a role needs */
  const applyColumnPreset = (name: string) => {
    const keep = COLUMN_PRESETS[name]
    const next = keep ? DEFAULT_COLUMN_DEFS.map(c => c.id as string).filter(id => !keep.includes(id)) : []
    setHiddenColIds(next)
    safeLocalStorageSet('safaeewala_excel_hidden_columns', next)
    showToast(`Columns: ${name}`)
  }

  // ── Received reference → the row where the payment was received (UX-62) ──
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null)
  const [flashRowId, setFlashRowId] = useState<string | null>(null)

  const handleJumpToLeadCleaner = (mcInfo: MultiCleanerPaymentInfo, row?: DailyJob) => {
    // The lead may have other jobs that day: find this job's row, not just the lead's first row
    const leadName = (mcInfo.primaryCleaner || '').trim().toLowerCase()
    const leadRows = gridRows.filter(r => (r.staff_name || '').trim().toLowerCase() === leadName)
    const jobId = (row as any)?._originalJobId
    const sameSite = (r: DailyJob) => r.date === row?.date && normalizeJobAddress(r.address) === normalizeJobAddress(row?.address)
    const target = (jobId && leadRows.find(r => ((r as any)._originalJobId || r.id) === jobId))
      || leadRows.find(r => sameSite(r) && checkTimesOverlap(r.start_time, r.end_time, row?.start_time || '', row?.end_time || ''))
      || leadRows.find(sameSite)
      || leadRows[0]
    if (!target) {
      showToast(`Lead cleaner ${mcInfo.primaryCleaner} has no row on this sheet`)
      return
    }
    setActiveCell({ rowIdx: gridRows.findIndex(r => r.id === target.id), colId: 'received' })
    // Hidden by a filter, the search or the row limit: show it first
    if (!filteredGridRows.some(r => r.id === target.id)) {
      setPaymentModeFilter('ALL')
      setFilterSearch('')
    }
    setRenderLimit(limit => Math.max(limit, gridRows.length))
    setJumpTargetId(target.id)
  }

  // Autocomplete sources (UX-35) — live data only
  // R-ATT-08: cleaners absent or on leave on the sheet's date are not suggested
  const staffOptions = useMemo(() => {
    const away = awayCleanerNames(attendanceMarks || {}, employees, selectedDate)
    return employees.filter(e => e.status !== 'inactive' && e.full_name && isSheetCleaner(e) && !away.has(e.full_name.trim().toLowerCase())).map(e => e.full_name.trim()).sort((a, b) => a.localeCompare(b)) // R-SHEET-02: cleaners only
  }, [employees, attendanceMarks, selectedDate])
  const addressOptions = useMemo(() => {
    const set = new Set<string>()
    getAssignableClients(clients).forEach(c => { if (c.full_name) set.add(c.full_name.trim()); if (c.building_name) set.add(c.building_name.trim()) })
    return Array.from(set).sort((a, b) => a.localeCompare(b)).slice(0, 1000)
  }, [clients])
  const areaOptions = useMemo(() => Array.from(new Set(dailyJobs.map(j => (j.area || '').trim()).filter(a => a && a !== '—'))).sort().slice(0, 300), [dailyJobs])
  const serviceOptions = useMemo(() => Array.from(new Set(dailyJobs.map(j => (j.service || '').trim()).filter(a => a && a !== '—'))).sort().slice(0, 200), [dailyJobs])

  // Dynamic client & building options formatted identical to Add Job Entry selector
  const clientBuildingList = useMemo(() => {
    const list: { key: string; building: string; name: string; area: string; isMonthly: boolean; client: any }[] = []
    const seen = new Set<string>()
    clients.forEach(c => {
      const bldg = (c.building_name || c.full_name || '').trim()
      if (bldg && !seen.has(bldg.toLowerCase())) {
        seen.add(bldg.toLowerCase())
        list.push({
          key: c.id || bldg,
          building: bldg,
          name: c.full_name || bldg,
          area: c.area || '',
          isMonthly: !!(c.service_days && c.service_days.length > 0) || (c as any).contract_type === 'Monthly' || (c as any).client_type === 'Monthly',
          client: c
        })
      }
    })
    return list
  }, [clients])

  const toggleColumnVisibility = (colId: string) => {
    setHiddenColIds(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
      safeLocalStorageSet('safaeewala_excel_hidden_columns', next)
      return next
    })
  }

  const showAllColumns = () => {
    setHiddenColIds([])
    safeLocalStorageSet('safaeewala_excel_hidden_columns', [])
    showToast('All columns are now visible')
  }

  const moveColumn = (fromIdx: number, direction: -1 | 1) => {
    const toIdx = fromIdx + direction
    if (toIdx < 0 || toIdx >= columnOrder.length) return
    setColumnOrder(prev => {
      const next = [...prev]
      const item = next[fromIdx]
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      safeLocalStorageSet('safaeewala_excel_columns_order_v5', next)
      return next
    })
  }

  const handleModalDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    setModalDragId(id)
  }

  const handleModalDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (modalDragOverId !== id) {
      setModalDragOverId(id)
    }
  }

  const handleModalDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = modalDragId || e.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === targetId) {
      setModalDragId(null)
      setModalDragOverId(null)
      return
    }
    setColumnOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(sourceId)
      const toIdx = next.indexOf(targetId)
      if (fromIdx < 0 || toIdx < 0) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, sourceId)
      safeLocalStorageSet('safaeewala_excel_columns_order_v5', next)
      return next
    })
    setModalDragId(null)
    setModalDragOverId(null)
    showToast(`Column sequence updated!`)
  }

  const [draggedColId, setDraggedColId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedColId(id)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColId !== id) {
      setDragOverColId(id)
    }
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = draggedColId || e.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === targetId) {
      setDraggedColId(null)
      setDragOverColId(null)
      return
    }
    setColumnOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(sourceId)
      const toIdx = next.indexOf(targetId)
      if (fromIdx < 0 || toIdx < 0) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, sourceId)
      safeLocalStorageSet('safaeewala_excel_columns_order_v5', next)
      return next
    })
    setDraggedColId(null)
    setDragOverColId(null)
    showToast(`Column order updated!`)
  }

  const resetColumnOrder = () => {
    const def = DEFAULT_COLUMN_DEFS.map(c => c.id)
    setColumnOrder(def)
    setHiddenColIds([])
    safeLocalStorageSet('safaeewala_excel_columns_order_v5', def)
    safeLocalStorageSet('safaeewala_excel_hidden_columns', [])
    showToast('Columns reset to Daily Job Sheet default sequence and all made visible')
  }

  // ── Google Drive & Backup State ──
  const [showDriveModal, setShowDriveModal] = useState(false)
  const [driveStatus, setDriveStatus] = useState<'idle' | 'connecting' | 'uploading' | 'done' | 'error'>('idle')
  const [driveLink, setDriveLink] = useState('')
  const [driveError, setDriveError] = useState('')
  const [isBackingUp, setIsBackingUp] = useState(false)

  // ── Grid Data & History for Undo/Redo ──
  const [gridRows, setGridRows] = useState<DailyJob[]>([])
  // Shared pending formula (adjustments, advance deductions, later collections)
  const pendingCtx = useMemo(() => buildPendingCalcContext(), [])
  // Same receivable rule as the Job Sheet, Pending and Overview (AUD-53, R-FIN-05)
  const invoicedIds = useMemo(() => invoicedJobIds(invoices), [invoices])
  const rowPending = (r: DailyJob) => calcJobCollectable(r, pendingCtx, invoicedIds)
  /** UX-72: money taken beyond the charges (or with no charges yet). Shown in Advance, never in Pending */
  const rowAdvance = (r: DailyJob) => {
    const chg = cleanNum(r.charges), rec = cleanNum(r.received)
    return rec > chg ? rec - chg : 0
  }
  const [history, setHistory]   = useState<DailyJob[][]>([])
  const [future, setFuture]     = useState<DailyJob[][]>([])

  // Active & Editing Cell State
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colId: string } | null>(null)
  // UX-80: a click on a column letter (A, B, C …) selects the whole column — e.g. to align it (UX-73)
  const [selectedColId, setSelectedColId] = useState<string | null>(null)
  // UX-132: a block of cells chosen by click-and-drag (or Shift + click / Shift + arrows), like Excel
  type CellRef = { rowIdx: number; colId: string }
  const [selRange, setSelRange] = useState<{ a: CellRef; b: CellRef } | null>(null)
  const dragSel = useRef<false | 'cells' | 'cols'>(false)
  const rowDrag = useRef<{ from: number; over: number } | null>(null)
  const pasteRowRef = useRef<(to: number, from: number) => void>(() => {})
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colId: string; tempValue: string } | null>(null)
  const [formulaBarValue, setFormulaBarValue] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState('')
  const [excelCustomMaterial, setExcelCustomMaterial] = useState('')
  const [excelCustomPaymentMode, setExcelCustomPaymentMode] = useState('')
  const [customPaymentModes, setCustomPaymentModes] = useState<string[]>(() => {
    return safeLocalStorageGet<string[]>('safaeewala_custom_payment_modes', [])
  })
  const [deletedPaymentModes, setDeletedPaymentModes] = useState<string[]>(() => {
    return safeLocalStorageGet<string[]>('safaeewala_deleted_payment_modes', [])
  })

  // Filtered Client & Building list for Address dropdown matching Add Job Entry selector
  const filteredClientBuildings = useMemo(() => {
    if (!editingCell || editingCell.colId !== 'address') return clientBuildingList
    // Opening the cell shows every client (current address highlighted); typing filters the list
    if (editingCell.tempValue === String(gridRows[editingCell.rowIdx]?.address ?? '')) return clientBuildingList
    const q = editingCell.tempValue.toLowerCase().trim()
    if (!q) return clientBuildingList
    return clientBuildingList.filter(item =>
      item.building.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.area.toLowerCase().includes(q)
    )
  }, [clientBuildingList, editingCell, gridRows])
  // What the grid was loaded from — Save All writes only the differences (AUD-49)
  const [loadedSnapshot, setLoadedSnapshot] = useState<Map<string, DailyJob>>(() => new Map())
  // R-SYNC-16: the jobs exactly as saved when the sheet loaded (a team job is one job here, several rows in the grid).
  // "Changed on another screen" compares the live job with this — not with the grid's per-cleaner rows.
  const loadedRawRef = useRef<Map<string, DailyJob>>(new Map())
  const [remoteConflict, setRemoteConflict] = useState(false)
  const [draftOffer, setDraftOffer] = useState<{ rows: DailyJob[]; savedAt: number } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false)
  const [showAddJobModal, setShowAddJobModal] = useState(false)
  const [autoSaveBlocked, setAutoSaveBlocked] = useState<string | null>(null) // R-SYNC-14
  const [editingRowState, setEditingRowState] = useState<{ row: DailyJob; index: number } | null>(null)
  const [quickClientState, setQuickClientState] = useState<{ open: boolean; rowIdx: number | null; name: string }>({ open: false, rowIdx: null, name: '' })
  const quickClientRegisteredRef = useRef(false)
  const [paymentModeFilter, setPaymentModeFilter] = useState<'ALL' | 'Monthly' | 'Cash' | 'Online' | 'Pending' | 'Project'>('ALL')

  // ── Custom Color Slider & Favorites (Hue & Brightness) ──
  const [customHue, setCustomHue] = useState(180)
  const [customLightness, setCustomLightness] = useState(82)
  const [favoriteColors, setFavoriteColors] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('safaeewala_favorite_colors')
      if (raw) return JSON.parse(raw)
    } catch {}
    return ['#ffffff', '#fef3c7', '#dcfce7', '#e0f2fe', '#ede9fe', '#ffe4e6', '#ccfbf1', '#fed7aa']
  })
  const currentCustomHex = useMemo(() => {
    return hslToHex(customHue, 80, customLightness)
  }, [customHue, customLightness])

  const handleSaveFavoriteColor = (hex: string) => {
    const normalized = hex.toLowerCase()
    if (favoriteColors.map(c => c.toLowerCase()).includes(normalized)) {
      showToast('Color is already in favorites')
      return
    }
    const updated = [hex, ...favoriteColors.slice(0, 9)]
    setFavoriteColors(updated)
    safeSet('safaeewala_favorite_colors', JSON.stringify(updated))
    showToast(`✓ Color ${hex.toUpperCase()} saved to favorites`)
  }

  const handleRemoveFavoriteColor = (hex: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = favoriteColors.filter(c => c.toLowerCase() !== hex.toLowerCase())
    setFavoriteColors(updated)
    safeSet('safaeewala_favorite_colors', JSON.stringify(updated))
  }

  // ── UI View Options (Default: flat grid first as requested) ──
  const [viewMode, setViewMode] = useState<'blocks' | 'flat'>(() => {
    return safeGet('safaeewala_excel_view_mode', 'flat')
  })
  const [soloAtBottom, setSoloAtBottom] = useState<boolean>(() => safeGet('safaeewala_excel_solo_bottom', false))
  const [showFormulaBar, setShowFormulaBar] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState<number>(100)
  const [activeMenu, setActiveMenu] = useState<'file' | 'edit' | 'view' | 'formulas' | null>(null)

  // ── Custom Cleaner Colors State (Persisted in localStorage) ──
  const [cleanerColors, setCleanerColors] = useState<Record<string, string>>(() => {
    return safeGet('safaeewala_excel_cleaner_colors', {})
  })

  // ── Active Color Palette Tab ('solid' or 'light') ──
  const [colorPaletteTab, setColorPaletteTab] = useState<'solid' | 'light'>(() => {
    return safeGet('safaeewala_excel_color_tab', 'light')
  })

  // ── Column Background Colors (Granular column color customization) ──
  const [columnColors, setColumnColors] = useState<Record<string, string>>(() => {
    return safeGet('safaeewala_excel_column_colors', {})
  })

  // ── UX-73: text alignment per column (left / center / right), chosen from the toolbar. Cloud-synced. ──
  const [columnAlign, setColumnAlign] = useState<Record<string, 'left' | 'center' | 'right'>>(() => safeGet('safaeewala_excel_column_align', {}))
  const setAlignOf = (colId: string, align: 'left' | 'center' | 'right') => {
    const next = { ...columnAlign, [colId]: align }
    setColumnAlign(next)
    safeSet('safaeewala_excel_column_align', next)
  }
  const alignClass = (col: { id: string; type?: string }) => {
    const a = columnAlign[col.id]
    const mono = col.type === 'number' || col.id === 'pending' || col.id === 'advance' || col.id === 'charges_per_hour' ? ' font-mono' : ''
    if (a) return (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left') + mono
    return mono ? 'text-right font-mono' : 'text-left'
  }

  // ── Cell Background Colors (Granular single-cell color customization) ──
  const [cellColors, setCellColors] = useState<Record<string, string>>(() => {
    return safeGet('safaeewala_excel_cell_colors', {})
  })

  // ── Change Log History Modal ──
  const [showChangeLogModal, setShowChangeLogModal] = useState(false)
  const [showQuickAttendance, setShowQuickAttendance] = useState(false) // R-ATT-11

  // ── Row Height Settings (Discrete levels: 2 steps down, default, 2 steps up) ──
  // UX-146: 24 px added, 56 px (Tall) removed
  type RowHeightLevel = 'xxs' | 'xs' | 'sm' | 'md' | 'lg'
  const ROW_HEIGHT_LEVELS: RowHeightLevel[] = ['xxs', 'xs', 'sm', 'md', 'lg']
  const ROW_HEIGHT_MAP: Record<RowHeightLevel, { label: string; heightClass: string; rowHeightPx: number; pyClass: string }> = {
    xxs: { label: 'Tight (24px)', heightClass: 'h-[24px]', rowHeightPx: 24, pyClass: 'py-0' },
    xs: { label: 'Extra Compact (26px)', heightClass: 'h-[26px]', rowHeightPx: 26, pyClass: 'py-0.5' },
    sm: { label: 'Compact (32px)', heightClass: 'h-[32px]', rowHeightPx: 32, pyClass: 'py-1' },
    md: { label: 'Default (38px)', heightClass: 'h-[38px]', rowHeightPx: 38, pyClass: 'py-1.5' },
    lg: { label: 'Relaxed (46px)', heightClass: 'h-[46px]', rowHeightPx: 46, pyClass: 'py-2' },
  }
  const [rowHeightLevel, setRowHeightLevel] = useState<RowHeightLevel>(() => {
    const saved = safeGet<string>('safaeewala_excel_row_height', 'md')
    return saved === 'xl' ? 'lg' : (ROW_HEIGHT_LEVELS as string[]).includes(saved) ? saved as RowHeightLevel : 'md' // the old 56 px → 46 px
  })
  const handleSetRowHeight = (lvl: RowHeightLevel) => {
    setRowHeightLevel(lvl)
    safeSet('safaeewala_excel_row_height', lvl)
    showToast(`✓ Row height set to ${ROW_HEIGHT_MAP[lvl].label}`)
  }

  // ── Column Widths (Interactive Drag Resizing) ──
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    return safeGet('safaeewala_excel_column_widths', {})
  })
  const [resizingCol, setResizingCol] = useState<{ id: string; startX: number; startWidth: number } | null>(null)

  const handleStartResize = (e: React.MouseEvent, colId: string, currentWidthPx: number) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingCol({
      id: colId,
      startX: e.clientX,
      startWidth: currentWidthPx,
    })
  }

  useEffect(() => {
    if (!resizingCol) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingCol.startX
      const newWidth = Math.max(55, resizingCol.startWidth + deltaX)
      setColWidths(prev => ({
        ...prev,
        [resizingCol.id]: newWidth,
      }))
    }

    const handleMouseUp = () => {
      setColWidths(prev => {
        safeSet('safaeewala_excel_column_widths', prev)
        return prev
      })
      setResizingCol(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingCol])

  const getColWidth = (col: ColumnDef): number => {
    if (colWidths[col.id]) return colWidths[col.id]
    const parsed = parseInt(col.width || '100', 10)
    return isNaN(parsed) ? 100 : parsed
  }

  // ── Right-Click Context Menu State ──
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    rowIdx: number
    job: DailyJob
    colId: string
  } | null>(null)

  // Granular color target for non-staff cells: 'cell' (only this specific cell) vs 'row' (only this row)
  const [colorTargetScope, setColorTargetScope] = useState<'cell' | 'row'>('cell')

  // Palette picker open for specific cleaner
  const [colorPickerCleaner, setColorPickerCleaner] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const formulaInputRef = useRef<HTMLInputElement>(null)
  const spreadsheetRef = useRef<HTMLDivElement>(null)

  // Jobs of the period shown in the grid
  const periodKey = `${dateFilterMode}|${selectedDate}|${rangeStart}|${rangeEnd}|${activeDatePreset}`
  const periodJobs = useMemo(() => {
    if (dateFilterMode === 'all') return [...dailyJobs]
    if (dateFilterMode === 'range') {
      if (rangeStart && rangeEnd) {
        return dailyJobs.filter(j => j.date >= rangeStart && j.date <= rangeEnd)
      } else if (rangeStart) {
        return dailyJobs.filter(j => j.date >= rangeStart)
      } else if (rangeEnd) {
        return dailyJobs.filter(j => j.date <= rangeEnd)
      }
      return [...dailyJobs]
    }
    if (dateFilterMode === 'today') { const t = todayDubai(); return dailyJobs.filter(j => j.date === t) }
    if (dateFilterMode === 'yesterday') { const y = addDaysToYMD(todayDubai(), -1); return dailyJobs.filter(j => j.date === y) }
    return dailyJobs.filter(j => j.date === selectedDate)
  }, [dailyJobs, dateFilterMode, selectedDate, rangeStart, rangeEnd, activeDatePreset])

  // R-ATT-09: on a one-day sheet every active cleaner is listed — those without a job get empty rows (not saved)
  const oneDay = dateFilterMode === 'single' || dateFilterMode === 'today' || dateFilterMode === 'yesterday' ||
    (dateFilterMode === 'range' && !!rangeStart && rangeStart === rangeEnd) // "Today" is a one-day range
  const idleCleaners = useMemo(() => {
    if (!oneDay) return [] as { name: string; status: 'Available' | 'Absent' }[]
    const away = awayCleanerNames(attendanceMarks || {}, employees, effectiveTargetDate)
    return employees
      .filter(e => e.status !== 'inactive' && isSheetCleaner(e) && e.full_name) // R-SHEET-02: no CSR / driver / technical
      .map(e => ({ name: e.full_name.trim(), status: (away.has(e.full_name.trim().toLowerCase()) ? 'Absent' : 'Available') as 'Available' | 'Absent' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [oneDay, employees, attendanceMarks, effectiveTargetDate])
  const idleKey = idleCleaners.map(c => c.name + c.status).join('|')

  // R-SCHED-09: monthly clients whose cleaner is absent / on leave today → pick a replacement for this date only
  const coverNeeds = useMemo(() => {
    if (!oneDay) return []
    const away = awayCleanerNames(attendanceMarks || {}, employees, effectiveTargetDate)
    return away.size ? monthlyJobsNeedingCover(gridRows, effectiveTargetDate, away, clients) : []
  }, [oneDay, attendanceMarks, employees, effectiveTargetDate, gridRows, clients])
  const [coverPick, setCoverPick] = useState<Record<string, string>>({})
  const handleReplaceCleaner = (from: string, rowIds: string[]) => {
    const to = (coverPick[from.toLowerCase()] || '').trim()
    if (!to) { notify.error('Pick a replacement cleaner first'); return }
    const ids = new Set(rowIds)
    const updated = gridRows.map(r => (ids.has(r.id) ? replaceCleanerOnRow(r, from, to) : r))
    pushState(recalculateAllRowsOT(updated))
    setCoverPick(p => ({ ...p, [from.toLowerCase()]: '' }))
    showToast(`✓ ${to} covers ${rowIds.length} job${rowIds.length > 1 ? 's' : ''} for ${from} today — press Save. The monthly schedule is not changed.`)
  }

  /** Rows added, edited and removed in the grid compared with what was loaded (UX-33) */
  const pendingChanges = useMemo(() => {
    const gridIds = new Set(gridRows.map(r => r.id))
    const added = gridRows.filter(r => !loadedSnapshot.has(r.id) && !isBlankNewRow(r))
    const edited = gridRows.filter(r => { const o = loadedSnapshot.get(r.id); return o && !sameJobRow(o, r) })
    const removed = Array.from(loadedSnapshot.values()).filter(o => !gridIds.has(o.id))
    return { added, edited, removed, count: added.length + edited.length + removed.length }
  }, [gridRows, loadedSnapshot])
  const hasUnsavedChanges = pendingChanges.count > 0

  const latest = useRef({ gridRows, loadedSnapshot, hasUnsavedChanges, periodKey: '' })
  useEffect(() => {
    latest.current.gridRows = gridRows
    latest.current.loadedSnapshot = loadedSnapshot
    latest.current.hasUnsavedChanges = hasUnsavedChanges
  })
  const reloadAfterSaveRef = useRef(false)

  // Load the grid when the period changes. When jobs change elsewhere (another screen, device,
  // monthly auto-sync) while the grid has unsaved edits, merge rows the user did not touch and
  // keep the user's edits — never silently reload over them (AUD-48).
  useEffect(() => {
    const clone = (rows: DailyJob[]): DailyJob[] => JSON.parse(JSON.stringify(rows))
    const { gridRows: grid, loadedSnapshot: snap, hasUnsavedChanges: dirty, periodKey: shownKey } = latest.current
    const periodChanged = shownKey !== periodKey
    if (periodChanged || !dirty || reloadAfterSaveRef.current) {
      reloadAfterSaveRef.current = false
      latest.current.periodKey = periodKey
      const rows = withIdleCleaners(ensureThreeRowsPerStaff(clone(periodJobs), effectiveTargetDate), idleCleaners, effectiveTargetDate)
      loadedRawRef.current = new Map(clone(periodJobs).map(j => [j.id, j]))
      setGridRows(rows)
      setLoadedSnapshot(new Map(rows.map(r => [r.id, r])))
      setHistory([])
      setFuture([])
      setRemoteConflict(false)
      if (periodChanged) {
        const draft = safeGet<{ rows: DailyJob[]; savedAt: number } | null>(DRAFT_PREFIX + periodKey, null)
        setDraftOffer(draft && Array.isArray(draft.rows) ? draft : null)
      }
      return
    }
    // R-SYNC-16: merge by saved job. A team job is several grid rows (expandTeamJob) — all of them are
    // compared and replaced together; empty cleaner rows (never saved) are left alone.
    const raw = loadedRawRef.current
    const remote = new Map(periodJobs.map(j => [j.id, j]))
    const nextSnap = new Map(snap)
    const nextRaw = new Map(raw)
    let nextGrid = [...grid]
    let conflict = false
    const rowsOf = (id: string) => nextGrid.filter(r => r.id === id || String((r as { _originalJobId?: string })._originalJobId || '') === id)
    const touched = (id: string) => rowsOf(id).some(r => { const w = snap.get(r.id); return !w || !sameJobRow(w, r) })
    // R-SYNC-17: every row of the job was deleted or emptied here — the deletion waits for the save (it wins)
    const goneHere = (id: string) => { const mine = rowsOf(id); return mine.length === 0 || (touched(id) && mine.every(isClearedRow)) }
    remote.forEach((job, id) => {
      const was = raw.get(id)
      if (was && sameJobRow(was, job)) return
      if (was && goneHere(id)) { nextRaw.set(id, clone([job])[0]); return } // not brought back, no conflict
      if (was && touched(id)) { conflict = true; return } // both changed — Save asks which to keep
      const mine = rowsOf(id)
      const teamRef = String((mine[0] as { _teamReference?: string } | undefined)?._teamReference || job.team_name || '')
      const fresh = expandTeamJob(clone([job])[0], teamRef)
      nextRaw.set(id, clone([job])[0])
      mine.forEach(r => nextSnap.delete(r.id))
      fresh.forEach(r => nextSnap.set(r.id, r))
      if (mine.length) {
        const at = nextGrid.indexOf(mine[0])
        nextGrid = nextGrid.filter(r => !mine.includes(r))
        nextGrid.splice(Math.max(0, at), 0, ...fresh)
      } else nextGrid.push(...fresh)
    })
    raw.forEach((_, id) => {
      if (remote.has(id)) return
      if (goneHere(id)) { // deleted here and elsewhere — nothing left to save
        nextRaw.delete(id)
        rowsOf(id).forEach(r => nextSnap.delete(r.id))
        return
      }
      if (touched(id)) { conflict = true; return }
      nextRaw.delete(id)
      rowsOf(id).forEach(r => nextSnap.delete(r.id))
      nextGrid = nextGrid.filter(r => !rowsOf(id).includes(r))
    })
    loadedRawRef.current = nextRaw
    setGridRows(nextGrid)
    setLoadedSnapshot(nextSnap)
    if (conflict) setRemoteConflict(true)
  }, [periodKey, periodJobs, idleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a local draft of unsaved edits so a refresh or leaving the page never loses them (UX-34)
  useEffect(() => {
    const key = DRAFT_PREFIX + periodKey
    try {
      if (hasUnsavedChanges) localStorage.setItem(key, JSON.stringify({ rows: gridRows, savedAt: Date.now() }))
      else if (!draftOffer) localStorage.removeItem(key)
    } catch { /* storage full — the leave warning still protects the edits */ }
  }, [gridRows, hasUnsavedChanges, periodKey, draftOffer])

  // UX-123 (owner 2026-11-09): no "changes not saved" warning when leaving. Edits are saved on the way out
  // (auto-save, below) and kept as a draft in this browser meanwhile, which is offered again on return.

  // Update formula bar when active cell changes
  useEffect(() => {
    if (activeCell) {
      const row = gridRows[activeCell.rowIdx]
      if (row) {
        const val = row[activeCell.colId as keyof DailyJob]
        setFormulaBarValue(val !== undefined && val !== null ? String(val) : '')
      }
    } else {
      setFormulaBarValue('')
    }
  }, [activeCell, gridRows])

  // Auto-focus input when cell editing starts
  const editingKey = editingCell ? `${editingCell.rowIdx}:${editingCell.colId}` : ''
  useEffect(() => {
    if (!editingKey) return
    setTimeout(() => {
      const el = inputRef.current
      el?.focus()
      try { if (el && el.type === 'text') el.setSelectionRange(el.value.length, el.value.length) } catch { /* not a text input */ }
    }, 25)
  }, [editingKey])

  // Global Click Listener to close Context Menu and Menu Dropdowns
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null)
      setActiveMenu(null)
      setColorPickerCleaner(null)
      setShowThreeDotMenu(false)
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])


  // ── Push State to Undo Stack ──
  const pushState = (newRows: DailyJob[]) => {
    setHistory(prev => [...prev.slice(-40), JSON.parse(JSON.stringify(gridRows))])
    setFuture([])
    setGridRows(newRows)
  }

  // ── Undo & Redo ──
  const handleUndo = () => {
    if (history.length === 0) {
      showToast('Nothing to undo')
      return
    }
    const previous = history[history.length - 1]
    setFuture(prev => [JSON.parse(JSON.stringify(gridRows)), ...prev])
    setHistory(prev => prev.slice(0, prev.length - 1))
    setGridRows(previous)
    showToast('Undo executed (Ctrl+Z)')
  }

  const handleRedo = () => {
    if (future.length === 0) {
      showToast('Nothing to redo')
      return
    }
    const next = future[0]
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(gridRows))])
    setFuture(prev => prev.slice(1))
    setGridRows(next)
    showToast('Redo executed (Ctrl+Y)')
  }

  // Active cell coordinate display (e.g. "B4")
  const activeCellCoord = useMemo(() => {
    if (!activeCell) return 'A1'
    const colDef = COLUMNS.find(c => c.id === activeCell.colId)
    const letter = colDef?.col || 'A'
    return `${letter}${activeCell.rowIdx + 1}`
  }, [activeCell])

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Date Navigation
  const prevDay = () => {
    const next = addDaysToYMD(selectedDate, -1)
    setSelectedDate(next)
    setSearchParams({ date: next }, { replace: true })
  }
  const nextDay = () => {
    const next = addDaysToYMD(selectedDate, 1)
    setSelectedDate(next)
    setSearchParams({ date: next }, { replace: true })
  }

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  // Cell Click Handler
  const handleCellClick = (rowIdx: number, colId: string, e?: React.MouseEvent) => {
    if (e?.shiftKey && activeCell) return // UX-132: Shift + click extends the selection (mousedown)
    if (editingCell && (editingCell.rowIdx !== rowIdx || editingCell.colId !== colId)) {
      commitCellEdit()
    }
    setActiveCell({ rowIdx, colId })
    // Dropdown columns open straight away — one click is enough, also on an empty cell
    const alreadyOpen = editingCell && editingCell.rowIdx === rowIdx && editingCell.colId === colId
    if (DROPDOWN_COLS.has(colId) && !alreadyOpen) handleCellDoubleClick(rowIdx, colId)
  }

  useEffect(() => {
    if (selectedColId && activeCell && activeCell.colId !== selectedColId) setSelectedColId(null) // eslint-disable-line react-hooks/set-state-in-effect
  }, [activeCell, selectedColId])

  // Cell Double-click Handler
  const handleCellDoubleClick = (rowIdx: number, colId: string) => {
    if (READ_ONLY_COLS.has(colId)) { setActiveCell({ rowIdx, colId }); return }
    const row = gridRows[rowIdx]
    if (row) {
      const mcInfo = getMultiCleanerPaymentInfo(row, gridRows)
      if (refMoney(mcInfo, row) && (colId === 'charges' || colId === 'received' || colId === 'pending')) {
        setActiveCell({ rowIdx, colId })
        showToast(`ℹ️ Payment for this team shift is recorded under lead cleaner: ${mcInfo!.primaryCleaner}`)
        return
      }
    }
    const curVal = row?.[colId as keyof DailyJob]
    setActiveCell({ rowIdx, colId })
    setEditingCell({
      rowIdx,
      colId,
      tempValue: curVal !== undefined && curVal !== null ? String(curVal) : ''
    })
  }

  /** Index (in gridRows) of each visible row, in screen order */
  const visibleOrder = () => visibleGridRows.map(r => gridRows.findIndex(g => g.id === r.id)).filter(i => i >= 0)

  /** Move the active cell by rows / columns in screen order (UX-36) */
  const moveActive = (dRow: number, dCol: number, from = activeCell) => {
    const order = visibleOrder()
    if (order.length === 0) return
    if (!from) { setActiveCell({ rowIdx: order[0], colId: columns[0]?.id as string }); return }
    const colIds = columns.map(c => c.id as string)
    let pos = Math.max(0, order.indexOf(from.rowIdx))
    let ci = Math.max(0, colIds.indexOf(from.colId)) + dCol
    if (ci >= colIds.length) { ci = 0; pos += 1 } else if (ci < 0) { ci = colIds.length - 1; pos -= 1 }
    pos = Math.min(order.length - 1, Math.max(0, pos + dRow))
    setActiveCell({ rowIdx: order[pos], colId: colIds[ci] })
  }

  const isInSel = (rowIdx: number, colId: string) => {
    if (!selBounds) return false
    const p = rowPosOf.get(rowIdx)
    const c = columns.findIndex(x => x.id === colId)
    return p !== undefined && p >= selBounds.r0 && p <= selBounds.r1 && c >= selBounds.c0 && c <= selBounds.c1
  }
  /** Every cell of the selection, row by row ([] when only one cell is chosen) */
  const selCells = (): CellRef[] => {
    if (!selBounds) return []
    const order = visibleOrder()
    const out: CellRef[] = []
    for (let p = selBounds.r0; p <= selBounds.r1; p++) {
      for (let c = selBounds.c0; c <= selBounds.c1; c++) {
        if (order[p] !== undefined && columns[c]) out.push({ rowIdx: order[p], colId: columns[c].id as string })
      }
    }
    return out
  }
  const handleCellMouseDown = (e: React.MouseEvent, rowIdx: number, colId: string) => {
    if (e.button !== 0) return
    if (editingCell && editingCell.rowIdx === rowIdx && editingCell.colId === colId) return
    if (e.altKey) { // UX-137: Alt + drag copies this row onto the row where the mouse is let go
      e.preventDefault()
      rowDrag.current = { from: rowIdx, over: rowIdx }
      return
    }
    if (e.shiftKey && activeCell) {
      e.preventDefault()
      setSelRange({ a: activeCell, b: { rowIdx, colId } })
      dragSel.current = false
      return
    }
    setSelRange({ a: { rowIdx, colId }, b: { rowIdx, colId } })
    dragSel.current = 'cells'
  }
  const handleCellMouseEnter = (rowIdx: number, colId: string) => {
    if (rowDrag.current) { rowDrag.current.over = rowIdx; return }
    if (dragSel.current !== 'cells') return
    setSelRange(prev => (prev ? { a: prev.a, b: { rowIdx, colId } } : prev))
  }
  /** Drag across the column letters → whole columns */
  const handleHeaderMouseDown = (e: React.MouseEvent, colId: string) => {
    if (e.button !== 0) return
    const order = visibleOrder()
    if (!order.length) return
    const from = e.shiftKey && selRange ? selRange.a.colId : colId
    setSelRange({ a: { rowIdx: order[0], colId: from }, b: { rowIdx: order[order.length - 1], colId } })
    dragSel.current = 'cols'
  }
  const handleHeaderMouseEnter = (colId: string) => {
    if (dragSel.current !== 'cols') return
    setSelRange(prev => (prev ? { a: prev.a, b: { rowIdx: prev.b.rowIdx, colId } } : prev))
  }
  useEffect(() => {
    const up = () => {
      dragSel.current = false
      const d = rowDrag.current
      rowDrag.current = null
      if (d && d.over !== d.from) pasteRowRef.current(d.over, d.from)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  /** Put a typed / pasted value into a row, with the same parsing as cell editing */
  const applyCellValue = (row: DailyJob, colId: string, raw: string): DailyJob => {
    if (READ_ONLY_COLS.has(colId)) return row
    const v = raw.trim()
    const next = { ...row } as DailyJob & Record<string, unknown>
    if (colId === 'charges' || colId === 'received' || colId === 'duty_hours' || colId === 'ot_hours' || colId === 'charges_per_hour') next[colId] = cleanNum(v)
    else if (colId === 'start_time' || colId === 'end_time') {
      const fmt = formatTimeOnly(v)
      next[colId] = fmt !== '—' ? fmt : v
      return syncDutyWithTimes(next, !v) // UX-139: a removed time clears Duty Hrs and OT
    } else next[colId] = v
    return next
  }

  const blankRow = (base?: Partial<DailyJob>): DailyJob => ({
    id: newRowId('new'),
    date: base?.date || effectiveTargetDate,
    staff_name: '',
    start_time: '', end_time: '', duty_hours: 0, ot_hours: 0, address: '', area: '',
    charges: 0, received: 0, payment_mode: 'Cash', is_overtime: false, material: 'No', remarks: '',
      created_at: new Date().toISOString(),
  })

  /** Paste a block copied from Excel / Google Sheets at the active cell; adds rows as needed (UX-32) */
  const pasteBlock = (text: string) => {
    if (!activeCell) { showToast('Click a cell first, then paste'); return }
    const lines = text.replace(/\r/g, '').split('\n')
    while (lines.length && lines[lines.length - 1] === '') lines.pop()
    if (lines.length === 0) return
    const order = visibleOrder()
    const colIds = columns.map(c => c.id as string)
    const startPos = Math.max(0, order.indexOf(activeCell.rowIdx))
    const startCol = Math.max(0, colIds.indexOf(activeCell.colId))
    const updated = [...gridRows]
    let added = 0
    lines.forEach((line, i) => {
      let idx = order[startPos + i]
      if (idx === undefined) {
        updated.push(blankRow(updated[order[order.length - 1]]))
        idx = updated.length - 1
        added++
      }
      let row = updated[idx]
      line.split('\t').forEach((cell, j) => {
        const colId = colIds[startCol + j]
        if (colId) row = applyCellValue(row, colId, cell)
      })
      updated[idx] = row
    })
    const finalGrid = recalculateAllRowsOT(updated)
    pushState(finalGrid)
    showToast(`✓ Pasted ${lines.length} row${lines.length === 1 ? '' : 's'}${added ? ` (${added} new)` : ''}`)
  }

  /** Ctrl+D — copy the value from the row above into the active cell (UX-32) */
  const fillDown = () => {
    if (!activeCell || READ_ONLY_COLS.has(activeCell.colId)) return
    const order = visibleOrder()
    const pos = order.indexOf(activeCell.rowIdx)
    if (pos <= 0) return
    const above = gridRows[order[pos - 1]]
    const val = above?.[activeCell.colId as keyof DailyJob]
    const updated = [...gridRows]
    updated[activeCell.rowIdx] = applyCellValue(updated[activeCell.rowIdx], activeCell.colId, val == null ? '' : String(val))
    pushState(updated)
  }

  /** Delete / Backspace — clear the active cell */
  const clearActiveCell = () => {
    const many = selCells()
    if (many.length) { // UX-132: Delete clears every chosen cell
      const updated = [...gridRows]
      many.forEach(({ rowIdx, colId }) => { if (updated[rowIdx] && !READ_ONLY_COLS.has(colId)) updated[rowIdx] = applyCellValue(updated[rowIdx], colId, '') })
      pushState(recalculateAllRowsOT(updated))
      return
    }
    if (!activeCell || READ_ONLY_COLS.has(activeCell.colId)) return
    const updated = [...gridRows]
    const row = updated[activeCell.rowIdx]
    if (!row) return
    updated[activeCell.rowIdx] = applyCellValue(row, activeCell.colId, '')
    pushState(recalculateAllRowsOT(updated)) // UX-139: OT of the cleaner's day follows a removed time
  }

  /** Keys inside the cell editor: Enter / Tab save and move, Esc cancels (UX-36) */
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const from = editingCell ? { rowIdx: editingCell.rowIdx, colId: editingCell.colId } : activeCell
      commitCellEdit()
      if (e.key === 'Enter') moveActive(e.shiftKey ? -1 : 1, 0, from)
      else moveActive(0, e.shiftKey ? -1 : 1, from)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditingCell(null)
    }
  }

  // Commit Cell Edit
  const commitCellEdit = (): DailyJob[] => {
    if (!editingCell) return gridRows
    const { rowIdx, colId, tempValue } = editingCell
    const trimmed = tempValue.trim()

    const updated = [...gridRows]
    const row = { ...updated[rowIdx] }

    if (colId === 'charges' || colId === 'received' || colId === 'duty_hours' || colId === 'ot_hours' || colId === 'charges_per_hour') {
      if (trimmed.startsWith('=')) {
        const evaluated = evaluateFormula(trimmed, updated, rowIdx)
        ;(row as any)[colId] = typeof evaluated === 'number' ? evaluated : cleanNum(evaluated)
      } else {
        ;(row as any)[colId] = cleanNum(trimmed)
      }
    } else if (colId === 'start_time' || colId === 'end_time') {
      const fmt = formatTimeOnly(trimmed)
      ;(row as any)[colId] = fmt !== '—' ? fmt : trimmed
      Object.assign(row, syncDutyWithTimes(row, !trimmed)) // UX-139
    } else {
      ;(row as any)[colId] = trimmed
    }

    // If editing staff_name, synchronize all rows in this staff member's block so they stay together
    if (colId === 'staff_name') {
      const oldStaff = (gridRows[rowIdx]?.staff_name || '').trim().toLowerCase()
      if (oldStaff && trimmed.toLowerCase() !== oldStaff) {
        updated.forEach((r, i) => {
          if ((r.staff_name || '').trim().toLowerCase() === oldStaff) {
            updated[i] = { ...r, staff_name: trimmed }
          }
        })
      } else {
        // If it was a blank staff block, update all rows in this block
        const targetBlock = staffBlockInfoMap.get(row.id)
        if (targetBlock && !targetBlock.staffName) {
          const startIndex = rowIdx - targetBlock.blockRowIdx
          for (let i = 0; i < targetBlock.rowCount; i++) {
            if (updated[startIndex + i]) updated[startIndex + i] = { ...updated[startIndex + i], staff_name: trimmed }
          }
        }
      }
    }

    // Automatic check: If editing Client column and client is not in system, trigger Quick Registration modal
    if (colId === 'address' && trimmed.length > 1) {
      const isRegistered = clients.some(c =>
        c.full_name?.toLowerCase().trim() === trimmed.toLowerCase() ||
        c.building_name?.toLowerCase().trim() === trimmed.toLowerCase() ||
        `${c.full_name} (${c.building_name || c.area})`.toLowerCase().trim() === trimmed.toLowerCase()
      )
      if (!isRegistered) {
        setQuickClientState({
          open: true,
          rowIdx,
          name: trimmed,
        })
      }
    }

    updated[rowIdx] = row
    // R-OT-01: Recalculate cumulative multi-shift Overtime when times or cleaner changes
    const finalGrid = (colId === 'start_time' || colId === 'end_time' || colId === 'staff_name')
      ? recalculateAllRowsOT(updated)
      : updated
    if (refuseClash(finalGrid)) { setEditingCell(null); return gridRows }
    pushState(finalGrid)
    setEditingCell(null)
    return finalGrid
  }

  /** R-JOB-01: a cleaner cannot work two jobs at the same time — show the error and refuse the change */
  const showClash = (clash: StaffClash) => {
    const msg = `⛔ Time clash: ${clashMessage(clash)}`
    showToast(msg)
    notify.error(msg)
  }
  const refuseClash = (next: DailyJob[]): boolean => {
    // Only rows whose cleaner / time / date changed — an old clash must not block an unrelated edit
    const changed = next.filter((r, i) => r !== gridRows[i] && timingChanged(gridRows.find(g => g.id === r.id), r))
    const clash = findClashAmong(next, changed)
    if (clash) showClash(clash)
    return !!clash
  }

  // Quick Commit for Address / Building Dropdown Selection
  const commitAddressSelect = (rowIdx: number, building: string, area?: string, mode?: string) => {
    const updated = [...gridRows]
    const row = { ...updated[rowIdx] }
    row.address = building
    if (area) row.area = area
    if (mode === 'Monthly') row.payment_mode = 'Monthly'
    updated[rowIdx] = row
    pushState(updated)
    setEditingCell(null)
  }

  // Quick Commit for Material Selection or Custom Material Addition
  const commitMaterialSelect = (rowIdx: number, val: string) => {
    const updated = [...gridRows]
    const row = { ...updated[rowIdx] }
    row.material = val as any
    updated[rowIdx] = row
    pushState(updated)
    setEditingCell(null)
    showToast(`✓ Material set to "${val}"`)
  }

  // Quick Commit for Location / Area Dropdown Selection
  const commitAreaSelect = (rowIdx: number, area: string) => {
    const updated = [...gridRows]
    const row = { ...updated[rowIdx] }
    row.area = area
    updated[rowIdx] = row
    pushState(updated)
    setEditingCell(null)
    showToast(`✓ Location set to "${area}"`)
  }

  // Quick Commit for Shift Time Selection
  const commitTimeSelect = (rowIdx: number, colId: 'start_time' | 'end_time', timeStr: string) => {
    const updated = [...gridRows]
    const r = { ...updated[rowIdx] }
    const fmt = formatTimeOnly(timeStr)
    r[colId] = fmt !== '—' ? fmt : timeStr
    updated[rowIdx] = syncDutyWithTimes(r, !String(timeStr || '').trim()) // UX-139
    // R-OT-01: Recalculate cumulative multi-shift Overtime
    const finalGrid = recalculateAllRowsOT(updated)
    if (refuseClash(finalGrid)) { setEditingCell(null); return }
    pushState(finalGrid)
    setEditingCell(null)
    showToast(`✓ ${colId === 'start_time' ? 'Start Time' : 'End Time'} set to "${r[colId]}"`)
  }

  // Quick Commit for Payment Mode Dropdown Selection
  const commitPaymentModeSelect = (rowIdx: number, mode: string) => {
    const updated = [...gridRows]
    const row = { ...updated[rowIdx] }
    row.payment_mode = mode as PaymentMode
    updated[rowIdx] = row
    pushState(updated)
    setEditingCell(null)
    showToast(`✓ Payment Mode set to "${mode}"`)
  }

  // Unified Interactive Cell Editor — every dropdown uses the Address design and opens in a portal
  // (ExcelCellPopover) so the rows under it can no longer paint over it while the mouse moves (UX-35)
  /**
   * UX-132: arrow keys never get stuck inside a cell editor or dropdown (Start time, Location, Mode …):
   * Up / Down close it and move to the next row — saving first when something was typed (not a half-typed
   * Address search); Left / Right move to the next column while nothing was typed (else they move the caret).
   */
  const handleEditorArrows = (e: React.KeyboardEvent) => {
    if (!editingCell) return
    // UX-142: in an open dropdown, Up / Down walk the list and Enter picks the highlighted item;
    // past the last (or above the first) item the keys fall through and move to the next row as before
    if (DROPDOWN_COLS.has(editingCell.colId) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && popoverMove(e.key === 'ArrowDown' ? 1 : -1)) {
        e.preventDefault(); e.stopPropagation(); return
      }
      if (e.key === 'Enter' && popoverPick()) { e.preventDefault(); e.stopPropagation(); return }
    }
    if (!e.key.startsWith('Arrow') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown'
    const untouched = editingCell.tempValue === String((gridRows[editingCell.rowIdx] as any)?.[editingCell.colId] ?? '')
    if (!vertical && !untouched) return
    if (vertical && !untouched && editingCell.colId === 'address') return
    e.preventDefault()
    e.stopPropagation()
    const from = { rowIdx: editingCell.rowIdx, colId: editingCell.colId }
    if (untouched) setEditingCell(null)
    else commitCellEdit()
    const step: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    moveActive(...step[e.key], from)
  }

  const renderCellEditor = (col: ColumnDef, targetIdx: number, isLightBg: boolean = true) => {
    if (!editingCell || editingCell.rowIdx !== targetIdx || editingCell.colId !== col.id) return null
    return <div className="contents" onKeyDownCapture={handleEditorArrows}>{renderCellEditorInner(col, targetIdx, isLightBg)}</div>
  }

  const renderCellEditorInner = (col: ColumnDef, targetIdx: number, isLightBg: boolean = true) => {
    if (!editingCell || editingCell.rowIdx !== targetIdx || editingCell.colId !== col.id) return null
    const setTemp = (v: string) => setEditingCell({ ...editingCell, tempValue: v })
    // Value still as it was in the cell: show the whole list with it highlighted, filter once typing starts
    const untouched = editingCell.tempValue === String((gridRows[targetIdx] as any)?.[col.id] ?? '')
    const cellInputClass = `w-full h-full text-[12px] font-semibold border-0 outline-none px-1 py-0 focus:ring-0 ${isLightBg ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`

    // 1. Address Column Dropdown (the reference design)
    if (col.id === 'address') {
      const typed = editingCell.tempValue.trim()
      const isKnownAddress = filteredClientBuildings.some(item => item.building.trim().toLowerCase() === typed.toLowerCase())
      const registerNew = () => {
        setQuickClientState({ open: true, rowIdx: targetIdx, name: typed })
        setEditingCell(null)
      }

      return (
        <div className="relative w-full h-7 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={editingCell.tempValue}
            onChange={e => setTemp(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setEditingCell(null)
              else if (e.key === 'Enter') {
                e.preventDefault()
                if (!typed) {
                  commitCellEdit()
                  return
                }
                const matched = filteredClientBuildings.find(item => item.building.trim().toLowerCase() === typed.toLowerCase())
                if (matched) {
                  commitAddressSelect(targetIdx, matched.building, matched.area, matched.isMonthly ? 'Monthly' : undefined)
                } else {
                  // New address typed: open Add Client popup so user can record WhatsApp & client info
                  registerNew()
                }
              }
            }}
            placeholder="Search address..."
            className={cellInputClass}
          />
          <ExcelCellPopover
            width={440}
            title="Address & Client Directory"
            icon={Building2}
            search={{ value: editingCell.tempValue, onChange: setTemp, placeholder: 'Search address or client…' }}
            banner={typed && !isKnownAddress && (
              <ExcelPopoverCustom onPick={registerNew} icon={UserPlus} badge="Add Client">
                + Register &ldquo;{typed}&rdquo; as New Client (WhatsApp/Details)
              </ExcelPopoverCustom>
            )}
          >
            {filteredClientBuildings.length === 0 && !typed ? (
              <ExcelPopoverEmpty>No registered clients found</ExcelPopoverEmpty>
            ) : (
              filteredClientBuildings.map(item => (
                <ExcelPopoverItem
                  key={item.key}
                  selected={typed.toLowerCase() === item.building.toLowerCase()}
                  onPick={() => commitAddressSelect(targetIdx, cleanAddressDisplay(item.building), item.area, item.isMonthly ? 'Monthly' : undefined)}
                  icon={Building2}
                  label={cleanAddressDisplay(item.building)}
                  sub={`${item.name} ${item.client?.apartment ? `· Apt ${item.client.apartment}` : ''} ${item.area ? `· ${item.area}` : ''}`}
                />
              ))
            )}
          </ExcelCellPopover>
        </div>
      )
    }

    // 2. Location / Area Column Dropdown
    if (col.id === 'area') {
      const typed = editingCell.tempValue.trim()
      const q = untouched ? '' : typed.toLowerCase()
      const allUniqueAreas = Array.from(new Set([
        ...areaOptions,
        ...DUBAI_AREAS,
        ...clients.map(c => (c.area || '').trim()).filter(Boolean),
        ...gridRows.map(r => (r.area || '').trim()).filter(Boolean)
      ])).filter(a => a && a !== '—').sort()

      const filteredAreas = q
        ? allUniqueAreas.filter(a => a.toLowerCase().includes(q))
        : allUniqueAreas

      const isCustom = q && !allUniqueAreas.some(a => a.toLowerCase() === q)

      return (
        <div className="relative w-full h-7 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={editingCell.tempValue}
            onChange={e => setTemp(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setEditingCell(null)
              else if (e.key === 'Enter') {
                if (typed) {
                  commitAreaSelect(targetIdx, typed)
                } else {
                  commitCellEdit()
                }
              }
            }}
            placeholder="Search location/area..."
            className={cellInputClass}
          />
          <ExcelCellPopover
            width={380}
            title="Location / Area"
            icon={MapPin}
            search={{ value: editingCell.tempValue, onChange: setTemp, placeholder: 'Search area (e.g. Marina, Downtown)…' }}
            banner={isCustom && (
              <ExcelPopoverCustom onPick={() => commitAreaSelect(targetIdx, typed)} icon={Plus} badge="Custom">
                Use area &ldquo;{typed}&rdquo;
              </ExcelPopoverCustom>
            )}
          >
            {filteredAreas.length === 0 ? (
              <ExcelPopoverEmpty>No matching areas found</ExcelPopoverEmpty>
            ) : (
              filteredAreas.map(ar => (
                <ExcelPopoverItem
                  key={ar}
                  selected={typed.toLowerCase() === ar.toLowerCase()}
                  onPick={() => commitAreaSelect(targetIdx, ar)}
                  icon={MapPin}
                  label={ar}
                />
              ))
            )}
          </ExcelCellPopover>
        </div>
      )
    }

    // 3. Material Column Dropdown
    if (col.id === 'material') {
      const usedCustom = Array.from(new Set(gridRows.map(r => String(r.material || '').trim()).filter(Boolean)))
        .filter(m => !['yes', 'no', 'no material', 'sofa', '—'].includes(m.toLowerCase()))
        .sort()
      const standardMaterials = ['Yes', 'No Material', 'Sofa', ...usedCustom]
      const curMat = editingCell.tempValue || 'No'
      const q = untouched ? '' : editingCell.tempValue.toLowerCase().trim()
      const filteredMaterials = q
        ? standardMaterials.filter(m => m.toLowerCase().includes(q) || (m === 'No Material' && 'client supplies'.includes(q)))
        : standardMaterials
      const saveCustom = () => {
        if (excelCustomMaterial.trim()) {
          commitMaterialSelect(targetIdx, excelCustomMaterial.trim())
          setExcelCustomMaterial('')
        }
      }

      return (
        <div className="relative w-full h-7 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={editingCell.tempValue}
            onChange={e => setTemp(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitCellEdit()
              else if (e.key === 'Escape') setEditingCell(null)
            }}
            placeholder="Material..."
            className={cellInputClass}
          />
          <ExcelCellPopover
            width={340}
            title="Cleaning Materials / Supplies"
            icon={Package}
            search={{ value: editingCell.tempValue, onChange: setTemp, placeholder: 'Search material…' }}
            listMaxHeight={220}
            footer={
              <div className="pt-2 mt-2 border-t border-slate-100 shrink-0">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Type custom material…"
                    value={excelCustomMaterial}
                    onChange={e => setExcelCustomMaterial(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        saveCustom()
                      }
                    }}
                    className="flex-1 text-[12.5px] px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-emerald-500 focus:bg-white font-medium"
                  />
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); saveCustom() }}
                    className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-2xs cursor-pointer shrink-0"
                    title="Save Custom Material"
                  >
                    <Check size={13} className="stroke-[3]" />
                  </button>
                </div>
              </div>
            }
          >
            {filteredMaterials.length === 0 ? (
              <ExcelPopoverEmpty>No matching material — type it below</ExcelPopoverEmpty>
            ) : (
              filteredMaterials.map(mat => {
                const isNo = mat === 'No Material'
                return (
                  <ExcelPopoverItem
                    key={mat}
                    selected={isNo ? (!curMat || curMat === 'No' || curMat === 'No Material') : curMat.toLowerCase() === mat.toLowerCase()}
                    onPick={() => commitMaterialSelect(targetIdx, isNo ? 'No' : mat)}
                    icon={Package}
                    label={isNo ? 'No' : mat}
                    sub={isNo ? 'No material — client supplies' : mat === 'Yes' ? 'Our cleaning material' : mat === 'Sofa' ? 'Sofa cleaning kit' : 'Custom'}
                  />
                )
              })
            )}
          </ExcelCellPopover>
        </div>
      )
    }

    // 4 & 5. Start Time & End Time (AM / PM pills + suggestions)
    if (col.id === 'start_time' || col.id === 'end_time') {
      const typed = (editingCell.tempValue || '').trim()
      const q = untouched ? '' : typed.toLowerCase()
      const filteredTimes = q
        ? TIME_SUGGESTIONS.filter(t => t.toLowerCase().includes(q))
        : TIME_SUGGESTIONS
      const pill = (label: string, value: string, active: boolean) => (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); setTemp(value) }}
          className={`flex-1 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
            active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          {label}
        </button>
      )

      return (
        <div className="relative w-full h-full flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={editingCell.tempValue}
            onChange={e => setTemp(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (typed) {
                  commitTimeSelect(targetIdx, col.id as any, typed)
                } else {
                  commitCellEdit()
                }
              } else {
                handleEditorKeyDown(e)
              }
            }}
            placeholder="e.g. 09:15 AM"
            className={`${cellInputClass} font-mono`}
          />
          <ExcelCellPopover
            width={320}
            title={col.id === 'start_time' ? 'Shift Start Time' : 'Shift End Time'}
            icon={Clock}
            banner={
              <>
                <div className="flex items-center gap-1 mb-2 shrink-0">
                  {pill('All', '', !q.includes('am') && !q.includes('pm'))}
                  {pill('AM (Morning)', 'AM', q === 'am')}
                  {pill('PM (Evening)', 'PM', q === 'pm')}
                </div>
                {q && q !== 'am' && q !== 'pm' && !TIME_SUGGESTIONS.some(t => t.toLowerCase() === q) && (
                  <ExcelPopoverCustom onPick={() => commitTimeSelect(targetIdx, col.id as any, typed)} icon={Plus} badge="Custom">
                    Use time &ldquo;{typed}&rdquo;
                  </ExcelPopoverCustom>
                )}
              </>
            }
            listMaxHeight={220}
          >
            {filteredTimes.length === 0 ? (
              <ExcelPopoverEmpty>No matching time</ExcelPopoverEmpty>
            ) : (
              filteredTimes.map(timeStr => (
                <ExcelPopoverItem
                  key={timeStr}
                  selected={typed.toUpperCase() === timeStr.toUpperCase()}
                  onPick={() => commitTimeSelect(targetIdx, col.id as any, timeStr)}
                  icon={Clock}
                  label={timeStr}
                  mono
                />
              ))
            )}
          </ExcelCellPopover>
        </div>
      )
    }

    // 6. Payment Mode Column Dropdown
    if (col.id === 'payment_mode') {
      const curMode = (editingCell.tempValue || '').trim()
      const defaultModes = [
        { id: 'Cash Payment', value: 'Cash' },
        { id: 'Online Transfer', value: 'Online' },
        { id: 'Monthly Contract', value: 'Monthly' },
        { id: 'Pending Due', value: 'Pending' },
      ]

      // Used custom modes in current sheet
      const usedCustomModes = Array.from(
        new Set(
          gridRows
            .map(r => r.payment_mode as string | undefined)
            .filter((m): m is string => Boolean(m && !['Cash', 'Online', 'Monthly', 'Pending', 'Above', 'Cash Payment', 'Online Transfer', 'Monthly Contract', 'Pending Due'].includes(m)))
        )
      )

      const allCustomModes = Array.from(new Set([...customPaymentModes, ...usedCustomModes]))
      const allModeOptions = [
        ...defaultModes,
        ...allCustomModes.map(c => ({ id: c, value: c }))
      ].filter(m => !deletedPaymentModes.includes(m.id) && !deletedPaymentModes.includes(m.value))

      const q = untouched ? '' : curMode.toLowerCase()
      const filteredModes = q
        ? allModeOptions.filter(m => m.id.toLowerCase().includes(q) || m.value.toLowerCase().includes(q))
        : allModeOptions

      const handleSaveCustomPaymentMode = () => {
        const val = excelCustomPaymentMode.trim()
        if (!val) return
        if (!customPaymentModes.includes(val)) {
          const updated = [...customPaymentModes, val]
          setCustomPaymentModes(updated)
          safeLocalStorageSet('safaeewala_custom_payment_modes', updated)
        }
        if (deletedPaymentModes.includes(val)) {
          const nextDeleted = deletedPaymentModes.filter(x => x !== val)
          setDeletedPaymentModes(nextDeleted)
          safeLocalStorageSet('safaeewala_deleted_payment_modes', nextDeleted)
        }
        commitPaymentModeSelect(targetIdx, val)
        setExcelCustomPaymentMode('')
      }

      const handleDeletePaymentMode = (name: string, val: string) => {
        if (customPaymentModes.includes(name) || customPaymentModes.includes(val)) {
          const updated = customPaymentModes.filter(x => x !== name && x !== val)
          setCustomPaymentModes(updated)
          safeLocalStorageSet('safaeewala_custom_payment_modes', updated)
        }
        if (!deletedPaymentModes.includes(name) || !deletedPaymentModes.includes(val)) {
          const nextDeleted = Array.from(new Set([...deletedPaymentModes, name, val]))
          setDeletedPaymentModes(nextDeleted)
          safeLocalStorageSet('safaeewala_deleted_payment_modes', nextDeleted)
        }
        showToast(`Payment mode "${name}" removed`)
      }

      return (
        <div className="relative w-full h-7 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={editingCell.tempValue}
            onChange={e => setTemp(e.target.value)}
            onKeyDown={handleEditorKeyDown}
            placeholder="Mode..."
            className={cellInputClass}
          />
          <ExcelCellPopover
            width={340}
            title="Payment Mode"
            icon={CreditCard}
            banner={
              <div className="flex items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl mb-2">
                <input
                  type="text"
                  value={excelCustomPaymentMode}
                  onChange={e => setExcelCustomPaymentMode(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSaveCustomPaymentMode()
                    }
                  }}
                  placeholder="Type new payment mode..."
                  className="w-full text-[12px] px-2.5 py-1 bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-medium text-slate-800 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={handleSaveCustomPaymentMode}
                  disabled={!excelCustomPaymentMode.trim()}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-[11px] font-bold shrink-0 cursor-pointer flex items-center gap-1 transition-all"
                  title="Add Custom Payment Mode"
                >
                  <Plus size={12} />
                  <span>Add</span>
                </button>
              </div>
            }
          >
            {filteredModes.length === 0 ? (
              <ExcelPopoverEmpty>No payment modes found — type above to add</ExcelPopoverEmpty>
            ) : (
              filteredModes.map(m => {
                const isSelected = curMode.toLowerCase() === m.value.toLowerCase() || curMode.toLowerCase() === m.id.toLowerCase()
                return (
                  <ExcelPopoverItem
                    key={m.id}
                    selected={isSelected}
                    onPick={() => commitPaymentModeSelect(targetIdx, m.value)}
                    icon={CreditCard}
                    label={<span className="text-[12.5px] font-bold text-slate-900">{m.id}</span>} // UX-91: name only, no description
                    action={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeletePaymentMode(m.id, m.value)
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title={`Delete ${m.id}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    }
                  />
                )
              })
            )}
          </ExcelCellPopover>
        </div>
      )
    }

    // 7. Fallback input for text / numbers
    return (
      <input
        ref={inputRef}
        type={col.type === 'date' ? 'date' : 'text'}
        value={editingCell.tempValue}
        onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
        onBlur={commitCellEdit}
        onKeyDown={handleEditorKeyDown}
        className={`w-full h-full text-[12px] font-mono border-0 outline-none p-0 focus:ring-0 ${isLightBg ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
      />
    )
  }

  // Formula Bar change
  const handleFormulaBarChange = (newVal: string) => {
    if (activeCell && READ_ONLY_COLS.has(activeCell.colId)) return
    setFormulaBarValue(newVal)
    if (activeCell) {
      const updated = [...gridRows]
      const row = { ...updated[activeCell.rowIdx] }
      const { colId } = activeCell

      if (newVal.startsWith('=')) {
        const evaluated = evaluateFormula(newVal, updated, activeCell.rowIdx)
        ;(row as any)[colId] = typeof evaluated === 'number' ? evaluated : evaluated
      } else if (colId === 'charges' || colId === 'received' || colId === 'duty_hours' || colId === 'ot_hours' || colId === 'charges_per_hour') {
        ;(row as any)[colId] = cleanNum(newVal)
      } else {
        ;(row as any)[colId] = newVal
      }

      updated[activeCell.rowIdx] = row
      pushState(updated)
    }
  }

  // ── Open & Save Row Edit Modal ──
  const handleOpenEditModal = (row: DailyJob, index: number) => {
    setEditingRowState({ row: { ...row }, index })
  }

  const handleSaveEditedRow = (updatedRow: DailyJob, index: number) => {
    const updated = [...gridRows]
    updated[index] = updatedRow
    const finalGrid = recalculateAllRowsOT(updated) // R-OT-01: the cleaner's other shifts change too
    if (refuseClash(finalGrid)) return // the popup stays open to fix the time or cleaner
    pushState(finalGrid)
    setEditingRowState(null)
    showToast(`✓ Row #${index + 1} updated successfully`)
  }

  // ── Insert Row Above or Below (Used by Right-Click Menu & Add Row - Guaranteed completely empty) ──
  const insertRowAt = (targetIdx: number, position: 'above' | 'below', _defaultStaff?: string) => {
    const newJob: DailyJob = {
      id: newRowId('new'),
      date: effectiveTargetDate,
      staff_name: '',
      start_time: '',
      end_time: '',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      charges: 0,
      received: 0,
      payment_mode: '' as any,
      is_overtime: false,
      material: '' as any,
      remarks: '',
      created_at: new Date().toISOString()
    }

    const insertIdx = position === 'above' ? Math.max(0, targetIdx) : targetIdx + 1
    const updated = [...gridRows]
    updated.splice(insertIdx, 0, newJob)
    pushState(updated)
    setActiveCell({ rowIdx: insertIdx, colId: 'staff_name' })
    setContextMenu(null)
    showToast(`✓ Empty row added ${position === 'above' ? 'at top (above)' : 'at bottom (below)'}`)
  }

  // Add New Row at bottom of sheet
  const handleAddRow = () => {
    insertRowAt(gridRows.length - 1, 'below')
  }

  // UX-137: Copy a row, then Paste it onto another row (right-click), or Alt + drag a row onto another
  const [rowClip, setRowClip] = useState<DailyJob | null>(null)
  const handleCopyRow = (idx: number) => {
    const src = gridRows[idx]
    if (!src) return
    setRowClip({ ...src })
    setContextMenu(null)
    showToast(`Row #${idx + 1} copied — right-click another row → Paste Row Here`)
  }
  const handlePasteRow = (targetIdx: number, src: DailyJob | null = rowClip) => {
    const target = gridRows[targetIdx]
    if (!target || !src || src.id === target.id) return
    const updated = [...gridRows]
    updated[targetIdx] = pasteRowInto(target, src)
    pushState(recalculateAllRowsOT(updated))
    setActiveCell({ rowIdx: targetIdx, colId: 'address' })
    setContextMenu(null)
    showToast(`✓ Pasted into row #${targetIdx + 1} — press Save to keep it`)
  }
  useEffect(() => { pasteRowRef.current = (to: number, from: number) => handlePasteRow(to, gridRows[from] || null) })

  // Duplicate Selected Row
  const handleDuplicateRow = (idx: number) => {
    const target = gridRows[idx]
    if (!target) return
    const duplicated: DailyJob = {
      ...target,
      id: newRowId('copy'),
      created_at: new Date().toISOString()
    }
    const updated = [...gridRows]
    updated.splice(idx + 1, 0, duplicated)
    pushState(updated)
    setActiveCell({ rowIdx: idx + 1, colId: 'address' })
    setContextMenu(null)
    showToast(`Row #${idx + 1} duplicated`)
  }

  // ── Add Row to specific Staff Block (Expands block from 3 to 4, 5, etc.) ──
  const handleAddRowToStaff = (staffName: string, insertAfterIndex: number) => {
    const newJob: DailyJob = {
      id: newRowId('new_shift'),
      date: effectiveTargetDate,
      staff_name: staffName,
      start_time: '',
      end_time: '',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      material: '' as any,
      charges: 0,
      received: 0,
      payment_mode: '' as any,
      remarks: '',
      is_overtime: false,
      created_at: new Date().toISOString()
    }
    const updated = [...gridRows]
    const insertPos = insertAfterIndex >= 0 ? insertAfterIndex + 1 : updated.length
    updated.splice(insertPos, 0, newJob)
    pushState(updated)
    showToast(`✓ Row added to expand ${staffName || 'Staff'}'s block`)
  }

  // ── Helper: Strictly generates 3 blank rows for a new cleaner block ──
  const createThreeBlankRows = (mode?: string) => {
    const blockTs = Date.now()
    const targetMode = mode !== undefined ? mode : (paymentModeFilter !== 'ALL' ? paymentModeFilter : '')
    const isProject = targetMode === 'Project'
    let assignedPaymentMode: PaymentMode | '' = ''
    if (targetMode === 'Monthly') assignedPaymentMode = 'Monthly'
    else if (targetMode === 'Cash') assignedPaymentMode = 'Cash'
    else if (targetMode === 'Online') assignedPaymentMode = 'Online'
    else if (targetMode === 'Pending') assignedPaymentMode = 'Pending'
    else if (isProject) assignedPaymentMode = 'Cash'

    return [0, 1, 2].map((idx) => ({
      id: newRowId(`blank_cleaner_${blockTs}_${idx}`),
      date: effectiveTargetDate,
      staff_name: '',
      start_time: '',
      end_time: '',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      material: '' as any,
      charges: 0,
      received: 0,
      payment_mode: assignedPaymentMode as any,
      team_name: undefined,
      _isProjectViewRow: isProject ? true : undefined,
      remarks: '',
      is_overtime: false,
      created_at: new Date(blockTs + idx * 10).toISOString()
    }))
  }

  // ── Add New Empty Block Above Selected Staff Block ──
  const handleAddEmptyBlockAbove = (targetJob: DailyJob, rowIdx: number) => {
    const bInfo = staffBlockInfoMap.get(targetJob.id)
    const blockStartIndex = Math.max(0, rowIdx - (bInfo?.blockRowIdx ?? 0))
    const newBlock = createThreeBlankRows(targetJob.payment_mode || undefined)
    const updated = [...gridRows]
    updated.splice(blockStartIndex, 0, ...newBlock)
    pushState(updated)
    showToast('✓ Added new empty block (3 rows) above')
  }

  // ── Add New Empty Block Below Selected Staff Block ──
  const handleAddEmptyBlockBelow = (targetJob: DailyJob, rowIdx: number) => {
    const bInfo = staffBlockInfoMap.get(targetJob.id)
    const blockStartIndex = Math.max(0, rowIdx - (bInfo?.blockRowIdx ?? 0))
    const blockRowCount = bInfo?.rowCount ?? 3
    const insertAt = blockStartIndex + blockRowCount
    const newBlock = createThreeBlankRows(targetJob.payment_mode || undefined)
    const updated = [...gridRows]
    updated.splice(insertAt, 0, ...newBlock)
    pushState(updated)
    showToast('✓ Added new empty block (3 rows) below')
  }

  // ── Add New Empty Row (Strictly adds a brand new cleaner block of exactly 3 rows) ──
  const handleAddBlankCleanerBlock = () => {
    const newJobs = createThreeBlankRows()
    const updated = [...gridRows, ...newJobs]
    pushState(updated)
    const label = paymentModeFilter !== 'ALL' ? ` (${paymentModeFilter} View)` : ''
    showToast(`✓ 3 new empty rows added${label}`)
  }

  // ── Delete Entire Staff Block (Removes all rows for this cleaner block) ──
  const handleDeleteStaffBlock = (target: DailyJob | string) => {
    const targetJob = typeof target === 'string' ? null : target
    const rawName = (typeof target === 'string' ? target : (target?.staff_name || '')).trim()
    let updated: DailyJob[]

    if (rawName) {
      const staffKey = rawName.toLowerCase()
      updated = gridRows.filter(r => (r.staff_name || '').trim().toLowerCase() !== staffKey)
      showToast(`✓ Staff block for "${rawName}" deleted`)
    } else if (targetJob) {
      const targetIdx = gridRows.findIndex(r => r.id === targetJob.id)
      if (targetIdx >= 0) {
        const bInfo = staffBlockInfoMap.get(targetJob.id)
        const bStart = targetIdx - (bInfo?.blockRowIdx ?? 0)
        const bCount = bInfo?.rowCount ?? 3
        updated = gridRows.filter((_, i) => i < bStart || i >= bStart + bCount)
      } else {
        updated = gridRows.filter(r => r.id !== targetJob.id)
      }
      showToast('✓ Blank staff block (3 rows) deleted')
    } else {
      updated = gridRows
    }

    pushState(updated.length > 0 ? updated : ensureThreeRowsPerStaff([], effectiveTargetDate))
    setActiveCell(null)
    setContextMenu(null)
  }

  // Delete Selected Row (Preserves 3 fixed rows per cleaner)
  const handleDeleteRow = (idx: number) => {
    const target = gridRows[idx]
    if (!target) return
    const staffKey = (target.staff_name || '').trim().toLowerCase()
    const staffRows = gridRows.filter(r => (r.staff_name || '').trim().toLowerCase() === staffKey)

    if (staffRows.length > 3) {
      // If cleaner has more than 3 rows, remove this extra row to shrink block
      const updated = gridRows.filter((_, i) => i !== idx)
      pushState(updated)
      if (activeCell?.rowIdx === idx) setActiveCell(null)
      showToast(`✓ Extra row removed from ${target.staff_name || 'Staff'}`)
    } else {
      // If cleaner has 3 rows or fewer, clear this row's contents
      const updated = [...gridRows]
      updated[idx] = {
        ...target,
        start_time: '',
        end_time: '',
        duty_hours: 0,
        ot_hours: 0,
        address: '',
        area: '',
        material: 'No',
        charges: 0,
        received: 0,
        payment_mode: 'Cash',
        remarks: ''
      }
      pushState(updated)
      showToast(`✓ Shift row cleared (maintains 3 fixed rows for ${target.staff_name || 'cleaner'})`)
    }
    setContextMenu(null)
  }

  // Clear Row Contents
  const handleClearRow = (idx: number) => {
    const target = gridRows[idx]
    if (!target) return
    const updated = [...gridRows]
    updated[idx] = {
      ...target,
      start_time: '—',
      end_time: '—',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      charges: 0,
      received: 0,
      remarks: ''
    }
    pushState(updated)
    setContextMenu(null)
    showToast(`Row #${idx + 1} cleared`)
  }

  /** R-SHEET-01: true (and an error shown) when the colour is already on another row of that date, outside the team */
  const refuseUsedColor = (targetIds: string[], paletteKey: string): boolean => {
    const clash = rowColorConflict(gridRows, targetIds, paletteKey, r => projectKeyOf(r, gridRows))
    if (!clash) return false
    const name = BLOCK_PALETTES[paletteKey]?.name || ROW_COLOR_PRESETS.find(p => p.id === paletteKey)?.label || paletteKey
    notify.error(`Colour "${name}" is already used by ${clash.staff_name?.trim() || 'another row'}${clash.address ? ` (${cleanAddressDisplay(clash.address)})` : ''}. Each row needs its own colour — only a team job shares one.`)
    return true
  }

  // ── Change Staff Block Color (Block-isolated: applies row_color directly across all rows of that block) ──
  const setBlockColor = (targetJob: DailyJob, rowIdx: number, paletteKey: string) => {
    const bInfo = staffBlockInfoMap.get(targetJob.id)
    const blockStartIndex = Math.max(0, rowIdx - (bInfo?.blockRowIdx ?? 0))
    const blockRowCount = bInfo?.rowCount ?? 3

    const updated = [...gridRows]
    // R-SHEET-01: a colour already used by another row (not the same team) cannot be chosen
    const blockIds = updated.slice(blockStartIndex, blockStartIndex + blockRowCount).map(r => r.id)
    if (refuseUsedColor(blockIds, paletteKey)) return
    for (let i = 0; i < blockRowCount; i++) {
      const idx = blockStartIndex + i
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], row_color: paletteKey }
      }
    }
    pushState(updated)
    setColorPickerCleaner(null)
    setContextMenu(null)

    const staffLabel = targetJob.staff_name?.trim() || 'Staff Block'
    showToast(`✓ Block color for "${staffLabel}" set to ${BLOCK_PALETTES[paletteKey]?.name || paletteKey}`)
  }

  // ── Reset Block Color (Block-isolated: clears row_color on all rows of that block) ──
  const resetBlockColor = (targetJob: DailyJob, rowIdx: number) => {
    const bInfo = staffBlockInfoMap.get(targetJob.id)
    const blockStartIndex = Math.max(0, rowIdx - (bInfo?.blockRowIdx ?? 0))
    const blockRowCount = bInfo?.rowCount ?? 3

    const updated = [...gridRows]
    for (let i = 0; i < blockRowCount; i++) {
      const idx = blockStartIndex + i
      if (updated[idx]) {
        const next = { ...updated[idx] }
        delete next.row_color
        updated[idx] = next
      }
    }
    if (targetJob.staff_name?.trim()) {
      const key = targetJob.staff_name.trim().toLowerCase()
      if (cleanerColors[key]) {
        const nextColors = { ...cleanerColors }
        delete nextColors[key]
        setCleanerColors(nextColors)
        safeSet('safaeewala_excel_cleaner_colors', nextColors)
      }
    }
    pushState(updated)
    setContextMenu(null)
    showToast(`Default color restored for ${targetJob.staff_name?.trim() || 'Staff Block'}`)
  }

  // ── Set Single Row Color (Granular: Only this specific single row, NOT the whole block) ──
  const handleSetSingleRowColor = (rowIdx: number, paletteKey: string) => {
    const updated = [...gridRows]
    if (updated[rowIdx] && refuseUsedColor([updated[rowIdx].id], paletteKey)) return
    if (updated[rowIdx]) {
      updated[rowIdx] = { ...updated[rowIdx], row_color: paletteKey }
      pushState(updated)
    }
    setContextMenu(null)
    showToast(`✓ Color applied to Row #${rowIdx + 1} (${BLOCK_PALETTES[paletteKey]?.name || paletteKey})`)
  }

  const handleResetSingleRowColor = (rowIdx: number) => {
    const updated = [...gridRows]
    if (updated[rowIdx]) {
      const next = { ...updated[rowIdx] }
      delete next.row_color
      updated[rowIdx] = next
      pushState(updated)
    }
    setContextMenu(null)
    showToast(`✓ Reset color on Row #${rowIdx + 1}`)
  }

  // ── Set Single Cell Color (Granular: Only this specific cell, NOT the row or block) ──
  const handleSetCellColor = (rowId: string, colId: string, paletteKey: string) => {
    const cellKey = `${rowId}_${colId}`
    // UX-132: right-click inside a chosen block colours every cell of it
    const many = selCells()
    const rowIdxOf = gridRows.findIndex(r => r.id === rowId)
    if (many.length && isInSel(rowIdxOf, colId)) {
      setCellColors(prev => {
        const next = { ...prev }
        many.forEach(c => { const id = gridRows[c.rowIdx]?.id; if (id) next[`${id}_${c.colId}`] = paletteKey })
        safeSet('safaeewala_excel_cell_colors', next)
        return next
      })
      setContextMenu(null)
      showToast(`✓ Color applied to ${many.length} selected cells`)
      return
    }
    setCellColors(prev => {
      const next = { ...prev, [cellKey]: paletteKey }
      safeSet('safaeewala_excel_cell_colors', next)
      return next
    })
    setContextMenu(null)
    const colDef = columns.find(c => c.id === colId)
    showToast(`✓ Color applied to this cell only (${colDef?.label || colId})`)
  }

  const handleResetCellColor = (rowId: string, colId: string) => {
    const cellKey = `${rowId}_${colId}`
    const many = selCells()
    if (many.length && isInSel(gridRows.findIndex(r => r.id === rowId), colId)) {
      setCellColors(prev => {
        const next = { ...prev }
        many.forEach(c => { const id = gridRows[c.rowIdx]?.id; if (id) delete next[`${id}_${c.colId}`] })
        safeSet('safaeewala_excel_cell_colors', next)
        return next
      })
      setContextMenu(null)
      showToast(`✓ Reset color on ${many.length} selected cells`)
      return
    }
    setCellColors(prev => {
      const next = { ...prev }
      delete next[cellKey]
      safeSet('safaeewala_excel_cell_colors', next)
      return next
    })
    setContextMenu(null)
    showToast(`✓ Reset color on this cell`)
  }

  // ── Column Header Context Menu (Click / Right-click on column header after Staff changes whole row color) ──
  const handleColumnHeaderContextMenu = (e: React.MouseEvent, colId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const targetIdx = activeCell ? activeCell.rowIdx : 0
    const targetJob = gridRows[targetIdx] || gridRows[0]
    if (!targetJob) return

    if (colId === 'staff_name') {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        rowIdx: targetIdx,
        job: targetJob,
        colId: 'staff_name',
      })
    } else {
      // Rule: Clicking / right-clicking on column header after Staff applies color to the WHOLE ROW
      setColorTargetScope('row')
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        rowIdx: targetIdx,
        job: targetJob,
        colId,
      })
    }
  }

  // ── Date Preset Selection Handler ──
  const handleSelectDatePreset = (presetKey: ExcelDatePresetKey) => {
    setActiveDatePreset(presetKey)
    setShowDatePresetDropdown(false)

    const today = todayDubai()
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()

    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    if (presetKey === 'all') {
      setDateFilterMode('all')
      setRangeStart('')
      setRangeEnd('')
      showToast('Viewing All Records')
      return
    }

    if (presetKey === 'today') {
      setDateFilterMode('single')
      setRangeStart(today)
      setRangeEnd(today)
      setSelectedDate(today)
      setSearchParams({ date: today }, { replace: true })
      showToast('Date set to Today')
    } else if (presetKey === 'yesterday') {
      const yest = addDaysToYMD(today, -1)
      setDateFilterMode('single')
      setRangeStart(yest)
      setRangeEnd(yest)
      setSelectedDate(yest)
      setSearchParams({ date: yest }, { replace: true })
      showToast('Date set to Yesterday')
    } else {
      setDateFilterMode('range')
      if (presetKey === 'last_month') {
        const start = iso(new Date(y, m - 1, 1))
        const end = iso(new Date(y, m, 0))
        setRangeStart(start)
        setRangeEnd(end)
        showToast('Date range set to Last Month')
      } else if (presetKey === 'last_3_months') {
        const start = iso(new Date(y, m - 2, 1))
        setRangeStart(start)
        setRangeEnd(today)
        showToast('Date range set to Last 3 Months')
      } else if (presetKey === 'last_6_months') {
        const start = iso(new Date(y, m - 5, 1))
        setRangeStart(start)
        setRangeEnd(today)
        showToast('Date range set to Last 6 Months')
      } else if (presetKey === 'last_year') {
        const start = iso(new Date(y - 1, m, now.getDate()))
        setRangeStart(start)
        setRangeEnd(today)
        showToast('Date range set to Last Year')
      } else if (presetKey === 'two_years') {
        const start = iso(new Date(y - 2, m, now.getDate()))
        setRangeStart(start)
        setRangeEnd(today)
        showToast('Date range set to 2 Years')
      } else if (presetKey === 'custom') {
        if (!rangeStart) setRangeStart(today)
        if (!rangeEnd) setRangeEnd(today)
        showToast('Custom Range selected')
      }
    }
  }

  // ── Set Column Color (Granular: Only this specific column across the sheet) ──
  const handleSetColumnColor = (colId: string, paletteKey: string) => {
    setColumnColors(prev => {
      const next = { ...prev, [colId]: paletteKey }
      safeSet('safaeewala_excel_column_colors', next)
      return next
    })
    setContextMenu(null)
    const colDef = columns.find(c => c.id === colId)
    showToast(`✓ Color applied to Column "${colDef?.label || colId}" (${BLOCK_PALETTES[paletteKey]?.name || paletteKey})`)
  }

  const handleResetColumnColor = (colId: string) => {
    setColumnColors(prev => {
      const next = { ...prev }
      delete next[colId]
      safeSet('safaeewala_excel_column_colors', next)
      return next
    })
    setContextMenu(null)
    const colDef = columns.find(c => c.id === colId)
    showToast(`✓ Reset color on Column "${colDef?.label || colId}"`)
  }

  // ── Change Cleaner Block Color (Persisted & Forces Immediate Grid Re-render) ──
  const setCleanerColor = (cleanerName: string, paletteKey: string) => {
    const cleanStaff = (cleanerName || 'Unassigned Staff').trim()
    const key = cleanStaff.toLowerCase()
    const updated = { ...cleanerColors, [key]: paletteKey }
    setCleanerColors(updated)
    safeSet('safaeewala_excel_cleaner_colors', updated)
    setColorPickerCleaner(null)
    setContextMenu(null)

    // Force grid rows to re-render immediately with the updated solid block color
    setGridRows(prev => [...prev])
    showToast(`✓ Block color for "${cleanStaff}" set to ${BLOCK_PALETTES[paletteKey]?.name || paletteKey}`)
  }

  // Get palette for a cleaner
  const getCleanerPalette = (cleanerName: string, idx: number, rowColor?: string): BlockPalette => {
    if (rowColor) {
      if (BLOCK_PALETTES[rowColor]) return BLOCK_PALETTES[rowColor]
      if (rowColor.startsWith('#')) return makeHexPalette(rowColor)
    }
    const key = (cleanerName || '').trim().toLowerCase()
    const customKey = cleanerColors[key]
    if (customKey) {
      if (BLOCK_PALETTES[customKey]) return BLOCK_PALETTES[customKey]
      if (customKey.startsWith('#')) return makeHexPalette(customKey)
    }
    // Default deterministic assignment: Flat Grid Mode defaults to light colors
    const keyPool = viewMode === 'flat' ? LIGHT_PALETTE_KEYS : PALETTE_KEYS
    const paletteKey = keyPool[idx % keyPool.length]
    return BLOCK_PALETTES[paletteKey] || BLOCK_PALETTES.emerald
  }

  // Right-Click Context Menu Trigger (Carries specific colId for granular customization)
  const handleContextMenu = (e: React.MouseEvent, rowIdx: number, job: DailyJob, colId: string = 'staff_name') => {
    e.preventDefault()
    e.stopPropagation()
    const clickX = e.clientX
    const clickY = e.clientY
    // Keep context menu on screen with taller height for 20 solid colors options panel
    const menuWidth = 330
    const menuHeight = 600
    const posX = clickX + menuWidth > window.innerWidth ? Math.max(10, window.innerWidth - menuWidth - 15) : clickX
    const posY = clickY + menuHeight > window.innerHeight ? Math.max(10, window.innerHeight - menuHeight - 15) : clickY

    setActiveCell({ rowIdx, colId })
    setColorTargetScope(colId === 'staff_name' ? 'row' : 'cell')
    setContextMenu({
      x: posX,
      y: posY,
      rowIdx,
      job,
      colId,
    })
  }

  // Backup to Google Drive (via n8n Webhook or direct Google Drive)
  const handleBackupToDrive = async () => {
    const webhookUrl = getDriveWebhookUrl()
    if (!webhookUrl && !gdriveConfigured) {
      setShowDriveModal(true)
      return
    }

    try {
      setIsBackingUp(true)
      setDriveStatus('uploading')
      setDriveError('')

      const exportData = gridRows.map((r, i) => {
        const rowObj: Record<string, any> = { 'Row': i + 1 }
        columns.forEach(col => {
          let val: any = r[col.id as keyof DailyJob]
          if (col.id === 'pending') val = rowPending(r)
          if (col.id === 'advance') val = rowAdvance(r)
          if (col.id === 'charges_per_hour') val = chargesPerHour(r) || ''
          rowObj[col.label] = val !== undefined && val !== null ? val : ''
        })
        return rowObj
      })

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(exportData)
      XLSX.utils.book_append_sheet(wb, ws, `DailyJobSheet`)
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const filename = `DailyJobSheet_${selectedDate}.xlsx`

      if (webhookUrl) {
        const summary = {
          date: selectedDate,
          total_charges: totals.totalCharges,
          total_received: totals.totalReceived,
          total_pending: totals.totalPending,
          total_duty: totals.totalDuty,
          total_ot: totals.totalOT,
          jobs_count: gridRows.length,
          cleaners_count: cleanerGroups.length
        }

        const result = await sendDailySheetBackupViaWebhook({
          date: selectedDate,
          filename,
          blob,
          summary,
          jobs: gridRows,
          expenses: [],
          webhookUrl
        })

        if (result.driveUrl) setDriveLink(result.driveUrl)
        setDriveStatus('done')
        showToast('✓ Sheet backed up successfully to Google Drive!')
        return
      }

      if (gdriveConfigured) {
        let token = getAccessToken()
        if (!token) token = await authorizeGoogleDrive()
        const link = await uploadToDrive(blob, filename, token)
        setDriveLink(link)
        setDriveStatus('done')
        showToast('✓ Sheet uploaded successfully to Google Drive!')
        return
      }
    } catch (err: any) {
      setDriveError(err.message || 'Backup failed')
      setDriveStatus('error')
      showToast(`Backup error: ${err.message || 'Failed'}`)
    } finally {
      setIsBackingUp(false)
    }
  }

  // Save All — writes only rows added, edited or removed in this grid (AUD-49, UX-33).
  // Rows outside the grid are never touched; rows changed elsewhere since loading ask first.
  /** R-SYNC-14: 'auto' = the 3-second auto-save — it never asks a question; what needs the user waits for Save */
  const handleSaveAll = async (mode: 'manual' | 'auto' = 'manual') => {
    const auto = mode === 'auto'
    const rows = auto ? gridRows : commitCellEdit()
    const gridIds = new Set(rows.map(r => r.id))
    const added = rows.filter(r => !loadedSnapshot.has(r.id) && !isBlankNewRow(r))
    const edited = rows.filter(r => { const o = loadedSnapshot.get(r.id); return o && !sameJobRow(o, r) })
    const removed = Array.from(loadedSnapshot.values()).filter(o => !gridIds.has(o.id))
    if (added.length + edited.length + removed.length === 0) {
      if (auto) return
      setLoadedSnapshot(new Map(rows.map(r => [r.id, r]))) // nothing left to save — the button shows "Saved"
      showToast('Nothing to save')
      return
    }
    setAutoSaveBlocked(null)

    // A job with several cleaners is shown as one grid row per cleaner (ensureThreeRowsPerStaff).
    // Those rows are not jobs of their own: saving them one by one cut the other cleaners off the job
    // (lead row) or created a duplicate job on every save (other rows). They are folded back into their job.
    const splitOrigin = (r: DailyJob) => ((r as any)._isSplitShift ? String((r as any)._originalJobId || '') : '')
    const splitJobIds = new Set([...added, ...edited, ...removed].map(splitOrigin).filter(Boolean))
    const inTouchedSplit = (r: DailyJob) => splitJobIds.has(splitOrigin(r))
    const plainAdded = added.filter(r => !inTouchedSplit(r)) // a new team job (Add Job) is saved once, below
    // R-SYNC-17: a saved row whose details were all removed is deleted, not saved as an empty job
    const emptiedHere = (r: DailyJob) => isClearedRow(r) && !isClearedRow(loadedSnapshot.get(r.id) ?? r)
    const plainEdited = edited.filter(r => !inTouchedSplit(r) && !emptiedHere(r))
    const plainRemoved = [...removed, ...edited.filter(emptiedHere)].filter(r => !inTouchedSplit(r))

    // R-JOB-01: nothing is saved while a changed row double-books a cleaner (paste, fill down, …)
    const saveClash = findClashAmong(rows, [...added, ...edited.filter(r => timingChanged(loadedSnapshot.get(r.id), r))])
    if (saveClash) {
      if (auto) { setAutoSaveBlocked(`Not saved — time clash: ${clashMessage(saveClash)}`); return }
      showClash(saveClash)
      return
    }

    const live = new Map(dailyJobs.map(j => [j.id, j]))
    // R-SYNC-17: a deletion is never a conflict — the user removed the row on purpose
    const changedElsewhere = [
      ...plainEdited.filter(r => {
        const was = loadedRawRef.current.get(r.id) // R-SYNC-16: as saved, not the grid's per-cleaner row
        if (!was) return false // a row added in this sheet
        const now = live.get(r.id)
        return !now || !sameJobRow(was, now)
      }),
      // R-SYNC-18: only a saved team job can have been deleted elsewhere — a new one from Add Job is just not saved yet
      ...teamJobsDeletedElsewhere(splitJobIds, loadedRawRef.current, live, id => rows.some(r => splitOrigin(r) === id && !isClearedRow(r))).map(id => ({ id })),
    ]
    if (changedElsewhere.length > 0) {
      if (auto) { setAutoSaveBlocked(`Not saved — ${changedElsewhere.length} row(s) changed on another screen. Press Save to choose.`); return }
      const ok = await confirmAsync({
        title: 'Changed on another screen',
        message: `${changedElsewhere.length} row(s) were changed or deleted somewhere else after you opened this sheet. Save your version over them?`,
        confirmLabel: 'Save my version',
        cancelLabel: 'Cancel',
      })
      if (!ok) return
    }

    const payload = (row: DailyJob) => {
      const mcInfo = getMultiCleanerPaymentInfo(row, rows)
      const isSec = Boolean(mcInfo?.isSecondary)
      let savedTeam = ''
      if (mcInfo?.isMultiCleaner && mcInfo.teamRef) {
        savedTeam = mcInfo.teamRef
      } else if (row.team_name && row.team_name.trim() && row.team_name.trim().toLowerCase() !== 'project team') {
        savedTeam = row.team_name.trim()
      }

      return {
        date: row.date || selectedDate,
        staff_name: row.staff_name,
        team_name: savedTeam,
        start_time: row.start_time,
        end_time: row.end_time,
        duty_hours: cleanNum(row.duty_hours),
        ot_hours: cleanNum(row.ot_hours),
        address: row.address,
        area: row.area,
        charges: isSec ? 0 : cleanNum(row.charges),
        received: isSec ? 0 : cleanNum(row.received),
        payment_mode: isSec ? ('Above' as any) : row.payment_mode,
        charge_split: row.charge_split, // R-PAY-05
        row_color: row.row_color,           // R-SYNC-11
        charges_per_hour: (cleanNum(row.charges_per_hour) || null) as unknown as number, // UX-138: null clears it
        is_overtime: false, // DEC-015: OT is automatic, this old flag is not used
        material: row.material,
        service: row.service,
        remarks: row.remarks,
      }
    }

    /** One saved job from its per-cleaner rows: cleaners joined, shared fields from the row that changed */
    const splitJobPayload = (jobId: string) => {
      // R-SYNC-17: a cleaner whose row was emptied leaves the team job; all emptied → the job is deleted
      const now = rows.filter(r => splitOrigin(r) === jobId && !isClearedRow(r))
      if (now.length === 0) return null
      const before = Array.from(loadedSnapshot.values()).filter(r => splitOrigin(r) === jobId)
      const lead = now.find(r => (r as any)._isPrimaryCleaner) || before.find(r => (r as any)._isPrimaryCleaner) || now[0]
      const shared = ['start_time', 'end_time', 'duty_hours', 'ot_hours', 'address', 'area', 'material', 'remarks', 'service'] as const
      const value = <K extends (typeof shared)[number]>(k: K): DailyJob[K] => {
        const changed = now.find(r => { const b = before.find(x => x.id === r.id); return b && String(b[k] ?? '') !== String(r[k] ?? '') })
        return (changed ?? now.find(r => (r as any)._isPrimaryCleaner) ?? now[0])[k]
      }
      const names = now.map(r => (r.staff_name || '').trim()).filter(Boolean)
      // R-PAY-05 Split Mode: each cleaner's row is their entry; the job holds the totals
      const split = now.some(r => isSplitJob(r))
        ? now.filter(r => (r.staff_name || '').trim()).map(r => ({
            cleaner: (r.staff_name || '').trim(),
            charges: cleanNum(r.charges),
            received: cleanNum(r.received),
            payment_mode: String(r.payment_mode && r.payment_mode !== ('Above' as DailyJob['payment_mode']) ? r.payment_mode : lead.payment_mode || 'Cash'),
          }))
        : null
      const sum = split ? splitTotals(split) : null
      return {
        date: lead.date || selectedDate,
        staff_name: names.join(', '),
        team_name: names.length > 1 ? String((lead as any)._teamReference || lead.team_name || '') : '',
        start_time: value('start_time'),
        end_time: value('end_time'),
        duty_hours: cleanNum(value('duty_hours')),
        ot_hours: cleanNum(value('ot_hours')),
        address: value('address'),
        area: value('area'),
        material: value('material'),
        remarks: value('remarks'),
        service: value('service'),
        charges: sum ? sum.charges : cleanNum(lead.charges), // Lump Sum: the lead row holds the money of the whole team
        received: sum ? sum.received : cleanNum(lead.received),
        payment_mode: (sum ? sum.payment_mode : lead.payment_mode) as DailyJob['payment_mode'],
        charge_split: split ?? lead.charge_split, // R-PAY-05: each cleaner's money of the team job
        row_color: lead.row_color,           // R-SYNC-11
        charges_per_hour: (cleanNum(lead.charges_per_hour) || null) as unknown as number, // UX-138: null clears it
        is_overtime: false,
      }
    }

    reloadAfterSaveRef.current = true
    plainRemoved.forEach(r => { if (live.has(r.id)) deleteDailyJob(r.id) })
    plainEdited.forEach(r => {
      if (live.has(r.id)) updateDailyJob(r.id, payload(r))
      else addDailyJob(payload(r)) // deleted elsewhere — the user chose to keep their version
    })
    splitJobIds.forEach(jobId => {
      const p = splitJobPayload(jobId)
      if (!p) { if (live.has(jobId)) deleteDailyJob(jobId); return } // every cleaner row removed
      if (live.has(jobId)) updateDailyJob(jobId, p)
      else addDailyJob(p)
    })
    plainAdded.forEach(r => addDailyJob(payload(r)))
    // Only rows that were already gone were "saved": no job changes, so no reload comes — settle here
    const wroteSomething = plainAdded.length + plainEdited.length + splitJobIds.size + plainRemoved.filter(r => live.has(r.id)).length > 0
    if (!wroteSomething) {
      reloadAfterSaveRef.current = false
      setLoadedSnapshot(new Map(rows.map(r => [r.id, r])))
    }

    try { localStorage.removeItem(DRAFT_PREFIX + periodKey) } catch { /* ignore */ }
    setDraftOffer(null)
    setRemoteConflict(false)
    const emptied = edited.filter(emptiedHere).length
    const parts = [added.length && `${added.length} added`, edited.length - emptied && `${edited.length - emptied} updated`, removed.length + emptied && `${removed.length + emptied} deleted`].filter(Boolean)
    showToast(`✓ ${auto ? 'Auto-saved' : 'Saved'}: ${parts.join(', ')}`)
  }

  // UX-123: leaving the sheet (sidebar, another screen) saves what is waiting, without asking
  const saveOnLeaveRef = useRef<() => void>(() => {})
  useEffect(() => { saveOnLeaveRef.current = () => { if (latest.current.hasUnsavedChanges) void handleSaveAll('auto') } })
  useEffect(() => () => saveOnLeaveRef.current(), [])

  // R-SYNC-14: auto-save 3 seconds after the last change (not while a cell is being typed in or the Add Job form is open)
  const saveRef = useRef(handleSaveAll)
  useEffect(() => { saveRef.current = handleSaveAll })
  useEffect(() => {
    if (!hasUnsavedChanges || editingCell || showAddJobModal) return
    const t = window.setTimeout(() => { void saveRef.current('auto') }, 3000)
    return () => window.clearTimeout(t)
  }, [gridRows, hasUnsavedChanges, editingCell, showAddJobModal])

  // Keyboard: Undo/Redo/Save/Esc + Excel keys (arrows, Tab, Enter/F2, Delete, Ctrl+D, type to edit) — UX-36.
  // The listener reads the latest handler through a ref, so Save never works on stale data.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  const clipboardRef = useRef<{ copy: (e: ClipboardEvent) => void; paste: (e: ClipboardEvent) => void }>({ copy: () => {}, paste: () => {} })
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    keyHandlerRef.current = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return }
      if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); handleRedo(); return }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void handleSaveAll(); return }
      if (e.key === 'Escape') {
        setContextMenu(null)
        setActiveMenu(null)
        setColorPickerCleaner(null)
        if (editingCell) setEditingCell(null)
        return
      }
      // Grid keys only when a cell is selected and nothing else has focus
      if (editingCell || !activeCell || isTyping(e.target)) return
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); fillDown(); return }
      // UX-142: Alt + Down opens the dropdown of the selected cell (like Excel); then Down walks the list
      if (e.altKey && e.key === 'ArrowDown' && DROPDOWN_COLS.has(activeCell.colId)) { e.preventDefault(); handleCellDoubleClick(activeCell.rowIdx, activeCell.colId); return }
      if (mod || e.altKey) return
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
      if (moves[e.key] && e.shiftKey) { // UX-132: Shift + arrows grow the selection
        e.preventDefault()
        const order = visibleOrder()
        const colIds = columns.map(c => c.id as string)
        const end = selRange?.b || activeCell
        const pos = Math.min(order.length - 1, Math.max(0, (rowPosOf.get(end.rowIdx) ?? 0) + moves[e.key][0]))
        const ci = Math.min(colIds.length - 1, Math.max(0, colIds.indexOf(end.colId) + moves[e.key][1]))
        setSelRange({ a: selRange?.a || activeCell, b: { rowIdx: order[pos], colId: colIds[ci] } })
        return
      }
      if (moves[e.key]) { e.preventDefault(); setSelRange(null); moveActive(...moves[e.key]); return }
      if (e.key === 'Tab') { e.preventDefault(); moveActive(0, e.shiftKey ? -1 : 1); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearActiveCell(); return }
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); handleCellDoubleClick(activeCell.rowIdx, activeCell.colId); return }
      // Typing a character starts editing with that character, like Excel
      if (e.key.length === 1 && !READ_ONLY_COLS.has(activeCell.colId)) {
        const col = columns.find(c => c.id === activeCell.colId)
        if (!col || col.type === 'select' || col.type === 'date') return
        e.preventDefault()
        setEditingCell({ rowIdx: activeCell.rowIdx, colId: activeCell.colId, tempValue: e.key })
      }
    }
    clipboardRef.current = {
      copy: (e: ClipboardEvent) => {
        if (editingCell || !activeCell || isTyping(e.target)) return
        const many = selCells()
        if (many.length && selBounds) {
          const width = selBounds.c1 - selBounds.c0 + 1
          const val = (c: CellRef) => {
            const row = gridRows[c.rowIdx]
            const v = c.colId === 'pending' ? rowPending(row) : c.colId === 'advance' ? rowAdvance(row) : c.colId === 'charges_per_hour' ? chargesPerHour(row) : row?.[c.colId as keyof DailyJob]
            return v == null ? '' : String(v)
          }
          const lines: string[] = []
          for (let i = 0; i < many.length; i += width) lines.push(many.slice(i, i + width).map(val).join('\t'))
          e.clipboardData?.setData('text/plain', lines.join('\n'))
          e.preventDefault()
          return
        }
        const v = activeCell.colId === 'pending'
          ? rowPending(gridRows[activeCell.rowIdx])
          : activeCell.colId === 'advance'
          ? rowAdvance(gridRows[activeCell.rowIdx])
          : activeCell.colId === 'charges_per_hour'
          ? chargesPerHour(gridRows[activeCell.rowIdx])
          : gridRows[activeCell.rowIdx]?.[activeCell.colId as keyof DailyJob]
        e.clipboardData?.setData('text/plain', v == null ? '' : String(v))
        e.preventDefault()
      },
      paste: (e: ClipboardEvent) => {
        if (editingCell || !activeCell || isTyping(e.target)) return
        const text = e.clipboardData?.getData('text/plain') || ''
        if (!text) return
        e.preventDefault()
        pasteBlock(text)
      },
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e)
    const onCopy = (e: ClipboardEvent) => clipboardRef.current.copy(e)
    const onPaste = (e: ClipboardEvent) => clipboardRef.current.paste(e)
    window.addEventListener('keydown', onKey)
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
    }
  }, [])

  /** Throw away the grid's edits and load the latest saved jobs */
  const reloadFromSaved = async () => {
    if (hasUnsavedChanges) {
      const ok = await confirmAsync({ title: 'Discard edits?', message: `Discard your ${pendingChanges.count} unsaved change(s) and load the latest saved data?`, confirmLabel: 'Discard & reload', tone: 'danger' })
      if (!ok) return
    }
    const rows: DailyJob[] = JSON.parse(JSON.stringify(periodJobs))
    setGridRows(rows)
    setLoadedSnapshot(new Map(rows.map(r => [r.id, r])))
    setHistory([])
    setFuture([])
    setRemoteConflict(false)
    setDraftOffer(null)
    try { localStorage.removeItem(DRAFT_PREFIX + periodKey) } catch { /* ignore */ }
  }

  // Export Spreadsheet to Excel (.xlsx) with dynamic column order
  const handleExportXLSX = () => {
    const exportData = gridRows.map((r, i) => {
      const rowObj: Record<string, any> = { 'Row': i + 1 }
      const mcInfo = getMultiCleanerPaymentInfo(r, gridRows)
      columns.forEach(col => {
        let val: any = r[col.id as keyof DailyJob]
        if (col.id === 'team_name') {
          if (mcInfo?.isSecondary) val = mcInfo.teamRef
          else if (mcInfo?.isPrimary && mcInfo.isMultiCleaner) val = `${mcInfo.teamRef} (Lead)`
          else val = (r.team_name && r.team_name.trim().toLowerCase() !== 'project team') ? r.team_name : ''
        } else if (col.id === 'charges') {
          val = refMoney(mcInfo, r) ? memberChargesLabel(r, mcInfo!.teamRef) : r.charges
        } else if (col.id === 'received') {
          val = refMoney(mcInfo, r) ? memberReceivedLabel(r, mcInfo!.primaryCleaner, employees) : r.received
        } else if (col.id === 'pending') {
          val = refMoney(mcInfo, r) ? 'Nil' : rowPending(r)
        } else if (col.id === 'advance') {
          val = refMoney(mcInfo, r) ? '' : rowAdvance(r) || ''
        } else if (col.id === 'charges_per_hour') {
          val = refMoney(mcInfo, r) ? '' : chargesPerHour(r) || ''
        } else if (col.id === 'payment_mode') {
          val = refMoney(mcInfo, r) ? memberModeLabel(r) : r.payment_mode
        }
        rowObj[col.label] = val !== undefined && val !== null ? val : ''
      })
      return rowObj
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `JobSheet_${selectedDate}`)
    XLSX.writeFile(wb, `DailyJobSheet_Excel_${selectedDate}.xlsx`)
    showToast('Spreadsheet downloaded as .xlsx')
  }

  // Export CSV with dynamic column order
  const handleExportCSV = () => {
    const exportData = gridRows.map((r, i) => {
      const rowObj: Record<string, any> = { 'Row': i + 1 }
      const mcInfo = getMultiCleanerPaymentInfo(r, gridRows)
      columns.forEach(col => {
        let val: any = r[col.id as keyof DailyJob]
        if (col.id === 'team_name') {
          if (mcInfo?.isSecondary) val = mcInfo.teamRef
          else if (mcInfo?.isPrimary && mcInfo.isMultiCleaner) val = `${mcInfo.teamRef} (Lead)`
          else val = (r.team_name && r.team_name.trim().toLowerCase() !== 'project team') ? r.team_name : ''
        } else if (col.id === 'charges') {
          val = refMoney(mcInfo, r) ? memberChargesLabel(r, mcInfo!.teamRef) : r.charges
        } else if (col.id === 'received') {
          val = refMoney(mcInfo, r) ? memberReceivedLabel(r, mcInfo!.primaryCleaner, employees) : r.received
        } else if (col.id === 'pending') {
          val = refMoney(mcInfo, r) ? 'Nil' : rowPending(r)
        } else if (col.id === 'advance') {
          val = refMoney(mcInfo, r) ? '' : rowAdvance(r) || ''
        } else if (col.id === 'charges_per_hour') {
          val = refMoney(mcInfo, r) ? '' : chargesPerHour(r) || ''
        } else if (col.id === 'payment_mode') {
          val = refMoney(mcInfo, r) ? memberModeLabel(r) : r.payment_mode
        }
        rowObj[col.label] = val !== undefined && val !== null ? val : ''
      })
      return rowObj
    })
    const ws = XLSX.utils.json_to_sheet(exportData)
    const csv = XLSX.utils.sheet_to_csv(ws)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `DailyJobSheet_${selectedDate}.csv`
    link.click()
    showToast('Spreadsheet downloaded as .csv')
  }

  // Filter Counts for Header Quick Filter Tabs
  const filterCounts = useMemo(() => {
    let monthly = 0, cash = 0, online = 0, pending = 0
    const projects = new Set<string>() // UX-66: one project per location and date, however many cleaners
    for (const r of gridRows) {
      if (r.payment_mode === 'Monthly') monthly++
      else if (r.payment_mode === 'Cash') cash++
      else if (r.payment_mode === 'Online') online++
      if (r.payment_mode === 'Pending' || rowPending(r) > 0) pending++

      const key = projectKeyOf(r, gridRows)
      if (key) projects.add(key)
    }
    return { all: gridRows.length, monthly, cash, online, pending, project: projects.size }
  }, [gridRows, pendingCtx])

  // Filtered rows for search and payment mode tabs
  const [renderLimit, setRenderLimit] = useState(RENDER_PAGE)
  const filteredGridRows = useMemo(() => {
    let list = gridRows
    const isBlankRow = (r: DailyJob) => !String(r.staff_name || '').trim() && !String(r.address || '').trim()

    if (paymentModeFilter === 'Monthly') {
      list = list.filter(r => r.payment_mode === 'Monthly' || (isBlankRow(r) && !r.payment_mode))
    } else if (paymentModeFilter === 'Cash') {
      list = list.filter(r => r.payment_mode === 'Cash' || (isBlankRow(r) && !r.payment_mode))
    } else if (paymentModeFilter === 'Online') {
      list = list.filter(r => r.payment_mode === 'Online' || (isBlankRow(r) && !r.payment_mode))
    } else if (paymentModeFilter === 'Pending') {
      list = list.filter(r => r.payment_mode === 'Pending' || rowPending(r) > 0 || (isBlankRow(r) && !r.payment_mode))
    } else if (paymentModeFilter === 'Project') {
      // Filter only jobs that genuinely belong to a project / multi-cleaner team, or blank rows created in Project view
      const projectRows = list.filter(r => {
        const mc = getMultiCleanerPaymentInfo(r, gridRows)
        return Boolean(
          mc?.isMultiCleaner ||
          (r.team_name && r.team_name.trim() && r.team_name.trim().toLowerCase() !== 'project team') ||
          (isBlankRow(r) && ((r as any)._isProjectViewRow || r.team_name))
        )
      })

      // Group team-wise: Leader on top, other team members listed directly below
      // Scoped strictly by Address + Team Reference so cleaners at different addresses NEVER merge!
      const teamMap = new Map<string, { leaders: DailyJob[]; members: DailyJob[] }>()
      projectRows.forEach(r => {
        const mc = getMultiCleanerPaymentInfo(r, gridRows)
        const cleanAddr = cleanAddressDisplay(r.address)
        const hasSpecificAddr = cleanAddr && cleanAddr !== '—' && !isGenericAddress(r.address)

        let teamKey = ''
        const pKey = projectKeyOf(r, gridRows)
        if (pKey && hasSpecificAddr) {
          teamKey = `${pKey}` // UX-66: one group per location and date, whatever the team name
        } else if (mc?.teamRef) {
          teamKey = mc.teamRef
        } else if (r.team_name && r.team_name.trim() && r.team_name.trim().toLowerCase() !== 'project team') {
          teamKey = r.team_name.trim()
        } else {
          teamKey = (r.staff_name && r.staff_name.trim()) ? `${r.staff_name.trim()}'s Shift` : `Shift #${r.id.slice(-6)}`
        }

        if (!teamMap.has(teamKey)) {
          teamMap.set(teamKey, { leaders: [], members: [] })
        }
        const group = teamMap.get(teamKey)!
        if (mc?.isPrimary || !mc?.isSecondary) {
          group.leaders.push(r)
        } else {
          group.members.push(r)
        }
      })

      const organized: DailyJob[] = []
      teamMap.forEach(group => {
        // Leader top par
        if (group.leaders.length > 0) {
          organized.push(...group.leaders)
        }
        // Baki team members uskay neeche
        organized.push(...group.members)
      })
      list = organized
    } else if (soloAtBottom) {
      // UX-61: team cleaners first, then cleaners who only have solo jobs. A cleaner's rows stay together.
      const blocks = new Map<string, DailyJob[]>()
      list.forEach(r => {
        const k = (r.staff_name || '').trim().toLowerCase() || r.id
        blocks.set(k, [...(blocks.get(k) || []), r])
      })
      const isTeam = (rows: DailyJob[]) => rows.some(r => getMultiCleanerPaymentInfo(r, gridRows)?.isMultiCleaner)
      const all = Array.from(blocks.values())
      list = [...all.filter(isTeam), ...all.filter(b => !isTeam(b))].flat()
    }
    if (!filterSearch.trim()) return list
    const q = filterSearch.toLowerCase()
    return list.filter(r =>
      (r.staff_name || '').toLowerCase().includes(q) ||
      (r.address || '').toLowerCase().includes(q) ||
      (r.area || '').toLowerCase().includes(q) ||
      (r.payment_mode || '').toLowerCase().includes(q) ||
      (r.remarks || '').toLowerCase().includes(q)
    )
  }, [gridRows, paymentModeFilter, filterSearch, pendingCtx, soloAtBottom])
  const visibleGridRows = useMemo(() => filteredGridRows.slice(0, renderLimit), [filteredGridRows, renderLimit])
  /** UX-132: position of each visible row (gridRows index → screen position) */
  const rowPosOf = useMemo(() => {
    const m = new Map<number, number>()
    visibleGridRows.forEach((r, pos) => { const i = gridRows.findIndex(g => g.id === r.id); if (i >= 0) m.set(i, pos) })
    return m
  }, [visibleGridRows, gridRows])
  const selBounds = useMemo(() => {
    if (!selRange) return null
    const colIds = columns.map(c => c.id as string)
    const ra = rowPosOf.get(selRange.a.rowIdx), rb = rowPosOf.get(selRange.b.rowIdx)
    const ca = colIds.indexOf(selRange.a.colId), cb = colIds.indexOf(selRange.b.colId)
    if (ra === undefined || rb === undefined || ca < 0 || cb < 0) return null
    if (ra === rb && ca === cb) return null // one cell = just the active cell
    return { r0: Math.min(ra, rb), r1: Math.max(ra, rb), c0: Math.min(ca, cb), c1: Math.max(ca, cb) }
  }, [selRange, rowPosOf, columns])

  // UX-62: once the payment row is on screen, scroll to it and flash it
  useEffect(() => {
    if (!jumpTargetId) return
    const el = document.querySelector(`tr[data-row-id="${CSS.escape(jumpTargetId)}"]`)
    if (!el) return // not rendered yet — this runs again when the rows change
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const id = jumpTargetId
    const raf = requestAnimationFrame(() => { setJumpTargetId(null); setFlashRowId(id) })
    return () => cancelAnimationFrame(raf)
  }, [jumpTargetId, visibleGridRows])
  useEffect(() => {
    if (!flashRowId) return
    const t = window.setTimeout(() => setFlashRowId(null), 2200)
    return () => window.clearTimeout(t)
  }, [flashRowId])

  // R-JOB-01: every cleaner booked twice at the same time in this sheet — saved or not — shown at once
  const gridClashes = useMemo(() => findAllClashes(gridRows), [gridRows])
  const clashRowIds = useMemo(() => new Set(gridClashes.flatMap(c => [String(c.a.id), String(c.b.id)])), [gridClashes])
  // UX-86: issues of a row (live clash, sync note) shown as a flag next to the cleaner's name
  const rowClash = useMemo(() => {
    const map = new Map<string, StaffClash>()
    // each row points to the other job of the pair
    gridClashes.forEach(c => { map.set(String(c.a.id), { staff: c.staff, job: c.b }); map.set(String(c.b.id), { staff: c.staff, job: c.a }) })
    return map
  }, [gridClashes])
  const flagsOf = (rows: DailyJob[]): JobFlag[] => rows.flatMap(r => jobFlags(r, rowClash.get(String(r.id))))
  const clearFlag = (flag: JobFlag) => {
    const jobOf = (r: DailyJob) => String((r as { _originalJobId?: string })._originalJobId || r.id)
    const jobId = jobOf(flag.row)
    pushState(gridRows.map(r => (jobOf(r) === jobId ? { ...r, remarks: splitSyncNote(r.remarks).text } : r)))
    showToast('✓ Flag cleared · Save to keep the change')
  }
  const [showAllClashes, setShowAllClashes] = useState(false)

  // Summary Totals
  const totals = useMemo(() => {
    const totalCharges = gridRows.reduce((s, r) => s + cleanNum(r.charges), 0)
    const totalReceived = gridRows.reduce((s, r) => s + cleanNum(r.received), 0)
    // Per-row dues: an overpaid row must not hide another row's due
    const totalPending = gridRows.reduce((s, r) => s + rowPending(r), 0)
    const totalAdvance = gridRows.reduce((s, r) => s + rowAdvance(r), 0) // UX-72
    const totalDuty = Math.round(gridRows.reduce((s, r) => s + cleanNum(r.duty_hours), 0) * 10) / 10
    const totalOT = Math.round(gridRows.reduce((s, r) => s + cleanNum(r.ot_hours), 0) * 10) / 10
    return { totalCharges, totalReceived, totalPending, totalAdvance, totalDuty, totalOT }
  }, [gridRows, pendingCtx])

  // ── Pre-calculate Staff Block Info (3 fixed rows, rowSpan & boundaries) ──
  const staffBlockInfoMap = useMemo(() => {
    const map = new Map<string, {
      isFirst: boolean
      isLast: boolean
      rowCount: number
      blockRowIdx: number
      staffName: string
      lastRowIdx: number
    }>()

    let currentStaffKey: string | null = null
    let blockRows: { row: DailyJob; globalIdx: number }[] = []

    const flush = () => {
      if (blockRows.length === 0) return
      const count = blockRows.length
      const lastIdx = blockRows[blockRows.length - 1].globalIdx
      const staffName = blockRows[0].row.staff_name || ''
      blockRows.forEach((item, bIdx) => {
        map.set(item.row.id, {
          isFirst: bIdx === 0,
          isLast: bIdx === count - 1,
          rowCount: count,
          blockRowIdx: bIdx,
          staffName,
          lastRowIdx: lastIdx
        })
      })
    }

    visibleGridRows.forEach((row) => {
      const gIdx = gridRows.findIndex(r => r.id === row.id)
      const rawStaff = (row.staff_name || '').trim()
      const isBlankStaff = !rawStaff
      const staffKey = isBlankStaff ? 'unassigned_cleaner' : rawStaff.toLowerCase()

      // When cleaner is unassigned/blank, strictly group every 3 rows as an independent block
      if (staffKey !== currentStaffKey || (isBlankStaff && blockRows.length >= 3)) {
        flush()
        currentStaffKey = staffKey
        blockRows = [{ row, globalIdx: gIdx >= 0 ? gIdx : 0 }]
      } else {
        blockRows.push({ row, globalIdx: gIdx >= 0 ? gIdx : 0 })
      }
    })
    flush()

    return map
  }, [visibleGridRows, gridRows])

  // R-ATT-10: cleaners with a real job on a date (date|name) — Present by default; the others are Available
  const workingOn = useMemo(() => {
    const set = new Set<string>()
    gridRows.forEach(r => {
      if (!r.staff_name || !(r.start_time || r.address || cleanNum(r.charges) > 0)) return
      splitStaffNames(r.staff_name).forEach(n => set.add(`${r.date || effectiveTargetDate}|${n.trim().toLowerCase()}`))
    })
    return set
  }, [gridRows, effectiveTargetDate])
  const attendanceCell = (row: DailyJob) => {
    const name = (row.staff_name || '').trim()
    const date = row.date || effectiveTargetDate
    return <ExcelAttendanceCell name={name} date={date} hasJob={workingOn.has(`${date}|${name.toLowerCase()}`)} />
  }

  // UX-131: OT shows once per cleaner — on the last row of the cleaner's block, the total of all the block's jobs
  const blockOTByLastRow = useMemo(() => {
    const sums = new Map<number, number>()
    const lastId = new Map<number, string>()
    visibleGridRows.forEach(r => {
      const b = staffBlockInfoMap.get(r.id)
      if (!b) return
      sums.set(b.lastRowIdx, (sums.get(b.lastRowIdx) || 0) + cleanNum(r.ot_hours))
      if (b.isLast) lastId.set(b.lastRowIdx, r.id)
    })
    const out = new Map<string, number>()
    lastId.forEach((id, k) => out.set(id, Math.round((sums.get(k) || 0) * 100) / 100))
    return out
  }, [visibleGridRows, staffBlockInfoMap])

  // ── Group Rows by Cleaner for Block Mode ──
  const cleanerGroups = useMemo(() => {
    const groups: {
      cleanerName: string
      palette: BlockPalette
      jobs: { row: DailyJob; globalIndex: number }[]
      totalDuty: number
      totalOT: number
      totalCharges: number
      totalReceived: number
      totalPending: number
    }[] = []

    const map = new Map<string, typeof groups[0]>()
    let staffIdx = 0

    visibleGridRows.forEach((row) => {
      // Find global index in gridRows for exact row updates
      const globalIndex = gridRows.findIndex(r => r.id === row.id)
      const rawName = (row.staff_name || 'Unassigned Staff').trim()
      const key = rawName.toLowerCase()

      if (!map.has(key)) {
        const palette = getCleanerPalette(rawName, staffIdx++, row.row_color)
        const newGroup = {
          cleanerName: rawName,
          palette,
          jobs: [],
          totalDuty: 0,
          totalOT: 0,
          totalCharges: 0,
          totalReceived: 0,
          totalPending: 0
        }
        map.set(key, newGroup)
        groups.push(newGroup)
      }

      const g = map.get(key)!
      g.jobs.push({ row, globalIndex: globalIndex >= 0 ? globalIndex : 0 })
      g.totalDuty += cleanNum(row.duty_hours)
      g.totalOT += cleanNum(row.ot_hours)
      g.totalCharges += cleanNum(row.charges)
      g.totalReceived += cleanNum(row.received)
      g.totalPending += rowPending(row)
    })

    groups.forEach(g => {
      g.totalDuty = Math.round(g.totalDuty * 10) / 10
      g.totalOT = Math.round(g.totalOT * 10) / 10
    })

    return groups
  }, [visibleGridRows, gridRows, cleanerColors, pendingCtx])

  // UX-66: every row of one team job has the same colour; solo rows keep the solo colour (UX-61)
  const teamColorMap = useMemo(() => {
    const keyOf = new Map<string, string>()
    // every row of one project (location + date) shares a colour; each project gets the next colour
    const map = buildTeamColorMap(gridRows, r => {
      const k = projectKeyOf(r, gridRows)
      if (k) keyOf.set(r.id, k)
      return k
    })
    // UX-71: a row colour chosen for any row of the project colours the whole project
    const chosen = new Map<string, string>()
    gridRows.forEach(r => {
      const k = keyOf.get(r.id)
      if (!k || !r.row_color || r.row_color === 'default' || chosen.has(k)) return
      const preset = ROW_COLOR_PRESETS.find(p => p.id === r.row_color)
      const pal = BLOCK_PALETTES[r.row_color] || (r.row_color.startsWith('#') ? makeHexPalette(r.row_color) : null)
      const bg = preset ? preset.circleColor : pal ? pal.solidBg : ''
      if (bg) chosen.set(k, bg)
    })
    return {
      byRow: (id: string) => {
        const k = keyOf.get(id)
        const c = k ? map.get(k) : undefined
        return c && chosen.has(k!) ? { ...c, bg: chosen.get(k!)! } : c
      },
    }
  }, [gridRows])

  // Cleaner index lookup for consistent color tints in Flat Grid Mode
  const cleanerIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    visibleGridRows.forEach(row => {
      const name = (row.staff_name || 'Unassigned Staff').trim().toLowerCase()
      if (!map.has(name)) {
        map.set(name, idx++)
      }
    })
    return map
  }, [visibleGridRows])

  // Auto Recalculate all duty & OT hours (R-OT-01)
  const handleRecalculateHours = () => {
    const updated = recalculateAllRowsOT(gridRows)
    pushState(updated)
    showToast('✓ All Duty & Overtime hours recalculated from Start/End times')
  }

  return (
    <div
      ref={spreadsheetRef}
      // UX-131: CSS zoom also shrinks the box — make it 100/zoom of the screen so it always fills the screen
      // (90 % = content smaller, no empty strip on the right / bottom)
      style={{ zoom: `${zoomLevel}%`, width: `${10000 / zoomLevel}vw`, height: `${10000 / zoomLevel}vh` }}
      className="flex flex-col bg-[#f3f4f6] text-slate-900 overflow-hidden select-none font-sans fixed inset-0 z-50"
    >
      {/* ── Toast Notification ── */}
      {toastMessage && (
        <div className="fixed top-16 right-8 z-[120] bg-emerald-900 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-500 animate-in fade-in slide-in-from-top-3">
          <Check size={16} className="text-emerald-300 shrink-0" />
          {/* UX-147: one tick only — the icon; a "✓" at the start of the message is dropped */}
          <span className="text-[13px] font-bold">{toastMessage.replace(/^\s*[✓✔✅]\uFE0F?\s*/u, '')}</span>
        </div>
      )}

      {/* ── Professional Executive Gradient Header (Sleek Slate & Deep Emerald Luxury) ── */}
      <header className="bg-[#0F1F19] border-b border-emerald-500/20 text-white px-5 sm:px-6 py-5 min-h-[86px] flex items-center justify-between shadow-xl shrink-0 relative z-30">
        {/* Sophisticated Glow effect matching executive dashboard */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute right-10 -top-10 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 -top-20 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          {/* Back Icon Button (Text removed as requested) */}
          <button
            type="button"
            onClick={async () => {
              // UX-123: save what is waiting, then leave — no warning
              if (hasUnsavedChanges) { try { await handleSaveAll('auto') } catch { /* kept as a draft */ } }
              if (window.opener) {
                try {
                  window.close()
                  return
                } catch {}
              }
              navigate(`/daily-job-sheet?date=${selectedDate}`)
            }}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer border border-white/15 shadow-xs"
            title="Back to Daily Job Sheet (or close tab)"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="h-6 w-px bg-white/20" />

          {/* Title & Badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white text-emerald-800 flex items-center justify-center font-black text-sm shadow-sm">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[16px] tracking-tight">Excel Job Sheet</span>
                {hasUnsavedChanges && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 animate-pulse">
                    ● {pendingChanges.count} unsaved change{pendingChanges.count === 1 ? '' : 's'}
                  </span>
                )}
                {!hasUnsavedChanges && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/15 text-white/90">Auto-save on</span>}
                {hasUnsavedChanges && autoSaveBlocked && (
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white max-w-[420px] truncate" title={autoSaveBlocked}>{autoSaveBlocked}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Date Filters & Action Controls */}
        <div className="relative z-10 flex items-center gap-2.5 flex-wrap">
          {/* ── Date Function Display (Single date for Today/Yesterday, Range for Custom) & Preset Dropdown Menu ── */}
          <div className="relative flex items-center gap-1.5 bg-black/25 rounded-xl p-1 border border-white/20 text-white text-[11px]" ref={datePresetRef}>
            {/* Inline Date Display: Single Date for Today / Yesterday, From-To for Custom/Ranges */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/20 rounded-lg">
              <Calendar size={13} className="text-white/70 shrink-0" />
              {dateFilterMode === 'all' ? (
                <span className="font-extrabold text-[11.5px] text-white px-2 py-0.5">All Dates</span>
              ) : !(dateFilterMode === 'range' && activeDatePreset !== 'today' && activeDatePreset !== 'yesterday' && activeDatePreset !== 'single') ? (
                /* UX-136: Today / Yesterday / one picked date show one date box; From–To only for Custom Range and the range presets */
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={selectedDate || rangeStart || todayDubai()}
                    onChange={e => {
                      const newD = e.target.value
                      setSelectedDate(newD)
                      setRangeStart(newD)
                      setRangeEnd(newD)
                      setDateFilterMode('single')
                      setSearchParams({ date: newD }, { replace: true })
                      if (newD === todayDubai()) setActiveDatePreset('today')
                      else if (newD === addDaysToYMD(todayDubai(), -1)) setActiveDatePreset('yesterday')
                      else setActiveDatePreset('single')
                    }}
                    className="bg-transparent px-1 py-0.5 font-bold focus:outline-none cursor-pointer [color-scheme:dark] text-[11.5px]"
                    title="Selected Date"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={rangeStart || selectedDate}
                    onChange={e => {
                      setRangeStart(e.target.value)
                      setDateFilterMode('range')
                      setActiveDatePreset('custom')
                    }}
                    className="bg-transparent px-1 py-0.5 font-bold focus:outline-none cursor-pointer [color-scheme:dark] text-[11.5px]"
                    title="From Date"
                  />
                  <span className="text-white/60 font-medium text-[10.5px]">to</span>
                  <input
                    type="date"
                    value={rangeEnd || selectedDate}
                    onChange={e => {
                      setRangeEnd(e.target.value)
                      setDateFilterMode('range')
                      setActiveDatePreset('custom')
                    }}
                    className="bg-transparent px-1 py-0.5 font-bold focus:outline-none cursor-pointer [color-scheme:dark] text-[11.5px]"
                    title="To Date"
                  />
                </div>
              )}
            </div>

            {/* Dropdown Menu Trigger Button */}
            <button
              type="button"
              onClick={() => setShowDatePresetDropdown(prev => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-extrabold text-[11px] transition-all cursor-pointer border border-white/15 shadow-2xs"
              title="Select Date Range Preset"
            >
              <span>
                {activeDatePreset === 'single' ? 'Date' : EXCEL_DATE_PRESETS.find(p => p.id === activeDatePreset)?.label || 'Date Range'}
              </span>
              <ChevronDown size={12} className={`transition-transform duration-200 ${showDatePresetDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu Popover */}
            {showDatePresetDropdown && (
              <div className="absolute left-0 top-full mt-2 z-50 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 p-1.5 text-slate-800 text-[12px] animate-in fade-in zoom-in-95 select-none font-sans">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                  Date Range Presets
                </div>
                <div className="space-y-0.5 max-h-72 overflow-y-auto">
                  {EXCEL_DATE_PRESETS.map(preset => {
                    const isSelected = activeDatePreset === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectDatePreset(preset.id)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between font-medium transition-colors cursor-pointer ${
                          isSelected ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div>
                          <div className="text-[12px]">{preset.label}</div>
                          {preset.desc && <div className="text-[10px] text-slate-400 font-normal">{preset.desc}</div>}
                        </div>
                        {isSelected && <Check size={14} className="text-emerald-700 stroke-[3] shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>



          {/* ── Attendance Navigation Button ── */}
          <button
            type="button"
            onClick={(e) => {
              // R-ATT-11: a popup on this screen; Ctrl+Click still opens the full Attendance sheet in a new tab
              if (e.ctrlKey || e.metaKey) { window.open(`/attendance?date=${effectiveTargetDate}`, '_blank'); return }
              setShowQuickAttendance(true)
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-[12px] border border-white/30 shadow-xs transition-all cursor-pointer active:scale-95"
            title="Mark attendance of every cleaner here (Ctrl+Click: full Attendance sheet in a new tab)"
          >
            <UserCheck size={14} className="stroke-[2.5]" />
            <span>Attendance</span>
          </button>

          {/* ── Dedicated Add Job Button ── */}
          <button
            type="button"
            onClick={() => setShowAddJobModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-[12px] border border-white/30 shadow-xs transition-all cursor-pointer active:scale-95"
            title="Add a new job entry for this date"
          >
            <Plus size={14} className="stroke-[3]" />
            <span>Add Job</span>
          </button>

          {/* ── Save All Button ── */}
          <button
            type="button"
            onClick={() => { void handleSaveAll() }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black text-[12.5px] transition-all cursor-pointer shadow-sm ${
              hasUnsavedChanges
                ? 'bg-amber-400 hover:bg-amber-300 text-amber-950 shadow-amber-900/40 ring-2 ring-white/90 animate-pulse'
                : 'bg-white text-emerald-950 hover:bg-emerald-50 border border-white/80'
            }`}
            title={autoSaveBlocked || 'Changes save by themselves 3 seconds after you stop typing. Save now (Ctrl+S)'}
          >
            <Save size={14} className={hasUnsavedChanges ? 'text-amber-950' : 'text-emerald-800'} />
            <span>{hasUnsavedChanges ? `Save ${pendingChanges.count} change${pendingChanges.count === 1 ? '' : 's'}` : 'Saved'}</span>
          </button>

          {/* ── Three-Dot Menu (Sync, Backup, File, Audit History & Tools) ── */}
          <div className="relative" ref={threeDotRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowThreeDotMenu(!showThreeDotMenu)
              }}
              className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-[12px] border border-white/25 transition-all cursor-pointer shadow-xs"
              title="More Options"
            >
              <MoreVertical size={16} />
            </button>

            {showThreeDotMenu && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 text-slate-800 text-[12px] max-h-[82vh] overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95"
              >
                {/* Section 1: Sync & Cloud */}
                <div className="py-1">
                  <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Sync & Cloud</div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowThreeDotMenu(false)
                      setShowMonthlySyncModal(true)
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2.5 font-semibold text-slate-700">
                      <Sparkles size={14} className="text-amber-600" />
                      <span>Monthly Sync</span>
                    </span>
                    {monthlySyncStatus.pendingSyncCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                        {monthlySyncStatus.pendingSyncCount} pending
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {monthlySyncStatus.totalScheduled} synced
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowThreeDotMenu(false)
                      handleBackupToDrive()
                    }}
                    disabled={isBackingUp}
                    className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-left cursor-pointer transition-colors disabled:opacity-50 text-slate-700"
                  >
                    <CloudUpload size={14} className="text-emerald-600" />
                    <span className="font-semibold">{isBackingUp ? 'Backing up…' : 'Save to Google Drive'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowThreeDotMenu(false)
                      setShowDriveModal(true)
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-left cursor-pointer transition-colors text-slate-600"
                  >
                    <SlidersHorizontal size={13} className="text-slate-400" />
                    <span>Drive Webhook Settings</span>
                  </button>
                </div>

                {/* Section 2: File & Export */}
                <div className="py-1">
                  <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">File & Export</div>
                  <button
                    onClick={() => { handleSaveAll(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center justify-between font-medium text-slate-700 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5"><Save size={14} className="text-emerald-700" /> Save to CRM</span>
                    <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 font-mono">Ctrl+S</kbd>
                  </button>
                  <button
                    onClick={() => { handleExportXLSX(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-slate-700 cursor-pointer"
                  >
                    <Download size={14} className="text-emerald-700" /> Export Excel (.xlsx)
                  </button>
                  <button
                    onClick={() => { handleExportCSV(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-slate-700 cursor-pointer"
                  >
                    <Download size={14} className="text-blue-600" /> Export CSV (.csv)
                  </button>
                  <button
                    onClick={() => { window.print(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center justify-between font-medium text-slate-700 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5"><Printer size={14} className="text-slate-600" /> Print Sheet</span>
                    <kbd className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 font-mono">Ctrl+P</kbd>
                  </button>
                  <button
                    onClick={() => {
                      const jobsForDay = dailyJobs.filter(j => j.date === selectedDate)
                      pushState(JSON.parse(JSON.stringify(jobsForDay)))
                      setShowThreeDotMenu(false)
                      showToast('Reset to saved CRM state')
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-slate-700 cursor-pointer"
                  >
                    <RotateCcw size={14} className="text-amber-600" /> Revert to Saved
                  </button>
                </div>

                {/* Section 3: Audit & Change Log History */}
                <div className="py-1">
                  <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Audit & Change History</div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowThreeDotMenu(false)
                      setShowChangeLogModal(true)
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 flex items-center justify-between font-medium text-slate-700 cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <History size={14} className="text-emerald-700" />
                      <span className="font-bold text-slate-900">Change Log History</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-200">
                      Audit
                    </span>
                  </button>
                </div>

                {/* Section 4: Row Actions (when active cell selected) */}
                {activeCell && (
                  <div className="py-1">
                    <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Row Actions</div>
                    <button
                      onClick={() => {
                        handleDuplicateRow(activeCell.rowIdx)
                        setShowThreeDotMenu(false)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-slate-700 cursor-pointer"
                    >
                      <Copy size={14} className="text-blue-600" /> Duplicate Active Row
                    </button>
                    <button
                      onClick={() => {
                        handleDeleteRow(activeCell.rowIdx)
                        setShowThreeDotMenu(false)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2.5 font-medium cursor-pointer"
                    >
                      <Trash2 size={14} /> Delete Active Row
                    </button>
                  </div>
                )}

                {/* Section 5: Tools & Zoom */}
                <div className="py-1">
                  <div className="px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Tools & Zoom</div>
                  <button
                    onClick={() => { handleRecalculateHours(); setShowThreeDotMenu(false) }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 font-medium text-emerald-800 cursor-pointer"
                  >
                    <Sparkles size={14} className="text-emerald-600" /> Recalculate Duty & OT Hours
                  </button>
                  <div className="px-3.5 py-2 flex items-center justify-between text-[11px] text-slate-500 font-bold">
                    <span>Zoom Scale</span>
                    <div className="flex items-center gap-1">
                      {[90, 100, 110].map(z => (
                        <button
                          key={z}
                          onClick={() => setZoomLevel(z)}
                          className={`px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer ${zoomLevel === z ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                          {z}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>



          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/20 ml-0.5"
            title={isFullscreen ? 'Exit Full Screen' : 'Toggle Full Screen'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>

      {/* ── Autocomplete sources (UX-35): live employees and clients only (R-DATA-03) ── */}
      <datalist id="xl-staff">{staffOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="xl-address">{addressOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="xl-area">{areaOptions.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="xl-service">{serviceOptions.map(n => <option key={n} value={n} />)}</datalist>

      {/* ── Sub-Bar: Search on Left + Flat Borderless Filter Tabs + Action Controls & Mode Icons at Right ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-3 text-[12px] shrink-0 shadow-2xs">
        {/* Left: Search input first, then flat borderless filter buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 1. Search Input First on Far Left */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff, location, client..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-[12px] border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600 w-44 sm:w-56 font-medium text-slate-800 placeholder:text-slate-400 transition-all shadow-2xs"
            />
            {filterSearch && (
              <button
                onClick={() => setFilterSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* 2. Flat Borderless Filter Buttons: ALL, Monthly, Cash, Online, Pending, Project */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['ALL', 'Monthly', 'Cash', 'Online', 'Pending', 'Project'] as const).map(tab => {
              const count = tab === 'ALL' ? filterCounts.all : filterCounts[tab.toLowerCase() as keyof typeof filterCounts]
              const isActive = paymentModeFilter === tab
              const flatStyle = {
                ALL: isActive ? 'bg-emerald-700 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700',
                Monthly: isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50/70 hover:bg-indigo-100/80 text-indigo-900',
                Cash: isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-900',
                Online: isActive ? 'bg-sky-600 text-white' : 'bg-sky-50/70 hover:bg-sky-100/80 text-sky-900',
                Pending: isActive ? 'bg-rose-600 text-white' : 'bg-rose-50/70 hover:bg-rose-100/80 text-rose-900',
                Project: isActive ? 'bg-purple-700 text-white shadow-xs' : 'bg-purple-50/70 hover:bg-purple-100/80 text-purple-900',
              }[tab]

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPaymentModeFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl border-0 font-bold text-[11.5px] transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${flatStyle}`}
                >
                  <span>{tab}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-white/25 text-white' : 'bg-white/90 text-slate-800 shadow-2xs'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right side: Undo & Redo aligned with 'Columns' & 'Reset Column' buttons + View Mode Switcher */}
        <div className="flex items-center gap-2">
          {/* Quick Undo & Redo buttons (aligned with column sections) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length === 0}
              className={`p-1.5 rounded-lg transition-colors ${
                history.length > 0
                  ? 'text-slate-700 hover:text-slate-900 hover:bg-white hover:shadow-2xs cursor-pointer'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={future.length === 0}
              className={`p-1.5 rounded-lg transition-colors ${
                future.length > 0
                  ? 'text-slate-700 hover:text-slate-900 hover:bg-white hover:shadow-2xs cursor-pointer'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={14} />
            </button>
          </div>

          {/* UX-73: align the selected column's text */}
          {(() => {
            const colId = activeCell?.colId || ''
            const colLabel = columns.find(c => c.id === colId)?.label || (colId === 'staff_name' ? 'Staff' : '')
            const current = colId ? (columnAlign[colId] || (alignClass({ id: colId, type: columns.find(c => c.id === colId)?.type }).startsWith('text-right') ? 'right' : 'left')) : ''
            const opts = [['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const
            return (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs" title={colId ? `Align column: ${colLabel}` : 'Click a cell to choose its column, then align it'}>
                {opts.map(([a, Icon]) => (
                  <button
                    key={a}
                    type="button"
                    disabled={!colId}
                    onClick={() => colId && setAlignOf(colId, a)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      !colId ? 'text-slate-300 cursor-not-allowed'
                        : current === a ? 'bg-white text-emerald-700 shadow-2xs cursor-pointer'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-white hover:shadow-2xs cursor-pointer'
                    }`}
                    title={colId ? `Align ${colLabel} ${a}` : 'Click a cell first'}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>
            )
          })()}

          {/* Columns Button with 'Columns' Text Label */}
          <button
            type="button"
            onClick={() => setShowColumnsModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 font-bold text-[11.5px] border border-slate-200/80 transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Customize Columns (Show/Hide & Order)"
          >
            <Eye size={13} className="text-slate-600" />
            <span>Columns</span>
          </button>

          {/* Reset Column Button with 'Reset Column' Text Label */}
          <button
            type="button"
            onClick={resetColumnOrder}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 font-bold text-[11.5px] border border-slate-200/80 transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Reset Column Sequence to Default"
          >
            <RotateCcw size={13} className="text-slate-600" />
            <span>Reset Column</span>
          </button>

          {/* UX-61: solo jobs (one cleaner) to the bottom of the sheet */}
          <button
            type="button"
            onClick={() => {
              const next = !soloAtBottom
              setSoloAtBottom(next)
              safeSet('safaeewala_excel_solo_bottom', next)
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-bold cursor-pointer transition-all ${
              soloAtBottom ? 'bg-teal-50 border-teal-300 text-teal-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Show cleaners who only have single-cleaner jobs below the team jobs"
          >
            <span>Solo at bottom</span>
          </button>

          {/* Mode Switcher: Icons only at the very right end */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('flat')
                safeSet('safaeewala_excel_view_mode', 'flat')
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'flat'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
              }`}
              title="Flat Grid View"
            >
              <Table size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('blocks')
                safeSet('safaeewala_excel_view_mode', 'blocks')
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'blocks'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
              }`}
              title="Cleaner Blocks View"
            >
              <Layers size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── R-JOB-01: time clashes in this sheet ── */}
      {gridClashes.length > 0 && (
        <div role="alert" className="mx-3 my-2 px-4 py-2.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-[12.5px]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="font-extrabold">⛔ {gridClashes.length} time clash{gridClashes.length > 1 ? 'es' : ''}: a cleaner has two jobs at the same time. Change a time or a cleaner. A new or changed row that clashes cannot be saved.</p>
            {gridClashes.length > 3 && (
              <button type="button" onClick={() => setShowAllClashes(v => !v)} className="text-[11.5px] font-bold underline cursor-pointer">
                {showAllClashes ? 'Show less' : `Show all ${gridClashes.length}`}
              </button>
            )}
          </div>
          <ul className="mt-1.5 space-y-1">
            {(showAllClashes ? gridClashes : gridClashes.slice(0, 3)).map((c, i) => (
              <li key={i} className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">{c.staff}</span>
                <span>{formatTime12h(c.a.start_time || '')}–{formatTime12h(c.a.end_time || '')} at {(c.a as DailyJob).address || '—'}</span>
                <span className="text-rose-500">and</span>
                <span>{formatTime12h(c.b.start_time || '')}–{formatTime12h(c.b.end_time || '')} at {(c.b as DailyJob).address || '—'}</span>
                <button type="button" onClick={() => setJumpTargetId(String(c.a.id))} className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-rose-300 hover:bg-rose-100 cursor-pointer">Show</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── R-SCHED-09: monthly jobs whose cleaner is away today ── */}
      {coverNeeds.length > 0 && (
        <div role="alert" className="mx-3 my-2 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-[12.5px] space-y-2">
          <p className="font-extrabold flex items-center gap-1.5"><UserCog size={14} /> Monthly clients need a replacement cleaner today (only this date changes — the monthly schedule stays the same)</p>
          {coverNeeds.map(need => {
            const key = need.cleaner.toLowerCase()
            const opts = staffOptions
              .filter(n => n.toLowerCase() !== key)
              .map(n => ({ value: n, label: n, hint: isFreeFor(gridRows, n, need.rows) ? 'free' : 'busy at this time' }))
              .sort((a, b) => (a.hint === b.hint ? 0 : a.hint === 'free' ? -1 : 1))
            return (
              <div key={key} className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">{need.cleaner}</span>
                <span className="text-amber-800">is away —</span>
                {need.rows.map(r => (
                  <button key={r.id} type="button" onClick={() => setJumpTargetId(r.id)} className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-amber-300 hover:bg-amber-100 cursor-pointer">
                    {(r.address || '—').slice(0, 28)} · {formatTime12h(r.start_time || '')}–{formatTime12h(r.end_time || '')}
                  </button>
                ))}
                <SearchSelect
                  size="sm"
                  className="w-56"
                  value={coverPick[key] || ''}
                  onChange={v => setCoverPick(p => ({ ...p, [key]: v }))}
                  options={opts}
                  placeholder="Replacement cleaner…"
                />
                <button type="button" onClick={() => handleReplaceCleaner(need.cleaner, need.rows.map(r => r.id))} className="text-[11.5px] font-bold px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer">
                  Replace
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* UX-132: cells chosen by click-and-drag · UX-134: the keyboard cell has a clear green border */}
      <style>{`.xl-active{outline:2px solid #16a34a!important;outline-offset:-2px}.xl-in-range{box-shadow:inset 0 0 0 9999px rgba(37,99,235,0.14), inset 0 0 0 1px rgba(37,99,235,0.45)}`}</style>
      {selectedColId && (
        <style>{`td[data-col="${selectedColId}"]{box-shadow:inset 0 0 0 9999px rgba(16,185,129,0.12)}`}</style>
      )}
      {/* ── Main Spreadsheet Grid Container (Full Width Edge-to-Edge) ── */}
      <div className="flex-1 overflow-auto bg-white relative w-full">
        <table className="w-full border-collapse border border-slate-300 text-[12px] font-mono">
          {/* Header: Excel Column Letters (A, B, C...) */}
          <thead className="sticky top-0 z-20 bg-[#f3f4f6] text-slate-600 shadow-xs">
            <tr className="border-b border-slate-300">
              {columns.map(col => (
                <th
                  key={col.col}
                  onMouseDown={e => handleHeaderMouseDown(e, col.id)}
                  onMouseEnter={() => handleHeaderMouseEnter(col.id)}
                  onClick={() => {
                    setSelectedColId(prev => (prev === col.id ? null : col.id))
                    setActiveCell(prev => ({ rowIdx: prev?.rowIdx ?? 0, colId: col.id }))
                    setEditingCell(null)
                  }}
                  title={`Select column ${col.col} (${col.label}) — then align it with the buttons above`}
                  style={{ width: `${getColWidth(col)}px`, minWidth: `${getColWidth(col)}px` }}
                  className={`h-6 border-r border-slate-300 text-center font-bold text-[11px] select-none cursor-pointer hover:bg-emerald-100 ${
                    selectedColId === col.id
                      ? 'bg-emerald-600 text-white font-black'
                      : activeCell && columns.find(c => c.id === activeCell.colId)?.col === col.col
                      ? 'bg-emerald-200 text-emerald-950 font-black'
                      : 'bg-[#e5e7eb] text-slate-700'
                  }`}
                >
                  {col.col}
                </th>
              ))}
              <th className="w-28 border-r border-slate-300 bg-[#e5e7eb] text-[10px] font-bold text-center">Action</th>
            </tr>

            {/* Column Label / Name Row with Drag & Drop and Resizing Handles */}
            <tr className="border-b-2 border-slate-400 bg-slate-100 text-slate-800 font-sans font-bold text-[11.5px]">
              {columns.map(col => (
                <th
                  key={col.id}
                  draggable
                  onDragStart={e => handleDragStart(e, col.id)}
                  onDragOver={e => handleDragOver(e, col.id)}
                  onDrop={e => handleDrop(e, col.id)}
                  onDragEnd={() => { setDraggedColId(null); setDragOverColId(null) }}
                  onContextMenu={e => handleColumnHeaderContextMenu(e, col.id)}
                  style={{ width: `${getColWidth(col)}px`, minWidth: `${getColWidth(col)}px` }}
                  className={`relative px-2.5 py-1.5 border-r border-slate-300 text-left whitespace-nowrap cursor-grab active:cursor-grabbing select-none transition-colors group/colhdr ${
                    dragOverColId === col.id ? 'bg-emerald-100 border-l-4 border-l-emerald-600' : ''
                  } ${draggedColId === col.id ? 'opacity-40' : ''}`}
                  title={col.id === 'staff_name'
                    ? "Drag column to reorder · Right-click for Staff Block color · Drag edge to resize"
                    : "Drag column to reorder · Right-click header to color whole row · Drag edge to resize"
                  }
                >
                  {/* UX-85: the header follows its column's alignment (left / center / right) */}
                  <div className={`flex items-center gap-1.5 pr-2 ${alignClass(col).includes('text-right') ? 'justify-end' : alignClass(col).includes('text-center') ? 'justify-center' : 'justify-start'}`}>
                    <span>{col.label}</span>
                  </div>
                  {/* Edge drag handle for resizing column width */}
                  <div
                    onMouseDown={e => handleStartResize(e, col.id, getColWidth(col))}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-emerald-500/60 transition-colors z-20"
                    title="Drag to resize column width"
                  />
                </th>
              ))}
              <th className="w-28 border-r border-slate-300 text-center text-[10.5px] font-bold">Action</th>
            </tr>
          </thead>

          {/* ── Table Body: Cleaner Blocks Mode or Flat Grid Mode ── */}
          {viewMode === 'blocks' ? (
            /* 1. Cleaner Blocks Mode (Grouped by Cleaner in Separate Colored Blocks) */
            <tbody className="divide-y divide-slate-200">
              {cleanerGroups.map((group) => {
                const palette = group.palette

                return (
                  <React.Fragment key={group.cleanerName}>
                    {/* ── Cleaner Block Section Header Banner ── */}
                    <tr
                      onContextMenu={e => handleContextMenu(e, group.jobs[0]?.globalIndex ?? 0, group.jobs[0]?.row, 'staff_name')}
                      className={`${palette.headerBg} ${palette.headerText} border-t-2 border-b border-black/20 select-none shadow-xs cursor-context-menu`}
                    >
                      <td colSpan={columns.length + 1} className="px-3 py-2">
                        <div className="flex items-center justify-between flex-wrap gap-2 font-sans">
                          {/* Left: Cleaner Info & Badges */}
                          <div className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${palette.avatarBg} shadow-xs`}>
                              {(group.cleanerName || 'C').trim()[0]?.toUpperCase() || 'C'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-[14px] tracking-tight">{group.cleanerName}</span>
                              {group.jobs.every(j => (j.row as any)._idle) && (
                                <span className={`text-[10.5px] font-black px-2 py-0.5 rounded-full ${(group.jobs[0].row as any)._idle === 'Absent' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {(group.jobs[0].row as any)._idle === 'Absent' ? 'Absent' : 'No job — available'}
                                </span>
                              )}
                              {!group.jobs.every(j => (j.row as any)._idle) && <>
                                <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full ${palette.badgeBg} ${palette.badgeText}`}>
                                  {group.jobs.length} {group.jobs.length === 1 ? 'Shift' : 'Shifts'}
                                </span>
                                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${palette.badgeBg} ${palette.badgeText}`}>
                                  {group.totalDuty}h Duty
                                </span>
                              </>}
                              {group.totalOT > 0 && (
                                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950">
                                  +{group.totalOT}h OT
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Block Summary, Color Selector & Add Job */}
                          <div className="flex items-center gap-3 font-mono text-[11px]">
                            <span>Charges: <strong>AED {group.totalCharges}</strong></span>
                            <span>·</span>
                            <span>Recv: <strong>AED {group.totalReceived}</strong></span>
                            {group.totalPending > 0 && (
                              <span className="bg-red-500 text-white font-bold px-1.5 py-0.5 rounded text-[10px]">
                                Due AED {group.totalPending}
                              </span>
                            )}

                            {/* Color Palette Selector Dropdown for this Cleaner Block */}
                            <div className="relative inline-block font-sans">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  setColorPickerCleaner(colorPickerCleaner === group.cleanerName ? null : group.cleanerName)
                                }}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-white text-[11px] font-bold border border-white/20 transition-all cursor-pointer shadow-xs"
                                title="Change Block Color for this cleaner"
                              >
                                <span className="w-3 h-3 rounded-full border border-white/60" style={{ backgroundColor: palette.hex }} />
                                <span>{palette.name}</span>
                                <ChevronDown size={11} />
                              </button>

                                {colorPickerCleaner === group.cleanerName && (
                                  <div
                                    onClick={e => e.stopPropagation()}
                                    className="absolute top-full right-0 mt-1 w-64 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 p-2.5 z-50 text-[11.5px] font-sans animate-in fade-in"
                                  >
                                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
                                      <span className="font-bold text-[11px] text-white flex items-center gap-1">
                                        <Palette size={12} className="text-emerald-400" />
                                        Colors
                                      </span>
                                      <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                                        <button
                                          type="button"
                                          onClick={() => setColorPaletteTab('solid')}
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            colorPaletteTab === 'solid' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                                          }`}
                                        >
                                          Solid
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setColorPaletteTab('light')}
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            colorPaletteTab === 'light' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                                          }`}
                                        >
                                          Light
                                        </button>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1.5 max-h-60 overflow-y-auto p-1">
                                      {(colorPaletteTab === 'light' ? LIGHT_PALETTE_KEYS : SOLID_PALETTE_KEYS).map(pk => {
                                        const p = BLOCK_PALETTES[pk]
                                        const isSelected = palette.id === p.id
                                        return (
                                          <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setCleanerColor(group.cleanerName, p.id)}
                                            style={{ backgroundColor: p.solidBg, borderColor: p.solidBorder }}
                                            className={`flex flex-col items-center justify-center p-1 rounded-lg border-2 text-center transition-all cursor-pointer shadow-xs ${
                                              isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-105' : 'hover:border-white'
                                            }`}
                                            title={`${p.name} (${colorPaletteTab === 'light' ? 'Light' : 'Solid'})`}
                                          >
                                            <div className="flex items-center gap-0.5">
                                              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: p.hex }} />
                                              {isSelected && <Check size={9} className={p.isLight ? 'text-slate-900 stroke-[3]' : 'text-white stroke-[3]'} />}
                                            </div>
                                            <span className={`text-[9px] font-bold truncate max-w-[50px] mt-0.5 leading-none ${p.isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                                              {p.name.split(' ')[0]}
                                            </span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                            </div>

                            {/* + Add Shift for this Cleaner */}
                            <button
                              type="button"
                              onClick={() => {
                                const lastJobGlobalIdx = group.jobs[group.jobs.length - 1]?.globalIndex ?? (gridRows.length - 1)
                                insertRowAt(lastJobGlobalIdx, 'below', group.cleanerName)
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-[11px] transition-colors cursor-pointer border border-white/30 shadow-xs font-sans"
                              title={`Add new job shift for ${group.cleanerName}`}
                            >
                              <Plus size={12} />
                              <span>Add Shift</span>
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* ── Cleaner's Shift Rows inside the Block ── */}
                    {group.jobs.map(({ row, globalIndex }) => {
                      const isSelectedRow = activeCell?.rowIdx === globalIndex

                      return (
                        <tr
                          key={row.id}
                          data-row-id={row.id}
                          onContextMenu={e => handleContextMenu(e, globalIndex, row)}
                          style={{ backgroundColor: teamColorMap.byRow(row.id)?.bg || (row.row_color && row.row_color !== 'default' ? palette.solidBg : DEFAULT_ROW_BG) }} // UX-70, UX-71, UX-79: team colour, else the row's own colour, else white
                          className={`transition-colors group hover:brightness-[0.97] ${flashRowId === row.id ? 'outline outline-4 -outline-offset-2 outline-amber-400' : clashRowIds.has(row.id) ? 'outline outline-2 -outline-offset-2 outline-rose-500' : ''} ${
                            isSelectedRow
                              ? 'ring-2 ring-inset ring-emerald-600 font-semibold shadow-xs'
                              : ''
                          }`}
                        >


                          {/* Render Cells */}
                          {columns.map(col => {
                            const isCellActive = activeCell?.rowIdx === globalIndex && activeCell?.colId === col.id
                            const isCellEditing = editingCell?.rowIdx === globalIndex && editingCell?.colId === col.id

                            let rawVal = row[col.id as keyof DailyJob]
                            let displayVal: any = rawVal
                            if (col.id === 'remarks') displayVal = splitSyncNote(rawVal).text // UX-86: the note is the flag
                            const isBlankShift = !row.address && !row.start_time && !row.end_time && cleanNum(row.charges) === 0 && cleanNum(row.received) === 0
                            const mcInfo = getMultiCleanerPaymentInfo(row, gridRows)

                            if (col.id === 'team_name') {
                              if (isBlankShift) displayVal = ''
                              else if (mcInfo?.isSecondary) displayVal = mcInfo.teamRef
                              else if (mcInfo?.isPrimary && mcInfo.isMultiCleaner) displayVal = `${mcInfo.teamRef} (Lead)`
                              else if (rawVal && String(rawVal).trim().toLowerCase() !== 'project team') displayVal = rawVal
                              else displayVal = ''
                            } else if (col.id === 'charges') {
                              if (isBlankShift) displayVal = ''
                              else if (refMoney(mcInfo, row)) displayVal = memberChargesLabel(row, mcInfo!.teamRef)
                              else displayVal = cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : '')
                            } else if (col.id === 'received') {
                              if (isBlankShift) displayVal = ''
                              else if (refMoney(mcInfo, row)) displayVal = memberReceivedLabel(row, mcInfo!.primaryCleaner, employees)
                              else displayVal = cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : '')
                            } else if (col.id === 'pending') {
                              if (isBlankShift) displayVal = ''
                              else if (refMoney(mcInfo, row)) displayVal = 'Nil'
                              else displayVal = rowPending(row)
                            } else if (col.id === 'advance') {
                              displayVal = isBlankShift || refMoney(mcInfo, row) ? '' : (rowAdvance(row) || '')
                            } else if (col.id === 'charges_per_hour') {
                              displayVal = isBlankShift || refMoney(mcInfo, row) ? '' : (chargesPerHour(row) || '')
                            } else if (col.id === 'payment_mode') {
                              if (isBlankShift) displayVal = ''
                              else if (refMoney(mcInfo, row)) displayVal = memberModeLabel(row)
                              else displayVal = rawVal || ''
                            } else if (col.id === 'start_time' || col.id === 'end_time') {
                              displayVal = isBlankShift ? '' : (rawVal ? formatTime12h(rawVal) : '')
                            } else if (col.id === 'material') {
                              displayVal = isBlankShift ? '' : (rawVal ? (String(rawVal).toUpperCase() === 'NO' ? 'NO' : String(rawVal).toUpperCase() === 'YES' ? 'YES' : String(rawVal)) : '')
                            } else if (col.id === 'duty_hours') {
                              const d = cleanNum(rawVal)
                              displayVal = isBlankShift ? '' : (d > 0 ? d.toFixed(2) : '')
                            } else if (col.id === 'ot_hours') {
                              // UX-131: the cleaner's total OT, on the group's last row only
                              const isLastJob = group.jobs[group.jobs.length - 1]?.row.id === row.id
                              displayVal = isLastJob && group.totalOT > 0 ? (Math.round(group.totalOT * 100) / 100).toFixed(2) : ''
                            } else if (col.type === 'number') {
                              displayVal = isBlankShift ? '' : cleanNum(displayVal)
                            }

                            const cellColorKey = cellColors[`${row.id}_${col.id}`]
                            const cellPalette = cellColorKey && (BLOCK_PALETTES[cellColorKey] || (cellColorKey.startsWith('#') ? makeHexPalette(cellColorKey) : null))
                            const colColorKey = columnColors[col.id]
                            const colPalette = colColorKey && (BLOCK_PALETTES[colColorKey] || (colColorKey.startsWith('#') ? makeHexPalette(colColorKey) : null))
                            const customRowPreset = row.row_color && ROW_COLOR_PRESETS.find(p => p.id === row.row_color)
                            const rowPalette = row.row_color && (BLOCK_PALETTES[row.row_color] || (row.row_color.startsWith('#') ? makeHexPalette(row.row_color) : null))

                            let cellBg: string | undefined = undefined
                            if (cellPalette) {
                              cellBg = cellPalette.solidBg
                            } else if (!isBlankShift && teamColorMap.byRow(row.id)) {
                              cellBg = teamColorMap.byRow(row.id)!.bg // UX-71: one colour for the whole team
                            } else if (rowPalette) {
                              cellBg = rowPalette.solidBg
                            } else if (customRowPreset) {
                              cellBg = customRowPreset.circleColor
                            } else if (colPalette) {
                              cellBg = colPalette.solidBg
                            }

                            return (
                              <td
                                key={col.id}
                                data-col={col.id}
                                onClick={e => handleCellClick(globalIndex, col.id, e)}
                                onMouseDown={e => handleCellMouseDown(e, globalIndex, col.id)}
                                onMouseEnter={() => handleCellMouseEnter(globalIndex, col.id)}
                                onDoubleClick={() => handleCellDoubleClick(globalIndex, col.id)}
                                onContextMenu={e => handleContextMenu(e, globalIndex, row, col.id)}
                                style={{
                                  width: `${getColWidth(col)}px`,
                                  minWidth: `${getColWidth(col)}px`,
                                  backgroundColor: cellBg,
                                }}
                                className={`h-7 px-2 border-r border-slate-200 ${isCellEditing ? 'overflow-visible z-30' : 'overflow-hidden'} text-ellipsis whitespace-nowrap cursor-cell transition-all relative ${
                                  isCellActive
                                    ? 'xl-active bg-white z-10 font-semibold'
                                    : ''
                                } ${alignClass(col)} ${isInSel(globalIndex, col.id) ? 'xl-in-range' : ''}`}
                              >
                                {isCellEditing ? (
                                  renderCellEditor(col, globalIndex, true)
                                ) : col.id === 'staff_name' ? (
                                  <div className="flex flex-col items-start leading-tight py-0.5">
                                    <span className="inline-flex items-center gap-1 max-w-full">
                                      <span className="font-bold text-slate-900 tracking-tight truncate" title={String(displayVal || '')}>{shortStaffLabel(String(displayVal || ''), employees) || displayVal}</span>
                                      <JobFlagIcon flags={flagsOf([row])} onClear={clearFlag} />
                                    </span>
                                    {mcInfo?.teamRef && !isBlankShift && (
                                      <span className={`inline-flex items-center gap-0.5 text-[9.5px] font-black px-1.5 py-0.2 rounded-md mt-0.5 border shadow-2xs ${
                                        mcInfo.isPrimary ? 'bg-indigo-100 text-indigo-900 border-indigo-300' : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                      }`}>
                                        <span>{mcInfo.teamRef}</span>
                                        {mcInfo.isPrimary && <span className="text-[8.5px] text-indigo-600 font-extrabold">(Lead)</span>}
                                      </span>
                                    )}
                                    {!mcInfo?.teamRef && row.team_name && !isBlankShift && (
                                      <span className="inline-flex items-center text-[9.5px] font-black px-1.5 py-0.2 rounded-md mt-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200">
                                        {row.team_name}
                                      </span>
                                    )}
                                  </div>
                                ) : col.id === 'attendance' ? (
                                  group.jobs[0]?.row.id === row.id && (row.staff_name || '').trim() ? attendanceCell(row) : null
                                ) : col.id === 'received' && refMoney(mcInfo, row) && !isBlankShift ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleJumpToLeadCleaner(mcInfo!, row)
                                    }}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-[10.5px] font-bold cursor-pointer transition-all shadow-2xs group/ref"
                                    title={`Go to the row where the payment was received (${mcInfo!.primaryCleaner})`}
                                  >
                                    <ExternalLink size={10} className="text-indigo-600 group-hover/ref:translate-x-0.5 transition-transform" />
                                    <span className="underline decoration-indigo-300 underline-offset-2">{displayVal}</span>
                                  </button>
                                ) : col.id === 'team_name' && mcInfo?.teamRef && !isBlankShift ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleJumpToLeadCleaner(mcInfo, row)
                                    }}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-[10.5px] font-bold cursor-pointer transition-all shadow-2xs"
                                    title="Go to the lead cleaner's payment row"
                                  >
                                    <Users size={10} className="text-indigo-600" />
                                    <span>{displayVal}</span>
                                  </button>
                                ) : (
                                  <span
                                    title={
                                      refMoney(mcInfo, row)
                                        ? col.id === 'charges'
                                          ? `Charges recorded under primary cleaner: ${mcInfo!.primaryCleaner}`
                                          : col.id === 'received'
                                            ? `Payment received recorded under primary cleaner: ${mcInfo!.primaryCleaner}`
                                            : col.id === 'pending'
                                              ? `Paid under primary cleaner: ${mcInfo!.primaryCleaner}`
                                              : undefined
                                        : undefined
                                    }
                                    className={
                                      refMoney(mcInfo, row) && (col.id === 'charges' || col.id === 'received')
                                        ? 'text-indigo-800 italic font-semibold text-[11px]'
                                        : refMoney(mcInfo, row) && col.id === 'payment_mode'
                                          ? 'text-indigo-800 font-bold text-[11px]'
                                          : col.id === 'charges'
                                            ? 'text-slate-900 font-extrabold'
                                            : col.id === 'received'
                                              ? 'text-emerald-700 font-bold'
                                              : col.id === 'pending' && cleanNum(displayVal) > 0
                                                ? 'text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 text-[11px]'
                                                : 'text-slate-900 font-medium'
                                    }
                                  >
                                    {col.id === 'address' ? (
                                      <span>{cleanAddressDisplay(displayVal)}</span>
                                    ) : (displayVal !== undefined && displayVal !== null && displayVal !== '' ? String(displayVal) : '')}
                                  </span>
                                )}
                                {!isCellEditing && DROPDOWN_COLS.has(col.id) && (
                                  <ChevronDown size={12} className="absolute right-1 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
                                )}
                              </td>
                            )
                          })}

                          {/* Action Column: Solid Black Icon Buttons Only */}
                          <td className="w-20 border-r border-slate-200 text-center px-1">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(row, globalIndex)}
                                className="p-1.5 rounded-lg bg-black hover:bg-slate-800 text-white shadow-xs cursor-pointer transition-colors"
                                title="Edit entry"
                              >
                                <Pencil size={12} className="text-white" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(globalIndex)}
                                className="p-1.5 rounded-lg bg-black hover:bg-rose-950 text-white shadow-xs cursor-pointer transition-colors"
                                title="Delete row"
                              >
                                <Trash2 size={12} className="text-white" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          ) : (
            /* 2. Flat Continuous Grid Mode (With 3-Row Staff Blocks, Merged Staff Cells & No Internal Grid Lines) */
            <tbody className="divide-y divide-slate-200">
              {visibleGridRows.map((row, rowIdx) => {
                const globalIndex = gridRows.findIndex(r => r.id === row.id)
                const targetIdx = globalIndex >= 0 ? globalIndex : rowIdx
                const isSelectedRow = activeCell?.rowIdx === targetIdx
                const rawStaff = (row.staff_name || 'Unassigned Staff').trim()
                const staffKey = rawStaff.toLowerCase()
                const palette = getCleanerPalette(rawStaff, cleanerIndexMap.get(staffKey) ?? 0)

                // ── Pre-calculated Staff Block Boundary & RowSpan Info ──
                const blockInfo = staffBlockInfoMap.get(row.id)
                const isFirstInBlock = blockInfo?.isFirst ?? true
                const isLastInBlock = blockInfo?.isLast ?? true
                const blockRowCount = blockInfo?.rowCount ?? 1
                const isMonthlyRow = row.payment_mode === 'Monthly'

                // ── Block Perimeter Borders: 2.5px solid boundary between cleaners ──
                const blockTopBorder = isFirstInBlock ? '2px solid #0f172a' : '1px solid #cbd5e1'
                const blockBottomBorder = isLastInBlock ? '2px solid #0f172a' : '1px solid #cbd5e1'

                // ── Row & Block Color Logic (Full Row/Block Implementation across all columns) ──
                // Check if user explicitly set a color for this cleaner block or row
                const customCleanerKey = cleanerColors[staffKey]
                const hasCustomBlockColor = !!customCleanerKey && !!BLOCK_PALETTES[customCleanerKey]
                const blockPalette = row.row_color && (BLOCK_PALETTES[row.row_color] || (row.row_color.startsWith('#') ? makeHexPalette(row.row_color) : null))
                const customRowPreset = row.row_color ? ROW_COLOR_PRESETS.find(p => p.id === row.row_color) : null

                // Monthly clients and regular rows default to clean white (#ffffff) unless user changes color
                let rowBg = '#ffffff'
                let isDarkRow = false

                if (teamColorMap.byRow(row.id)) {
                  rowBg = teamColorMap.byRow(row.id)!.bg // UX-71: every cleaner of the team, same colour
                } else if (blockPalette) {
                  rowBg = blockPalette.solidBg
                  isDarkRow = !blockPalette.isLight
                } else if (customRowPreset) {
                  rowBg = customRowPreset.circleColor
                  isDarkRow = false
                } else {
                  // UX-79: a cleaner's block colour marks only the name cell's edge; the rows stay white
                  rowBg = DEFAULT_ROW_BG // UX-70: solo jobs and new rows stay white
                }

                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    onContextMenu={e => handleContextMenu(e, targetIdx, row)}
                    style={{ backgroundColor: rowBg, height: `${ROW_HEIGHT_MAP[rowHeightLevel].rowHeightPx}px` }}
                    className={`transition-colors group hover:brightness-[0.98] ${flashRowId === row.id ? 'outline outline-4 -outline-offset-2 outline-amber-400' : clashRowIds.has(row.id) ? 'outline outline-2 -outline-offset-2 outline-rose-500' : ''} ${
                      isSelectedRow ? 'ring-2 ring-inset ring-emerald-500 font-semibold shadow-xs' : ''
                    }`}
                  >
                    {/* Columns */}
                    {columns.map((col, cIdx) => {
                      // ── STAFF COLUMN: Merged cell spanning all rows of this cleaner with hidden internal grid lines ──
                      if (col.id === 'staff_name') {
                        if (!isFirstInBlock) {
                          // Skip rendering: cell is spanned down from the first row of this block
                          return null
                        }

                        const isStaffCellActive = activeCell?.rowIdx === targetIdx && activeCell?.colId === 'staff_name'
                        const isStaffCellEditing = editingCell?.rowIdx === targetIdx && editingCell?.colId === 'staff_name'

                        // UX-70 & User Rule: Team row background color applies ONLY from Start Time onwards!
                        // Staff column stays default white (#ffffff) unless user explicitly customized cleaner color or staff cell color
                        const staffCellCustomColor = cellColors[`${row.id}_staff_name`] || cellColors[`${targetIdx}_staff_name`]
                        const staffBg = hasCustomBlockColor ? palette.solidBg : (staffCellCustomColor || DEFAULT_ROW_BG)
                        const isStaffDark = hasCustomBlockColor ? !palette.isLight : false

                        // Staff text alignment (default left, controlled via toolbar alignment buttons)
                        const staffAlign = columnAlign['staff_name'] || 'left'
                        const staffAlignClass = staffAlign === 'center' ? 'text-center items-center' : staffAlign === 'right' ? 'text-right items-end' : 'text-left items-start'

                        return (
                          <td
                            key={col.id}
                            data-col={col.id}
                            rowSpan={blockRowCount}
                            onClick={() => handleCellClick(targetIdx, col.id)}
                            onDoubleClick={() => handleCellDoubleClick(targetIdx, col.id)}
                            onContextMenu={e => handleContextMenu(e, targetIdx, row, 'staff_name')}
                            style={{
                              width: `${getColWidth(col)}px`,
                              minWidth: `${getColWidth(col)}px`,
                              backgroundColor: staffBg,
                              borderLeft: `4px solid ${hasCustomBlockColor ? palette.solidBorder : '#0f172a'}`,
                              borderTop: blockTopBorder,
                              borderBottom: blockBottomBorder,
                              borderRight: '1px solid #cbd5e1',
                            }}
                            className={`align-middle ${staffAlign === 'center' ? 'text-center' : staffAlign === 'right' ? 'text-right' : 'text-left'} select-none cursor-cell transition-all relative group/staff px-3 py-2 ${
                              isStaffCellActive ? 'xl-active bg-white z-10' : ''
                            }`}
                            title="Staff Member · Double-click to edit Staff Name"
                          >
                            {isStaffCellEditing ? (
                              <input
                                ref={inputRef}
                                list="xl-staff"
                                value={editingCell.tempValue}
                                onChange={e => setEditingCell({ ...editingCell, tempValue: e.target.value })}
                                onBlur={commitCellEdit}
                                onKeyDown={handleEditorKeyDown}
                                className={`w-full ${staffAlign === 'center' ? 'text-center' : staffAlign === 'right' ? 'text-right' : 'text-left'} text-[12px] font-bold border border-emerald-500 rounded p-1 outline-none bg-white text-slate-900 shadow-inner`}
                                autoFocus
                              />
                            ) : (
                              <div className={`flex flex-col ${staffAlignClass} justify-center h-full min-h-[48px] px-2 gap-1`}>
                                <span className="inline-flex items-center gap-1">
                                  <span className={`font-bold text-[13px] tracking-tight select-text ${isStaffDark ? 'text-white' : 'text-slate-900'}`}>
                                    {shortStaffLabel(blockInfo?.staffName, employees) || '—'}
                                  </span>
                                  <JobFlagIcon flags={flagsOf(gridRows.filter(j => (j.staff_name || '').trim().toLowerCase() === staffKey))} onClear={clearFlag} />
                                </span>
                              </div>
                            )}
                          </td>
                        )
                      }

                      // ── ALL OTHER COLUMNS (Rendered row by row for each shift in the block) ──
                      const isCellActive = activeCell?.rowIdx === targetIdx && activeCell?.colId === col.id
                      const isCellEditing = editingCell?.rowIdx === targetIdx && editingCell?.colId === col.id

                      let rawVal = row[col.id as keyof DailyJob]
                      let displayVal: any = rawVal
                      if (col.id === 'remarks') displayVal = splitSyncNote(rawVal).text // UX-86: the note is the flag
                      const isBlankShift = !row.address && !row.start_time && !row.end_time && cleanNum(row.charges) === 0 && cleanNum(row.received) === 0
                      const pendVal = rowPending(row)
                      const mcInfo = getMultiCleanerPaymentInfo(row, gridRows)
                      const isPendingDue = col.id === 'pending' && pendVal > 0 && !refMoney(mcInfo, row)

                      if (col.id === 'team_name') {
                        if (isBlankShift) displayVal = ''
                        else if (mcInfo?.isSecondary) displayVal = mcInfo.teamRef
                        else if (mcInfo?.isPrimary && mcInfo.isMultiCleaner) displayVal = `${mcInfo.teamRef} (Lead)`
                        else if (rawVal && String(rawVal).trim().toLowerCase() !== 'project team') displayVal = rawVal
                        else displayVal = ''
                      } else if (col.id === 'charges') {
                        if (isBlankShift) displayVal = ''
                        else if (refMoney(mcInfo, row)) displayVal = memberChargesLabel(row, mcInfo!.teamRef)
                        else displayVal = cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : '')
                      } else if (col.id === 'received') {
                        if (isBlankShift) displayVal = ''
                        else if (refMoney(mcInfo, row)) displayVal = memberReceivedLabel(row, mcInfo!.primaryCleaner, employees)
                        else displayVal = cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : '')
                      } else if (col.id === 'pending') {
                        if (isBlankShift) {
                          displayVal = ''
                        } else if (refMoney(mcInfo, row)) {
                          displayVal = 'Nil'
                        } else if (pendVal > 0) {
                          displayVal = pendVal
                        } else {
                          displayVal = 'Nil' // UX-72: an advance is shown in its own column
                        }
                      } else if (col.id === 'advance') {
                        displayVal = isBlankShift || refMoney(mcInfo, row) ? '' : (rowAdvance(row) || '')
                      } else if (col.id === 'charges_per_hour') {
                        displayVal = isBlankShift || refMoney(mcInfo, row) ? '' : (chargesPerHour(row) || '')
                      } else if (col.id === 'payment_mode') {
                        if (isBlankShift) displayVal = ''
                        else if (refMoney(mcInfo, row)) displayVal = memberModeLabel(row)
                        else displayVal = rawVal || ''
                      } else if (col.id === 'ot_hours') {
                        // UX-131: only the block's last row shows OT — the total of the cleaner's jobs
                        const total = blockOTByLastRow.get(row.id)
                        const hasJobs = staffBlockInfoMap.get(row.id)?.staffName
                        displayVal = total === undefined || !hasJobs ? '' : (total > 0 ? total.toFixed(2) : '0.00')
                      } else if (col.id === 'duty_hours') {
                        const d = cleanNum(rawVal)
                        displayVal = d > 0 ? d.toFixed(2) : ''
                      } else if (col.id === 'start_time' || col.id === 'end_time') {
                        displayVal = isBlankShift ? '' : (rawVal ? formatTime12h(rawVal) : '')
                      } else if (col.id === 'material') {
                        displayVal = isBlankShift ? '' : (rawVal ? (String(rawVal).toUpperCase() === 'NO' ? 'NO' : String(rawVal).toUpperCase() === 'YES' ? 'YES' : String(rawVal)) : '')
                      } else if (col.type === 'number') {
                        displayVal = isBlankShift ? '' : (cleanNum(displayVal) > 0 ? cleanNum(displayVal) : (cleanNum(displayVal) === 0 ? 0 : ''))
                      }

                      const cellColorKey = cellColors[`${row.id}_${col.id}`]
                      const cellPalette = cellColorKey && (BLOCK_PALETTES[cellColorKey] || (cellColorKey.startsWith('#') ? makeHexPalette(cellColorKey) : null))
                      const colColorKey = columnColors[col.id]
                      const colPalette = colColorKey && (BLOCK_PALETTES[colColorKey] || (colColorKey.startsWith('#') ? makeHexPalette(colColorKey) : null))
                      const cellBg = cellPalette ? cellPalette.solidBg : (colPalette ? colPalette.solidBg : rowBg)
                      const isDarkCell = cellPalette ? !cellPalette.isLight : (colPalette ? !colPalette.isLight : isDarkRow)

                      return (
                        <td
                          key={col.id}
                          data-col={col.id}
                          onClick={e => handleCellClick(targetIdx, col.id, e)}
                          onMouseDown={e => handleCellMouseDown(e, targetIdx, col.id)}
                          onMouseEnter={() => handleCellMouseEnter(targetIdx, col.id)}
                          onDoubleClick={() => handleCellDoubleClick(targetIdx, col.id)}
                          onContextMenu={e => handleContextMenu(e, targetIdx, row, col.id)}
                          style={{
                            width: `${getColWidth(col)}px`,
                            minWidth: `${getColWidth(col)}px`,
                            backgroundColor: isCellActive ? (palette.isLight ? '#ffffff' : '#090d16') : cellBg,
                            borderTop: blockTopBorder,
                            borderBottom: blockBottomBorder,
                            borderRight: palette.isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)',
                          }}
                          className={`${ROW_HEIGHT_MAP[rowHeightLevel].heightClass} ${ROW_HEIGHT_MAP[rowHeightLevel].pyClass} px-2 ${isCellEditing ? 'overflow-visible z-30' : 'overflow-hidden'} text-ellipsis whitespace-nowrap cursor-cell transition-all relative ${
                            isCellActive
                              ? (palette.isLight ? 'xl-active bg-white z-10 font-bold text-slate-900 shadow-md' : 'xl-active bg-slate-950 z-10 font-bold text-white shadow-md')
                              : ''
                          } ${alignClass(col)} ${isInSel(targetIdx, col.id) ? 'xl-in-range' : ''}`}
                        >
                          {isCellEditing ? (
                            renderCellEditor(col, targetIdx, palette.isLight)
                          ) : col.id === 'attendance' ? (
                            // R-ATT-10: one Attendance dropdown per cleaner block, on its first row
                            staffBlockInfoMap.get(row.id)?.isFirst && (row.staff_name || '').trim() ? attendanceCell(row) : null
                          ) : col.id === 'received' && refMoney(mcInfo, row) && !isBlankShift ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleJumpToLeadCleaner(mcInfo!, row)
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-[10.5px] font-bold cursor-pointer transition-all shadow-2xs group/ref"
                              title={`Go to the row where the payment was received (${mcInfo!.primaryCleaner})`}
                            >
                              <ExternalLink size={10} className="text-indigo-600 group-hover/ref:translate-x-0.5 transition-transform" />
                              <span className="underline decoration-indigo-300 underline-offset-2">{displayVal}</span>
                            </button>
                          ) : col.id === 'team_name' && mcInfo?.teamRef && !isBlankShift ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleJumpToLeadCleaner(mcInfo, row)
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-[10.5px] font-bold cursor-pointer transition-all shadow-2xs"
                              style={teamColorMap.byRow(row.id) ? { backgroundColor: teamColorMap.byRow(row.id)!.tag, borderColor: teamColorMap.byRow(row.id)!.tag, color: '#ffffff' } : undefined}
                              title="Go to the lead cleaner's payment row"
                            >
                              <Users size={10} className={teamColorMap.byRow(row.id) ? 'text-white' : 'text-indigo-600'} />
                              <span>{displayVal}</span>
                            </button>
                          ) : (
                            <span
                              title={
                                refMoney(mcInfo, row)
                                  ? col.id === 'charges'
                                    ? `Charges recorded under primary cleaner: ${mcInfo!.primaryCleaner}`
                                    : col.id === 'received'
                                      ? `Payment received recorded under primary cleaner: ${mcInfo!.primaryCleaner}`
                                      : col.id === 'pending'
                                        ? `Paid under primary cleaner: ${mcInfo!.primaryCleaner}`
                                        : undefined
                                  : undefined
                              }
                              className={
                                refMoney(mcInfo, row) && (col.id === 'charges' || col.id === 'received')
                                  ? (isDarkCell ? 'text-indigo-300 italic font-semibold text-[11.5px]' : 'text-indigo-700 italic font-semibold text-[11.5px]')
                                  : refMoney(mcInfo, row) && col.id === 'payment_mode'
                                    ? (isDarkCell ? 'text-indigo-200 font-bold text-[11px]' : 'text-indigo-800 font-bold text-[11px]')
                                    : isPendingDue
                                      ? (isDarkCell ? 'text-rose-300 font-black drop-shadow-xs' : 'text-rose-600 font-black')
                                      : col.id === 'advance' && cleanNum(displayVal) > 0
                                        ? (isDarkCell ? 'text-amber-300 font-bold' : 'text-amber-800 font-bold bg-amber-100/70 px-1 py-0.5 rounded border border-amber-300')
                                      : col.id === 'pending' && displayVal === 'Nil'
                                        ? (isDarkCell ? 'text-slate-200 font-bold' : 'text-slate-800 font-bold')
                                        : col.id === 'charges' || col.id === 'received'
                                          ? (isDarkCell ? 'text-amber-300 font-black drop-shadow-xs' : 'text-slate-900 font-bold')
                                          : col.id === 'team_name' && displayVal
                                            ? (isDarkCell ? 'font-bold text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-500/40 text-[11px]' : 'font-bold text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 text-[11px]')
                                            : (isDarkCell ? 'text-white font-medium' : 'text-slate-800 font-medium')
                              }
                            >
                              {col.id === 'address' ? (
                                <span>{cleanAddressDisplay(displayVal)}</span>
                              ) : (displayVal !== undefined && displayVal !== null && displayVal !== '' ? String(displayVal) : '')}
                            </span>
                          )}
                          {!isCellEditing && DROPDOWN_COLS.has(col.id) && (
                            <ChevronDown size={12} className="absolute right-1 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
                          )}
                        </td>
                      )
                    })}

                    {/* Action Column: Visible Color Scheme Icons (Solid Black Background Removed) */}
                    <td
                      style={{
                        backgroundColor: rowBg,
                        borderRight: `4px solid ${hasCustomBlockColor ? palette.solidBorder : '#0f172a'}`,
                        borderTop: blockTopBorder,
                        borderBottom: blockBottomBorder,
                      }}
                      className={`w-20 text-center px-1 ${ROW_HEIGHT_MAP[rowHeightLevel].heightClass} ${ROW_HEIGHT_MAP[rowHeightLevel].pyClass}`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(row, targetIdx)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                            isDarkRow
                              ? 'border-white/25 bg-white/10 hover:bg-emerald-500/25 text-white hover:text-emerald-300'
                              : 'border-slate-300 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-500 text-slate-700 hover:text-emerald-800'
                          }`}
                          title="Edit entry"
                        >
                          <Pencil size={12} className={isDarkRow ? 'text-white' : 'text-slate-700'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(targetIdx)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                            isDarkRow
                              ? 'border-white/25 bg-white/10 hover:bg-rose-500/25 text-rose-300 hover:text-rose-200'
                              : 'border-slate-300 bg-slate-50 hover:bg-rose-50 hover:border-rose-500 text-slate-700 hover:text-rose-600'
                          }`}
                          title="Delete row"
                        >
                          <Trash2 size={12} className={isDarkRow ? 'text-rose-300' : 'text-slate-700'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          )}


        </table>

        {/* ── Bottom Table Action: Add New Empty Row (Blank Cleaner Block) ── */}
        <div className="p-3 bg-slate-100/80 border-t border-slate-300 flex items-center justify-center">
          <button
            type="button"
            onClick={handleAddBlankCleanerBlock}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[12px] shadow-sm transition-all cursor-pointer active:scale-95"
            title="Add strictly 3 new empty rows (new cleaner block)"
          >
            <Plus size={14} className="stroke-[2.5] shrink-0" />
            <span>Add New Empty Row (3 Rows)</span>
          </button>
        </div>

        {/* Empty State */}
        {gridRows.length === 0 && (
          <div className="p-16 text-center text-slate-400">
            <FileSpreadsheet size={44} className="mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-600 text-[15px]">No jobs recorded for {fmtDate(selectedDate)}</p>
            <p className="text-[12px] text-slate-400 mt-0.5">Right-click anywhere to add entries in this spreadsheet.</p>
            <button
              onClick={handleAddRow}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={14} /> Add First Row
            </button>
          </div>
        )}
      </div>

      {/* ── Right-Click Row Context Menu (Add Row at Top / Bottom) ── */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
          className="fixed z-[200] w-80 max-h-[92vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-300 py-2 text-[12px] font-sans animate-in fade-in zoom-in-95 select-none"
        >
          {(() => {
            const isStaffSection = (contextMenu.colId || 'staff_name') === 'staff_name'
            const currentColDef = columns.find(c => c.id === contextMenu.colId)

            return (
              <>
                {/* Header */}
                <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-bold">
                  <span>ROW #{contextMenu.rowIdx + 1} {currentColDef && !isStaffSection ? `· ${currentColDef.label}` : ''}</span>
                  <span className="font-semibold text-slate-700 truncate max-w-[120px]">{contextMenu.job.staff_name || 'Unassigned'}</span>
                </div>

                {/* Staff Block Level Actions: Only available when right-clicking on Staff Name section */}
                {isStaffSection && (
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        const sName = contextMenu.job.staff_name || ''
                        const bInfo = staffBlockInfoMap.get(contextMenu.job.id)
                        handleAddRowToStaff(sName, bInfo?.lastRowIdx ?? contextMenu.rowIdx)
                        setContextMenu(null)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
                    >
                      <Plus size={15} className="text-emerald-700" />
                      <span>Add Row to {contextMenu.job.staff_name || 'Staff'} (Expand Block)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleAddEmptyBlockAbove(contextMenu.job, contextMenu.rowIdx)
                        setContextMenu(null)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
                      title="Add a new 3-row empty cleaner block above this staff block"
                    >
                      <ArrowUpCircle size={15} className="text-emerald-700" />
                      <span>Add New Empty Block Above</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleAddEmptyBlockBelow(contextMenu.job, contextMenu.rowIdx)
                        setContextMenu(null)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
                      title="Add a new 3-row empty cleaner block below this staff block"
                    >
                      <ArrowDownCircle size={15} className="text-emerald-700" />
                      <span>Add New Empty Block Below</span>
                    </button>
                    <div className="h-px bg-slate-100 my-1" />
                  </div>
                )}

                {/* UX-146: row actions in order — Copy, Paste, Duplicate, Clear; the deletes are together at the bottom */}
                <div className="py-0.5">
                  <button
                    type="button"
                    onClick={() => handleCopyRow(contextMenu.rowIdx)}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-slate-100 text-slate-700 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
                    title="Copy this job (UX-137) — or hold Alt and drag the row onto another row"
                  >
                    <Copy size={14} className="text-teal-600" />
                    <span>Copy Row #{contextMenu.rowIdx + 1}</span>
                  </button>
                  {rowClip && rowClip.id !== gridRows[contextMenu.rowIdx]?.id && (
                    <button
                      type="button"
                      onClick={() => handlePasteRow(contextMenu.rowIdx)}
                      className="w-full px-3.5 py-1.5 text-left hover:bg-teal-50 text-teal-800 flex items-center gap-2.5 font-semibold transition-colors cursor-pointer"
                      title="Time, address, location, material, charges, mode and remarks of the copied row; this row keeps its cleaner"
                    >
                      <ClipboardPaste size={14} className="text-teal-600" />
                      <span className="truncate">Paste Row Here ({(rowClip.address || 'copied job').slice(0, 24)})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDuplicateRow(contextMenu.rowIdx)}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-slate-100 text-slate-700 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
                  >
                    <Copy size={14} className="text-blue-600" />
                    <span>Duplicate Row #{contextMenu.rowIdx + 1}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleClearRow(contextMenu.rowIdx)}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-slate-100 text-slate-700 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
                  >
                    <RotateCcw size={14} className="text-amber-600" />
                    <span>Clear Row Contents</span>
                  </button>
                </div>

                {/* ── ROW HEIGHT CONTROLS (Discrete levels: 2 steps down, default, 2 steps up) ── */}
                <div className="py-1 px-3 border-t border-b border-slate-100">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Rows size={13} className="text-emerald-700" />
                      <span>Row Height</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">{ROW_HEIGHT_MAP[rowHeightLevel]?.label}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                    {ROW_HEIGHT_LEVELS.map(lvl => {
                      const isCur = rowHeightLevel === lvl
                      const meta = ROW_HEIGHT_MAP[lvl]
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={() => handleSetRowHeight(lvl)}
                          className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg border text-center transition-all cursor-pointer ${
                            isCur
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-black'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-medium'
                          }`}
                          title={meta.label}
                        >
                          <span className="text-[11px] leading-none font-bold">{meta.rowHeightPx}</span>
                          <span className="text-[8.5px] opacity-80 mt-0.5">px</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* ── COLOR CUSTOMIZATION PANEL ── */}
                {isStaffSection ? (
                  /* 1. Whole Staff Block Color (Only when right-clicking on Staff Name) */
                  <div className="px-3 py-2 bg-white text-slate-800 rounded-2xl mx-1.5 border border-slate-200/90 shadow-md">
                    <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[11.5px]">
                        <Palette size={13} className="text-teal-600" />
                        <span>Staff Block Color</span>
                      </div>
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setColorPaletteTab('light')
                            safeSet('safaeewala_excel_color_tab', 'light')
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            colorPaletteTab === 'light' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Light
                        </button>
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setColorPaletteTab('solid')
                            safeSet('safaeewala_excel_color_tab', 'solid')
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            colorPaletteTab === 'solid' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Solid
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] mb-1 px-0.5">
                      <span className="text-slate-500 font-medium">Whole Staff Block:</span>
                      <span className="text-teal-900 font-bold truncate max-w-[150px] bg-teal-50 px-2 py-0.5 rounded border border-teal-200 text-[10.5px]">
                        {contextMenu.job.staff_name || 'Staff Block'}
                      </span>
                    </div>

                    {/* White Color Option at Top of Palette */}
                    <div className="mb-1.5">
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setBlockColor(contextMenu.job, contextMenu.rowIdx, 'white')
                        }}
                        className={`w-full py-1.5 px-2.5 rounded-xl border flex items-center justify-between text-[11px] font-bold transition-all cursor-pointer ${
                          contextMenu.job.row_color === 'white'
                            ? 'bg-slate-100 border-teal-500 ring-2 ring-teal-500/25 text-slate-900 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-white border border-slate-300 shadow-2xs flex items-center justify-center">
                            {contextMenu.job.row_color === 'white' && <Check size={10} className="text-slate-900 stroke-[3]" />}
                          </span>
                          <span>Pure White (Default / Clean)</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">#FFFFFF</span>
                      </button>
                    </div>

                    {/* Compact Custom Color Slider & Brightness Bar */}
                    <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200 mb-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                          <SlidersHorizontal size={11} className="text-teal-600" />
                          Custom Hue & Brightness
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs shrink-0"
                            style={{ backgroundColor: currentCustomHex }}
                          />
                          <span className="font-mono text-[10px] font-bold text-slate-700 uppercase">
                            {currentCustomHex}
                          </span>
                        </div>
                      </div>

                      {/* Hue Slider */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold leading-none">
                          <span>Color Hue</span>
                          <span>{customHue}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={customHue}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => setCustomHue(Number(e.target.value))}
                          className="w-full h-1.5 rounded-md appearance-none cursor-pointer outline-none block"
                          style={{ background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)' }}
                        />
                      </div>

                      {/* Brightness / Lightness Slider */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold leading-none">
                          <span>Brightness</span>
                          <span>{customLightness}%</span>
                        </div>
                        <input
                          type="range"
                          min="15"
                          max="95"
                          value={customLightness}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => setCustomLightness(Number(e.target.value))}
                          className="w-full h-1.5 rounded-md appearance-none cursor-pointer outline-none block"
                          style={{ background: `linear-gradient(to right, hsl(${customHue}, 80%, 15%) 0%, hsl(${customHue}, 80%, 50%) 50%, hsl(${customHue}, 80%, 95%) 100%)` }}
                        />
                      </div>

                      {/* Apply & Save Buttons */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setBlockColor(contextMenu.job, contextMenu.rowIdx, currentCustomHex)
                          }}
                          className="flex-1 py-1 px-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10.5px] transition-colors cursor-pointer text-center shadow-2xs"
                        >
                          Apply Custom Color
                        </button>
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            handleSaveFavoriteColor(currentCustomHex)
                          }}
                          className="py-1 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10.5px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                          title="Save to favorites"
                        >
                          <Star size={11} className="text-amber-600 fill-amber-500" />
                          <span>Save</span>
                        </button>
                      </div>

                      {/* Saved Favorites Row */}
                      {favoriteColors.length > 0 && (
                        <div className="pt-1 border-t border-slate-200/80 flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                          <span className="text-[9px] font-bold text-slate-400 shrink-0">Saved:</span>
                          {favoriteColors.map(hex => (
                            <div key={hex} className="group relative shrink-0">
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation()
                                  setBlockColor(contextMenu.job, contextMenu.rowIdx, hex)
                                }}
                                style={{ backgroundColor: hex }}
                                className="w-4 h-4 rounded-full border border-black/15 shadow-2xs hover:scale-115 transition-transform cursor-pointer"
                                title={`Apply saved color ${hex}`}
                              />
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => handleRemoveFavoriteColor(hex, e)}
                                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-slate-800 text-white text-[8px] hidden group-hover:flex items-center justify-center cursor-pointer"
                                title="Remove"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Presets Grid */}
                    <div className="grid grid-cols-5 gap-2 py-1 place-items-center">
                      {(colorPaletteTab === 'light' ? LIGHT_PALETTE_KEYS : SOLID_PALETTE_KEYS).map(pk => {
                        const p = BLOCK_PALETTES[pk]
                        const currentPalette = getCleanerPalette(contextMenu.job.staff_name, 0, contextMenu.job.row_color)
                        const isSelected = contextMenu.job.row_color === p.id || (!contextMenu.job.row_color && currentPalette.id === p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => {
                              e.stopPropagation()
                              setBlockColor(contextMenu.job, contextMenu.rowIdx, p.id)
                            }}
                            style={{ backgroundColor: p.solidBg, borderColor: p.solidBorder }}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-110 relative ${
                              isSelected ? 'ring-2 ring-teal-500 ring-offset-2 scale-110 shadow-sm' : 'hover:border-slate-400'
                            }`}
                            title={`${p.name} (${colorPaletteTab === 'light' ? 'Light' : 'Solid'})`}
                          >
                            {isSelected && (
                              <Check
                                size={11}
                                className={p.isLight ? 'text-slate-900 stroke-[3]' : 'text-white stroke-[3]'}
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{colorPaletteTab === 'light' ? '20 Light Colors' : '20 Solid Colors'}</span>
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          resetBlockColor(contextMenu.job, contextMenu.rowIdx)
                        }}
                        className="text-teal-700 hover:text-teal-900 underline font-semibold cursor-pointer"
                      >
                        Reset Block
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 2. Granular Color Customizer (Specific Cell Only vs Whole Row) */
                  <div className="px-3 py-2 bg-white text-slate-800 rounded-2xl mx-1.5 border border-slate-200/90 shadow-md">
                    <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[11.5px]">
                        <Palette size={13} className="text-teal-600" />
                        <span>{colorTargetScope === 'cell' ? 'Cell Color' : 'Whole Row Color'}</span>
                      </div>
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setColorPaletteTab('light')
                            safeSet('safaeewala_excel_color_tab', 'light')
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            colorPaletteTab === 'light' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Light
                        </button>
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            setColorPaletteTab('solid')
                            safeSet('safaeewala_excel_color_tab', 'solid')
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            colorPaletteTab === 'solid' ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Solid
                        </button>
                      </div>
                    </div>

                    {/* Scope Selector: Specific Cell Only vs Whole Row */}
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 mb-1.5">
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setColorTargetScope('cell')
                        }}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer truncate ${
                          colorTargetScope === 'cell' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                        title="Change color of ONLY this specific cell"
                      >
                        This Cell ({currentColDef?.label || contextMenu.colId})
                      </button>
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setColorTargetScope('row')
                        }}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer truncate ${
                          colorTargetScope === 'row' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                        title="Change color of the entire row"
                      >
                        Whole Row #{contextMenu.rowIdx + 1}
                      </button>
                    </div>

                    {/* White Color Option at Top of Palette */}
                    <div className="mb-1.5">
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          if (colorTargetScope === 'cell') {
                            handleSetCellColor(contextMenu.job.id, contextMenu.colId, 'white')
                          } else {
                            handleSetSingleRowColor(contextMenu.rowIdx, 'white')
                          }
                        }}
                        className={`w-full py-1.5 px-2.5 rounded-xl border flex items-center justify-between text-[11px] font-bold transition-all cursor-pointer ${
                          (colorTargetScope === 'cell' ? cellColors[`${contextMenu.job.id}_${contextMenu.colId}`] === 'white' : contextMenu.job.row_color === 'white')
                            ? 'bg-slate-100 border-teal-500 ring-2 ring-teal-500/25 text-slate-900 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-white border border-slate-300 shadow-2xs flex items-center justify-center">
                            {(colorTargetScope === 'cell' ? cellColors[`${contextMenu.job.id}_${contextMenu.colId}`] === 'white' : contextMenu.job.row_color === 'white') && (
                              <Check size={10} className="text-slate-900 stroke-[3]" />
                            )}
                          </span>
                          <span>Pure White (Default / Clean)</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">#FFFFFF</span>
                      </button>
                    </div>

                    {/* Compact Custom Color Slider & Brightness Bar */}
                    <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200 mb-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                          <SlidersHorizontal size={11} className="text-teal-600" />
                          Custom Hue & Brightness
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs shrink-0"
                            style={{ backgroundColor: currentCustomHex }}
                          />
                          <span className="font-mono text-[10px] font-bold text-slate-700 uppercase">
                            {currentCustomHex}
                          </span>
                        </div>
                      </div>

                      {/* Hue Slider */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold leading-none">
                          <span>Color Hue</span>
                          <span>{customHue}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={customHue}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => setCustomHue(Number(e.target.value))}
                          className="w-full h-1.5 rounded-md appearance-none cursor-pointer outline-none block"
                          style={{ background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)' }}
                        />
                      </div>

                      {/* Brightness / Lightness Slider */}
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold leading-none">
                          <span>Brightness</span>
                          <span>{customLightness}%</span>
                        </div>
                        <input
                          type="range"
                          min="15"
                          max="95"
                          value={customLightness}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => setCustomLightness(Number(e.target.value))}
                          className="w-full h-1.5 rounded-md appearance-none cursor-pointer outline-none block"
                          style={{ background: `linear-gradient(to right, hsl(${customHue}, 80%, 15%) 0%, hsl(${customHue}, 80%, 50%) 50%, hsl(${customHue}, 80%, 95%) 100%)` }}
                        />
                      </div>

                      {/* Apply & Save Buttons */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            if (colorTargetScope === 'cell') {
                              handleSetCellColor(contextMenu.job.id, contextMenu.colId, currentCustomHex)
                            } else {
                              handleSetSingleRowColor(contextMenu.rowIdx, currentCustomHex)
                            }
                          }}
                          className="flex-1 py-1 px-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10.5px] transition-colors cursor-pointer text-center shadow-2xs"
                        >
                          Apply Custom Color
                        </button>
                        <button
                          type="button"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            handleSaveFavoriteColor(currentCustomHex)
                          }}
                          className="py-1 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10.5px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                          title="Save to favorites"
                        >
                          <Star size={11} className="text-amber-600 fill-amber-500" />
                          <span>Save</span>
                        </button>
                      </div>

                      {/* Saved Favorites Row */}
                      {favoriteColors.length > 0 && (
                        <div className="pt-1 border-t border-slate-200/80 flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                          <span className="text-[9px] font-bold text-slate-400 shrink-0">Saved:</span>
                          {favoriteColors.map(hex => (
                            <div key={hex} className="group relative shrink-0">
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation()
                                  if (colorTargetScope === 'cell') {
                                    handleSetCellColor(contextMenu.job.id, contextMenu.colId, hex)
                                  } else {
                                    handleSetSingleRowColor(contextMenu.rowIdx, hex)
                                  }
                                }}
                                style={{ backgroundColor: hex }}
                                className="w-4 h-4 rounded-full border border-black/15 shadow-2xs hover:scale-115 transition-transform cursor-pointer"
                                title={`Apply favorite ${hex}`}
                              />
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => handleRemoveFavoriteColor(hex, e)}
                                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-slate-800 text-white text-[8px] hidden group-hover:flex items-center justify-center cursor-pointer"
                                title="Remove"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Presets Grid */}
                    <div className="grid grid-cols-5 gap-2 py-1 place-items-center">
                      {(colorPaletteTab === 'light' ? LIGHT_PALETTE_KEYS : SOLID_PALETTE_KEYS).map(pk => {
                        const p = BLOCK_PALETTES[pk]
                        const isCellMatch = cellColors[`${contextMenu.job.id}_${contextMenu.colId}`] === p.id
                        const isRowMatch = contextMenu.job.row_color === p.id
                        const isSelected = colorTargetScope === 'cell' ? isCellMatch : isRowMatch

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => {
                              e.stopPropagation()
                              if (colorTargetScope === 'cell') {
                                handleSetCellColor(contextMenu.job.id, contextMenu.colId, p.id)
                              } else {
                                handleSetSingleRowColor(contextMenu.rowIdx, p.id)
                              }
                            }}
                            style={{ backgroundColor: p.solidBg, borderColor: p.solidBorder }}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-110 relative ${
                              isSelected ? 'ring-2 ring-teal-500 ring-offset-2 scale-110 shadow-sm' : 'hover:border-slate-400'
                            }`}
                            title={`${p.name} (${colorPaletteTab === 'light' ? 'Light' : 'Solid'})`}
                          >
                            {isSelected && (
                              <Check
                                size={11}
                                className={p.isLight ? 'text-slate-900 stroke-[3]' : 'text-white stroke-[3]'}
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{colorPaletteTab === 'light' ? '20 Light Colors' : '20 Solid Colors'}</span>
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          if (colorTargetScope === 'cell') {
                            handleResetCellColor(contextMenu.job.id, contextMenu.colId)
                          } else {
                            handleResetSingleRowColor(contextMenu.rowIdx)
                          }
                        }}
                        className="text-teal-700 hover:text-teal-900 underline font-semibold cursor-pointer"
                      >
                        Reset {colorTargetScope === 'cell' ? 'Cell Color' : 'Row Color'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="h-px bg-slate-100 my-1" />

                {/* Row history (UX-40) */}
                <div className="py-0.5">
                  <button
                    type="button"
                    onClick={() => openRowHistory(contextMenu.job)}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
                  >
                    <History size={14} />
                    <span>Row history</span>
                  </button>
                </div>

                {/* UX-146: delete — the row first, then the whole cleaner block (one Delete Block only) */}
                <div className="py-0.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteRow(contextMenu.rowIdx)
                      setContextMenu(null)
                    }}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-rose-50 text-rose-700 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} className="text-rose-500 shrink-0" />
                    <span>Delete Row #{contextMenu.rowIdx + 1}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteStaffBlock(contextMenu.job)}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-rose-50 text-rose-700 flex items-center gap-2.5 font-bold transition-colors cursor-pointer"
                    title={`Delete entire staff block for ${contextMenu.job.staff_name || 'this cleaner'}`}
                  >
                    <Trash2 size={14} className="text-rose-600 shrink-0" />
                    <span>Delete Block ({contextMenu.job.staff_name || 'Staff Block'})</span>
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ── Row history (UX-40) ── */}
      <Modal open={!!rowHistory} onClose={() => setRowHistory(null)} title={`Row history · ${rowHistory?.label || ''}`} size="md">
        {rowHistory?.loading ? (
          <p className="text-[12.5px] text-slate-400 py-6 text-center">Loading…</p>
        ) : rowHistory && rowHistory.entries.length === 0 ? (
          <p className="text-[12.5px] text-slate-400 py-6 text-center">No recorded changes for this row yet. History starts with this version; new unsaved rows have none.</p>
        ) : (
          <ul className="space-y-2 text-[12.5px]">
            {rowHistory?.entries.map(h => (
              <li key={h.id} className="rounded-xl border border-slate-200 px-3 py-2">
                <p className="font-bold text-slate-800">
                  {h.action} · {new Date(h.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })}
                  <span className="font-normal text-slate-500"> · {h.user_name || 'System'}</span>
                </p>
                {h.details && <p className="text-slate-600 mt-0.5">{h.details}</p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* ── Long periods: draw rows in pages (AUD-56, UX-38) ── */}
      {filteredGridRows.length > visibleGridRows.length && (
        <div className="px-5 py-2 bg-amber-50 border-t border-amber-200 text-[12px] text-amber-900 flex items-center justify-between shrink-0">
          <span>Showing {visibleGridRows.length.toLocaleString()} of {filteredGridRows.length.toLocaleString()} rows (totals include all rows).</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setRenderLimit(l => l + RENDER_PAGE)} className="px-3 py-1 rounded-lg bg-white border border-amber-300 font-bold hover:bg-amber-100 cursor-pointer">Show {RENDER_PAGE} more</button>
            <button type="button" onClick={() => setRenderLimit(filteredGridRows.length)} className="px-3 py-1 rounded-lg bg-white border border-amber-300 font-bold hover:bg-amber-100 cursor-pointer">Show all</button>
          </span>
        </div>
      )}

      {/* ── Status Bar / Footer (Sticky Bottom - Charges, Received, Pending, Duty, OT fixed) ── */}
      <footer className="bg-[#e5e7eb] border-t border-slate-300 px-5 py-2 text-[11.5px] text-slate-700 flex items-center justify-between shrink-0 select-none shadow-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-emerald-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block animate-pulse" /> Ready
          </span>
          <span>·</span>
          <span className="font-bold">{gridRows.length} Total Rows</span>
          <span>·</span>
          <span className="text-slate-500">Tip: Click 'I' button to customize columns · Right-click row for options</span>
        </div>

        <div className="flex items-center gap-5 font-mono text-[12px] font-bold">
          <span>Charges: <strong className="text-indigo-950 font-black">AED {totals.totalCharges.toLocaleString()}</strong></span>
          <span>Received: <strong className="text-emerald-950 font-black">AED {totals.totalReceived.toLocaleString()}</strong></span>
          <span>Pending: <strong className="text-rose-700 font-black">AED {totals.totalPending.toLocaleString()}</strong></span>
          {totals.totalAdvance > 0 && (
            <span>Advance: <strong className="text-amber-800 font-black">AED {totals.totalAdvance.toLocaleString()}</strong></span>
          )}
          <span>Duty: <strong className="text-slate-900 font-black">{totals.totalDuty}h</strong></span>
          <span>OT: <strong className="text-amber-800 font-black">{totals.totalOT}h</strong></span>
        </div>
      </footer>

      {/* ── Columns Customization Pop-up Modal ── */}
      <Modal
        open={showColumnsModal}
        onClose={() => setShowColumnsModal(false)}
        title="Customize Columns (Sequence & Visibility)"
        size="md"
      >
        <div className="space-y-3.5">
          {/* Header Controls inside modal */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-slate-700">
                Sheet Columns:
              </span>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {columns.length} of {columnOrder.length} Visible
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={showAllColumns}
                className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
              >
                Show All
              </button>
              <button
                type="button"
                onClick={resetColumnOrder}
                className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
              >
                Reset Default
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Reorder the columns by drag and drop or with the arrows, and show or hide them with the checkboxes:
          </p>

          {/* Draggable column list */}
          <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1">
            {columnOrder.map((colId, idx) => {
              const def = DEFAULT_COLUMN_DEFS.find(c => c.id === colId)
              if (!def) return null
              const isHidden = hiddenColIds.includes(colId)
              const isDragging = modalDragId === colId
              const isOver = modalDragOverId === colId

              return (
                <div
                  key={colId}
                  draggable
                  onDragStart={e => handleModalDragStart(e, colId)}
                  onDragOver={e => handleModalDragOver(e, colId)}
                  onDrop={e => handleModalDrop(e, colId)}
                  onDragEnd={() => {
                    setModalDragId(null)
                    setModalDragOverId(null)
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-[12px] transition-all select-none ${
                    isDragging
                      ? 'opacity-40 bg-slate-100 border-dashed border-slate-400'
                      : isOver
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400'
                      : isHidden
                      ? 'bg-slate-50/70 border-slate-200 opacity-60 text-slate-400'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Drag Handle */}
                    <div
                      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 p-0.5"
                      title="Drag to reorder sequence"
                    >
                      <GripVertical size={16} />
                    </div>

                    {/* Visibility Checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggleColumnVisibility(colId)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                      />
                      <span className={`font-bold ${isHidden ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {def.label}
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Type Badge */}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 uppercase">
                      {def.type}
                    </span>

                    {/* Move Up / Down Buttons */}
                    <div className="flex items-center gap-0.5 ml-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveColumn(idx, -1)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Move column up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === columnOrder.length - 1}
                        onClick={() => moveColumn(idx, 1)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Move column down"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-2 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onClick={() => setShowColumnsModal(false)}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              Done & Apply
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Google Drive & Webhook Setup Modal ── */}
      <GoogleDriveWebhookModal
        open={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        selectedDate={selectedDate}
        todayJobsCount={gridRows.length}
        onSendBackupNow={handleBackupToDrive}
        isUploading={isBackingUp}
        driveStatus={driveStatus}
        driveLink={driveLink}
        driveError={driveError}
      />

      {/* ── Monthly Schedule Synchronization Modal ── */}
      {showMonthlySyncModal && (
        <MonthlyScheduleSyncModal
          open={showMonthlySyncModal}
          onClose={() => setShowMonthlySyncModal(false)}
          dateStr={effectiveTargetDate}
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
      {/* ── Spreadsheet Edit Entry Modal (Professional Pop-up) ── */}
      {editingRowState && (
        <SpreadsheetEditModal
          open={Boolean(editingRowState)}
          row={editingRowState.row}
          index={editingRowState.index}
          onClose={() => setEditingRowState(null)}
          onSave={handleSaveEditedRow}
          employees={employees.filter(e => isAssignable(e) && isSheetCleaner(e))} // R-EMP-12, R-SHEET-02
          clients={clients}
          areaOptions={areaOptions}
          existingRows={gridRows}
        />
      )}

      {/* ── Quick New Client Modal (When Unregistered Client Entered) ── */}
      {quickClientState.open && (
        <QuickNewClientModal
          open={quickClientState.open}
          initialBuilding={quickClientState.name}
          initialName=""
          initialArea={gridRows[quickClientState.rowIdx ?? 0]?.area || ''}
          onClose={() => {
            // Registered: onClientRegistered already wrote the row (this close comes right after it)
            if (quickClientRegisteredRef.current) { quickClientRegisteredRef.current = false; return }
            // Cancelled: keep the typed address on the row, as typed
            if (quickClientState.rowIdx !== null && quickClientState.rowIdx < gridRows.length && quickClientState.name) {
              const updated = [...gridRows]
              const row = { ...updated[quickClientState.rowIdx] }
              if (row.address !== quickClientState.name) {
                row.address = quickClientState.name
                updated[quickClientState.rowIdx] = row
                pushState(updated)
              }
            }
            setQuickClientState({ open: false, rowIdx: null, name: '' })
          }}
          onClientRegistered={(newClient) => {
            quickClientRegisteredRef.current = true
            if (quickClientState.rowIdx !== null && quickClientState.rowIdx < gridRows.length) {
              const updated = [...gridRows]
              const row = { ...updated[quickClientState.rowIdx] }
              row.address = newClient.building_name || newClient.full_name || quickClientState.name
              if (newClient.area) row.area = newClient.area
              updated[quickClientState.rowIdx] = row
              pushState(updated)
            }
            setQuickClientState({ open: false, rowIdx: null, name: '' })
            showToast(`✓ Client "${newClient.full_name}" registered & address saved!`)
          }}
        />
      )}

      {/* ── Dedicated Add Job Modal (From Header Button) ── */}
      {showAddJobModal && (
        <Modal
          open={showAddJobModal}
          onClose={() => setShowAddJobModal(false)}
          title="Add Job Entry"
          size="2xl"
          className="max-w-6xl w-full max-h-[96vh] min-h-[86vh]" // UX-74: taller, so the time lists open in full
          headerActions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddJobModal(false)}
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
                <span>Save</span>
              </button>
            </div>
          }
        >
          <div className="p-2">
            <AddJobForm
              employees={employees}
              clients={clients}
              initial={{ date: effectiveTargetDate, start_time: '09:00', end_time: '13:00', duty_hours: 4 }}
              // R-JOB-01 / UX-66: rows on screen count too, saved or not — team letters and clashes
              existingJobsForDate={gridRows.filter(r => (r.date || effectiveTargetDate) === effectiveTargetDate)}
              onSave={jobData => {
                const newJob: DailyJob = {
                  ...jobData,
                  id: newRowId('new'),
                  created_at: new Date().toISOString()
                }
                // UX-66: a team job gets one row per cleaner, like the Daily Job Sheet; Save folds them into one job
                const names = splitStaffNames(newJob.staff_name || '')
                const wanted = (newJob.team_name || '').trim()
                const takenOnDate = gridRows.some(r => (r.date || '') === newJob.date &&
                  String((r as { _teamReference?: string })._teamReference || r.team_name || '').trim().toUpperCase() === wanted.toUpperCase())
                const teamRef = names.length > 1
                  ? (wanted && wanted.toLowerCase() !== 'project team' && !takenOnDate ? wanted : nextTeamRef(gridRows, newJob.date))
                  : ''
                const newRows = expandTeamJob(newJob, teamRef)
                // UX-84: a cleaner's block always has 3 rows, also for a cleaner new to the sheet
                pushState(recalculateAllRowsOT(padCleanerBlocks(placeRowsInCleanerBlocks(gridRows, newRows), effectiveTargetDate)))
                setShowAddJobModal(false)
                showToast(names.length > 1
                  ? `✓ ${teamRef} added — ${names.length} cleaners, one row each`
                  : `✓ Job added for ${newJob.staff_name || 'Staff'}`)
              }}
              onClose={() => setShowAddJobModal(false)}
            />
          </div>
        </Modal>
      )}

      {/* R-ATT-11: quick attendance without leaving the sheet */}
      {showQuickAttendance && (
        <QuickAttendanceModal
          open={showQuickAttendance}
          onClose={() => setShowQuickAttendance(false)}
          date={effectiveTargetDate}
          onViewDetails={async () => {
            if (hasUnsavedChanges) { try { await handleSaveAll('auto') } catch { /* kept as a draft */ } }
            setShowQuickAttendance(false)
            navigate(`/attendance?date=${effectiveTargetDate}`)
          }}
        />
      )}

      {/* ── Change Log History Audit Modal ── */}
      {showChangeLogModal && (
        <ChangeLogHistoryModal
          open={showChangeLogModal}
          onClose={() => setShowChangeLogModal(false)}
          selectedDate={effectiveTargetDate}
        />
      )}
    </div>
  )
}
