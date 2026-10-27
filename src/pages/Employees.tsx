import { useState, useRef, useMemo, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import {
  Search, AlertTriangle, Phone, Shield, Users, UserCheck, Star,
  TrendingUp, Trash2, CheckCircle, CheckCircle2, Upload, Download, FileSpreadsheet,
  Clock, ExternalLink, FileText, Calendar, RotateCcw, X, Filter,
  Flame, Zap, Briefcase, ArrowUpDown, LayoutGrid, List, ChevronRight, ChevronDown,
  DollarSign, Award, Sparkles, Building2, MapPin, Eye, EyeOff, Pencil, Check, Paperclip
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero, type HeroNotification } from '@/components/layout/PageHero'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { formatDate, daysUntil, isParentCompanyEmployee, isThirdPartyEmployee, matchesAgencyFilter } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { Employee, DailyJob, EmployeeRole, Agency, EmployeeDocument } from '@/types'
import { getAssignableClients, getEmployeeDailyJobsHistory, calcJobOTHours, getEmployeeMonthlySalary, formatMonthlySalary, splitStaffNames, MONTHLY_WORK_HOURS } from '@/lib/clientDataSync'
import { EmployeeFormModal } from '@/components/employees/EmployeeFormModal'
import { OvertimeWidget, LiveCrewWidget, ComplianceWidget, SkillsWidget } from '@/components/employees/EmployeeWidgets'

/* ─── Excel import/export helpers ─── */
function toISODate(val: any): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toISOString().split('T')[0]
}

function parseEmpRole(v: string): EmployeeRole {
  const s = v?.toLowerCase().trim() ?? ''
  if (s === 'supervisor' || s === 'crew_lead' || s === 'crew lead' || s === 'lead') return 'supervisor'
  if (s === 'ducting' || s === 'duct' || s === 'technical' || s === 'technician') return 'technical'
  if (s === 'store_cleaner' || s === 'store cleaner' || s === 'store') return 'store_cleaner'
  if (s === 'driver') return 'driver'
  return 'cleaner'
}

function formatEmpRole(role?: string): string {
  if (role === 'supervisor' || role === 'crew_lead') return 'Supervisor'
  if (role === 'ducting' || role === 'technical') return 'Technical'
  if (role === 'store_cleaner') return 'Store Cleaner'
  if (role === 'driver') return 'Driver'
  return 'Cleaner'
}

function getRoleBadgeStyle(role?: string) {
  if (role === 'supervisor' || role === 'crew_lead') {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  }
  if (role === 'ducting' || role === 'technical') {
    return 'bg-cyan-50 text-cyan-700 border-cyan-200'
  }
  if (role === 'store_cleaner') {
    return 'bg-purple-50 text-purple-700 border-purple-200'
  }
  if (role === 'driver') {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function parseEmpStatus(v: string): Employee['status'] {
  const s = v?.toLowerCase().replace(/\s/g, '_').trim() ?? ''
  if (s === 'on_leave')               return 'on_leave'
  if (s === 'inactive')               return 'inactive'
  if (s === 'engaged_in_project')     return 'engaged_in_project'
  return 'active'
}

export function getEmployeeAgencySource(emp: { agency_id?: string; agency_name?: string; email?: string | null }): string {
  if (isParentCompanyEmployee(emp) || !emp.agency_name) {
    return 'Safaeewala'
  }
  const cleanName = emp.agency_name.trim()
  if (cleanName.toLowerCase().includes('in-house') || cleanName.toLowerCase().includes('direct')) {
    return 'Safaeewala'
  }
  return cleanName
}

function exportEmployeesXLSX(
  employees: Employee[],
  statsMap: Map<string, { shifts: number; dutyHours: number; otHours: number }>
) {
  const rows = employees.map((e, i) => {
    const st = statsMap.get(e.id)
    const dutyHours = st?.dutyHours ?? 0
    const otHours = st?.otHours ?? 0
    // OT hours fall inside the duty window, so they are not added on top
    const totalHours = dutyHours
    const monthlySalary = getEmployeeMonthlySalary(e)
    return {
      'Emp ID':                    `EMP-${String(i + 1).padStart(3, '0')}`,
      'Full Name':                 e.full_name,
      'Role':                      formatEmpRole(e.role),
      'Status':                    e.status === 'on_leave' ? 'On Leave' : e.status.charAt(0).toUpperCase() + e.status.slice(1),
      'Duty Hours':                dutyHours,
      'OT Hours':                  otHours,
      'Total Hours':               totalHours,
      'Total Shifts':              st?.shifts ?? 0,
      'Monthly Salary (AED)':      monthlySalary,
      'Agency':                    getEmployeeAgencySource(e),
      'Phone':                     e.phone,
      'Nationality':               e.nationality,
      'Emirates ID':               e.emirates_id,
      'Visa Expiry':               e.visa_expiry,
      'Work Permit Expiry':        e.work_permit_expiry,
      'Passport Expiry':           e.passport_expiry,
      'Joining Date':              e.joined_date,
      'End Date':                  e.end_date || '',
    }
  })
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Employees')
  XLSX.writeFile(wb, `employees-duty-ot-${new Date().toISOString().split('T')[0]}.xlsx`)
}

async function parseEmployeesFile(file: File): Promise<Omit<Employee, 'id' | 'created_at'>[]> {
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]])
  return rows
    .map(r => {
      const name = String(r['Full Name'] ?? r['full_name'] ?? '').trim()
      if (!name) return null
      return {
        full_name:                  name,
        phone:                      String(r['Phone'] ?? r['phone'] ?? '').trim(),
        email:                      String(r['Email'] ?? r['email'] ?? '').trim() || undefined,
        role:                       parseEmpRole(String(r['Role'] ?? '')),
        nationality:                String(r['Nationality'] ?? r['nationality'] ?? '').trim(),
        emirates_id:                String(r['Emirates ID'] ?? r['emirates_id'] ?? '').trim(),
        pay_rate_hourly:            Number(r['Pay Rate (AED/hr)'] ?? r['pay_rate_hourly']) || 0, // no invented rate (AUD-09)
        monthly_salary:             Number(r['Monthly Salary (AED)'] ?? r['monthly_salary']) || Math.round((Number(r['Pay Rate (AED/hr)']) || 0) * MONTHLY_WORK_HOURS),
        visa_expiry:                toISODate(r['Visa Expiry'] ?? r['visa_expiry']),
        work_permit_expiry:         toISODate(r['Work Permit Expiry'] ?? r['work_permit_expiry']),
        passport_expiry:            toISODate(r['Passport Expiry'] ?? r['passport_expiry']),
        skills:                     [],
        status:                     parseEmpStatus(String(r['Status'] ?? '')),
        joined_date:                toISODate(r['Joining Date'] ?? r['Joined Date'] ?? r['joined_date']) || new Date().toISOString().split('T')[0],
        end_date:                   toISODate(r['End Date'] ?? r['end_date']) || undefined,
        agency_name:                String(r['Agency'] ?? r['agency_name'] ?? '').trim() || undefined,
      } as Omit<Employee, 'id' | 'created_at'>
    })
    .filter(Boolean) as Omit<Employee, 'id' | 'created_at'>[]
}

/* ─── Avatar palette ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72', border: '#b2ded0' },
  { bg: '#fce4d6', text: '#c66a3a', border: '#f7c5a8' },
  { bg: '#e4dff5', text: '#6b5bb5', border: '#c9beea' },
  { bg: '#d6e7f5', text: '#2d6ea8', border: '#abd0ee' },
  { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  { bg: '#fae8ff', text: '#a21caf', border: '#f0abfc' },
]

function Avatar({ name, size = 'md', idx = 0 }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; idx?: number }) {
  const parts = name.trim().split(' ')
  const init = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'EM'
  const dims = size === 'xl' ? 'w-16 h-16 text-[18px]' : size === 'lg' ? 'w-14 h-14 text-[15px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-11 h-11 text-[13px]'
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div
      className={`${dims} rounded-2xl flex items-center justify-center font-black shrink-0 shadow-xs border`}
      style={{ background: color.bg, color: color.text, borderColor: color.border }}
    >
      {init}
    </div>
  )
}

/* ─── Document expiry indicator ─── */
function ExpiryIndicator({ date, label }: { date: string | undefined | null; label: string }) {
  if (!date) return (
    <div className="rounded-xl p-3 text-center border border-slate-200/80 bg-slate-50/70">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="text-[11px] mt-0.5 text-slate-400 font-medium">Not recorded</p>
    </div>
  )
  const days = daysUntil(date)
  let bg = 'bg-emerald-50/80 border-emerald-200'; let text = 'text-emerald-800'
  if (days < 0)        { bg = 'bg-rose-50 border-rose-200';   text = 'text-rose-800'   }
  else if (days < 30)  { bg = 'bg-rose-50 border-rose-200';   text = 'text-rose-800'   }
  else if (days < 90)  { bg = 'bg-amber-50 border-amber-200'; text = 'text-amber-800' }
  return (
    <div className={`rounded-xl p-3 text-center border ${bg}`}>
      <p className={`text-[11px] font-bold ${text}`}>{label}</p>
      <p className={`text-[11px] mt-0.5 ${text} font-medium`}>{formatDate(date)}</p>
      {days < 90 && (
        <span className={`inline-block text-[10px] font-extrabold px-1.5 py-0.2 rounded-md mt-1 ${days < 0 ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'}`}>
          {days < 0 ? 'EXPIRED' : `${days}d remaining`}
        </span>
      )}
    </div>
  )
}

/* ─── Status badge ─── */
const statusStyles: Record<string, { bg: string; dot: string; label: string }> = {
  active:              { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', label: 'Active' },
  inactive:            { bg: 'bg-slate-100 text-slate-600 border-slate-200',     dot: 'bg-slate-400',   label: 'Inactive' },
  on_leave:            { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',   dot: 'bg-indigo-500',  label: 'On Leave' },
  engaged_in_project:  { bg: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-500',    label: 'Engaged' },
}

function StatusBadge({ status }: { status: string }) {
  const s = statusStyles[status] ?? { bg: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', label: status }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-2xs ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

type EmployeeDatePreset = 'all' | 'today' | 'yesterday' | '7days' | '30days' | '3months' | '6months' | '1year' | 'custom'
type SortBy = 'working_today' | 'ot_desc' | 'duty_desc' | 'shifts_desc' | 'name_asc' | 'rate_desc'
type ViewMode = 'grid' | 'table'

export function Employees() {
  const { employees, bookings, dailyJobs, clients, agencies, addEmployee, updateEmployee, deleteEmployee } = useData()
  const navigate = useNavigate()

  // Table Column Visibility (persisted per browser)
  const EMPLOYEE_TABLE_COLUMNS = [
    { id: 'employee', label: 'Employee Info', alwaysVisible: true },
    { id: 'role', label: 'Role' },
    { id: 'status', label: 'Live Status' },
    { id: 'dutyHours', label: 'Duty Hours' },
    { id: 'otHours', label: 'Overtime (OT)' },
    { id: 'totalHours', label: 'Total Hours' },
    { id: 'shifts', label: 'Shifts' },
    { id: 'salary', label: 'Monthly Salary' },
    { id: 'visa', label: 'Visa Expiry' },
    { id: 'actions', label: 'Actions' },
  ]
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() =>
    safeLocalStorageGet<string[]>('safaeewala_employees_hidden_columns', [])
  )
  const [columnVisibilityOpen, setColumnVisibilityOpen] = useState(false)
  const columnVisibilityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    safeLocalStorageSet('safaeewala_employees_hidden_columns', hiddenColumns)
  }, [hiddenColumns])

  useEffect(() => {
    if (!columnVisibilityOpen) return
    const onDown = (e: MouseEvent) => {
      if (columnVisibilityRef.current && !columnVisibilityRef.current.contains(e.target as Node)) {
        setColumnVisibilityOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [columnVisibilityOpen])

  const isColVisible = (colId: string) => !hiddenColumns.includes(colId)
  const toggleColumn = (colId: string) => {
    setHiddenColumns(prev =>
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    )
  }
  const showAllColumns = () => setHiddenColumns([])

  // Live clients only (no demo seed clients) for the assign lists
  const assignableClients = useMemo(() => getAssignableClients(clients), [clients])
  const [searchParams, setSearchParams] = useSearchParams()
  const xlsxInputRef = useRef<HTMLInputElement>(null)

  const initialAgencyParam = searchParams.get('agency') || searchParams.get('filter') || 'all'
  const [agencyFilter, setAgencyFilter] = useState<string>(initialAgencyParam)

  useEffect(() => {
    const p = searchParams.get('agency') || searchParams.get('filter')
    if (p) {
      setAgencyFilter(p)
    } else if (!searchParams.has('agency') && !searchParams.has('filter')) {
      setAgencyFilter('all')
    }
  }, [searchParams])

  const handleAgencyFilterChange = (val: string) => {
    setAgencyFilter(val)
    const next = new URLSearchParams(searchParams)
    if (val === 'all') {
      next.delete('agency')
      next.delete('filter')
    } else {
      next.set('agency', val)
    }
    setSearchParams(next, { replace: true })
  }

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'cleaner' | 'supervisor' | 'crew_lead' | 'ducting' | 'technical' | 'store_cleaner' | 'driver'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'on_leave'>('all')
  const [workFilter, setWorkFilter] = useState<'all' | 'has_ot' | 'high_ot' | 'working_today'>('all')
  const [expiryFilter, setExpiryFilter] = useState(false)
  const [datePreset, setDatePreset] = useState<EmployeeDatePreset>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('working_today')
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<typeof employees[0] | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<typeof employees[0] | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [importing, setImporting] = useState(false)

  const handleSelectEmployee = (emp: typeof employees[0]) => {
    setSelected(emp)
  }

  const handleStartEdit = (emp: typeof employees[0]) => {
    setEditingEmployee(emp)
    setSelected(null)
  }

  const handleOpenAddModal = () => {
    setShowModal(true)
  }

  // Active date range calculation
  const activeDateRange = useMemo(() => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    if (datePreset === 'today') {
      return { start: todayStr, end: todayStr, label: 'Today' }
    }
    if (datePreset === 'yesterday') {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      const yStr = y.toISOString().split('T')[0]
      return { start: yStr, end: yStr, label: 'Yesterday' }
    }
    if (datePreset === '7days') {
      const d = new Date(today)
      d.setDate(d.getDate() - 7)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 7 Days' }
    }
    if (datePreset === '30days') {
      const d = new Date(today)
      d.setDate(d.getDate() - 30)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 30 Days' }
    }
    if (datePreset === '3months') {
      const d = new Date(today)
      d.setMonth(d.getMonth() - 3)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 3 Months' }
    }
    if (datePreset === '6months') {
      const d = new Date(today)
      d.setMonth(d.getMonth() - 6)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 6 Months' }
    }
    if (datePreset === '1year') {
      const d = new Date(today)
      d.setFullYear(d.getFullYear() - 1)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 1 Year' }
    }
    if (datePreset === 'custom') {
      return { start: customStartDate, end: customEndDate, label: 'Custom Range' }
    }
    return { start: '', end: '', label: 'All Time' }
  }, [datePreset, customStartDate, customEndDate])

  // Map employee stats from Daily Job Sheet filtered by activeDateRange
  const staffJobStats = useMemo(() => {
    const stats = new Map<string, {
      shifts: number
      dutyHours: number
      otHours: number
      totalHours: number
      revenueGenerated: number
      cashCollected: number
      lastJob?: DailyJob
      todayJob?: DailyJob
    }>()

    const { start, end } = activeDateRange
    const todayStr = new Date().toISOString().split('T')[0]

    employees.forEach(emp => {
      const allJobs = getEmployeeDailyJobsHistory(emp, dailyJobs)
      const todayJob = allJobs.find(j => (j.date || '').split('T')[0] === todayStr)

      let rangeJobs = allJobs
      if (datePreset !== 'all' && (start || end)) {
        rangeJobs = allJobs.filter(j => {
          const d = (j.date || '').split('T')[0]
          if (start && d < start) return false
          if (end && d > end) return false
          return true
        })
      }

      const shifts = rangeJobs.length
      const dutyHours = Math.round(rangeJobs.reduce((s, j) => s + (Number(j.duty_hours) || 0), 0) * 10) / 10
      const otHours = Math.round(rangeJobs.reduce((s, j) => s + calcJobOTHours(j), 0) * 10) / 10
      // OT hours fall inside the duty window, so they are not added on top
      const totalHours = dutyHours
      // A shared shift's charge is split between its cleaners
      const revenueGenerated = Math.round(rangeJobs.reduce((s, j) => s + (Number(j.charges) || 0) / Math.max(1, splitStaffNames(j.staff_name).length), 0))
      const cashCollected = Math.round(rangeJobs.filter(j => j.payment_mode === 'Cash').reduce((s, j) => s + (Number(j.received) || 0) / Math.max(1, splitStaffNames(j.staff_name).length), 0))

      stats.set(emp.id, {
        shifts,
        dutyHours,
        otHours,
        totalHours,
        revenueGenerated,
        cashCollected,
        lastJob: allJobs[0],
        todayJob,
      })
    })
    return stats
  }, [employees, dailyJobs, activeDateRange, datePreset])

  // Check today's active work status (checks Daily Jobs Sheet as well as Bookings)
  const getTodayStatus = (emp: Employee) => {
    if (emp.status === 'on_leave') return { code: 'leave', label: 'On Leave', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
    if (emp.status === 'inactive') return { code: 'inactive', label: 'Inactive', bg: 'bg-slate-100 text-slate-500 border-slate-200' }

    const todayStr = new Date().toISOString().split('T')[0]
    const st = staffJobStats.get(emp.id)

    // Check today's daily job
    if (st?.todayJob) {
      const j = st.todayJob
      const timeStr = j.start_time && j.end_time ? `${j.start_time} - ${j.end_time}` : 'On Shift'
      const areaStr = j.area || j.address || 'Active Site'
      return {
        code: 'working',
        label: 'On Duty',
        detail: `${areaStr} (${timeStr})`,
        bg: 'bg-emerald-500 text-white border-emerald-600',
        badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      }
    }

    // Check today's bookings
    const activeBooking = bookings.find(b =>
      b.assigned_crew?.includes(emp.id) &&
      b.scheduled_date === todayStr &&
      (b.status === 'in_progress' || b.status === 'confirmed')
    )

    if (activeBooking) {
      return {
        code: 'scheduled',
        label: activeBooking.status === 'in_progress' ? 'On Live Job' : 'Scheduled',
        detail: activeBooking.service_address || 'Booking',
        bg: 'bg-teal-600 text-white border-teal-700',
        badgeBg: 'bg-teal-50 text-teal-800 border-teal-200',
      }
    }

    return {
      code: 'available',
      label: 'Available',
      detail: 'No active job today',
      bg: 'bg-slate-100 text-slate-700 border-slate-200',
      badgeBg: 'bg-slate-50 text-slate-600 border-slate-200',
    }
  }

  // Agency Scoped Employees (Filters out Parent Company when viewing Third-Party Supplied Cleaners)
  const agencyScopedEmployees = useMemo(() => {
    if (agencyFilter === 'third_party' || agencyFilter === 'third-party') {
      return employees.filter(isThirdPartyEmployee)
    }
    if (agencyFilter === 'parent_company' || agencyFilter === 'parent' || agencyFilter === 'safaeewala') {
      return employees.filter(isParentCompanyEmployee)
    }
    if (agencyFilter !== 'all') {
      return employees.filter(e => matchesAgencyFilter(e, agencyFilter, agencies)) // AUD-14
    }
    return employees
  }, [employees, agencyFilter, agencies])

  // Third-Party Agencies for the filter — sourced only from the Agencies screen's list,
  // so new agencies appear automatically and stale names on old employee records don't
  const dynamicAgencies = useMemo(() => {
    return agencies
      .filter(a => a.company_type !== 'Parent Company' && a.id !== 'agency-safaeewala' && !a.name.toLowerCase().includes('safaeewala'))
      .map(a => ({ id: a.id, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [agencies])

  // Summary aggregation metrics for actual employee work
  const summaryMetrics = useMemo(() => {
    let totalDutyHours = 0
    let totalOTHours = 0
    let totalShifts = 0
    let totalRevenue = 0
    let staffWithOTCount = 0
    let highOTCount = 0
    let activeWorkingTodayCount = 0

    agencyScopedEmployees.forEach(emp => {
      const st = staffJobStats.get(emp.id)
      if (st) {
        totalDutyHours += st.dutyHours
        totalOTHours += st.otHours
        totalShifts += st.shifts
        totalRevenue += st.revenueGenerated
        if (st.otHours > 0) staffWithOTCount++
        if (st.otHours >= 10) highOTCount++
      }
      const todaySt = getTodayStatus(emp)
      if (todaySt.code === 'working' || todaySt.code === 'scheduled') {
        activeWorkingTodayCount++
      }
    })

    totalDutyHours = Math.round(totalDutyHours * 10) / 10
    totalOTHours = Math.round(totalOTHours * 10) / 10
    const totalWorkHours = totalDutyHours
    const otRatio = totalWorkHours > 0 ? Math.round((totalOTHours / totalWorkHours) * 100) : 0
    const avgDutyPerStaff = agencyScopedEmployees.length > 0 ? Math.round((totalDutyHours / agencyScopedEmployees.length) * 10) / 10 : 0

    return {
      totalDutyHours,
      totalOTHours,
      totalWorkHours,
      totalShifts,
      totalRevenue,
      staffWithOTCount,
      highOTCount,
      activeWorkingTodayCount,
      otRatio,
      avgDutyPerStaff,
    }
  }, [agencyScopedEmployees, staffJobStats])

  const expiringCount = agencyScopedEmployees.filter(e => {
    const soonest = Math.min(daysUntil(e.visa_expiry), daysUntil(e.work_permit_expiry), daysUntil(e.passport_expiry))
    return soonest < 90
  }).length

  const activeCount = agencyScopedEmployees.filter(e => e.status === 'active').length
  const crewLeads = agencyScopedEmployees.filter(e => e.role === 'crew_lead').length
  const autoSyncedCount = agencyScopedEmployees.filter(e => e.id.startsWith('emp-dj-')).length

  // Filter & Sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return employees.filter(e => {
      const st = staffJobStats.get(e.id)
      const todaySt = getTodayStatus(e)

      // Agency Filter: Only third-party staff show; Parent Company staff hidden when filtering third_party
      if (agencyFilter === 'third_party' || agencyFilter === 'third-party') {
        if (!isThirdPartyEmployee(e)) return false
      } else if (agencyFilter === 'parent_company' || agencyFilter === 'parent' || agencyFilter === 'safaeewala') {
        if (!isParentCompanyEmployee(e)) return false
      } else if (agencyFilter !== 'all') {
        if (!matchesAgencyFilter(e, agencyFilter, agencies)) return false // AUD-14
      }

      const matchSearch = q === '' ||
        e.full_name.toLowerCase().includes(q) ||
        e.nationality.toLowerCase().includes(q) ||
        e.phone.toLowerCase().includes(q) ||
        e.emirates_id.toLowerCase().includes(q) ||
        (e.agency_name && e.agency_name.toLowerCase().includes(q))

      const matchRole = roleFilter === 'all' || (
        roleFilter === 'supervisor'
          ? (e.role === 'supervisor' || e.role === 'crew_lead')
          : (roleFilter === 'technical' || roleFilter === 'ducting')
            ? (e.role === 'technical' || e.role === 'ducting')
            : e.role === roleFilter
      )
      const matchStatus = statusFilter === 'all' || e.status === statusFilter

      let matchWork = true
      if (workFilter === 'has_ot') {
        matchWork = (st?.otHours ?? 0) > 0
      } else if (workFilter === 'high_ot') {
        matchWork = (st?.otHours ?? 0) >= 10
      } else if (workFilter === 'working_today') {
        matchWork = todaySt.code === 'working' || todaySt.code === 'scheduled'
      }

      const matchExpiry = !expiryFilter || (() => {
        const soonest = Math.min(daysUntil(e.visa_expiry), daysUntil(e.work_permit_expiry), daysUntil(e.passport_expiry))
        return soonest < 90
      })()

      return matchSearch && matchRole && matchStatus && matchWork && matchExpiry
    }).sort((a, b) => {
      const stA = staffJobStats.get(a.id)
      const stB = staffJobStats.get(b.id)

      if (sortBy === 'working_today') {
        const todayA = getTodayStatus(a)
        const todayB = getTodayStatus(b)
        const scoreA = todayA.code === 'working' ? 3 : todayA.code === 'scheduled' ? 2 : todayA.code === 'available' ? 1 : 0
        const scoreB = todayB.code === 'working' ? 3 : todayB.code === 'scheduled' ? 2 : todayB.code === 'available' ? 1 : 0
        if (scoreB !== scoreA) return scoreB - scoreA
        return (stB?.dutyHours ?? 0) - (stA?.dutyHours ?? 0)
      }
      if (sortBy === 'ot_desc') {
        return (stB?.otHours ?? 0) - (stA?.otHours ?? 0)
      }
      if (sortBy === 'duty_desc') {
        return (stB?.dutyHours ?? 0) - (stA?.dutyHours ?? 0)
      }
      if (sortBy === 'shifts_desc') {
        return (stB?.shifts ?? 0) - (stA?.shifts ?? 0)
      }
      if (sortBy === 'rate_desc') {
        const salA = getEmployeeMonthlySalary(a)
        const salB = getEmployeeMonthlySalary(b)
        return salB - salA
      }
      return a.full_name.localeCompare(b.full_name)
    })
  }, [employees, search, roleFilter, agencyFilter, statusFilter, workFilter, expiryFilter, sortBy, staffJobStats, agencies])

  // Employee alerts for the header bell: expired / expiring (≤30 days) documents and contracts
  const employeeNotifications = useMemo<HeroNotification[]>(() => {
    const docs: [keyof Employee, string][] = [
      ['visa_expiry', 'Visa'],
      ['passport_expiry', 'Passport'],
      ['work_permit_expiry', 'Work Permit'],
      ['eid_end_date', 'Emirates ID'],
      ['medical_insurance_expiry', 'Medical Insurance'],
      ['driving_license_expiry_date', 'Driving License'],
      ['end_date', 'Employment contract'],
    ]
    const list: (HeroNotification & { days: number })[] = []
    employees.forEach(e => {
      if (e.status === 'inactive') return
      docs.forEach(([field, label]) => {
        const date = e[field] as string | undefined
        if (!date) return
        const days = daysUntil(date)
        if (days > 30) return
        const plural = (n: number) => (n === 1 ? '' : 's')
        list.push({
          id: `${e.id}-${String(field)}`,
          title: `${e.full_name}: ${label} ${days < 0 ? 'expired' : 'expiring'}`,
          detail: days < 0
            ? `Expired ${-days} day${plural(-days)} ago (${formatDate(date)})`
            : `${days === 0 ? 'Expires today' : `${days} day${plural(days)} left`} (${formatDate(date)})`,
          tone: days < 0 ? 'danger' : 'warning',
          onClick: () => navigate(`/employees/${e.id}`),
          days,
        })
      })
    })
    return list.sort((a, b) => a.days - b.days)
  }, [employees, navigate])

  /* Overtime Top Performers Leaderboard */
  const topOTStaff = useMemo(() => {
    return [...agencyScopedEmployees]
      .map(emp => ({
        emp,
        stats: staffJobStats.get(emp.id),
      }))
      .filter(item => (item.stats?.otHours ?? 0) > 0)
      .sort((a, b) => (b.stats?.otHours ?? 0) - (a.stats?.otHours ?? 0))
      .slice(0, 5)
  }, [agencyScopedEmployees, staffJobStats])

  /* Aggregate skills scoped to selected agency */
  const skillCounts = useMemo(() => {
    return agencyScopedEmployees.reduce((acc, e) => {
      e.skills.forEach(s => { acc[s] = (acc[s] || 0) + 1 })
      return acc
    }, {} as Record<string, number>)
  }, [agencyScopedEmployees])

  /* ── Intelligent Work & Duty Widgets (Modularized) ── */
  const renderWidgets = () => (
    <>
      <OvertimeWidget
        topOTStaff={topOTStaff}
        activeDateRangeLabel={activeDateRange.label}
        onSelectEmployee={handleSelectEmployee}
      />
      <LiveCrewWidget
        agencyScopedEmployees={agencyScopedEmployees}
        getTodayStatus={getTodayStatus}
        activeWorkingTodayCount={summaryMetrics.activeWorkingTodayCount}
        onSelectEmployee={handleSelectEmployee}
        onViewWorkingStaff={() => setSortBy('working_today')}
      />
      <ComplianceWidget
        agencyScopedEmployees={agencyScopedEmployees}
        expiringCount={expiringCount}
        onSelectEmployee={handleSelectEmployee}
      />
      <SkillsWidget
        skillCounts={skillCounts}
        totalStaffCount={agencyScopedEmployees.length}
      />
    </>
  )

  const renderEmployeeCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {filtered.map((emp, idx) => {
        const safeDay = (d: string | undefined) => d ? daysUntil(d) : Infinity
        const minDays = Math.min(safeDay(emp.visa_expiry), safeDay(emp.work_permit_expiry), safeDay(emp.passport_expiry))
        const hasAlert = isFinite(minDays) && minDays < 90
        const st = staffJobStats.get(emp.id)
        const shiftsCount = st?.shifts ?? 0
        const dutyHours = st?.dutyHours ?? 0
        const otHours = st?.otHours ?? 0
        const totalHours = st?.totalHours ?? 0
        const todaySt = getTodayStatus(emp)
        const isJobSheetStaff = emp.id.startsWith('emp-dj-')
        const hasHighOT = otHours >= 10

        // Duty / OT proportions for progress strip
        const otPct = totalHours > 0 ? Math.min(100, Math.round((otHours / totalHours) * 100)) : 0
        const dutyPct = totalHours > 0 ? 100 - otPct : 100

        return (
          <div
            key={emp.id}
            onClick={() => handleSelectEmployee(emp)}
            className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:shadow-[0_10px_35px_rgba(15,23,42,0.08)] hover:border-teal-400/80 transition-all cursor-pointer flex flex-col justify-between p-5 group relative overflow-hidden"
          >
            {/* Top Accent Stripe for High OT */}
            {hasHighOT && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500" />
            )}

            <div>
              {/* Header: Avatar, Name, Role, Status */}
              <div className="flex items-start gap-3.5 mb-3.5">
                <Avatar name={emp.full_name} size="md" idx={idx} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[15px] font-black text-slate-900 group-hover:text-teal-700 transition-colors truncate">
                      {emp.full_name}
                    </p>
                    {hasAlert && (
                      <span title="Visa or Permit expiring soon">
                        <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-slate-500 mt-1 flex-wrap">
                    <span className={`inline-block text-[10.5px] font-bold px-2 py-0.5 rounded-md border ${getRoleBadgeStyle(emp.role)}`}>
                      {formatEmpRole(emp.role)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                      <Building2 size={10} className="text-teal-600" />
                      {getEmployeeAgencySource(emp)}
                    </span>
                    <span>·</span>
                    <span>{emp.nationality || 'Staff'}</span>
                  </div>
                </div>

                <StatusBadge status={emp.status} />
              </div>

              {/* Live Today Status Pill */}
              {todaySt.code === 'working' ? (
                <div className="mb-3.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    <span className="font-extrabold text-emerald-900">Working Today:</span>
                    <span className="text-emerald-800 font-medium truncate">{todaySt.detail}</span>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-600 text-white shrink-0">
                    ON DUTY
                  </span>
                </div>
              ) : todaySt.code === 'scheduled' ? (
                <div className="mb-3.5 px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                    <span className="font-bold text-teal-900">Scheduled:</span>
                    <span className="text-teal-800 font-medium truncate">{todaySt.detail}</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-teal-600 text-white shrink-0">
                    SCHEDULED
                  </span>
                </div>
              ) : null}

              {/* NUMAYA DUTY HOURS & OVERTIME (OT) METRICS BLOCK */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3 mb-3.5 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded-xl p-2.5 border border-slate-200/90 shadow-2xs">
                    <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                      <span className="flex items-center gap-1">
                        <Clock size={11} className="text-teal-600" />
                        Duty Hours
                      </span>
                      <span className="text-slate-400 font-medium">{shiftsCount} shifts</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[18px] font-black text-slate-900">{dutyHours}</span>
                      <span className="text-[11px] font-bold text-slate-500">hrs</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Regular assigned duty</p>
                  </div>

                  <div className={`rounded-xl p-2.5 border shadow-2xs transition-all ${
                    otHours > 0
                      ? 'bg-gradient-to-br from-amber-50 to-orange-50/80 border-amber-300'
                      : 'bg-white border-slate-200/90'
                  }`}>
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider mb-1">
                      <span className={`flex items-center gap-1 ${otHours > 0 ? 'text-amber-900 font-black' : 'text-slate-500'}`}>
                        <Flame size={12} className={otHours > 0 ? 'text-amber-600' : 'text-slate-400'} />
                        Overtime (OT)
                      </span>
                      {hasHighOT && (
                        <span className="bg-orange-500 text-white text-[9px] font-black px-1 py-0.2 rounded">
                          HIGH
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-[18px] font-black ${otHours > 0 ? 'text-amber-950' : 'text-slate-400'}`}>
                        {otHours > 0 ? `+${otHours}` : '0.0'}
                      </span>
                      <span className={`text-[11px] font-bold ${otHours > 0 ? 'text-amber-800' : 'text-slate-400'}`}>hrs</span>
                    </div>
                    <p className={`text-[10px] mt-0.5 font-medium ${otHours > 0 ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                      {otHours > 0 ? `${otPct}% of worked time` : 'No OT recorded'}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10.5px] font-semibold text-slate-500 mb-1">
                    <span className="font-bold text-slate-700">Total Workload: {totalHours} hrs</span>
                    {otHours > 0 && (
                      <span className="text-amber-800 font-bold text-[10px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {otHours}h Overtime
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${dutyPct}%` }}
                      className="h-full bg-teal-600 transition-all"
                      title={`Duty: ${dutyHours} hrs`}
                    />
                    {otHours > 0 && (
                      <div
                        style={{ width: `${otPct}%` }}
                        className="h-full bg-amber-500 transition-all"
                        title={`Overtime: ${otHours} hrs`}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Contact, Monthly Salary & Expiry details */}
              <div className="space-y-1.5 text-[12px] text-slate-500 mb-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone size={12} className="text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-700">{emp.phone || 'No phone'}</span>
                  </div>
                  <span className="text-[11.5px] font-black text-teal-800 bg-teal-50 border border-teal-200/90 px-2 py-0.5 rounded-lg shadow-2xs">
                    {formatMonthlySalary(emp)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield size={12} className="text-slate-400 shrink-0" />
                    <span>Visa: {formatDate(emp.visa_expiry)}</span>
                  </div>
                  {daysUntil(emp.visa_expiry) < 90 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${daysUntil(emp.visa_expiry) < 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                      {daysUntil(emp.visa_expiry) < 0 ? 'EXPIRED' : `${daysUntil(emp.visa_expiry)}d left`}
                    </span>
                  )}
                </div>

                {/* Assigned Client Tag (if any) */}
                {emp.assigned_client_ids && emp.assigned_client_ids.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-600">
                    <Briefcase size={11} className="text-teal-600 shrink-0" />
                    <span className="font-bold text-slate-700">Client:</span>
                    <span className="font-semibold text-teal-800 truncate">
                      {emp.assigned_client_ids
                        .map(cid => clients.find(c => c.id === cid)?.full_name || cid)
                        .slice(0, 2)
                        .join(', ')}
                      {emp.assigned_client_ids.length > 2 ? ` +${emp.assigned_client_ids.length - 2}` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Skills Tags */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {emp.skills.slice(0, 3).map(s => (
                  <span key={s} className="text-[10.5px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold border border-slate-200/60">
                    {s}
                  </span>
                ))}
                {emp.skills.length > 3 && (
                  <span className="text-[10.5px] text-slate-400 font-bold self-center">
                    +{emp.skills.length - 3}
                  </span>
                )}
                {isJobSheetStaff && (
                  <span className="text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200/80 px-2 py-0.5 rounded-md ml-auto">
                    Daily Sheet Synced
                  </span>
                )}
              </div>
            </div>

            {/* Card Footer: Profile Link + Rate + Delete */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
              <Link
                to={`/employees/${emp.id}`}
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100/90 px-3 py-1.5 rounded-xl border border-teal-200/90 transition-colors"
              >
                <FileText size={12} /> View Job Sheet & History <ExternalLink size={11} />
              </Link>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); handleStartEdit(emp) }}
                  className="px-2.5 py-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[11px] font-bold transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); deleteEmployee(emp.id) }}
                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Delete employee"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderEmployeeTable = () => (
    <div className="w-full bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              {isColVisible('employee') && <th className="py-3.5 px-4">Employee</th>}
              {isColVisible('role') && <th className="py-3.5 px-3">Role</th>}
              {isColVisible('status') && <th className="py-3.5 px-3">Live Status</th>}
              {isColVisible('dutyHours') && <th className="py-3.5 px-3 text-right">Duty Hours</th>}
              {isColVisible('otHours') && <th className="py-3.5 px-3 text-right">Overtime (OT)</th>}
              {isColVisible('totalHours') && <th className="py-3.5 px-3 text-right">Total Hours</th>}
              {isColVisible('shifts') && <th className="py-3.5 px-3 text-center">Shifts</th>}
              {isColVisible('salary') && <th className="py-3.5 px-3">Monthly Salary</th>}
              {isColVisible('visa') && <th className="py-3.5 px-3">Visa Expiry</th>}
              {isColVisible('actions') && <th className="py-3.5 px-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[12.5px]">
            {filtered.map((emp, idx) => {
              const st = staffJobStats.get(emp.id)
              const dutyHours = st?.dutyHours ?? 0
              const otHours = st?.otHours ?? 0
              const totalHours = st?.totalHours ?? 0
              const todaySt = getTodayStatus(emp)
              const visaDays = daysUntil(emp.visa_expiry)

              return (
                <tr
                  key={emp.id}
                  onClick={() => handleSelectEmployee(emp)}
                  className="hover:bg-teal-50/30 transition-colors cursor-pointer"
                >
                  {isColVisible('employee') && (
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={emp.full_name} size="sm" idx={idx} />
                        <div>
                          <p className="font-bold text-slate-900">{emp.full_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-slate-500">{emp.phone || emp.nationality || 'Staff'}</span>
                            <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Building2 size={9} className="text-teal-600" />
                              {getEmployeeAgencySource(emp)}
                            </span>
                            {emp.assigned_client_ids && emp.assigned_client_ids.length > 0 && (
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                                {emp.assigned_client_ids.length} client{emp.assigned_client_ids.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                  )}

                  {isColVisible('role') && (
                    <td className="py-3 px-3">
                      <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md border ${getRoleBadgeStyle(emp.role)}`}>
                        {formatEmpRole(emp.role)}
                      </span>
                    </td>
                  )}

                  {isColVisible('status') && (
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${todaySt.badgeBg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${todaySt.code === 'working' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {todaySt.label}
                      </span>
                    </td>
                  )}

                  {/* Duty Hours Column */}
                  {isColVisible('dutyHours') && (
                    <td className="py-3 px-3 text-right">
                      <span className="font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200/60">
                        {dutyHours} <span className="text-[10px] text-slate-500 font-semibold">hrs</span>
                      </span>
                    </td>
                  )}

                  {/* Overtime (OT) Column */}
                  {isColVisible('otHours') && (
                    <td className="py-3 px-3 text-right">
                      {otHours > 0 ? (
                        <span className="inline-flex items-center gap-1 font-black text-amber-950 bg-amber-100 border border-amber-300 px-2 py-1 rounded-lg shadow-2xs">
                          <Flame size={11} className="text-amber-600" />
                          +{otHours} <span className="text-[10px] text-amber-800">hrs</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">0.0</span>
                      )}
                    </td>
                  )}

                  {/* Total Hours */}
                  {isColVisible('totalHours') && (
                    <td className="py-3 px-3 text-right font-black text-slate-900">
                      {totalHours} hrs
                    </td>
                  )}

                  {/* Shifts count */}
                  {isColVisible('shifts') && (
                    <td className="py-3 px-3 text-center">
                      <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                        {st?.shifts ?? 0}
                      </span>
                    </td>
                  )}

                  {/* Monthly Salary */}
                  {isColVisible('salary') && (
                    <td className="py-3 px-3 font-black text-slate-900">
                      {formatMonthlySalary(emp)}
                    </td>
                  )}

                  {/* Visa Expiry */}
                  {isColVisible('visa') && (
                    <td className="py-3 px-3">
                      {emp.visa_expiry ? (
                        <span className={`text-[11px] font-bold ${visaDays < 30 ? 'text-rose-600' : visaDays < 90 ? 'text-amber-600' : 'text-slate-600'}`}>
                          {formatDate(emp.visa_expiry)}
                          {visaDays < 90 && <span className="ml-1 text-[10px]">({visaDays}d)</span>}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Not set</span>
                      )}
                    </td>
                  )}

                  {/* Actions */}
                  {isColVisible('actions') && (
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <Link
                          to={`/employees/${emp.id}`}
                          className="text-teal-700 hover:text-teal-800 text-[11px] font-bold bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          Profile
                        </Link>
                        <button
                          type="button"
                          onClick={() => deleteEmployee(emp.id)}
                          className="text-slate-300 hover:text-rose-600 p-1 rounded-md transition-colors"
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
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 pb-12">

      {/* ── Page Hero with Excel Tools and Quick Actions ── */}
      <PageHero
        title="Staff & Duty Hours"
        subtitle={`${employees.length} team members · ${summaryMetrics.totalDutyHours}h Regular Duty · ${summaryMetrics.totalOTHours}h Overtime (${activeDateRange.label})`}
        statusChip={
          summaryMetrics.activeWorkingTodayCount > 0
            ? `${summaryMetrics.activeWorkingTodayCount} Working Today`
            : expiringCount > 0 ? `${expiringCount} Compliance Alerts` : 'All Clear'
        }
        showSearch={false}
        actions={
          <div className="flex items-center gap-2">
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
                  const rows = await parseEmployeesFile(file)
                  rows.forEach(r => addEmployee(r))
                } finally {
                  setImporting(false)
                  e.target.value = ''
                }
              }}
            />
            <button
              type="button"
              onClick={() => xlsxInputRef.current?.click()}
              disabled={importing}
              className="h-11 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-[13px] backdrop-blur-sm transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
              title="Import employees from Excel/CSV"
            >
              <Upload size={14} />
              <span>{importing ? 'Importing…' : 'Import'}</span>
            </button>
            <button
              type="button"
              onClick={() => exportEmployeesXLSX(filtered, staffJobStats)}
              className="h-11 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-[13px] backdrop-blur-sm transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              title="Export staff work list with Duty & OT to Excel"
            >
              <FileSpreadsheet size={14} />
              <span>Export</span>
            </button>
          </div>
        }
        actionLabel="Add Employee"
        onAction={handleOpenAddModal}
        notifications={employeeNotifications}
      />

      {/* ── KPI Cards: Focused on Employees' Real Work, Duty Hours & OT ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">

        {/* Card 1: Total Staff */}
        <div
          onClick={() => { setStatusFilter('all'); setRoleFilter('all'); handleAgencyFilterChange('all'); setWorkFilter('all'); setExpiryFilter(false); setSearch('') }}
          className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.07)] hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 group-hover:bg-teal-50 text-slate-700 group-hover:text-teal-700 flex items-center justify-center transition-colors">
              <Users size={18} />
            </div>
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
              {crewLeads} Leads
            </span>
          </div>
          <p className="text-2xl font-black text-[#0f172a] tracking-tight">{agencyScopedEmployees.length}</p>
          <p className="text-[12px] font-bold text-slate-800 mt-0.5">
            {agencyFilter === 'third_party' || agencyFilter === 'third-party' ? 'Supplied Cleaners' : agencyFilter === 'parent_company' ? 'Parent Fleet Staff' : 'Total Staff'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{autoSyncedCount} auto-synced roster</p>
        </div>

        {/* Card 2: Active on Duty Today */}
        <div
          onClick={() => { setWorkFilter('working_today'); setStatusFilter('all'); setRoleFilter('all'); setExpiryFilter(false) }}
          className={`bg-white rounded-[24px] border transition-all cursor-pointer group p-4.5 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:shadow-[0_8px_30px_rgba(15,23,42,0.07)] ${
            workFilter === 'working_today' ? 'border-emerald-500 ring-2 ring-emerald-500/10' : 'border-slate-200/80 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck size={18} />
            </div>
            <span className="flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-2xl font-black text-[#0f172a] tracking-tight">{summaryMetrics.activeWorkingTodayCount}</p>
          <p className="text-[12px] font-bold text-slate-800 mt-0.5">Working Today</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{activeCount} available staff</p>
        </div>

        {/* Card 3: Total Regular Duty Hours */}
        <div
          onClick={() => { setSortBy('duty_desc'); setWorkFilter('all') }}
          className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.07)] hover:border-teal-300 transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Briefcase size={18} />
            </div>
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200/80">
              {summaryMetrics.totalShifts} Shifts
            </span>
          </div>
          <p className="text-2xl font-black text-[#0f172a] tracking-tight">{summaryMetrics.totalDutyHours} <span className="text-sm font-semibold text-slate-500">hrs</span></p>
          <p className="text-[12px] font-bold text-slate-800 mt-0.5">Duty Hours</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Avg {summaryMetrics.avgDutyPerStaff}h per cleaner</p>
        </div>

        {/* Card 4: Total Overtime (OT) — NUMAYA / PROMINENT HIGHLIGHT */}
        <div
          onClick={() => { setWorkFilter(workFilter === 'has_ot' ? 'all' : 'has_ot'); setSortBy('ot_desc') }}
          className={`rounded-[24px] border transition-all cursor-pointer p-4.5 shadow-[0_4px_20px_rgba(217,119,6,0.08)] hover:shadow-[0_8px_30px_rgba(217,119,6,0.18)] ${
            workFilter === 'has_ot'
              ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-400 ring-2 ring-amber-400/20'
              : 'bg-white border-amber-300 hover:border-amber-400'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs shadow-amber-500/30">
              <Flame size={19} className="animate-pulse" />
            </div>
            <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
              <Zap size={10} className="fill-amber-600 text-amber-600" />
              {summaryMetrics.otRatio}% OT Ratio
            </span>
          </div>
          <p className="text-2xl font-black text-amber-950 tracking-tight">+{summaryMetrics.totalOTHours} <span className="text-sm font-bold text-amber-800">hrs</span></p>
          <p className="text-[12px] font-extrabold text-amber-900 mt-0.5">Total Overtime (OT)</p>
          <p className="text-[11px] text-amber-700/90 font-medium mt-0.5">{summaryMetrics.staffWithOTCount} staff clocked OT</p>
        </div>

        {/* Card 5: Total Combined Hours */}
        <div
          onClick={() => { setSortBy('duty_desc') }}
          className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.07)] hover:border-indigo-300 transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock size={18} />
            </div>
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70">
              Workload
            </span>
          </div>
          <p className="text-2xl font-black text-[#0f172a] tracking-tight">{summaryMetrics.totalWorkHours} <span className="text-sm font-semibold text-slate-500">hrs</span></p>
          <p className="text-[12px] font-bold text-slate-800 mt-0.5">Total Logged Time</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Duty + Overtime combined</p>
        </div>

        {/* Card 6: Document Expiry (Clickable Filter) */}
        <div
          onClick={() => {
            const next = !expiryFilter
            setExpiryFilter(next)
            if (next) {
              setRoleFilter('all')
              setWorkFilter('all')
              setStatusFilter('all')
            }
            setTimeout(() => {
              document.getElementById('employees-list-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 80)
          }}
          className={`rounded-[24px] border transition-all cursor-pointer p-4.5 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:shadow-[0_8px_30px_rgba(15,23,42,0.07)] ${
            expiryFilter
              ? 'bg-rose-50/90 border-rose-400 ring-2 ring-rose-400/30'
              : expiringCount > 0 ? 'bg-white border-amber-300 hover:border-amber-400' : 'bg-white border-slate-200/80 hover:border-emerald-300'
          }`}
          title="Click to view cleaners with expiring documents (<90 days)"
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              expiryFilter ? 'bg-rose-500 text-white shadow-xs shadow-rose-500/30' :
              expiringCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <Shield size={18} />
            </div>
            <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${
              expiryFilter ? 'bg-rose-600 text-white' :
              expiringCount > 0 ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}>
              {expiryFilter ? 'Active Filter' : expiringCount > 0 ? `${expiringCount} Pending` : '100% OK'}
            </span>
          </div>
          <p className="text-2xl font-black text-[#0f172a] tracking-tight">{expiringCount}</p>
          <p className="text-[12px] font-bold text-slate-800 mt-0.5">Document Expiry</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {expiryFilter ? 'Showing filtered list below' : 'Click to filter expiring (<90d)'}
          </p>
        </div>

      </div>

      {/* ── Unified Filter & Control Bar (Consolidated Single Row) ── */}
      <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-3.5 space-y-2.5">
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5">
          {/* 1. Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search staff by name, nationality, phone, or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-[12.5px] pl-10 pr-9 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 placeholder-slate-400 font-medium text-slate-800 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* 2. Role Filter */}
          <div className="relative min-w-[145px] shrink-0">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as any)}
              className="w-full text-[12px] font-bold pl-3 pr-7 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 text-slate-800 cursor-pointer transition-all appearance-none"
            >
              <option value="all">👥 All Roles</option>
              <option value="cleaner">🧹 Cleaners</option>
              <option value="supervisor">👔 Supervisors & Leads</option>
              <option value="technical">🔧 Technical</option>
              <option value="store_cleaner">🏬 Store Cleaners</option>
              <option value="driver">🚗 Drivers</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* 3. Period Filter (Compact Dropdown) */}
          <div className="relative min-w-[135px] shrink-0">
            <select
              value={datePreset}
              onChange={e => setDatePreset(e.target.value as EmployeeDatePreset)}
              className={`w-full text-[12px] font-bold pl-7 pr-7 py-2 rounded-xl focus:outline-none cursor-pointer transition-all appearance-none border ${
                datePreset !== 'all'
                  ? 'bg-teal-50 border-teal-300 text-teal-900 ring-2 ring-teal-500/10'
                  : 'bg-slate-50 hover:bg-slate-100/80 focus:bg-white border-slate-200 text-slate-800 focus:border-teal-600'
              }`}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="3months">Last 3 Months</option>
              <option value="6months">Last 6 Months</option>
              <option value="custom">Custom Range</option>
            </select>
            <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-teal-600 pointer-events-none" />
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* 4. Sort & Agency Filter (Dynamic Agency List from Database & Employees) */}
          <div className="relative min-w-[210px] shrink-0">
            <select
              value={agencyFilter !== 'all' ? `agency:${agencyFilter}` : sortBy}
              onChange={e => {
                const val = e.target.value
                if (val.startsWith('agency:')) {
                  const ag = val.replace('agency:', '')
                  handleAgencyFilterChange(ag)
                } else {
                  setSortBy(val as SortBy)
                  if (val === 'working_today') {
                    handleAgencyFilterChange('all')
                  }
                }
              }}
              className={`w-full text-[12px] font-bold pl-3 pr-7 py-2 rounded-xl focus:outline-none cursor-pointer transition-all appearance-none border ${
                agencyFilter !== 'all'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-2 ring-indigo-500/10'
                  : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 focus:border-teal-500'
              }`}
            >
              <optgroup label="🟢 Roster Sort">
                <option value="working_today">🟢 Working Today (On Duty First)</option>
                <option value="ot_desc">🔥 Highest OT Hours</option>
                <option value="duty_desc">💼 Highest Duty Hours</option>
                <option value="shifts_desc">📊 Most Shifts</option>
                <option value="name_asc">👤 Name (A-Z)</option>
                <option value="rate_desc">💵 Highest Monthly Salary</option>
              </optgroup>

              <optgroup label="🏢 Filter by Agency / Vendor">
                <option value="agency:all">🌐 All Fleets & Agencies</option>
                <option value="agency:third_party">🏢 Third-Party Agencies (Supplied Cleaners Only)</option>
                <option value="agency:safaeewala">👑 Safaeewala (Parent Company)</option>
                {dynamicAgencies.map(ag => (
                  <option key={ag.id} value={`agency:${ag.id}`}>
                    🤝 {ag.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* 5. View Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Table View (Dense Duty & OT Roster)"
            >
              <List size={15} />
            </button>
          </div>

          {/* 6. Reset Filters Button */}
          {(search || roleFilter !== 'all' || agencyFilter !== 'all' || datePreset !== 'all' || sortBy !== 'working_today') && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setRoleFilter('all')
                handleAgencyFilterChange('all')
                setDatePreset('all')
                setCustomStartDate('')
                setCustomEndDate('')
                setSortBy('working_today')
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer shrink-0 border border-rose-200/60"
              title="Reset all filters"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}

          {/* Showing Count + Column Visibility */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <span className="text-[11.5px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200/70 whitespace-nowrap">
              <span className="text-teal-700 font-black">{filtered.length}</span> / {employees.length}
            </span>
            <div ref={columnVisibilityRef} className="relative">
              <button
                type="button"
                onClick={() => setColumnVisibilityOpen(o => !o)}
                className={`relative h-[30px] w-[30px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                  hiddenColumns.length > 0
                    ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                    : 'bg-slate-100 border-slate-200/70 text-slate-600 hover:bg-slate-200/70'
                }`}
                title={hiddenColumns.length > 0 ? `${hiddenColumns.length} columns hidden — manage table columns` : 'Manage table columns'}
              >
                {hiddenColumns.length > 0 ? <EyeOff size={14} /> : <Eye size={14} />}
                {hiddenColumns.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9.5px] font-black flex items-center justify-center">
                    {hiddenColumns.length}
                  </span>
                )}
              </button>

              {columnVisibilityOpen && (
                <div className="absolute right-0 top-full mt-2 w-[280px] bg-white rounded-2xl border border-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.16)] z-40 overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/60">
                    <div>
                      <p className="text-[12px] font-black text-slate-900">Manage Columns</p>
                      <p className="text-[10px] text-slate-500">Show or hide table columns</p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={showAllColumns}
                        className="text-teal-700 hover:text-teal-800 cursor-pointer disabled:text-slate-300 disabled:cursor-default"
                        disabled={hiddenColumns.length === 0}
                      >
                        Show all
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-2 space-y-0.5">
                    {EMPLOYEE_TABLE_COLUMNS.map(col => {
                      const visible = !hiddenColumns.includes(col.id)
                      return (
                        <label
                          key={col.id}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
                            col.alwaysVisible ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:bg-slate-50'
                          } ${visible ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={visible}
                              disabled={col.alwaysVisible}
                              onChange={() => toggleColumn(col.id)}
                              className="rounded text-teal-600 focus:ring-teal-500 h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <span className="truncate">{col.label}</span>
                          </div>
                          {col.alwaysVisible ? (
                            <span className="text-[9.5px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                              Fixed
                            </span>
                          ) : !visible ? (
                            <EyeOff size={12} className="text-amber-600 shrink-0" />
                          ) : null}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Custom Date Pickers (Shown only when datePreset === 'custom') */}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 bg-teal-50/70 border border-teal-200 rounded-xl px-3 py-1.5 animate-in fade-in duration-150 text-[12px]">
            <span className="font-bold text-teal-800">Custom Date Range:</span>
            <span className="text-[11px] font-semibold text-slate-600">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="px-2 py-1 bg-white border border-teal-200 rounded-lg focus:outline-none focus:border-teal-500 font-semibold text-slate-800"
            />
            <span className="text-[11px] font-semibold text-slate-600">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="px-2 py-1 bg-white border border-teal-200 rounded-lg focus:outline-none focus:border-teal-500 font-semibold text-slate-800"
            />
          </div>
        )}
      </div>

      {/* ── Active Agency Filter Notification Banner ── */}
      {agencyFilter !== 'all' && (
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-50/90 via-sky-50/70 to-indigo-50/90 border border-indigo-200/90 rounded-2xl text-[12.5px] text-indigo-950 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs shadow-indigo-600/30">
              <Building2 size={16} />
            </div>
            <div>
              <p className="font-extrabold text-indigo-950 leading-tight">
                {agencyFilter === 'third_party' || agencyFilter === 'third-party' ? (
                  <>🏢 Showing Third-Party Supplied Cleaners Only <span className="text-rose-700 font-black">(Parent Company Staff Hidden)</span></>
                ) : agencyFilter === 'parent_company' || agencyFilter === 'parent' || agencyFilter === 'safaeewala' ? (
                  <>👑 Showing Safaeewala Cleaners (Parent Company Only) <span className="text-emerald-800 font-black">(Third-Party Staff Hidden)</span></>
                ) : (
                  <>🏢 Filtered by Agency: <span className="font-black text-indigo-950">{agencies.find(a => a.id === agencyFilter)?.name || agencyFilter}</span></>
                )}
              </p>
              <p className="text-[11.5px] text-indigo-700/80 font-medium mt-0.5">
                Displaying {filtered.length} matching staff members out of {employees.length} total.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleAgencyFilterChange('all')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-bold text-[11.5px] transition-colors cursor-pointer shadow-2xs shrink-0"
          >
            <X size={13} />
            <span>Clear Filter / Show All</span>
          </button>
        </div>
      )}

      {/* ── Active Document Expiry Filter Banner ── */}
      {expiryFilter && (
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-rose-50/90 via-amber-50/70 to-rose-50/90 border border-rose-300 rounded-2xl text-[12.5px] text-rose-950 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs shadow-rose-600/30">
              <Shield size={16} />
            </div>
            <div>
              <p className="font-extrabold text-rose-950 leading-tight">
                🛡️ Showing Cleaners & Staff with Document Expiry alerts (&lt;90 days or Expired)
              </p>
              <p className="text-[11.5px] text-rose-800 font-medium mt-0.5">
                Displaying {filtered.length} staff member{filtered.length === 1 ? '' : 's'} requiring Visa, Passport, or Work Permit renewal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpiryFilter(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 border border-rose-300 text-rose-900 font-bold text-[11.5px] transition-colors cursor-pointer shadow-2xs shrink-0"
          >
            <X size={13} />
            <span>Clear Expiry Filter</span>
          </button>
        </div>
      )}

      {/* ── Main Layout: Full Width Table View with Widgets Underneath OR Grid View ── */}
      <div id="employees-list-section" className="scroll-mt-6">
      {viewMode === 'table' ? (
        <div className="space-y-6">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3.5">
                <Users size={26} />
              </div>
              <p className="text-[16px] font-black text-slate-800">No staff members match these filters</p>
              <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">
                Try adjusting your search keywords, role selection, or date range settings.
              </p>
              <button
                type="button"
                onClick={() => { setSearch(''); setRoleFilter('all'); setWorkFilter('all'); setDatePreset('all'); setSortBy('working_today') }}
                className="mt-4 px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-[12px] hover:bg-teal-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <RotateCcw size={13} /> Clear All Filters
              </button>
            </div>
          ) : (
            renderEmployeeTable()
          )}

          {/* ── Intelligent Work & Duty Widgets (Underneath Datatable in 2-Column Grid) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {renderWidgets()}
          </div>
        </div>
      ) : (
        /* ── GRID VIEW (2 cols cards + 1 col widgets sidebar) ── */
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          <div className="xl:col-span-2">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3.5">
                  <Users size={26} />
                </div>
                <p className="text-[16px] font-black text-slate-800">No staff members match these filters</p>
                <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">
                  Try adjusting your search keywords, role selection, or date range settings.
                </p>
                <button
                  type="button"
                  onClick={() => { setSearch(''); setRoleFilter('all'); setWorkFilter('all'); setDatePreset('all'); setSortBy('working_today') }}
                  className="mt-4 px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-[12px] hover:bg-teal-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <RotateCcw size={13} /> Clear All Filters
                </button>
              </div>
            ) : (
              renderEmployeeCards()
            )}
          </div>

          <div className="space-y-5">
            {renderWidgets()}
          </div>
        </div>
      )}
      </div>

            {/* ── Employee Detail Modal ── */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setConfirmDelete(false) }}
        title="Employee Work & Profile"
        size="lg"
      >
        {selected && (() => {
          const st = staffJobStats.get(selected.id)
          const dutyHours = st?.dutyHours ?? 0
          const otHours = st?.otHours ?? 0
          const totalHours = st?.totalHours ?? 0
          const shiftsCount = st?.shifts ?? 0

          return (
            <div className="space-y-5">
              {/* Profile Card Header */}
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-teal-50/50 border border-slate-200/80">
                <Avatar name={selected.full_name} size="lg" idx={0} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[19px] font-black text-slate-900 truncate">{selected.full_name}</p>
                    <StatusBadge status={selected.status} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md border ${getRoleBadgeStyle(selected.role)}`}>
                      {formatEmpRole(selected.role)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                      <Building2 size={11} className="text-teal-600" />
                      {getEmployeeAgencySource(selected)}
                    </span>
                    <span>·</span>
                    <span className="text-[12px] text-slate-600">{selected.nationality || 'Staff'}</span>
                  </div>
                  <p className="text-[11.5px] text-slate-400 mt-1">
                    Emp ID: {selected.id}
                  </p>
                </div>
              </div>

              {/* Dedicated Work Metrics Block inside Detail Modal */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase size={14} className="text-teal-600" />
                    Work Activity Summary ({activeDateRange.label})
                  </span>
                  <span className="text-[11px] font-bold bg-white text-slate-700 px-2.5 py-0.5 rounded-full border border-slate-200">
                    {shiftsCount} Completed Shifts
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white rounded-xl p-3 border border-slate-200/80">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Regular Duty</p>
                    <p className="text-lg font-black text-slate-900 mt-0.5">{dutyHours} <span className="text-xs font-semibold text-slate-500">hrs</span></p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 border border-amber-300">
                    <p className="text-[10px] font-extrabold text-amber-800 uppercase flex items-center justify-center gap-1">
                      <Flame size={10} className="text-amber-600" /> Overtime (OT)
                    </p>
                    <p className="text-lg font-black text-amber-950 mt-0.5">+{otHours} <span className="text-xs font-bold text-amber-800">hrs</span></p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-slate-200/80">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Logged</p>
                    <p className="text-lg font-black text-teal-800 mt-0.5">{totalHours} <span className="text-xs font-semibold text-slate-500">hrs</span></p>
                  </div>
                </div>
              </div>

              {/* Contact and Details (with Monthly Salary, Agency, Joining and End Date) */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Monthly Salary', value: formatMonthlySalary(selected) },
                  { label: 'Role',           value: formatEmpRole(selected.role) },
                  { label: 'Agency Source',  value: getEmployeeAgencySource(selected) },
                  { label: 'Joining Date',   value: formatDate(selected.joined_date) },
                  { label: 'End Date',       value: selected.end_date ? formatDate(selected.end_date) : 'Active / Indefinite' },
                  { label: 'Phone',          value: selected.phone || 'Not recorded' },
                  { label: 'Email',          value: selected.email || 'Not recorded' },
                  { label: 'Nationality',    value: selected.nationality || 'Not recorded' },
                  { label: 'Emirates ID',    value: selected.emirates_id || 'Not recorded' },
                  { label: 'Visa Expiry',    value: selected.visa_expiry ? formatDate(selected.visa_expiry) : 'Not recorded' },
                  { label: 'Work Permit Expiry', value: selected.work_permit_expiry ? formatDate(selected.work_permit_expiry) : 'Not recorded' },
                  { label: 'Passport Expiry', value: selected.passport_expiry ? formatDate(selected.passport_expiry) : 'Not recorded' },
                  { label: 'Medical Insurance Expiry', value: selected.medical_insurance_expiry ? formatDate(selected.medical_insurance_expiry) : 'Not recorded' },
                  { label: 'Skills',         value: selected.skills?.length ? selected.skills.join(', ') : 'Not recorded' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
                    <p className="text-[10.5px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">{label}</p>
                    <p className="text-[13px] font-bold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>

              {/* Assigned Clients */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11.5px] font-bold text-slate-600 uppercase tracking-wider">Assigned Clients</p>
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                    {(selected.assigned_client_ids ?? []).length} Assigned
                  </span>
                </div>
                {(selected.assigned_client_ids ?? []).length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[12px] text-slate-400">
                    Not assigned to any specific client (General Pool / Roster).
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selected.assigned_client_ids?.map(cid => {
                      const c = clients.find(cl => cl.id === cid)
                      return (
                        <span key={cid} className="inline-flex items-center gap-1.5 text-[12px] font-bold bg-teal-50 text-teal-800 border border-teal-200/90 px-3 py-1 rounded-xl">
                          <Building2 size={12} className="text-teal-600" />
                          {c?.full_name || cid}
                          {c?.area ? <span className="text-[10.5px] text-teal-600 font-semibold">({c.building_name ? `${c.building_name}, ` : ''}{c.area})</span> : null}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Document Health (Medical Insurance Removed) */}
              <div>
                <p className="text-[11.5px] font-bold text-slate-600 uppercase tracking-wider mb-2">Document Expiry Dates</p>
                <div className="grid grid-cols-3 gap-2">
                  <ExpiryIndicator date={selected.visa_expiry} label="Visa" />
                  <ExpiryIndicator date={selected.work_permit_expiry} label="Work Permit" />
                  <ExpiryIndicator date={selected.passport_expiry} label="Passport" />
                </div>
              </div>

              {/* Skills */}
              <div>
                <p className="text-[11.5px] font-bold text-slate-600 uppercase tracking-wider mb-2">Skills & Specializations</p>
                <div className="flex flex-wrap gap-2">
                  {(selected.skills ?? []).length === 0 ? (
                    <p className="text-[12px] text-slate-400">No skills specified yet</p>
                  ) : (
                    (selected.skills ?? []).map(s => (
                      <span key={s} className="text-[12px] bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1 rounded-lg font-bold">
                        {s}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {confirmDelete ? (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                  <p className="text-[13.5px] font-bold text-rose-800 mb-1">Delete this employee?</p>
                  <p className="text-[12px] text-rose-700 mb-3">
                    This will permanently remove <strong>{selected.full_name}</strong>.
                  </p>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" className="flex-1" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <button
                      type="button"
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-bold py-2 rounded-xl transition-colors cursor-pointer"
                      onClick={() => { deleteEmployee(selected!.id); setSelected(null); setConfirmDelete(false) }}
                    >
                      Yes, Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <Link
                    to={`/employees/${selected.id}`}
                    onClick={() => setSelected(null)}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-[13.5px] shadow-sm shadow-teal-700/20 transition-all"
                  >
                    <FileText size={16} /> Open Full Service Record & Daily Job Sheet History <ExternalLink size={14} />
                  </Link>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 text-rose-600 text-[12px] font-bold hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                    <Button variant="outline" className="flex-1 font-bold text-teal-800 border-teal-300 hover:bg-teal-50" size="sm" onClick={() => handleStartEdit(selected)}>
                      <Pencil size={13} className="mr-1.5" /> Edit Profile
                    </Button>
                    <Button
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
                      size="sm"
                      onClick={() => {
                        navigate(`/daily-job-sheet?filterCleaner=${encodeURIComponent(selected.full_name)}`)
                        setSelected(null)
                      }}
                    >
                      View in Job Sheet
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* ── Add Employee Modal (Unified Reusable Component) ── */}
      <EmployeeFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        agencies={agencies}
        clients={clients}
        onSave={(data) => {
          addEmployee(data as any)
          setShowModal(false)
        }}
      />

      {/* ── Edit Employee Modal (Unified Reusable Component) ── */}
      <EmployeeFormModal
        open={!!editingEmployee}
        onClose={() => setEditingEmployee(null)}
        initialEmployee={editingEmployee}
        agencies={agencies}
        clients={clients}
        onSave={(patch) => {
          if (editingEmployee) {
            updateEmployee(editingEmployee.id, patch)
          }
          setEditingEmployee(null)
        }}
      />

    </div>
  )
}
