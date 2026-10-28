import { useState, useRef, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Search, Phone, MapPin, Calendar, TrendingUp, Users, Star, DollarSign,
  Heart, Award, CheckCircle, Trash2, ExternalLink, ArrowUpDown, RotateCcw, X, Filter, Clock,
  Save, Check, ChevronDown, UserCheck, Edit2, LayoutGrid, List, ChevronUp, AlertCircle, Sparkles,
  Wallet, CalendarCheck, Plus
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatDate, addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { BookingFrequency } from '@/types'
import { isMonthlyJob, jobMatchesClient, isMonthlyClient, extractMonthlyClientsFromDailyJobs, calcClientPendingBalance } from '@/lib/clientDataSync'
import { SourceOriginTag, resolveClientSource } from '@/lib/sourceTracking'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { AddMonthlyClientModalForm } from '@/components/monthlyClients/AddMonthlyClientModalForm'
import { ClientModalForm } from '@/components/clients/ClientModalForm'
import { RecordPaymentModal } from '@/components/payments/RecordPaymentModal'
import { todayDubai } from '@/lib/dubaiTime'

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
  const availableEmps = employees.filter(e => e.status !== 'inactive')
  const filtered = search
    ? availableEmps.filter(e => e.full_name.toLowerCase().includes(search.toLowerCase()))
    : availableEmps
  const selectedEmps = employees.filter(e => selected.includes(e.id))
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
          placeholder={availableEmps.length === 0 ? 'No employees available — add employees first' : 'Search and select cleaners…'}
          value={search}
          onFocus={() => setOpen(true)}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          disabled={availableEmps.length === 0}
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
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left border-b border-[#E4E8EC] last:border-0 transition-colors ${checked ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                      {checked && <span className="text-white text-[9px] font-bold">✓</span>}
                    </div>
                    <div className="truncate">
                      <p className="text-[12.5px] font-semibold text-[#111827] truncate">{emp.full_name}</p>
                      <p className="text-[10.5px] text-slate-400">{emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}</p>
                    </div>
                  </div>
                  {emp.status && emp.status !== 'active' && (
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 capitalize shrink-0 ml-2">
                      {emp.status.replace(/_/g, ' ')}
                    </span>
                  )}
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
  const [searchParams, setSearchParams] = useSearchParams()

  const initialFilter = searchParams.get('filter') || searchParams.get('type')
  const [filterType, setFilterType] = useState<'all' | 'active' | 'vip' | 'repeat' | 'monthly' | 'due' | 'inactive' | null>(
    initialFilter === 'active' || initialFilter === 'vip' || initialFilter === 'repeat' || initialFilter === 'monthly' || initialFilter === 'due' || initialFilter === 'inactive' ? initialFilter : null
  )
  const initialAgency = searchParams.get('agency') || searchParams.get('source') || ''
  const [agencyFilter, setAgencyFilter] = useState<string>(initialAgency)

  useEffect(() => {
    const f = searchParams.get('filter') || searchParams.get('type')
    if (f === 'active' || f === 'vip' || f === 'repeat' || f === 'monthly' || f === 'due' || f === 'inactive') {
      setFilterType(f)
    } else if (f === 'all') {
      setFilterType(null)
    }
    const a = searchParams.get('agency') || searchParams.get('source')
    if (a) {
      setAgencyFilter(a)
    }
  }, [searchParams])

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selected, setSelected] = useState<typeof clients[0] | null>(null)
  const [isEditingClient, setIsEditingClient] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [bookingClient, setBookingClient] = useState<{ name: string; phone: string } | null>(null)
  const [areaFilter, setAreaFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<
    'recent' | 'top_spent' | 'lowest_spent' | 'pending_due' | 'most_bookings' | 'least_bookings' | 'name' | 'name_asc' | 'name_desc' | 'recent_service' | 'oldest_client'
  >('recent')
  const [showAllCards, setShowAllCards] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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

  // Client pending balance & dues calculation
  const getClientOutstanding = (c: typeof clients[0]) => {
    const nameLower = c.full_name.toLowerCase().trim()
    const clientInvs = invoices.filter(i => i.client_id === c.id || (i.client_name && i.client_name.toLowerCase().trim() === nameLower))
    const invOutstanding = clientInvs.reduce((s, i) => s + (i.total || 0), 0) - clientInvs.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0)
    const clientPendingBalance = calcClientPendingBalance(c, dailyJobs)
    return Math.max(0, clientPendingBalance + invOutstanding)
  }

  const clientsWithDue = useMemo(() => {
    return clients.map(c => ({ client: c, due: getClientOutstanding(c) })).filter(x => x.due > 0)
  }, [clients, invoices, dailyJobs])

  const totalOutstanding = useMemo(() => {
    return clientsWithDue.reduce((sum, item) => sum + item.due, 0)
  }, [clientsWithDue])

  const totalAdvanceAmount = useMemo(() => {
    return clients.reduce((sum, c) => sum + (c.advance_amount || 0), 0)
  }, [clients])

  const totalBookingsAll = useMemo(() => {
    return clients.reduce((sum, c) => sum + (c.total_bookings || 0), 0)
  }, [clients])

  const inactiveClientsCount = useMemo(() => {
    return clients.filter(c => !c.last_service || (Date.now() - new Date(c.last_service).getTime()) > 60 * 86400000).length
  }, [clients])

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
        filterType === 'due' ? getClientOutstanding(c) > 0 :
        filterType === 'inactive' ? (!c.last_service || (Date.now() - new Date(c.last_service).getTime()) > 60 * 86400000) :
        true
      )
      const matchDate = isClientInDateRange(c)
      return matchSearch && matchArea && matchFilter && matchDate
    })

    if (sortOrder === 'top_spent') return [...base].sort((a, b) => b.total_spent - a.total_spent)
    if (sortOrder === 'lowest_spent') return [...base].sort((a, b) => a.total_spent - b.total_spent)
    if (sortOrder === 'pending_due') {
      return [...base].sort((a, b) => getClientOutstanding(b) - getClientOutstanding(a))
    }
    if (sortOrder === 'most_bookings') {
      return [...base].sort((a, b) => {
        const nameA = a.full_name.toLowerCase().trim()
        const nameB = b.full_name.toLowerCase().trim()
        const countA = Math.max(a.total_bookings || 0, bookings.filter(bk => bk.client_id === a.id || bk.client_name?.toLowerCase().trim() === nameA).length)
        const countB = Math.max(b.total_bookings || 0, bookings.filter(bk => bk.client_id === b.id || bk.client_name?.toLowerCase().trim() === nameB).length)
        return countB - countA
      })
    }
    if (sortOrder === 'least_bookings') {
      return [...base].sort((a, b) => {
        const nameA = a.full_name.toLowerCase().trim()
        const nameB = b.full_name.toLowerCase().trim()
        const countA = Math.max(a.total_bookings || 0, bookings.filter(bk => bk.client_id === a.id || bk.client_name?.toLowerCase().trim() === nameA).length)
        const countB = Math.max(b.total_bookings || 0, bookings.filter(bk => bk.client_id === b.id || bk.client_name?.toLowerCase().trim() === nameB).length)
        return countA - countB
      })
    }
    if (sortOrder === 'name' || sortOrder === 'name_asc') return [...base].sort((a, b) => a.full_name.localeCompare(b.full_name))
    if (sortOrder === 'name_desc') return [...base].sort((a, b) => b.full_name.localeCompare(a.full_name))
    if (sortOrder === 'recent_service') {
      return [...base].sort((a, b) => (b.last_service || '').localeCompare(a.last_service || ''))
    }
    if (sortOrder === 'oldest_client') {
      return [...base].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    }
    return [...base].sort((a, b) => (b.last_service || b.created_at || '').localeCompare(a.last_service || a.created_at || ''))
  })()

  interface KpiCardItem {
    label: string
    value: string | number
    sub: string
    icon: any
    iconBg: string
    iconColor: string
    delta: string
    deltaUp: boolean
    filter: any
  }

  // 6 Primary Summary Cards (Single Row)
  const primaryCards: KpiCardItem[] = [
    { label: 'Total Clients',    value: clients.length, sub: 'Registered accounts', icon: Users, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', delta: clientDeltaLabel, deltaUp: newThisMonth >= 0, filter: null },
    { label: 'Active Clients',   value: activeClients, sub: 'Recent bookings', icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: `${activeClients} active`, deltaUp: activeClients > 0, filter: 'active' },
    { label: 'Monthly Clients',  value: monthlyCount, sub: 'Recurring contracts', icon: Star, iconBg: 'bg-teal-50', iconColor: 'text-teal-600', delta: `${monthlyCount} recurring`, deltaUp: monthlyCount > 0, filter: 'monthly' },
    { label: 'Due Balance',      value: `AED ${totalOutstanding.toLocaleString()}`, sub: 'Pending collections', icon: AlertCircle, iconBg: 'bg-red-50', iconColor: 'text-red-600', delta: `${clientsWithDue.length} owe`, deltaUp: false, filter: 'due' },
    { label: 'VIP Clients',      value: vipClients, sub: 'AED 2k+ spend', icon: Award, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', delta: vipClients > 0 ? `${vipClients} VIP` : '0 VIP', deltaUp: vipClients > 0, filter: 'vip' },
    { label: 'Repeat Rate',      value: `${repeatRate}%`, sub: '2+ service visits', icon: Heart, iconBg: 'bg-pink-50', iconColor: 'text-pink-600', delta: `${repeatClients} repeat`, deltaUp: repeatRate > 0, filter: 'repeat' },
  ]

  // 6 Secondary Cards (Expandable on clicking blinking arrow)
  const secondaryCards: KpiCardItem[] = [
    { label: 'Total Revenue',    value: `AED ${(totalSpent / 1000).toFixed(1)}k`, sub: `AED ${totalSpent.toLocaleString()} lifetime`, icon: CheckCircle, iconBg: 'bg-purple-50', iconColor: 'text-purple-600', delta: 'All time', deltaUp: true, filter: null },
    { label: 'Avg Lifetime',     value: `AED ${avgLtv.toLocaleString()}`, sub: 'Per client average', icon: DollarSign, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600', delta: 'Per Client', deltaUp: true, filter: null },
    { label: 'New This Month',   value: newThisMonth, sub: 'Joined this month', icon: Sparkles, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600', delta: clientDeltaLabel, deltaUp: newThisMonth >= newLastMonth, filter: null },
    { label: 'At-Risk (>60d)',   value: inactiveClientsCount, sub: 'No visits in 60+ days', icon: Clock, iconBg: 'bg-orange-50', iconColor: 'text-orange-600', delta: `${inactiveClientsCount} dormant`, deltaUp: false, filter: 'inactive' },
    { label: 'Total Bookings',   value: totalBookingsAll, sub: 'Completed visits', icon: CalendarCheck, iconBg: 'bg-sky-50', iconColor: 'text-sky-600', delta: 'All records', deltaUp: true, filter: null },
    { label: 'Advance Balance',  value: `AED ${totalAdvanceAmount.toLocaleString()}`, sub: 'Client credits / deposits', icon: Wallet, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: 'Deposits', deltaUp: true, filter: null },
  ]

  const renderCard = (card: KpiCardItem) => {
    const isSelected = filterType === card.filter && card.filter !== null
    return (
      <button
        key={card.label}
        type="button"
        onClick={() => {
          if (card.filter !== null) {
            setFilterType(isSelected ? null : (card.filter as any))
          }
        }}
        className={`text-left bg-white rounded-[22px] border-2 shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 sm:p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all cursor-pointer flex flex-col justify-between ${
          isSelected
            ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20'
            : 'border-[#E4E8EC] hover:border-emerald-200'
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className={`w-9 h-9 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>
            <card.icon size={17} className={card.iconColor} />
          </div>
          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full truncate shrink-0 ${card.deltaUp ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            {card.delta}
          </span>
        </div>
        <p className="text-[21px] sm:text-[22px] font-black text-[#111827] tracking-tight leading-tight truncate">{card.value}</p>
        <p className="text-[12px] font-bold text-slate-800 mt-1 truncate">{card.label}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{card.sub}</p>
      </button>
    )
  }

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

  const renderOutstandingDuesWidget = () => (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-bold text-[#111827]">Pending Balances</h3>
          <p className="text-[11px] text-slate-400">Clients with unpaid dues</p>
        </div>
        <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">
          {clientsWithDue.length} Client{clientsWithDue.length !== 1 ? 's' : ''}
        </span>
      </div>
      {clientsWithDue.length === 0 ? (
        <div className="py-8 text-center text-slate-400 my-auto">
          <CheckCircle size={28} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-[12px] font-semibold text-slate-700">All Accounts Settled</p>
          <p className="text-[11px] text-slate-400">Zero pending client balances</p>
        </div>
      ) : (
        <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[280px] pr-1">
          {clientsWithDue
            .sort((a, b) => b.due - a.due)
            .slice(0, 5)
            .map(({ client: c, due }, idx) => {
              const cleanPhone = (c.whatsapp || c.phone || '').replace(/[^0-9]/g, '')
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={c.full_name} size="sm" idx={idx} />
                    <div className="min-w-0">
                      <Link to={`/clients/${c.id}`} className="text-[12.5px] font-bold text-[#111827] hover:text-emerald-700 truncate block">
                        {c.full_name}
                      </Link>
                      <p className="text-[11px] text-slate-400 truncate">
                        {c.area || c.city || 'Dubai'} · {c.phone}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[12px] font-extrabold text-red-600 bg-red-50 border border-red-200/80 px-2 py-0.5 rounded-lg block">
                      AED {due.toLocaleString()}
                    </span>
                    {cleanPhone && (
                      <a
                        href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Dear ${c.full_name}, this is a gentle reminder from Safaeewala regarding your pending balance of AED ${due.toLocaleString()}. Please let us know if you need any assistance.`)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center gap-1 mt-0.5"
                      >
                        <Phone size={10} />
                        <span>Remind WA</span>
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      )}
      {clientsWithDue.length > 5 && (
        <button
          type="button"
          onClick={() => setFilterType('due')}
          className="mt-3 pt-2 border-t border-slate-100 text-[11.5px] font-bold text-emerald-600 hover:text-emerald-700 text-center w-full block transition-colors cursor-pointer"
        >
          View all {clientsWithDue.length} clients with due balance →
        </button>
      )}
    </div>
  )

  const renderClientRetentionWidget = () => {
    const total = clients.length || 1
    const singleVisit = clients.filter(c => (c.total_bookings || 0) <= 1).length
    const segments = [
      { label: 'Monthly Recurring', count: monthlyCount, pct: Math.round((monthlyCount / total) * 100), color: 'bg-teal-500' },
      { label: 'Repeat Regulars (2+)', count: repeatClients, pct: Math.round((repeatClients / total) * 100), color: 'bg-emerald-500' },
      { label: 'VIP Clients (2k+)', count: vipClients, pct: Math.round((vipClients / total) * 100), color: 'bg-amber-500' },
      { label: 'Single-Visit / New', count: singleVisit, pct: Math.round((singleVisit / total) * 100), color: 'bg-blue-400' },
    ]

    return (
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-bold text-[#111827]">Client Distribution</h3>
            <p className="text-[11px] text-slate-400">Portfolio breakdown & retention</p>
          </div>
          <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            {repeatRate}% Retention
          </span>
        </div>

        {/* Stacked multi-color distribution bar */}
        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex mb-4">
          {segments.map((seg, idx) => (
            <div
              key={idx}
              className={`${seg.color} h-full transition-all duration-300`}
              style={{ width: `${seg.pct}%` }}
              title={`${seg.label}: ${seg.count} (${seg.pct}%)`}
            />
          ))}
        </div>

        <div className="space-y-2.5 flex-1">
          {segments.map((seg, idx) => (
            <div key={idx} className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${seg.color} shrink-0`} />
                <span className="font-medium text-slate-700 truncate">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-slate-400 text-[11px]">{seg.pct}%</span>
                <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                  {seg.count}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Active in 2026: <strong className="text-slate-800">{activeClients}</strong></span>
          <span>At-Risk / Dormant: <strong className="text-orange-600">{inactiveClientsCount}</strong></span>
        </div>
      </div>
    )
  }

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
              const invOutstanding = clientInvs.reduce((s, i) => s + i.total, 0) - clientInvs.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
              const clientPendingBalance = calcClientPendingBalance(c, dailyJobs)
              const outstanding = clientPendingBalance + invOutstanding
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
        showSearch={false}
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="h-11 px-5 rounded-2xl bg-white text-emerald-700 font-bold text-sm shadow-lg hover:bg-emerald-50 transition-colors shrink-0 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Add Client</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPaymentModal(true)}
              className="h-11 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg transition-colors shrink-0 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Wallet size={15} />
              <span>Add Payment</span>
            </button>
          </div>
        }
      />

      {/* ── KPI Summary Cards: Single Row of 6 Cards ── */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {primaryCards.map(renderCard)}
        </div>

        {/* ── Light-colored Blinking Arrow Button for expanding more cards ── */}
        <div className="flex justify-center pt-0.5">
          <button
            type="button"
            onClick={() => setShowAllCards(prev => !prev)}
            className="group inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100/90 text-slate-600 hover:text-slate-900 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer text-[12px] font-semibold"
            title={showAllCards ? "Collapse extra metrics" : "Show more client metrics"}
          >
            <span>{showAllCards ? "Collapse Metrics" : `More Client Metrics (${secondaryCards.length})`}</span>
            <span className="relative flex items-center justify-center w-5 h-5 rounded-full bg-slate-200/70 group-hover:bg-slate-300/80 text-slate-700 transition-colors">
              {!showAllCards && (
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
              )}
              {showAllCards ? (
                <ChevronUp size={13} className="transition-transform" />
              ) : (
                <ChevronDown size={13} className="animate-bounce transition-transform" />
              )}
            </span>
          </button>
        </div>

        {/* ── Expanded Drawer: Secondary Row of 6 cards ── */}
        {showAllCards && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5 animate-in fade-in slide-in-from-top-2 duration-300">
            {secondaryCards.map(renderCard)}
          </div>
        )}
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
              onChange={e => setSortOrder(e.target.value as any)}
              className="text-[13px] pl-3.5 pr-8 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 text-slate-700 font-medium cursor-pointer appearance-none transition-colors"
            >
              <option value="recent">Sort by: Recently Active</option>
              <option value="top_spent">Sort by: Highest Spent (AED ↓)</option>
              <option value="lowest_spent">Sort by: Lowest Spent (AED ↑)</option>
              <option value="pending_due">Sort by: Highest Due Balance (AED ↓)</option>
              <option value="most_bookings">Sort by: Most Bookings / Visits</option>
              <option value="least_bookings">Sort by: Fewest Bookings</option>
              <option value="name_asc">Sort by: Name (A → Z)</option>
              <option value="name_desc">Sort by: Name (Z → A)</option>
              <option value="recent_service">Sort by: Last Service Date</option>
              <option value="oldest_client">Sort by: Oldest Joined</option>
            </select>
            <ArrowUpDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Reset button if active */}
          {(search || areaFilter !== 'all' || sortOrder !== 'recent' || datePreset !== 'all' || filterType || agencyFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setAreaFilter('all')
                setSortOrder('recent')
                setDatePreset('all')
                setFilterType(null)
                setAgencyFilter('')
                setCustomStartDate('')
                setCustomEndDate('')
                setSearchParams({}, { replace: true })
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

      {/* ── Active Agency / Safaeewala Filter Banner ── */}
      {(agencyFilter === 'safaeewala' || (filterType === 'active' && agencyFilter)) && (
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50/60 border border-teal-200/90 rounded-2xl text-[12.5px] text-teal-950 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs shadow-teal-600/30">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="font-extrabold text-teal-950 leading-tight">
                🏢 Filtered: Showing Safaeewala Active Clients
              </p>
              <p className="text-[11.5px] text-teal-700 font-medium mt-0.5">
                Displaying {filtered.length} active client{filtered.length !== 1 ? 's' : ''} in the Safaeewala master portfolio.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilterType(null)
              setAgencyFilter('')
              setSearchParams({}, { replace: true })
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-teal-100 border border-teal-200 text-teal-900 font-bold text-[11.5px] transition-colors cursor-pointer shadow-2xs shrink-0"
          >
            <X size={13} />
            <span>Show All Clients</span>
          </button>
        </div>
      )}

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

          {/* ── Widgets Underneath Datatable (Responsive Grid) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {renderTopClientsWidget()}
            {renderOutstandingDuesWidget()}
            {renderClientRetentionWidget()}
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
                  const invOutstanding = clientInvs.reduce((s, i) => s + i.total, 0) - clientInvs.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
                  const clientPendingBalance = calcClientPendingBalance(c, dailyJobs)
                  const outstanding  = clientPendingBalance + invOutstanding
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
          {renderOutstandingDuesWidget()}
          {renderClientRetentionWidget()}
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
            const todayStr = todayDubai()
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
                { label: 'Phone',          value: selected.phone || 'Not recorded' },
                { label: 'WhatsApp',       value: selected.whatsapp || selected.phone || 'Not recorded' },
                { label: 'Email',          value: selected.email || '—' },
                { label: 'Address',        value: [selected.apartment ? `Apt ${selected.apartment}` : '', selected.building_name, selected.area, selected.city].filter(Boolean).join(', ') || '—' },
                { label: 'Assigned Cleaner', value: selected.preferred_cleaner || 'Unassigned' },
                { label: 'Source',         value: selected.source ? selected.source.replace(/_/g, ' ') : '—' },
                { label: 'Total Services', value: selected.total_bookings },
                { label: 'Last Service',   value: selected.last_service ? formatDate(selected.last_service) : '—' },
                { label: 'Total Billed',   value: `AED ${selected.total_spent.toLocaleString()}` },
                { label: 'Current Pending Balance', value: `AED ${calcClientPendingBalance(selected, dailyJobs).toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
                  <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-1">{label}</p>
                  <p className="text-[13px] font-semibold text-[#111827]">{value}</p>
                </div>
              ))}
            </div>

            {/* Recurring schedule (Monthly Clients master contract — read only here) */}
            {((selected.service_days?.length ?? 0) > 0 || selected.scheduled_time || selected.day_cleaner_assignments) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-[10.5px] text-emerald-700 uppercase tracking-[0.08em] font-semibold mb-1">Service Schedule</p>
                <p className="text-[13px] font-semibold text-emerald-900">
                  {(selected.service_days?.length ?? 0) > 0 ? selected.service_days!.join(', ') : 'Days not set'}
                  {selected.scheduled_time ? ` · ${selected.scheduled_time}${selected.end_time ? `–${selected.end_time}` : ''}` : ''}
                  {selected.duration_hours ? ` · ${selected.duration_hours}h` : ''}
                </p>
                {selected.day_cleaner_assignments && Object.keys(selected.day_cleaner_assignments).length > 0 && (
                  <p className="text-[12px] text-emerald-800 mt-1">
                    {Object.entries(selected.day_cleaner_assignments).map(([day, cleaner]) => `${day}: ${cleaner}`).join(' · ')}
                  </p>
                )}
              </div>
            )}

            {(selected.remarks || selected.notes || selected.access_notes || selected.pet_info) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1">
                <p className="text-[10.5px] text-blue-700 uppercase tracking-[0.08em] font-semibold">Remarks / Notes</p>
                {/* Show each field once — the add form may copy the same text into several */}
                {Array.from(new Set([selected.remarks, selected.notes, selected.access_notes].map(t => (t || '').trim()).filter(Boolean))).map(t => (
                  <p key={t} className="text-[13px] text-blue-700">{t}</p>
                ))}
                {selected.pet_info && <p className="text-[13px] text-blue-700">Pets: {selected.pet_info}</p>}
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

      {/* ── Add Payment Modal (Unified with Client Suggestions & Global Sync) ── */}
      <RecordPaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
      />
    </div>
  )
}

function ClientBookingForm({ clientName, clientPhone, onClose, onAdd }: {
  clientName: string; clientPhone: string
  onClose: () => void; onAdd: (b: any) => void
}) {
  const [selectedCrew, setSelectedCrew] = useState<string[]>([])
  const [scheduledDate, setScheduledDate] = useState(() => todayDubai())
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
