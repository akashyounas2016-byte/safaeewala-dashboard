import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Search, Phone, MapPin, Calendar,
  Users, TrendingUp, DollarSign, Star, Clock, ExternalLink,
  Trash2, ShieldCheck, CheckCircle, AlertCircle, FileText, Layers,
  ChevronDown, RotateCw, Plus, Edit2, Save, X, Power,
  Briefcase, CreditCard, CheckCircle2, PauseCircle, PlayCircle,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatDate } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { BookingFrequency, DailyJob, RecurringContract } from '@/types'
import {
  extractMonthlyClientsFromDailyJobs,
  calcJobOTHours,
  type MonthlyClientSummary,
} from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'

export type MonthlyDatePreset =
  | 'today'
  | '7days'
  | '14days'
  | '28days'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | '2_years_ago'
  | 'all_time'
  | 'custom'

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const parts = dateStr.split('-').map(Number)
    if (parts.length === 3) {
      const [y, m, d] = parts
      const date = new Date(y, m - 1, d)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    return dateStr
  } catch {
    return dateStr
  }
}

const serviceTypes = [
  'Standard Clean', 'Deep Clean', 'Move-in', 'Move-out',
  'Commercial', 'Post-construction', 'Office', 'Carpet', 'Window',
  'Weekly Villa Cleaning', 'Bi-weekly Office Cleaning', 'Monthly Deep Clean',
]

const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72' },
  { bg: '#fce4d6', text: '#c66a3a' },
  { bg: '#e4dff5', text: '#6b5bb5' },
  { bg: '#d6e7f5', text: '#3a7ab8' },
  { bg: '#fcecc8', text: '#a8842a' },
]

function Avatar({ name, size = 'md', idx = 0 }: { name: string; size?: 'sm' | 'md' | 'lg'; idx?: number }) {
  const parts = name.trim().split(' ')
  const init = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'MC'
  const dims = size === 'lg' ? 'w-14 h-14 text-[16px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-[13px]'
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0 shadow-xs`} style={{ background: color.bg, color: color.text }}>
      {init}
    </div>
  )
}

const defaultContracts: RecurringContract[] = [
  {
    id: '1',
    clientName: 'Ahmed Al Mansoori',
    clientEmail: 'ahmed@example.com',
    clientPhone: '+971 50 123 4567',
    serviceType: 'Weekly Villa Cleaning',
    frequency: 'weekly',
    amount: 300,
    startDate: '2025-12-15',
    renewalDate: '2026-12-15',
    status: 'active',
    lastBilled: '2026-06-07',
    nextBillingDate: '2026-06-14',
  },
  {
    id: '2',
    clientName: 'Fatima Al Mazrouei',
    clientEmail: 'fatima@example.com',
    clientPhone: '+971 52 987 6543',
    serviceType: 'Bi-weekly Office Cleaning',
    frequency: 'biweekly',
    amount: 1200,
    startDate: '2026-01-10',
    renewalDate: '2027-01-10',
    status: 'active',
    lastBilled: '2026-06-05',
    nextBillingDate: '2026-06-19',
  },
  {
    id: '3',
    clientName: 'Mohammed Al Ketbi',
    clientEmail: 'mohammed@example.com',
    clientPhone: '+971 55 456 7890',
    serviceType: 'Monthly Deep Clean',
    frequency: 'monthly',
    amount: 500,
    startDate: '2026-03-01',
    renewalDate: '2027-03-01',
    status: 'paused',
    lastBilled: '2026-06-01',
    nextBillingDate: '2026-07-01',
  },
]

const frequencyLabels: Record<RecurringContract['frequency'], string> = {
  weekly: 'Every Week',
  biweekly: 'Every 2 Weeks',
  monthly: 'Every Month',
}

const frequencyDays: Record<RecurringContract['frequency'], number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
}

export function MonthlyClients() {
  const { clients, dailyJobs, addClient, addBooking } = useData()

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<'clients' | 'contracts' | 'recruitment'>('clients')

  // ── Date Preset Filters for Monthly Clients ──
  const [datePreset, setDatePreset]           = useState<MonthlyDatePreset>('28days')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate]     = useState<string>('')
  const [showRangeDropdown, setShowRangeDropdown] = useState(false)
  const [selectedMonth, setSelectedMonth]     = useState(new Date())

  // ── Search & Filters for Monthly Clients ──
  const [search, setSearch]               = useState('')
  const [areaFilter, setAreaFilter]       = useState('all')
  const [sortOrder, setSortOrder]         = useState<'top_charges' | 'top_ot' | 'visits' | 'name'>('top_charges')
  const [selectedSummary, setSelectedSummary] = useState<MonthlyClientSummary | null>(null)
  const [showModal, setShowModal]         = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [bookingClient, setBookingClient] = useState<{ name: string; phone: string } | null>(null)

  // ── Recurring Contracts State (from Subscriptions) ──
  const [contracts, setContracts] = useState<RecurringContract[]>(() => {
    return safeLocalStorageGet('safaeewala_recurring_contracts', defaultContracts)
  })

  useEffect(() => {
    safeLocalStorageSet('safaeewala_recurring_contracts', contracts)
  }, [contracts])

  const [contractSearch, setContractSearch] = useState('')
  const [contractStatusFilter, setContractStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [showContractModal, setShowContractModal] = useState(false)
  const [editingContractId, setEditingContractId] = useState<string | null>(null)
  const [clientSearchDropdown, setClientSearchDropdown] = useState(false)
  const [contractForm, setContractForm] = useState<RecurringContract>({
    id: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    serviceType: '',
    frequency: 'weekly',
    amount: 0,
    startDate: new Date().toISOString().split('T')[0],
    renewalDate: '',
    status: 'active',
    lastBilled: new Date().toISOString().split('T')[0],
    nextBillingDate: '',
    notes: '',
  })

  const currentYear = new Date().getFullYear()
  const lastYear = currentYear - 1
  const twoYearsAgo = currentYear - 2

  const activeRange = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    if (datePreset === 'today') {
      return {
        start: todayStr,
        end: todayStr,
        label: 'Today',
        sub: formatDisplayDate(todayStr),
        isAllTime: false,
      }
    }
    if (datePreset === '7days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      const start = d.toISOString().split('T')[0]
      return {
        start,
        end: todayStr,
        label: 'Last 7 Days',
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(todayStr)}`,
        isAllTime: false,
      }
    }
    if (datePreset === '14days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 13)
      const start = d.toISOString().split('T')[0]
      return {
        start,
        end: todayStr,
        label: 'Last 14 Days',
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(todayStr)}`,
        isAllTime: false,
      }
    }
    if (datePreset === '28days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 27)
      const start = d.toISOString().split('T')[0]
      return {
        start,
        end: todayStr,
        label: 'Last 28 Days',
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(todayStr)}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'this_month') {
      const y = selectedMonth.getFullYear()
      const m = String(selectedMonth.getMonth() + 1).padStart(2, '0')
      const lastDay = new Date(y, selectedMonth.getMonth() + 1, 0).getDate()
      const start = `${y}-${m}-01`
      const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
      const mName = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      return {
        start,
        end,
        label: `Month: ${mName}`,
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'last_month') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const y = prev.getFullYear()
      const m = String(prev.getMonth() + 1).padStart(2, '0')
      const lastDay = new Date(y, prev.getMonth() + 1, 0).getDate()
      const start = `${y}-${m}-01`
      const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
      const mName = prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      return {
        start,
        end,
        label: `Last Month (${mName})`,
        sub: `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'this_year') {
      return {
        start: `${currentYear}-01-01`,
        end: `${currentYear}-12-31`,
        label: `This Year (${currentYear})`,
        sub: `Jan 01, ${currentYear} – Dec 31, ${currentYear}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'last_year') {
      return {
        start: `${lastYear}-01-01`,
        end: `${lastYear}-12-31`,
        label: `Last Year (${lastYear})`,
        sub: `Jan 01, ${lastYear} – Dec 31, ${lastYear}`,
        isAllTime: false,
      }
    }
    if (datePreset === '2_years_ago') {
      return {
        start: `${twoYearsAgo}-01-01`,
        end: `${twoYearsAgo}-12-31`,
        label: `2 Years Ago (${twoYearsAgo})`,
        sub: `Jan 01, ${twoYearsAgo} – Dec 31, ${twoYearsAgo}`,
        isAllTime: false,
      }
    }
    if (datePreset === 'custom') {
      return {
        start: customStartDate,
        end: customEndDate,
        label: 'Custom Range',
        sub: customStartDate && customEndDate
          ? `${formatDisplayDate(customStartDate)} – ${formatDisplayDate(customEndDate)}`
          : 'Pick custom start & end date',
        isAllTime: false,
      }
    }
    // all_time
    return {
      start: '',
      end: '',
      label: 'All-Time Records',
      sub: 'All monthly client entries recorded in Daily Job Sheet',
      isAllTime: true,
    }
  }, [datePreset, selectedMonth, customStartDate, customEndDate, currentYear, lastYear, twoYearsAgo])

  // Extract Monthly Clients directly from Daily Job Sheet
  const monthlySummaries = useMemo(() => {
    if (activeRange.isAllTime) {
      return extractMonthlyClientsFromDailyJobs(dailyJobs, 'all', clients)
    }
    return extractMonthlyClientsFromDailyJobs(
      dailyJobs,
      { start: activeRange.start, end: activeRange.end },
      clients
    )
  }, [dailyJobs, activeRange, clients])

  // Monthly Clients KPIs
  const totalMonthlyCharges = useMemo(() => {
    return monthlySummaries.reduce((s, c) => s + c.totalCharges, 0)
  }, [monthlySummaries])

  const totalMonthlyReceived = useMemo(() => {
    return monthlySummaries.reduce((s, c) => s + c.totalReceived, 0)
  }, [monthlySummaries])

  const totalOTHours = useMemo(() => {
    const sum = monthlySummaries.reduce((s, c) => s + c.totalOTHours, 0)
    return Math.round(sum * 10) / 10
  }, [monthlySummaries])

  const totalDutyHours = useMemo(() => {
    const sum = monthlySummaries.reduce((s, c) => s + c.totalDutyHours, 0)
    return Math.round(sum * 10) / 10
  }, [monthlySummaries])

  const totalVisits = useMemo(() => {
    return monthlySummaries.reduce((s, c) => s + c.visitsCount, 0)
  }, [monthlySummaries])

  // Recurring Contracts KPIs (from Subscriptions)
  const activeContracts = useMemo(() => contracts.filter(c => c.status === 'active'), [contracts])
  const pausedContracts = useMemo(() => contracts.filter(c => c.status === 'paused'), [contracts])

  const monthlyRecurringRevenue = useMemo(() => {
    return activeContracts.reduce((sum, c) => {
      const monthly = c.frequency === 'weekly' ? c.amount * 4.33 : c.frequency === 'biweekly' ? c.amount * 2.17 : c.amount
      return sum + monthly
    }, 0)
  }, [activeContracts])

  const annualContractValue = useMemo(() => Math.round(monthlyRecurringRevenue * 12), [monthlyRecurringRevenue])

  const nextBillingTotal = useMemo(() => {
    const next7Days = new Date(Date.now() + 7 * 86400000)
    return activeContracts
      .filter(c => c.nextBillingDate && new Date(c.nextBillingDate) <= next7Days)
      .reduce((sum, c) => sum + c.amount, 0)
  }, [activeContracts])

  // Lookup map: check if client has recurring contract
  const contractsByClientName = useMemo(() => {
    const map = new Map<string, RecurringContract>()
    for (const c of contracts) {
      if (c.status === 'active') {
        map.set(c.clientName.toLowerCase().trim(), c)
      }
    }
    return map
  }, [contracts])

  // Distinct areas for filter dropdown
  const areas = useMemo(() => {
    return Array.from(new Set(monthlySummaries.map(c => c.area).filter(Boolean))).sort()
  }, [monthlySummaries])

  // Filtered & Sorted Monthly Clients
  const filteredSummaries = useMemo(() => {
    const base = monthlySummaries.filter(c => {
      const q = search.toLowerCase().trim()
      const matchSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        c.rawAddress.toLowerCase().includes(q) ||
        c.area.toLowerCase().includes(q) ||
        c.cleaners.some(cl => cl.toLowerCase().includes(q))
      const matchArea = areaFilter === 'all' || c.area === areaFilter
      return matchSearch && matchArea
    })

    if (sortOrder === 'top_charges') return [...base].sort((a, b) => b.totalCharges - a.totalCharges)
    if (sortOrder === 'top_ot')      return [...base].sort((a, b) => b.totalOTHours - a.totalOTHours)
    if (sortOrder === 'name')        return [...base].sort((a, b) => a.name.localeCompare(b.name))
    return [...base].sort((a, b) => b.visitsCount - a.visitsCount)
  }, [monthlySummaries, search, areaFilter, sortOrder])

  // Filtered Contracts
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      const q = contractSearch.toLowerCase().trim()
      const matchSearch = !q ||
        c.clientName.toLowerCase().includes(q) ||
        (c.clientEmail && c.clientEmail.toLowerCase().includes(q)) ||
        c.serviceType.toLowerCase().includes(q)
      const matchStatus = contractStatusFilter === 'all' || c.status === contractStatusFilter
      return matchSearch && matchStatus
    })
  }, [contracts, contractSearch, contractStatusFilter])

  // Top Spenders & OT Leaders for right sidebar
  const topClientsByCharges = useMemo(() => {
    return [...monthlySummaries].sort((a, b) => b.totalCharges - a.totalCharges).slice(0, 5)
  }, [monthlySummaries])

  const topClientsByOT = useMemo(() => {
    return [...monthlySummaries].filter(c => c.totalOTHours > 0).sort((a, b) => b.totalOTHours - a.totalOTHours).slice(0, 5)
  }, [monthlySummaries])

  const areaCounts = useMemo(() => {
    return monthlySummaries.reduce((acc, c) => {
      const a = c.area || 'Dubai'
      acc[a] = (acc[a] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }, [monthlySummaries])

  // Contract Handlers
  const handleAddContract = (prefillName?: string, prefillPhone?: string, prefillEmail?: string) => {
    const today = new Date().toISOString().split('T')[0]
    const nextBilling = new Date()
    nextBilling.setDate(nextBilling.getDate() + 7)
    const startDate = new Date()
    const renewal = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate())

    setContractForm({
      id: Date.now().toString(),
      clientName: prefillName || '',
      clientEmail: prefillEmail || '',
      clientPhone: prefillPhone || '',
      serviceType: 'Weekly Villa Cleaning',
      frequency: 'weekly',
      amount: 350,
      startDate: today,
      renewalDate: renewal.toISOString().split('T')[0],
      status: 'active',
      lastBilled: today,
      nextBillingDate: nextBilling.toISOString().split('T')[0],
      notes: '',
    })
    setEditingContractId(null)
    setShowContractModal(true)
  }

  const handleEditContract = (c: RecurringContract) => {
    setContractForm({ ...c })
    setEditingContractId(c.id)
    setShowContractModal(true)
  }

  const handleSaveContract = () => {
    if (!contractForm.clientName || !contractForm.serviceType || contractForm.amount <= 0) {
      alert('Please fill client name, service type, and amount.')
      return
    }

    const startDate = new Date(contractForm.startDate || new Date())
    const renewalDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate())

    const updated: RecurringContract = {
      ...contractForm,
      renewalDate: renewalDate.toISOString().split('T')[0],
      nextBillingDate: contractForm.nextBillingDate || new Date(startDate.getTime() + frequencyDays[contractForm.frequency] * 86400000).toISOString().split('T')[0],
    }

    if (editingContractId) {
      setContracts(prev => prev.map(c => c.id === editingContractId ? updated : c))
    } else {
      setContracts(prev => [updated, ...prev])
    }
    setShowContractModal(false)
  }

  const handleDeleteContract = (id: string) => {
    if (confirm('Are you sure you want to delete this contract?')) {
      setContracts(prev => prev.filter(c => c.id !== id))
    }
  }

  const handleToggleContractStatus = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active'
    setContracts(prev =>
      prev.map(c => c.id === id ? { ...c, status: newStatus as 'active' | 'paused' } : c)
    )
  }

  // Client suggestions for contract form
  const clientSuggestions = useMemo(() => {
    if (!contractForm.clientName || contractForm.clientName.trim().length < 1) return []
    const q = contractForm.clientName.toLowerCase()
    return clients.filter(c => c.full_name.toLowerCase().includes(q)).slice(0, 5)
  }, [clients, contractForm.clientName])

  return (
    <div className="space-y-6">
      {/* Page Hero with Unified Summary */}
      <PageHero
        title="Monthly Clients & Contracts"
        subtitle={`${monthlySummaries.length} Monthly Clients · ${activeContracts.length} Active Contracts · MRR AED ${Math.round(monthlyRecurringRevenue).toLocaleString()}`}
        statusChip={`${activeRange.label} · ${totalOTHours}h OT · ${totalVisits} Shifts`}
        actionLabel="+ New Contract"
        onAction={() => handleAddContract()}
        showSearch={false}
      />

      {/* Unified Executive KPI Cards (Merged from Subscriptions & Monthly Clients) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Monthly Clients */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-purple-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Monthly Clients</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <div>
            <p className="text-[24px] font-extrabold text-[#111827]">{monthlySummaries.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{totalVisits} shifts ({activeRange.label})</p>
          </div>
        </div>

        {/* Card 2: Active Contracts */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Contracts</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <RotateCw size={16} />
            </div>
          </div>
          <div>
            <p className="text-[24px] font-extrabold text-emerald-600">{activeContracts.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{contracts.length} total · {pausedContracts.length} paused</p>
          </div>
        </div>

        {/* Card 3: Monthly Recurring Revenue (MRR) */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-blue-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Contract MRR</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-blue-900">AED {Math.round(monthlyRecurringRevenue).toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Annual: AED {annualContractValue.toLocaleString()}</p>
          </div>
        </div>

        {/* Card 4: Daily Job Sheet Monthly Charges */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-teal-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Billed Charges</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <DollarSign size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-teal-900">AED {totalMonthlyCharges.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{totalMonthlyReceived > 0 ? `AED ${totalMonthlyReceived.toLocaleString()} received` : 'From Job Sheet'}</p>
          </div>
        </div>

        {/* Card 5: Next 7 Days Billing Due */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Next 7 Days Due</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Calendar size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-amber-900">AED {nextBillingTotal.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Auto-billing renewals</p>
          </div>
        </div>

        {/* Card 6: Overtime (OT) Logged */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-rose-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Overtime (OT)</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-rose-900">{totalOTHours} hrs</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{totalDutyHours}h duty · {monthlySummaries.filter(c => c.totalOTHours > 0).length} OT clients</p>
          </div>
        </div>
      </div>

      {/* Segmented View Tabs & Action Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white p-2 rounded-2xl border border-[#E4E8EC] shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveTab('clients')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'clients'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users size={15} />
            <span>Monthly Service Clients</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'clients' ? 'bg-purple-700/60 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {monthlySummaries.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('contracts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'contracts'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <RotateCw size={15} />
            <span>Recurring Contracts & Subscriptions</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'contracts' ? 'bg-emerald-700/60 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
              {activeContracts.length} Active
            </span>
          </button>

          <button
            onClick={() => setActiveTab('recruitment')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'recruitment'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Briefcase size={15} />
            <span>Recruitment & Coverage</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowModal(true)}
            className="text-[12px] h-9 px-3.5"
          >
            <Plus size={14} className="mr-1" /> Add Client
          </Button>
          <Button
            onClick={() => handleAddContract()}
            className="text-[12px] h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus size={14} className="mr-1" /> New Contract
          </Button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TAB 1: MONTHLY SERVICE CLIENTS (From Daily Job Sheet)
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'clients' && (
        <div className="space-y-6">
          {/* Date Range Filter Bar with Quick Pills and Dropdown Presets */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex items-center justify-between flex-wrap gap-3">
            {/* Left: Active Date Range Display & Month Stepper */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Calendar size={18} />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[17px] font-extrabold text-[#111827]">
                    {activeRange.label}
                  </h2>
                  <span className="text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    {monthlySummaries.length} {monthlySummaries.length === 1 ? 'Client' : 'Clients'}
                  </span>
                </div>
                <p className="text-[11.5px] text-slate-400 mt-0.5 font-medium">
                  {activeRange.sub}
                </p>
              </div>

              {datePreset === 'this_month' && (
                <div className="flex items-center gap-1 ml-2 pl-3 border-l border-slate-200">
                  <button
                    onClick={() => {
                      const d = new Date(selectedMonth)
                      d.setMonth(d.getMonth() - 1)
                      setSelectedMonth(d)
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                    title="Previous Month"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date(selectedMonth)
                      d.setMonth(d.getMonth() + 1)
                      setSelectedMonth(d)
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                    title="Next Month"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Right: Quick Pills + More Filters Dropdown */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-[#E4E8EC] gap-0.5 text-[11.5px] font-bold">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: '7days', label: 'Last 7 Days' },
                    { id: '14days', label: 'Last 14 Days' },
                    { id: '28days', label: 'Last 28 Days' },
                    { id: 'this_month', label: 'This Month' },
                    { id: 'this_year', label: `${currentYear}` },
                    { id: 'last_year', label: `${lastYear}` },
                  ] as const
                ).map(preset => {
                  const isSelected = datePreset === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setDatePreset(preset.id)}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                      }`}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>

              {/* More Presets & Custom Dropdown Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowRangeDropdown(p => !p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer ${
                    showRangeDropdown || datePreset === '2_years_ago' || datePreset === 'all_time' || datePreset === 'custom' || datePreset === 'last_month'
                      ? 'border-purple-500 bg-purple-50 text-purple-900 shadow-xs'
                      : 'border-[#E4E8EC] bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                  title="All Date Range Options"
                >
                  <Calendar size={13} className="text-purple-600" />
                  <span>More Filters</span>
                  <ChevronDown size={13} className="text-slate-400" />
                </button>

                {showRangeDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowRangeDropdown(false)} />
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#E4E8EC] rounded-2xl shadow-2xl z-50 p-4 animate-in fade-in zoom-in-95">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E4E8EC]">
                        <span className="text-[12px] font-bold text-slate-800">Select Date Range</span>
                        <button
                          onClick={() => {
                            setDatePreset('28days')
                            setShowRangeDropdown(false)
                          }}
                          className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 hover:underline cursor-pointer"
                        >
                          Reset (28 Days)
                        </button>
                      </div>

                      <div className="mb-2">
                        <p className="text-[10px] uppercase font-bold text-slate-400 px-2 mb-1 tracking-wider">Quick Presets</p>
                        <div className="grid grid-cols-2 gap-1">
                          {[
                            { id: 'today', label: 'Today' },
                            { id: '7days', label: 'Last 7 Days' },
                            { id: '14days', label: 'Last 14 Days' },
                            { id: '28days', label: 'Last 28 Days' },
                          ].map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setDatePreset(p.id as MonthlyDatePreset)
                                setShowRangeDropdown(false)
                              }}
                              className={`text-left px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer flex items-center justify-between ${
                                datePreset === p.id ? 'bg-purple-50 text-purple-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{p.label}</span>
                              {datePreset === p.id && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mb-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] uppercase font-bold text-slate-400 px-2 mb-1 tracking-wider">Months & Previous Years</p>
                        <div className="grid grid-cols-2 gap-1">
                          {[
                            { id: 'this_month', label: 'This Month' },
                            { id: 'last_month', label: 'Last Month' },
                            { id: 'this_year', label: `This Year (${currentYear})` },
                            { id: 'last_year', label: `Last Year (${lastYear})` },
                            { id: '2_years_ago', label: `2 Years Ago (${twoYearsAgo})` },
                            { id: 'all_time', label: 'All-Time Records' },
                          ].map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setDatePreset(p.id as MonthlyDatePreset)
                                setShowRangeDropdown(false)
                              }}
                              className={`text-left px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer flex items-center justify-between ${
                                datePreset === p.id ? 'bg-purple-50 text-purple-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="truncate">{p.label}</span>
                              {datePreset === p.id && <span className="w-1.5 h-1.5 rounded-full bg-purple-600 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[10px] uppercase font-bold text-slate-400 px-2 mb-2 tracking-wider">Custom Date Range</p>
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10.5px] font-medium text-slate-500 block mb-0.5">Start Date</label>
                              <input
                                type="date"
                                value={customStartDate}
                                onChange={e => setCustomStartDate(e.target.value)}
                                className="w-full text-[11px] px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-purple-400"
                              />
                            </div>
                            <div>
                              <label className="text-[10.5px] font-medium text-slate-500 block mb-0.5">End Date</label>
                              <input
                                type="date"
                                value={customEndDate}
                                onChange={e => setCustomEndDate(e.target.value)}
                                className="w-full text-[11px] px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-purple-400"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={!customStartDate || !customEndDate}
                            onClick={() => {
                              if (customStartDate && customEndDate) {
                                setDatePreset('custom')
                                setShowRangeDropdown(false)
                              }
                            }}
                            className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[11.5px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                          >
                            Apply Custom Range
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left 2 Cols: Monthly Clients List */}
            <div className="xl:col-span-2 space-y-4">
              {/* Toolbar */}
              <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by client name, address, cleaner…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-purple-400 placeholder-slate-400 transition-colors"
                    />
                  </div>

                  <select
                    value={areaFilter}
                    onChange={e => setAreaFilter(e.target.value)}
                    className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-purple-400 text-slate-700 cursor-pointer"
                  >
                    <option value="all">All Areas ({areas.length})</option>
                    {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>

                  <select
                    value={sortOrder}
                    onChange={e => setSortOrder(e.target.value as typeof sortOrder)}
                    className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-purple-400 text-slate-700 cursor-pointer font-medium"
                  >
                    <option value="top_charges">Sort: Highest Charges</option>
                    <option value="top_ot">Sort: Highest Overtime (OT)</option>
                    <option value="visits">Sort: Most Visits</option>
                    <option value="name">Sort: Name (A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Monthly Client Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSummaries.map((c, idx) => {
                  const matchedContract = contractsByClientName.get(c.name.toLowerCase().trim())
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedSummary(c)}
                      className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 cursor-pointer hover:shadow-[0_8px_30px_rgba(147,51,234,0.12)] hover:border-purple-300 transition-all group flex flex-col justify-between"
                    >
                      <div>
                        {/* Top: Avatar, Name, Charges */}
                        <div className="flex items-start gap-3 mb-3">
                          <Avatar name={c.name} size="md" idx={idx} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-[14px] font-bold text-[#111827] group-hover:text-purple-700 transition-colors truncate">
                                {c.name}
                              </p>
                              <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.2 rounded-full uppercase tracking-wider">
                                Monthly
                              </span>
                              {matchedContract && (
                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.2 rounded-full flex items-center gap-1">
                                  <RotateCw size={9} />
                                  Contract: AED {matchedContract.amount}/{matchedContract.frequency === 'weekly' ? 'wk' : matchedContract.frequency === 'biweekly' ? '2wk' : 'mo'}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-slate-500 mt-0.5 truncate flex items-center gap-1">
                              <MapPin size={11} className="shrink-0 text-slate-400" />
                              <span>{c.area || 'Dubai'}</span>
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-[15.5px] font-extrabold text-[#111827]">
                              AED {c.totalCharges.toLocaleString()}
                            </p>
                            <p className="text-[10.5px] text-slate-400 font-medium">Charges</p>
                          </div>
                        </div>

                        {/* Address Details */}
                        <div className="bg-[#f8fafc] rounded-xl p-2.5 border border-[#edf2f7] mb-3 text-[12px] text-slate-600">
                          <p className="font-medium text-slate-700 truncate" title={c.rawAddress}>
                            {c.rawAddress}
                          </p>
                          {c.cleaners.length > 0 && (
                            <p className="text-[11px] text-slate-400 mt-1 truncate">
                              Cleaners: <span className="text-slate-600 font-medium">{c.cleaners.join(', ')}</span>
                            </p>
                          )}
                        </div>

                        {/* Highlights: OT, Duty Hours, Visits */}
                        <div className="grid grid-cols-3 gap-2 text-center py-2 border-y border-[#edf2f7] mb-3">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-semibold">Overtime</p>
                            <p className={`text-[12.5px] font-bold ${c.totalOTHours > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                              {c.totalOTHours > 0 ? `${c.totalOTHours}h OT` : '0h'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-semibold">Duty Hours</p>
                            <p className="text-[12.5px] font-bold text-slate-700">
                              {c.totalDutyHours}h
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-semibold">Shifts</p>
                            <p className="text-[12.5px] font-bold text-slate-700">
                              {c.visitsCount} visits
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer: View Details & Actions */}
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Calendar size={11} /> Last: {formatDate(c.lastService)}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {!matchedContract && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const cl = clients.find(x => x.id === c.matchedClientId || x.full_name.toLowerCase() === c.name.toLowerCase())
                                handleAddContract(c.name, cl?.phone || '', cl?.email || '')
                                setActiveTab('contracts')
                              }}
                              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                              title="Create recurring contract for this client"
                            >
                              + Contract
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedSummary(c)
                            }}
                            className="text-[11.5px] font-semibold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            View Shifts
                          </button>
                          <Link
                            to={`/clients/${c.id}`}
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-[11.5px] font-semibold text-slate-500 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                            title="View Full Client Profile"
                          >
                            <ExternalLink size={12} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {filteredSummaries.length === 0 && (
                <div className="bg-white rounded-[22px] border border-[#E4E8EC] py-16 text-center">
                  <Users className="mx-auto mb-3 text-slate-300" size={44} strokeWidth={1.25} />
                  <p className="text-[14px] font-bold text-slate-700">No Monthly Clients Found</p>
                  <p className="text-[12px] text-slate-400 mt-1">
                    {activeRange.isAllTime
                      ? 'No clients with monthly payment mode found in Daily Job Sheet.'
                      : `No monthly records found for ${activeRange.label}. Try selecting another date range above.`}
                  </p>
                </div>
              )}
            </div>

            {/* Right Sidebar */}
            <div className="space-y-5">
              {/* Top Monthly Spenders by Charges */}
              <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-bold text-[#111827]">Top Monthly Charges</h3>
                  <span className="text-[11px] text-slate-400">{activeRange.label}</span>
                </div>

                {topClientsByCharges.length === 0 ? (
                  <p className="text-[12px] text-slate-400 text-center py-4">No records</p>
                ) : (
                  <div className="space-y-3">
                    {topClientsByCharges.map((c, idx) => {
                      const maxAmt = topClientsByCharges[0]?.totalCharges || 1
                      const pct = Math.round((c.totalCharges / maxAmt) * 100)
                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelectedSummary(c)}
                          className="cursor-pointer hover:bg-slate-50 rounded-xl p-2 -mx-2 transition-colors"
                        >
                          <div className="flex items-center justify-between text-[12px] mb-1">
                            <span className="font-bold text-[#111827] truncate mr-2">
                              <span className={`w-4 inline-block ${idx === 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                                {idx + 1}.
                              </span>
                              {c.name}
                            </span>
                            <span className="font-bold text-purple-700 shrink-0">
                              AED {c.totalCharges.toLocaleString()}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Overtime (OT) Leaders */}
              <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-1.5">
                    <Clock size={16} className="text-amber-500" /> Overtime (OT) Leaders
                  </h3>
                  <span className="text-[11px] text-slate-400">Total: {totalOTHours}h</span>
                </div>

                {topClientsByOT.length === 0 ? (
                  <p className="text-[12px] text-slate-400 text-center py-4">No overtime hours logged</p>
                ) : (
                  <div className="space-y-2.5">
                    {topClientsByOT.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setSelectedSummary(c)}
                        className="flex items-center justify-between text-[12px] p-2 hover:bg-amber-50/60 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-amber-200"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-800 truncate">{c.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">{c.area} · {c.visitsCount} visits</p>
                        </div>
                        <span className="text-[11.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full shrink-0">
                          {c.totalOTHours}h OT
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Area Density */}
              {Object.keys(areaCounts).length > 0 && (
                <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[15px] font-bold text-[#111827]">Monthly Locations</h3>
                    <span className="text-[11px] text-slate-400">By area</span>
                  </div>
                  <div className="space-y-2.5">
                    {Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([area, count]) => {
                      const maxCount = Math.max(...Object.values(areaCounts))
                      const pct = Math.round((count / maxCount) * 100)
                      return (
                        <div key={area}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-medium text-slate-700 truncate">{area}</span>
                            <span className="text-[12px] font-bold text-[#111827] shrink-0 ml-2">{count}</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 2: RECURRING CONTRACTS & SUBSCRIPTIONS (Merged from Subscriptions)
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'contracts' && (
        <div className="space-y-6">
          {/* Contracts Controls & Filters */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search contract by client name, email, service..."
                  value={contractSearch}
                  onChange={e => setContractSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 placeholder-slate-400 transition-colors"
                />
              </div>

              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-[#E4E8EC] gap-1 text-[12px] font-bold">
                <button
                  type="button"
                  onClick={() => setContractStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    contractStatusFilter === 'all'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  All ({contracts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setContractStatusFilter('active')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    contractStatusFilter === 'active'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  Active ({activeContracts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setContractStatusFilter('paused')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    contractStatusFilter === 'paused'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  Paused ({pausedContracts.length})
                </button>
              </div>
            </div>

            <Button
              onClick={() => handleAddContract()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus size={15} className="mr-1.5" /> + New Recurring Contract
            </Button>
          </div>

          {/* Info Banner: Recurring Subscriptions Mechanics */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 rounded-[22px] p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-emerald-700" />
              <p className="text-[14px] font-bold text-emerald-950">How Recurring Contracts & Subscriptions Work</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[12px] text-emerald-900 font-medium">
              <div className="flex items-start gap-2">
                <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>Weekly, bi-weekly, or monthly automated contracts</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>Auto-renewal tracking on contract anniversary</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>1-Click Pause or Activate contract anytime</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>Synchronized with Daily Job Sheet & Invoicing</span>
              </div>
            </div>
          </div>

          {/* Contracts Table */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E4E8EC] bg-slate-50 text-[11.5px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="px-6 py-4">Client & Contact</th>
                    <th className="px-6 py-4">Service</th>
                    <th className="px-6 py-4 text-center">Frequency</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4 text-center">Next Billing</th>
                    <th className="px-6 py-4 text-center">Renewal Date</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {filteredContracts.map(contract => (
                    <tr key={contract.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-[13.5px] font-bold text-[#111827]">{contract.clientName}</p>
                        <p className="text-[11.5px] text-slate-500 mt-0.5 flex items-center gap-2">
                          {contract.clientEmail && <span>{contract.clientEmail}</span>}
                          {contract.clientPhone && <span>· {contract.clientPhone}</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[13px] font-medium text-slate-700">{contract.serviceType}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {frequencyLabels[contract.frequency]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-[14px] font-extrabold text-emerald-600">
                          AED {contract.amount.toLocaleString()}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          ~AED {Math.round(contract.frequency === 'weekly' ? contract.amount * 4.33 : contract.frequency === 'biweekly' ? contract.amount * 2.17 : contract.amount)}/mo
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center text-[12px] text-slate-600">
                        <div className="flex items-center justify-center gap-1.5 font-medium">
                          <Calendar size={13} className="text-slate-400" />
                          <span>{contract.nextBillingDate ? formatDate(contract.nextBillingDate) : '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-[12px] text-slate-500">
                        <span>{contract.renewalDate ? formatDate(contract.renewalDate) : 'Auto (1 yr)'}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize border ${
                            contract.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {contract.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleContractStatus(contract.id, contract.status)}
                            className={`p-2 rounded-xl transition-colors cursor-pointer ${
                              contract.status === 'active'
                                ? 'hover:bg-amber-100 text-amber-600 bg-amber-50'
                                : 'hover:bg-emerald-100 text-emerald-600 bg-emerald-50'
                            }`}
                            title={contract.status === 'active' ? 'Pause Contract' : 'Activate Contract'}
                          >
                            <Power size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditContract(contract)}
                            className="p-2 rounded-xl hover:bg-blue-100 text-blue-600 bg-blue-50 transition-colors cursor-pointer"
                            title="Edit Contract"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteContract(contract.id)}
                            className="p-2 rounded-xl hover:bg-red-100 text-red-600 bg-red-50 transition-colors cursor-pointer"
                            title="Delete Contract"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredContracts.length === 0 && (
                <div className="py-14 text-center">
                  <RotateCw className="mx-auto mb-3 text-slate-300" size={40} />
                  <p className="text-[14px] font-bold text-slate-700">No Recurring Contracts Found</p>
                  <p className="text-[12px] text-slate-400 mt-1">
                    {contractSearch ? 'No contracts match your search filter.' : 'Create a new contract to begin recurring billing.'}
                  </p>
                  <Button
                    onClick={() => handleAddContract()}
                    className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus size={14} className="mr-1" /> Create First Contract
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 3: RECRUITMENT & COVERAGE INSIGHTS (Yakja Unified Analytics)
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'recruitment' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Retention & Conversion Rate */}
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
              <h3 className="text-[15px] font-bold text-[#111827] mb-3 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600" />
                Contract Conversion Health
              </h3>
              <p className="text-[12px] text-slate-500 mb-4">
                Comparison of ad-hoc monthly service clients versus committed recurring subscription contracts.
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-slate-600">Active Recurring Contracts</span>
                  <span className="font-bold text-emerald-600">{activeContracts.length} clients</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, (activeContracts.length / (monthlySummaries.length || 1)) * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[12.5px] pt-1">
                  <span className="font-semibold text-slate-600">Job Sheet Monthly Clients</span>
                  <span className="font-bold text-purple-600">{monthlySummaries.length} clients</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
            </div>

            {/* Frequency Breakdown */}
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
              <h3 className="text-[15px] font-bold text-[#111827] mb-3 flex items-center gap-2">
                <Layers size={18} className="text-blue-600" />
                Contract Frequency Distribution
              </h3>
              <div className="space-y-3 text-[12.5px]">
                {(['weekly', 'biweekly', 'monthly'] as const).map(freq => {
                  const match = contracts.filter(c => c.frequency === freq && c.status === 'active')
                  const count = match.length
                  const sum = match.reduce((s, c) => s + c.amount, 0)
                  return (
                    <div key={freq} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center justify-between font-bold">
                        <span className="capitalize text-slate-800">{frequencyLabels[freq]}</span>
                        <span className="text-blue-700">{count} contracts</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">AED {sum.toLocaleString()} per billing cycle</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Upcoming Billing Pipeline */}
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
              <h3 className="text-[15px] font-bold text-[#111827] mb-3 flex items-center gap-2">
                <Calendar size={18} className="text-amber-600" />
                Upcoming Renewals & Billing
              </h3>
              <div className="space-y-2.5">
                {activeContracts.slice(0, 4).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-[12px] p-2 hover:bg-slate-50 rounded-xl">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-[#111827] truncate">{c.clientName}</p>
                      <p className="text-[11px] text-slate-400 truncate">{c.serviceType}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-emerald-600">AED {c.amount}</p>
                      <p className="text-[10px] text-slate-400">{c.nextBillingDate ? formatDate(c.nextBillingDate) : 'Due'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODALS
         ═══════════════════════════════════════════════════════════════ */}

      {/* Add / Edit Recurring Contract Modal */}
      <Modal
        open={showContractModal}
        onClose={() => setShowContractModal(false)}
        title={editingContractId ? 'Edit Recurring Contract' : 'New Recurring Contract'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="relative">
            <Input
              label="Client Name"
              value={contractForm.clientName}
              onChange={e => {
                setContractForm({ ...contractForm, clientName: e.target.value })
                setClientSearchDropdown(true)
              }}
              onFocus={() => setClientSearchDropdown(true)}
              placeholder="e.g. Ahmed Al Mansoori"
              required
            />
            {clientSearchDropdown && clientSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E4E8EC] rounded-xl shadow-xl z-50 p-2 space-y-1">
                <p className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1">Auto-suggest from Clients</p>
                {clientSuggestions.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setContractForm(prev => ({
                        ...prev,
                        clientName: s.full_name,
                        clientEmail: s.email || prev.clientEmail,
                        clientPhone: s.phone || prev.clientPhone,
                      }))
                      setClientSearchDropdown(false)
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-purple-50 text-[12px] flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="font-bold text-[#111827]">{s.full_name}</span>
                    <span className="text-[11px] text-slate-400">{s.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Client Email"
              type="email"
              value={contractForm.clientEmail || ''}
              onChange={e => setContractForm({ ...contractForm, clientEmail: e.target.value })}
              placeholder="ahmed@example.com"
            />
            <Input
              label="Client Phone"
              value={contractForm.clientPhone || ''}
              onChange={e => setContractForm({ ...contractForm, clientPhone: e.target.value })}
              placeholder="+971 50 000 0000"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1">Service Type</label>
              <select
                value={contractForm.serviceType}
                onChange={e => setContractForm({ ...contractForm, serviceType: e.target.value })}
                className="w-full text-[13px] px-3 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 text-slate-800"
              >
                <option value="">Select Service...</option>
                {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <Select
              label="Frequency"
              value={contractForm.frequency}
              onChange={e => setContractForm({ ...contractForm, frequency: e.target.value as 'weekly' | 'biweekly' | 'monthly' })}
            >
              <option value="weekly">Weekly (Every 7 Days)</option>
              <option value="biweekly">Bi-weekly (Every 14 Days)</option>
              <option value="monthly">Monthly (Every 30 Days)</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contract Amount (AED)"
              type="number"
              value={contractForm.amount || ''}
              onChange={e => setContractForm({ ...contractForm, amount: parseFloat(e.target.value) || 0 })}
              placeholder="e.g. 350"
              required
            />
            <Input
              label="Contract Start Date"
              type="date"
              value={contractForm.startDate}
              onChange={e => setContractForm({ ...contractForm, startDate: e.target.value })}
              required
            />
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[12px] text-emerald-900">
              <span>📅 Auto-Renewal Anniversary:</span>
              <strong className="font-bold">
                {contractForm.startDate
                  ? new Date(new Date(contractForm.startDate).getFullYear() + 1, new Date(contractForm.startDate).getMonth(), new Date(contractForm.startDate).getDate()).toISOString().split('T')[0]
                  : 'Auto-calculated'}
              </strong>
            </div>
            <div className="flex items-center justify-between text-[12px] text-emerald-900">
              <span>💰 Monthly Recurring Revenue (MRR):</span>
              <strong className="font-bold">
                AED {Math.round(
                  contractForm.frequency === 'weekly' ? (contractForm.amount || 0) * 4.33 :
                  contractForm.frequency === 'biweekly' ? (contractForm.amount || 0) * 2.17 :
                  (contractForm.amount || 0)
                ).toLocaleString()}
              </strong>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowContractModal(false)}>Cancel</Button>
            <Button onClick={handleSaveContract} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Save size={14} className="mr-1.5" /> Save Contract
            </Button>
          </div>
        </div>
      </Modal>

      {/* Comprehensive Monthly Client Details & Shifts Modal */}
      {selectedSummary && (
        <Modal
          open={!!selectedSummary}
          onClose={() => setSelectedSummary(null)}
          title={`Monthly Client Details — ${selectedSummary.name}`}
          size="xl"
        >
          <div className="space-y-5">
            {/* Header info bar */}
            <div className="bg-gradient-to-r from-purple-50 via-slate-50 to-white rounded-2xl p-4 border border-purple-100 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={selectedSummary.name} size="lg" idx={0} />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[17px] font-extrabold text-[#111827]">{selectedSummary.name}</h3>
                    <span className="text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full uppercase">
                      Monthly
                    </span>
                    {contractsByClientName.get(selectedSummary.name.toLowerCase().trim()) && (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                        Active Recurring Contract
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-1">
                    <MapPin size={12} className="text-slate-400" />
                    <span>{selectedSummary.rawAddress} ({selectedSummary.area})</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to={`/clients/${selectedSummary.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[12.5px] font-bold transition-all shadow-xs"
                >
                  <ExternalLink size={13} /> View Full Profile
                </Link>
              </div>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-purple-50/70 border border-purple-100 rounded-xl p-3 text-center">
                <p className="text-[10.5px] font-bold text-purple-800 uppercase tracking-wider">Total Charges</p>
                <p className="text-[18px] font-extrabold text-purple-900 mt-0.5">AED {selectedSummary.totalCharges.toLocaleString()}</p>
              </div>
              <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-3 text-center">
                <p className="text-[10.5px] font-bold text-amber-800 uppercase tracking-wider">Total OT Hours</p>
                <p className="text-[18px] font-extrabold text-amber-900 mt-0.5">{selectedSummary.totalOTHours}h</p>
              </div>
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 text-center">
                <p className="text-[10.5px] font-bold text-blue-800 uppercase tracking-wider">Duty Hours</p>
                <p className="text-[18px] font-extrabold text-blue-900 mt-0.5">{selectedSummary.totalDutyHours}h</p>
              </div>
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3 text-center">
                <p className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wider">Total Visits</p>
                <p className="text-[18px] font-extrabold text-emerald-900 mt-0.5">{selectedSummary.visitsCount} shifts</p>
              </div>
            </div>

            {/* Detailed Shifts & Overtime Table from Daily Job Sheet */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-[14px] font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText size={15} className="text-purple-600" />
                  Service Shifts & Overtime Breakdown ({selectedSummary.jobs.length})
                </h4>
                <span className="text-[11px] text-slate-400">Fetched from Daily Job Sheet</span>
              </div>

              <div className="border border-[#E4E8EC] rounded-2xl overflow-hidden shadow-xs">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] sticky top-0 z-10 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3.5">Date</th>
                        <th className="py-2.5 px-3">Cleaner</th>
                        <th className="py-2.5 px-3">Timing</th>
                        <th className="py-2.5 px-3 text-center">Duty Hrs</th>
                        <th className="py-2.5 px-3 text-center">OT Hrs</th>
                        <th className="py-2.5 px-3 text-right">Charges</th>
                        <th className="py-2.5 px-3 text-right">Received</th>
                        <th className="py-2.5 px-3.5">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4E8EC]">
                      {selectedSummary.jobs.map(job => {
                        const ot = calcJobOTHours(job)
                        return (
                          <tr key={job.id} className="hover:bg-purple-50/40 transition-colors">
                            <td className="py-2.5 px-3.5 font-semibold text-slate-800 whitespace-nowrap">
                              {job.date ? formatDate(job.date) : '—'}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">
                              {job.staff_name || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                              {job.start_time || '—'} - {job.end_time || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                              {job.duty_hours ? `${job.duty_hours}h` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {ot > 0 ? (
                                <span className="inline-block bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full text-[11px] border border-amber-200">
                                  {ot}h OT
                                </span>
                              ) : (
                                <span className="text-slate-400">0h</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-extrabold text-purple-700 whitespace-nowrap">
                              AED {Number(job.charges || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                              AED {Number(job.received || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-500 italic max-w-[200px] truncate" title={job.remarks}>
                              {job.remarks || job.service || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setSelectedSummary(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Client Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New Client" size="lg">
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault()
          const f = new FormData(e.currentTarget as HTMLFormElement)
          addClient({
            full_name: String(f.get('full_name') || 'New Client'),
            phone: String(f.get('phone') || ''),
            whatsapp: String(f.get('whatsapp') || ''),
            email: String(f.get('email') || ''),
            nationality: '',
            city: String(f.get('city') || 'Dubai'),
            building_name: String(f.get('building') || ''),
            apartment: '',
            area: String(f.get('area') || 'Dubai'),
            access_notes: String(f.get('access_notes') || ''),
            pet_info: String(f.get('pet_info') || ''),
            total_bookings: 0,
            total_spent: 0,
          })
          setShowModal(false)
        }}>
          <div className="grid grid-cols-2 gap-4">
            <Input name="full_name" label="Full Name" placeholder="Full name" required />
            <Input name="phone" label="Phone" placeholder="+971 50 000 0000" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="whatsapp" label="WhatsApp" placeholder="+971 50 000 0000" />
            <Input name="email" label="Email" type="email" placeholder="email@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="building" label="Building / Villa" placeholder="Building or villa name" />
            <Select name="city" label="Emirate"><option>Dubai</option><option>Abu Dhabi</option><option>Sharjah</option><option>Ajman</option></Select>
          </div>
          <Input name="area" label="Area / Community" placeholder="e.g. Dubai Marina, JBR..." />
          <Textarea name="access_notes" label="Access Notes" rows={2} />
          <Textarea name="pet_info" label="Pet Information" rows={2} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Save Client</Button>
          </div>
        </form>
      </Modal>

      {/* New Booking Modal */}
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

function ClientBookingForm({ clientName, clientPhone, onClose, onAdd }: { clientName: string; clientPhone: string; onClose: () => void; onAdd: (b: any) => void }) {
  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      onAdd({ client_id: '', client_name: clientName, client_phone: clientPhone, service_address: f.get('service_address') as string, service_type: f.get('service_type') as string, frequency: (f.get('frequency') as BookingFrequency) || 'monthly', scheduled_date: f.get('scheduled_date') as string, scheduled_time: f.get('scheduled_time') as string, duration_hours: Number(f.get('duration_hours')) || 3, total_amount: Number(f.get('total_amount')) || 0, notes: f.get('notes') as string, status: 'pending', assigned_crew: [] })
    }}>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]"><p className="text-[10.5px] text-slate-500 uppercase font-semibold mb-1">Client</p><p className="text-[13px] font-semibold text-[#111827]">{clientName}</p></div>
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]"><p className="text-[10.5px] text-slate-500 uppercase font-semibold mb-1">Phone</p><p className="text-[13px] font-semibold text-[#111827]">{clientPhone}</p></div>
      </div>
      <Input name="service_address" label="Service Address" placeholder="Street, unit, neighborhood" />
      <div className="grid grid-cols-2 gap-4">
        <Select name="service_type" label="Service Type"><option value="">Select service…</option>{serviceTypes.map(s => <option key={s}>{s}</option>)}</Select>
        <Select name="frequency" label="Frequency" defaultValue="monthly"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option><option value="once">One-time</option></Select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input name="scheduled_date" label="Date" type="date" required />
        <Input name="scheduled_time" label="Start Time" type="time" />
        <Input name="duration_hours" label="Hours" type="number" min="1" max="24" defaultValue="3" />
      </div>
      <Input name="total_amount" label="Total Amount (AED)" type="number" placeholder="0.00" />
      <Textarea name="notes" label="Remarks" rows={2} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Create Booking</Button>
      </div>
    </form>
  )
}
