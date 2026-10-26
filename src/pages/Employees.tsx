import { useState, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useNavigate, Link } from 'react-router-dom'
import {
  Search, AlertTriangle, Phone, Shield, Users, UserCheck, Star,
  TrendingUp, Trash2, CheckCircle, Upload, Download, FileSpreadsheet,
  Clock, ExternalLink, FileText, Calendar, RotateCcw, X, Filter,
  Flame, Zap, Briefcase, ArrowUpDown, LayoutGrid, List, ChevronRight, ChevronDown,
  DollarSign, Award, Sparkles, Building2, MapPin
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatDate, daysUntil } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { Employee, DailyJob, EmployeeRole, Agency } from '@/types'
import { getEmployeeDailyJobsHistory, calcJobOTHours } from '@/lib/clientDataSync'

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
  if (s === 'ducting' || s === 'duct') return 'ducting'
  if (s === 'store_cleaner' || s === 'store cleaner' || s === 'store') return 'store_cleaner'
  if (s === 'driver') return 'driver'
  return 'cleaner'
}

function formatEmpRole(role?: string): string {
  if (role === 'supervisor' || role === 'crew_lead') return 'Supervisor'
  if (role === 'ducting') return 'Ducting'
  if (role === 'store_cleaner') return 'Store Cleaner'
  if (role === 'driver') return 'Driver'
  return 'Cleaner'
}

function getRoleBadgeStyle(role?: string) {
  if (role === 'supervisor' || role === 'crew_lead') {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  }
  if (role === 'ducting') {
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

function exportEmployeesXLSX(
  employees: Employee[],
  statsMap: Map<string, { shifts: number; dutyHours: number; otHours: number }>
) {
  const rows = employees.map((e, i) => {
    const st = statsMap.get(e.id)
    const dutyHours = st?.dutyHours ?? 0
    const otHours = st?.otHours ?? 0
    const totalHours = Math.round((dutyHours + otHours) * 10) / 10
    const monthlySalary = e.monthly_salary || (e.pay_rate_hourly ? e.pay_rate_hourly * 200 : 2000)
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
      'Agency':                    e.agency_name || 'In-House / Direct Hire',
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
        pay_rate_hourly:            Number(r['Pay Rate (AED/hr)'] ?? r['pay_rate_hourly']) || 14,
        monthly_salary:             Number(r['Monthly Salary (AED)'] ?? r['monthly_salary']) || (Number(r['Pay Rate (AED/hr)']) ? Number(r['Pay Rate (AED/hr)']) * 200 : 2000),
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
  const xlsxInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'cleaner' | 'supervisor' | 'crew_lead' | 'ducting' | 'store_cleaner' | 'driver'>('all')
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
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [importing, setImporting] = useState(false)

  // Client Assignee Selection State for Add & Edit Modals
  const [addClientIds, setAddClientIds] = useState<string[]>([])
  const [editClientIds, setEditClientIds] = useState<string[]>([])
  const [clientSearchAdd, setClientSearchAdd] = useState('')
  const [clientSearchEdit, setClientSearchEdit] = useState('')

  const handleSelectEmployee = (emp: typeof employees[0]) => {
    setSelected(emp)
    setEditClientIds(emp.assigned_client_ids || [])
    setClientSearchEdit('')
    setIsEditing(false)
  }

  const handleStartEdit = (emp: typeof employees[0]) => {
    setSelected(emp)
    setEditClientIds(emp.assigned_client_ids || [])
    setClientSearchEdit('')
    setIsEditing(true)
  }

  const handleOpenAddModal = () => {
    setAddClientIds([])
    setClientSearchAdd('')
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
      const totalHours = Math.round((dutyHours + otHours) * 10) / 10
      const revenueGenerated = rangeJobs.reduce((s, j) => s + (Number(j.charges) || 0), 0)
      const cashCollected = rangeJobs.filter(j => j.payment_mode === 'Cash').reduce((s, j) => s + (Number(j.received) || 0), 0)

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
        label: 'On Duty Today',
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
        label: activeBooking.status === 'in_progress' ? 'On Live Job' : 'Scheduled Today',
        detail: activeBooking.service_address || 'Booking',
        bg: 'bg-teal-600 text-white border-teal-700',
        badgeBg: 'bg-teal-50 text-teal-800 border-teal-200',
      }
    }

    return {
      code: 'available',
      label: 'Available / Standby',
      detail: 'No active job today',
      bg: 'bg-slate-100 text-slate-700 border-slate-200',
      badgeBg: 'bg-slate-50 text-slate-600 border-slate-200',
    }
  }

  // Summary aggregation metrics for actual employee work
  const summaryMetrics = useMemo(() => {
    let totalDutyHours = 0
    let totalOTHours = 0
    let totalShifts = 0
    let totalRevenue = 0
    let staffWithOTCount = 0
    let highOTCount = 0
    let activeWorkingTodayCount = 0

    employees.forEach(emp => {
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
    const totalWorkHours = Math.round((totalDutyHours + totalOTHours) * 10) / 10
    const otRatio = totalWorkHours > 0 ? Math.round((totalOTHours / totalWorkHours) * 100) : 0
    const avgDutyPerStaff = employees.length > 0 ? Math.round((totalDutyHours / employees.length) * 10) / 10 : 0

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
  }, [employees, staffJobStats])

  const expiringCount = employees.filter(e => {
    const soonest = Math.min(daysUntil(e.visa_expiry), daysUntil(e.work_permit_expiry), daysUntil(e.passport_expiry))
    return soonest < 90
  }).length

  const activeCount = employees.filter(e => e.status === 'active').length
  const crewLeads = employees.filter(e => e.role === 'crew_lead').length
  const autoSyncedCount = employees.filter(e => e.id.startsWith('emp-dj-')).length

  // Filter & Sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return employees.filter(e => {
      const st = staffJobStats.get(e.id)
      const todaySt = getTodayStatus(e)

      const matchSearch = q === '' ||
        e.full_name.toLowerCase().includes(q) ||
        e.nationality.toLowerCase().includes(q) ||
        e.phone.toLowerCase().includes(q) ||
        e.emirates_id.toLowerCase().includes(q) ||
        (e.agency_name && e.agency_name.toLowerCase().includes(q))

      const matchRole = roleFilter === 'all' || (
        roleFilter === 'supervisor'
          ? (e.role === 'supervisor' || e.role === 'crew_lead')
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
        const salA = a.monthly_salary || (a.pay_rate_hourly ? a.pay_rate_hourly * 200 : 2000)
        const salB = b.monthly_salary || (b.pay_rate_hourly ? b.pay_rate_hourly * 200 : 2000)
        return salB - salA
      }
      return a.full_name.localeCompare(b.full_name)
    })
  }, [employees, search, roleFilter, statusFilter, workFilter, expiryFilter, sortBy, staffJobStats])

  /* Overtime Top Performers Leaderboard */
  const topOTStaff = useMemo(() => {
    return [...employees]
      .map(emp => ({
        emp,
        stats: staffJobStats.get(emp.id),
      }))
      .filter(item => (item.stats?.otHours ?? 0) > 0)
      .sort((a, b) => (b.stats?.otHours ?? 0) - (a.stats?.otHours ?? 0))
      .slice(0, 5)
  }, [employees, staffJobStats])

  /* Aggregate skills */
  const skillCounts = employees.reduce((acc, e) => {
    e.skills.forEach(s => { acc[s] = (acc[s] || 0) + 1 })
    return acc
  }, {} as Record<string, number>)

  /* ── 4 Reusable Intelligent Work & Duty Widgets ── */
  const renderOvertimeWidget = () => (
    <div className="bg-white rounded-[24px] border border-amber-200/90 shadow-[0_4px_20px_rgba(217,119,6,0.06)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shadow-amber-500/30">
            <Flame size={15} />
          </div>
          <div>
            <h3 className="text-[14px] font-black text-slate-900">Overtime Leaders</h3>
            <p className="text-[11px] text-slate-500 font-medium">Top extra hours logged</p>
          </div>
        </div>
        <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
          {activeDateRange.label}
        </span>
      </div>

      {topOTStaff.length === 0 ? (
        <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100">
          <Clock size={20} className="mx-auto text-slate-300 mb-1.5" />
          <p className="text-[12px] font-bold text-slate-600">No Overtime in this period</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Change date filter to view past OT hours</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {topOTStaff.slice(0, 6).map(({ emp, stats }, idx) => {
            const ot = stats?.otHours ?? 0
            const duty = stats?.dutyHours ?? 0
            return (
              <div
                key={emp.id}
                onClick={() => setSelected(emp)}
                className="flex items-center gap-3 p-2.5 rounded-2xl bg-gradient-to-r from-amber-50/50 to-orange-50/30 border border-amber-200/60 hover:border-amber-300 transition-all cursor-pointer group"
              >
                <span className="w-5 text-[12px] font-black text-amber-700 text-center">
                  #{idx + 1}
                </span>
                <Avatar name={emp.full_name} size="sm" idx={idx} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-bold text-slate-900 group-hover:text-amber-800 transition-colors truncate">
                    {emp.full_name}
                  </p>
                  <p className="text-[11px] text-slate-500">{duty}h Regular Duty</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-0.5 text-[12px] font-black text-amber-950 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg shadow-2xs">
                    <Zap size={10} className="fill-amber-600 text-amber-600" />
                    +{ot}h OT
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderLiveCrewWidget = () => (
    <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <UserCheck size={16} />
          </div>
          <div>
            <h3 className="text-[14px] font-black text-slate-900">Live Crew Status</h3>
            <p className="text-[11px] text-slate-500 font-medium">Daily sheet & booking roster</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      <div className="space-y-2.5">
        {employees.slice(0, 6).map((emp, idx) => {
          const todaySt = getTodayStatus(emp)
          const isWorking = todaySt.code === 'working' || todaySt.code === 'scheduled'

          return (
            <div
              key={emp.id}
              onClick={() => setSelected(emp)}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Avatar name={emp.full_name} size="sm" idx={idx} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-slate-900 truncate">{emp.full_name}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {emp.role === 'crew_lead' ? 'Supervisor' : 'Cleaner'}
                  {isWorking && todaySt.detail ? ` · ${todaySt.detail}` : ''}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${todaySt.badgeBg}`}>
                {todaySt.label}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
        <span>{summaryMetrics.activeWorkingTodayCount} active on duty</span>
        <button
          type="button"
          onClick={() => setSortBy('working_today')}
          className="text-teal-700 hover:text-teal-800 font-bold cursor-pointer"
        >
          View Working Staff →
        </button>
      </div>
    </div>
  )

  const renderComplianceWidget = () => (
    <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${expiringCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <Shield size={16} />
          </div>
          <div>
            <h3 className="text-[14px] font-black text-slate-900">Document Health</h3>
            <p className="text-[11px] text-slate-500 font-medium">Visa & permit validity</p>
          </div>
        </div>
        {expiringCount > 0 ? (
          <span className="bg-rose-100 text-rose-800 border border-rose-200 text-[10.5px] font-black px-2 py-0.5 rounded-full">
            {expiringCount} Alerts
          </span>
        ) : (
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10.5px] font-bold px-2 py-0.5 rounded-full">
            All Valid
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {employees
          .filter(e => {
            const days = Math.min(daysUntil(e.visa_expiry), daysUntil(e.work_permit_expiry))
            return days < 90
          })
          .slice(0, 4)
          .map((emp, idx) => {
            const visaDays = daysUntil(emp.visa_expiry)
            const permitDays = daysUntil(emp.work_permit_expiry)
            const minDays = Math.min(visaDays, permitDays)
            const doc = visaDays <= permitDays ? 'Visa' : 'Work Permit'
            const urgent = minDays < 30
            return (
              <div
                key={emp.id}
                onClick={() => setSelected(emp)}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                  urgent ? 'bg-rose-50/70 border-rose-200' : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <Avatar name={emp.full_name} size="sm" idx={idx} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-slate-900 truncate">{emp.full_name}</p>
                  <p className={`text-[11px] font-medium mt-0.5 ${urgent ? 'text-rose-800' : 'text-amber-800'}`}>
                    {doc}: {minDays < 0 ? 'EXPIRED' : `${minDays}d left`}
                  </p>
                </div>
                <AlertTriangle size={14} className={urgent ? 'text-rose-600' : 'text-amber-600'} />
              </div>
            )
          })}

        {expiringCount === 0 && (
          <div className="text-center py-5 bg-emerald-50/60 rounded-2xl border border-emerald-100">
            <CheckCircle size={20} className="mx-auto text-emerald-600 mb-1" />
            <p className="text-[12px] font-bold text-emerald-900">All documents up to date</p>
            <p className="text-[11px] text-emerald-700">No renewals due within 90 days</p>
          </div>
        )}
      </div>
    </div>
  )

  const renderSkillsWidget = () => (
    <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-black text-slate-900">Skills Coverage</h3>
        <span className="text-[11px] text-slate-400 font-semibold">{employees.length} Staff</span>
      </div>
      <div className="space-y-2.5">
        {Object.entries(skillCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([skill, count]) => {
            const pct = Math.round((count / (employees.length || 1)) * 100)
            return (
              <div key={skill}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-slate-700 truncate">{skill}</span>
                  <span className="text-[11px] font-bold text-slate-500 ml-2">{count} staff ({pct}%)</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
      </div>
    </div>
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
                    {emp.agency_name ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                        <Building2 size={10} className="text-teal-600" />
                        {emp.agency_name}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">In-House</span>
                    )}
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
                    AED {(emp.monthly_salary || (emp.pay_rate_hourly ? Math.round(emp.pay_rate_hourly * 200) : 2500)).toLocaleString()}/mo
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
              <th className="py-3.5 px-4">Employee</th>
              <th className="py-3.5 px-3">Role</th>
              <th className="py-3.5 px-3">Live Status</th>
              <th className="py-3.5 px-3 text-right">Duty Hours</th>
              <th className="py-3.5 px-3 text-right">Overtime (OT)</th>
              <th className="py-3.5 px-3 text-right">Total Hours</th>
              <th className="py-3.5 px-3 text-center">Shifts</th>
              <th className="py-3.5 px-3">Monthly Salary</th>
              <th className="py-3.5 px-3">Visa Expiry</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
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
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.full_name} size="sm" idx={idx} />
                      <div>
                        <p className="font-bold text-slate-900">{emp.full_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-slate-500">{emp.phone || emp.nationality || 'Staff'}</span>
                          {emp.agency_name && (
                            <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.2 rounded">
                              {emp.agency_name}
                            </span>
                          )}
                          {emp.assigned_client_ids && emp.assigned_client_ids.length > 0 && (
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                              {emp.assigned_client_ids.length} client{emp.assigned_client_ids.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md border ${getRoleBadgeStyle(emp.role)}`}>
                      {formatEmpRole(emp.role)}
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${todaySt.badgeBg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${todaySt.code === 'working' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {todaySt.label}
                    </span>
                  </td>

                  {/* Duty Hours Column */}
                  <td className="py-3 px-3 text-right">
                    <span className="font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200/60">
                      {dutyHours} <span className="text-[10px] text-slate-500 font-semibold">hrs</span>
                    </span>
                  </td>

                  {/* Overtime (OT) Column — NUMAYA & VIBRANT */}
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

                  {/* Total Hours */}
                  <td className="py-3 px-3 text-right font-black text-slate-900">
                    {totalHours} hrs
                  </td>

                  {/* Shifts count */}
                  <td className="py-3 px-3 text-center">
                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                      {st?.shifts ?? 0}
                    </span>
                  </td>

                  {/* Monthly Salary */}
                  <td className="py-3 px-3 font-black text-slate-900">
                    AED {(emp.monthly_salary || (emp.pay_rate_hourly ? Math.round(emp.pay_rate_hourly * 200) : 2500)).toLocaleString()}/mo
                  </td>

                  {/* Visa Expiry */}
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

                  {/* Actions */}
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
              <span>{importing ? 'Importing…' : 'Import Roster'}</span>
            </button>
            <button
              type="button"
              onClick={() => exportEmployeesXLSX(filtered, staffJobStats)}
              className="h-11 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-[13px] backdrop-blur-sm transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              title="Export staff work list with Duty & OT to Excel"
            >
              <FileSpreadsheet size={14} />
              <span>Export Duty & OT</span>
            </button>
          </div>
        }
        actionLabel="Add Employee"
        onAction={handleOpenAddModal}
      />

      {/* ── Compliance Alert Banner (if any) ── */}
      {expiringCount > 0 && (
        <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-[22px] px-5 py-4 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="text-[13.5px] font-bold text-amber-950">Document Expiry Alert</p>
              <p className="text-[12px] text-amber-800 mt-0.5">
                <strong>{expiringCount} employee{expiringCount > 1 ? 's have' : ' has'}</strong> Visas or Work Permits expiring within 90 days.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setExpiryFilter(true); setRoleFilter('all'); setWorkFilter('all') }}
            className="px-3.5 py-1.5 rounded-xl bg-amber-200/70 hover:bg-amber-200 text-amber-900 text-[12px] font-bold transition-colors cursor-pointer shrink-0"
          >
            Review Alerts
          </button>
        </div>
      )}

      {/* ── KPI Cards: Focused on Employees' Real Work, Duty Hours & OT ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">

        {/* Card 1: Total Staff */}
        <div
          onClick={() => { setStatusFilter('all'); setRoleFilter('all'); setWorkFilter('all'); setExpiryFilter(false); setSearch('') }}
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
          <p className="text-2xl font-black text-[#0f172a] tracking-tight">{employees.length}</p>
          <p className="text-[12px] font-bold text-slate-800 mt-0.5">Total Staff</p>
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

        {/* Card 6: Compliance Health */}
        <div
          onClick={() => { setExpiryFilter(prev => !prev); setRoleFilter('all'); setWorkFilter('all') }}
          className={`rounded-[24px] border transition-all cursor-pointer p-4.5 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:shadow-[0_8px_30px_rgba(15,23,42,0.07)] ${
            expiryFilter
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/20'
              : expiringCount > 0 ? 'bg-white border-amber-200/90' : 'bg-white border-slate-200/80'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${expiringCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <Shield size={18} />
            </div>
            <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${expiringCount > 0 ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
              {expiringCount > 0 ? `${expiringCount} Pending` : '100% OK'}
            </span>
          </div>
          <p className="text-2xl font-black text-[#0f172a] tracking-tight">{expiringCount}</p>
          <p className="text-[12px] font-bold text-slate-800 mt-0.5">Doc Expirations</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Within 90 days window</p>
        </div>

      </div>

      {/* ── Unified Filter & Control Bar (Professional & Clean) ── */}
      <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4 sm:p-5 space-y-4">

        {/* Row 1: Search + Role Pills + OT Filters + View Switcher */}
        <div className="flex items-center gap-3 flex-wrap">

          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search staff by name, nationality, phone, or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-[13px] pl-10 pr-9 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 placeholder-slate-400 font-medium text-slate-800 transition-all"
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

          {/* Role Filter Dropdown Menu (All roles in a single dropdown) */}
          <div className="relative min-w-[170px]">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as any)}
              className="w-full text-[12.5px] font-bold pl-3.5 pr-8 py-2.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 text-slate-800 cursor-pointer transition-all appearance-none"
            >
              <option value="all">👥 All Roles</option>
              <option value="cleaner">🧹 Cleaners</option>
              <option value="supervisor">👔 Supervisors & Leads</option>
              <option value="ducting">🔧 Ducting</option>
              <option value="store_cleaner">🏬 Store Cleaners</option>
              <option value="driver">🚗 Drivers</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Sort Selector (Including Working Today) */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11.5px] font-semibold text-slate-400 hidden sm:inline">Sort:</span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortBy)}
                className="text-[12px] font-bold pl-3 pr-8 py-2 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 text-slate-700 cursor-pointer transition-colors appearance-none"
              >
                <option value="working_today">🟢 Working Today (On Duty First)</option>
                <option value="ot_desc">🔥 Highest OT Hours</option>
                <option value="duty_desc">💼 Highest Duty Hours</option>
                <option value="shifts_desc">📊 Most Shifts</option>
                <option value="name_asc">👤 Name (A-Z)</option>
                <option value="rate_desc">💵 Highest Monthly Salary</option>
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
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
          </div>
        </div>

        {/* Row 2: Date Presets & Custom Pickers + Reset */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-slate-500 mr-1 flex items-center gap-1.5">
              <Calendar size={13} className="text-teal-600" />
              <span>Period:</span>
            </span>

            {[
              { id: 'all',       label: 'All Time' },
              { id: 'today',     label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7days',     label: '7 Days' },
              { id: '30days',    label: '30 Days' },
              { id: '3months',   label: '3 Months' },
              { id: '6months',   label: '6 Months' },
              { id: 'custom',    label: 'Custom Range' },
            ].map(preset => {
              const active = datePreset === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDatePreset(preset.id as EmployeeDatePreset)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-teal-700 text-white shadow-xs shadow-teal-700/20'
                      : 'bg-slate-100/90 hover:bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* Custom Date Pickers */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-teal-50/70 border border-teal-200 rounded-xl px-3 py-1.5 animate-in fade-in duration-150">
              <span className="text-[11px] font-bold text-teal-800">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="text-[12px] px-2 py-1 bg-white border border-teal-200 rounded-lg focus:outline-none focus:border-teal-500 font-semibold text-slate-800"
              />
              <span className="text-[11px] font-bold text-teal-800">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="text-[12px] px-2 py-1 bg-white border border-teal-200 rounded-lg focus:outline-none focus:border-teal-500 font-semibold text-slate-800"
              />
            </div>
          )}

          {/* Reset Filters & Count */}
          <div className="flex items-center gap-3 ml-auto">
            {(search || roleFilter !== 'all' || workFilter !== 'all' || datePreset !== 'all' || statusFilter !== 'all' || expiryFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setRoleFilter('all')
                  setWorkFilter('all')
                  setDatePreset('all')
                  setStatusFilter('all')
                  setExpiryFilter(false)
                  setCustomStartDate('')
                  setCustomEndDate('')
                  setSortBy('working_today')
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw size={12} />
                <span>Reset Filters</span>
              </button>
            )}

            <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/70">
              Showing <span className="text-teal-700 font-black">{filtered.length}</span> of {employees.length} staff
            </span>
          </div>

        </div>

      </div>

      {/* ── Main Layout: Full Width Table View with Widgets Underneath OR Grid View ── */}
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
            {renderOvertimeWidget()}
            {renderLiveCrewWidget()}
            {renderComplianceWidget()}
            {renderSkillsWidget()}
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
            {renderOvertimeWidget()}
            {renderLiveCrewWidget()}
            {renderComplianceWidget()}
            {renderSkillsWidget()}
          </div>
        </div>
      )}

      {/* ── Add Employee Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New Employee" size="lg">
        <form className="space-y-4 max-h-[80vh] overflow-y-auto pr-1" onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const role = (fd.get('role') as EmployeeRole) || 'cleaner'
          const monthly_salary = Number(fd.get('monthly_salary')) || 2500
          const agencyId = (fd.get('agency_id') as string) || ''
          const selAgency = agencies.find(a => a.id === agencyId)

          addEmployee({
            full_name: fd.get('full_name') as string,
            phone: fd.get('phone') as string,
            role,
            nationality: fd.get('nationality') as string,
            emirates_id: fd.get('emirates_id') as string,
            monthly_salary,
            pay_rate_hourly: Math.round((monthly_salary / 200) * 10) / 10,
            agency_id: agencyId || undefined,
            agency_name: selAgency?.name || undefined,
            assigned_client_ids: addClientIds,
            visa_expiry: (fd.get('visa_expiry') as string) || '',
            work_permit_expiry: (fd.get('work_permit_expiry') as string) || '',
            passport_expiry: (fd.get('passport_expiry') as string) || '',
            joined_date: (fd.get('joined_date') as string) || new Date().toISOString().split('T')[0],
            end_date: (fd.get('end_date') as string) || undefined,
            status: 'active',
            skills: (fd.get('skills') as string).split(',').map(s => s.trim()).filter(Boolean),
          })
          setShowModal(false)
        }}>
          {/* Row 1: Full Name & Phone */}
          <div className="grid grid-cols-2 gap-4">
            <Input name="full_name" label="Full Name" placeholder="e.g. Maria Santos" required />
            <Input name="phone" label="Phone" placeholder="+971 50 000 0000" />
          </div>

          {/* Row 2: 5 Roles & Agency Dropdown */}
          <div className="grid grid-cols-2 gap-4">
            <Select name="role" label="Role / Designation" required>
              <option value="cleaner">Cleaner</option>
              <option value="supervisor">Supervisor</option>
              <option value="ducting">Ducting</option>
              <option value="store_cleaner">Store Cleaner</option>
              <option value="driver">Driver</option>
            </Select>

            <Select name="agency_id" label="Agency / Sourcing Vendor">
              <option value="">Direct / In-House Hire</option>
              {agencies.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.status})
                </option>
              ))}
            </Select>
          </div>

          {/* Row 3: Monthly Salary & Nationality */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              name="monthly_salary"
              label="Monthly Salary (AED/mo)"
              type="number"
              defaultValue="2500"
              placeholder="e.g. 2500"
              required
            />
            <Input name="nationality" label="Nationality" placeholder="e.g. Filipino, Nepali, Indian..." />
          </div>

          {/* Row 4: Joining Date alongside End Date */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              name="joined_date"
              label="Joining Date"
              type="date"
              defaultValue={new Date().toISOString().split('T')[0]}
            />
            <Input name="end_date" label="End Date" type="date" />
          </div>

          {/* Row 5: Document Expiries (Medical Insurance Removed) */}
          <div className="grid grid-cols-3 gap-3">
            <Input name="visa_expiry" label="Visa Expiry" type="date" />
            <Input name="work_permit_expiry" label="Work Permit Expiry" type="date" />
            <Input name="passport_expiry" label="Passport Expiry" type="date" />
          </div>

          {/* Row 6: Emirates ID & Skills */}
          <div className="grid grid-cols-2 gap-4">
            <Input name="emirates_id" label="Emirates ID" placeholder="784-XXXX-XXXXXXX-X" />
            <Input name="skills" label="Skills (comma separated)" placeholder="Deep Clean, Sofa, Window..." />
          </div>

          {/* Row 7: Client Assignee Interactive Selection */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Briefcase size={14} className="text-teal-600" />
                <span className="text-[12px] font-black text-slate-800 uppercase tracking-wider">Client Assignee</span>
              </div>
              <div className="flex items-center gap-2">
                {addClientIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAddClientIds([])}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
                <span className="text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full">
                  {addClientIds.length} Clients Assigned
                </span>
              </div>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search clients by name or company..."
                value={clientSearchAdd}
                onChange={e => setClientSearchAdd(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
              {clients
                .filter(c => {
                  if (!clientSearchAdd) return true
                  const q = clientSearchAdd.toLowerCase()
                  const loc = (c.building_name || c.area || '').toLowerCase()
                  return c.full_name.toLowerCase().includes(q) || loc.includes(q)
                })
                .map(c => {
                  const checked = addClientIds.includes(c.id)
                  const location = c.building_name ? `${c.building_name}, ${c.area}` : c.area
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center justify-between p-2 rounded-xl text-[12px] border cursor-pointer transition-colors ${
                        checked
                          ? 'bg-teal-50 border-teal-300 text-teal-950 font-bold'
                          : 'bg-white border-slate-200 hover:bg-slate-100/70 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setAddClientIds(prev =>
                              checked ? prev.filter(id => id !== c.id) : [...prev, c.id]
                            )
                          }}
                          className="rounded text-teal-600 focus:ring-teal-500 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="truncate">{c.full_name}</span>
                        {location && <span className="text-[10.5px] text-slate-400 font-normal truncate">({location})</span>}
                      </div>
                      {checked && <span className="text-[10px] font-black text-teal-700 shrink-0">ASSIGNED</span>}
                    </label>
                  )
                })}
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold">Save Employee</Button>
          </div>
        </form>
      </Modal>

      {/* ── Employee Detail / Edit Modal ── */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setIsEditing(false); setConfirmDelete(false) }}
        title={isEditing ? 'Edit Employee Details' : 'Employee Work & Profile'}
        size="lg"
      >
        {selected && !isEditing && (() => {
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
                    {selected.agency_name ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                        <Building2 size={11} className="text-teal-600" />
                        {selected.agency_name}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">In-House</span>
                    )}
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
                  { label: 'Monthly Salary', value: `AED ${(selected.monthly_salary || (selected.pay_rate_hourly ? Math.round(selected.pay_rate_hourly * 200) : 2500)).toLocaleString()}/mo` },
                  { label: 'Agency Vendor',  value: selected.agency_name || 'Direct / In-House' },
                  { label: 'Joining Date',   value: formatDate(selected.joined_date) },
                  { label: 'End Date',       value: selected.end_date ? formatDate(selected.end_date) : 'Active / Indefinite' },
                  { label: 'Phone',          value: selected.phone || 'Not recorded' },
                  { label: 'Emirates ID',    value: selected.emirates_id || 'Not recorded' },
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
                    <Button variant="outline" className="flex-1" size="sm" onClick={() => handleStartEdit(selected)}>Edit Details</Button>
                    <Button
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
                      size="sm"
                      onClick={() => { setSelected(null); setIsEditing(false); navigate('/dispatch') }}
                    >
                      Dispatch Schedule
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {selected && isEditing && (
          <form
            className="space-y-4 max-h-[80vh] overflow-y-auto pr-1"
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const role = (fd.get('role') as EmployeeRole) || selected.role
              const monthly_salary = Number(fd.get('monthly_salary')) || (selected.pay_rate_hourly ? Math.round(selected.pay_rate_hourly * 200) : 2500)
              const agencyId = (fd.get('agency_id') as string) || ''
              const selAgency = agencies.find(a => a.id === agencyId)

              const patch: Partial<Employee> = {
                full_name:                 fd.get('full_name') as string,
                phone:                     fd.get('phone') as string,
                role,
                nationality:               fd.get('nationality') as string,
                emirates_id:               fd.get('emirates_id') as string,
                monthly_salary,
                pay_rate_hourly:           Math.round((monthly_salary / 200) * 10) / 10,
                agency_id:                 agencyId || undefined,
                agency_name:               selAgency?.name || (agencyId ? selected.agency_name : undefined),
                assigned_client_ids:       editClientIds,
                joined_date:               fd.get('joined_date') as string,
                end_date:                  (fd.get('end_date') as string) || undefined,
                visa_expiry:               (fd.get('visa_expiry') as string) || undefined,
                work_permit_expiry:        (fd.get('work_permit_expiry') as string) || undefined,
                passport_expiry:           (fd.get('passport_expiry') as string) || undefined,
                status:                    fd.get('status') as Employee['status'],
                skills: (fd.get('skills') as string).split(',').map(s => s.trim()).filter(Boolean),
              }
              updateEmployee(selected.id, patch)
              setSelected({ ...selected, ...patch })
              setIsEditing(false)
            }}
          >
            {/* Row 1: Full Name & Phone */}
            <div className="grid grid-cols-2 gap-4">
              <Input name="full_name" label="Full Name" defaultValue={selected.full_name} required />
              <Input name="phone" label="Phone" defaultValue={selected.phone} />
            </div>

            {/* Row 2: 5 Roles & Agency */}
            <div className="grid grid-cols-2 gap-4">
              <Select name="role" label="Role / Designation" defaultValue={selected.role === 'crew_lead' ? 'supervisor' : selected.role}>
                <option value="cleaner">Cleaner</option>
                <option value="supervisor">Supervisor</option>
                <option value="ducting">Ducting</option>
                <option value="store_cleaner">Store Cleaner</option>
                <option value="driver">Driver</option>
              </Select>

              <Select name="agency_id" label="Agency / Sourcing Vendor" defaultValue={selected.agency_id || ''}>
                <option value="">Direct / In-House (No Agency)</option>
                {agencies.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.status})</option>
                ))}
              </Select>
            </div>

            {/* Row 3: Status & Monthly Salary */}
            <div className="grid grid-cols-2 gap-4">
              <Select name="status" label="Status" defaultValue={selected.status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On Leave</option>
                <option value="engaged_in_project">Engaged in Project</option>
              </Select>
              <Input
                name="monthly_salary"
                label="Monthly Salary (AED/mo)"
                type="number"
                defaultValue={String(selected.monthly_salary || (selected.pay_rate_hourly ? Math.round(selected.pay_rate_hourly * 200) : 2500))}
                required
              />
            </div>

            {/* Row 4: Nationality & Emirates ID */}
            <div className="grid grid-cols-2 gap-4">
              <Input name="nationality" label="Nationality" defaultValue={selected.nationality} />
              <Input name="emirates_id" label="Emirates ID" defaultValue={selected.emirates_id} />
            </div>

            {/* Row 5: Joining Date & End Date */}
            <div className="grid grid-cols-2 gap-4">
              <Input name="joined_date" label="Joining Date" type="date" defaultValue={selected.joined_date} />
              <Input name="end_date" label="End Date" type="date" defaultValue={selected.end_date || ''} />
            </div>

            {/* Row 6: Document Expiries (Medical Insurance Removed) */}
            <div className="grid grid-cols-3 gap-3">
              <Input name="visa_expiry" label="Visa Expiry" type="date" defaultValue={selected.visa_expiry} />
              <Input name="work_permit_expiry" label="Work Permit Expiry" type="date" defaultValue={selected.work_permit_expiry} />
              <Input name="passport_expiry" label="Passport Expiry" type="date" defaultValue={selected.passport_expiry} />
            </div>

            {/* Row 7: Skills */}
            <Input name="skills" label="Skills (comma separated)" defaultValue={selected.skills?.join(', ')} placeholder="Deep Clean, Sofa, Window..." />

            {/* Row 8: Client Assignee Interactive Selection */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Briefcase size={14} className="text-teal-600" />
                  <span className="text-[12px] font-black text-slate-800 uppercase tracking-wider">Client Assignee</span>
                </div>
                <div className="flex items-center gap-2">
                  {editClientIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditClientIds([])}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                  <span className="text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full">
                    {editClientIds.length} Clients Assigned
                  </span>
                </div>
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search clients by name or company..."
                  value={clientSearchEdit}
                  onChange={e => setClientSearchEdit(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {clients
                  .filter(c => {
                    if (!clientSearchEdit) return true
                    const q = clientSearchEdit.toLowerCase()
                    const loc = (c.building_name || c.area || '').toLowerCase()
                    return c.full_name.toLowerCase().includes(q) || loc.includes(q)
                  })
                  .map(c => {
                    const checked = editClientIds.includes(c.id)
                    const location = c.building_name ? `${c.building_name}, ${c.area}` : c.area
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center justify-between p-2 rounded-xl text-[12px] border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-teal-50 border-teal-300 text-teal-950 font-bold'
                            : 'bg-white border-slate-200 hover:bg-slate-100/70 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setEditClientIds(prev =>
                                checked ? prev.filter(id => id !== c.id) : [...prev, c.id]
                              )
                            }}
                            className="rounded text-teal-600 focus:ring-teal-500 h-3.5 w-3.5 cursor-pointer"
                          />
                          <span className="truncate">{c.full_name}</span>
                          {location && <span className="text-[10.5px] text-slate-400 font-normal truncate">({location})</span>}
                        </div>
                        {checked && <span className="text-[10px] font-black text-teal-700 shrink-0">ASSIGNED</span>}
                      </label>
                    )
                  })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold">Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

    </div>
  )
}
