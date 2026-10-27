import { useState, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Star, Clock,
  CheckCircle, CheckCircle2, User, Shield, DollarSign, ExternalLink, Pencil,
  Search, FileText, TrendingUp, AlertTriangle, Layers,
  Download, Eye, FileCheck, Truck, Briefcase, Paperclip, Building2, Upload, Trash2
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatDate, daysUntil } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { PaymentMode, EmployeeRole, EmployeeDocument, Employee } from '@/types'
import { EmployeeDocumentSection, EmployeeDocumentPreviewModal } from '@/components/employees/EmployeeDocumentField'
import {
  getEmployeeDailyJobsHistory,
  calcJobOTHours,
  cleanClientNameFromAddress,
  splitStaffNames,
  MONTHLY_WORK_HOURS,
} from '@/lib/clientDataSync'

function formatEmpRole(role?: string): string {
  if (!role) return 'Cleaner'
  if (role === 'driver') return 'Driver'
  if (role === 'technical' || role === 'ducting') return 'Technical'
  if (role === 'supervisor' || role === 'crew_lead') return 'Supervisor'
  if (role === 'store_cleaner') return 'Store Cleaner'
  return 'Cleaner'
}

/* ─── Avatar palette ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72' },
  { bg: '#fce4d6', text: '#c66a3a' },
  { bg: '#e4dff5', text: '#6b5bb5' },
  { bg: '#d6e7f5', text: '#3a7ab8' },
  { bg: '#fcecc8', text: '#a8842a' },
]

function Avatar({ name, size = 'md', idx = 0 }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; idx?: number }) {
  const parts = name.trim().split(' ')
  const init  = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'EM'
  const dims  = size === 'xl' ? 'w-20 h-20 text-[22px]' : size === 'lg' ? 'w-14 h-14 text-[16px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-[13px]'
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0 shadow-xs`} style={{ background: color.bg, color: color.text }}>
      {init}
    </div>
  )
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

  const [editRole, setEditRole] = useState<EmployeeRole>(emp?.role || 'cleaner')
  const [editDocs, setEditDocs] = useState<Record<string, EmployeeDocument>>({})
  const [editClientIds, setEditClientIds] = useState<string[]>([])
  const [clientSearchEdit, setClientSearchEdit] = useState('')

  useEffect(() => {
    if (emp && editOpen) {
      setEditRole((emp.role === 'crew_lead' ? 'supervisor' : emp.role === 'ducting' ? 'technical' : emp.role) || 'cleaner')
      setEditClientIds(emp.assigned_client_ids || [])
      setClientSearchEdit('')

      const docsMap: Record<string, EmployeeDocument> = {}
      if (emp.documents && Array.isArray(emp.documents)) {
        emp.documents.forEach(d => {
          docsMap[d.category] = d
        })
      }
      if (emp.eid_file && !docsMap.eid) {
        docsMap.eid = { id: `eid-${emp.id}`, name: 'Emirates_ID_Document', category: 'eid', file_data: emp.eid_file, uploaded_at: emp.created_at }
      }
      if (emp.passport_file && !docsMap.passport) {
        docsMap.passport = { id: `pass-${emp.id}`, name: 'Passport_Document', category: 'passport', file_data: emp.passport_file, uploaded_at: emp.created_at }
      }
      if (emp.visa_file && !docsMap.visa) {
        docsMap.visa = { id: `visa-${emp.id}`, name: 'Visa_Document', category: 'visa', file_data: emp.visa_file, uploaded_at: emp.created_at }
      }
      if (emp.work_permit_file && !docsMap.work_permit) {
        docsMap.work_permit = { id: `wp-${emp.id}`, name: 'Work_Permit_Document', category: 'work_permit', file_data: emp.work_permit_file, uploaded_at: emp.created_at }
      }
      if (emp.driving_license_file && !docsMap.driving_license) {
        docsMap.driving_license = { id: `dl-${emp.id}`, name: 'Driving_License_Document', category: 'driving_license', file_data: emp.driving_license_file, uploaded_at: emp.created_at }
      }
      if (emp.medical_insurance_file && !docsMap.medical_insurance) {
        docsMap.medical_insurance = { id: `med-${emp.id}`, name: 'Medical_Insurance_Document', category: 'medical_insurance', file_data: emp.medical_insurance_file, uploaded_at: emp.created_at }
      }
      if (emp.noc_file && !docsMap.noc) {
        docsMap.noc = { id: `noc-${emp.id}`, name: 'NOC_Document', category: 'noc', file_data: emp.noc_file, uploaded_at: emp.created_at }
      }
      setEditDocs(docsMap)
    }
  }, [emp, editOpen])

  const handleDocUpload = (file: File, category: EmployeeDocument['category']) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setEditDocs(prev => ({
        ...prev,
        [category]: {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          category,
          file_data: dataUrl,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          uploaded_at: new Date().toISOString(),
        },
      }))
    }
    reader.readAsDataURL(file)
  }

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

      {/* ── Employee Hero Card ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <Avatar name={emp.full_name} size="xl" idx={empIdx} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h1 className="text-[22px] font-extrabold text-[#111827]">{emp.full_name}</h1>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                emp.role === 'crew_lead' || emp.role === 'supervisor' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                emp.role === 'driver' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                (emp.role === 'technical' || emp.role === 'ducting') ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                emp.role === 'store_cleaner' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {emp.role === 'crew_lead' || emp.role === 'supervisor' ? 'Supervisor / Crew Lead' :
                 emp.role === 'driver' ? '🚗 Driver' :
                 (emp.role === 'technical' || emp.role === 'ducting') ? '🔧 Technical' :
                 emp.role === 'store_cleaner' ? 'Store Cleaner' :
                 '🧹 Cleaner'}
              </span>

              {isDiscoveredFromJobSheet && (
                <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                  Daily Job Sheet Staff
                </span>
              )}

              {totalOTHours > 0 && (
                <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-300 px-2.5 py-0.5 rounded-full font-bold">
                  {totalOTHours}h Total OT
                </span>
              )}

              <span className="text-[11px] bg-teal-50 text-teal-800 border border-teal-200/90 px-2.5 py-0.5 rounded-full font-bold">
                AED {(emp.monthly_salary || (emp.pay_rate_hourly ? Math.round(emp.pay_rate_hourly * 200) : 2500)).toLocaleString()}/mo
              </span>

              {emp.agency_name && (
                <span className="text-[11px] bg-slate-50 text-slate-600 border border-slate-200 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <Building2 size={11} className="text-slate-400" /> {emp.agency_name}
                </span>
              )}
            </div>

            <p className="text-[13px] text-slate-500 mb-2">
              {emp.nationality || 'Staff Member'} · Member since {formatDate(emp.joined_date || emp.created_at)}
            </p>

            <div className="flex flex-wrap gap-4 text-[13px] text-slate-600 mt-2">
              {emp.phone ? (
                <a href={`tel:${emp.phone}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
                  <Phone size={13} className="text-slate-400" /> {emp.phone}
                </a>
              ) : (
                <span className="text-slate-400 text-[12px] italic">No phone recorded</span>
              )}

              {emp.email && (
                <a href={`mailto:${emp.email}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
                  <Mail size={13} className="text-slate-400" /> {emp.email}
                </a>
              )}

              {emp.emirates_id && (
                <span className="flex items-center gap-1.5">
                  <Shield size={13} className="text-slate-400" /> Emirates ID: {emp.emirates_id}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Real-Time Track Record Metrics from Daily Job Sheet */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-[#E4E8EC]">
          {[
            { label: 'Total Shifts Worked',    value: `${totalShifts} shifts`,                 sub: 'Logged in Daily Job Sheet', color: 'text-blue-700' },
            { label: 'Total Duty Hours',       value: `${totalDutyHours} hrs`,                 sub: `Avg ${(totalDutyHours / (totalShifts || 1)).toFixed(1)}h / shift`, color: 'text-slate-800' },
            { label: 'Total Overtime (OT)',    value: `${totalOTHours} hrs`,                   sub: `${empJobs.filter(j => calcJobOTHours(j) > 0).length} OT shifts`, color: 'text-amber-600' },
            { label: 'Total Charges Handled',  value: `AED ${totalRevenue.toLocaleString()}`, sub: `AED ${totalCashCollected.toLocaleString()} in cash`, color: 'text-emerald-700' },
          ].map(s => (
            <div key={s.label} className="text-center p-2.5 rounded-xl bg-[#f8fafc] border border-[#edf2f7]">
              <p className={`text-[19px] font-black ${s.color}`}>{s.value}</p>
              <p className="text-[12px] font-bold text-slate-700 mt-0.5">{s.label}</p>
              <p className="text-[10.5px] text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
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
                    <span className="font-extrabold text-[#111827]">AED {(emp.monthly_salary || (emp.pay_rate_hourly ? Math.round(emp.pay_rate_hourly * 200) : 2500)).toLocaleString()}/mo</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Hourly Rate</span>
                    <span className="font-extrabold text-[#111827]">{emp.pay_rate_hourly > 0 ? `AED ${emp.pay_rate_hourly}/hr` : 'Not set'}</span>
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
              <span>{emp.pay_rate_hourly > 0 ? `1.5x Standard / AED ${(emp.pay_rate_hourly * 1.5).toFixed(1)}/hr` : '1.5x Standard (rate not set)'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Employee Modal ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Employee Profile — ${emp.full_name}`} size="xl">
        <form
          className="space-y-4 max-h-[82vh] overflow-y-auto pr-1"
          onSubmit={async e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget as HTMLFormElement)
            setEditSaving(true)
            const role = editRole
            const monthly_salary = Number(fd.get('monthly_salary')) || (emp.monthly_salary || 2500)
            const agencyId = (fd.get('agency_id') as string) || ''
            const selAgency = agencies.find(a => a.id === agencyId)
            const docsList: EmployeeDocument[] = Object.values(editDocs)

            const patch: Partial<Employee> = {
              full_name:                 fd.get('full_name') as string,
              phone:                     fd.get('phone') as string,
              role,
              designation:               formatEmpRole(role),
              gender:                    (fd.get('gender') as string) || emp.gender || 'Female',
              nationality:               fd.get('nationality') as string,
              agency_id:                 agencyId || undefined,
              agency_name:               selAgency?.name || (agencyId ? emp.agency_name : undefined),

              // EID
              emirates_id:               (fd.get('emirates_id') as string) || '',
              eid_start_date:            (fd.get('eid_start_date') as string) || undefined,
              eid_end_date:              (fd.get('eid_end_date') as string) || undefined,
              eid_file:                  editDocs.eid?.file_data || emp.eid_file,

              // Passport
              passport_number:           (fd.get('passport_number') as string) || undefined,
              passport_start_date:       (fd.get('passport_start_date') as string) || undefined,
              passport_expiry:           (fd.get('passport_expiry') as string) || '',
              passport_end_date:         (fd.get('passport_expiry') as string) || undefined,
              passport_file:             editDocs.passport?.file_data || emp.passport_file,

              // Visa
              visa_number:               (fd.get('visa_number') as string) || undefined,
              visa_start_date:           (fd.get('visa_start_date') as string) || undefined,
              visa_expiry:               (fd.get('visa_expiry') as string) || '',
              visa_end_date:             (fd.get('visa_expiry') as string) || undefined,
              visa_file:                 editDocs.visa?.file_data || emp.visa_file,

              // Work Permit
              work_permit_number:        (fd.get('work_permit_number') as string) || undefined,
              work_permit_start_date:    (fd.get('work_permit_start_date') as string) || undefined,
              work_permit_expiry:        (fd.get('work_permit_expiry') as string) || '',
              work_permit_end_date:      (fd.get('work_permit_expiry') as string) || undefined,
              work_permit_file:          editDocs.work_permit?.file_data || emp.work_permit_file,

              // Driving License (for Drivers)
              driving_license_no:        (fd.get('driving_license_no') as string) || undefined,
              driving_license_place_of_issue: (fd.get('driving_license_place_of_issue') as string) || undefined,
              driving_license_issue_date: (fd.get('driving_license_issue_date') as string) || undefined,
              driving_license_expiry_date: (fd.get('driving_license_expiry_date') as string) || undefined,
              driving_license_type:      (fd.get('driving_license_type') as string) || undefined,
              driving_license_file:      editDocs.driving_license?.file_data || emp.driving_license_file,
              assigned_vehicle:          (fd.get('assigned_vehicle') as string) || undefined,

              // Financial, Insurance & Employment
              monthly_salary,
              pay_rate_hourly:           Math.round((monthly_salary / MONTHLY_WORK_HOURS) * 10) / 10,
              medical_insurance:         (fd.get('medical_insurance') as string) || undefined,
              medical_insurance_expiry:  (fd.get('medical_insurance_expiry') as string) || undefined,
              medical_insurance_file:    editDocs.medical_insurance?.file_data || emp.medical_insurance_file,
              joined_date:               (fd.get('joined_date') as string) || emp.joined_date,
              end_date:                  (fd.get('end_date') as string) || undefined,
              noc:                       (fd.get('noc') as string) || undefined,
              noc_file:                  editDocs.noc?.file_data || emp.noc_file,

              status:                    (fd.get('status') as Employee['status']) || 'active',

              // Cleaners & Technical
              skills:                    (fd.get('skills') as string)?.split(',').map(s => s.trim()).filter(Boolean) || [],
              assigned_client_ids:       editRole === 'driver' ? [] : editClientIds,

              // Document History
              documents:                 docsList.length > 0 ? docsList : emp.documents,
            }

            updateEmployee(emp.id, patch)
            setEditSaving(false)
            setEditOpen(false)
          }}
        >
          {/* Form Mode Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-200/70 p-3 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-bold text-blue-950">Editing Employee Mode:</span>
              <span className="text-[11.5px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-2xs">
                {editRole === 'driver' ? '🚗 For Drivers' : '🧹 For Cleaners & Technical'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Fields auto-switch based on Designation</span>
          </div>

          {/* Row 1: Full Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="full_name" label="Full Name" defaultValue={emp.full_name} required />
            <Input name="phone" label="Phone" defaultValue={emp.phone} />
          </div>

          {/* Row 2: Nationality & Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="nationality" label="Nationality" defaultValue={emp.nationality || 'Nepal'} />
            <Select name="gender" label="Gender" defaultValue={emp.gender || 'Female'}>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </Select>
          </div>

          {/* Row 3: Role (Designation) & Agency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1">Designation / Role</label>
              <select
                name="role"
                value={editRole}
                onChange={e => setEditRole(e.target.value as EmployeeRole)}
                className="w-full text-[13px] px-3 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-bold text-slate-800"
                required
              >
                <option value="cleaner">Cleaner</option>
                <option value="supervisor">Supervisor</option>
                <option value="technical">Technical</option>
                <option value="store_cleaner">Store Cleaner</option>
                <option value="driver">Driver</option>
              </select>
            </div>

            <Select name="agency_id" label="Agency / Sourcing Source" defaultValue={emp.agency_id || ''}>
              <option value="">Safaeewala (Parent Company)</option>
              {agencies.filter(a => a.id !== 'agency-safaeewala' && a.company_type !== 'Parent Company' && !a.name.toLowerCase().includes('safaeewala')).map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.status})</option>
              ))}
            </Select>
          </div>

          {/* ── Document Section 1: EID ── */}
          <EmployeeDocumentSection
            category="eid"
            title="EID"
            doc={editDocs.eid}
            onUpload={file => handleDocUpload(file, 'eid')}
            onRemove={() => setEditDocs(prev => { const n = { ...prev }; delete n.eid; return n })}
            onPreview={doc => setPreviewDoc(doc)}
            description="Emirates ID Document & Start / End Dates"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input name="eid_start_date" label="EID Start Date" type="date" defaultValue={emp.eid_start_date || ''} />
              <Input name="eid_end_date" label="EID End Date" type="date" defaultValue={emp.eid_end_date || ''} />
              <Input name="emirates_id" label="EID Number" defaultValue={emp.emirates_id ?? ''} />
            </div>
          </EmployeeDocumentSection>

          {/* ── Document Section 2: Passport ── */}
          <EmployeeDocumentSection
            category="passport"
            title="Passport"
            doc={editDocs.passport}
            onUpload={file => handleDocUpload(file, 'passport')}
            onRemove={() => setEditDocs(prev => { const n = { ...prev }; delete n.passport; return n })}
            onPreview={doc => setPreviewDoc(doc)}
            description="Passport Document & Start / End Dates"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input name="passport_start_date" label="Passport Start Date" type="date" defaultValue={emp.passport_start_date || ''} />
              <Input name="passport_expiry" label="Passport End Date" type="date" defaultValue={emp.passport_expiry || emp.passport_end_date || ''} />
              <Input name="passport_number" label="Passport Number" defaultValue={emp.passport_number || ''} />
            </div>
          </EmployeeDocumentSection>

          {/* ── Document Section 3: Visa ── */}
          <EmployeeDocumentSection
            category="visa"
            title="Visa"
            doc={editDocs.visa}
            onUpload={file => handleDocUpload(file, 'visa')}
            onRemove={() => setEditDocs(prev => { const n = { ...prev }; delete n.visa; return n })}
            onPreview={doc => setPreviewDoc(doc)}
            description="UAE Residence / Employment Visa"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input name="visa_start_date" label="Visa Start Date" type="date" defaultValue={emp.visa_start_date || ''} />
              <Input name="visa_expiry" label="Visa End Date" type="date" defaultValue={emp.visa_expiry || emp.visa_end_date || ''} />
              <Input name="visa_number" label="Visa Number" defaultValue={emp.visa_number || ''} />
            </div>
          </EmployeeDocumentSection>

          {/* ── Document Section 4: Work Permit ── */}
          <EmployeeDocumentSection
            category="work_permit"
            title="Work Permit"
            doc={editDocs.work_permit}
            onUpload={file => handleDocUpload(file, 'work_permit')}
            onRemove={() => setEditDocs(prev => { const n = { ...prev }; delete n.work_permit; return n })}
            onPreview={doc => setPreviewDoc(doc)}
            description="MOHRE Work Permit / Labor Card"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input name="work_permit_start_date" label="Work Permit Start Date" type="date" defaultValue={emp.work_permit_start_date || ''} />
              <Input name="work_permit_expiry" label="Work Permit End Date" type="date" defaultValue={emp.work_permit_expiry || emp.work_permit_end_date || ''} />
              <Input name="work_permit_number" label="Work Permit Number" defaultValue={emp.work_permit_number || ''} />
            </div>
          </EmployeeDocumentSection>

          {/* ── Document Section 5: Driving License (ONLY for Drivers) ── */}
          {editRole === 'driver' && (
            <EmployeeDocumentSection
              category="driving_license"
              title="Driving License"
              doc={editDocs.driving_license}
              onUpload={file => handleDocUpload(file, 'driving_license')}
              onRemove={() => setEditDocs(prev => { const n = { ...prev }; delete n.driving_license; return n })}
              onPreview={doc => setPreviewDoc(doc)}
              description="UAE Driving License Details & Document"
            >
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input name="driving_license_no" label="License #" defaultValue={emp.driving_license_no || ''} placeholder="e.g. 1234567" />
                  <div>
                    <label className="text-[12px] font-semibold text-slate-700 block mb-1">Place of Issue</label>
                    <select
                      name="driving_license_place_of_issue"
                      className="w-full text-[13px] px-3 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-blue-500 font-medium text-slate-800"
                      defaultValue={emp.driving_license_place_of_issue || 'Dubai'}
                    >
                      <option value="Dubai">Dubai</option>
                      <option value="Abu Dhabi">Abu Dhabi</option>
                      <option value="Sharjah">Sharjah</option>
                      <option value="Ajman">Ajman</option>
                      <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                      <option value="Fujairah">Fujairah</option>
                      <option value="Umm Al Quwain">Umm Al Quwain</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input name="driving_license_issue_date" label="Issue Date" type="date" defaultValue={emp.driving_license_issue_date || ''} />
                  <Input name="driving_license_expiry_date" label="Expiry Date" type="date" defaultValue={emp.driving_license_expiry_date || ''} />
                </div>
              </div>
            </EmployeeDocumentSection>
          )}

          {/* Financial & Insurance Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Input
              name="monthly_salary"
              label="Monthly Salary (AED/mo)"
              type="number"
              defaultValue={emp.monthly_salary ? String(emp.monthly_salary) : (emp.pay_rate_hourly ? String(Math.round(emp.pay_rate_hourly * MONTHLY_WORK_HOURS)) : '2500')}
              required
            />

            {/* Medical Insurance (Blue Accent block with Upload) */}
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-bold text-blue-900 block">Medical Insurance</label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="med-upload-profile-edit"
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleDocUpload(f, 'medical_insurance')
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById('med-upload-profile-edit')?.click()}
                    className="text-[10.5px] font-bold px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Upload size={10} /> {editDocs.medical_insurance ? 'Replace' : 'Upload Card'}
                  </button>
                  {editDocs.medical_insurance && (
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(editDocs.medical_insurance)}
                      className="p-1 rounded text-blue-700 hover:bg-blue-100 cursor-pointer"
                      title="Preview Document"
                    >
                      <Eye size={12} />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  name="medical_insurance"
                  defaultValue={emp.medical_insurance || ''}
                  placeholder="Policy / Card #"
                  className="w-full text-[12px] px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <input
                  name="medical_insurance_expiry"
                  type="date"
                  defaultValue={emp.medical_insurance_expiry || ''}
                  className="w-full text-[12px] px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  title="Insurance Expiry Date"
                />
              </div>
              {editDocs.medical_insurance && (
                <p className="text-[10.5px] text-emerald-700 font-bold flex items-center gap-1 truncate">
                  <CheckCircle2 size={11} className="shrink-0" /> {editDocs.medical_insurance.name}
                </p>
              )}
            </div>
          </div>

          {/* Joining Date & End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="joined_date" label="Joining Date" type="date" defaultValue={emp.joined_date || ''} />
            <Input name="end_date" label="End Date" type="date" defaultValue={emp.end_date || ''} />
          </div>

          {/* NOC & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            {/* NOC (Blue Accent block with Upload) */}
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-bold text-blue-900 block">NOC (No Objection Certificate)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="noc-upload-profile-edit"
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleDocUpload(f, 'noc')
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById('noc-upload-profile-edit')?.click()}
                    className="text-[10.5px] font-bold px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Upload size={10} /> {editDocs.noc ? 'Replace' : 'Upload NOC'}
                  </button>
                  {editDocs.noc && (
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(editDocs.noc)}
                      className="p-1 rounded text-blue-700 hover:bg-blue-100 cursor-pointer"
                      title="Preview Document"
                    >
                      <Eye size={12} />
                    </button>
                  )}
                </div>
              </div>
              <input
                name="noc"
                defaultValue={emp.noc || ''}
                placeholder="NOC Ref # or Notes"
                className="w-full text-[12px] px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
              {editDocs.noc && (
                <p className="text-[10.5px] text-emerald-700 font-bold flex items-center gap-1 truncate">
                  <CheckCircle2 size={11} className="shrink-0" /> {editDocs.noc.name}
                </p>
              )}
            </div>

            <Select name="status" label="Status" defaultValue={emp.status || 'active'}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
              <option value="engaged_in_project">Engaged in Project</option>
            </Select>
          </div>

          {/* Conditional Bottom Section: Driver specific vs Cleaner specific */}
          {editRole === 'driver' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[12px] font-semibold text-slate-700 block mb-1">Licence Type</label>
                <select
                  name="driving_license_type"
                  className="w-full text-[13px] px-3 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-blue-500 font-medium text-slate-800"
                  defaultValue={emp.driving_license_type || 'Light Vehicle (Automatic)'}
                >
                  <option value="Light Vehicle (Automatic)">Light Vehicle (Automatic)</option>
                  <option value="Light Vehicle (Manual)">Light Vehicle (Manual)</option>
                  <option value="Heavy Bus">Heavy Bus</option>
                  <option value="Heavy Truck">Heavy Truck</option>
                  <option value="Motorcycle">Motorcycle</option>
                  <option value="Forklift">Forklift</option>
                </select>
              </div>
              <Input
                name="assigned_vehicle"
                label="Assign Vehicle"
                defaultValue={emp.assigned_vehicle || ''}
                placeholder="e.g. Van 1, Toyota HiAce, Plate #12345"
              />
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              {/* Skills */}
              <Input
                name="skills"
                label="Skills (comma separated)"
                defaultValue={emp.skills?.join(', ') || ''}
                placeholder="Deep Clean, Sofa, Window, Technical, Carpet..."
              />

              {/* Client Assignee Selection */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Briefcase size={14} className="text-teal-600" />
                    <span className="text-[12px] font-black text-slate-800 uppercase tracking-wider">Client Assign</span>
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
            </div>
          )}

          <div className="flex gap-3 pt-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold" disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Document Preview Modal */}
      <EmployeeDocumentPreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  )
}
