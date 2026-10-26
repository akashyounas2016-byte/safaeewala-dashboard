import { useState, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Phone, MapPin, Calendar, TrendingUp, Users, Star, DollarSign,
  Heart, Award, CheckCircle, Trash2, ExternalLink, ArrowUpDown, RotateCcw, X, Filter, Clock,
  Save, Check, ChevronDown, UserCheck, Edit2, LayoutGrid, List
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatDate, addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { BookingFrequency } from '@/types'
import { isMonthlyJob, jobMatchesClient, isMonthlyClient, extractMonthlyClientsFromDailyJobs } from '@/lib/clientDataSync'
import { SourceOriginTag, resolveClientSource } from '@/lib/sourceTracking'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { AddMonthlyClientModalForm } from '@/components/monthlyClients/AddMonthlyClientModalForm'
import { ClientModalForm } from '@/components/clients/ClientModalForm'

export type ClientDatePreset = 'all' | '7days' | '30days' | '3months' | '6months' | '1year' | 'custom'

const serviceTypes = [
  'Standard Clean', 'Deep Clean', 'Move-in', 'Move-out',
  'Commercial', 'Post-construction', 'Office', 'Carpet', 'Window',
]

/* ─── Avatar palette ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72' },
  { bg: '#fce4d6', text: '#c66a3a' },
  { bg: '#e4dff5', text: '#6b5bb5' },
  { bg: '#d6e7f5', text: '#3a7ab8' },
  { bg: '#fcecc8', text: '#a8842a' },
]
function Avatar({ name, size = 'md', idx = 0 }: { name: string; size?: 'sm' | 'md' | 'lg'; idx?: number }) {
  const parts = name.trim().split(' ')
  const init = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  const dims = size === 'lg' ? 'w-14 h-14 text-[16px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-[13px]'
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0`} style={{ background: color.bg, color: color.text }}>
      {init}
    </div>
  )
}

function CrewSelector({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { employees } = useData()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activeEmps = employees.filter(e => e.status === 'active' || e.status === 'engaged_in_project')
  const filtered = search
    ? activeEmps.filter(e => e.full_name.toLowerCase().includes(search.toLowerCase()))
    : activeEmps
  const selectedEmps = activeEmps.filter(e => selected.includes(e.id))
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }
  return (
    <div>
      <p className="text-[12px] font-semibold text-slate-600 mb-2">Assign Crew</p>
      {selectedEmps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedEmps.map(emp => (
            <span key={emp.id} className="inline-flex items-center gap-1 text-[11.5px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-medium">
              {emp.full_name}
              <button type="button" onClick={() => toggle(emp.id)} className="ml-0.5 hover:text-red-600 font-bold leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative" ref={ref}>
        <input
          type="text"
          placeholder={activeEmps.length === 0 ? 'No active employees — add employees first' : 'Search and select cleaners…'}
          value={search}
          onFocus={() => setOpen(true)}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          disabled={activeEmps.length === 0}
          className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50 focus:outline-none focus:border-emerald-400 placeholder-slate-400 disabled:opacity-50 transition-colors"
        />
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-[#E4E8EC] rounded-xl shadow-xl max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-slate-400 px-4 py-3">No employees match "{search}"</p>
            ) : filtered.map(emp => {
              const checked = selected.includes(emp.id)
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => { toggle(emp.id); setSearch('') }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-[#E4E8EC] last:border-0 transition-colors ${checked ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                    {checked && <span className="text-white text-[9px] font-bold">✓</span>}
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#111827]">{emp.full_name}</p>
                    <p className="text-[10.5px] text-slate-400">{emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {selectedEmps.length > 0 && (
        <p className="text-[11px] text-emerald-600 font-medium mt-1.5">{selectedEmps.length} cleaner{selectedEmps.length > 1 ? 's' : ''} assigned</p>
      )}
    </div>
  )
}

export function Clients() {
  const { clients, bookings, dailyJobs, employees, addClient, updateClient, deleteClient, addBooking, invoices } = useData()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<typeof clients[0] | null>(null)
  const [isEditingClient, setIsEditingClient] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [bookingClient, setBookingClient] = useState<{ name: string; phone: string } | null>(null)
  const [areaFilter, setAreaFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<'recent' | 'top_spent' | 'name'>('recent')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [filterType, setFilterType] = useState<'all' | 'active' | 'vip' | 'repeat' | 'monthly' | null>(null)
  const [datePreset, setDatePreset] = useState<ClientDatePreset>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    return safeLocalStorageGet<'grid' | 'table'>('clients_view_mode', 'grid')
  })
  useEffect(() => {
    safeLocalStorageSet('clients_view_mode', viewMode)
  }, [viewMode])

  // ── Synchronized Monthly Clients Summaries (Single Source of Truth) ──
  const allMonthlySummaries = useMemo(() => {
    return extractMonthlyClientsFromDailyJobs(dailyJobs, 'all', clients)
  }, [dailyJobs, clients])

  // Check if selected client is a recurring Monthly Client
  const isSelectedMonthly = useMemo(() => {
    if (!selected) return false
    return isMonthlyClient(selected, dailyJobs, allMonthlySummaries)
  }, [selected, dailyJobs, allMonthlySummaries])

  // Helper to extract YYYY-MM-DD
  const extractDateStr = (val?: string | null): string => {
    if (!val) return ''
    try {
      return val.split('T')[0]
    } catch {
      return ''
    }
  }

  // Active Date Range based on selected preset
  const activeDateRange = useMemo(() => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    if (datePreset === '7days') {
      const d = new Date(today)
      d.setDate(d.getDate() - 6)
      return {
        start: d.toISOString().split('T')[0],
        end: todayStr,
        label: 'Last 7 Days',
      }
    }
    if (datePreset === '30days') {
      const d = new Date(today)
      d.setDate(d.getDate() - 29)
      return {
        start: d.toISOString().split('T')[0],
        end: todayStr,
        label: 'Last 30 Days',
      }
    }
    if (datePreset === '3months') {
      const d = new Date(today)
      d.setMonth(d.getMonth() - 3)
      return {
        start: d.toISOString().split('T')[0],
        end: todayStr,
        label: 'Last 3 Months',
      }
    }
    if (datePreset === '6months') {
      const d = new Date(today)
      d.setMonth(d.getMonth() - 6)
      return {
        start: d.toISOString().split('T')[0],
        end: todayStr,
        label: 'Last 6 Months',
      }
    }
    if (datePreset === '1year') {
      const d = new Date(today)
      d.setFullYear(d.getFullYear() - 1)
      return {
        start: d.toISOString().split('T')[0],
        end: todayStr,
        label: 'Last 1 Year',
      }
    }
    if (datePreset === 'custom') {
      return {
        start: customStartDate,
        end: customEndDate,
        label: 'Custom Range',
      }
    }
    return {
      start: '',
      end: '',
      label: 'All Time',
    }
  }, [datePreset, customStartDate, customEndDate])

  // Check if a client has activity or registration in active date range
  const isClientInDateRange = (c: typeof clients[0]): boolean => {
    if (datePreset === 'all') return true
    const { start, end } = activeDateRange
    if (!start && !end) return true

    const isDateBetween = (dStr: string) => {
      if (!dStr) return false
      if (start && dStr < start) return false
      if (end && dStr > end) return false
      return true
    }

    // 1. Last service date
    if (isDateBetween(extractDateStr(c.last_service))) return true

    // 2. Client joined / created_at date
    if (isDateBetween(extractDateStr(c.created_at))) return true

    // 3. Daily Job Sheet shifts for this client
    if (dailyJobs.some(j => jobMatchesClient(j, c) && isDateBetween(extractDateStr(j.date)))) {
      return true
    }

    // 4. Bookings for this client
    const nameLower = c.full_name.toLowerCase().trim()
    if (bookings.some(b => 
      (b.client_id === c.id || b.client_name.toLowerCase().trim() === nameLower) &&
      (isDateBetween(extractDateStr(b.scheduled_date)) || isDateBetween(extractDateStr(b.created_at)))
    )) {
      return true
    }

    return false
  }

  const totalSpent    = clients.reduce((s, c) => s + c.total_spent, 0)
  const avgLtv        = Math.round(totalSpent / (clients.length || 1))
  const activeClients = clients.filter(c => c.last_service && new Date(c.last_service) > new Date('2026-01-01')).length
  const vipClients    = clients.filter(c => c.total_spent > 2000).length
  const repeatClients = clients.filter(c => c.total_bookings > 1).length
  const repeatRate    = clients.length > 0 ? Math.round((repeatClients / clients.length) * 100) : 0
  const monthlyCount  = useMemo(() => {
    return clients.filter(c => isMonthlyClient(c, dailyJobs, allMonthlySummaries)).length
  }, [clients, dailyJobs, allMonthlySummaries])

  // Month-over-month deltas
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const newThisMonth  = clients.filter(c => c.created_at >= startOfMonth).length
  const newLastMonth  = clients.filter(c => c.created_at >= startOfLastMonth && c.created_at < startOfMonth).length
  const clientDelta   = newThisMonth - newLastMonth
  const clientDeltaLabel = newThisMonth > 0 ? `+${newThisMonth} this month` : '0 this month'

  const areas = [...new Set(clients.map(c => c.area).filter(Boolean))].sort()

  const filtered = (() => {
    const base = clients.filter(c => {
      const q = search.toLowerCase().trim()
      const matchSearch = q === '' ||
        c.full_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.area && c.area.toLowerCase().includes(q)) ||
        (c.building_name && c.building_name.toLowerCase().includes(q))
      const matchArea = areaFilter === 'all' || c.area === areaFilter
      const isClientMonthly = isMonthlyClient(c, dailyJobs, allMonthlySummaries)
      const matchFilter = !filterType || (
        filterType === 'active' ? (c.last_service && new Date(c.last_service) > new Date('2026-01-01')) :
        filterType === 'vip' ? c.total_spent > 2000 :
        filterType === 'repeat' ? c.total_bookings > 1 :
        filterType === 'monthly' ? isClientMonthly :
        true
      )
      const matchDate = isClientInDateRange(c)
      return matchSearch && matchArea && matchFilter && matchDate
    })
    if (sortOrder === 'top_spent') return [...base].sort((a, b) => b.total_spent - a.total_spent)
    if (sortOrder === 'name')      return [...base].sort((a, b) => a.full_name.localeCompare(b.full_name))
    return [...base].sort((a, b) => (b.last_service || b.created_at || '').localeCompare(a.last_service || a.created_at || ''))
  })()

  const topClients = [...clients].sort((a, b) => b.total_spent - a.total_spent).slice(0, 5)

  const areaCounts = clients.reduce((acc, c) => {
    acc[c.area] = (acc[c.area] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // ── Modular Widgets ──
  const renderTopClientsWidget = () => (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-bold text-[#111827]">Top Clients</h3>
        <span className="text-[11px] text-slate-400">By lifetime value</span>
      </div>
      <div className="space-y-3">
        {topClients.map((c, idx) => {
          const pct = Math.round((c.total_spent / (topClients[0]?.total_spent || 1)) * 100)
          const isMonthly = isMonthlyClient(c, dailyJobs, allMonthlySummaries)
          return (
            <Link key={c.id} to={`/clients/${c.id}`} className="flex items-center gap-3 hover:bg-slate-50 rounded-xl -mx-2 px-2 py-1 transition-colors">
              <span className={`text-[12px] font-bold w-4 shrink-0 ${idx === 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                {idx + 1}
              </span>
              <Avatar name={c.full_name} size="sm" idx={idx} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[12px] font-semibold text-[#111827] truncate">{c.full_name}</p>
                  {isMonthly && (
                    <span className="text-[9px] bg-emerald-600 text-white font-extrabold px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                      Monthly
                    </span>
                  )}
                </div>
                <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="text-[12px] font-bold text-[#111827] shrink-0">AED {c.total_spent.toLocaleString()}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )

  const renderTopLocationsWidget = () => (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-bold text-[#111827]">Top Locations</h3>
        <span className="text-[11px] text-slate-400">By area</span>
      </div>
      <div className="space-y-2.5">
        {Object.entries(areaCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([area, count]) => {
            const maxCount = Math.max(...Object.values(areaCounts)) || 1
            const pct = Math.round((count / maxCount) * 100)
            return (
              <div key={area}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-slate-700 truncate">{area}</span>
                  <span className="text-[12px] font-bold text-[#111827] shrink-0 ml-2">{count}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )

  const renderRecentBookingsWidget = () => (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-bold text-[#111827]">Recent Bookings</h3>
        <span className="text-[11px] text-slate-400">Latest activity</span>
      </div>
      {bookings.length === 0 ? (
        <p className="text-[12px] text-slate-400 text-center py-4">No bookings yet</p>
      ) : (
        <div className="space-y-3">
          {[...bookings]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 5)
            .map((b, idx) => {
              const statusColor =
                b.status === 'completed'   ? 'bg-slate-100 text-slate-600' :
                b.status === 'in_progress' ? 'bg-emerald-50 text-emerald-700' :
                b.status === 'confirmed'   ? 'bg-blue-50 text-blue-700' :
                b.status === 'cancelled'   ? 'bg-red-50 text-red-600' :
                'bg-amber-50 text-amber-700'
              const statusLabel =
                b.status === 'completed'   ? 'Done' :
                b.status === 'in_progress' ? 'Live' :
                b.status === 'confirmed'   ? 'Scheduled' :
                b.status === 'cancelled'   ? 'Cancelled' : 'Pending'
              return (
                <Link key={b.id} to="/bookings" className="flex items-center gap-3 hover:bg-slate-50 rounded-xl -mx-2 px-2 py-1 transition-colors">
                  <Avatar name={b.client_name} size="sm" idx={idx} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[#111827] truncate">{b.client_name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{b.service_type} · {b.scheduled_date}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusColor}`}>
                    {statusLabel}
                  </span>
                </Link>
              )
            })}
        </div>
      )}
    </div>
  )

  const renderClientsTable = () => (
    <div className="w-full bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              <th className="py-3.5 px-4">Client</th>
              <th className="py-3.5 px-3">Contact</th>
              <th className="py-3.5 px-3">Location</th>
              <th className="py-3.5 px-3">Assigned Cleaner</th>
              <th className="py-3.5 px-3 text-center">Visits</th>
              <th className="py-3.5 px-3 text-right">Lifetime Spent</th>
              <th className="py-3.5 px-3">Type / Tags</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[12.5px]">
            {filtered.map((c, idx) => {
              const nameLower = c.full_name.toLowerCase().trim()
              const liveBookings = bookings.filter(b => b.client_id === c.id || b.client_name.toLowerCase().trim() === nameLower)
              const clientInvs = invoices.filter(i => i.client_id === c.id || i.client_name.toLowerCase().trim() === nameLower)
              const outstanding = clientInvs.reduce((s, i) => s + i.total, 0) - clientInvs.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
              const isMonthly = isMonthlyClient(c, dailyJobs, allMonthlySummaries)
              const totalVisits = Math.max(c.total_bookings, liveBookings.length)

              return (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`transition-colors cursor-pointer group ${
                    isMonthly
                      ? 'bg-emerald-50/70 hover:bg-emerald-100/70 border-l-[4px] border-l-emerald-600'
                      : 'hover:bg-emerald-50/40'
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.full_name} size="sm" idx={idx} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-[#111827] group-hover:text-emerald-700 transition-colors truncate">
                            {c.full_name}
                          </p>
                          {isMonthly && (
                            <span className="text-[10px] bg-emerald-600 text-white font-black px-2 py-0.5 rounded-full shadow-2xs tracking-wider uppercase">
                              Monthly
                            </span>
                          )}
                          <SourceOriginTag source={resolveClientSource(c, bookings)} />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {c.nationality ? `${c.nationality} · ` : ''}Since {formatDate(c.created_at)}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <p className="font-semibold text-slate-800">{c.phone}</p>
                    {c.whatsapp && c.whatsapp !== c.phone && (
                      <p className="text-[11px] text-slate-400">WA: {c.whatsapp}</p>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    <p className="font-medium text-slate-800 truncate max-w-[180px]">
                      {c.building_name ? `${c.building_name}, ` : ''}{c.area}
                    </p>
                    <p className="text-[11px] text-slate-400">{c.city || 'Dubai'}</p>
                  </td>

                  <td className="py-3 px-3">
                    {c.preferred_cleaner ? (
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full">
                        <Users size={11} className="text-emerald-600" />
                        <span>{c.preferred_cleaner}</span>
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-slate-400 font-medium">Unassigned</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-full text-[11.5px]">
                      {totalVisits}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right">
                    <p className="font-extrabold text-[#111827]">AED {c.total_spent.toLocaleString()}</p>
                    {outstanding > 0 && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded">
                        Owed: AED {outstanding.toLocaleString()}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isMonthly && (
                        <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-bold">
                          Monthly
                        </span>
                      )}
                      {c.total_spent > 2000 && (
                        <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                          VIP
                        </span>
                      )}
                      {c.pet_info && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          Pet
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(c)
                          setIsEditingClient(true)
                        }}
                        className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 transition-colors"
                        title="Edit Profile"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteClient(c.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                        title="Delete client"
                      >
                        <Trash2 size={13} />
                      </button>
                      <Link
                        to={`/clients/${c.id}`}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                        title="View Full Profile"
                      >
                        <ExternalLink size={13} />
                      </Link>
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
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Clients"
        subtitle={`${clients.length} total clients · ${activeClients} active this year · AED ${totalSpent.toLocaleString()} lifetime`}
        statusChip={`${vipClients} VIP`}
        actionLabel="Add Client"
        onAction={() => setShowModal(true)}
        showSearch={false}
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
        {[
          { label: 'Total Clients',    value: clients.length,             sub: 'All time records', icon: Users,     iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    delta: clientDeltaLabel,  deltaUp: newThisMonth >= 0, filter: null },
          { label: 'Monthly Clients',  value: monthlyCount,              sub: 'Active monthly clients', icon: Star,     iconBg: 'bg-teal-50',    iconColor: 'text-teal-600',    delta: `${monthlyCount} active`, deltaUp: monthlyCount > 0, filter: 'monthly' },
          { label: 'Active (30d)',     value: activeClients,              sub: 'Recent activity', icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: `${activeClients} active`, deltaUp: activeClients > 0, filter: 'active' },
          { label: 'VIP Clients',      value: vipClients,                 sub: 'AED 2k+ spent',  icon: Award,     iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   delta: vipClients > 0 ? `${vipClients} VIP` : 'None', deltaUp: vipClients > 0, filter: 'vip' },
          { label: 'Avg Lifetime',     value: `AED ${avgLtv.toLocaleString()}`, sub: 'Per client', icon: DollarSign, iconBg: 'bg-teal-50',   iconColor: 'text-teal-600',    delta: avgLtv > 0 ? 'Real' : '—', deltaUp: avgLtv > 0, filter: null },
          { label: 'Total Revenue',    value: `AED ${(totalSpent/1000).toFixed(1)}k`, sub: 'All clients', icon: CheckCircle, iconBg: 'bg-rose-50', iconColor: 'text-rose-600',    delta: `AED ${totalSpent.toLocaleString()}`, deltaUp: totalSpent > 0, filter: null },
          { label: 'Repeat Rate',      value: `${repeatRate}%`,           sub: 'Have 2+ visits',  icon: Heart,     iconBg: 'bg-pink-50',    iconColor: 'text-pink-600',    delta: `${repeatClients} clients`, deltaUp: repeatRate > 0, filter: 'repeat' },
        ].map(card => {
          const isSelected = filterType === card.filter
          return (
            <button
              key={card.label}
              onClick={() => setFilterType(isSelected ? null : (card.filter as any))}
              className={`text-left bg-white rounded-[24px] border-2 shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all cursor-pointer ${
                isSelected ? 'border-emerald-400 bg-emerald-50/30' : 'border-[#E4E8EC] hover:border-emerald-200'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center`}>
                  <card.icon size={18} className={card.iconColor} />
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${card.deltaUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {card.delta}
                </span>
              </div>
              <p className="text-2xl font-bold text-[#111827] tracking-tight">{card.value}</p>
              <p className="text-[12px] font-semibold text-[#111827] mt-1">{card.label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
            </button>
          )
        })}
      </div>

      {/* ── Single Unified Filter & Search Bar directly below summary cards ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 sm:p-5 space-y-3.5">
        
        {/* Main Controls Row: Search + Area Filter + Sort Filter + Reset & Counter */}
        <div className="flex items-center gap-3 flex-wrap">
          
          {/* Search bar */}
          <div className="relative flex-1 min-w-[240px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client name, phone, area, building…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-[13px] pl-10 pr-9 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white placeholder-slate-400 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Area Filter */}
          <div className="relative shrink-0">
            <select
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
              className="text-[13px] pl-3.5 pr-8 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 text-slate-700 font-medium cursor-pointer appearance-none transition-colors"
            >
              <option value="all">All Areas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <MapPin size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Sort Filter */}
          <div className="relative shrink-0">
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as typeof sortOrder)}
              className="text-[13px] pl-3.5 pr-8 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 text-slate-700 font-medium cursor-pointer appearance-none transition-colors"
            >
              <option value="recent">Sort by: Recent</option>
              <option value="top_spent">Sort by: Top Spenders</option>
              <option value="name">Sort by: Name (A-Z)</option>
            </select>
            <ArrowUpDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Reset button if active */}
          {(search || areaFilter !== 'all' || sortOrder !== 'recent' || datePreset !== 'all' || filterType) && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setAreaFilter('all')
                setSortOrder('recent')
                setDatePreset('all')
                setFilterType(null)
                setCustomStartDate('')
                setCustomEndDate('')
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded-xl transition-colors shrink-0"
              title="Reset all filters"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Table View (Full Width)"
            >
              <List size={15} />
            </button>
          </div>

          {/* Result counter */}
          <div className="ml-auto text-right shrink-0">
            <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/60">
              Showing <span className="text-emerald-600 font-extrabold">{filtered.length}</span> of {clients.length} clients
            </span>
          </div>
        </div>

        {/* Date Range Filter Row: 7 Days, 30 Days, 3 Months, 6 Months, 1 Year, Custom Range */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-slate-500 mr-1 flex items-center gap-1.5">
              <Calendar size={13} className="text-emerald-600" />
              <span>Date Filter:</span>
            </span>

            {[
              { id: 'all',     label: 'All Time' },
              { id: '7days',   label: '7 Days' },
              { id: '30days',  label: '30 Days' },
              { id: '3months', label: '3 Months' },
              { id: '6months', label: '6 Months' },
              { id: '1year',   label: '1 Year' },
              { id: 'custom',  label: 'Custom Range' },
            ].map(preset => {
              const active = datePreset === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDatePreset(preset.id as ClientDatePreset)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                      : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* Custom Date Pickers */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-[#f8fafc] border border-emerald-200 rounded-xl px-3 py-1.5 animate-in fade-in duration-150">
              <span className="text-[11px] font-bold text-emerald-700">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="text-[12px] px-2 py-1 bg-white border border-[#E4E8EC] rounded-lg focus:outline-none focus:border-emerald-500 font-medium"
              />
              <span className="text-[11px] font-bold text-emerald-700">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="text-[12px] px-2 py-1 bg-white border border-[#E4E8EC] rounded-lg focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
          )}

          {/* Active Range sub-label */}
          {datePreset !== 'all' && datePreset !== 'custom' && (
            <span className="text-[11.5px] font-medium text-slate-400 ml-auto">
              {activeDateRange.start} to {activeDateRange.end}
            </span>
          )}
        </div>

      </div>

      {/* ── Main Layout: Full Width Table View with Widgets Underneath OR Grid View ── */}
      {viewMode === 'table' ? (
        <div className="space-y-6">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] py-16 text-center">
              <Users className="mx-auto mb-3 text-slate-300" size={40} strokeWidth={1.25} />
              <p className="text-[13px] text-slate-500">No clients match your search</p>
            </div>
          ) : (
            renderClientsTable()
          )}

          {/* ── Widgets Underneath Datatable (Responsive 3-Column Grid) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {renderTopClientsWidget()}
            {renderTopLocationsWidget()}
            {renderRecentBookingsWidget()}
          </div>
        </div>
      ) : (
        /* ── GRID CARD VIEW (2 cols cards + 1 col widgets sidebar) ── */
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

          {/* ── Left: Client Grid (at equal height with Top Clients widget) ── */}
          <div className="xl:col-span-2 space-y-4">

          {/* Client cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((c, idx) => {
              const isMonthly = isMonthlyClient(c, dailyJobs, allMonthlySummaries)
              return (
              <div
                key={c.id}
                onClick={() => setSelected(c)}
                className={`rounded-[22px] p-5 cursor-pointer transition-all border ${
                  isMonthly
                    ? 'bg-emerald-50/80 border-emerald-300 shadow-[0_4px_24px_rgba(16,185,129,0.12)] ring-1 ring-emerald-400/40 hover:bg-emerald-100/70 hover:border-emerald-400 hover:shadow-[0_8px_32px_rgba(16,185,129,0.18)]'
                    : 'bg-white border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] hover:border-emerald-200'
                }`}
              >
                <div className="flex items-start gap-3 mb-4">
                  <Avatar name={c.full_name} size="md" idx={idx} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-bold text-[#111827] truncate">{c.full_name}</p>
                      {isMonthly && (
                        <span className="text-[10px] bg-emerald-600 text-white font-black px-2 py-0.5 rounded-full shadow-2xs tracking-wider uppercase">
                          Monthly
                        </span>
                      )}
                      <SourceOriginTag source={resolveClientSource(c, bookings)} />
                    </div>
                    <p className="text-[12px] text-slate-500 mt-0.5">{c.nationality}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[15px] font-bold text-[#111827]">AED {c.total_spent.toLocaleString()}</p>
                    <p className="text-[11px] text-slate-400">lifetime</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-[12px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <Phone size={12} className="shrink-0 text-slate-400" />
                    <span>{c.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={12} className="shrink-0 text-slate-400" />
                    <span className="truncate">{c.building_name ? `${c.building_name}, ` : ''}{c.area}</span>
                  </div>
                  {c.last_service && (
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="shrink-0 text-slate-400" />
                      <span>Last service: {formatDate(c.last_service)}</span>
                    </div>
                  )}
                </div>

                {(() => {
                  const nameLower    = c.full_name.toLowerCase().trim()
                  const liveBookings = bookings.filter(b => b.client_id === c.id || b.client_name.toLowerCase().trim() === nameLower)
                  const clientInvs   = invoices.filter(i => i.client_id === c.id || i.client_name.toLowerCase().trim() === nameLower)
                  const outstanding  = clientInvs.reduce((s, i) => s + i.total, 0) - clientInvs.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
                  const isFromJobSheet = c.id.startsWith('dj-')
                  const totalVisits  = Math.max(c.total_bookings, liveBookings.length)
                  return (
                    <div className={`flex items-center justify-between mt-4 pt-3.5 border-t ${isMonthly ? 'border-emerald-200/90' : 'border-[#E4E8EC]'}`}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          to={`/clients/${c.id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-[12px] text-slate-500 hover:text-emerald-600 hover:underline transition-colors font-medium"
                        >
                          {totalVisits} visit{totalVisits !== 1 ? 's' : ''}
                        </Link>
                        {isMonthly && (
                          <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-bold">
                            Monthly
                          </span>
                        )}
                        {c.pet_info && (
                          <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">Pet</span>
                        )}
                        {c.total_spent > 2000 && (
                          <span className="text-[11px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">VIP</span>
                        )}
                        {outstanding > 0 && (
                          <Link
                            to={`/clients/${c.id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-[11px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-semibold hover:bg-red-100 transition-colors"
                          >
                            AED {outstanding.toLocaleString()} owed
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            setSelected(c)
                            setIsEditingClient(true)
                          }}
                          className="flex items-center gap-1 text-[11.5px] font-semibold text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                          title="Edit Profile"
                        >
                          <Edit2 size={12} />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteClient(c.id) }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                          title="Delete client"
                        >
                          <Trash2 size={14} />
                        </button>
                        <Link
                          to={`/clients/${c.id}`}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors shrink-0"
                        >
                          View Profile <ExternalLink size={11} />
                        </Link>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>

          {filtered.length === 0 && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] py-16 text-center">
              <Users className="mx-auto mb-3 text-slate-300" size={40} strokeWidth={1.25} />
              <p className="text-[13px] text-slate-500">No clients match your search</p>
            </div>
          )}
        </div>

        {/* ── Right sidebar widgets ── */}
        <div className="space-y-5">
          {renderTopClientsWidget()}
          {renderTopLocationsWidget()}
          {renderRecentBookingsWidget()}
        </div>

      </div>
    )}

      {/* ── Add Client Modal (Unified No-Scroll High-Efficiency Form) ── */}
      <ClientModalForm
        open={showModal}
        onClose={() => setShowModal(false)}
        employees={employees}
        onSave={clientData => {
          const clientName = clientData.full_name || 'New Client'
          const remarks = clientData.remarks || ''
          const advance = clientData.advance_amount || 0
          const adjustment = clientData.adjustment_amount || 0
          const pending = clientData.pending_amount || 0
          const cleaner = clientData.preferred_cleaner || ''

          addClient({
            full_name:         clientName,
            phone:             clientData.phone || '',
            whatsapp:          clientData.whatsapp || '',
            email:             clientData.email || '',
            nationality:       '',
            city:              clientData.city || 'Dubai',
            building_name:     clientData.building_name || '',
            apartment:         clientData.apartment || '',
            area:              clientData.area || 'Dubai',
            preferred_cleaner: cleaner,
            remarks:           remarks,
            notes:             remarks,
            access_notes:      remarks,
            advance_amount:    advance,
            adjustment_amount: adjustment,
            pending_amount:    pending,
            total_bookings:    0,
            total_spent:       0,
          })

          // Sync initial advance or adjustment to financial adjustments ledger
          if (advance > 0 || adjustment > 0) {
            const todayStr = new Date().toISOString().split('T')[0]
            const existingAdjs = safeLocalStorageGet<any[]>('safaeewala_client_adjustments', []) || []
            const newEntries = [...existingAdjs]

            if (advance > 0) {
              newEntries.push({
                id: 'adj-init-adv-' + Date.now(),
                client_id: '',
                client_name: clientName,
                date: todayStr,
                type: 'advance',
                amount: advance,
                notes: 'Initial opening advance payment',
                created_at: new Date().toISOString(),
              })
            }
            if (adjustment > 0) {
              newEntries.push({
                id: 'adj-init-adj-' + Date.now(),
                client_id: '',
                client_name: clientName,
                date: todayStr,
                type: 'discount',
                amount: adjustment,
                notes: 'Initial opening account adjustment / discount (ADJ)',
                created_at: new Date().toISOString(),
              })
            }
            safeLocalStorageSet('safaeewala_client_adjustments', newEntries)
          }

          setShowModal(false)
        }}
      />

      {/* ── Client Detail Modal ── */}
      <Modal
        open={!!selected && !isEditingClient}
        onClose={() => { setSelected(null); setIsEditingClient(false); setConfirmDelete(false) }}
        title="Client Profile"
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={selected.full_name} size="lg" idx={0} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[18px] font-bold text-[#111827]">{selected.full_name}</p>
                  {isMonthlyClient(selected, dailyJobs, allMonthlySummaries) && (
                    <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded-full shadow-2xs tracking-wider uppercase">
                      Monthly
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  {selected.nationality ? `${selected.nationality} · ` : ''}Client since {formatDate(selected.created_at)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Phone',          value: selected.phone },
                { label: 'WhatsApp',       value: selected.whatsapp ?? selected.phone },
                { label: 'Email',          value: selected.email ?? '—' },
                { label: 'Area',           value: `${selected.building_name ? selected.building_name + ', ' : ''}${selected.area}` },
                { label: 'Assigned Cleaner', value: selected.preferred_cleaner || 'Unassigned' },
                { label: 'Total Bookings', value: selected.total_bookings },
                { label: 'Total Spent',    value: `AED ${selected.total_spent.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
                  <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-1">{label}</p>
                  <p className="text-[13px] font-semibold text-[#111827]">{value}</p>
                </div>
              ))}
            </div>

            {(selected.remarks || selected.access_notes) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-[10.5px] text-blue-700 uppercase tracking-[0.08em] font-semibold mb-1">Remarks / Notes</p>
                <p className="text-[13px] text-blue-700">{selected.remarks || selected.access_notes}</p>
              </div>
            )}

            {/* Initial Financial Amounts Summary */}
            {((selected.advance_amount ?? 0) > 0 || (selected.adjustment_amount ?? 0) > 0 || (selected.pending_amount ?? 0) > 0) && (
              <div className="bg-slate-50 border border-[#E4E8EC] rounded-xl p-3">
                <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-2">Initial Financial Balances</p>
                <div className="grid grid-cols-3 gap-2 text-[12px]">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-emerald-700 font-bold uppercase">Advance</p>
                    <p className="font-extrabold text-emerald-800">AED {(selected.advance_amount ?? 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-indigo-700 font-bold uppercase flex items-center justify-center gap-1">
                      <span>Adjustment</span>
                      <span className="bg-indigo-700 text-white text-[7.5px] font-black px-1 rounded">ADJ</span>
                    </p>
                    <p className="font-extrabold text-indigo-800">AED {(selected.adjustment_amount ?? 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-rose-700 font-bold uppercase">Pending</p>
                    <p className="font-extrabold text-rose-800">AED {(selected.pending_amount ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {confirmDelete ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-[13px] font-semibold text-red-700 mb-1">Delete this client?</p>
                <p className="text-[12px] text-red-600 mb-3">This will permanently remove <strong>{selected.full_name}</strong> from Supabase. This cannot be undone.</p>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <button
                    type="button"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold py-2 rounded-xl transition-colors"
                    onClick={() => {
                      deleteClient(selected!.id)
                      setSelected(null)
                      setConfirmDelete(false)
                    }}
                  >
                    Yes, Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-[12px] font-semibold hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} /> Delete
                </button>
                <Button
                  variant="outline"
                  className="flex-1"
                  size="sm"
                  onClick={() => setIsEditingClient(true)}
                >
                  Edit Profile
                </Button>
                <Button className="flex-1" size="sm" onClick={() => { setBookingClient({ name: selected!.full_name, phone: selected!.phone }); setSelected(null); setIsEditingClient(false); setShowBookingModal(true) }}>New Booking</Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Client Edit Modal (Unified No-Scroll High-Efficiency Form) ── */}
      <ClientModalForm
        open={isEditingClient && !!selected}
        onClose={() => setIsEditingClient(false)}
        initialClient={selected}
        employees={employees}
        isMonthly={isSelectedMonthly}
        onSave={patch => {
          if (selected) {
            updateClient(selected.id, patch)
            setSelected({ ...selected, ...patch })
          }
          setIsEditingClient(false)
        }}
      />

      {/* ── New Booking for Client Modal ── */}
      <Modal open={showBookingModal} onClose={() => setShowBookingModal(false)} title="New Booking" size="lg">
        <ClientBookingForm
          clientName={bookingClient?.name ?? ''}
          clientPhone={bookingClient?.phone ?? ''}
          onClose={() => setShowBookingModal(false)}
          onAdd={b => { addBooking(b); setShowBookingModal(false) }}
        />
      </Modal>
    </div>
  )
}

function ClientBookingForm({ clientName, clientPhone, onClose, onAdd }: {
  clientName: string; clientPhone: string
  onClose: () => void; onAdd: (b: any) => void
}) {
  const [selectedCrew, setSelectedCrew] = useState<string[]>([])
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState<number>(3)
  const [endTime, setEndTime] = useState(() => addHoursToTime('09:00', 3))

  // 2-Way Synchronization:
  // 1. Changing Start Time recalculates End Time keeping duration intact
  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart)
    if (newStart && duration > 0) {
      setEndTime(addHoursToTime(newStart, duration))
    }
  }

  // 2. Changing End Time automatically recalculates Duration
  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd)
    if (startTime && newEnd) {
      const calcDur = calcDurationFromTimes(startTime, newEnd)
      if (calcDur > 0) {
        setDuration(calcDur)
      }
    }
  }

  // 3. Changing Duration automatically recalculates End Time
  const handleDurationChange = (newDur: number) => {
    setDuration(newDur)
    if (startTime && newDur > 0) {
      setEndTime(addHoursToTime(startTime, newDur))
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        onAdd({
          client_id: '',
          client_name: clientName,
          client_phone: clientPhone,
          service_address: f.get('service_address') as string,
          service_type: f.get('service_type') as string,
          frequency: (f.get('frequency') as BookingFrequency) || 'once',
          scheduled_date: scheduledDate,
          scheduled_time: startTime,
          end_time: endTime,
          duration_hours: duration,
          total_amount: Number(f.get('total_amount')) || 0,
          notes: f.get('notes') as string,
          status: 'pending',
          assigned_crew: selectedCrew,
        })
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
          <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-1">Client</p>
          <p className="text-[13px] font-semibold text-[#111827]">{clientName}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
          <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-1">Phone</p>
          <p className="text-[13px] font-semibold text-[#111827]">{clientPhone}</p>
        </div>
      </div>
      <Input name="service_address" label="Service Address" placeholder="Street, unit, neighborhood" />
      <div className="grid grid-cols-2 gap-4">
        <Select name="service_type" label="Service Type">
          <option value="">Select service…</option>
          {serviceTypes.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select name="frequency" label="Frequency">
          <option value="once">One-time</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="monthly">Monthly</option>
        </Select>
      </div>

      {/* ── Start Time, End Time & Duration Row (Auto-Synced) ── */}
      <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-[#E4E8EC] space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Date *</label>
            <input
              type="date"
              name="scheduled_date"
              required
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-500 font-medium"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-[#111827] mb-1">Start Time *</label>
            <input
              type="time"
              name="scheduled_time"
              required
              value={startTime}
              onChange={e => handleStartTimeChange(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-500 font-bold text-[#111827]"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-teal-800 mb-1">End Time *</label>
            <input
              type="time"
              name="end_time"
              required
              value={endTime}
              onChange={e => handleEndTimeChange(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-500 font-bold text-teal-700"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-emerald-800 mb-1">Duration (hrs)</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              name="duration_hours"
              value={duration}
              onChange={e => handleDurationChange(parseFloat(e.target.value) || 0)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-500 font-bold text-emerald-700"
            />
          </div>
        </div>

        {/* ── Auto-calculated session summary pill ── */}
        <div className="flex items-center justify-between text-[11.5px] px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 font-medium">
          <span className="flex items-center gap-1.5">
            <Clock size={13} className="text-emerald-600" />
            <span>Shift Slot: <strong>{startTime || '—'}</strong> to <strong>{endTime || '—'}</strong></span>
          </span>
          <span className="font-extrabold text-emerald-700 bg-white px-2 py-0.5 rounded-md shadow-2xs">
            {duration} Hour{duration !== 1 ? 's' : ''} auto-synced
          </span>
        </div>
      </div>

      <Input name="total_amount" label="Total Amount (AED)" type="number" placeholder="0.00" />
      <CrewSelector selected={selectedCrew} onChange={setSelectedCrew} />
      <Textarea name="notes" label="Notes" placeholder="Access instructions, special requirements…" rows={2} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold">Create Booking</Button>
      </div>
    </form>
  )
}
