import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Star, MessageCircle,
  Copy, CheckCircle, User, Clock, ExternalLink, Pencil, FileText, Search,
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { Booking, PaymentMode } from '@/types'
import { getClientDailyJobsHistory, calcJobOTHours, isMonthlyJob } from '@/lib/clientDataSync'

/* ─── Avatar ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72' },
  { bg: '#fce4d6', text: '#c66a3a' },
  { bg: '#e4dff5', text: '#6b5bb5' },
  { bg: '#d6e7f5', text: '#3a7ab8' },
  { bg: '#fcecc8', text: '#a8842a' },
]
function Avatar({ name, size = 'md', idx = 0 }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; idx?: number }) {
  const parts = name.trim().split(' ')
  const init  = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'CL'
  const dims  = size === 'xl' ? 'w-20 h-20 text-[22px]' : size === 'lg' ? 'w-14 h-14 text-[16px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-[13px]'
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0 shadow-xs`} style={{ background: color.bg, color: color.text }}>
      {init}
    </div>
  )
}

/* ─── Status pill ─── */
const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  pending:     { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  confirmed:   { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400'    },
  in_progress: { bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-400'  },
  completed:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled:   { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-400'     },
}
function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.replace('_', ' ')}
    </span>
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

/* ─── Review request persistence ─── */
const REVIEW_KEY = 'safaeewala_review_requests'
function loadReviews(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(REVIEW_KEY) ?? '{}') } catch { return {} }
}
function persistReview(bookingId: string) {
  const data = loadReviews()
  data[bookingId] = new Date().toISOString()
  localStorage.setItem(REVIEW_KEY, JSON.stringify(data))
}

/* ─── Main component ─── */
export function ClientProfile() {
  const { id } = useParams<{ id: string }>()
  const { clients, bookings, employees, invoices, dailyJobs, updateClient } = useData()

  const [activeTab,     setActiveTab]     = useState<'job_sheet' | 'bookings' | 'info'>('job_sheet')
  const [jobSearch,     setJobSearch]     = useState('')
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null)
  const [reviewMap,     setReviewMap]     = useState<Record<string, string>>({})
  const [copied,        setCopied]        = useState(false)
  const [editOpen,      setEditOpen]      = useState(false)
  const [editSaving,    setEditSaving]    = useState(false)

  useEffect(() => { setReviewMap(loadReviews()) }, [])

  const client    = clients.find(c => c.id === id)
  const clientIdx = clients.findIndex(c => c.id === id)

  // Automatically fetch complete Daily Job Sheet history for this client
  const clientDailyJobs = useMemo(() => {
    return client ? getClientDailyJobsHistory(client, dailyJobs) : []
  }, [client, dailyJobs])

  const clientBookings = useMemo(() => {
    if (!client) return []
    return bookings
      .filter(b =>
        b.client_id === id ||
        b.client_name.toLowerCase().trim() === client.full_name.toLowerCase().trim()
      )
      .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())
  }, [bookings, id, client])

  // Automatically set default active tab based on available history
  useEffect(() => {
    if (clientDailyJobs.length > 0) {
      setActiveTab('job_sheet')
    } else if (clientBookings.length > 0) {
      setActiveTab('bookings')
    }
  }, [id, clientDailyJobs.length, clientBookings.length])

  if (!client) {
    return (
      <div className="space-y-6">
        <Link to="/clients" className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft size={14} /> Back to Clients
        </Link>
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-16 text-center">
          <p className="text-slate-500 font-medium">Client not found.</p>
        </div>
      </div>
    )
  }

  const completed     = clientBookings.filter(b => b.status === 'completed')
  const upcoming      = clientBookings.filter(b => ['pending', 'confirmed'].includes(b.status))
  const bookingSpent  = completed.reduce((s, b) => s + b.total_amount, 0)
  const reviewedCount = completed.filter(b => reviewMap[b.id]).length

  // Financial summary from Job Sheet
  const totalDJCharges = clientDailyJobs.reduce((s, j) => s + (Number(j.charges) || 0), 0)
  const totalDJReceived = clientDailyJobs.reduce((s, j) => s + (Number(j.received) || 0), 0)
  const totalDJOTHours = Math.round(clientDailyJobs.reduce((s, j) => s + calcJobOTHours(j), 0) * 10) / 10
  const totalDJDutyHours = Math.round(clientDailyJobs.reduce((s, j) => s + (Number(j.duty_hours) || 0), 0) * 10) / 10
  const isClientMonthly = clientDailyJobs.some(isMonthlyJob)

  // Overall totals
  const totalLifetimeSpent = Math.max(client.total_spent, bookingSpent + totalDJCharges)
  const totalServices = clientBookings.length + clientDailyJobs.length

  // Invoices summary
  const clientInvoices = invoices.filter(i =>
    i.client_id === id || i.client_name.toLowerCase().trim() === client.full_name.toLowerCase().trim()
  )
  const totalInvoiced = clientInvoices.reduce((s, i) => s + i.total, 0)
  const totalPaid     = clientInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const outstanding   = totalInvoiced - totalPaid

  // Filtered Job Sheet rows by live search
  const filteredDailyJobs = clientDailyJobs.filter(j => {
    const q = jobSearch.toLowerCase().trim()
    if (!q) return true
    return (
      (j.date && j.date.includes(q)) ||
      (j.staff_name && j.staff_name.toLowerCase().includes(q)) ||
      (j.service && j.service.toLowerCase().includes(q)) ||
      (j.remarks && j.remarks.toLowerCase().includes(q)) ||
      (j.payment_mode && j.payment_mode.toLowerCase().includes(q)) ||
      (j.address && j.address.toLowerCase().includes(q))
    )
  })

  function crewNames(ids: string[]) {
    return ids.map(cid => employees.find(e => e.id === cid)?.full_name ?? '').filter(Boolean).join(', ')
  }

  function buildMessage(b: Booking) {
    const name = client!.full_name
    return `Hi ${name},\n\nThank you for choosing Safaeewala Cleaning & Maintenance! We hope you were fully satisfied with your ${b.service_type} service on ${formatDate(b.scheduled_date)} at ${b.service_address}.\n\nWe'd love to hear your feedback — a quick review would mean a lot to us and helps us keep our quality high.\n\nThank you for being a valued client! 🙏\n\nSafaeewala Team\n+971 55 628 2374`
  }

  function markSent(b: Booking) {
    persistReview(b.id)
    setReviewMap(m => ({ ...m, [b.id]: new Date().toISOString() }))
  }

  const reviewMsg = reviewBooking ? buildMessage(reviewBooking) : ''
  const waNumber  = (client.whatsapp || client.phone).replace(/\D/g, '')

  return (
    <div className="space-y-6">

      {/* Back nav & Edit action */}
      <div className="flex items-center justify-between">
        <Link
          to="/clients"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Clients
        </Link>
        <button
          onClick={() => setEditOpen(true)}
          className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-xl border border-[#E4E8EC] bg-white text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
        >
          <Pencil size={13} /> Edit Profile
        </button>
      </div>

      {/* ── Client Hero Card ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <Avatar name={client.full_name} size="xl" idx={clientIdx} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-[22px] font-bold text-[#111827]">{client.full_name}</h1>
              {isClientMonthly && (
                <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold">
                  Monthly Client
                </span>
              )}
              {client.id.startsWith('dj-') && !isClientMonthly && (
                <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-semibold">
                  Job Sheet Client
                </span>
              )}
              {totalLifetimeSpent > 2000 && (
                <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold">
                  VIP
                </span>
              )}
              {totalServices >= 2 && (
                <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                  Repeat Client
                </span>
              )}
              {client.pet_info && (
                <span className="text-[11px] bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full font-bold">
                  Pet
                </span>
              )}
            </div>

            {client.nationality && <p className="text-[13px] text-slate-500 mb-3">{client.nationality}</p>}

            <div className="flex flex-wrap gap-4 text-[13px] text-slate-600 mt-2">
              {client.phone ? (
                <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
                  <Phone size={13} className="text-slate-400" /> {client.phone}
                </a>
              ) : (
                <span className="text-slate-400 text-[12px] italic">No phone added</span>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
                  <Mail size={13} className="text-slate-400" /> {client.email}
                </a>
              )}
              {(client.building_name || client.area) && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-slate-400 shrink-0" />
                  {[client.building_name, client.apartment, client.area, client.city].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Grid: Lifetime Figures */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-[#E4E8EC]">
          {[
            { label: 'Total Services / Shifts', value: totalServices,                                sub: `${clientDailyJobs.length} job sheet + ${clientBookings.length} bookings` },
            { label: 'Lifetime Spent',          value: `AED ${totalLifetimeSpent.toLocaleString()}`, sub: 'Total charges billed' },
            { label: 'Overtime (OT) Logged',    value: `${totalDJOTHours}h OT`,                      sub: `${clientDailyJobs.filter(j => calcJobOTHours(j) > 0).length} OT shifts` },
            { label: 'Total Duty Hours',        value: `${totalDJDutyHours}h`,                       sub: `Across all service shifts` },
          ].map(s => (
            <div key={s.label} className="text-center p-2 rounded-xl bg-[#f8fafc] border border-[#edf2f7]">
              <p className="text-[18px] font-extrabold text-[#111827]">{s.value}</p>
              <p className="text-[11.5px] font-bold text-slate-700 mt-0.5">{s.label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs + Sidebar Layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left 2 Cols: Service History Tabs */}
        <div className="xl:col-span-2 space-y-4">

          {/* Tab Navigation */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-3 py-3">
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveTab('job_sheet')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
                  activeTab === 'job_sheet'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <FileText size={14} />
                Daily Job Sheet History ({clientDailyJobs.length})
              </button>

              <button
                onClick={() => setActiveTab('bookings')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
                  activeTab === 'bookings'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Calendar size={14} />
                Booking Records ({clientBookings.length})
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
                Client Details
              </button>
            </div>
          </div>

          {/* ── Daily Job Sheet History Tab ── */}
          {activeTab === 'job_sheet' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2">
                    <FileText size={16} className="text-purple-600" />
                    Daily Job Sheet Service History
                  </h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {clientDailyJobs.length} past service record{clientDailyJobs.length !== 1 ? 's' : ''} synchronized from Daily Job Sheet
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search shifts, cleaner, remarks…"
                      value={jobSearch}
                      onChange={e => setJobSearch(e.target.value)}
                      className="text-[12px] pl-8 pr-3 py-1.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-purple-400"
                    />
                  </div>
                </div>
              </div>

              {/* Financial & OT summary strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-[#f8fafc] border-b border-[#E4E8EC] text-center">
                <div className="p-2.5 bg-white rounded-xl border border-[#E4E8EC]">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Total Charges</p>
                  <p className="text-[15px] font-extrabold text-purple-700">AED {totalDJCharges.toLocaleString()}</p>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-[#E4E8EC]">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Total Received</p>
                  <p className="text-[15px] font-extrabold text-emerald-700">AED {totalDJReceived.toLocaleString()}</p>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-[#E4E8EC]">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Total Overtime</p>
                  <p className="text-[15px] font-extrabold text-amber-600">{totalDJOTHours}h OT</p>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-[#E4E8EC]">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Duty Hours</p>
                  <p className="text-[15px] font-extrabold text-slate-700">{totalDJDutyHours}h</p>
                </div>
              </div>

              {filteredDailyJobs.length === 0 ? (
                <div className="py-16 text-center">
                  <Calendar className="mx-auto mb-3 text-slate-300" size={36} strokeWidth={1.25} />
                  <p className="text-[13px] text-slate-500 font-medium">
                    {clientDailyJobs.length === 0
                      ? 'No service history recorded in Daily Job Sheet for this client.'
                      : 'No shifts match your search filter.'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                    Any new job entries logged with this address or client name in Daily Job Sheet will automatically be aggregated here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-3">Cleaner</th>
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
                      {filteredDailyJobs.map(job => {
                        const ot = calcJobOTHours(job)
                        return (
                          <tr key={job.id} className="hover:bg-purple-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                              {job.date ? formatDate(job.date) : '—'}
                            </td>
                            <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                              {job.staff_name || '—'}
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
                            <td className="py-3 px-4 text-slate-600 max-w-[220px] truncate" title={job.remarks || job.service}>
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

          {/* ── Booking Records Tab ── */}
          {activeTab === 'bookings' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Booking Records</h3>
                <p className="text-[12px] text-slate-500 mt-0.5">{clientBookings.length} total · {completed.length} completed · {reviewedCount} reviews requested</p>
              </div>
              {clientBookings.length === 0 ? (
                <div className="py-16 text-center">
                  <Calendar className="mx-auto mb-3 text-slate-300" size={36} strokeWidth={1.25} />
                  <p className="text-[13px] text-slate-500">No bookings yet for this client</p>
                </div>
              ) : (
                <div className="divide-y divide-[#E4E8EC]">
                  {clientBookings.map(b => (
                    <div key={b.id} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <p className="text-[13px] font-bold text-[#111827]">{b.service_type}</p>
                            <StatusPill status={b.status} />
                            {reviewMap[b.id] && (
                              <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                <CheckCircle size={10} /> Review Requested
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-[12px] text-slate-500">
                            <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(b.scheduled_date)} at {b.scheduled_time}</span>
                            <span className="flex items-center gap-1"><MapPin size={11} className="shrink-0" /> {b.service_address}</span>
                            {b.assigned_crew?.length > 0 && (
                              <span className="flex items-center gap-1"><User size={11} /> {crewNames(b.assigned_crew)}</span>
                            )}
                            <span className="flex items-center gap-1"><Clock size={11} /> {b.duration_hours}h</span>
                          </div>
                          {b.notes && (
                            <p className="text-[11.5px] text-slate-400 mt-1.5 italic">"{b.notes}"</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[15px] font-bold text-[#111827]">AED {b.total_amount.toLocaleString()}</p>
                          {b.status === 'completed' && (
                            <button
                              onClick={() => { setReviewBooking(b); setCopied(false) }}
                              className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                                reviewMap[b.id]
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              <Star size={11} />
                              {reviewMap[b.id] ? 'Re-request' : 'Ask Review'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Client Info ── */}
          {activeTab === 'info' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-[#111827]">Client Details</h3>
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-[12px] font-semibold text-purple-600 hover:underline"
                >
                  Edit Information
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  {[
                    { label: 'Full Name',         value: client.full_name },
                    { label: 'Phone',             value: client.phone || '—' },
                    { label: 'WhatsApp',          value: client.whatsapp || client.phone || '—' },
                    { label: 'Email',             value: client.email || '—' },
                    { label: 'Nationality',       value: client.nationality || '—' },
                    { label: 'Building / Villa',  value: client.building_name || '—' },
                    { label: 'Apartment',         value: client.apartment || '—' },
                    { label: 'Area',              value: client.area || '—' },
                    { label: 'City',              value: client.city || 'Dubai' },
                    { label: 'Preferred Cleaner', value: client.preferred_cleaner || '—' },
                    { label: 'Client Since',      value: formatDate(client.created_at) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-2.5 border-b border-[#E4E8EC] last:border-0">
                      <span className="text-[12px] text-slate-500">{label}</span>
                      <span className="text-[12px] font-semibold text-[#111827] text-right ml-4">{value}</span>
                    </div>
                  ))}
                </div>
                {client.access_notes && (
                  <div className="mt-4">
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-2">Access Notes</p>
                    <p className="text-[13px] text-slate-700 bg-amber-50 border border-amber-100 rounded-xl p-3">{client.access_notes}</p>
                  </div>
                )}
                {client.pet_info && (
                  <div className="mt-4">
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-2">Pet Info</p>
                    <p className="text-[13px] text-slate-700 bg-amber-50 border border-amber-100 rounded-xl p-3">{client.pet_info}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Sidebar ── */}
        <div className="space-y-5">

          {/* Daily Job Sheet summary widget */}
          {clientDailyJobs.length > 0 && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-1.5">
                  <FileText size={16} className="text-purple-600" /> Job Sheet Summary
                </h3>
                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                  {clientDailyJobs.length} shifts
                </span>
              </div>
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                  <span className="text-slate-500">Charges</span>
                  <span className="font-extrabold text-purple-700">AED {totalDJCharges.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                  <span className="text-slate-500">Overtime (OT)</span>
                  <span className="font-bold text-amber-600">{totalDJOTHours} hrs</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#edf2f7]">
                  <span className="text-slate-500">Duty Hours</span>
                  <span className="font-bold text-slate-700">{totalDJDutyHours} hrs</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Cleaners</span>
                  <span className="font-medium text-slate-700 text-right truncate ml-2">
                    {Array.from(new Set(clientDailyJobs.map(j => j.staff_name).filter(Boolean))).join(', ') || '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Upcoming Bookings */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <h3 className="text-[15px] font-bold text-[#111827] mb-4">Upcoming Bookings</h3>
            {upcoming.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-4">No upcoming bookings</p>
            ) : (
              <div className="space-y-3">
                {upcoming.slice(0, 4).map(b => (
                  <div key={b.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                      <Calendar size={14} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#111827] truncate">{b.service_type}</p>
                      <p className="text-[11px] text-slate-500">{formatDate(b.scheduled_date)} · {b.scheduled_time}</p>
                    </div>
                    <StatusPill status={b.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review summary */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star size={16} className="text-amber-500" />
              <h3 className="text-[15px] font-bold text-[#111827]">Review Requests</h3>
            </div>
            {completed.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-4">No completed bookings yet</p>
            ) : (
              <>
                {[
                  { label: 'Completed jobs',   value: completed.length,                                    color: 'text-[#111827]' },
                  { label: 'Reviews requested', value: reviewedCount,                                       color: 'text-emerald-600' },
                  { label: 'Pending',           value: completed.length - reviewedCount,                    color: 'text-amber-600' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between py-2 border-b border-[#E4E8EC] last:border-0">
                    <span className="text-[12px] text-slate-500">{r.label}</span>
                    <span className={`text-[12px] font-bold ${r.color}`}>{r.value}</span>
                  </div>
                ))}
                {completed.length - reviewedCount > 0 && (
                  <button
                    onClick={() => {
                      const pending = completed.find(b => !reviewMap[b.id])
                      if (pending) { setReviewBooking(pending); setCopied(false) }
                    }}
                    className="w-full mt-3 py-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-[12px] font-semibold hover:bg-amber-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Star size={13} /> Request Next Review
                  </button>
                )}
              </>
            )}
          </div>

          {/* Financial summary */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">💳</span>
              <h3 className="text-[15px] font-bold text-[#111827]">Financials</h3>
            </div>
            {clientInvoices.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-3">No invoices yet</p>
            ) : (
              <>
                {[
                  { label: 'Total Invoiced', value: `AED ${totalInvoiced.toLocaleString()}`, color: 'text-[#111827]' },
                  { label: 'Total Paid',     value: `AED ${totalPaid.toLocaleString()}`,     color: 'text-emerald-600' },
                  { label: 'Outstanding',    value: `AED ${outstanding.toLocaleString()}`,   color: outstanding > 0 ? 'text-red-600 font-bold' : 'text-emerald-600' },
                  { label: 'Invoices',       value: `${clientInvoices.length} total`,        color: 'text-slate-600' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between py-2 border-b border-[#E4E8EC] last:border-0">
                    <span className="text-[12px] text-slate-500">{r.label}</span>
                    <span className={`text-[12px] ${r.color}`}>{r.value}</span>
                  </div>
                ))}
                {outstanding > 0 && (
                  <Link
                    to="/invoices"
                    className="mt-3 block bg-red-50 border border-red-200 rounded-xl p-2.5 text-center hover:bg-red-100 transition-colors"
                  >
                    <p className="text-[11px] font-semibold text-red-700">AED {outstanding.toLocaleString()} unpaid — view invoices →</p>
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Last service */}
          {client.last_service && (
            <div className="bg-slate-50 border border-[#E4E8EC] rounded-[22px] p-5">
              <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1">Last Service Date</p>
              <p className="text-[14px] font-bold text-[#111827]">{formatDate(client.last_service)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Client Modal ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Client" size="lg">
        <form
          className="space-y-4"
          onSubmit={async e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget as HTMLFormElement)
            setEditSaving(true)
            updateClient(client.id, {
              full_name:         fd.get('full_name') as string,
              phone:             fd.get('phone') as string,
              whatsapp:          fd.get('whatsapp') as string || undefined,
              email:             fd.get('email') as string || undefined,
              nationality:       fd.get('nationality') as string || undefined,
              building_name:     fd.get('building_name') as string || undefined,
              apartment:         fd.get('apartment') as string || undefined,
              area:              fd.get('area') as string,
              city:              fd.get('city') as string,
              preferred_cleaner: fd.get('preferred_cleaner') as string || undefined,
              access_notes:      fd.get('access_notes') as string || undefined,
              pet_info:          fd.get('pet_info') as string || undefined,
            })
            setEditSaving(false)
            setEditOpen(false)
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Input name="full_name"     label="Full Name"    defaultValue={client.full_name}     required />
            <Input name="phone"         label="Phone"        defaultValue={client.phone} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="whatsapp"      label="WhatsApp"     defaultValue={client.whatsapp ?? ''} />
            <Input name="email"         label="Email"        defaultValue={client.email ?? ''}    type="email" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="nationality"   label="Nationality"  defaultValue={client.nationality ?? ''} />
            <Input name="building_name" label="Building"     defaultValue={client.building_name ?? ''} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="apartment"     label="Apartment"    defaultValue={client.apartment ?? ''} />
            <Input name="area"          label="Area"         defaultValue={client.area}           required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="city"              label="City"               defaultValue={client.city || 'Dubai'} required />
            <Input name="preferred_cleaner" label="Preferred Cleaner"  defaultValue={client.preferred_cleaner ?? ''} />
          </div>
          <Textarea name="access_notes" label="Access Notes" defaultValue={client.access_notes ?? ''} rows={2} />
          <Textarea name="pet_info"     label="Pet Info"     defaultValue={client.pet_info ?? ''}     rows={2} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── Review Request Modal ── */}
      <Modal
        open={!!reviewBooking}
        onClose={() => { setReviewBooking(null); setCopied(false) }}
        title="Request Client Review"
        size="md"
      >
        {reviewBooking && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-[#E4E8EC] rounded-xl p-3">
              <p className="text-[12px] font-semibold text-slate-600">{reviewBooking.service_type} · {formatDate(reviewBooking.scheduled_date)}</p>
              <p className="text-[11.5px] text-slate-500 mt-0.5">{reviewBooking.service_address}</p>
            </div>

            <div>
              <p className="text-[12px] font-bold text-slate-600 uppercase tracking-[0.08em] mb-2">Message Preview</p>
              <textarea
                value={reviewMsg}
                readOnly
                rows={9}
                className="w-full text-[12px] text-slate-700 bg-slate-50 border border-[#E4E8EC] rounded-xl p-3.5 resize-none leading-relaxed"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(reviewMsg)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2500)
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#E4E8EC] text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {copied
                  ? <><CheckCircle size={13} className="text-emerald-600" /> Copied!</>
                  : <><Copy size={13} /> Copy Message</>
                }
              </button>

              {waNumber ? (
                <a
                  href={`https://wa.me/${waNumber}?text=${encodeURIComponent(reviewMsg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => markSent(reviewBooking)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <MessageCircle size={13} /> Send via WhatsApp
                </a>
              ) : (
                <button
                  onClick={() => { markSent(reviewBooking); setReviewBooking(null) }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <CheckCircle size={13} /> Mark as Sent
                </button>
              )}
            </div>

            {reviewMap[reviewBooking.id] ? (
              <p className="text-[11px] text-slate-400 text-center">
                Last requested {new Date(reviewMap[reviewBooking.id]).toLocaleDateString()}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 text-center">
                Clicking "Send via WhatsApp" will open WhatsApp and mark this booking as review requested.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
