import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Star, Clock,
  CheckCircle, User, Shield, DollarSign, ExternalLink, Pencil,
  Search, FileText, TrendingUp, AlertTriangle, Layers,
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatDate, daysUntil } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { PaymentMode } from '@/types'
import {
  getEmployeeDailyJobsHistory,
  calcJobOTHours,
  cleanClientNameFromAddress,
  splitStaffNames,
} from '@/lib/clientDataSync'

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
  const { employees, dailyJobs, updateEmployee } = useData()

  const [activeTab, setActiveTab]   = useState<'history' | 'locations' | 'info'>('history')
  const [search, setSearch]         = useState('')
  const [onlyOT, setOnlyOT]         = useState(false)
  const [editOpen, setEditOpen]     = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  const emp = employees.find(e => e.id === id)
  const empIdx = employees.findIndex(e => e.id === id)

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
                emp.role === 'crew_lead' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {emp.role === 'crew_lead' ? 'Supervisor / Crew Lead' : 'Cleaner'}
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

              <span className="text-[11px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-semibold">
                {emp.pay_rate_hourly > 0 ? `AED ${emp.pay_rate_hourly}/hr` : 'Rate not set'}
              </span>
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
              <div>
                <h3 className="text-[15px] font-bold text-[#111827] mb-3">Official Documents Tracker</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <ExpiryCard date={emp.visa_expiry} label="Visa" />
                  <ExpiryCard date={emp.work_permit_expiry} label="Work Permit" />
                  <ExpiryCard date={emp.passport_expiry} label="Passport" />
                  <ExpiryCard date={emp.medical_insurance_expiry} label="Medical Ins." />
                </div>
              </div>

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

              <div>
                <h3 className="text-[15px] font-bold text-[#111827] mb-2">Employment Details</h3>
                <div className="grid grid-cols-2 gap-3 text-[12.5px]">
                  <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Hourly Rate</span>
                    <span className="font-extrabold text-[#111827]">{emp.pay_rate_hourly > 0 ? `AED ${emp.pay_rate_hourly}/hr` : 'Not set'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Joined Date</span>
                    <span className="font-extrabold text-[#111827]">{formatDate(emp.joined_date || emp.created_at)}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-[#edf2f7]">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Emirates ID</span>
                    <span className="font-extrabold text-[#111827]">{emp.emirates_id || 'Not recorded'}</span>
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
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Employee" size="lg">
        <form
          className="space-y-4"
          onSubmit={async e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget as HTMLFormElement)
            setEditSaving(true)
            updateEmployee(emp.id, {
              full_name:                 fd.get('full_name') as string,
              phone:                     fd.get('phone') as string,
              email:                     fd.get('email') as string || undefined,
              role:                      fd.get('role') as 'cleaner' | 'crew_lead',
              nationality:               fd.get('nationality') as string,
              emirates_id:               fd.get('emirates_id') as string,
              pay_rate_hourly:           Number(fd.get('pay_rate_hourly')) || 0,
              visa_expiry:               fd.get('visa_expiry') as string,
              work_permit_expiry:        fd.get('work_permit_expiry') as string,
              passport_expiry:           fd.get('passport_expiry') as string,
              medical_insurance_expiry:  fd.get('medical_insurance_expiry') as string,
              joined_date:               fd.get('joined_date') as string,
              status:                    fd.get('status') as any || 'active',
            })
            setEditSaving(false)
            setEditOpen(false)
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Input name="full_name"   label="Full Name"   defaultValue={emp.full_name} required />
            <Input name="phone"       label="Phone"       defaultValue={emp.phone} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select name="role" label="Role" defaultValue={emp.role}>
              <option value="cleaner">Cleaner</option>
              <option value="crew_lead">Crew Lead / Supervisor</option>
            </Select>
            <Input name="nationality" label="Nationality" defaultValue={emp.nationality || 'Nepal'} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="emirates_id" label="Emirates ID" defaultValue={emp.emirates_id ?? ''} />
            <Input name="pay_rate_hourly" label="Pay Rate (AED/hr)" type="number" defaultValue={emp.pay_rate_hourly || ''} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="visa_expiry" label="Visa Expiry" type="date" defaultValue={emp.visa_expiry ?? ''} />
            <Input name="work_permit_expiry" label="Work Permit Expiry" type="date" defaultValue={emp.work_permit_expiry ?? ''} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="passport_expiry" label="Passport Expiry" type="date" defaultValue={emp.passport_expiry ?? ''} />
            <Input name="medical_insurance_expiry" label="Medical Insurance Expiry" type="date" defaultValue={emp.medical_insurance_expiry ?? ''} />
          </div>
          <Input name="joined_date" label="Joined Date" type="date" defaultValue={emp.joined_date ?? ''} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
