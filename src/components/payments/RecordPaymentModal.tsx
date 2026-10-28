import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Wallet, DollarSign, Calendar, CreditCard, Building2,
  Check, X, Search, ChevronDown, CheckCircle2, User,
  FileText, AlertCircle, Banknote, Globe, Receipt
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useData } from '@/store/DataContext'
import type { MonthlyClientPayment, Client } from '@/types'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { calcClientPendingBalance } from '@/lib/clientDataSync'
import { todayDubai } from '@/lib/dubaiTime'

export interface RecordPaymentModalProps {
  open: boolean
  onClose: () => void
  initialClientName?: string
  initialClientId?: string
  initialAmount?: number | string
  onSuccess?: (payment: MonthlyClientPayment) => void
}

const PAYMENT_METHODS: Array<{
  id: MonthlyClientPayment['paymentMethod']
  label: string
  icon: any
}> = [
  { id: 'Bank Transfer', label: 'Bank Transfer', icon: Building2 },
  { id: 'Cash', label: 'Cash', icon: Banknote },
  { id: 'Credit Card', label: 'Credit Card', icon: CreditCard },
  { id: 'Online', label: 'Online Payment', icon: Globe },
  { id: 'Cheque', label: 'Cheque', icon: Receipt },
]

export function RecordPaymentModal({
  open,
  onClose,
  initialClientName = '',
  initialClientId,
  initialAmount = '',
  onSuccess,
}: RecordPaymentModalProps) {
  const { clients, dailyJobs, invoices } = useData()

  const [clientName, setClientName] = useState(initialClientName)
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(initialClientId)
  const [amount, setAmount] = useState<string>(initialAmount ? String(initialAmount) : '')
  const [date, setDate] = useState<string>(() => todayDubai())
  const [paymentMethod, setPaymentMethod] = useState<MonthlyClientPayment['paymentMethod']>('Bank Transfer')
  const [billingMonth, setBillingMonth] = useState<string>(() =>
    new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  )
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')

  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Reset or update state when modal opens or initial values change
  useEffect(() => {
    if (open) {
      setClientName(initialClientName)
      setSelectedClientId(initialClientId)
      setAmount(initialAmount ? String(initialAmount) : '')
      setDate(todayDubai())
      setBillingMonth(new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
      setReferenceNumber('')
      setNotes('')
      setIsDropdownOpen(false)
    }
  }, [open, initialClientName, initialClientId, initialAmount])

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isDropdownOpen])

  // Calculate client dues
  const getClientDue = (c: Client) => {
    const nameLower = (c.full_name || '').toLowerCase().trim()
    const clientInvs = (invoices || []).filter(
      i => i.client_id === c.id || (i.client_name && i.client_name.toLowerCase().trim() === nameLower)
    )
    const invOutstanding =
      clientInvs.reduce((s, i) => s + (i.total || 0), 0) -
      clientInvs.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0)
    const clientPendingBalance = calcClientPendingBalance(c, dailyJobs || [])
    return Math.max(0, clientPendingBalance + invOutstanding)
  }

  // Filtered client suggestions
  const clientSuggestions = useMemo(() => {
    const q = clientName.toLowerCase().trim()
    const all = clients || []
    if (!q) {
      return all.slice(0, 20)
    }
    return all.filter(c => {
      const name = (c.full_name || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      const area = (c.area || '').toLowerCase()
      const bldg = (c.building_name || '').toLowerCase()
      return name.includes(q) || phone.includes(q) || area.includes(q) || bldg.includes(q)
    }).slice(0, 20)
  }, [clients, clientName])

  // Selected client's pending balance
  const currentClientDue = useMemo(() => {
    if (!clientName.trim()) return 0
    const matched = (clients || []).find(
      c => c.id === selectedClientId || c.full_name.toLowerCase().trim() === clientName.toLowerCase().trim()
    )
    return matched ? getClientDue(matched) : 0
  }, [clients, clientName, selectedClientId])

  const handleSelectClient = (c: Client) => {
    setClientName(c.full_name)
    setSelectedClientId(c.id)
    setIsDropdownOpen(false)
    const due = getClientDue(c)
    if (due > 0 && (!amount || Number(amount) === 0)) {
      setAmount(String(due))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!clientName.trim()) {
      alert('Please enter or select a Client Name.')
      return
    }
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid payment amount.')
      return
    }

    const newPayment: MonthlyClientPayment = {
      id: `mp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      clientName: clientName.trim(),
      clientId: selectedClientId,
      amount: amt,
      date: date || todayDubai(),
      paymentMethod,
      referenceNumber: referenceNumber.trim() || undefined,
      invoiceMonth: billingMonth.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    }

    // Persist to unified localStorage key
    const currentList = safeLocalStorageGet<MonthlyClientPayment[]>('safaeewala_monthly_client_payments', [])
    const updatedList = [newPayment, ...currentList]
    safeLocalStorageSet('safaeewala_monthly_client_payments', updatedList)

    // Dispatch global events so all open screens stay 100% synchronized
    window.dispatchEvent(new CustomEvent('safaeewala_payments_updated', { detail: newPayment }))
    window.dispatchEvent(new Event('storage'))

    if (onSuccess) {
      onSuccess(newPayment)
    }

    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Client Payment"
      size="md"
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Client Name Field with Dynamic Suggestions ── */}
        <div className="relative" ref={dropdownRef}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1">
              <User size={13} className="text-teal-600" />
              <span>Client Name *</span>
            </label>
            {clientName && (
              <span className="text-[11px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                {currentClientDue > 0 ? `Due: AED ${currentClientDue.toLocaleString()}` : 'Client Selected'}
              </span>
            )}
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              required
              placeholder="Search or enter client name…"
              value={clientName}
              onChange={e => {
                setClientName(e.target.value)
                setSelectedClientId(undefined)
                setIsDropdownOpen(true)
              }}
              onFocus={() => setIsDropdownOpen(true)}
              className="w-full text-[13px] pl-3.5 pr-16 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white font-medium text-slate-900 transition-colors shadow-2xs"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {clientName && (
                <button
                  type="button"
                  onClick={() => {
                    setClientName('')
                    setSelectedClientId(undefined)
                    setIsDropdownOpen(true)
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                  title="Clear"
                >
                  <X size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsDropdownOpen(prev => !prev)}
                className="p-1 text-slate-400 hover:text-teal-600 rounded-lg transition-colors cursor-pointer"
                title="Toggle client suggestions"
              >
                <ChevronDown size={14} className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-teal-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Dynamic Suggestions Dropdown */}
          {isDropdownOpen && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-150">
              <div className="p-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <span>Select from Clients ({clientSuggestions.length})</span>
                <span className="text-[10px] lowercase text-slate-400 font-normal">Type to filter</span>
              </div>
              {clientSuggestions.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-[12px]">
                  No matching clients found. You can still save with "{clientName}".
                </div>
              ) : (
                clientSuggestions.map(c => {
                  const due = getClientDue(c)
                  const isSelected = c.id === selectedClientId || c.full_name.toLowerCase() === clientName.toLowerCase()
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectClient(c)}
                      className={`w-full text-left px-3.5 py-2.5 hover:bg-teal-50/80 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected ? 'bg-teal-50/60 font-semibold' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-bold text-slate-800 truncate">{c.full_name}</span>
                          {c.source && (
                            <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              {c.source}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {[c.phone, c.building_name, c.area].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {due > 0 ? (
                          <span className="text-[11px] font-extrabold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full block">
                            AED {due.toLocaleString()} Due
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            Settled
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* ── Amount (AED) & Quick Chips ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1">
              <DollarSign size={13} className="text-emerald-600" />
              <span>Amount (AED) *</span>
            </label>
            {currentClientDue > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(currentClientDue))}
                className="text-[11px] font-extrabold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100/80 border border-red-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
              >
                Pay Full Due: AED {currentClientDue.toLocaleString()}
              </button>
            )}
          </div>

          <div className="relative">
            <input
              type="number"
              step="0.01"
              required
              min="0.01"
              placeholder="e.g. 1500"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full text-[15px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white font-black text-emerald-700 transition-colors shadow-2xs"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-black text-emerald-700/80 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              AED
            </span>
          </div>

          {/* Common Quick Chips */}
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick:</span>
            {[200, 350, 500, 1000, 1500, 2500].map(val => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(String(val))}
                className={`text-[11px] px-2 py-0.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                  amount === String(val)
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                AED {val}
              </button>
            ))}
          </div>
        </div>

        {/* ── Date & Billing Period ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1 mb-1">
              <Calendar size={13} className="text-teal-600" />
              <span>Payment Date *</span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white font-medium text-slate-900"
            />
          </div>

          <div>
            <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1 mb-1">
              <FileText size={13} className="text-teal-600" />
              <span>Billing Period</span>
            </label>
            <input
              type="text"
              placeholder="e.g. October 2026"
              value={billingMonth}
              onChange={e => setBillingMonth(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white font-medium text-slate-900"
            />
          </div>
        </div>

        {/* ── Payment Method Selector ── */}
        <div>
          <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1 mb-1.5">
            <CreditCard size={13} className="text-teal-600" />
            <span>Payment Method</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(m => {
              const Icon = m.icon
              const isSelected = paymentMethod === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`flex items-center gap-2 p-2 rounded-xl border text-[11.5px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-teal-50/90 border-teal-500 text-teal-800 ring-2 ring-teal-500/20 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={14} className={isSelected ? 'text-teal-700' : 'text-slate-400'} />
                  <span className="truncate">{m.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Reference Number ── */}
        <div>
          <label className="text-[12px] font-bold text-slate-700 block mb-1">
            Reference / Transaction / Cheque #
          </label>
          <input
            type="text"
            placeholder="e.g. TRF-98234 or Cheque #10492"
            value={referenceNumber}
            onChange={e => setReferenceNumber(e.target.value)}
            className="w-full text-[13px] px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white font-mono text-slate-800"
          />
        </div>

        {/* ── Notes / Remarks ── */}
        <div>
          <label className="text-[12px] font-bold text-slate-700 block mb-1">
            Payment Notes / Remarks
          </label>
          <textarea
            rows={2}
            placeholder="Optional notes or receipt remarks..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full text-[12.5px] px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white resize-none text-slate-800"
          />
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-9 px-4 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="h-9 px-5 text-[12.5px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Check size={14} className="stroke-[2.5]" />
            <span>Save Payment</span>
          </Button>
        </div>

      </form>
    </Modal>
  )
}
