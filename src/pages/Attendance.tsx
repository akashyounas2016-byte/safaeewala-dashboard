import { useState, useMemo, useEffect } from 'react'
import { ModuleTabs } from '@/components/layout/ModuleTabs'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import {
  Calendar, Clock, Users, UserCheck, CheckCircle2, AlertCircle,
  XCircle, Search, Filter, Printer, Download, Plus, RotateCw,
  ExternalLink, ChevronLeft, ChevronRight, MapPin, Briefcase,
  Sparkles, Check, HelpCircle, FileSpreadsheet, Eye, UserX,
  Phone, AlertTriangle, X, Flag, ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import type { DailyJob, Employee } from '@/types'
import { calcJobOTHours, isBogusJob, employeeMatchesStaff } from '@/lib/clientDataSync'


import {
  classifyAttendanceDay, type AttendanceStatus, type AttendanceOverride, buildCleanerRoster,
  LEAVE_CATEGORIES, ABSENCE_CATEGORIES, type AbsenceCategory, isLeaveCategory, canApproveLeave,
  isMondayDate, newAbsenceMark, decideLeave, splitMarkKey,
} from '@/lib/attendance'
import { AttendanceCalendar } from '@/components/attendance/AttendanceCalendar'
import { todayDubai, addDays } from '@/lib/dubaiTime'
import { useAuth } from '@/store/UserContext'
export type { AttendanceStatus }

export interface CleanerAttendanceRecord {
  name: string
  employee?: Employee
  status: AttendanceStatus
  jobs: DailyJob[]
  dutyHours: number
  otHours: number
  jobsCount: number
  absenceReason?: string
  firstStartTime?: string
  lastEndTime?: string
  isManualPresent?: boolean
  /** R-ATT-05: leave waiting for admin / manager */
  leavePending?: boolean
  mark?: AttendanceOverride
}


/** Matches job staff_name against cleaner name (handles exact, multi-cleaner tokens, and boundaries) */
function matchesCleaner(jobStaff: string | undefined, cleanerName: string): boolean {
  if (!jobStaff || !cleanerName) return false
  const s = jobStaff.trim().toLowerCase()
  const c = cleanerName.trim().toLowerCase()
  if (s === c) return true
  // Split tokens like "Sharada, Ambika", "Sharada / Ambika", "Sharada & Ambika"
  const tokens = s.split(/[,/&+]/).map(t => t.trim().toLowerCase())
  if (tokens.includes(c)) return true
  // Word boundary regex
  const escaped = c.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\$&')
  const regex = new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i')
  return regex.test(s)
}

function fmtDateHeading(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const CATEGORY_LABEL: Record<AbsenceCategory, string> = {
  'Sick Leave': 'Sick Leave / Medical',
  'Emergency Leave': 'Family / Personal Emergency Leave',
  'Annual Leave': 'Annual / Casual Leave',
  'Weekly Off': 'Day Off / Weekly Rest',
  'Uninformed Absence': 'Uninformed Absence / No Show',
  'Other': 'Other Reason (absent)',
}

const fmtShortDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function Attendance() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { dailyJobs, employees, loading, attendanceMarks: overrides, saveAttendanceMarks } = useData()
  const { user } = useAuth()
  const isApprover = canApproveLeave(user?.role)
  const myName = user?.full_name || user?.email || 'Unknown user'

  // ── Selected Date State (URL synced or Today) ──
  const qDate = searchParams.get('date')
  const initialDate = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)
    ? qDate
    : todayDubai()

  const [selectedDate, setSelectedDate] = useState<string>(initialDate)

  useEffect(() => {
    if (qDate && qDate !== selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) {
      setSelectedDate(qDate)
    }
  }, [qDate])

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate)
    setSearchParams({ date: newDate })
  }

  // Attendance marks come from the shared store: table attendance_marks, live for every user (R-SYNC-10)

  // ── Search & Filter State ──
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'available' | 'absent'>('all')
  const [timeframePreset, setTimeframePreset] = useState<string>('today')

  const handleTimeframeChange = (val: string) => {
    setTimeframePreset(val)
    const today = todayDubai()
    if (val === 'today') {
      handleDateChange(today)
    } else if (val === 'yesterday') {
      handleDateChange(addDays(today, -1))
    } else if (val === 'last7') {
      handleDateChange(addDays(today, -7))
    } else if (val === 'last30') {
      handleDateChange(addDays(today, -30))
    } else if (val === 'thisMonth') {
      const ymd = today.substring(0, 8) + '01'
      handleDateChange(ymd)
    }
  }

  // ── Sync / Refresh State ──
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [syncToast, setSyncToast] = useState<string | null>(null)

  // ── Modal for Marking Specifically Absent ──
  const [absentModalCleaner, setAbsentModalCleaner] = useState<string | null>(null)
  const [absenceReasonCategory, setAbsenceReasonCategory] = useState<AbsenceCategory>('Sick Leave')
  const [showDecided, setShowDecided] = useState(false)
  const [absenceCustomNote, setAbsenceCustomNote] = useState('')

  // ── Modal for Quick Shifts / Jobs ──
  const [selectedCleanerDetails, setSelectedCleanerDetails] = useState<CleanerAttendanceRecord | null>(null)

  // ── Jobs for the Selected Date (Automatically fetched & normalized from Daily Job Sheet) ──
  const dateJobs = useMemo(() => {
    return dailyJobs.filter(j => {
      if (isBogusJob(j)) return false
      const jobDate = (j.date || '').split('T')[0].replace(/\//g, '-').trim()
      return jobDate === selectedDate
    })
  }, [dailyJobs, selectedDate])

  // ── All Known Cleaners List (Comprehensive & deduplicated) ──
  // Shared with the Daily Job Sheet "no job" rows (R-ATT-04, AUD-51)
  const allKnownCleaners = useMemo(() => buildCleanerRoster(employees, dailyJobs, selectedDate), [employees, dailyJobs, selectedDate])

  // Map employees by lowercased name for fast lookup
  const employeeByName = useMemo(() => {
    const map = new Map<string, Employee>()
    employees.forEach(e => {
      if (e.full_name) map.set(e.full_name.trim().toLowerCase(), e)
    })
    return map
  }, [employees])

  // Overrides of registered cleaners are keyed by employee id, so renaming an employee keeps
  // their attendance history; unregistered names (and older entries) use the name (AUD-38)
  const nameKey = (name: string) => `${selectedDate}_${name.trim().toLowerCase()}`
  const overrideKeyFor = (name: string) => {
    const emp = employeeByName.get(name.trim().toLowerCase())
    return emp ? `${selectedDate}_id:${emp.id}` : nameKey(name)
  }
  const getOverride = (name: string) => overrides[overrideKeyFor(name)] ?? overrides[nameKey(name)]
  /** The key the cleaner's current mark is stored under (id key, or an older name key) */
  const markKeyOf = (name: string) => (overrideKeyFor(name) in overrides ? overrideKeyFor(name) : nameKey(name))
  /** Write an override under the id key and drop any older name-keyed copy */
  const putOverride = (name: string, value: AttendanceOverride | null) => {
    const idKey = overrideKeyFor(name)
    const changes = [{ key: idKey, mark: value, cleanerName: name.trim() }]
    if (nameKey(name) !== idKey && overrides[nameKey(name)]) changes.push({ key: nameKey(name), mark: null, cleanerName: name.trim() })
    saveAttendanceMarks(changes)
  }
  /** Non-approvers cannot undo a leave that admin / manager already decided (R-ATT-05) */
  const isLockedForMe = (m?: AttendanceOverride) => !isApprover && !!m && (m.approval === 'approved' || m.approval === 'rejected')

  // ── Leave approvals (R-ATT-05) — every date, newest first; Monday requests are flagged (R-ATT-06) ──
  const leaveRequests = useMemo(() => {
    const nameFor = (cleanerKey: string) => cleanerKey.startsWith('id:')
      ? employees.find(e => e.id === cleanerKey.slice(3))?.full_name || 'Unknown employee'
      : cleanerKey.replace(/\b\w/g, c => c.toUpperCase())
    return Object.entries(overrides)
      .filter(([, m]) => m.approval)
      .map(([key, m]) => {
        const { date, cleanerKey } = splitMarkKey(key)
        // R-ATT-06: other Monday absences / leave of this cleaner in the 90 days before — helps the decision
        const since = addDays(date, -90)
        const otherMondays = isMondayDate(date) ? Object.entries(overrides).filter(([k, o]) => {
          const p = splitMarkKey(k)
          return k !== key && p.cleanerKey === cleanerKey && p.date >= since && p.date < date && isMondayDate(p.date) && (o.status === 'absent' || o.status === 'on_leave')
        }).length : 0
        return { key, date, name: nameFor(cleanerKey), mark: m, monday: isMondayDate(date), otherMondays }
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
  }, [overrides, employees])
  const pendingLeaves = leaveRequests.filter(r => r.mark.approval === 'pending')
  const decidedLeaves = leaveRequests.filter(r => r.mark.approval !== 'pending').slice(0, 20)
  const handleDecideLeave = (key: string, approve: boolean) => {
    const m = overrides[key]
    const req = leaveRequests.find(r => r.key === key)
    if (!m || !isApprover) return
    saveAttendanceMarks([{ key, mark: decideLeave(m, approve, myName), cleanerName: req?.name }])
    setSyncToast(approve ? `Leave approved — ${req?.name}` : `Leave rejected — ${req?.name} recorded as Absent`)
    setTimeout(() => setSyncToast(null), 3000)
  }

  // ── Process Attendance Records for Every Known Cleaner ──
  const attendanceRecords = useMemo<CleanerAttendanceRecord[]>(() => {
    return allKnownCleaners.map(cleanerName => {
      const key = cleanerName.trim().toLowerCase()
      const emp = employeeByName.get(key)
      // Automatically fetch all jobs for this cleaner on selected date from Daily Job Sheet (uses employeeMatchesStaff for exact parity)
      const cleanerJobs = dateJobs.filter(j => emp ? employeeMatchesStaff(emp, j.staff_name) : matchesCleaner(j.staff_name, cleanerName))
      const explicitOverride = (emp && overrides[`${selectedDate}_id:${emp.id}`]) || overrides[`${selectedDate}_${key}`]

      // One shared rule for a cleaner's day (R-ATT-01..03) — also used by the monthly calendar (UX-20)
      const day = classifyAttendanceDay(cleanerJobs, explicitOverride, emp || cleanerName)
      const { status, absenceReason, dutyHours, otHours, isManualPresent, leavePending } = day
      const firstStartTime = day.workedJobs[0]?.start_time
      const lastEndTime = day.workedJobs[day.workedJobs.length - 1]?.end_time
      const activeWorkJobs = day.workedJobs

      return {
        name: cleanerName,
        employee: emp,
        status,
        jobs: cleanerJobs,
        dutyHours,
        otHours,
        jobsCount: activeWorkJobs.length,
        absenceReason,
        firstStartTime,
        lastEndTime,
        isManualPresent,
        leavePending,
        mark: explicitOverride,
      }
    })
  }, [allKnownCleaners, dateJobs, selectedDate, overrides, employeeByName])

  // ── Summary KPIs ──
  const kpis = useMemo(() => {
    const total = attendanceRecords.length
    const present = attendanceRecords.filter(r => r.status === 'present').length
    const available = attendanceRecords.filter(r => r.status === 'available').length
    const absent = attendanceRecords.filter(r => r.status === 'absent').length
    const onLeave = attendanceRecords.filter(r => r.status === 'on_leave').length
    const totalDuty = Math.round(attendanceRecords.reduce((s, r) => s + r.dutyHours, 0) * 10) / 10
    const totalOT = Math.round(attendanceRecords.reduce((s, r) => s + r.otHours, 0) * 10) / 10

    return { total, present, available, absent, onLeave, totalDuty, totalOT }
  }, [attendanceRecords])

  // Active cleaners count: available or present staff who are not inactive in employee records
  const activeCleanersCount = useMemo(() => {
    return attendanceRecords.filter(r =>
      (r.status === 'present' || r.status === 'available') &&
      (!r.employee || r.employee.status === 'active')
    ).length
  }, [attendanceRecords])

  // ── Filtered Records for Display ──
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter(record => {
      // Status tab filter
      if (statusFilter === 'present' && record.status !== 'present') return false
      if (statusFilter === 'available' && record.status !== 'available') return false
      if (statusFilter === 'absent' && record.status !== 'absent' && record.status !== 'on_leave') return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesName = record.name.toLowerCase().includes(q)
        const matchesJob = record.jobs.some(j =>
          (j.address || '').toLowerCase().includes(q) ||
          (j.area || '').toLowerCase().includes(q) ||
          (j.remarks || '').toLowerCase().includes(q)
        )
        const matchesReason = (record.absenceReason || '').toLowerCase().includes(q)
        if (!matchesName && !matchesJob && !matchesReason) return false
      }

      return true
    })
  }, [attendanceRecords, statusFilter, searchQuery])

  // ── Action Handlers ──
  const handleMarkPresent = (cleanerName: string, defaultHours: number = 8) => {
    putOverride(cleanerName, {
      status: 'present',
      dutyHours: defaultHours,
      reason: 'Manually marked as present',
      updatedAt: new Date().toISOString(),
      requestedBy: myName,
    })
    setSyncToast(`${cleanerName} marked as Present for ${selectedDate}`)
    setTimeout(() => setSyncToast(null), 3000)
  }

  const handleFetchDailySheet = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      setIsRefreshing(false)
      const workingCount = attendanceRecords.filter(r => r.jobsCount > 0).length
      setSyncToast(`Fetched ${dateJobs.length} shift(s) across ${workingCount} working cleaner(s) from Daily Job Sheet`)
      setTimeout(() => setSyncToast(null), 3500)
    }, 350)
  }

  const handleMarkSpecificallyAbsent = (cleanerName: string) => {
    setAbsentModalCleaner(cleanerName)
    setAbsenceReasonCategory('Sick Leave')
    setAbsenceCustomNote('')
  }

  const handleConfirmMarkAbsent = () => {
    if (!absentModalCleaner) return
    // R-ATT-05: leave from a non-approver is a pending request; absence is final at once
    const mark = newAbsenceMark(absenceReasonCategory, absenceCustomNote, user?.role, myName)
    putOverride(absentModalCleaner, mark)
    if (mark.approval === 'pending') {
      setSyncToast(`Leave request for ${absentModalCleaner} sent to admin / manager for approval`)
      setTimeout(() => setSyncToast(null), 3500)
    }
    setAbsentModalCleaner(null)
  }

  const handleMarkAvailable = (cleanerName: string) => {
    putOverride(cleanerName, {
      status: 'available',
      reason: undefined,
      updatedAt: new Date().toISOString(),
      requestedBy: myName,
    })
  }

  const handleClearOverride = (cleanerName: string) => {
    putOverride(cleanerName, null)
  }

  // ── CSV Export ──
  const handleExportCSV = () => {
    const headers = ['Staff Name', 'Date', 'Status', 'Jobs Assigned', 'Duty Hours', 'Overtime Hours', 'Shift Timing', 'Reason / Remarks']
    const rows = attendanceRecords.map(r => {
      const statusLabel =
        r.status === 'present' ? 'Present (Working)' :
        r.status === 'available' ? 'Available (Standby / No Job Assigned)' :
        r.status === 'on_leave' ? 'On Leave' : 'Absent (Specifically Marked)'

      const timing = r.firstStartTime && r.lastEndTime ? `${r.firstStartTime} - ${r.lastEndTime}` : '—'
      const reason = r.absenceReason || (r.status === 'available' ? 'Available - 0 jobs logged' : '')

      return [
        `"${r.name}"`,
        `"${selectedDate}"`,
        `"${statusLabel}"`,
        r.jobsCount,
        r.dutyHours,
        r.otHours,
        `"${timing}"`,
        `"${reason.replace(/"/g, '""')}"`,
      ].join(',')
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Safaeewala_Cleaner_Attendance_${selectedDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* ── Top Header Bar (CRM Signature Dark Slate-Teal Hero Header) ── */}
      <div className="gradient-card rounded-[24px] px-6 sm:px-7 py-5 sm:py-6 text-white shadow-[0_8px_32px_rgba(15,23,42,0.28)] ring-1 ring-black/10 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-5">
        {/* Ambient Glow */}
        <div className="absolute inset-0 rounded-[24px] overflow-hidden pointer-events-none">
          <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-10 h-10 rounded-2xl bg-white/10 text-emerald-400 flex items-center justify-center border border-white/15 shadow-sm shrink-0">
              <UserCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[22px] font-extrabold text-white tracking-tight">
                  Cleaner Attendance System
                </h1>
                <span className="text-[10.5px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Live Job Sheet Sync
                </span>
              </div>
              <p className="text-[13px] font-bold text-emerald-300 mt-0.5">
                {fmtDateHeading(selectedDate)}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Links */}
        <div className="relative z-10 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleFetchDailySheet}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-[12.5px] font-bold transition-all shadow-2xs cursor-pointer ${
              isRefreshing
                ? 'bg-white/20 text-white border-white/30'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
            }`}
            title="Fetch and sync live attendance from Daily Job Sheet"
          >
            <RotateCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Fetch Daily Sheet</span>
          </button>

          <Link
            to={`/daily-job-sheet?date=${selectedDate}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 font-bold text-[12.5px] transition-colors shadow-2xs"
            title="Open Daily Job Sheet for this date"
          >
            <ClipboardListIcon size={14} className="text-emerald-300" />
            <span>Open Job Sheet</span>
          </Link>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 font-bold text-[12.5px] transition-colors shadow-2xs cursor-pointer"
            title="Export CSV"
          >
            <Download size={14} className="text-emerald-300" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-extrabold text-[12.5px] transition-colors shadow-sm cursor-pointer"
            title="Print Attendance Sheet"
          >
            <Printer size={14} />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* UX-117: Employees · Attendance tabs under the header (Attendance is a tab of Employees) */}
      <div className="-mb-6"><ModuleTabs /></div>

      {/* ── Auto-Fetch Sync Feedback Toast ── */}
      {syncToast && (
        <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-teal-950 text-[12px] font-bold flex items-center justify-between shadow-2xs animate-in fade-in">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
            <span>{syncToast}</span>
          </span>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="text-teal-700 hover:text-teal-900 p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Executive Summary KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cleaners */}
        <div
          onClick={() => setStatusFilter('all')}
          className={`bg-white rounded-2xl p-5 border transition-all cursor-pointer group shadow-[0_4px_20px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_25px_rgba(15,23,42,0.08)] ${
            statusFilter === 'all' ? 'border-indigo-400 ring-2 ring-indigo-400/20' : 'border-[#E4E8EC]'
          }`}
          title="Click to view all cleaners"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100/80 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform">
              <Users size={20} />
            </div>
            <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50/80 px-2.5 py-1 rounded-full border border-indigo-100">
              Total Roster
            </span>
          </div>
          <p className="text-[28px] font-black text-slate-900 leading-none tracking-tight">{kpis.total}</p>
          <p className="text-[13.5px] font-bold text-slate-700 mt-2">Total Cleaners</p>
          <p className="text-[11.5px] text-slate-400 mt-0.5">All registered & rostered staff</p>
        </div>

        {/* Active Cleaners */}
        <div
          onClick={() => setStatusFilter('all')}
          className="bg-white rounded-2xl p-5 border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_25px_rgba(15,23,42,0.08)] transition-all cursor-pointer group"
          title="Click to view active cleaners"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-100/80 flex items-center justify-center text-teal-600 group-hover:scale-105 transition-transform">
              <UserCheck size={20} />
            </div>
            <span className="text-[11px] font-bold text-teal-700 bg-teal-50/80 px-2.5 py-1 rounded-full border border-teal-100">
              Active / Ready
            </span>
          </div>
          <p className="text-[28px] font-black text-slate-900 leading-none tracking-tight">
            {activeCleanersCount}
          </p>
          <p className="text-[13.5px] font-bold text-slate-700 mt-2">Active Cleaners</p>
          <p className="text-[11.5px] text-slate-400 mt-0.5">{kpis.present} working · {kpis.available} on standby</p>
        </div>

        {/* Present Cleaners */}
        <div
          onClick={() => setStatusFilter('present')}
          className={`bg-white rounded-2xl p-5 border transition-all cursor-pointer group shadow-[0_4px_20px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_25px_rgba(15,23,42,0.08)] ${
            statusFilter === 'present' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-[#E4E8EC]'
          }`}
          title="Click to filter present cleaners"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100/80 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
              <CheckCircle2 size={20} />
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50/80 px-2.5 py-1 rounded-full border border-emerald-200">
              On Duty Today
            </span>
          </div>
          <p className="text-[28px] font-black text-emerald-700 leading-none tracking-tight">{kpis.present}</p>
          <p className="text-[13.5px] font-bold text-slate-700 mt-2">Present Cleaners</p>
          <p className="text-[11.5px] text-slate-400 mt-0.5">{kpis.totalDuty}h duty · {kpis.totalOT}h OT logged</p>
        </div>

        {/* Absent Cleaners */}
        <div
          onClick={() => setStatusFilter('absent')}
          className={`bg-white rounded-2xl p-5 border transition-all cursor-pointer group shadow-[0_4px_20px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_25px_rgba(15,23,42,0.08)] ${
            statusFilter === 'absent' ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-[#E4E8EC]'
          }`}
          title="Click to filter absent cleaners"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100/80 flex items-center justify-center text-rose-600 group-hover:scale-105 transition-transform">
              <UserX size={20} />
            </div>
            <span className="text-[11px] font-bold text-rose-700 bg-rose-50/80 px-2.5 py-1 rounded-full border border-rose-200">
              Explicit Absent
            </span>
          </div>
          <p className="text-[28px] font-black text-rose-600 leading-none tracking-tight">{kpis.absent + kpis.onLeave}</p>
          <p className="text-[13.5px] font-bold text-slate-700 mt-2">Absent Cleaners</p>
          <p className="text-[11.5px] text-slate-400 mt-0.5">
            {kpis.absent + kpis.onLeave === 0 ? 'No uninformed absences' : `${kpis.absent} absent · ${kpis.onLeave} on leave`}{pendingLeaves.length > 0 ? ` · ${pendingLeaves.length} leave pending` : ''}
          </p>
        </div>
      </div>

      {/* ── Filters & Controls Toolbar (Date/Calendar/Timeframe filters moved BEFORE Search, Single Calendar Icon, Dropdown for Staff) ── */}
      <div className="bg-white rounded-2xl p-3.5 border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.04)] flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
        {/* Left: Date, Timeframe, Calendar Filters & Attendance Dropdown (Moved before search) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Day Stepper & Native Date Picker (Single icon, no redundancy) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => handleDateChange(addDays(selectedDate, -1))}
              className="p-1.5 rounded-lg hover:bg-white text-slate-700 transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={e => handleDateChange(e.target.value)}
              className="bg-transparent text-slate-800 font-extrabold text-[12.5px] px-1 py-1 focus:outline-none cursor-pointer"
            />
            <button
              type="button"
              onClick={() => handleDateChange(addDays(selectedDate, 1))}
              className="p-1.5 rounded-lg hover:bg-white text-slate-700 transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Today Button */}
          <button
            type="button"
            onClick={() => handleDateChange(todayDubai())}
            className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-colors cursor-pointer ${
              selectedDate === todayDubai()
                ? 'bg-emerald-600 text-white border-emerald-600 font-extrabold shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
            }`}
          >
            Today
          </button>

          {/* Timeframe Dropdown next to Today */}
          <select
            value={timeframePreset}
            onChange={e => handleTimeframeChange(e.target.value)}
            className="px-3 py-2 rounded-xl text-[12px] font-bold bg-slate-100 border border-slate-200 text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
            title="Timeframe Preset"
          >
            <option value="today">Timeframe: Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
          </select>

          {/* Dropdown for Attendance Filter (All Staff, Present, Available, Absent) */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3.5 py-2 rounded-xl text-[12px] font-extrabold bg-slate-100 border border-slate-200 text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
            title="Filter by Attendance Status"
          >
            <option value="all">👥 All Staff ({kpis.total})</option>
            <option value="present">🟢 Present ({kpis.present})</option>
            <option value="available">🔵 Available ({kpis.available})</option>
            <option value="absent">🔴 Absent ({kpis.absent + kpis.onLeave})</option>
          </select>
        </div>

        {/* Right: Search Cleaner Name/Location Field (Moved after the filters) */}
        <div className="relative min-w-[260px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search cleaner name, location…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-[12.5px] bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-medium text-slate-800"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Leave approvals (R-ATT-05); Monday requests carry a yellow flag (R-ATT-06) ── */}
      {(pendingLeaves.length > 0 || decidedLeaves.length > 0) && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-[0_4px_20px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50/70 border-b border-amber-100 flex-wrap">
            <p className="text-[13.5px] font-extrabold text-amber-950 flex items-center gap-2">
              <ShieldCheck size={16} className="text-amber-600" />
              Leave approvals
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white">{pendingLeaves.length} pending</span>
            </p>
            <div className="flex items-center gap-3">
              {!isApprover && pendingLeaves.length > 0 && (
                <span className="text-[11px] text-amber-800 font-semibold">Admin / manager decide these requests</span>
              )}
              {decidedLeaves.length > 0 && (
                <button type="button" onClick={() => setShowDecided(v => !v)} className="text-[11px] font-bold text-amber-800 hover:underline cursor-pointer">
                  {showDecided ? 'Hide decided' : `Show decided (${decidedLeaves.length})`}
                </button>
              )}
            </div>
          </div>
          {pendingLeaves.length === 0 && !showDecided ? (
            <p className="px-4 py-3 text-[12px] text-slate-500">No leave waiting for approval.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {[...pendingLeaves, ...(showDecided ? decidedLeaves : [])].map(r => {
                const pending = r.mark.approval === 'pending'
                const flagged = pending && r.monday
                return (
                  <div key={r.key} className={`flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap ${flagged ? 'bg-yellow-50 border-l-4 border-l-yellow-400' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
                        {r.name}
                        <button type="button" onClick={() => handleDateChange(r.date)} className="text-[11px] font-bold text-teal-700 hover:underline cursor-pointer">{fmtShortDate(r.date)}</button>
                        {flagged && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-300 text-yellow-950 border border-yellow-500" title="Leave on a Monday — check before deciding">
                            <Flag size={10} className="fill-yellow-700 text-yellow-800" /> Monday
                          </span>
                        )}
                        {flagged && r.otherMondays > 0 && (
                          <span className="text-[10px] font-bold text-yellow-900">{r.otherMondays} other Monday{r.otherMondays > 1 ? 's' : ''} off in last 90 days</span>
                        )}
                        {!pending && (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.mark.approval === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {r.mark.approval === 'approved' ? 'Approved' : 'Rejected → Absent'}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-600 truncate">
                        {r.mark.reason || r.mark.category || 'Leave'}
                        {r.mark.requestedBy && <span className="text-slate-400"> · requested by {r.mark.requestedBy}</span>}
                        {!pending && r.mark.decidedBy && <span className="text-slate-400"> · decided by {r.mark.decidedBy}</span>}
                      </p>
                    </div>
                    {pending && isApprover && (
                      <div className="flex gap-1.5 shrink-0">
                        <button type="button" onClick={() => handleDecideLeave(r.key, true)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer">Approve leave</button>
                        <button type="button" onClick={() => handleDecideLeave(r.key, false)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px] cursor-pointer">Reject → Absent</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Cleaners Attendance Roster Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredRecords.map((cleaner, idx) => {
          const isPresent = cleaner.status === 'present'
          const isAvailable = cleaner.status === 'available'
          const isAbsent = cleaner.status === 'absent'
          const isOnLeave = cleaner.status === 'on_leave'

          return (
            <div
              key={cleaner.name}
              className={`bg-white rounded-2xl border transition-all p-4.5 flex flex-col justify-between shadow-[0_4px_16px_rgba(15,23,42,0.03)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)] ${
                isPresent ? 'border-emerald-200/80 hover:border-emerald-300' :
                isAvailable ? 'border-sky-200/80 hover:border-sky-300 bg-gradient-to-b from-sky-50/20 to-white' :
                'border-rose-200/90 hover:border-rose-300 bg-gradient-to-b from-rose-50/30 to-white'
              }`}
            >
              <div>
                {/* Cleaner Header: Avatar, Name, Status Badge */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold text-[14px] text-white shadow-xs shrink-0 ${
                        isPresent ? 'bg-gradient-to-br from-emerald-600 to-teal-700' :
                        isAvailable ? 'bg-gradient-to-br from-sky-500 to-blue-600' :
                        'bg-gradient-to-br from-rose-600 to-red-700'
                      }`}
                    >
                      {cleaner.name.trim()[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-extrabold text-[#111827] truncate">
                        {cleaner.name}
                      </p>
                      <p className="text-[11.5px] text-slate-500 mt-0.5 flex items-center gap-1.5 truncate">
                        <span>{cleaner.employee?.role ? cleaner.employee.role.replace('_', ' ') : 'Cleaner'}</span>
                        {cleaner.employee?.phone && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400">{cleaner.employee.phone}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Attendance Badge */}
                  <div className="shrink-0 text-right">
                    {isPresent && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        <span>Present {cleaner.jobsCount > 0 ? `(${cleaner.jobsCount})` : '(Manual)'}</span>
                      </span>
                    )}
                    {isAvailable && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                        <span>Available (Standby)</span>
                      </span>
                    )}
                    {isAbsent && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                        <span>Specifically Absent</span>
                      </span>
                    )}
                    {isOnLeave && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                        <span className={`w-1.5 h-1.5 rounded-full bg-amber-500 ${cleaner.leavePending ? 'animate-pulse' : ''}`} />
                        <span>{cleaner.leavePending ? 'Leave · Awaiting approval' : 'On Leave'}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Details */}
                {isPresent && (
                  <div className="bg-[#f8fafc] rounded-xl p-3 border border-slate-100 space-y-2 mb-3">
                    <div className="flex items-center justify-between text-[11.5px] text-slate-700 font-semibold">
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock size={12} className="text-emerald-600" />
                        Shift Timing:
                      </span>
                      <span className="font-bold text-slate-900">
                        {cleaner.firstStartTime || '08:00'} {cleaner.lastEndTime ? `– ${cleaner.lastEndTime}` : cleaner.firstStartTime ? '' : '– 16:00 (Standard)'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11.5px] text-slate-700">
                      <span className="text-slate-500">Hours Logged:</span>
                      <span className="font-extrabold text-emerald-800">
                        {cleaner.dutyHours}h duty
                        {cleaner.otHours > 0 && (
                          <span className="ml-1.5 bg-orange-100 text-orange-800 font-bold px-1.5 py-0.2 rounded text-[10.5px]">
                            +{cleaner.otHours}h OT
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Assigned locations summary or manual present note */}
                    {cleaner.jobs.length > 0 ? (
                      <div className="pt-1 border-t border-slate-200/60">
                        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Assigned Locations ({cleaner.jobs.length}):
                        </p>
                        <div className="space-y-1">
                          {cleaner.jobs.slice(0, 2).map((j, i) => (
                            <p key={j.id || i} className="text-[11px] text-slate-700 truncate flex items-center gap-1">
                              <MapPin size={10} className="text-slate-400 shrink-0" />
                              <span className="font-semibold">{j.address || 'Location'}</span>
                              <span className="text-slate-400">({j.start_time || '—'})</span>
                            </p>
                          ))}
                          {cleaner.jobs.length > 2 && (
                            <p className="text-[10px] text-teal-700 font-bold">
                              +{cleaner.jobs.length - 2} more shift{cleaner.jobs.length - 2 > 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-1 border-t border-emerald-100/80 text-[11px] text-emerald-800 font-semibold flex items-center gap-1">
                        <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                        <span>{cleaner.absenceReason || 'Manually marked as Present for today'}</span>
                      </div>
                    )}
                  </div>
                )}

                {isAvailable && (
                  <div className="bg-sky-50/60 rounded-xl p-3 border border-sky-100 mb-3 space-y-1.5">
                    <p className="text-[12px] font-bold text-sky-950 flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-sky-600" />
                      <span>Available for Deployment</span>
                    </p>
                    <p className="text-[11px] text-sky-800/80 leading-relaxed">
                      Cleaner is available. Blank entry in Daily Job Sheet with 0 booking assigned.
                    </p>
                  </div>
                )}

                {(isAbsent || isOnLeave) && (
                  <div className="bg-rose-50/70 rounded-xl p-3 border border-rose-100 mb-3 space-y-1">
                    <p className="text-[12px] font-bold text-rose-950 flex items-center gap-1.5">
                      <AlertCircle size={13} className="text-rose-600" />
                      <span>Absence Details:</span>
                    </p>
                    <p className="text-[11.5px] text-rose-900 font-semibold italic">
                      {cleaner.absenceReason || 'Specifically marked absent by supervisor'}
                    </p>
                    {cleaner.mark?.approval && (
                      <p className="text-[10.5px] text-slate-600 flex items-center gap-1">
                        <ShieldCheck size={11} className="text-slate-500 shrink-0" />
                        {cleaner.mark.approval === 'pending'
                          ? `Leave requested${cleaner.mark.requestedBy ? ` by ${cleaner.mark.requestedBy}` : ''} — waiting for admin / manager`
                          : `Leave ${cleaner.mark.approval === 'approved' ? 'approved' : 'rejected → absent'}${cleaner.mark.decidedBy ? ` by ${cleaner.mark.decidedBy}` : ''}`}
                      </p>
                    )}
                    {cleaner.leavePending && isApprover && (
                      <div className="flex gap-1.5 pt-1">
                        <button type="button" onClick={() => handleDecideLeave(markKeyOf(cleaner.name), true)}
                          className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10.5px] cursor-pointer">Approve leave</button>
                        <button type="button" onClick={() => handleDecideLeave(markKeyOf(cleaner.name), false)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10.5px] cursor-pointer">Reject → Absent</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11.5px] gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCleanerDetails(cleaner)}
                  className="font-bold text-teal-700 hover:text-teal-900 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Eye size={12} />
                  <span>View Shifts ({cleaner.jobs.length})</span>
                </button>

                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {/* "Mark as Present" Option */}
                  {!isPresent && !isLockedForMe(cleaner.mark) && (
                    <button
                      type="button"
                      onClick={() => handleMarkPresent(cleaner.name)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors cursor-pointer text-[11px] shadow-xs flex items-center gap-1"
                      title="Mark cleaner as Present for this date"
                    >
                      <Check size={12} className="stroke-[2.5]" />
                      <span>Mark as Present</span>
                    </button>
                  )}

                  {/* "Mark Absent" Option for Available */}
                  {isAvailable && (
                    <button
                      type="button"
                      onClick={() => handleMarkSpecificallyAbsent(cleaner.name)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 transition-colors cursor-pointer text-[11px]"
                      title="Mark as Specifically Absent for this date"
                    >
                      Mark Absent
                    </button>
                  )}

                  {/* "Mark Available" Option for Absent / On Leave */}
                  {(isAbsent || isOnLeave) && !isLockedForMe(cleaner.mark) && (
                    <button
                      type="button"
                      onClick={() => handleMarkAvailable(cleaner.name)}
                      className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold border border-sky-200 transition-colors cursor-pointer text-[11px]"
                      title="Revert to Available (Standby)"
                    >
                      Mark Available
                    </button>
                  )}

                  {/* "Mark Absent" Option for Present */}
                  {isPresent && (
                    <button
                      type="button"
                      onClick={() => handleMarkSpecificallyAbsent(cleaner.name)}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-semibold border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer text-[10.5px]"
                      title="Override to Absent"
                    >
                      Mark Absent
                    </button>
                  )}

                  {getOverride(cleaner.name) && !isLockedForMe(cleaner.mark) && (
                    <button
                      type="button"
                      onClick={() => handleClearOverride(cleaner.name)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 underline cursor-pointer ml-1"
                      title="Clear manual override & reset to Daily Job Sheet data"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Monthly calendar per cleaner + month export (UX-20) ── */}
      <AttendanceCalendar
        cleaners={allKnownCleaners}
        employeeByName={employeeByName}
        dailyJobs={dailyJobs}
        overrides={overrides}
      />

      {/* ── Modal: Specifically Mark Absent ── */}
      {absentModalCleaner && (() => {
        const isLeave = isLeaveCategory(absenceReasonCategory)
        const busy = attendanceRecords.find(r => r.name === absentModalCleaner)?.jobsCount || 0
        return (
        <Modal
          open={!!absentModalCleaner}
          onClose={() => setAbsentModalCleaner(null)}
          title={`Absent / Leave — ${absentModalCleaner}`}
          size="md"
        >
          <div className="space-y-4">
            <div className={`${isLeave ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-rose-50 border-rose-200 text-rose-950'} border rounded-xl p-3 text-[12px] space-y-1`}>
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle size={14} className={`${isLeave ? 'text-amber-600' : 'text-rose-600'} shrink-0`} />
                <span>{fmtDateHeading(selectedDate)}</span>
                {isLeave && isMondayDate(selectedDate) && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-300 text-yellow-950 border border-yellow-500"><Flag size={10} /> Monday</span>
                )}
              </p>
              <p className="text-[11px]">
                {!isLeave
                  ? 'Recorded as Absent at once (not Available / Standby).'
                  : isApprover
                    ? 'You are admin / manager: this leave is approved at once.'
                    : 'This is a leave request. Admin / manager will approve it as leave or reject it as absent.'}
              </p>
            </div>

            {busy > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-[11.5px] text-orange-900 font-semibold flex items-start gap-1.5">
                <AlertTriangle size={14} className="text-orange-600 shrink-0 mt-0.5" />
                <span>{absentModalCleaner} has {busy} job{busy > 1 ? 's' : ''} on this date in the Daily Job Sheet. Reassign {busy > 1 ? 'them' : 'it'} to another cleaner there — the jobs stay in the sheet.</span>
              </div>
            )}

            <div>
              <label className="block text-[11.5px] font-bold text-slate-700 mb-1.5">
                Category *
              </label>
              <select
                value={absenceReasonCategory}
                onChange={e => setAbsenceReasonCategory(e.target.value as AbsenceCategory)}
                className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-white font-semibold text-slate-800 focus:outline-none focus:border-rose-500"
              >
                <optgroup label={isApprover ? 'Leave' : 'Leave (needs approval)'}>
                  {LEAVE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                </optgroup>
                <optgroup label="Absent">
                  {ABSENCE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-[11.5px] font-bold text-slate-700 mb-1.5">
                Remarks / Additional Notes (Optional)
              </label>
              <textarea
                value={absenceCustomNote}
                onChange={e => setAbsenceCustomNote(e.target.value)}
                placeholder="e.g. Inquired by supervisor, doctor appointment..."
                rows={3}
                className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-white text-slate-800 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAbsentModalCleaner(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className={`flex-1 text-white font-bold ${isLeave ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                onClick={handleConfirmMarkAbsent}
              >
                {!isLeave ? 'Confirm Absent' : isApprover ? 'Save Leave' : 'Send Leave Request'}
              </Button>
            </div>
          </div>
        </Modal>
        )
      })()}

      {/* ── Modal: View Cleaner Daily Shifts ── */}
      {selectedCleanerDetails && (
        <Modal
          open={!!selectedCleanerDetails}
          onClose={() => setSelectedCleanerDetails(null)}
          title={`Shifts & Attendance Details — ${selectedCleanerDetails.name}`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase">Status for {selectedDate}</p>
                <p className="text-[14px] font-extrabold text-[#111827] mt-0.5 capitalize">
                  {selectedCleanerDetails.status === 'present' ? 'Present (Working on shifts)' :
                   selectedCleanerDetails.status === 'available' ? 'Available (Standby · 0 Jobs)' :
                   selectedCleanerDetails.status === 'on_leave' ? 'On Leave' : 'Specifically Absent'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Duty Hours</p>
                <p className="text-[14px] font-extrabold text-emerald-700 mt-0.5">
                  {selectedCleanerDetails.dutyHours}h duty {selectedCleanerDetails.otHours > 0 ? `· ${selectedCleanerDetails.otHours}h OT` : ''}
                </p>
              </div>
            </div>

            {selectedCleanerDetails.jobs.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-[13px] font-bold text-slate-700">
                  {selectedCleanerDetails.status === 'present'
                    ? 'Marked as Present (Standby / On-Site Duty)'
                    : 'No Jobs Assigned for this Date'}
                </p>
                <p className="text-[11.5px] text-slate-400 mt-1">
                  {selectedCleanerDetails.status === 'present'
                    ? `Cleaner is recorded as Present with ${selectedCleanerDetails.dutyHours}h duty logged.`
                    : 'Cleaner was available on standby. To assign a job, open the Daily Job Sheet.'}
                </p>
                <Link
                  to={`/daily-job-sheet?date=${selectedDate}`}
                  className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[12px] font-bold shadow-xs"
                >
                  <Plus size={13} />
                  <span>Assign Job in Daily Sheet</span>
                </Link>
              </div>
            ) : (
              <div className="border border-[#E4E8EC] rounded-2xl overflow-x-auto shadow-xs">
                <table className="w-full min-w-[560px] text-left border-collapse text-[12px]">
                  <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[10.5px] font-bold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Timing</th>
                      <th className="py-2.5 px-3">Client / Address</th>
                      <th className="py-2.5 px-3">Location</th>
                      <th className="py-2.5 px-3 text-center">Duty</th>
                      <th className="py-2.5 px-3 text-right">Charges</th>
                      <th className="py-2.5 px-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E8EC]">
                    {selectedCleanerDetails.jobs.map(j => (
                      <tr key={j.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                          {j.start_time || '—'} - {j.end_time || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {j.address || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {j.area || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-800 whitespace-nowrap">
                          {j.duty_hours ? `${j.duty_hours}h` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800 whitespace-nowrap">
                          {j.charges ? `AED ${j.charges}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 italic max-w-[150px] truncate" title={j.remarks}>
                          {j.remarks || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setSelectedCleanerDetails(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ClipboardListIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  )
}
