import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Search, Phone, MapPin, Calendar,
  Users, TrendingUp, DollarSign, Star, Clock, ExternalLink,
  Trash2, ShieldCheck, CheckCircle, AlertCircle, FileText, Layers,
  ChevronDown, RotateCw, Plus, Edit2, Save, X, Power,
  Briefcase, CreditCard, CheckCircle2, PauseCircle, PlayCircle,
  Sparkles, Printer, Send, MessageCircle, FileSpreadsheet, Check, UserCheck,
  LayoutGrid, List,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatDate, addHoursToTime, subtractHoursFromTime, calcDurationFromTimes } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import { ClientInvoicesLedger } from '@/components/monthlyClients/ClientInvoicesLedger'
import { notify, confirmAsync } from '@/lib/notify'
import { nextInvoiceNumber } from '@/lib/invoiceNumber'
import type { BookingFrequency, DailyJob, RecurringContract, InvoiceLineItem, Employee, Client } from '@/types'
import {
  extractMonthlyClientsFromDailyJobs,
  calcJobOTHours,
  cleanClientNameFromAddress,
  isBogusJob,
  normalizeKey,
  type MonthlyClientSummary,
} from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'
import { AddMonthlyClientModalForm } from '@/components/monthlyClients/AddMonthlyClientModalForm'
import { todayDubai } from '@/lib/dubaiTime'

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

export interface MonthlyClientPayment {
  id: string
  clientName: string
  amount: number
  date: string
  paymentMethod: 'Bank Transfer' | 'Cash' | 'Credit Card' | 'Cheque' | 'Online'
  referenceNumber?: string
  invoiceMonth?: string
  notes?: string
  createdAt: string
}

export function MonthlyClients() {
  const { clients, dailyJobs, employees, addClient, addBooking, addInvoice, invoices } = useData()

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<'clients' | 'payments' | 'contracts' | 'recruitment'>('clients')

  // ── Client Payments State ──
  const [payments, setPayments] = useState<MonthlyClientPayment[]>(() => {
    return safeLocalStorageGet('safaeewala_monthly_client_payments', [])
  })

  useEffect(() => {
    safeLocalStorageSet('safaeewala_monthly_client_payments', payments)
  }, [payments])

  const [paymentNotice, setPaymentNotice] = useState<string | null>(null)
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false)
  const [paymentFormClient, setPaymentFormClient] = useState('')
  const [paymentFormAmount, setPaymentFormAmount] = useState('')
  const [paymentFormDate, setPaymentFormDate] = useState(todayDubai())
  const [paymentFormMethod, setPaymentFormMethod] = useState<'Bank Transfer' | 'Cash' | 'Credit Card' | 'Cheque' | 'Online'>('Bank Transfer')
  const [paymentFormRef, setPaymentFormRef] = useState('')
  const [paymentFormMonth, setPaymentFormMonth] = useState(new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
  const [paymentFormNotes, setPaymentFormNotes] = useState('')
  const [paymentClientDropdown, setPaymentClientDropdown] = useState(false)
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | 'Bank Transfer' | 'Cash' | 'Credit Card' | 'Cheque' | 'Online'>('all')

  useEffect(() => {
    if (!paymentNotice) return
    const timer = setTimeout(() => setPaymentNotice(null), 7000)
    return () => clearTimeout(timer)
  }, [paymentNotice])

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

  // ── View Mode: 'grid' | 'table' ──
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    return safeLocalStorageGet('monthly_clients_view_mode', 'grid')
  })

  useEffect(() => {
    safeLocalStorageSet('monthly_clients_view_mode', viewMode)
  }, [viewMode])

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
    startDate: todayDubai(),
    renewalDate: '',
    status: 'active',
    lastBilled: todayDubai(),
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
    const today = todayDubai()
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
      notify.error('Please fill client name, service type, and amount.')
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

  const handleDeleteContract = async (id: string) => {
    if (await confirmAsync({ title: 'Delete contract', message: 'Delete this contract?', confirmLabel: 'Delete', tone: 'danger' })) {
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

  // ── Client Payments Calculations & Helpers ──
  // Balances compare charges and payments of the SAME period (AUD-39)
  const periodPayments = useMemo(() => {
    if (activeRange.isAllTime || !activeRange.start || !activeRange.end) return payments
    return payments.filter(p => p.date >= activeRange.start && p.date <= activeRange.end)
  }, [payments, activeRange])

  const paymentsByClient = useMemo(() => {
    const map = new Map<string, MonthlyClientPayment[]>()
    for (const p of periodPayments) {
      const key = p.clientName.trim().toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [periodPayments])

  const totalPaymentsRecorded = useMemo(() => {
    return periodPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  }, [periodPayments])

  const totalMonthlyBalanceDue = useMemo(() => {
    return Math.max(0, totalMonthlyCharges - (totalMonthlyReceived + totalPaymentsRecorded))
  }, [totalMonthlyCharges, totalMonthlyReceived, totalPaymentsRecorded])

  const handleOpenRecordPayment = (clientName?: string, defaultAmount?: number) => {
    setPaymentFormClient(clientName || '')
    setPaymentFormAmount(defaultAmount && defaultAmount > 0 ? String(defaultAmount) : '')
    setPaymentFormDate(todayDubai())
    setPaymentFormMethod('Bank Transfer')
    setPaymentFormRef('')
    setPaymentFormMonth(new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
    setPaymentFormNotes('')
    setShowRecordPaymentModal(true)
  }

  const addPayment = (payment: Omit<MonthlyClientPayment, 'id' | 'createdAt'>) => {
    const newPayment: MonthlyClientPayment = {
      ...payment,
      id: 'pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
    }
    setPayments(prev => [newPayment, ...prev])
    setPaymentNotice(`Payment of AED ${newPayment.amount.toLocaleString()} for ${newPayment.clientName} successfully recorded!`)
  }

  const deletePayment = async (id: string) => {
    if (await confirmAsync({ title: 'Delete payment', message: 'Delete this payment record?', confirmLabel: 'Delete', tone: 'danger' })) {
      setPayments(prev => prev.filter(p => p.id !== id))
      setPaymentNotice('Payment record deleted.')
    }
  }

  const paymentClientSuggestions = useMemo(() => {
    if (!paymentFormClient || paymentFormClient.trim().length < 1) return monthlySummaries.slice(0, 6)
    const q = paymentFormClient.toLowerCase()
    return monthlySummaries.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6)
  }, [monthlySummaries, paymentFormClient])

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const matchSearch = !paymentSearch ||
        p.clientName.toLowerCase().includes(paymentSearch.toLowerCase()) ||
        (p.referenceNumber && p.referenceNumber.toLowerCase().includes(paymentSearch.toLowerCase())) ||
        (p.invoiceMonth && p.invoiceMonth.toLowerCase().includes(paymentSearch.toLowerCase()))
      const matchMethod = paymentMethodFilter === 'all' || p.paymentMethod === paymentMethodFilter
      return matchSearch && matchMethod
    })
  }, [payments, paymentSearch, paymentMethodFilter])

  // ── Create Invoice Modal State ──
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceClient, setInvoiceClient] = useState<MonthlyClientSummary | null>(null)
  const [invoiceType, setInvoiceType] = useState<'simple' | 'detailed'>('detailed')
  const [invoicePreset, setInvoicePreset] = useState<'this_month' | 'last_month' | '28days' | 'custom'>('this_month')
  const [invoiceStartDate, setInvoiceStartDate] = useState<string>('')
  const [invoiceEndDate, setInvoiceEndDate] = useState<string>('')
  const [invoiceNumber, setInvoiceNumber] = useState<string>('')
  const [invoiceIssueDate, setInvoiceIssueDate] = useState<string>('')
  const [invoiceDueDate, setInvoiceDueDate] = useState<string>('')
  const [invoiceIncludeVat, setInvoiceIncludeVat] = useState<boolean>(true)
  const [invoicePricingModel, setInvoicePricingModel] = useState<'shift_charges' | 'hourly_rate' | 'contract' | 'custom_total'>('shift_charges')
  const [invoiceHourlyRate, setInvoiceHourlyRate] = useState<number>(35)
  const [invoiceCustomAmount, setInvoiceCustomAmount] = useState<string>('')
  const [invoiceNotes, setInvoiceNotes] = useState<string>(
    'Payment due within 7 days of invoice date. Bank transfer to Safaeewala Cleaning & Maintenance LLC.'
  )
  const [invoiceSuccessMsg, setInvoiceSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!invoiceSuccessMsg) return
    const timer = setTimeout(() => setInvoiceSuccessMsg(null), 6000)
    return () => clearTimeout(timer)
  }, [invoiceSuccessMsg])

  const handleSetInvoicePreset = (preset: 'this_month' | 'last_month' | '28days' | 'custom') => {
    setInvoicePreset(preset)
    const now = new Date()
    if (preset === 'this_month') {
      const y = now.getFullYear()
      const m = now.getMonth()
      const start = new Date(y, m, 1).toISOString().split('T')[0]
      const end = new Date(y, m + 1, 0).toISOString().split('T')[0]
      setInvoiceStartDate(start)
      setInvoiceEndDate(end)
    } else if (preset === 'last_month') {
      const y = now.getFullYear()
      const m = now.getMonth() - 1
      const start = new Date(y, m, 1).toISOString().split('T')[0]
      const end = new Date(y, m + 1, 0).toISOString().split('T')[0]
      setInvoiceStartDate(start)
      setInvoiceEndDate(end)
    } else if (preset === '28days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 27)
      setInvoiceStartDate(d.toISOString().split('T')[0])
      setInvoiceEndDate(now.toISOString().split('T')[0])
    }
  }

  const handleOpenCreateInvoice = (c: MonthlyClientSummary) => {
    setInvoiceClient(c)
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    if (activeRange.start && activeRange.end && !activeRange.isAllTime) {
      setInvoiceStartDate(activeRange.start)
      setInvoiceEndDate(activeRange.end)
      setInvoicePreset('custom')
    } else {
      const y = now.getFullYear()
      const m = now.getMonth()
      setInvoiceStartDate(new Date(y, m, 1).toISOString().split('T')[0])
      setInvoiceEndDate(new Date(y, m + 1, 0).toISOString().split('T')[0])
      setInvoicePreset('this_month')
    }

    setInvoiceNumber(nextInvoiceNumber(invoices)) // sequential, unique (AUD-36)

    setInvoiceIssueDate(todayStr)
    const due = new Date(now)
    due.setDate(due.getDate() + 7)
    setInvoiceDueDate(due.toISOString().split('T')[0])

    const contract = contractsByClientName.get(c.name.toLowerCase().trim())
    if (contract && contract.amount > 0) {
      setInvoicePricingModel('contract')
      setInvoiceCustomAmount(String(contract.amount))
    } else if (c.totalCharges > 0) {
      setInvoicePricingModel('shift_charges')
      setInvoiceCustomAmount(String(c.totalCharges))
    } else {
      setInvoicePricingModel('hourly_rate')
      setInvoiceCustomAmount('')
    }

    setInvoiceType('detailed')
    setInvoiceIncludeVat(true)
    setInvoiceSuccessMsg(null)
    setShowInvoiceModal(true)
  }

  const invoiceCalculations = useMemo(() => {
    if (!invoiceClient) {
      return {
        shifts: [] as DailyJob[],
        totalHours: 0,
        totalOT: 0,
        subtotal: 0,
        vatAmount: 0,
        grandTotal: 0,
        lineItems: [] as InvoiceLineItem[],
      }
    }

    const clientKey = normalizeKey(invoiceClient.name)
    const clientRawKey = normalizeKey(invoiceClient.rawAddress)

    const allMatchingJobs = dailyJobs.filter(j => {
      if (isBogusJob(j)) return false
      const addrNorm = normalizeKey(j.address || '')
      const cleanAddrNorm = normalizeKey(cleanClientNameFromAddress(j.address || ''))
      return (
        addrNorm === clientKey ||
        cleanAddrNorm === clientKey ||
        addrNorm === clientRawKey ||
        cleanAddrNorm === clientRawKey ||
        (clientKey.length >= 5 && (addrNorm.includes(clientKey) || cleanAddrNorm.includes(clientKey)))
      )
    })

    const filteredShifts = allMatchingJobs.filter(j => {
      if (!j.date) return false
      if (invoiceStartDate && j.date < invoiceStartDate) return false
      if (invoiceEndDate && j.date > invoiceEndDate) return false
      return true
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    const totalHours = filteredShifts.reduce((sum, j) => sum + (Number(j.duty_hours) || 0), 0)
    const totalOT = filteredShifts.reduce((sum, j) => sum + calcJobOTHours(j), 0)
    const recordedCharges = filteredShifts.reduce((sum, j) => sum + (Number(j.charges) || 0), 0)

    const matchedContract = contractsByClientName.get(invoiceClient.name.toLowerCase().trim())

    let baseSubtotal = 0
    if (invoicePricingModel === 'shift_charges') {
      baseSubtotal = recordedCharges > 0 ? recordedCharges : (totalHours * invoiceHourlyRate)
    } else if (invoicePricingModel === 'hourly_rate') {
      baseSubtotal = totalHours * (Number(invoiceHourlyRate) || 0)
    } else if (invoicePricingModel === 'contract' && matchedContract) {
      baseSubtotal = Number(matchedContract.amount) || 0
    } else if (invoicePricingModel === 'custom_total') {
      baseSubtotal = Number(invoiceCustomAmount) || 0
    } else {
      baseSubtotal = recordedCharges || (totalHours * 35)
    }

    let lineItems: InvoiceLineItem[] = []
    if (invoiceType === 'simple') {
      lineItems = [
        {
          description: `Consolidated Monthly Cleaning Services (${formatDisplayDate(invoiceStartDate) || invoiceStartDate} to ${formatDisplayDate(invoiceEndDate) || invoiceEndDate}) — ${filteredShifts.length} visits, ${totalHours} duty hours${totalOT > 0 ? `, ${totalOT}h OT` : ''}`,
          quantity: 1,
          unit_price: baseSubtotal,
          amount: baseSubtotal,
        },
      ]
    } else {
      if (filteredShifts.length > 0) {
        lineItems = filteredShifts.map((j) => {
          const hours = Number(j.duty_hours) || 0
          const shiftCharge = Number(j.charges) || (invoicePricingModel === 'hourly_rate' ? hours * invoiceHourlyRate : baseSubtotal / Math.max(1, filteredShifts.length))
          const ot = calcJobOTHours(j)
          const cleaner = j.staff_name ? `Staff: ${j.staff_name}` : ''
          const times = (j.start_time && j.end_time) ? `${j.start_time} - ${j.end_time}` : ''
          const desc = `${formatDate(j.date)} — ${j.service || 'Cleaning Shift'} ${times ? `(${times})` : ''} ${cleaner ? `[${cleaner}]` : ''} [${hours}h${ot > 0 ? ` + ${ot}h OT` : ''}] ${j.remarks ? `· ${j.remarks}` : ''}`
          return {
            description: desc.trim(),
            quantity: hours || 1,
            unit_price: hours > 0 ? Math.round((shiftCharge / hours) * 100) / 100 : shiftCharge,
            amount: Math.round(shiftCharge * 100) / 100,
          }
        })
      } else {
        lineItems = [
          {
            description: `Monthly Cleaning Services (${formatDisplayDate(invoiceStartDate) || invoiceStartDate} to ${formatDisplayDate(invoiceEndDate) || invoiceEndDate})`,
            quantity: 1,
            unit_price: baseSubtotal,
            amount: baseSubtotal,
          },
        ]
      }
    }

    let subtotal = baseSubtotal
    if (invoiceType === 'detailed' && lineItems.length > 0) {
      if (invoicePricingModel !== 'custom_total' && invoicePricingModel !== 'contract') {
        subtotal = Math.round(lineItems.reduce((acc, it) => acc + it.amount, 0) * 100) / 100
      }
    }

    const vatAmount = invoiceIncludeVat ? Math.round(subtotal * 0.05 * 100) / 100 : 0
    const grandTotal = Math.round((subtotal + vatAmount) * 100) / 100

    return {
      shifts: filteredShifts,
      totalHours,
      totalOT,
      subtotal,
      vatAmount,
      grandTotal,
      lineItems,
    }
  }, [
    invoiceClient,
    dailyJobs,
    invoiceStartDate,
    invoiceEndDate,
    invoiceType,
    invoicePricingModel,
    invoiceHourlyRate,
    invoiceCustomAmount,
    invoiceIncludeVat,
    contractsByClientName,
  ])

  const handlePrintGeneratedInvoice = () => {
    if (!invoiceClient) return
    const win = window.open('', '_blank', 'width=880,height=800')
    if (!win) {
      notify.error('Pop-up blocked! Please allow popups to print/download invoice.')
      return
    }

    const { lineItems, subtotal, vatAmount, grandTotal, totalHours, shifts } = invoiceCalculations

    const tableRows = lineItems.map((item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-weight: 500; color: #1e293b; font-size: 12.5px;">
          ${invoiceType === 'detailed' ? `<span style="color:#64748b;font-weight:600;margin-right:6px;">${idx + 1}.</span>` : ''}
          ${item.description}
        </td>
        <td style="padding: 10px 12px; text-align: center; color: #475569; font-size: 12.5px;">${item.quantity}</td>
        <td style="padding: 10px 12px; text-align: right; color: #475569; font-size: 12.5px;">AED ${Number(item.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a; font-size: 12.5px;">AED ${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `).join('')

    win.document.write(`<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${invoiceNumber} - ${invoiceClient.name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 40px; color: #0f172a; font-size: 13px; line-height: 1.5; background: #fff; }
        .invoice-card { max-width: 820px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #0d9488; margin-bottom: 24px; }
        .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .logo-box { width: 38px; height: 38px; border-radius: 10px; background: #0d9488; color: white; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; }
        .brand-title { font-size: 18px; font-weight: 800; color: #0f172a; }
        .company-info { font-size: 11.5px; color: #475569; line-height: 1.45; }
        .invoice-title-block { text-align: right; }
        .invoice-title { font-size: 26px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
        .invoice-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #ccfbf1; color: #0f766e; margin-top: 4px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
        .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
        .meta-label { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 6px; }
        .meta-val { font-size: 14px; font-weight: 700; color: #0f172a; }
        .meta-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
        .meta-row span:first-child { color: #64748b; }
        .meta-row span:last-child { font-weight: 600; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th { background: #f1f5f9; padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
        .totals-section { display: flex; justify-content: flex-end; margin-bottom: 28px; }
        .totals-box { width: 300px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12.5px; color: #475569; }
        .grand-total-row { display: flex; justify-content: space-between; padding-top: 10px; margin-top: 6px; border-top: 2px solid #0f172a; font-size: 16px; font-weight: 900; color: #0f172a; }
        .bank-box { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; font-size: 11.5px; color: #134e4a; }
        .bank-title { font-weight: 800; font-size: 12px; margin-bottom: 4px; text-transform: uppercase; }
        .footer { border-top: 1px solid #e2e8f0; padding-top: 14px; text-align: center; font-size: 11px; color: #94a3b8; }
        @media print {
          body { padding: 15px; }
          .invoice-card { max-width: 100%; }
        }
      </style>
    </head>
    <body>
      <div class="invoice-card">
        <div class="header">
          <div>
            <div class="brand">
              <div class="logo-box">S</div>
              <span class="brand-title">Safaeewala Cleaning &amp; Maintenance LLC</span>
            </div>
            <div class="company-info">
              <div>Dubai, United Arab Emirates</div>
              <div><strong>TRN:</strong> 100234567890003</div>
              <div><strong>Contact:</strong> +971 55 628 2374 · info@safaeewala.com</div>
            </div>
          </div>
          <div class="invoice-title-block">
            <div class="invoice-title">TAX INVOICE</div>
            <div style="font-family: monospace; font-size: 13px; font-weight: 700; color: #0d9488; margin-top: 2px;">${invoiceNumber}</div>
            <div class="invoice-badge">${invoiceType === 'detailed' ? 'Itemized Shifts Invoice' : 'Consolidated Invoice'}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-box">
            <div class="meta-label">Billed To (Client)</div>
            <div class="meta-val">${invoiceClient.name}</div>
            <div style="font-size: 12px; color: #475569; margin-top: 3px;">${invoiceClient.rawAddress || 'Dubai'}</div>
            <div style="font-size: 12px; color: #475569; margin-top: 2px;">Area: ${invoiceClient.area || 'Dubai'}</div>
            <div style="font-size: 12px; color: #0d9488; font-weight: 600; margin-top: 4px;">Account: Monthly Client</div>
          </div>

          <div class="meta-box">
            <div class="meta-label">Invoice Details</div>
            <div class="meta-row"><span>Billing Cycle:</span> <span>${formatDisplayDate(invoiceStartDate) || invoiceStartDate} — ${formatDisplayDate(invoiceEndDate) || invoiceEndDate}</span></div>
            <div class="meta-row"><span>Issue Date:</span> <span>${invoiceIssueDate}</span></div>
            <div class="meta-row"><span>Due Date:</span> <span>${invoiceDueDate}</span></div>
            <div class="meta-row"><span>Total Visits:</span> <span>${shifts.length} shifts (${totalHours}h)</span></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align: left;">Service Description &amp; Shift Breakdown</th>
              <th style="text-align: center; width: 60px;">Qty/Hrs</th>
              <th style="text-align: right; width: 110px;">Unit Rate</th>
              <th style="text-align: right; width: 120px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="totals-section">
          <div class="totals-box">
            <div class="total-row"><span>Subtotal</span><span>AED ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div class="total-row"><span>UAE VAT (${invoiceIncludeVat ? '5%' : '0%'})</span><span>AED ${vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div class="grand-total-row"><span>Total Due (AED)</span><span style="color: #0d9488;">AED ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          </div>
        </div>

        <div class="bank-box">
          <div class="bank-title">Bank Transfer &amp; Payment Details</div>
          <div><strong>Bank:</strong> Commercial Bank of Dubai / First Abu Dhabi Bank (FAB)</div>
          <div><strong>Account Name:</strong> Safaeewala Cleaning &amp; Maintenance LLC</div>
          <div><strong>IBAN:</strong> AE000000000000000000000</div>
          <div><strong>Notes:</strong> ${invoiceNotes || 'Payment due within 7 days. Please mention invoice number in reference.'}</div>
        </div>

        <div class="footer">
          Safaeewala LLC · Professional Cleaning Services Across Dubai · Call/WhatsApp: +971 55 628 2374
        </div>
      </div>
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>`)
    win.document.close()
  }

  const handleSaveInvoiceToSystem = () => {
    if (!invoiceClient) return
    const { lineItems, subtotal, vatAmount, grandTotal } = invoiceCalculations

    const matchedRegistered = clients.find(
      x => x.id === invoiceClient.matchedClientId || x.full_name.toLowerCase() === invoiceClient.name.toLowerCase()
    )

    addInvoice({
      invoice_number: invoiceNumber,
      client_id: matchedRegistered?.id || invoiceClient.id,
      client_name: invoiceClient.name,
      client_address: invoiceClient.rawAddress || invoiceClient.area || 'Dubai',
      company_trn: '100234567890003',
      line_items: lineItems,
      subtotal,
      vat_amount: vatAmount,
      vat_rate: invoiceIncludeVat ? 5 : 0,
      total: grandTotal,
      status: 'sent',
      due_date: invoiceDueDate,
      notes: invoiceNotes,
    })

    setInvoiceSuccessMsg(`Invoice ${invoiceNumber} created and saved to system successfully!`)
  }

  const handleShareWhatsAppInvoice = () => {
    if (!invoiceClient) return
    const { subtotal, vatAmount, grandTotal, totalHours, shifts } = invoiceCalculations
    const matchedClient = clients.find(
      c => c.id === invoiceClient.matchedClientId || c.full_name.toLowerCase() === invoiceClient.name.toLowerCase()
    )
    const phone = (matchedClient?.whatsapp || matchedClient?.phone || '').replace(/\D/g, '')

    const lines = [
      `Dear ${invoiceClient.name},`,
      ``,
      `*🧹 Safaeewala LLC — Tax Invoice*`,
      `*Invoice No:* ${invoiceNumber}`,
      `*Period:* ${formatDisplayDate(invoiceStartDate) || invoiceStartDate} to ${formatDisplayDate(invoiceEndDate) || invoiceEndDate}`,
      `*Services:* ${invoiceType === 'detailed' ? 'Itemized Shift Breakdown' : 'Consolidated Monthly Cleaning'}`,
      `*Visits Logged:* ${shifts.length} shifts (${totalHours} duty hours)`,
      ``,
      `Subtotal: AED ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `VAT (5%): AED ${vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `*Grand Total: AED ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`,
      `*Due Date:* ${invoiceDueDate}`,
      ``,
      `*Payment Details (Bank Transfer):*`,
      `Account: Safaeewala Cleaning & Maintenance LLC`,
      `Bank: Commercial Bank of Dubai / FAB`,
      `IBAN: AE000000000000000000000`,
      ``,
      `Thank you for your business! 🙏`,
      `Safaeewala LLC · +971 55 628 2374`,
    ].join('\n')

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines)}`, '_blank')
  }

  // ── Modular Widgets for Sidebar or Underneath Datatable ──
  const renderTopChargesWidget = () => (
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
                  <span className="font-bold text-teal-700 shrink-0">
                    AED {c.totalCharges.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderOTLeadersWidget = () => (
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
  )

  const renderAreaDensityWidget = () => (
    Object.keys(areaCounts).length > 0 ? (
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
                  <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    ) : null
  )

  const renderMonthlyClientsTable = () => (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-slate-100 bg-[#f8fafc]/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-3.5 px-4">Client & Contract</th>
              <th className="py-3.5 px-3">Location & Schedule</th>
              <th className="py-3.5 px-3">Assigned Staff</th>
              <th className="py-3.5 px-3 text-center">Visits & Hours</th>
              <th className="py-3.5 px-3 text-right">Billed / Received</th>
              <th className="py-3.5 px-3 text-center">Balance Due</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredSummaries.map((c, idx) => {
              const matchedContract = contractsByClientName.get(c.name.toLowerCase().trim())
              const clientPaymentsList = paymentsByClient.get(c.name.trim().toLowerCase()) || []
              const clientRecordedAmt = clientPaymentsList.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
              const totalClientReceived = c.totalReceived + clientRecordedAmt
              const clientBalanceDue = Math.max(0, c.totalCharges - totalClientReceived)

              return (
                <tr
                  key={c.id}
                  onClick={() => setSelectedSummary(c)}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                >
                  {/* 1. Client & Contract */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} size="sm" idx={idx} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-[#111827] group-hover:text-teal-700 transition-colors truncate">
                            {c.name}
                          </span>
                          <span className="text-[9.5px] font-bold bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                            Monthly
                          </span>
                        </div>
                        {matchedContract && (
                          <p className="text-[11px] text-blue-700 font-semibold mt-0.5 flex items-center gap-1 truncate">
                            <RotateCw size={10} className="shrink-0" />
                            <span>AED {matchedContract.amount}/{matchedContract.frequency === 'weekly' ? 'wk' : matchedContract.frequency === 'biweekly' ? '2wk' : 'mo'}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 2. Location & Schedule */}
                  <td className="py-3.5 px-3">
                    <p className="font-medium text-slate-800 flex items-center gap-1 truncate max-w-[200px]">
                      <MapPin size={11.5} className="shrink-0 text-slate-400" />
                      <span>{c.area || 'Dubai'}</span>
                    </p>
                    {c.service_days && c.service_days.filter(d => d.toLowerCase() !== 'sunday').length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        {c.service_days.filter(d => d.toLowerCase() !== 'sunday').slice(0, 3).map(d => (
                          <span key={d} className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-1.5 py-0.2 rounded text-[9px]">
                            {d.slice(0, 3)}
                          </span>
                        ))}
                        {c.service_days.filter(d => d.toLowerCase() !== 'sunday').length > 3 && (
                          <span className="text-[9.5px] text-slate-400 font-bold">+{c.service_days.filter(d => d.toLowerCase() !== 'sunday').length - 3}</span>
                        )}
                        {c.scheduled_time && (
                          <span className="text-slate-500 font-medium text-[10px] ml-0.5">
                            {c.scheduled_time}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {c.lastService ? `Last: ${formatDisplayDate(c.lastService)}` : 'No recurring schedule'}
                      </p>
                    )}
                  </td>

                  {/* 3. Assigned Staff */}
                  <td className="py-3.5 px-3">
                    {c.day_cleaner_assignments && Object.keys(c.day_cleaner_assignments).length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap max-w-[220px]">
                        {Object.entries(c.day_cleaner_assignments).slice(0, 2).map(([day, cleaner]) => (
                          <span key={day} className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded text-[10px] font-medium border border-slate-200/60 truncate max-w-[120px]">
                            {day.slice(0, 3)}: {cleaner}
                          </span>
                        ))}
                        {Object.keys(c.day_cleaner_assignments).length > 2 && (
                          <span className="text-slate-400 font-medium text-[10px]">
                            +{Object.keys(c.day_cleaner_assignments).length - 2}
                          </span>
                        )}
                      </div>
                    ) : c.cleaners.length > 0 ? (
                      <p className="text-[11.5px] text-slate-700 font-medium truncate max-w-[180px]">
                        {c.cleaners.join(', ')}
                      </p>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Unassigned</span>
                    )}
                  </td>

                  {/* 4. Visits & Hours */}
                  <td className="py-3.5 px-3 text-center">
                    <div className="inline-flex flex-col items-center">
                      <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">
                        {c.visitsCount} visits · {c.totalDutyHours}h
                      </span>
                      {c.totalOTHours > 0 && (
                        <span className="mt-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded-full">
                          +{c.totalOTHours}h OT
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 5. Charges / Received */}
                  <td className="py-3.5 px-3 text-right">
                    <p className="font-extrabold text-[#111827]">AED {c.totalCharges.toLocaleString()}</p>
                    <p className="text-[11px] text-emerald-600 font-semibold">
                      Rec: AED {totalClientReceived.toLocaleString()}
                    </p>
                  </td>

                  {/* 6. Balance Due */}
                  <td className="py-3.5 px-3 text-center">
                    {clientBalanceDue > 0 ? (
                      <span className="inline-block text-[10.5px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full">
                        Due: AED {clientBalanceDue.toLocaleString()}
                      </span>
                    ) : c.totalCharges > 0 ? (
                      <span className="inline-block text-[10.5px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                        Paid in Full ✓
                      </span>
                    ) : (
                      <span className="inline-block text-[10.5px] font-semibold bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full">
                        No charges
                      </span>
                    )}
                  </td>

                  {/* 7. Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleOpenCreateInvoice(c)}
                        className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-400 hover:text-teal-700 transition-colors"
                        title="Invoice"
                      >
                        <FileText size={13.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenRecordPayment(c.name, clientBalanceDue > 0 ? clientBalanceDue : undefined)}
                        className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 transition-colors"
                        title="Record Payment"
                      >
                        <CreditCard size={13.5} />
                      </button>
                      <Link
                        to={`/clients/${c.id}`}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                        title="Profile / Contact"
                      >
                        <Phone size={13.5} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setSelectedSummary(c)}
                        className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-700 transition-colors"
                        title="View Shifts"
                      >
                        <Clock size={13.5} />
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
    <div className="space-y-6">
      {/* Notification banner for payment actions */}
      {paymentNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span className="text-[13px] font-bold">{paymentNotice}</span>
          </div>
          <button
            onClick={() => setPaymentNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 text-[13px] font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Hero with Unified Summary */}
      <PageHero
        title="Monthly Clients & Contracts"
        subtitle={`${monthlySummaries.length} Monthly Clients · Billed: AED ${totalMonthlyCharges.toLocaleString()} · Received: AED ${(totalMonthlyReceived + totalPaymentsRecorded).toLocaleString()}`}
        statusChip={`${activeRange.label} · ${totalOTHours}h OT · ${totalVisits} Shifts`}
        actionLabel="Record Payment"
        onAction={() => handleOpenRecordPayment()}
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="h-11 px-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-semibold text-sm backdrop-blur-sm transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Add Client</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddContract()}
              className="h-11 px-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-semibold text-sm backdrop-blur-sm transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>New Contract</span>
            </button>
          </>
        }
        showSearch={false}
      />

      {/* Unified Executive KPI Cards (Real Cashflow & Payments) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Monthly Clients */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-teal-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Monthly Clients</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
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

        {/* Card 3: Payments Received (Replaced theoretical Contract MRR) */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payments Received</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-emerald-700">AED {(totalMonthlyReceived + totalPaymentsRecorded).toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{payments.length} payment{payments.length === 1 ? '' : 's'} recorded</p>
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
            <p className="text-[11px] text-slate-400 mt-0.5">From Daily Job Sheet</p>
          </div>
        </div>

        {/* Card 5: Pending Balance */}
        <div className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex flex-col justify-between hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pending Balance</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Calendar size={16} />
            </div>
          </div>
          <div>
            <p className="text-[22px] font-extrabold text-amber-900">AED {totalMonthlyBalanceDue.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Uncollected monthly dues</p>
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
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users size={15} />
            <span>Monthly Service Clients</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'clients' ? 'bg-teal-700/60 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {monthlySummaries.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'payments'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CreditCard size={15} />
            <span>Recorded Payments</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'payments' ? 'bg-emerald-700/60 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {payments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('contracts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'contracts'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <RotateCw size={15} />
            <span>Recurring Contracts</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'contracts' ? 'bg-blue-700/60 text-white' : 'bg-blue-100 text-blue-800'}`}>
              {activeContracts.length} Active
            </span>
          </button>

          <button
            onClick={() => setActiveTab('recruitment')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'recruitment'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Briefcase size={15} />
            <span>Recruitment & Coverage</span>
          </button>
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
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Calendar size={18} />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[17px] font-extrabold text-[#111827]">
                    {activeRange.label}
                  </h2>
                  <span className="text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
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
                          ? 'bg-teal-600 text-white shadow-xs'
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
                      ? 'border-teal-500 bg-teal-50 text-teal-900 shadow-xs'
                      : 'border-[#E4E8EC] bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                  title="All Date Range Options"
                >
                  <Calendar size={13} className="text-teal-600" />
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
                          className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
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
                                datePreset === p.id ? 'bg-teal-50 text-teal-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{p.label}</span>
                              {datePreset === p.id && <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />}
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
                                datePreset === p.id ? 'bg-teal-50 text-teal-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="truncate">{p.label}</span>
                              {datePreset === p.id && <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />}
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
                                className="w-full text-[11px] px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-400"
                              />
                            </div>
                            <div>
                              <label className="text-[10.5px] font-medium text-slate-500 block mb-0.5">End Date</label>
                              <input
                                type="date"
                                value={customEndDate}
                                onChange={e => setCustomEndDate(e.target.value)}
                                className="w-full text-[11px] px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-400"
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
                            className="w-full py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11.5px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
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

          {/* Toolbar (Full Width across table/grid views) */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by client name, address, cleaner…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-400 placeholder-slate-400 transition-colors"
                />
              </div>

              <select
                value={areaFilter}
                onChange={e => setAreaFilter(e.target.value)}
                className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-400 text-slate-700 cursor-pointer"
              >
                <option value="all">All Areas ({areas.length})</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>

              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as typeof sortOrder)}
                className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-400 text-slate-700 cursor-pointer font-medium"
              >
                <option value="top_charges">Sort: Highest Charges</option>
                <option value="top_ot">Sort: Highest Overtime (OT)</option>
                <option value="visits">Sort: Most Visits</option>
                <option value="name">Sort: Name (A-Z)</option>
              </select>

              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === 'grid' ? 'bg-white text-teal-700 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Grid Card View"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === 'table' ? 'bg-white text-teal-700 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Table View (Full Width)"
                >
                  <List size={15} />
                </button>
              </div>

              {/* Result counter */}
              <div className="ml-auto text-right shrink-0">
                <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/60">
                  Showing <span className="text-teal-700 font-extrabold">{filteredSummaries.length}</span> of {monthlySummaries.length} clients
                </span>
              </div>
            </div>
          </div>

          {/* Conditional Layout: Full Width Table View with Widgets Underneath OR Grid Card View with Widgets on Right */}
          {viewMode === 'table' ? (
            <div className="space-y-6">
              {filteredSummaries.length === 0 ? (
                <div className="bg-white rounded-[22px] border border-[#E4E8EC] py-16 text-center">
                  <Users className="mx-auto mb-3 text-slate-300" size={44} strokeWidth={1.25} />
                  <p className="text-[14px] font-bold text-slate-700">No Monthly Clients Found</p>
                  <p className="text-[12px] text-slate-400 mt-1">
                    {activeRange.isAllTime
                      ? 'No clients with monthly payment mode found in Daily Job Sheet.'
                      : `No monthly records found for ${activeRange.label}. Try selecting another date range above.`}
                  </p>
                </div>
              ) : (
                renderMonthlyClientsTable()
              )}

              {/* ── Widgets Underneath Datatable (Responsive 3-Column Grid) ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                {renderTopChargesWidget()}
                {renderOTLeadersWidget()}
                {renderAreaDensityWidget()}
              </div>
            </div>
          ) : (
            /* ── GRID CARD VIEW (2 cols cards + 1 col widgets sidebar) ── */
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              {/* Left 2 Cols: Monthly Clients List */}
              <div className="xl:col-span-2 space-y-4">
                {/* Monthly Client Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSummaries.map((c, idx) => {
                    const matchedContract = contractsByClientName.get(c.name.toLowerCase().trim())
                    const clientPaymentsList = paymentsByClient.get(c.name.trim().toLowerCase()) || []
                    const clientRecordedAmt = clientPaymentsList.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
                    const totalClientReceived = c.totalReceived + clientRecordedAmt
                    const clientBalanceDue = Math.max(0, c.totalCharges - totalClientReceived)

                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedSummary(c)}
                        className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 cursor-pointer hover:shadow-[0_8px_30px_rgba(13,148,136,0.12)] hover:border-teal-300 transition-all group flex flex-col justify-between"
                      >
                        <div>
                          {/* Top: Avatar, Name, Charges & Payment Status */}
                          <div className="flex items-start gap-3 mb-3">
                            <Avatar name={c.name} size="md" idx={idx} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-[14px] font-bold text-[#111827] group-hover:text-teal-700 transition-colors truncate">
                                  {c.name}
                                </p>
                                <span className="text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.2 rounded-full uppercase tracking-wider">
                                  Monthly
                                </span>
                                {matchedContract && (
                                  <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.2 rounded-full flex items-center gap-1">
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
                              <p className="text-[10.5px] text-slate-400 font-medium">Billed</p>
                              <div className="mt-1">
                                {clientBalanceDue > 0 ? (
                                  <span className="inline-block text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                                    Due: AED {clientBalanceDue.toLocaleString()}
                                  </span>
                                ) : c.totalCharges > 0 ? (
                                  <span className="inline-block text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                                    Paid in Full ✓
                                  </span>
                                ) : (
                                  <span className="inline-block text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                    No charges
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Service & Cleaner Details */}
                          <div className="bg-[#f8fafc] rounded-xl p-2.5 border border-[#edf2f7] mb-3 text-[12px] text-slate-600">
                            <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-[12px]">
                              <Calendar size={13} className="text-[#0d8a72] shrink-0" />
                              <span className="text-slate-400 font-medium text-[11px]">Last Service:</span>
                              <span className="text-slate-800 font-bold">
                                {c.lastService ? (formatDisplayDate(c.lastService) || formatDate(c.lastService)) : 'No service logged'}
                              </span>
                            </div>

                            {/* Recurring Schedule Days & Timing Slot */}
                            {c.service_days && c.service_days.filter(d => d.toLowerCase() !== 'sunday').length > 0 && (
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px]">
                                <span className="text-slate-400 font-medium text-[10.5px]">Days:</span>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {c.service_days.filter(d => d.toLowerCase() !== 'sunday').map(d => (
                                    <span key={d} className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-1.5 py-0.2 rounded text-[9.5px]">
                                      {d.slice(0, 3)}
                                    </span>
                                  ))}
                                </div>
                                {c.scheduled_time && (
                                  <span className="text-slate-600 font-semibold text-[10.5px] flex items-center gap-0.5">
                                    <Clock size={10} className="text-slate-400" />
                                    {c.scheduled_time}{c.end_time ? `–${c.end_time}` : ''}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Cleaners & Day-by-Day Staff Assignment */}
                            {c.day_cleaner_assignments && Object.keys(c.day_cleaner_assignments).length > 0 ? (
                              <div className="mt-1.5 flex items-center gap-1 flex-wrap text-[10.5px]">
                                <span className="text-slate-400 font-normal">Staff:</span>
                                {Object.entries(c.day_cleaner_assignments).slice(0, 3).map(([day, cleaner]) => (
                                  <span key={day} className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium border border-slate-200/60">
                                    {day.slice(0, 3)}: {cleaner}
                                  </span>
                                ))}
                                {Object.keys(c.day_cleaner_assignments).length > 3 && (
                                  <span className="text-slate-400 font-medium">
                                    +{Object.keys(c.day_cleaner_assignments).length - 3} more
                                  </span>
                                )}
                              </div>
                            ) : c.cleaners.length > 0 ? (
                              <p className="text-[11px] text-slate-500 mt-1.5 truncate flex items-center gap-1">
                                <span className="text-slate-400 font-normal">Cleaners:</span>
                                <span className="text-slate-700 font-medium">{c.cleaners.join(', ')}</span>
                              </p>
                            ) : null}
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

                        {/* Card Footer: Action Buttons in a Single Compact Row (Invoice, Payment, Contact, View Shift) */}
                        <div className="grid grid-cols-4 gap-1.5 pt-2.5 border-t border-slate-100 mt-2 w-full">
                          {/* 1. Invoice Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenCreateInvoice(c)
                            }}
                            className="h-8 px-1.5 py-1 rounded-lg text-[10px] sm:text-[10.5px] font-bold text-teal-800 hover:text-white bg-teal-50 hover:bg-teal-600 border border-teal-200/90 transition-all flex items-center justify-center gap-1 cursor-pointer truncate shadow-2xs group/btn"
                            title="Generate Simple or Detailed Invoice with custom date range"
                          >
                            <FileText size={11.5} className="shrink-0 text-teal-600 group-hover/btn:text-white" />
                            <span className="truncate">Invoice</span>
                          </button>

                          {/* 2. Payment Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenRecordPayment(c.name, clientBalanceDue > 0 ? clientBalanceDue : undefined)
                            }}
                            className="h-8 px-1.5 py-1 rounded-lg text-[10px] sm:text-[10.5px] font-bold text-emerald-800 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200 transition-all flex items-center justify-center gap-1 cursor-pointer truncate shadow-2xs group/btn"
                            title="Record payment for this client"
                          >
                            <CreditCard size={11.5} className="shrink-0 text-emerald-600 group-hover/btn:text-white" />
                            <span className="truncate">Payment</span>
                          </button>

                          {/* 3. Contact Button */}
                          <Link
                            to={`/clients/${c.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="h-8 px-1.5 py-1 rounded-lg text-[10px] sm:text-[10.5px] font-bold text-slate-700 hover:text-white bg-slate-100 hover:bg-slate-700 border border-slate-200 transition-all flex items-center justify-center gap-1 cursor-pointer truncate shadow-2xs group/btn"
                            title="Contact & Full Client Profile"
                          >
                            <Phone size={11.5} className="shrink-0 text-slate-500 group-hover/btn:text-white" />
                            <span className="truncate">Contact</span>
                          </Link>

                          {/* 4. View Shift Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedSummary(c)
                            }}
                            className="h-8 px-1.5 py-1 rounded-lg text-[10px] sm:text-[10.5px] font-bold text-indigo-800 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200 transition-all flex items-center justify-center gap-1 cursor-pointer truncate shadow-2xs group/btn"
                            title="View Shifts & Service Schedule"
                          >
                            <Clock size={11.5} className="shrink-0 text-indigo-600 group-hover/btn:text-white" />
                            <span className="truncate">View Shift</span>
                          </button>
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

              {/* Right Sidebar Widgets */}
              <div className="space-y-5">
                {renderTopChargesWidget()}
                {renderOTLeadersWidget()}
                {renderAreaDensityWidget()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: RECORDED CLIENT PAYMENTS LOG
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[260px] flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search payments by client, reference #, month…"
                  value={paymentSearch}
                  onChange={e => setPaymentSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 placeholder-slate-400 transition-colors"
                />
              </div>

              <select
                value={paymentMethodFilter}
                onChange={e => setPaymentMethodFilter(e.target.value as any)}
                className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 text-slate-700 cursor-pointer font-medium"
              >
                <option value="all">All Payment Methods</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Online">Online Payment</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-right">
                <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">Total Filtered</span>
                <span className="text-[15px] font-black text-emerald-700">
                  AED {filteredPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0).toLocaleString()}
                </span>
              </div>
              <Button
                onClick={() => handleOpenRecordPayment()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12px] h-10 px-4 shadow-xs"
              >
                <Plus size={14} className="mr-1" /> Record New Payment
              </Button>
            </div>
          </div>

          {/* Payments Table */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Client Name</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Reference / Cheque #</th>
                    <th className="py-3 px-4">Billing Month</th>
                    <th className="py-3 px-4">Remarks / Notes</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {filteredPayments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {p.date ? formatDate(p.date) : '—'}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                        {p.clientName}
                      </td>
                      <td className="py-3 px-4 font-black text-emerald-700 whitespace-nowrap">
                        AED {Number(p.amount || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                          p.paymentMethod === 'Bank Transfer' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          p.paymentMethod === 'Cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          p.paymentMethod === 'Cheque' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          p.paymentMethod === 'Credit Card' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          'bg-teal-50 text-teal-700 border-teal-200'
                        }`}>
                          <CreditCard size={11} />
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[12px] whitespace-nowrap">
                        {p.referenceNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                        {p.invoiceMonth || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 italic max-w-[200px] truncate" title={p.notes}>
                        {p.notes || '—'}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => deletePayment(p.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                          title="Delete Payment Record"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredPayments.length === 0 && (
                <div className="py-16 text-center">
                  <CreditCard className="mx-auto mb-3 text-slate-300" size={42} />
                  <p className="text-[14px] font-bold text-slate-700">No Recorded Payments</p>
                  <p className="text-[12px] text-slate-400 mt-1">
                    {paymentSearch || paymentMethodFilter !== 'all'
                      ? 'No payments match your search filter.'
                      : 'Record client payments here to track collections against monthly charges.'}
                  </p>
                  <Button
                    onClick={() => handleOpenRecordPayment()}
                    className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  >
                    <Plus size={14} className="mr-1" /> Record First Payment
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 3: RECURRING CONTRACTS & SUBSCRIPTIONS (Merged from Subscriptions)
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
                  <span className="font-bold text-teal-600">{monthlySummaries.length} clients</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: '100%' }} />
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
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-teal-50 text-[12px] flex items-center justify-between transition-colors cursor-pointer"
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
      {selectedSummary && (() => {
        const clientKey = selectedSummary.name.trim().toLowerCase()
        const clientPaymentsList = paymentsByClient.get(clientKey) || []
        const clientRecordedAmt = clientPaymentsList.reduce((s, p) => s + (Number(p.amount) || 0), 0)
        const clientTotalReceived = selectedSummary.totalReceived + clientRecordedAmt
        const clientBalanceDue = Math.max(0, selectedSummary.totalCharges - clientTotalReceived)

        return (
          <Modal
            open={!!selectedSummary}
            onClose={() => setSelectedSummary(null)}
            title={`Monthly Client Details — ${selectedSummary.name}`}
            size="xl"
          >
            <div className="space-y-5">
              {/* Header info bar */}
              <div className="bg-gradient-to-r from-teal-50 via-slate-50 to-white rounded-2xl p-4 border border-teal-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedSummary.name} size="lg" idx={0} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[17px] font-extrabold text-[#111827]">{selectedSummary.name}</h3>
                      <span className="text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full uppercase">
                        Monthly
                      </span>
                      {contractsByClientName.get(clientKey) && (
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
                  <Button
                    onClick={() => handleOpenRecordPayment(selectedSummary.name, clientBalanceDue > 0 ? clientBalanceDue : undefined)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[12.5px] font-bold shadow-xs cursor-pointer"
                  >
                    <DollarSign size={13} /> Record Payment
                  </Button>
                  <Button
                    onClick={() => handleOpenCreateInvoice(selectedSummary)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-[12.5px] font-bold shadow-xs cursor-pointer"
                  >
                    <FileText size={13} /> Create Invoice
                  </Button>
                  <Link
                    to={`/clients/${selectedSummary.id}`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-[12.5px] font-bold transition-all shadow-xs"
                  >
                    <ExternalLink size={13} /> View Full Profile
                  </Link>
                </div>
              </div>

              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-teal-50/70 border border-teal-100 rounded-xl p-3 text-center">
                  <p className="text-[10.5px] font-bold text-teal-800 uppercase tracking-wider">Total Charges</p>
                  <p className="text-[18px] font-extrabold text-teal-900 mt-0.5">AED {selectedSummary.totalCharges.toLocaleString()}</p>
                  <span className="text-[10.5px] text-teal-600 font-medium">{selectedSummary.jobs.length} shifts billed</span>
                </div>
                <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wider">Payments Collected</p>
                  <p className="text-[18px] font-extrabold text-emerald-900 mt-0.5">AED {clientTotalReceived.toLocaleString()}</p>
                  <span className="text-[10.5px] text-emerald-600 font-medium">
                    {clientRecordedAmt > 0 ? `Incl. AED ${clientRecordedAmt.toLocaleString()} recorded` : 'From shift collections'}
                  </span>
                </div>
                <div className={`border rounded-xl p-3 text-center ${clientBalanceDue > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-teal-50/70 border-teal-200'}`}>
                  <p className={`text-[10.5px] font-bold uppercase tracking-wider ${clientBalanceDue > 0 ? 'text-amber-800' : 'text-teal-800'}`}>
                    {clientBalanceDue > 0 ? 'Balance Due' : 'Payment Status'}
                  </p>
                  <p className={`text-[18px] font-extrabold mt-0.5 ${clientBalanceDue > 0 ? 'text-amber-900' : 'text-teal-900'}`}>
                    {clientBalanceDue > 0 ? `AED ${clientBalanceDue.toLocaleString()}` : 'Paid in Full ✓'}
                  </p>
                  <span className={`text-[10.5px] font-medium ${clientBalanceDue > 0 ? 'text-amber-700' : 'text-teal-700'}`}>
                    {clientBalanceDue > 0 ? 'Pending payment' : 'No balance due'}
                  </span>
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 text-center">
                  <p className="text-[10.5px] font-bold text-blue-800 uppercase tracking-wider">Visits & Duty</p>
                  <p className="text-[18px] font-extrabold text-blue-900 mt-0.5">{selectedSummary.visitsCount} shifts</p>
                  <span className="text-[10.5px] text-blue-600 font-medium">
                    {selectedSummary.totalDutyHours}h duty · {selectedSummary.totalOTHours}h OT
                  </span>
                </div>
              </div>

              {/* Recurring Service Schedule & Staff Assignment (if configured) */}
              {(selectedSummary.service_days?.length || selectedSummary.preferred_cleaner || (selectedSummary.day_cleaner_assignments && Object.keys(selectedSummary.day_cleaner_assignments).length > 0)) && (
                <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-slate-50 rounded-2xl p-4 border border-emerald-100 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                        <Calendar size={14} />
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-extrabold text-[#111827]">Recurring Service Schedule & Assigned Staff</h4>
                        <p className="text-[11px] text-slate-500">Service days, scheduled shift slot, and staff assigned per day</p>
                      </div>
                    </div>
                    {selectedSummary.scheduled_time && (
                      <span className="text-[11.5px] font-bold bg-white text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                        <Clock size={12} className="text-emerald-600" />
                        Shift Timing: <strong>{selectedSummary.scheduled_time} {selectedSummary.end_time ? `– ${selectedSummary.end_time}` : ''}</strong>
                        {selectedSummary.duration_hours ? ` (${selectedSummary.duration_hours} hrs)` : ''}
                      </span>
                    )}
                  </div>

                  {/* Days & Assigned Staff Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {(selectedSummary.service_days || Object.keys(selectedSummary.day_cleaner_assignments || {}))
                      .filter(day => day.toLowerCase() !== 'sunday')
                      .map(day => {
                      const assigned = selectedSummary.day_cleaner_assignments?.[day] || selectedSummary.preferred_cleaner || 'Unassigned'
                      const isCustom = selectedSummary.day_cleaner_assignments?.[day] && selectedSummary.preferred_cleaner && selectedSummary.day_cleaner_assignments[day] !== selectedSummary.preferred_cleaner
                      const daySched = selectedSummary.day_schedules?.[day]
                      return (
                        <div key={day} className="bg-white rounded-xl p-3 border border-emerald-100/80 shadow-2xs flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                {day}
                              </span>
                              {daySched && (
                                <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200">
                                  {daySched.startTime} – {daySched.endTime}
                                </span>
                              )}
                            </div>
                            <p className="text-[13px] font-bold text-[#111827] mt-1.5 flex items-center gap-1">
                              <Users size={12} className="text-slate-400 shrink-0" />
                              <span>{assigned}</span>
                            </p>
                          </div>
                          {isCustom ? (
                            <span className="text-[9.5px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md">
                              ★ Custom Staff
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md">
                              Primary Staff
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Detailed Shifts & Overtime Table from Daily Job Sheet */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-[14px] font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText size={15} className="text-teal-600" />
                    Service Shifts & Overtime Breakdown ({selectedSummary.jobs.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">Fetched from Daily Job Sheet</span>
                </div>

                <div className="border border-[#E4E8EC] rounded-2xl overflow-hidden shadow-xs">
                  <div className="max-h-72 overflow-y-auto">
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
                            <tr key={job.id} className="hover:bg-teal-50/40 transition-colors">
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
                              <td className="py-2.5 px-3 text-right font-extrabold text-teal-700 whitespace-nowrap">
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

              {/* Invoices for this client — part of the client ledger (UX-21) */}
              <ClientInvoicesLedger clientName={selectedSummary.name} />

              {/* Recorded Payments for this Client */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-[14px] font-bold text-slate-800 flex items-center gap-1.5">
                    <CreditCard size={15} className="text-emerald-600" />
                    Recorded Client Payments ({clientPaymentsList.length})
                  </h4>
                  <Button
                    onClick={() => handleOpenRecordPayment(selectedSummary.name, clientBalanceDue > 0 ? clientBalanceDue : undefined)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold h-7 px-2.5 shadow-xs cursor-pointer"
                  >
                    <Plus size={12} className="mr-1" /> Record Payment
                  </Button>
                </div>

                {clientPaymentsList.length > 0 ? (
                  <div className="border border-[#E4E8EC] rounded-2xl overflow-hidden shadow-xs">
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-[12px]">
                        <thead className="bg-[#f8fafc] border-b border-[#E4E8EC] sticky top-0 z-10 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3.5">Date</th>
                            <th className="py-2.5 px-3">Amount</th>
                            <th className="py-2.5 px-3">Method</th>
                            <th className="py-2.5 px-3">Reference / Cheque</th>
                            <th className="py-2.5 px-3">Billing Month</th>
                            <th className="py-2.5 px-3.5">Notes</th>
                            <th className="py-2.5 px-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E4E8EC]">
                          {clientPaymentsList.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2.5 px-3.5 font-semibold text-slate-800 whitespace-nowrap">
                                {p.date ? formatDate(p.date) : '—'}
                              </td>
                              <td className="py-2.5 px-3 font-black text-emerald-700 whitespace-nowrap">
                                AED {Number(p.amount || 0).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                  {p.paymentMethod}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 font-mono text-[11.5px] whitespace-nowrap">
                                {p.referenceNumber || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 font-medium whitespace-nowrap">
                                {p.invoiceMonth || '—'}
                              </td>
                              <td className="py-2.5 px-3.5 text-slate-500 italic max-w-[180px] truncate" title={p.notes}>
                                {p.notes || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => deletePayment(p.id)}
                                  className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                  title="Delete payment"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center">
                    <p className="text-[12px] font-medium text-slate-600">
                      No offline payments recorded yet for {selectedSummary.name}.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Click "Record Payment" to add Bank Transfer, Cash, or Cheque records for this client.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setSelectedSummary(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Add Client Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Add New Monthly Client"
        size="xl"
        headerActions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowModal(false)}
              className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-monthly-client-form"
              size="sm"
              className="h-8 px-4 text-[11.5px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Check size={13} className="stroke-[2.5]" />
              <span>Save Client</span>
            </Button>
          </div>
        }
      >
        <AddMonthlyClientModalForm
          onClose={() => setShowModal(false)}
          onAdd={clientData => {
            addClient(clientData)
            setShowModal(false)
          }}
          employees={employees}
        />
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

      {/* Record Client Payment Modal */}
      <Modal
        open={showRecordPaymentModal}
        onClose={() => setShowRecordPaymentModal(false)}
        title="Record Client Payment"
        size="md"
      >
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault()
            if (!paymentFormClient.trim()) {
              notify.error('Please enter or select a client name.')
              return
            }
            // Payments must belong to a known monthly client, so balances add up (UX-21)
            const matched = monthlySummaries.find(c => normalizeKey(c.name) === normalizeKey(paymentFormClient))
            if (!matched) {
              notify.error('Pick the client from the list — no monthly client has that name.')
              return
            }
            const amt = Number(paymentFormAmount)
            if (!amt || amt <= 0) {
              notify.error('Please enter a valid payment amount.')
              return
            }
            addPayment({
              clientName: matched.name,
              amount: amt,
              date: paymentFormDate || todayDubai(),
              paymentMethod: paymentFormMethod,
              referenceNumber: paymentFormRef.trim() || undefined,
              invoiceMonth: paymentFormMonth.trim() || undefined,
              notes: paymentFormNotes.trim() || undefined,
            })
            setShowRecordPaymentModal(false)
          }}
        >
          {/* Client Name with autocomplete */}
          <div className="relative">
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Client Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="Search or enter client name…"
                value={paymentFormClient}
                onChange={e => {
                  setPaymentFormClient(e.target.value)
                  setPaymentClientDropdown(true)
                }}
                onFocus={() => setPaymentClientDropdown(true)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-semibold text-slate-800"
              />
              {paymentClientDropdown && paymentClientSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E4E8EC] rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                  {paymentClientSuggestions.map(c => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        setPaymentFormClient(c.name)
                        const cKey = c.name.trim().toLowerCase()
                        const cRec = (paymentsByClient.get(cKey) || []).reduce((s, p) => s + p.amount, 0)
                        const due = Math.max(0, c.totalCharges - (c.totalReceived + cRec))
                        if (due > 0 && !paymentFormAmount) {
                          setPaymentFormAmount(String(due))
                        }
                        setPaymentClientDropdown(false)
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between text-[12.5px] border-b border-slate-100 last:border-0 cursor-pointer"
                    >
                      <span className="font-bold text-slate-800">{c.name}</span>
                      <span className="text-[11px] text-slate-400">{c.area || 'Dubai'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {paymentClientDropdown && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setPaymentClientDropdown(false)}
              />
            )}
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Amount (AED) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={paymentFormAmount}
                onChange={e => setPaymentFormAmount(e.target.value)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-emerald-800"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={paymentFormDate}
                onChange={e => setPaymentFormDate(e.target.value)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-medium text-slate-700"
              />
            </div>
          </div>

          {/* Payment Method & Reference */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentFormMethod}
                onChange={e => setPaymentFormMethod(e.target.value as any)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer font-medium text-slate-800"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Online">Online Payment</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Reference / Cheque #
              </label>
              <input
                type="text"
                placeholder="e.g. TRX-9042, CHQ-1049"
                value={paymentFormRef}
                onChange={e => setPaymentFormRef(e.target.value)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-mono text-[12.5px]"
              />
            </div>
          </div>

          {/* Billing Month */}
          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Billing Month / Cycle
            </label>
            <input
              type="text"
              placeholder="e.g. October 2026, September 2026"
              value={paymentFormMonth}
              onChange={e => setPaymentFormMonth(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Remarks / Notes
            </label>
            <textarea
              rows={2}
              placeholder="Any payment receipt notes, bank account deposited to, or invoice reference…"
              value={paymentFormNotes}
              onChange={e => setPaymentFormNotes(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowRecordPaymentModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              <Save size={14} className="mr-1.5" /> Save Payment Record
            </Button>
          </div>
        </form>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════
          GENERATE MONTHLY INVOICE MODAL (Simple & Detailed with Custom Date Range)
         ═══════════════════════════════════════════════════════════════ */}
      <Modal
        open={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        title={invoiceClient ? `Generate Invoice — ${invoiceClient.name}` : 'Generate Invoice'}
        size="xl"
      >
        {invoiceClient && (() => {
          const { shifts, totalHours, totalOT, subtotal, vatAmount, grandTotal, lineItems } = invoiceCalculations
          const matchedContract = contractsByClientName.get(invoiceClient.name.toLowerCase().trim())

          return (
            <div className="space-y-5 text-slate-800">
              {/* Success Notification Alert */}
              {invoiceSuccessMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <span className="text-[13px] font-bold">{invoiceSuccessMsg}</span>
                  </div>
                  <Link
                    to="/invoices"
                    className="text-[12px] font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1"
                  >
                    Go to Invoices <ExternalLink size={12} />
                  </Link>
                </div>
              )}

              {/* Client & Invoice Mode Header Bar */}
              <div className="bg-gradient-to-r from-teal-50 via-slate-50 to-white rounded-2xl p-4 border border-teal-100/80 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={invoiceClient.name} size="md" idx={0} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-[15.5px] font-extrabold text-[#111827]">{invoiceClient.name}</h4>
                      <span className="text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full uppercase">
                        Monthly Client
                      </span>
                      {matchedContract && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full">
                          Contract: AED {matchedContract.amount}/{matchedContract.frequency === 'weekly' ? 'wk' : matchedContract.frequency === 'biweekly' ? '2wk' : 'mo'}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-1">
                      <MapPin size={11} className="text-slate-400" />
                      <span>{invoiceClient.rawAddress || invoiceClient.area || 'Dubai'}</span>
                    </p>
                  </div>
                </div>

                {/* Simple vs Detailed Invoice Selector */}
                <div className="flex items-center gap-1.5 p-1 bg-white border border-[#E4E8EC] rounded-xl shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setInvoiceType('simple')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                      invoiceType === 'simple'
                        ? 'bg-teal-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <FileText size={13} />
                    <span>Simple Invoice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceType('detailed')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                      invoiceType === 'detailed'
                        ? 'bg-teal-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <FileSpreadsheet size={13} />
                    <span>Detailed Invoice</span>
                  </button>
                </div>
              </div>

              {/* Date Range Selection & Quick Presets */}
              <div className="bg-white rounded-2xl border border-[#E4E8EC] p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar size={14} className="text-teal-600" />
                    <span>Custom Date Range for Invoice</span>
                  </label>
                  {/* Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { key: 'this_month', label: 'This Month' },
                      { key: 'last_month', label: 'Last Month' },
                      { key: '28days', label: 'Last 28 Days' },
                      { key: 'custom', label: 'Custom Range' },
                    ].map(p => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => handleSetInvoicePreset(p.key as any)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                          invoicePreset === p.key
                            ? 'bg-teal-50 text-teal-800 border-teal-300'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={invoiceStartDate}
                      onChange={e => {
                        setInvoiceStartDate(e.target.value)
                        setInvoicePreset('custom')
                      }}
                      className="w-full text-[12.5px] px-3 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">End Date</label>
                    <input
                      type="date"
                      value={invoiceEndDate}
                      onChange={e => {
                        setInvoiceEndDate(e.target.value)
                        setInvoicePreset('custom')
                      }}
                      className="w-full text-[12.5px] px-3 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Issue Date</label>
                    <input
                      type="date"
                      value={invoiceIssueDate}
                      onChange={e => setInvoiceIssueDate(e.target.value)}
                      className="w-full text-[12.5px] px-3 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={invoiceDueDate}
                      onChange={e => setInvoiceDueDate(e.target.value)}
                      className="w-full text-[12.5px] px-3 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing, Invoice #, and Tax Settings */}
              <div className="bg-white rounded-2xl border border-[#E4E8EC] p-4 shadow-2xs space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Invoice Number</label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={e => setInvoiceNumber(e.target.value)}
                      className="w-full text-[12.5px] font-mono px-3 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-bold text-teal-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Pricing Model</label>
                    <select
                      value={invoicePricingModel}
                      onChange={e => setInvoicePricingModel(e.target.value as any)}
                      className="w-full text-[12.5px] px-3 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 cursor-pointer font-medium text-slate-800"
                    >
                      <option value="shift_charges">Daily Sheet Recorded Charges</option>
                      <option value="hourly_rate">Custom Hourly Rate (AED/hr)</option>
                      {matchedContract && <option value="contract">Contract Rate (AED {matchedContract.amount})</option>}
                      <option value="custom_total">Fixed / Custom Lump Sum Amount</option>
                    </select>
                  </div>

                  {invoicePricingModel === 'hourly_rate' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Hourly Rate (AED)</label>
                      <input
                        type="number"
                        min="1"
                        step="0.5"
                        value={invoiceHourlyRate}
                        onChange={e => setInvoiceHourlyRate(Number(e.target.value))}
                        className="w-full text-[12.5px] px-3 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-bold text-slate-800"
                      />
                    </div>
                  ) : invoicePricingModel === 'custom_total' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Custom Total (AED)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={invoiceCustomAmount}
                        onChange={e => setInvoiceCustomAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full text-[12.5px] px-3 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-bold text-slate-800"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={invoiceIncludeVat}
                          onChange={e => setInvoiceIncludeVat(e.target.checked)}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                        />
                        <span className="text-[12px] font-bold text-slate-700">Include UAE VAT (5%)</span>
                      </label>
                    </div>
                  )}
                </div>

                {invoicePricingModel !== 'hourly_rate' && invoicePricingModel !== 'custom_total' ? null : (
                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={invoiceIncludeVat}
                        onChange={e => setInvoiceIncludeVat(e.target.checked)}
                        className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                      />
                      <span className="text-[12px] font-bold text-slate-700">Include UAE VAT (5%)</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Shifts & Preview Summary Bar */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-100/80 rounded-xl text-[12px] text-slate-600">
                <span className="font-semibold">
                  Found <strong className="text-teal-700 font-bold">{shifts.length} shifts</strong> between {formatDisplayDate(invoiceStartDate) || invoiceStartDate} and {formatDisplayDate(invoiceEndDate) || invoiceEndDate}
                </span>
                <span className="flex items-center gap-2 text-[11px]">
                  <span>Duty: <strong className="text-slate-800">{totalHours}h</strong></span>
                  {totalOT > 0 && <span className="text-amber-700 font-bold">({totalOT}h OT)</span>}
                  <span className="bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-full capitalize">{invoiceType} Format</span>
                </span>
              </div>

              {/* Live Invoice Preview Line Items Table */}
              <div className="border border-[#E4E8EC] rounded-2xl overflow-hidden shadow-2xs">
                <div className="bg-[#f8fafc] px-4 py-2.5 border-b border-[#E4E8EC] flex items-center justify-between">
                  <h5 className="text-[12px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <FileText size={13} className="text-teal-600" />
                    <span>Live Invoice Line Items Preview ({lineItems.length} {lineItems.length === 1 ? 'item' : 'items'})</span>
                  </h5>
                  <span className="text-[11px] text-slate-400 font-medium">What will appear on print / document</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="py-2.5 px-3.5">#</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-center">Qty / Hours</th>
                        <th className="py-2.5 px-3 text-right">Unit Rate</th>
                        <th className="py-2.5 px-3.5 text-right">Amount (AED)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4E8EC]">
                      {lineItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3.5 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[420px]">
                            {item.description}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-600 font-semibold">{item.quantity}</td>
                          <td className="py-2.5 px-3 text-right text-slate-600 font-mono">
                            AED {Number(item.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-bold text-slate-900 font-mono">
                            AED {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals & Bank Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3.5 text-[12px]">
                  <p className="font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-teal-600" />
                    <span>Payment Terms & Notes</span>
                  </p>
                  <textarea
                    rows={3}
                    value={invoiceNotes}
                    onChange={e => setInvoiceNotes(e.target.value)}
                    className="w-full text-[12px] p-2 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 resize-none font-medium text-slate-600"
                  />
                  <p className="text-[10.5px] text-slate-400 mt-1">TRN: 100234567890003 · Commercial Bank of Dubai / FAB</p>
                </div>

                <div className="bg-gradient-to-br from-teal-50/60 to-emerald-50/60 rounded-2xl border border-teal-200 p-4 space-y-2">
                  <div className="flex justify-between text-[12.5px] text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-bold text-slate-800">AED {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-[12.5px] text-slate-600">
                    <span>UAE VAT ({invoiceIncludeVat ? '5%' : '0%'}):</span>
                    <span className="font-bold text-slate-800">AED {vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-teal-200">
                    <span className="text-[14px] font-black text-slate-900">Total Due (AED):</span>
                    <span className="text-[19px] font-black text-teal-800">AED {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Print / PDF, Save, WhatsApp, Close */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 flex-wrap gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowInvoiceModal(false)}
                  className="px-4 text-[12px]"
                >
                  Close
                </Button>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleShareWhatsAppInvoice}
                    className="h-10 px-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-[12px] transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    title="Share invoice summary on WhatsApp"
                  >
                    <MessageCircle size={14} className="text-emerald-600" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveInvoiceToSystem}
                    className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-[12px] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    title="Save to system invoices database"
                  >
                    <Save size={14} />
                    <span>Save to Invoices</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintGeneratedInvoice}
                    className="h-10 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-[12px] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    title="Print or Download PDF"
                  >
                    <Printer size={14} />
                    <span>Print / Download PDF</span>
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

function ClientBookingForm({ clientName, clientPhone, onClose, onAdd }: { clientName: string; clientPhone: string; onClose: () => void; onAdd: (b: any) => void }) {
  const { clients, employees } = useData()
  const matchedClient = useMemo(() => {
    const q = clientName.toLowerCase().trim()
    return clients.find(c => (c.full_name || '').toLowerCase().trim() === q)
  }, [clients, clientName])

  const initialAddress = useMemo(() => {
    if (!matchedClient) return ''
    if ((matchedClient as any).address) return (matchedClient as any).address
    return [matchedClient.apartment, matchedClient.building_name, matchedClient.area].filter(Boolean).join(', ')
  }, [matchedClient])

  const [scheduledDate, setScheduledDate] = useState(() => todayDubai())
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState(3)
  const [endTime, setEndTime] = useState(() => addHoursToTime('09:00', 3))

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
        const defaultCrew: string[] = []
        if (matchedClient?.preferred_cleaner) {
          const emp = employees.find(ep => ep.full_name?.toLowerCase().trim() === matchedClient.preferred_cleaner?.toLowerCase().trim())
          if (emp) defaultCrew.push(emp.id)
        }
        onAdd({
          client_id: matchedClient?.id || '',
          client_name: clientName,
          client_phone: clientPhone || matchedClient?.phone || '',
          service_address: f.get('service_address') as string,
          service_type: f.get('service_type') as string,
          frequency: (f.get('frequency') as BookingFrequency) || 'monthly',
          scheduled_date: scheduledDate,
          scheduled_time: startTime,
          end_time: endTime,
          duration_hours: duration,
          total_amount: Number(f.get('total_amount')) || 0,
          notes: f.get('notes') as string,
          status: 'pending',
          assigned_crew: defaultCrew,
        })
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
          <p className="text-[10.5px] text-slate-500 uppercase font-semibold mb-1">Client</p>
          <p className="text-[13px] font-semibold text-[#111827]">{clientName}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
          <p className="text-[10.5px] text-slate-500 uppercase font-semibold mb-1">Phone</p>
          <p className="text-[13px] font-semibold text-[#111827]">{clientPhone || matchedClient?.phone || '—'}</p>
        </div>
      </div>
      <Input name="service_address" label="Service Address" defaultValue={initialAddress} placeholder="Street, unit, neighborhood" />
      <div className="grid grid-cols-2 gap-4">
        <Select name="service_type" label="Service Type">
          <option value="">Select service…</option>
          {serviceTypes.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select name="frequency" label="Frequency" defaultValue="monthly">
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="once">One-time</option>
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
      <Textarea name="notes" label="Remarks" rows={2} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold">Create Booking</Button>
      </div>
    </form>
  )
}


export { AddMonthlyClientModalForm, DAYS_OF_WEEK, DAY_SHORT } from '@/components/monthlyClients/AddMonthlyClientModalForm'
export type { AddMonthlyClientModalFormProps } from '@/components/monthlyClients/AddMonthlyClientModalForm'
