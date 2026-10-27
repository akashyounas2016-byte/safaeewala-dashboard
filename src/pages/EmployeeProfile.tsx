import { useState, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Star, Clock, Camera, Activity,
  CheckCircle, CheckCircle2, User, Shield, DollarSign, ExternalLink, Pencil,
  Search, FileText, TrendingUp, AlertTriangle, Layers,
  Download, Eye, FileCheck, Truck, Briefcase, Paperclip, Building2, Upload, Trash2,
  Flame, Zap, UserCheck, Sparkles, Check
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatDate, daysUntil } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { PaymentMode, EmployeeRole, EmployeeDocument, Employee } from '@/types'
import { EmployeeDocumentPreviewModal } from '@/components/employees/EmployeeDocumentField'
import {
  getAssignableClients,
  formatMonthlySalary,
  getEmployeeDailyJobsHistory,
  calcJobOTHours,
  cleanClientNameFromAddress,
  splitStaffNames,
  MONTHLY_WORK_HOURS,
  formatEmpRole,
} from '@/lib/clientDataSync'
import { calcEmployeeHealth, type EmployeeHealth } from '@/lib/employeeHealth'
import { EmployeeFormModal } from '@/components/employees/EmployeeFormModal'

/* ─── Avatar palette ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72' },
  { bg: '#fce4d6', text: '#c66a3a' },
  { bg: '#e4dff5', text: '#6b5bb5' },
  { bg: '#d6e7f5', text: '#3a7ab8' },
  { bg: '#fcecc8', text: '#a8842a' },
]

function Avatar({ name, size = 'md', idx = 0, photoUrl }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; idx?: number; photoUrl?: string }) {
  const parts = name.trim().split(' ')
  const init  = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'EM'
  const dims  = size === 'xl' ? 'w-20 h-20 text-[22px]' : size === 'lg' ? 'w-14 h-14 text-[16px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-[13px]'
  const color = avatarColors[idx % avatarColors.length]
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className={`${dims} rounded-full object-cover shrink-0 shadow-xs border border-slate-200`} />
  }
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0 shadow-xs`} style={{ background: color.bg, color: color.text }}>
      {init}
    </div>
  )
}

/** Downscale a picked image to a small square-ish JPEG data URL so it stays light in storage */
function resizeImageToDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Unsupported image'))
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

const healthTone: Record<EmployeeHealth['grade'], { ring: string; text: string; chip: string }> = {
  'Excellent':       { ring: '#059669', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Good':            { ring: '#0d9488', text: 'text-teal-700',    chip: 'bg-teal-50 text-teal-700 border-teal-200' },
  'Needs Attention': { ring: '#d97706', text: 'text-amber-700',   chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  'At Risk':         { ring: '#e11d48', text: 'text-rose-700',    chip: 'bg-rose-50 text-rose-700 border-rose-200' },
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

function ExpiryCard({ date, label }: { date: string | undefined | null; label: string }) {
  if (!date) return (
    <div className="rounded-xl p-3 text-center border border-[#E4E8EC] bg-slate-50">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="text-[11px] mt-0.5 text-slate-400">Not recorded</p>
    </div>
  )
  const days = daysUntil(date)
  let bg = 'bg-emerald-50'; let text = 'text-emerald-700'
  if (days < 0)        { bg = 'bg-red-50';   text = 'text-red-700'   }
  else if (days < 30)  { bg = 'bg-red-50';   text = 'text-red-700'   }
  else if (days < 90)  { bg = 'bg-amber-50'; text = 'text-amber-700' }
  return (
    <div className={`rounded-xl p-3 text-center border border-[#E4E8EC] ${bg}`}>
      <p className={`text-[11px] font-bold ${text}`}>{label}</p>
      <p className={`text-[11px] mt-0.5 ${text}`}>{formatDate(date)}</p>
      {days < 90 && <p className={`text-[10.5px] font-extrabold mt-0.5 ${text}`}>{days < 0 ? 'EXPIRED' : `${days}d left`}</p>}
    </div>
  )
}

export function EmployeeProfile() {
  const { id } = useParams<{ id: string }>()
  const { employees, dailyJobs, updateEmployee, agencies, clients } = useData()

  const [activeTab, setActiveTab]   = useState<'history' | 'locations' | 'info'>('history')
  const [search, setSearch]         = useState('')
  const [onlyOT, setOnlyOT]         = useState(false)
  const [editOpen, setEditOpen]     = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null)

  const emp = employees.find(e => e.id === id)
  const empIdx = employees.findIndex(e => e.id === id)

  // Aggregate documents attached to this employee for preview & download
  const uploadedDocs = useMemo(() => {
    if (!emp) return []
    const list: EmployeeDocument[] = emp.documents ? [...emp.documents] : []
    const addIf = (cat: string, name: string, fileData?: string) => {
      if (fileData && !list.some(d => d.category === cat)) {
        list.push({
          id: `doc-${cat}-${emp.id}`,
          name,
          category: cat as any,
          file_data: fileData,
          file_type: fileData.startsWith('data:image/') ? 'image/jpeg' : 'application/pdf',
          file_size: Math.round(fileData.length * 0.75),
          uploaded_at: emp.created_at || new Date().toISOString(),
        })
      }
    }
    addIf('eid', `${emp.full_name} - Emirates ID`, emp.eid_file)
    addIf('passport', `${emp.full_name} - Passport`, emp.passport_file)
    addIf('visa', `${emp.full_name} - Visa`, emp.visa_file)
    addIf('work_permit', `${emp.full_name} - Work Permit`, emp.work_permit_file)
    addIf('driving_license', `${emp.full_name} - Driving License`, emp.driving_license_file)
    addIf('medical_insurance', `${emp.full_name} - Medical Insurance`, emp.medical_insurance_file)
    addIf('noc', `${emp.full_name} - NOC`, emp.noc_file)
    return list
  }, [emp])

  // Fetch complete service history from Daily Job Sheet for this employee
  const empJobs = useMemo(() => {
    return emp ? getEmployeeDailyJobsHistory(emp, dailyJobs) : []
  }, [emp, dailyJobs])

  // Aggregate stats from Daily Job Sheet
  const totalShifts = empJobs.length
  const totalDutyHours = Math.round(empJobs.reduce((s, j) => s + (Number(j.duty_hours) || 0), 0) * 10) / 10
  const totalOTHours = Math.round(empJobs.reduce((s, j) => s + calcJobOTHours(j), 0) * 10) / 10
  // A shared shift's charge is split between its cleaners, not counted fully for each
  const totalRevenue = Math.round(empJobs.reduce((s, j) => s + (Number(j.charges) || 0) / Math.max(1, splitStaffNames(j.staff_name).length), 0))
  const totalCashCollected = empJobs.filter(j => j.payment_mode === 'Cash').reduce((s, j) => s + (Number(j.received) || 0), 0)
  const uniqueClients = Array.from(new Set(empJobs.map(j => cleanClientNameFromAddress(j.address)).filter(Boolean)))

  const health = useMemo(() => (emp ? calcEmployeeHealth(emp, empJobs) : null), [emp, empJobs])

  const handlePhotoPick = async (file: File | undefined) => {
    if (!emp || !file) return
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return }
    try {
      updateEmployee(emp.id, { photo_url: await resizeImageToDataUrl(file) })
    } catch {
      alert('Could not read this image. Please try another file.')
    }
  }

  // Filtered jobs table
  const filteredJobs = useMemo(() => {
    return empJobs.filter(j => {
      const q = search.toLowerCase().trim()
      const matchSearch = !q ||
        (j.date && j.date.includes(q)) ||
        (j.address && j.address.toLowerCase().includes(q)) ||
        (j.area && j.area.toLowerCase().includes(q)) ||
        (j.service && j.service.toLowerCase().includes(q)) ||
        (j.remarks && j.remarks.toLowerCase().includes(q)) ||
        (j.payment_mode && j.payment_mode.toLowerCase().includes(q))

      const ot = calcJobOTHours(j)
      const matchOT = !onlyOT || ot > 0
      return matchSearch && matchOT
    })
  }, [empJobs, search, onlyOT])

  // Frequent Locations / Clients breakdown
  const frequentLocations = useMemo(() => {
    const map = new Map<string, { address: string; area: string; visits: number; dutyHours: number; otHours: number }>()
    empJobs.forEach(j => {
      const addr = cleanClientNameFromAddress(j.address || 'Location')
      if (!map.has(addr)) {
        map.set(addr, { address: addr, area: j.area || 'Dubai', visits: 0, dutyHours: 0, otHours: 0 })
      }
      const item = map.get(addr)!
      item.visits += 1
      item.dutyHours += Number(j.duty_hours) || 0
      item.otHours += calcJobOTHours(j)
    })
    return Array.from(map.values()).sort((a, b) => b.visits - a.visits)
  }, [empJobs])

  if (!emp) {
    return (
      <div className="space-y-6">
        <Link to="/employees" className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft size={14} /> Back to Employees
        </Link>
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-16 text-center">
          <p className="text-slate-500 font-medium">Employee not found.</p>
        </div>
      </div>
    )
  }

  const lastActiveDate = empJobs[0]?.date || emp.joined_date || '—'
  const isDiscoveredFromJobSheet = emp.id.startsWith('emp-dj-')

  return (
    <div className="space-y-6">

      {/* Top back nav & Edit button */}
      <div className="flex items-center justify-between">
        <Link
          to="/employees"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Employees
        </Link>
        <button
          onClick={() => setEditOpen(true)}
          className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-xl border border-[#E4E8EC] bg-white text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
        >
          <Pencil size={13} /> Edit Profile
        </button>
      </div>

      {/* ── Employee Dark Hero & Health Status Single Header (CRM Signature Dark Slate-Teal) ── */}
      <div className="relative rounded-[24px] bg-gradient-to-br from-[#021f24] via-[#062c32] to-[#02181b] text-white border border-teal-800/60 shadow-[0_14px_45px_rgba(4,47,46,0.35)] p-6 sm:p-7 overflow-hidden">
        {/* Ambient Glow Effects (Teal & Emerald) */}
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-teal-400/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-emerald-400/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          {/* Left: Staff Avatar, Name, Badges & Contact Details */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 flex-1 min-w-0">
            <div className="relative shrink-0">
              <Avatar name={emp.full_name} size="xl" idx={empIdx} photoUrl={emp.photo_url} />
              <label
                className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-teal-500 hover:bg-teal-400 text-white flex items-center justify-center shadow-md ring-2 ring-[#021f24] cursor-pointer transition-colors"
                title={emp.photo_url ? 'Change photo' : 'Upload photo'}
              >
                <Camera size={13} />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { handlePhotoPick(e.target.files?.[0]); e.target.value = '' }}
                />
              </label>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="text-[22px] sm:text-[26px] font-black text-white tracking-tight">{emp.full_name}</h1>

                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-2xs ${
                  emp.role === 'crew_lead' || emp.role === 'supervisor' ? 'bg-purple-950/80 text-purple-300 border-purple-700/70' :
                  emp.role === 'driver' ? 'bg-amber-950/80 text-amber-300 border-amber-700/70' :
                  (emp.role === 'technical' || emp.role === 'ducting') ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/70' :
                  emp.role === 'store_cleaner' ? 'bg-teal-950/80 text-teal-300 border-teal-700/70' :
                  'bg-teal-900/80 text-teal-200 border-teal-700/70'
                }`}>
                  {emp.role === 'crew_lead' || emp.role === 'supervisor' ? 'Supervisor / Crew Lead' :
                   emp.role === 'driver' ? '🚗 Driver' :
                   (emp.role === 'technical' || emp.role === 'ducting') ? '🔧 Technical' :
                   emp.role === 'store_cleaner' ? 'Store Cleaner' :
                   '🧹 Cleaner'}
                </span>

                {isDiscoveredFromJobSheet && (
                  <span className="text-[11px] bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 px-2.5 py-0.5 rounded-full font-bold">
                    Daily Job Sheet Staff
                  </span>
                )}

                {totalOTHours > 0 && (
                  <span className="text-[11px] bg-amber-950/80 text-amber-300 border border-amber-600/70 px-2.5 py-0.5 rounded-full font-bold">
                    {totalOTHours}h Total OT
                  </span>
                )}

                <span className="text-[11px] bg-teal-900/80 text-teal-200 border border-teal-700/70 px-2.5 py-0.5 rounded-full font-bold">
                  {formatMonthlySalary(emp)}
                </span>

                {emp.agency_name && (
                  <span className="text-[11px] bg-teal-950/80 text-teal-300 border border-teal-800/70 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <Building2 size={11} className="text-teal-400" /> {emp.agency_name}
                  </span>
                )}
              </div>

              <p className="text-[12.5px] text-teal-200/70 mb-2.5">
                {emp.nationality || 'Staff Member'} · Member since {formatDate(emp.joined_date || emp.created_at)}
              </p>

              <div className="flex flex-wrap gap-2 text-[12px] text-teal-100">
                {emp.phone ? (
                  <a href={`tel:${emp.phone}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-950/70 border border-teal-800/70 hover:border-teal-400 hover:text-white transition-colors">
                    <Phone size={12} className="text-teal-400" /> {emp.phone}
                  </a>
                ) : (
                  <span className="text-teal-400/60 text-[11.5px] italic">No phone recorded</span>
                )}

                {emp.email && (
                  <a href={`mailto:${emp.email}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-950/70 border border-teal-800/70 hover:border-teal-400 hover:text-white transition-colors">
                    <Mail size={12} className="text-teal-400" /> {emp.email}
                  </a>
                )}

                {emp.emirates_id && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-950/70 border border-teal-800/70 text-teal-200">
                    <Shield size={12} className="text-teal-400" /> EID: {emp.emirates_id}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Health Status (integrated into this same single header) */}
          {health && (
            <div className="xl:border-l xl:border-teal-800/60 xl:pl-6 shrink-0 flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-[#032328]/80 border border-teal-850 xl:border-0 xl:bg-transparent p-4 xl:p-0 rounded-2xl">
              {/* Circular Gauge & Grade */}
              <div className="flex items-center gap-3.5">
                <div
                  className="relative w-15 h-15 rounded-full shrink-0 shadow-lg"
                  style={{ background: `conic-gradient(${healthTone[health.grade].ring} ${health.score * 3.6}deg, #093339 0deg)` }}
                  title={`Overall Health Score: ${health.score} / 100`}
                >
                  <div className="absolute inset-[5.5px] rounded-full bg-[#032024] flex flex-col items-center justify-center">
                    <span className="text-[18px] font-black leading-none text-white">{health.score}</span>
                    <span className="text-[8px] font-bold text-teal-300/70 mt-0.5">/100</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[12px] font-black uppercase tracking-wider text-teal-100 flex items-center gap-1">
                      <Activity size={12} className="text-teal-400" />
                      Health Score
                    </span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${healthTone[health.grade].chip}`}>
                      {health.grade}
                    </span>
                  </div>
                  <p className="text-[11px] text-teal-200/70 font-medium">
                    {health.absences[0] ? `Last absence: ${formatDate(health.absences[0].date)}` : '0 Unexcused Absences'}
                  </p>
                </div>
              </div>

              {/* 3 Component Mini Progress Bars */}
              <div className="flex flex-col gap-1.5 min-w-[175px] w-full sm:w-auto bg-[#02171a]/90 p-2.5 rounded-xl border border-teal-800/60">
                {health.components.map(c => {
                  const pct = Math.min(100, Math.round((c.score / c.max) * 100))
                  return (
                    <div key={c.label} className="text-[10.5px]">
                      <div className="flex items-center justify-between font-bold text-teal-100 mb-0.5">
                        <span className="text-teal-300/80">{c.label}</span>
                        <span className="text-white font-extrabold">{c.score} <span className="text-teal-400/60 font-normal">/{c.max}</span></span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#032b31] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: healthTone[health.grade].ring }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Top 4 KPI Stat Cards Row (Uniform Track Record Metrics) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Shifts Worked */}
        <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <FileText size={18} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider bg-blue-50 text-blue-900 border border-blue-200 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span>Job Sheet Sync</span>
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {totalShifts} <span className="text-[13px] font-bold text-slate-400 ml-0.5">Shifts</span>
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-0.5">
              Total Shifts Worked
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span>Avg: <strong>{(totalDutyHours / (totalShifts || 1)).toFixed(1)} hrs/shift</strong></span>
            </span>
          </div>
        </div>

        {/* Card 2: Total Duty Hours */}
        <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <Clock size={18} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider bg-indigo-50 text-indigo-900 border border-indigo-200 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span>Duty Hours</span>
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {totalDutyHours} <span className="text-[13px] font-bold text-slate-400 ml-0.5">hrs</span>
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-0.5">
              Total Duty Hours
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
              <span>Duty Track: <strong>Active Roster</strong></span>
            </span>
          </div>
        </div>

        {/* Card 3: Total Overtime (OT) */}
        <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <Flame size={18} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>{empJobs.filter(j => calcJobOTHours(j) > 0).length} OT Shifts</span>
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {totalOTHours} <span className="text-[13px] font-bold text-slate-400 ml-0.5">hrs</span>
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-0.5">
              Total Overtime (OT)
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>Overtime Hours Tracked</span>
            </span>
          </div>
        </div>

        {/* Card 4: Total Charges Handled */}
        <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <DollarSign size={18} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Collections</span>
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              AED {totalRevenue.toLocaleString()}
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-0.5">
              Total Charges Handled
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Cash: <strong>AED {totalCashCollected.toLocaleString()}</strong></span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Tabs + Right Sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left 2 Cols: Service History Table & Locations */}
        <div className="xl:col-span-2 space-y-4">

          {/* Tab Navigation */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-3 py-3">
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <FileText size={14} />
                Service History & Shifts ({totalShifts})
              </button>

              <button
                onClick={() => setActiveTab('locations')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
                  activeTab === 'locations'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <MapPin size={14} />
                Locations & Clients ({uniqueClients.length})
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
                Compliance & Documents
              </button>
            </div>
          </div>

          {/* ── Tab 1: Service History & Shifts ── */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2">
                    <FileText size={16} className="text-purple-600" />
                    Complete Daily Job Sheet History
                  </h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {totalShifts} shift records tracked directly from Daily Job Sheet
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search shifts, address, date…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="text-[12px] pl-8 pr-3 py-1.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-purple-400"
                    />
                  </div>

                  <button
                    onClick={() => setOnlyOT(!onlyOT)}
                    className={`text-[12px] px-3 py-1.5 rounded-xl font-bold border transition-colors ${
                      onlyOT
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-slate-50 text-slate-600 border-[#E4E8EC] hover:bg-slate-100'
                    }`}
                  >
                    {onlyOT ? '✓ Only Overtime (OT)' : 'Filter OT'}
                  </button>
                </div>
              </div>

              {filteredJobs.length === 0 ? (
                <div className="py-16 text-center">
                  <Calendar className="mx-auto mb-3 text-slate-300" size={38} strokeWidth={1.25} />
                  <p className="text-[14px] font-bold text-slate-700">No Shift Records Found</p>
                  <p className="text-[12px] text-slate-400 mt-1 max-w-sm mx-auto">
                    {totalShifts === 0
                      ? 'No jobs assigned to this employee in Daily Job Sheet yet.'
                      : 'No shifts match your search criteria.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-3">Client / Address</th>
                        <th className="py-3 px-3">Timing</th>
                        <th className="py-3 px-2 text-center">Duty</th>
                        <th className="py-3 px-2 text-center">OT</th>
                        <th className="py-3 px-3 text-right">Charges</th>
                        <th className="py-3 px-3 text-right">Received</th>
                        <th className="py-3 px-3">Mode</th>
                        <th className="py-3 px-3">Material</th>
                        <th className="py-3 px-4">Service & Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4E8EC]">
                      {filteredJobs.map(job => {
                        const ot = calcJobOTHours(job)
                        return (
                          <tr key={job.id} className="hover:bg-purple-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                              {job.date ? formatDate(job.date) : '—'}
                            </td>
                            <td className="py-3 px-3 min-w-[140px] max-w-[200px]">
                              <p className="font-semibold text-slate-800 truncate" title={job.address}>
                                {job.address || '—'}
                              </p>
                              {job.area && (
                                <p className="text-[10.5px] text-slate-400 truncate">{job.area}</p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                              {job.start_time || '—'} - {job.end_time || '—'}
                            </td>
                            <td className="py-3 px-2 text-center font-bold text-slate-700">
                              {job.duty_hours ? `${job.duty_hours}h` : '—'}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {ot > 0 ? (
                                <span className="inline-block bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full text-[10.5px] border border-amber-200">
                                  {ot}h OT
                                </span>
                              ) : (
                                <span className="text-slate-400">0h</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-extrabold text-purple-700 whitespace-nowrap">
                              AED {Number(job.charges || 0).toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                              AED {Number(job.received || 0).toLocaleString()}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <PaymentModeBadge mode={job.payment_mode} />
                            </td>
                            <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                              {job.material || 'No'}
                            </td>
                            <td className="py-3 px-4 text-slate-600 max-w-[200px] truncate" title={job.remarks || job.service}>
                              {job.service && <span className="font-semibold text-slate-700 mr-1.5">{job.service}</span>}
                              {job.remarks || (!job.service ? '—' : '')}
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

          {/* ── Tab 2: Locations & Clients Serviced ── */}
          {activeTab === 'locations' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
              <h3 className="text-[15px] font-bold text-[#111827] mb-1 flex items-center gap-2">
                <MapPin size={16} className="text-emerald-600" />
                Frequent Locations & Clients Serviced ({frequentLocations.length})
              </h3>
              <p className="text-[12px] text-slate-500 mb-4">
                Summary of villas, apartments, and locations where {emp.full_name} has provided services.
              </p>

              {frequentLocations.length === 0 ? (
                <p className="text-slate-400 text-center py-8 text-[13px]">No location records found</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {frequentLocations.map(loc => (
                    <div key={loc.address} className="p-3.5 rounded-xl border border-[#edf2f7] bg-[#f8fafc] hover:bg-slate-100/60 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-bold text-[13px] text-slate-800 truncate">{loc.address}</p>
                        <span className="text-[11px] font-extrabold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full shrink-0">
                          {loc.visits} visit{loc.visits > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11.5px] text-slate-500">
                        <span>Area: <strong className="text-slate-700">{loc.area}</strong></span>
                        <span>{loc.dutyHours}h duty {loc.otHours > 0 ? `· ${loc.otHours}h OT` : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 3: Compliance & Documents ── */}
          {activeTab === 'info' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6 space-y-6">
              {/* Document Expiry Warnings */}
              <div>
                <h3 className="text-[15px] font-bold text-[#111827] mb-3">Document Validity Overview</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <ExpiryCard date={emp.visa_expiry || emp.visa_end_date} label="Visa" />
                  <ExpiryCard date={emp.work_permit_expiry || emp.work_permit_end_date} label="Work Permit" />
                  <ExpiryCard date={emp.passport_expiry || emp.passport_end_date} label="Passport" />
                  <ExpiryCard date={emp.medical_insurance_expiry} label="Medical Ins." />
                </div>
              </div>

              {/* Driver Details Card (when role is Driver) */}
              {emp.role === 'driver' && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-200/90 rounded-2xl p-4.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                        <Truck size={16} />
                      </div>
                      <div>
                        <h4 className="text-[14px] font-black text-amber-950">Driving License & Vehicle Assignment</h4>
                        <p className="text-[11.5px] text-amber-800 font-medium">Official UAE Driver Credentials</p>
                      </div>
                    </div>
                    {emp.driving_license_file && (
                      <button
                        type="button"
                        onClick={() => {
                          const doc = uploadedDocs.find(d => d.category === 'driving_license')
                          if (doc) setPreviewDoc(doc)
                        }}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Eye size={12} /> View License
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
                    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70">
                      <p className="text-[10px] uppercase font-bold text-slate-400">License Number</p>
                      <p className="font-extrabold text-slate-900 mt-0.5">{emp.driving_license_no || 'Not recorded'}</p>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Place of Issue</p>
                      <p className="font-extrabold text-slate-900 mt-0.5">{emp.driving_license_place_of_issue || 'Dubai'}</p>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Licence Type</p>
                      <p className="font-extrabold text-slate-900 mt-0.5">{emp.driving_license_type || 'Light Vehicle (Automatic)'}</p>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Issue Date</p>
                      <p className="font-extrabold text-slate-900 mt-0.5">{emp.driving_license_issue_date ? formatDate(emp.driving_license_issue_date) : 'Not recorded'}</p>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Expiry Date</p>
                      <p className="font-extrabold text-slate-900 mt-0.5">{emp.driving_license_expiry_date ? formatDate(emp.driving_license_expiry_date) : 'Not recorded'}</p>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Assigned Vehicle</p>
                      <p className="font-extrabold text-amber-900 mt-0.5">{emp.assigned_vehicle || 'No vehicle assigned'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Complete Official Documents Register */}
              <div>
                <h3 className="text-[15px] font-bold text-[#111827] mb-3 flex items-center justify-between">
                  <span>Official Documents & Dates Register</span>
                  <span className="text-[11px] font-medium text-slate-500">All dates & files per company spec</span>
                </h3>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3.5">Document Type</th>
                        <th className="py-2.5 px-3">Reference / #</th>
                        <th className="py-2.5 px-3">Start / Issue Date</th>
                        <th className="py-2.5 px-3">End / Expiry Date</th>
                        <th className="py-2.5 px-3 text-right">Attached File</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {/* EID */}
                      <tr>
                        <td className="py-2.5 px-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span> Emirates ID (EID)
                        </td>
                        <td className="py-2.5 px-3">{emp.emirates_id || '—'}</td>
                        <td className="py-2.5 px-3">{emp.eid_start_date ? formatDate(emp.eid_start_date) : '—'}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{emp.eid_end_date ? formatDate(emp.eid_end_date) : '—'}</td>
                        <td className="py-2.5 px-3 text-right">
                          {emp.eid_file ? (
                            <button
                              type="button"
                              onClick={() => {
                                const d = uploadedDocs.find(x => x.category === 'eid')
                                if (d) setPreviewDoc(d)
                              }}
                              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200/70 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={11} /> View EID
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No file</span>
                          )}
                        </td>
                      </tr>

                      {/* Passport */}
                      <tr>
                        <td className="py-2.5 px-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Passport
                        </td>
                        <td className="py-2.5 px-3">{emp.passport_number || '—'}</td>
                        <td className="py-2.5 px-3">{emp.passport_start_date ? formatDate(emp.passport_start_date) : '—'}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{emp.passport_expiry || emp.passport_end_date ? formatDate(emp.passport_expiry || emp.passport_end_date) : '—'}</td>
                        <td className="py-2.5 px-3 text-right">
                          {emp.passport_file ? (
                            <button
                              type="button"
                              onClick={() => {
                                const d = uploadedDocs.find(x => x.category === 'passport')
                                if (d) setPreviewDoc(d)
                              }}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200/70 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={11} /> View Passport
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No file</span>
                          )}
                        </td>
                      </tr>

                      {/* Visa */}
                      <tr>
                        <td className="py-2.5 px-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-teal-500"></span> UAE Visa
                        </td>
                        <td className="py-2.5 px-3">{emp.visa_number || '—'}</td>
                        <td className="py-2.5 px-3">{emp.visa_start_date ? formatDate(emp.visa_start_date) : '—'}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{emp.visa_expiry || emp.visa_end_date ? formatDate(emp.visa_expiry || emp.visa_end_date) : '—'}</td>
                        <td className="py-2.5 px-3 text-right">
                          {emp.visa_file ? (
                            <button
                              type="button"
                              onClick={() => {
                                const d = uploadedDocs.find(x => x.category === 'visa')
                                if (d) setPreviewDoc(d)
                              }}
                              className="text-[11px] font-bold text-teal-600 hover:text-teal-800 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200/70 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={11} /> View Visa
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No file</span>
                          )}
                        </td>
                      </tr>

                      {/* Work Permit */}
                      <tr>
                        <td className="py-2.5 px-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-500"></span> Work Permit / Labor Card
                        </td>
                        <td className="py-2.5 px-3">{emp.work_permit_number || '—'}</td>
                        <td className="py-2.5 px-3">{emp.work_permit_start_date ? formatDate(emp.work_permit_start_date) : '—'}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{emp.work_permit_expiry || emp.work_permit_end_date ? formatDate(emp.work_permit_expiry || emp.work_permit_end_date) : '—'}</td>
                        <td className="py-2.5 px-3 text-right">
                          {emp.work_permit_file ? (
                            <button
                              type="button"
                              onClick={() => {
                                const d = uploadedDocs.find(x => x.category === 'work_permit')
                                if (d) setPreviewDoc(d)
                              }}
                              className="text-[11px] font-bold text-cyan-600 hover:text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-lg border border-cyan-200/70 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={11} /> View Permit
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No file</span>
                          )}
                        </td>
                      </tr>

                      {/* Medical Insurance */}
                      <tr>
                        <td className="py-2.5 px-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Medical Insurance
                        </td>
                        <td className="py-2.5 px-3">{emp.medical_insurance || '—'}</td>
                        <td className="py-2.5 px-3">—</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{emp.medical_insurance_expiry ? formatDate(emp.medical_insurance_expiry) : '—'}</td>
                        <td className="py-2.5 px-3 text-right">
                          {emp.medical_insurance_file ? (
                            <button
                              type="button"
                              onClick={() => {
                                const d = uploadedDocs.find(x => x.category === 'medical_insurance')
                                if (d) setPreviewDoc(d)
                              }}
                              className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/70 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={11} /> View Card
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No file</span>
                          )}
                        </td>
                      </tr>

                      {/* NOC */}
                      <tr>
                        <td className="py-2.5 px-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-violet-500"></span> NOC (No Objection Cert)
                        </td>
                        <td className="py-2.5 px-3" colSpan={3}>{emp.noc || '—'}</td>
                        <td className="py-2.5 px-3 text-right">
                          {emp.noc_file ? (
                            <button
                              type="button"
                              onClick={() => {
                                const d = uploadedDocs.find(x => x.category === 'noc')
                                if (d) setPreviewDoc(d)
                              }}
                              className="text-[11px] font-bold text-violet-600 hover:text-violet-800 bg-violet-50 px-2 py-0.5 rounded-lg border border-violet-200/70 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={11} /> View NOC
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No file</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Uploaded Documents Gallery */}
              {uploadedDocs.length > 0 && (
                <div>
                  <h3 className="text-[15px] font-bold text-[#111827] mb-2 flex items-center gap-2">
                    <Paperclip size={16} className="text-blue-600" />
                    <span>Uploaded Documents & Files Archive ({uploadedDocs.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {uploadedDocs.map(doc => (
                      <div key={doc.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                            <FileCheck size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-bold text-slate-800 truncate" title={doc.name}>{doc.name}</p>
                            <p className="text-[11px] text-slate-400 capitalize">{doc.category.replace('_', ' ')} • {Math.round((doc.file_size || 0) / 1024)} KB</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="p-1.5 rounded-lg text-blue-700 hover:bg-blue-100 cursor-pointer"
                            title="Preview Document"
                          >
                            <Eye size={15} />
                          </button>
                          <a
                            href={doc.file_data}
                            download={doc.name}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 cursor-pointer"
                            title="Download Document"
                          >
                            <Download size={15} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills (Cleaners & Technical) */}
              <div>
                <h3 className="text-[15px] font-bold text-[#111827] mb-2">Assigned Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {(emp.skills || []).length === 0 ? (
                    <p className="text-[12px] text-slate-400">No specific skills listed</p>
                  ) : (
                    emp.skills.map(s => (
                      <span key={s} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-[12px] font-semibold">
                        {s}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Employment & Contract Overview */}
              <div>
                <h3 className="text-[15px] font-bold text-[#111827] mb-2">Employment & Contract Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
                  <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Monthly Salary</span>
                    <span className="font-extrabold text-[#111827]">{formatMonthlySalary(emp)}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Joined Date</span>
                    <span className="font-extrabold text-[#111827]">{formatDate(emp.joined_date || emp.created_at)}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">End Date</span>
                    <span className="font-extrabold text-[#111827]">{emp.end_date ? formatDate(emp.end_date) : 'Active / Indefinite'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Agency Source</span>
                    <span className="font-extrabold text-[#111827]">{emp.agency_name || 'Safaeewala (Parent Company)'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Status</span>
                    <span className="font-extrabold text-[#111827] capitalize">{emp.status || 'Active'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Sidebar: Profile Summary & Insights ── */}
        <div className="space-y-5">

          {/* Quick Profile Summary */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <h3 className="text-[15px] font-bold text-[#111827] mb-3">Service Statistics</h3>
            <div className="space-y-2.5 text-[12px]">
              <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                <span className="text-slate-500">Total Shifts</span>
                <span className="font-bold text-slate-800">{totalShifts}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                <span className="text-slate-500">Overtime Hours</span>
                <span className="font-extrabold text-amber-600">{totalOTHours} hrs OT</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                <span className="text-slate-500">Duty Hours</span>
                <span className="font-bold text-slate-800">{totalDutyHours} hrs</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                <span className="text-slate-500">Charges Value</span>
                <span className="font-extrabold text-purple-700">AED {totalRevenue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                <span className="text-slate-500">Unique Locations</span>
                <span className="font-bold text-slate-800">{uniqueClients.length}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Last Service Date</span>
                <span className="font-bold text-slate-800">{lastActiveDate ? formatDate(lastActiveDate) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Overtime Analysis */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-[22px] border border-amber-200 shadow-[0_4px_20px_rgba(245,158,11,0.06)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-amber-600" />
              <h3 className="text-[15px] font-bold text-amber-950">Overtime Track Record</h3>
            </div>
            <p className="text-[12px] text-amber-800 leading-relaxed mb-3">
              {totalOTHours > 0
                ? `${emp.full_name} has logged ${totalOTHours} overtime hours across ${empJobs.filter(j => calcJobOTHours(j) > 0).length} shifts.`
                : `${emp.full_name} has completed standard shifts with 0 overtime hours logged.`}
            </p>
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 bg-white/70 rounded-xl p-2.5 border border-amber-200">
              <span>OT Rate</span>
              <span>{'1.5× standard rate'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Employee Modal (Unified Reusable Component) ── */}
      <EmployeeFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initialEmployee={emp}
        agencies={agencies}
        clients={clients}
        isSaving={editSaving}
        onSave={async (patch) => {
          setEditSaving(true)
          try {
            updateEmployee(emp.id, patch)
            setEditOpen(false)
          } finally {
            setEditSaving(false)
          }
        }}
      />

      {/* Document Preview Modal */}
      <EmployeeDocumentPreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  )
}
