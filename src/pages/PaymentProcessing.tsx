import { useState, useMemo, useEffect } from 'react'
import {
  Clock, CheckCircle2, AlertCircle, DollarSign, Wallet, Calendar,
  Search, X, Plus, Filter, RotateCcw, Download, Building2, Phone,
  CreditCard, ArrowUpDown, Trash2, ExternalLink, ArrowRight,
  Receipt, Check, FileSpreadsheet, Eye, ChevronDown, CheckCircle,
  Edit2, User, Save, MapPin
} from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import type { DailyJob, DailyPendingItem, DailyPendingReceivedItem, Client } from '@/types'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { formatDate } from '@/lib/utils'
import { normalizeKey, buildPendingCalcContext, loadClientAdjustments, calcJobCollectable, calcJobLaterReceipts, isBogusJob } from '@/lib/clientDataSync'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'

export interface EditPaymentJobItem {
  id: string
  jobId?: string
  source: 'Daily Job Sheet' | 'Manual / Side Table' | 'Monthly Contract'
  clientName: string
  address: string
  area: string
  service: string
  staffName: string
  date: string
  startTime?: string
  endTime?: string
  dutyHours?: number
  charges: number
  received: number
  paymentMode: string
  remarks: string
  rawJob?: DailyJob
  monthlyPaymentId?: string
}

export function getClientProfileId(clientNameOrAddress: string, clients: Client[]): string {
  if (!clientNameOrAddress) return 'all'
  const targetNorm = normalizeKey(clientNameOrAddress)
  if (!targetNorm) return 'all'

  // 1. Direct ID match
  const directId = clients.find(c => c.id === clientNameOrAddress)
  if (directId) return directId.id

  // 2. Exact normalized name match
  const nameMatch = clients.find(c => normalizeKey(c.full_name) === targetNorm)
  if (nameMatch) return nameMatch.id

  // 3. Exact building name match
  const bldgMatch = clients.find(c => normalizeKey(c.building_name || '') === targetNorm)
  if (bldgMatch) return bldgMatch.id

  // 4. Substring / partial match
  const partial = clients.find(c => {
    const cNorm = normalizeKey(c.full_name)
    const bNorm = normalizeKey(c.building_name || '')
    return (
      (targetNorm.length >= 4 && (cNorm.includes(targetNorm) || targetNorm.includes(cNorm))) ||
      (targetNorm.length >= 4 && (bNorm.includes(targetNorm) || targetNorm.includes(bNorm)))
    )
  })
  if (partial) return partial.id

  // 5. Fallback deterministic ID from DailyJobSheet sync
  return `dj-${targetNorm}`
}

export interface MonthlyClientPayment {
  id: string
  clientName: string
  clientId?: string
  amount: number
  date: string
  paymentMethod: 'Bank Transfer' | 'Cash' | 'Credit Card' | 'Cheque' | 'Online'
  referenceNumber?: string
  invoiceMonth?: string
  notes?: string
  createdAt: string
}

export interface PendingRecordItem {
  id: string
  date: string
  clientName: string
  staffName: string
  address: string
  area: string
  service: string
  charges: number
  received: number
  pendingAmount: number
  source: 'Daily Job Sheet' | 'Manual / Side Table'
  status: 'pending' | 'partially_paid'
  jobId?: string
  rawJob?: DailyJob
  remarks?: string
  paymentMode?: string
}

function cleanNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const str = String(val).trim()
  if (!str || str === '—' || str === '-' || str.toLowerCase() === 'nil' || str.toLowerCase() === 'n/a') return 0
  const cleaned = str.replace(/[^0-9.-]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export function PaymentProcessing() {
  const { dailyJobs, updateDailyJob, clients, invoices } = useData()
  const navigate = useNavigate()

  // ── Tab State: 'pending' | 'monthly' | 'history' ──
  const [activeTab, setActiveTab] = useState<'pending' | 'monthly' | 'history'>('pending')

  // ── Monthly Client Payments (Synced with safaeewala_monthly_client_payments) ──
  const [monthlyPayments, setMonthlyPayments] = useState<MonthlyClientPayment[]>(() => {
    return safeLocalStorageGet<MonthlyClientPayment[]>('safaeewala_monthly_client_payments', [])
  })

  useEffect(() => {
    safeLocalStorageSet('safaeewala_monthly_client_payments', monthlyPayments)
  }, [monthlyPayments])

  // ── Pending Items from LocalStorage side table ──
  const [pendingSideList, setPendingSideList] = useState<DailyPendingItem[]>(() =>
    safeLocalStorageGet<DailyPendingItem[]>('safaeewala_daily_pending_items', [])
  )

  // ── Pending Received collections (shared with Daily Job Sheet & Pending Payments) ──
  const [pendingRcvdList, setPendingRcvdList] = useState<DailyPendingReceivedItem[]>(() =>
    safeLocalStorageGet<DailyPendingReceivedItem[]>('safaeewala_daily_pending_rcvd_items', [])
  )
  const pendingCtx = useMemo(() => buildPendingCalcContext(loadClientAdjustments(), pendingRcvdList), [pendingRcvdList])

  // ── Modals & Actions State ──
  const [showRecordMonthlyModal, setShowRecordMonthlyModal] = useState(false)
  const [showCollectModal, setShowCollectModal] = useState(false)
  const [selectedPendingItem, setSelectedPendingItem] = useState<PendingRecordItem | null>(null)
  const [editingItem, setEditingItem] = useState<EditPaymentJobItem | null>(null)
  const [collectAmount, setCollectAmount] = useState('')
  const [collectMethod, setCollectMethod] = useState<'Cash' | 'Bank Transfer' | 'Credit Card' | 'Cheque'>('Cash')
  const [collectDate, setCollectDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedMonthlyPayment, setSelectedMonthlyPayment] = useState<MonthlyClientPayment | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // ── Record Monthly Payment Form State ──
  const [mClientName, setMClientName] = useState('')
  const [mAmount, setMAmount] = useState('')
  const [mDate, setMDate] = useState(new Date().toISOString().split('T')[0])
  const [mMethod, setMMethod] = useState<'Bank Transfer' | 'Cash' | 'Credit Card' | 'Cheque' | 'Online'>('Bank Transfer')
  const [mRef, setMRef] = useState('')
  const [mMonth, setMMonth] = useState(new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
  const [mNotes, setMNotes] = useState('')
  const [clientSearchDropdown, setClientSearchDropdown] = useState(false)

  // ── Search & Filter State for Pending Amounts ──
  const [pendingSearch, setPendingSearch] = useState('')
  const [pendingDateFilter, setPendingDateFilter] = useState<'all' | 'this_month' | 'last_30' | 'last_7'>('all')

  // ── Search & Filter State for Monthly Payments ──
  const [monthlySearch, setMonthlySearch] = useState('')
  const [monthlyMethodFilter, setMonthlyMethodFilter] = useState<string>('all')

  // ── Search & Filter State for History Tab ──
  const [historySearch, setHistorySearch] = useState('')

  // ── Extract All Pending Records ──
  const allPendingRecords = useMemo<PendingRecordItem[]>(() => {
    const list: PendingRecordItem[] = []

    // 1. From Daily Job Sheet
    dailyJobs.forEach(job => {
      if (isBogusJob(job)) return
      const chg = cleanNum(job.charges)
      const rec = cleanNum(job.received) + calcJobLaterReceipts(job, pendingCtx)
      const due = calcJobCollectable(job, pendingCtx)

      if (due > 0) {
        list.push({
          id: `job-${job.id}`,
          date: job.date || '',
          clientName: job.address || job.area || 'Client',
          staffName: job.staff_name || '—',
          address: job.address || '—',
          area: job.area || '—',
          service: job.service || 'Cleaning Shift',
          charges: chg,
          received: rec,
          pendingAmount: due,
          source: 'Daily Job Sheet',
          status: rec > 0 ? 'partially_paid' : 'pending',
          jobId: job.id,
          rawJob: job,
          remarks: job.remarks || '',
          paymentMode: job.payment_mode,
        })
      }
    })

    // 2. From Side Pending Table
    pendingSideList.forEach(item => {
      const amt = cleanNum(item.amount)
      if (amt > 0) {
        list.push({
          id: item.id,
          date: item.date || '',
          clientName: item.client || 'Client Account',
          staffName: (item as any).staff || '—',
          address: item.client || '—',
          area: '—',
          service: 'Account Balance Due',
          charges: amt,
          received: 0,
          pendingAmount: amt,
          source: 'Manual / Side Table',
          status: 'pending',
          remarks: (item as any).remarks || 'Pending dues from side widget',
        })
      }
    })

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [dailyJobs, pendingSideList, pendingCtx])

  // Filtered Pending Records
  const filteredPendingRecords = useMemo(() => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const curMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    return allPendingRecords.filter(r => {
      // Date filter
      if (pendingDateFilter === 'this_month') {
        if (!r.date.startsWith(curMonthKey)) return false
      } else if (pendingDateFilter === 'last_7') {
        const d = new Date(today)
        d.setDate(d.getDate() - 7)
        const dStr = d.toISOString().split('T')[0]
        if (r.date < dStr || r.date > todayStr) return false
      } else if (pendingDateFilter === 'last_30') {
        const d = new Date(today)
        d.setDate(d.getDate() - 30)
        const dStr = d.toISOString().split('T')[0]
        if (r.date < dStr || r.date > todayStr) return false
      }

      // Search filter
      const q = pendingSearch.toLowerCase().trim()
      if (q) {
        const matchClient = r.clientName.toLowerCase().includes(q)
        const matchStaff  = r.staffName.toLowerCase().includes(q)
        const matchArea   = r.area.toLowerCase().includes(q)
        const matchAddr   = r.address.toLowerCase().includes(q)
        const matchRem    = (r.remarks || '').toLowerCase().includes(q)
        const matchAmt    = String(r.pendingAmount).includes(q)
        if (!matchClient && !matchStaff && !matchArea && !matchAddr && !matchRem && !matchAmt) return false
      }

      return true
    })
  }, [allPendingRecords, pendingDateFilter, pendingSearch])

  // Filtered Monthly Payments
  const filteredMonthlyPayments = useMemo(() => {
    return monthlyPayments.filter(p => {
      // Method filter
      if (monthlyMethodFilter !== 'all' && p.paymentMethod !== monthlyMethodFilter) return false

      // Search
      const q = monthlySearch.toLowerCase().trim()
      if (q) {
        const matchClient = p.clientName.toLowerCase().includes(q)
        const matchRef    = (p.referenceNumber || '').toLowerCase().includes(q)
        const matchMonth  = (p.invoiceMonth || '').toLowerCase().includes(q)
        const matchNotes  = (p.notes || '').toLowerCase().includes(q)
        const matchAmt    = String(p.amount).includes(q)
        if (!matchClient && !matchRef && !matchMonth && !matchNotes && !matchAmt) return false
      }

      return true
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [monthlyPayments, monthlyMethodFilter, monthlySearch])

  // Unified Completed Payments History
  const paymentHistoryRecords = useMemo(() => {
    const records: Array<{
      id: string
      date: string
      client: string
      type: 'Daily Job' | 'Monthly Contract' | 'Recovery'
      method: string
      amount: number
      reference?: string
      notes?: string
    }> = []

    // Completed / collected from Daily Jobs
    dailyJobs.forEach(j => {
      const rec = cleanNum(j.received)
      if (rec > 0) {
        records.push({
          id: `dj-rec-${j.id}`,
          date: j.date || '',
          client: j.address || j.area || 'Direct Client',
          type: 'Daily Job',
          method: j.payment_mode || 'Cash',
          amount: rec,
          reference: j.staff_name ? `Staff: ${j.staff_name}` : undefined,
          notes: j.remarks || undefined,
        })
      }
    })

    // Recorded Monthly Client Payments
    monthlyPayments.forEach(m => {
      records.push({
        id: `mp-${m.id}`,
        date: m.date,
        client: m.clientName,
        type: 'Monthly Contract',
        method: m.paymentMethod,
        amount: m.amount,
        reference: m.referenceNumber || m.invoiceMonth,
        notes: m.notes,
      })
    })

    // Later collections of pending dues (Pending / Payments "collect") — AUD-27
    pendingRcvdList.forEach(p => {
      const amount = cleanNum(p.cash) + cleanNum(p.online)
      if (amount <= 0) return
      records.push({
        id: `rc-${p.id}`,
        date: p.date,
        client: p.client || 'Client',
        type: 'Recovery',
        method: p.method || (cleanNum(p.cash) > 0 ? 'Cash' : 'Online'),
        amount,
        reference: p.job_id ? `Job ${p.job_id.slice(0, 8)}` : undefined,
        notes: p.remarks || undefined,
      })
    })

    return records
      .filter(r => {
        const q = historySearch.toLowerCase().trim()
        if (!q) return true
        return (
          r.client.toLowerCase().includes(q) ||
          r.method.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          (r.reference || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q) ||
          String(r.amount).includes(q)
        )
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [dailyJobs, monthlyPayments, pendingRcvdList, historySearch])

  // ── Global Stats Calculations ──
  const totalPendingAmt = allPendingRecords.reduce((s, r) => s + r.pendingAmount, 0)
  const totalMonthlyPaid = monthlyPayments.reduce((s, m) => s + m.amount, 0)
  // Collected = received on the day + later recoveries + monthly payments;
  // billed = job charges only (monthly visits are already in it) — AUD-27, AUD-28
  const validJobs = dailyJobs.filter(j => !isBogusJob(j))
  const totalRecovered = pendingRcvdList.reduce((s, p) => s + cleanNum(p.cash) + cleanNum(p.online), 0)
  const totalDailyCollected = validJobs.reduce((s, j) => s + cleanNum(j.received), 0) + totalRecovered
  const grandTotalCollected = totalDailyCollected + totalMonthlyPaid
  const totalBilled = validJobs.reduce((s, j) => s + cleanNum(j.charges), 0)
  const collectionRate = totalBilled > 0 ? Math.round((grandTotalCollected / totalBilled) * 100) : 100

  // ── Handle Save New Monthly Payment ──
  const handleSaveMonthlyPayment = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(mAmount)
    if (!mClientName.trim() || isNaN(amt) || amt <= 0) return

    const newPayment: MonthlyClientPayment = {
      id: `mp-${Date.now()}`,
      clientName: mClientName.trim(),
      amount: amt,
      date: mDate || new Date().toISOString().split('T')[0],
      paymentMethod: mMethod,
      referenceNumber: mRef.trim() || undefined,
      invoiceMonth: mMonth.trim() || undefined,
      notes: mNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    }

    setMonthlyPayments(prev => [newPayment, ...prev])
    setShowRecordMonthlyModal(false)

    // Reset Form
    setMClientName('')
    setMAmount('')
    setMRef('')
    setMNotes('')
  }

  // ── Handle Collect Pending Amount ──
  const handleCollectPending = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPendingItem) return
    const amt = parseFloat(collectAmount)
    if (isNaN(amt) || amt <= 0) return

    // Every collection is a Pending Received record dated on the collection day.
    // Job collections are linked by job_id instead of rewriting the old job's
    // `received`, so the original day's cash book stays unchanged.
    const rcvdList = safeLocalStorageGet<DailyPendingReceivedItem[]>('safaeewala_daily_pending_rcvd_items', [])
    const newRcvdItem: DailyPendingReceivedItem = {
      id: `prcvd-${Date.now()}`,
      date: collectDate,
      client: selectedPendingItem.clientName,
      cash: collectMethod === 'Cash' ? amt : 0,
      online: collectMethod !== 'Cash' ? amt : 0,
      job_id: selectedPendingItem.jobId,
      method: collectMethod,
      remarks: `Collected via ${collectMethod}`,
    }
    const nextRcvd = [newRcvdItem, ...rcvdList]
    safeLocalStorageSet('safaeewala_daily_pending_rcvd_items', nextRcvd)
    setPendingRcvdList(nextRcvd)

    if (!selectedPendingItem.jobId) {
      // Manual side list item: reduce or clear it, like Pending Payments does
      const nextSide = pendingSideList
        .map(item => {
          if (item.id !== selectedPendingItem.id) return item
          const remaining = cleanNum(item.amount) - amt
          return remaining > 0 ? { ...item, amount: remaining } : null
        })
        .filter(Boolean) as DailyPendingItem[]
      safeLocalStorageSet('safaeewala_daily_pending_items', nextSide)
      setPendingSideList(nextSide)
    }

    setShowCollectModal(false)
    setSelectedPendingItem(null)
  }

  // ── Handlers to Open Edit Payment & Job Details Modal ──
  const handleOpenEditPending = (item: PendingRecordItem) => {
    const raw = item.rawJob
    setEditingItem({
      id: item.id,
      jobId: item.jobId,
      source: item.source,
      clientName: item.clientName,
      address: item.address !== '—' ? item.address : item.clientName,
      area: item.area !== '—' ? item.area : (raw?.area || ''),
      service: item.service,
      staffName: item.staffName !== '—' ? item.staffName : (raw?.staff_name || ''),
      date: item.date || new Date().toISOString().split('T')[0],
      startTime: raw?.start_time || '',
      endTime: raw?.end_time || '',
      dutyHours: raw?.duty_hours ?? 0,
      charges: item.charges,
      received: item.received,
      paymentMode: item.paymentMode || raw?.payment_mode || 'Pending',
      remarks: item.remarks || raw?.remarks || '',
      rawJob: raw,
    })
  }

  const handleOpenEditMonthly = (payment: MonthlyClientPayment) => {
    setEditingItem({
      id: payment.id,
      monthlyPaymentId: payment.id,
      source: 'Monthly Contract',
      clientName: payment.clientName,
      address: payment.clientName,
      area: '—',
      service: 'Monthly Cleaning Contract',
      staffName: '—',
      date: payment.date,
      charges: payment.amount,
      received: payment.amount,
      paymentMode: payment.paymentMethod,
      remarks: payment.notes || '',
    })
  }

  const handleOpenEditHistory = (record: {
    id: string
    date: string
    client: string
    type: 'Daily Job' | 'Monthly Contract' | 'Recovery'
    method: string
    amount: number
    reference?: string
    notes?: string
  }) => {
    // Recoveries are receipts against older jobs — they are managed on the Pending screen
    if (record.type === 'Recovery') {
      alert('This is a recovery of an earlier pending amount. Edit or remove it from the Pending screen (Recovered tab).')
      return
    }
    if (record.id.startsWith('dj-rec-')) {
      const rawJobId = record.id.replace('dj-rec-', '')
      const matchedJob = dailyJobs.find(j => j.id === rawJobId)
      if (matchedJob) {
        setEditingItem({
          id: `job-${matchedJob.id}`,
          jobId: matchedJob.id,
          source: 'Daily Job Sheet',
          clientName: matchedJob.address || matchedJob.area || record.client,
          address: matchedJob.address || '—',
          area: matchedJob.area || '—',
          service: matchedJob.service || 'Cleaning Shift',
          staffName: matchedJob.staff_name || '—',
          date: matchedJob.date || record.date,
          startTime: matchedJob.start_time || '',
          endTime: matchedJob.end_time || '',
          dutyHours: matchedJob.duty_hours ?? 0,
          charges: cleanNum(matchedJob.charges),
          received: cleanNum(matchedJob.received),
          paymentMode: matchedJob.payment_mode || record.method || 'Cash',
          remarks: matchedJob.remarks || record.notes || '',
          rawJob: matchedJob,
        })
        return
      }
    }

    if (record.id.startsWith('mp-')) {
      const rawMpId = record.id.replace('mp-', '')
      const matchedMp = monthlyPayments.find(p => p.id === rawMpId || p.id === record.id)
      if (matchedMp) {
        setEditingItem({
          id: matchedMp.id,
          monthlyPaymentId: matchedMp.id,
          source: 'Monthly Contract',
          clientName: matchedMp.clientName,
          address: matchedMp.clientName,
          area: '—',
          service: 'Monthly Contract Payment',
          staffName: '—',
          date: matchedMp.date,
          charges: matchedMp.amount,
          received: matchedMp.amount,
          paymentMode: matchedMp.paymentMethod,
          remarks: matchedMp.notes || '',
        })
        return
      }
    }

    setEditingItem({
      id: record.id,
      source: record.type === 'Monthly Contract' ? 'Monthly Contract' : 'Daily Job Sheet',
      clientName: record.client,
      address: record.client,
      area: '—',
      service: record.type,
      staffName: '—',
      date: record.date,
      charges: record.amount,
      received: record.amount,
      paymentMode: record.method,
      remarks: record.notes || '',
    })
  }

  // ── Save Edited Payment & Job Details ──
  const handleSaveEditItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem) return

    const updatedCharges = cleanNum(editingItem.charges)
    const updatedReceived = cleanNum(editingItem.received)

    if (editingItem.jobId && editingItem.rawJob) {
      // Update Daily Job Sheet Shift
      updateDailyJob(editingItem.jobId, {
        staff_name: editingItem.staffName,
        address: editingItem.address,
        area: editingItem.area,
        service: editingItem.service,
        date: editingItem.date,
        start_time: editingItem.startTime || editingItem.rawJob.start_time,
        end_time: editingItem.endTime || editingItem.rawJob.end_time,
        duty_hours: editingItem.dutyHours ?? editingItem.rawJob.duty_hours,
        charges: updatedCharges,
        received: updatedReceived,
        payment_mode: editingItem.paymentMode as any,
        remarks: editingItem.remarks,
      })
    } else if (editingItem.source === 'Monthly Contract' && editingItem.monthlyPaymentId) {
      // Update Monthly Payment Record
      setMonthlyPayments(prev =>
        prev.map(p => {
          if (p.id === editingItem.monthlyPaymentId) {
            return {
              ...p,
              clientName: editingItem.clientName,
              amount: updatedCharges || updatedReceived || p.amount,
              date: editingItem.date,
              paymentMethod: (editingItem.paymentMode as any) || p.paymentMethod,
              notes: editingItem.remarks,
            }
          }
          return p
        })
      )
    } else {
      // Update Side Table Pending Item
      const sideList = safeLocalStorageGet<DailyPendingItem[]>('safaeewala_daily_pending_items', [])
      const updatedSideList = sideList.map(item => {
        if (item.id === editingItem.id) {
          return {
            ...item,
            client: editingItem.clientName,
            amount: Math.max(0, updatedCharges - updatedReceived),
            date: editingItem.date,
          }
        }
        return item
      })
      safeLocalStorageSet('safaeewala_daily_pending_items', updatedSideList)
    }

    setEditingItem(null)
  }

  // ── Export to Excel ──
  const handleExportExcel = () => {
    const today = new Date().toISOString().split('T')[0]
    if (activeTab === 'pending') {
      const rows = filteredPendingRecords.map((r, i) => ({
        '#': i + 1,
        'Date': r.date,
        'Client / Address': r.clientName,
        'Staff': r.staffName,
        'Service': r.service,
        'Area': r.area,
        'Charges (AED)': r.charges,
        'Received (AED)': r.received,
        'Pending Due (AED)': r.pendingAmount,
        'Payment Mode': r.paymentMode || 'Pending',
        'Source': r.source,
        'Remarks': r.remarks || '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pending Amounts')
      XLSX.writeFile(wb, `Safaeewala_Pending_Amounts_${today}.xlsx`)
    } else if (activeTab === 'monthly') {
      const rows = filteredMonthlyPayments.map((p, i) => ({
        '#': i + 1,
        'Payment Date': p.date,
        'Client Name': p.clientName,
        'Billing Period': p.invoiceMonth || '—',
        'Method': p.paymentMethod,
        'Reference #': p.referenceNumber || '—',
        'Amount (AED)': p.amount,
        'Notes': p.notes || '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Monthly Payments')
      XLSX.writeFile(wb, `Safaeewala_Monthly_Payments_${today}.xlsx`)
    } else {
      const rows = paymentHistoryRecords.map((h, i) => ({
        '#': i + 1,
        'Date': h.date,
        'Client': h.client,
        'Category': h.type,
        'Payment Method': h.method,
        'Amount (AED)': h.amount,
        'Reference': h.reference || '—',
        'Notes': h.notes || '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Payment History')
      XLSX.writeFile(wb, `Safaeewala_Payment_History_${today}.xlsx`)
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Page Hero ── */}
      <PageHero
        title="Payments Management"
        subtitle={`${allPendingRecords.length} pending dues (AED ${totalPendingAmt.toLocaleString()}) · ${monthlyPayments.length} monthly payments (AED ${totalMonthlyPaid.toLocaleString()})`}
        statusChip={totalPendingAmt > 0 ? `AED ${totalPendingAmt.toLocaleString()} Pending` : 'All Settled'}
        showSearch={false}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportExcel}
              className="h-11 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-[13px] backdrop-blur-sm transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer"
              title="Export table records to Excel"
            >
              <FileSpreadsheet size={14} />
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              onClick={() => setShowRecordMonthlyModal(true)}
              className="h-11 px-5 rounded-2xl bg-white text-emerald-700 font-bold text-[13px] shadow-lg hover:bg-emerald-50 transition-colors shrink-0 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Record Payment</span>
            </button>
          </div>
        }
      />

      {/* ── Top Financial KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Pending */}
        <div
          onClick={() => setActiveTab('pending')}
          className={`bg-white rounded-[24px] border p-5 transition-all cursor-pointer ${
            activeTab === 'pending'
              ? 'border-amber-400 ring-2 ring-amber-400/20 shadow-[0_8px_30px_rgba(245,158,11,0.12)]'
              : 'border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] hover:shadow-md'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock size={19} />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              {allPendingRecords.length} Dues
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">AED {totalPendingAmt.toLocaleString()}</p>
          <p className="text-[12px] font-semibold text-slate-800 mt-1">Pending Amounts</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Unpaid customer balances</p>
        </div>

        {/* Card 2: Monthly Payments */}
        <div
          onClick={() => setActiveTab('monthly')}
          className={`bg-white rounded-[24px] border p-5 transition-all cursor-pointer ${
            activeTab === 'monthly'
              ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-[0_8px_30px_rgba(13,148,136,0.12)]'
              : 'border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] hover:shadow-md'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600">
              <Wallet size={19} />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
              {monthlyPayments.length} Recorded
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">AED {totalMonthlyPaid.toLocaleString()}</p>
          <p className="text-[12px] font-semibold text-slate-800 mt-1">Monthly Payments</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Contract client settlements</p>
        </div>

        {/* Card 3: Total Collections */}
        <div
          onClick={() => setActiveTab('history')}
          className={`bg-white rounded-[24px] border p-5 transition-all cursor-pointer ${
            activeTab === 'history'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-[0_8px_30px_rgba(16,185,129,0.12)]'
              : 'border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] hover:shadow-md'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 size={19} />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Total Realized
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">AED {grandTotalCollected.toLocaleString()}</p>
          <p className="text-[12px] font-semibold text-slate-800 mt-1">Total Collections</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Daily shifts + monthly</p>
        </div>

        {/* Card 4: Collection Rate */}
        <div className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <DollarSign size={19} />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {collectionRate}%
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">{collectionRate}%</p>
          <p className="text-[12px] font-semibold text-slate-800 mt-1">Collection Efficiency</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Realized vs total booked</p>
        </div>
      </div>

      {/* ── Main Navigation Tabs Bar: Pending Amounts | Monthly Payments | All Transactions ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-3 shadow-[0_4px_20px_rgba(15,23,42,0.04)] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-xl flex-wrap">
          {/* Tab 1: Pending Amounts */}
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Clock size={15} className={activeTab === 'pending' ? 'text-amber-600' : 'text-slate-400'} />
            <span>Pending Amounts</span>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 ml-1">
              {allPendingRecords.length}
            </span>
          </button>

          {/* Tab 2: Monthly Payments */}
          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'monthly'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Wallet size={15} className={activeTab === 'monthly' ? 'text-teal-600' : 'text-slate-400'} />
            <span>Monthly Payments</span>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 ml-1">
              {monthlyPayments.length}
            </span>
          </button>

          {/* Tab 3: All Payment History */}
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Receipt size={15} className={activeTab === 'history' ? 'text-emerald-600' : 'text-slate-400'} />
            <span>Payment History</span>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 ml-1">
              {paymentHistoryRecords.length}
            </span>
          </button>
        </div>

        {/* Quick Helper Button */}
        <div className="flex items-center gap-2">
          {activeTab === 'pending' ? (
            <button
              type="button"
              onClick={() => navigate('/pending')}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-3.5 py-1.5 rounded-xl border border-amber-200 transition-colors cursor-pointer"
            >
              <span>Detailed Pending Hub</span>
              <ArrowRight size={13} />
            </button>
          ) : activeTab === 'monthly' ? (
            <button
              type="button"
              onClick={() => setShowRecordMonthlyModal(true)}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-3.5 py-1.5 rounded-xl border border-teal-200 transition-colors cursor-pointer"
            >
              <Plus size={13} />
              <span>Record Monthly Payment</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 1: PENDING AMOUNTS CONTENT                              */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'pending' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Sub Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by client, address, staff, or remarks..."
                  value={pendingSearch}
                  onChange={e => setPendingSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-9 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-amber-500 font-medium text-slate-800"
                />
                {pendingSearch && (
                  <button onClick={() => setPendingSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Date Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { id: 'all',        label: 'All Time' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_30',    label: '30 Days' },
                  { id: 'last_7',     label: '7 Days' },
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPendingDateFilter(p.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                      pendingDateFilter === p.id
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results counter */}
            <div className="text-right shrink-0">
              <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/60">
                Showing <span className="text-amber-700 font-extrabold">{filteredPendingRecords.length}</span> pending dues · Total <span className="text-red-600 font-extrabold">AED {filteredPendingRecords.reduce((s, r) => s + r.pendingAmount, 0).toLocaleString()}</span>
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#E4E8EC] bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-4">Client / Address</th>
                    <th className="px-5 py-4">Job Date</th>
                    <th className="px-5 py-4">Staff</th>
                    <th className="px-5 py-4">Service</th>
                    <th className="px-5 py-4 text-right">Charges</th>
                    <th className="px-5 py-4 text-right">Received</th>
                    <th className="px-5 py-4 text-right">Pending Due</th>
                    <th className="px-5 py-4 text-center">Payment Mode</th>
                    <th className="px-5 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {filteredPendingRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                        <CheckCircle size={32} className="mx-auto mb-2 text-emerald-400" />
                        <p className="font-semibold text-slate-700">No pending amounts found</p>
                        <p className="text-[12px] text-slate-400 mt-0.5">All customer dues for this filter are cleared</p>
                      </td>
                    </tr>
                  ) : (
                    filteredPendingRecords.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td
                          className="px-5 py-4 cursor-pointer group"
                          onClick={() => handleOpenEditPending(item)}
                          title="Click to view & edit details"
                        >
                          <p className="text-[13px] font-bold text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                            <span>{item.clientName}</span>
                            <Edit2 size={11} className="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </p>
                          <p className="text-[11px] text-slate-500 truncate max-w-[220px]">{item.address}</p>
                        </td>
                        <td className="px-5 py-4 text-[12px] font-medium text-slate-700 whitespace-nowrap">
                          {formatDate(item.date)}
                        </td>
                        <td className="px-5 py-4 text-[12px] text-slate-600 whitespace-nowrap">
                          {item.staffName}
                        </td>
                        <td className="px-5 py-4 text-[12px] text-slate-600 truncate max-w-[160px]">
                          {item.service}
                        </td>
                        <td className="px-5 py-4 text-right text-[12.5px] font-semibold text-slate-700 whitespace-nowrap">
                          AED {item.charges.toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-right text-[12.5px] font-semibold text-emerald-600 whitespace-nowrap">
                          AED {item.received.toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className="inline-block px-2.5 py-1 rounded-full text-[12px] font-extrabold bg-red-50 text-red-700 border border-red-200">
                            AED {item.pendingAmount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60">
                            {item.paymentMode || 'Pending'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditPending(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11.5px] transition-colors cursor-pointer"
                              title="Edit payment & job details"
                            >
                              <Edit2 size={12} className="text-slate-500" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const pid = getClientProfileId(item.clientName || item.address, clients)
                                navigate(`/clients/${pid}`)
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[11.5px] border border-teal-200/80 transition-colors cursor-pointer"
                              title="View Client Profile"
                            >
                              <User size={12} className="text-teal-600" />
                              <span>Profile</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPendingItem(item)
                                setCollectAmount(String(item.pendingAmount))
                                setShowCollectModal(true)
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11.5px] shadow-xs transition-colors cursor-pointer"
                              title="Collect pending amount"
                            >
                              <Check size={12} strokeWidth={2.5} />
                              <span>Collect</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 2: MONTHLY PAYMENTS CONTENT                             */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'monthly' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Sub Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by client name, reference #, or billing month..."
                  value={monthlySearch}
                  onChange={e => setMonthlySearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-9 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium text-slate-800"
                />
                {monthlySearch && (
                  <button onClick={() => setMonthlySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Method Filter */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {['all', 'Bank Transfer', 'Cash', 'Credit Card', 'Cheque'].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonthlyMethodFilter(m)}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                      monthlyMethodFilter === m
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {m === 'all' ? 'All Methods' : m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/60">
                Showing <span className="text-teal-700 font-extrabold">{filteredMonthlyPayments.length}</span> payments · Total <span className="text-emerald-700 font-extrabold">AED {filteredMonthlyPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}</span>
              </span>

              <button
                type="button"
                onClick={() => setShowRecordMonthlyModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-[12px] shadow-xs transition-colors cursor-pointer"
              >
                <Plus size={13} strokeWidth={2.5} />
                <span>Add Record</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#E4E8EC] bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-4">Client Name</th>
                    <th className="px-5 py-4">Billing Month</th>
                    <th className="px-5 py-4">Payment Date</th>
                    <th className="px-5 py-4 text-center">Payment Method</th>
                    <th className="px-5 py-4">Reference / Cheque #</th>
                    <th className="px-5 py-4 text-right">Amount (AED)</th>
                    <th className="px-5 py-4">Notes</th>
                    <th className="px-5 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {filteredMonthlyPayments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                        <Wallet size={32} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-700">No monthly client payments recorded</p>
                        <p className="text-[12px] text-slate-400 mt-0.5">Click "Add Record" to log a contract payment</p>
                      </td>
                    </tr>
                  ) : (
                    filteredMonthlyPayments.map(payment => (
                      <tr key={payment.id} className="hover:bg-slate-50/80 transition-colors">
                        <td
                          className="px-5 py-4 cursor-pointer group"
                          onClick={() => handleOpenEditMonthly(payment)}
                          title="Click to view & edit details"
                        >
                          <p className="text-[13.5px] font-bold text-slate-900 group-hover:text-teal-700 transition-colors flex items-center gap-1.5">
                            <span>{payment.clientName}</span>
                            <Edit2 size={11} className="text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </p>
                        </td>
                        <td className="px-5 py-4 text-[12px] font-semibold text-slate-700 whitespace-nowrap">
                          {payment.invoiceMonth || '—'}
                        </td>
                        <td className="px-5 py-4 text-[12px] text-slate-600 whitespace-nowrap">
                          {formatDate(payment.date)}
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <span
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                              payment.paymentMethod === 'Bank Transfer'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : payment.paymentMethod === 'Cash'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : payment.paymentMethod === 'Cheque'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {payment.paymentMethod}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[12px] font-mono text-slate-600">
                          {payment.referenceNumber || '—'}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className="text-[14px] font-extrabold text-emerald-600">
                            AED {payment.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[12px] text-slate-500 truncate max-w-[200px]">
                          {payment.notes || '—'}
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditMonthly(payment)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11.5px] transition-colors cursor-pointer"
                              title="Edit Payment Details"
                            >
                              <Edit2 size={12} className="text-slate-500" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const pid = getClientProfileId(payment.clientName, clients)
                                navigate(`/clients/${pid}`)
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[11.5px] border border-teal-200/80 transition-colors cursor-pointer"
                              title="View Client Profile"
                            >
                              <User size={12} className="text-teal-600" />
                              <span>Profile</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedMonthlyPayment(payment)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="View Details"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Delete payment record of AED ${payment.amount} for ${payment.clientName}?`)) {
                                  setMonthlyPayments(prev => prev.filter(p => p.id !== payment.id))
                                }
                              }}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete Payment"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 3: ALL PAYMENT HISTORY LEDGER                           */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Sub Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[280px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search payment history by client, method, category, or amount..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="w-full text-[13px] pl-10 pr-9 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-medium text-slate-800"
              />
              {historySearch && (
                <button onClick={() => setHistorySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="text-right shrink-0">
              <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/60">
                Total Realized Ledger: <span className="text-emerald-700 font-extrabold">AED {paymentHistoryRecords.reduce((s, r) => s + r.amount, 0).toLocaleString()}</span>
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#E4E8EC] bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Client Name</th>
                    <th className="px-5 py-4">Category</th>
                    <th className="px-5 py-4 text-center">Payment Mode</th>
                    <th className="px-5 py-4">Reference / Info</th>
                    <th className="px-5 py-4 text-right">Amount (AED)</th>
                    <th className="px-5 py-4 text-center">Status</th>
                    <th className="px-5 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {paymentHistoryRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                        <Receipt size={32} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-700">No transactions match your search</p>
                      </td>
                    </tr>
                  ) : (
                    paymentHistoryRecords.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-4 text-[12px] font-medium text-slate-700 whitespace-nowrap">
                          {formatDate(item.date)}
                        </td>
                        <td
                          className="px-5 py-4 cursor-pointer group"
                          onClick={() => handleOpenEditHistory(item)}
                          title="Click to view & edit details"
                        >
                          <p className="text-[13px] font-bold text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                            <span>{item.client}</span>
                            <Edit2 size={11} className="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </p>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                              item.type === 'Monthly Contract'
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : item.type === 'Recovery'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {item.type}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center text-[12px] font-medium text-slate-700 whitespace-nowrap">
                          {item.method}
                        </td>
                        <td className="px-5 py-4 text-[12px] text-slate-500 font-mono">
                          {item.reference || item.notes || '—'}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className="text-[13.5px] font-extrabold text-emerald-600">
                            AED {item.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            ✓ Collected
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditHistory(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11.5px] transition-colors cursor-pointer"
                              title="Edit payment & job details"
                            >
                              <Edit2 size={12} className="text-slate-500" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const pid = getClientProfileId(item.client, clients)
                                navigate(`/clients/${pid}`)
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[11.5px] border border-teal-200/80 transition-colors cursor-pointer"
                              title="View Client Profile"
                            >
                              <User size={12} className="text-teal-600" />
                              <span>Profile</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Record Monthly Client Payment ── */}
      <Modal
        open={showRecordMonthlyModal}
        onClose={() => setShowRecordMonthlyModal(false)}
        title="Record Monthly Client Payment"
        size="md"
      >
        <form onSubmit={handleSaveMonthlyPayment} className="space-y-4">
          <div className="relative">
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">Client Name *</label>
            <input
              type="text"
              required
              placeholder="Search or enter client name..."
              value={mClientName}
              onChange={e => {
                setMClientName(e.target.value)
                setClientSearchDropdown(true)
              }}
              onFocus={() => setClientSearchDropdown(true)}
              className="w-full text-[13px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium"
            />

            {/* Quick autocomplete dropdown from clients */}
            {clientSearchDropdown && mClientName && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#E4E8EC] rounded-xl shadow-lg max-h-40 overflow-y-auto">
                {clients
                  .filter(c => c.full_name.toLowerCase().includes(mClientName.toLowerCase()))
                  .slice(0, 5)
                  .map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setMClientName(c.full_name)
                        setClientSearchDropdown(false)
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-teal-50 text-[12.5px] font-medium text-slate-800 transition-colors flex items-center justify-between"
                    >
                      <span>{c.full_name}</span>
                      <span className="text-[11px] text-slate-400">{c.area || 'Client'}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">Amount (AED) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="e.g. 2500"
                value={mAmount}
                onChange={e => setMAmount(e.target.value)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-bold text-emerald-600"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">Payment Date *</label>
              <input
                type="date"
                required
                value={mDate}
                onChange={e => setMDate(e.target.value)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={mMethod}
                onChange={e => setMMethod(e.target.value as any)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium cursor-pointer"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Cheque">Cheque</option>
                <option value="Online">Online</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">Billing Period</label>
              <input
                type="text"
                placeholder="e.g. October 2026"
                value={mMonth}
                onChange={e => setMMonth(e.target.value)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">Reference / Cheque Number</label>
            <input
              type="text"
              placeholder="e.g. TRF-98234 or Cheque #10492"
              value={mRef}
              onChange={e => setMRef(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 font-mono text-[12px]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">Notes / Remarks</label>
            <textarea
              rows={2}
              placeholder="Optional payment notes..."
              value={mNotes}
              onChange={e => setMNotes(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-teal-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowRecordMonthlyModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold">
              Save Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Collect Pending Amount ── */}
      <Modal
        open={showCollectModal}
        onClose={() => {
          setShowCollectModal(false)
          setSelectedPendingItem(null)
        }}
        title="Collect Pending Payment"
        size="md"
      >
        {selectedPendingItem && (
          <form onSubmit={handleCollectPending} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">Customer</p>
                  <p className="text-[15px] font-bold text-slate-900">{selectedPendingItem.clientName}</p>
                  <p className="text-[12px] text-slate-500">{selectedPendingItem.address}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">Pending Due</p>
                  <p className="text-[17px] font-black text-red-600">AED {selectedPendingItem.pendingAmount.toLocaleString()}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200/80 flex justify-between text-[12px] text-slate-600">
                <span>Job Date: {formatDate(selectedPendingItem.date)}</span>
                <span>Original Charges: AED {selectedPendingItem.charges}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">Amount Paying (AED) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={collectAmount}
                  onChange={e => setCollectAmount(e.target.value)}
                  className="w-full text-[14px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">Collection Date *</label>
                <input
                  type="date"
                  required
                  value={collectDate}
                  onChange={e => setCollectDate(e.target.value)}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={collectMethod}
                onChange={e => setCollectMethod(e.target.value as any)}
                className="w-full text-[13px] px-3.5 py-2.5 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-medium cursor-pointer"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCollectModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                Confirm Collection
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Modal: Monthly Payment Detail ── */}
      <Modal
        open={!!selectedMonthlyPayment}
        onClose={() => setSelectedMonthlyPayment(null)}
        title="Monthly Payment Details"
        size="md"
      >
        {selectedMonthlyPayment && (
          <div className="space-y-4">
            <div className="bg-teal-50/70 border border-teal-100 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <p className="text-[12px] text-teal-800 font-semibold">{selectedMonthlyPayment.clientName}</p>
                <p className="text-[11px] text-teal-600">{selectedMonthlyPayment.invoiceMonth || 'Contract Client'}</p>
              </div>
              <p className="text-[20px] font-black text-emerald-700">AED {selectedMonthlyPayment.amount.toLocaleString()}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[12.5px]">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 font-semibold uppercase">Date</span>
                <p className="font-bold text-slate-800 mt-0.5">{formatDate(selectedMonthlyPayment.date)}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 font-semibold uppercase">Method</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedMonthlyPayment.paymentMethod}</p>
              </div>
            </div>

            {selectedMonthlyPayment.referenceNumber && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 font-semibold uppercase">Reference / Cheque #</span>
                <p className="font-mono text-[12px] font-semibold text-slate-800 mt-0.5">{selectedMonthlyPayment.referenceNumber}</p>
              </div>
            )}

            {selectedMonthlyPayment.notes && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 font-semibold uppercase">Notes</span>
                <p className="text-[12px] text-slate-700 mt-0.5">{selectedMonthlyPayment.notes}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedMonthlyPayment(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: Edit Payment & Job Details ── */}
      <Modal
        open={!!editingItem}
        onClose={() => setEditingItem(null)}
        title="Edit Payment & Job Details"
        size="lg"
      >
        {editingItem && (
          <form onSubmit={handleSaveEditItem} className="space-y-4 font-sans">
            {/* Header / Client Info Card */}
            <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-slate-50 rounded-2xl p-4 border border-emerald-200/70 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md shadow-emerald-600/20">
                  {editingItem.clientName.charAt(0).toUpperCase() || 'C'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900">{editingItem.clientName}</h3>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200 shadow-2xs">
                      {editingItem.source}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin size={12} className="text-emerald-600 shrink-0" />
                    <span>{editingItem.address || 'Dubai, UAE'}</span>
                    {editingItem.area && editingItem.area !== '—' && (
                      <span className="text-slate-400">· {editingItem.area}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* View Profile Action inside Modal Header */}
              <button
                type="button"
                onClick={() => {
                  const pid = getClientProfileId(editingItem.clientName || editingItem.address, clients)
                  setEditingItem(null)
                  navigate(`/clients/${pid}`)
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-[12px] border border-emerald-200 shadow-xs transition-all cursor-pointer"
              >
                <User size={13} className="text-emerald-600" />
                <span>View Profile</span>
                <ExternalLink size={12} className="text-emerald-500" />
              </button>
            </div>

            {/* Editable Form Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                name="clientName"
                label="Client / Contact Name *"
                value={editingItem.clientName}
                onChange={e => setEditingItem({ ...editingItem, clientName: e.target.value })}
                required
              />

              <Input
                name="service"
                label="Job / Service Description"
                placeholder="e.g. Standard Clean, Deep Clean..."
                value={editingItem.service}
                onChange={e => setEditingItem({ ...editingItem, service: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                name="address"
                label="Service Address (Building / Flat / Villa) *"
                placeholder="Full address"
                value={editingItem.address}
                onChange={e => setEditingItem({ ...editingItem, address: e.target.value })}
                required
              />

              <Input
                name="area"
                label="Area / City"
                placeholder="e.g. Dubai Marina, Al Barsha, JLT..."
                value={editingItem.area}
                onChange={e => setEditingItem({ ...editingItem, area: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                name="staffName"
                label="Assigned Cleaner / Staff"
                placeholder="Cleaner name"
                value={editingItem.staffName}
                onChange={e => setEditingItem({ ...editingItem, staffName: e.target.value })}
              />

              <Input
                name="date"
                label="Job / Payment Date *"
                type="date"
                value={editingItem.date}
                onChange={e => setEditingItem({ ...editingItem, date: e.target.value })}
                required
              />
            </div>

            {/* Duty Hours & Timing */}
            {editingItem.source === 'Daily Job Sheet' && (
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <Input
                  name="dutyHours"
                  label="Duty Hours"
                  type="number"
                  step="0.5"
                  min="0"
                  value={editingItem.dutyHours ?? ''}
                  onChange={e => setEditingItem({ ...editingItem, dutyHours: Number(e.target.value) || 0 })}
                />
                <Input
                  name="startTime"
                  label="Start Time"
                  type="time"
                  value={editingItem.startTime || ''}
                  onChange={e => setEditingItem({ ...editingItem, startTime: e.target.value })}
                />
                <Input
                  name="endTime"
                  label="End Time"
                  type="time"
                  value={editingItem.endTime || ''}
                  onChange={e => setEditingItem({ ...editingItem, endTime: e.target.value })}
                />
              </div>
            )}

            {/* Financial Amounts & Payment Mode */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                name="charges"
                label="Total Charges (AED) *"
                type="number"
                min="0"
                step="0.5"
                value={editingItem.charges}
                onChange={e => setEditingItem({ ...editingItem, charges: Number(e.target.value) || 0 })}
                required
              />

              <Input
                name="received"
                label="Amount Received (AED)"
                type="number"
                min="0"
                step="0.5"
                value={editingItem.received}
                onChange={e => setEditingItem({ ...editingItem, received: Number(e.target.value) || 0 })}
              />

              <Select
                name="paymentMode"
                label="Payment Mode / Status"
                value={editingItem.paymentMode}
                onChange={e => setEditingItem({ ...editingItem, paymentMode: e.target.value })}
              >
                <option value="Pending">Pending</option>
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Monthly">Monthly Contract</option>
                <option value="Cheque">Cheque</option>
              </Select>
            </div>

            {/* Live Financial Calculation Box */}
            <div className="bg-slate-50/90 rounded-2xl p-4 border border-[#E4E8EC] grid grid-cols-3 gap-3 text-center">
              <div>
                <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">Billed Charges</span>
                <p className="text-lg font-black text-slate-800 mt-0.5">AED {cleanNum(editingItem.charges).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">Received</span>
                <p className="text-lg font-black text-emerald-600 mt-0.5">AED {cleanNum(editingItem.received).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Due</span>
                <p className={`text-lg font-black mt-0.5 ${
                  Math.max(0, cleanNum(editingItem.charges) - cleanNum(editingItem.received)) > 0
                    ? 'text-red-600'
                    : 'text-emerald-600'
                }`}>
                  AED {Math.max(0, cleanNum(editingItem.charges) - cleanNum(editingItem.received)).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Remarks / Notes */}
            <Textarea
              name="remarks"
              label="Remarks / Payment Notes"
              placeholder="Add any shift notes or transaction references..."
              rows={2}
              value={editingItem.remarks}
              onChange={e => setEditingItem({ ...editingItem, remarks: e.target.value })}
            />

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-3 flex-wrap">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const pid = getClientProfileId(editingItem.clientName || editingItem.address, clients)
                  setEditingItem(null)
                  navigate(`/clients/${pid}`)
                }}
                className="text-slate-700 font-bold text-[12.5px]"
              >
                <User size={14} className="mr-1.5 text-teal-600" />
                <span>Open Client Profile</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingItem(null)}
                  className="font-bold text-[12.5px]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12.5px] shadow-sm"
                >
                  <Save size={14} className="mr-1.5" />
                  <span>Save Changes</span>
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

    </div>
  )
}
