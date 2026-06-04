import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Star, MessageCircle,
  Copy, CheckCircle, User, Clock, ExternalLink,
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { Booking } from '@/types'

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
  const init  = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  const dims  = size === 'xl' ? 'w-20 h-20 text-[22px]' : size === 'lg' ? 'w-14 h-14 text-[16px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-[13px]'
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0`} style={{ background: color.bg, color: color.text }}>
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
  const { clients, bookings, employees } = useData()
  const [activeTab,     setActiveTab]     = useState<'bookings' | 'info'>('bookings')
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null)
  const [reviewMap,     setReviewMap]     = useState<Record<string, string>>({})
  const [copied,        setCopied]        = useState(false)

  useEffect(() => { setReviewMap(loadReviews()) }, [])

  const client    = clients.find(c => c.id === id)
  const clientIdx = clients.findIndex(c => c.id === id)

  if (!client) {
    return (
      <div className="space-y-6">
        <Link to="/clients" className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft size={14} /> Back to Clients
        </Link>
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-16 text-center">
          <p className="text-slate-500">Client not found.</p>
        </div>
      </div>
    )
  }

  const clientBookings   = bookings
    .filter(b => b.client_id === id)
    .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())
  const completed        = clientBookings.filter(b => b.status === 'completed')
  const upcoming         = clientBookings.filter(b => ['pending', 'confirmed'].includes(b.status))
  const totalSpent       = completed.reduce((s, b) => s + b.total_amount, 0)
  const avgJobValue      = completed.length > 0 ? totalSpent / completed.length : 0
  const reviewedCount    = completed.filter(b => reviewMap[b.id]).length

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

  const reviewMsg    = reviewBooking ? buildMessage(reviewBooking) : ''
  const waNumber     = (client.whatsapp || client.phone).replace(/\D/g, '')

  return (
    <div className="space-y-6">

      {/* Back nav */}
      <Link
        to="/clients"
        className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700 transition-colors w-fit"
      >
        <ArrowLeft size={14} /> Back to Clients
      </Link>

      {/* ── Hero card ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <Avatar name={client.full_name} size="xl" idx={clientIdx} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-[22px] font-bold text-[#111827]">{client.full_name}</h1>
              {totalSpent > 2000 && (
                <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold">VIP</span>
              )}
              {completed.length >= 2 && (
                <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold">Repeat</span>
              )}
              {client.pet_info && (
                <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">Pet</span>
              )}
            </div>
            {client.nationality && <p className="text-[13px] text-slate-500 mb-3">{client.nationality}</p>}
            <div className="flex flex-wrap gap-4 text-[13px] text-slate-600">
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
                  <Phone size={13} /> {client.phone}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
                  <Mail size={13} /> {client.email}
                </a>
              )}
              {client.area && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} />
                  {[client.building_name, client.apartment, client.area, client.city].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-[#E4E8EC]">
          {[
            { label: 'Total Bookings',  value: clientBookings.length                                        },
            { label: 'Completed Jobs',  value: completed.length                                             },
            { label: 'Total Spent',     value: `AED ${totalSpent.toLocaleString()}`                         },
            { label: 'Avg Job Value',   value: avgJobValue > 0 ? `AED ${Math.round(avgJobValue)}` : '—'     },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-[18px] font-bold text-[#111827]">{s.value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs + sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="xl:col-span-2 space-y-4">

          {/* Tab nav */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-3 py-3">
            <div className="flex gap-1">
              {([
                { id: 'bookings', label: `Booking History (${clientBookings.length})` },
                { id: 'info',     label: 'Client Info' },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
                    activeTab === t.id ? 'bg-[#111827] text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Booking History ── */}
          {activeTab === 'bookings' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Booking History</h3>
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
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Client Details</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  {[
                    { label: 'Full Name',         value: client.full_name },
                    { label: 'Phone',             value: client.phone },
                    { label: 'WhatsApp',          value: client.whatsapp || client.phone },
                    { label: 'Email',             value: client.email || '—' },
                    { label: 'Nationality',       value: client.nationality || '—' },
                    { label: 'Building',          value: client.building_name || '—' },
                    { label: 'Apartment',         value: client.apartment || '—' },
                    { label: 'Area',              value: client.area },
                    { label: 'City',              value: client.city },
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

        {/* ── Right sidebar ── */}
        <div className="space-y-5">

          {/* Upcoming */}
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

          {/* Last service */}
          {client.last_service && (
            <div className="bg-slate-50 border border-[#E4E8EC] rounded-[22px] p-5">
              <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1">Last Service</p>
              <p className="text-[14px] font-bold text-[#111827]">{formatDate(client.last_service)}</p>
            </div>
          )}
        </div>
      </div>

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
