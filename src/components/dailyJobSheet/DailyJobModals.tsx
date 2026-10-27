import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  AlertCircle, CheckCircle, Pencil, AlertTriangle, Trash2,
  Search, Phone, MapPin, X,
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import type {
  DailyJob,
  DailyExpense,
  DailyPendingItem,
  DailyPendingReceivedItem,
  DailyAdvanceItem,
  Client,
} from '@/types'
import { allocateClientCollection, calcClientPendingBalance } from '@/lib/clientDataSync'
import {
  cleanNum,
  formatTimeOnly,
  fmtDate,
  EXPENSE_CATEGORIES,
} from './jobSheetUtils'

/* ── Add Expense Modal ── */
export function AddExpenseModal({
  open,
  onClose,
  selectedDate,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  selectedDate: string
  onAdd: (exp: { date: string; name: string; category: string; amount: number }) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Add Expense" size="sm">
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget as HTMLFormElement)
          onAdd({
            date: selectedDate,
            name: fd.get('name') as string,
            category: fd.get('category') as string,
            amount: cleanNum(fd.get('amount')),
          })
          onClose()
        }}
      >
        <Input name="name" label="Driver / Person Name" placeholder="e.g. Ahmed, Raju…" required />
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Category</label>
          <select name="category" className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700">
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Input name="amount" label="Amount (AED)" type="number" min="0" step="0.01" placeholder="0.00" required />
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1">Add Expense</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Edit Expense Modal ── */
export function EditExpenseModal({
  expense,
  onClose,
  onUpdate,
}: {
  expense: DailyExpense | null
  onClose: () => void
  onUpdate: (id: string, patch: Partial<DailyExpense>) => void
}) {
  return (
    <Modal open={!!expense} onClose={onClose} title="Edit Expense" size="sm">
      {expense && (
        <form
          className="space-y-4 pt-1"
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget as HTMLFormElement)
            onUpdate(expense.id, {
              name: fd.get('name') as string,
              category: fd.get('category') as string,
              amount: cleanNum(fd.get('amount')),
            })
            onClose()
          }}
        >
          <Input name="name" label="Driver / Person Name" defaultValue={expense.name} required />
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Category</label>
            <select
              name="category"
              defaultValue={expense.category}
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700"
            >
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Input name="amount" label="Amount (AED)" type="number" min="0" step="0.01" defaultValue={expense.amount} required />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">Save Changes</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/* ── Delete Day Confirm Modal ── */
export function DeleteDayConfirmModal({
  open,
  onClose,
  selectedDate,
  jobsCount,
  expensesCount,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  selectedDate: string
  jobsCount: number
  expensesCount: number
  onConfirm: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Delete Day's Data" size="sm">
      <div className="space-y-4 pt-1">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <AlertCircle size={22} />
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-slate-900">
              Delete all data for {fmtDate(selectedDate)}?
            </h4>
            <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">
              This will permanently delete all <strong>{jobsCount} jobs</strong> and <strong>{expensesCount} expenses</strong> recorded for this date.
            </p>
          </div>
        </div>

        <div className="bg-red-50/80 border border-red-200 rounded-xl p-3 text-[11.5px] text-red-700 leading-relaxed">
          ⚠️ <strong>Warning:</strong> This action cannot be undone. All entries for this day will be permanently removed.
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] shadow-sm transition-all cursor-pointer"
          >
            Yes, Delete All
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Delete All Data Confirm Modal ── */
export function DeleteAllConfirmModal({
  open,
  onClose,
  totalJobsCount,
  totalExpensesCount,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  totalJobsCount: number
  totalExpensesCount: number
  onConfirm: () => Promise<void> | void
}) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!isDeleting) onClose() }} title="Delete All Data" size="md">
      <div className="space-y-4 pt-1">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 border border-red-200 shadow-sm">
            <AlertTriangle size={26} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[15px] font-bold text-slate-900">
              Permanently delete ALL data in the database?
            </h4>
            <p className="text-[12.5px] text-slate-600 mt-1 leading-relaxed">
              This will completely wipe <strong>all {totalJobsCount} jobs</strong>, <strong>all {totalExpensesCount} expenses</strong>, pending amounts, and records across <strong>all dates</strong> from the database.
            </p>
          </div>
        </div>

        <div className="bg-red-50 border-2 border-red-300/80 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-800 font-bold text-[13px]">
            <AlertCircle size={16} className="text-red-600 shrink-0" />
            <span>CRITICAL WARNING — IRREVERSIBLE ACTION</span>
          </div>
          <p className="text-[12px] text-red-700 leading-relaxed">
            By clicking <strong>"Yes, Delete All Data"</strong>, all historical job sheets, daily expenses, pending balances, and imported spreadsheet records will be permanently erased. This action cannot be undone.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            className="flex-1 py-2.5"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Deleting Database…</span>
              </>
            ) : (
              <>
                <Trash2 size={15} />
                <span>Yes, Delete All Data</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Driver / Staff Detail Modal ── */
export function DriverStaffModal({
  staff,
  selectedDate,
  todayJobs,
  onClose,
  onEditJob,
}: {
  staff: { name: string; currentAmount: number } | null
  selectedDate: string
  todayJobs: DailyJob[]
  onClose: () => void
  onEditJob: (job: DailyJob) => void
}) {
  if (!staff) return null
  const staffJobs = todayJobs.filter(j => j.staff_name.trim().toLowerCase() === staff.name.trim().toLowerCase())

  return (
    <Modal
      open={!!staff}
      onClose={onClose}
      title={`Staff / Driver — ${staff.name}`}
      size="md"
    >
      <div className="space-y-4 pt-1">
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-[12.5px]">
          <div>
            <span className="text-emerald-800 font-semibold">Staff Member:</span>{' '}
            <strong className="text-emerald-950 font-bold">{staff.name}</strong>
            <span className="text-slate-500 ml-2">({staffJobs.length} job{staffJobs.length !== 1 ? 's' : ''} on {fmtDate(selectedDate)})</span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-emerald-700 font-medium">Total Collected:</span>{' '}
            <span className="text-[14px] font-black text-emerald-900">AED {staff.currentAmount.toLocaleString()}</span>
          </div>
        </div>

        <div>
          <h5 className="text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-2">Assigned Jobs & Received Amounts</h5>
          {staffJobs.length === 0 ? (
            <p className="text-[12px] text-slate-400 py-3 text-center">No active jobs found for {staff.name}</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              {staffJobs.map(job => (
                <div key={job.id} className="p-3 flex items-center justify-between gap-3 text-[12px] hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">{job.address || 'No address'}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formatTimeOnly(job.start_time)} – {formatTimeOnly(job.end_time)} · Mode: <strong className="text-slate-600">{job.payment_mode}</strong> · Charges: AED {cleanNum(job.charges)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-medium">Received</span>
                      <span className="font-bold text-emerald-700">AED {cleanNum(job.received)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditJob(job)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                      title="Edit this job"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Add Pending Modal ── */
export function AddPendingModal({
  open,
  selectedDate,
  onClose,
  onAdd,
}: {
  open: boolean
  selectedDate: string
  onClose: () => void
  onAdd: (item: DailyPendingItem) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Add Pending Item" size="sm">
      <form
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const client = String(fd.get('client') || '').trim()
          const amount = cleanNum(fd.get('amount'))
          if (!client) return
          onAdd({
            id: `p-${Date.now()}`,
            date: selectedDate,
            client,
            amount,
          })
          onClose()
        }}
        className="space-y-4 pt-2"
      >
        <Input name="client" label="Client Name / Description" placeholder="e.g. Villa 96C, Office 12..." required autoFocus />
        <Input name="amount" label="Pending Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" required />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white">Add Pending</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Edit Pending Modal ── */
export function EditPendingModal({
  item,
  onClose,
  onSave,
}: {
  item: DailyPendingItem | null
  onClose: () => void
  onSave: (id: string, client: string, amount: number) => void
}) {
  return (
    <Modal open={!!item} onClose={onClose} title="Edit Pending Item" size="sm">
      {item && (
        <form
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const client = String(fd.get('client') || '').trim()
            const amount = cleanNum(fd.get('amount'))
            if (!client) return
            onSave(item.id, client, amount)
            onClose()
          }}
          className="space-y-4 pt-2"
        >
          <Input name="client" label="Client Name / Description" defaultValue={item.client} required autoFocus />
          <Input name="amount" label="Pending Amount (AED)" type="number" step="0.01" min="0" defaultValue={item.amount} required />
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white">Save Changes</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/* ── Helper: Compute client's total pending balance from profile and daily shifts ── */
function computeClientPendingAmount(client: Client, dailyJobs: DailyJob[]): number {
  if (!client) return 0
  return calcClientPendingBalance(client, dailyJobs)
}

/* ── Add Pending Received Modal ── */
export function AddPendingReceivedModal({
  open,
  selectedDate,
  onClose,
  onAdd,
}: {
  open: boolean
  selectedDate: string
  onClose: () => void
  onAdd: (item: DailyPendingReceivedItem) => void
}) {
  const { clients, dailyJobs } = useData()

  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [cash, setCash] = useState('')
  const [online, setOnline] = useState('')
  const [remarks, setRemarks] = useState('')
  const [manualPending, setManualPending] = useState<string>('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  // Reset state whenever modal opens or closes
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setClientSearch('')
      setSelectedClient(null)
      setIsDropdownOpen(false)
      setCash('')
      setOnline('')
      setRemarks('')
      setManualPending('')
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  // Filter clients for auto-suggestions
  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase().trim()
    if (!q) {
      return [...clients].sort((a, b) => {
        const pA = cleanNum(a.pending_amount)
        const pB = cleanNum(b.pending_amount)
        return pB - pA
      }).slice(0, 8)
    }
    return clients.filter(c => {
      const name = (c.full_name || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      const bldg = (c.building_name || '').toLowerCase()
      const apt = (c.apartment || '').toLowerCase()
      const area = (c.area || '').toLowerCase()
      return (
        name.includes(q) ||
        phone.includes(q) ||
        bldg.includes(q) ||
        apt.includes(q) ||
        area.includes(q)
      )
    }).slice(0, 10)
  }, [clients, clientSearch])

  // Computed Previous Pending
  const previousPending = useMemo(() => {
    if (selectedClient) {
      return computeClientPendingAmount(selectedClient, dailyJobs)
    }
    return cleanNum(manualPending)
  }, [selectedClient, dailyJobs, manualPending])

  const totalReceived = cleanNum(cash) + cleanNum(online)
  const remainingPending = Math.max(0, previousPending - totalReceived)
  const isOverpaid = totalReceived > previousPending && previousPending > 0
  const overpaidAmount = isOverpaid ? totalReceived - previousPending : 0

  const handleSelectClient = (c: Client) => {
    setSelectedClient(c)
    setClientSearch(c.full_name)
    setIsDropdownOpen(false)
  }

  const handleClearClient = () => {
    setSelectedClient(null)
    setClientSearch('')
    setManualPending('')
    setIsDropdownOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clientName = (selectedClient ? selectedClient.full_name : clientSearch).trim()
    if (!clientName) return

    const cashNum = cleanNum(cash)
    const onlineNum = cleanNum(online)
    if (cashNum === 0 && onlineNum === 0) return

    // Split the collection over the opening balance and oldest unpaid jobs.
    // client.pending_amount stays the original opening balance, so the
    // job pending is never counted twice.
    const allocation = selectedClient
      ? allocateClientCollection(selectedClient, cashNum + onlineNum, dailyJobs)
      : null

    onAdd({
      id: `pr-${Date.now()}`,
      date: selectedDate,
      client: clientName,
      cash: cashNum,
      online: onlineNum,
      client_id: selectedClient?.id,
      previous_pending: previousPending,
      remaining_pending: remainingPending,
      notes: remarks.trim(),
      remarks: remarks.trim(),
      opening_applied: allocation?.opening_applied,
      allocations: allocation?.allocations,
    })

    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Pending Received Item" size="md">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        
        {/* ── Client Selection / Auto-Suggest ── */}
        <div ref={dropdownRef} className="relative">
          <label className="block text-[12px] font-bold text-slate-700 mb-1">
            Client Search & Selection *
          </label>

          {selectedClient ? (
            /* Selected Client Profile Card */
            <div className="p-3.5 bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-slate-50 border border-emerald-200 rounded-2xl relative shadow-2xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-[13px] shadow-xs shrink-0">
                    {selectedClient.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-[14px] font-bold text-slate-900 leading-tight">
                      {selectedClient.full_name}
                    </h4>
                    {(selectedClient.phone || selectedClient.whatsapp) && (
                      <p className="text-[11.5px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone size={11} className="text-emerald-600" />
                        {selectedClient.phone || selectedClient.whatsapp}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearClient}
                  className="text-[11px] font-bold text-slate-500 hover:text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50 border border-slate-200 bg-white transition-colors cursor-pointer"
                  title="Change client selection"
                >
                  Change Client
                </button>
              </div>

              {(selectedClient.building_name || selectedClient.area || selectedClient.apartment) && (
                <div className="mt-2.5 pt-2 border-t border-emerald-200/60 text-[11.5px] text-slate-600 flex items-center gap-1.5">
                  <MapPin size={11} className="text-slate-400 shrink-0" />
                  <span>
                    {[selectedClient.building_name, selectedClient.apartment, selectedClient.area, selectedClient.city].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}

              {/* Previous Pending Dues Alert */}
              <div className="mt-3 p-2.5 bg-white rounded-xl border border-red-200 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-red-600 block tracking-wider">
                    Previous Outstanding Pending
                  </span>
                  <span className="text-[18px] font-black text-red-600">
                    AED {previousPending.toLocaleString()}
                  </span>
                </div>
                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                  previousPending > 0
                    ? 'bg-red-100 text-red-800 border border-red-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}>
                  {previousPending > 0 ? 'Dues Pending' : 'Zero Pending'}
                </span>
              </div>
            </div>
          ) : (
            /* Search Input with Auto-Suggest Dropdown */
            <div className="relative">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Type client name, phone, building, apartment..."
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value)
                    setIsDropdownOpen(true)
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className="w-full text-[13px] pl-9 pr-8 py-2 bg-slate-50 border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
                />
                {clientSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setClientSearch('')
                      setIsDropdownOpen(true)
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Auto-suggest dropdown menu */}
              {isDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-[#E4E8EC] rounded-2xl shadow-xl max-h-64 overflow-y-auto divide-y divide-[#E4E8EC]/70">
                  <div className="p-2 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Suggested Clients ({filteredClients.length})
                  </div>
                  {filteredClients.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-[12px]">
                      No matching registered clients found. You can enter "{clientSearch}" as a custom client name.
                    </div>
                  ) : (
                    filteredClients.map(c => {
                      const clientPending = computeClientPendingAmount(c, dailyJobs)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectClient(c)}
                          className="w-full p-3 text-left hover:bg-emerald-50/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-slate-800 group-hover:text-emerald-800 truncate">
                              {c.full_name}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {[c.building_name, c.apartment, c.area].filter(Boolean).join(', ') || c.phone || 'No address logged'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              clientPending > 0
                                ? 'bg-red-50 text-red-600 border border-red-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {clientPending > 0 ? `Due: AED ${clientPending.toLocaleString()}` : 'No Due'}
                            </span>
                          </div>
                        </button>
                      )
                    })
                  )}
                  {clientSearch.trim() && (
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(false)}
                      className="w-full p-2.5 text-center bg-slate-50 text-[12px] font-bold text-emerald-700 hover:bg-slate-100 transition-colors"
                    >
                      Use "{clientSearch.trim()}" as custom client description
                    </button>
                  )}
                </div>
              )}

              {/* If user types custom name without choosing client from database */}
              {!selectedClient && clientSearch.trim() && !isDropdownOpen && (
                <div className="mt-2.5 p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11.5px] font-bold text-amber-800">
                      Custom / Unregistered Client Entry
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(true)}
                      className="text-[11px] text-amber-700 hover:underline font-semibold"
                    >
                      Choose from registered list
                    </button>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                      Previous Pending Amount for this entry (AED):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 200 (Optional)"
                      value={manualPending}
                      onChange={e => setManualPending(e.target.value)}
                      className="w-full text-[12px] font-bold bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Payment Received Amounts (Cash & Online) ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-[12px] font-bold text-slate-700">
              Payment Amounts Received *
            </label>
            {previousPending > 0 && (
              <div className="flex items-center gap-1.5 text-[10.5px]">
                <span className="text-slate-400">Quick Fill:</span>
                <button
                  type="button"
                  onClick={() => { setCash(String(previousPending)); setOnline('0') }}
                  className="font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                >
                  Full Cash
                </button>
                <button
                  type="button"
                  onClick={() => { setOnline(String(previousPending)); setCash('0') }}
                  className="font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                >
                  Full Online
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-emerald-800 mb-1">
                Cash Received (AED)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={cash}
                onChange={e => setCash(e.target.value)}
                className="w-full text-[13px] font-bold text-emerald-800 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-blue-800 mb-1">
                Online Received (AED)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={online}
                onChange={e => setOnline(e.target.value)}
                className="w-full text-[13px] font-bold text-blue-800 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* ── Real-time Balance Calculation Display ── */}
        <div className="p-3.5 bg-slate-50 border border-[#E4E8EC] rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-[12px] text-slate-600">
            <span>Previous Pending Amount:</span>
            <span className="font-bold text-slate-800">
              AED {previousPending.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center text-[12px] text-slate-600">
            <span>Total Received Today (Cash + Online):</span>
            <span className="font-bold text-emerald-700">
              AED {totalReceived.toLocaleString()}
            </span>
          </div>
          <div className="border-t border-[#E4E8EC] pt-2 flex justify-between items-center">
            <span className="text-[12.5px] font-bold text-slate-900">
              Remaining Pending Balance:
            </span>
            <div className="text-right">
              <span className={`text-[16px] font-black ${remainingPending > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                AED {remainingPending.toLocaleString()}
              </span>
              {remainingPending === 0 && totalReceived > 0 && (
                <span className="block text-[10px] text-emerald-600 font-bold">
                  ✓ Outstanding Dues Fully Cleared
                </span>
              )}
            </div>
          </div>
          {isOverpaid && (
            <div className="bg-amber-50 border border-amber-200 p-2 rounded-xl text-[11px] text-amber-800 font-semibold text-center">
              Excess payment of AED {overpaidAmount.toLocaleString()} will be available as Advance Credit
            </div>
          )}
        </div>

        {/* ── Notes and Remarks Field ── */}
        <div>
          <label className="block text-[12px] font-bold text-slate-700 mb-1">
            Notes & Remarks (Optional)
          </label>
          <textarea
            rows={2}
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="e.g. Paid pending shift charges via Cash at site, bank transfer ref #..."
            className="w-full text-[12.5px] bg-slate-50 border border-[#E4E8EC] rounded-xl p-2.5 focus:outline-none focus:border-emerald-500 resize-none font-medium text-slate-700"
          />
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex gap-2 pt-2 border-t border-[#E4E8EC]">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={totalReceived === 0 || (!selectedClient && !clientSearch.trim())}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-50"
          >
            Add Record (AED {totalReceived.toLocaleString()})
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Edit Pending Received Modal ── */
export function EditPendingReceivedModal({
  item,
  onClose,
  onSave,
}: {
  item: DailyPendingReceivedItem | null
  onClose: () => void
  onSave: (id: string, client: string, cash: number, online: number, remarks?: string) => void
}) {
  const [client, setClient] = useState('')
  const [cash, setCash] = useState('')
  const [online, setOnline] = useState('')
  const [remarks, setRemarks] = useState('')
  const [prevItemId, setPrevItemId] = useState<string | null>(null)

  if (item && item.id !== prevItemId) {
    setPrevItemId(item.id)
    setClient(item.client || '')
    setCash(item.cash ? String(item.cash) : '0')
    setOnline(item.online ? String(item.online) : '0')
    setRemarks(item.remarks || item.notes || '')
  } else if (!item && prevItemId !== null) {
    setPrevItemId(null)
  }

  return (
    <Modal open={!!item} onClose={onClose} title="Edit Pending Received Item" size="md">
      {item && (
        <form
          onSubmit={e => {
            e.preventDefault()
            const cName = client.trim()
            if (!cName) return
            onSave(item.id, cName, cleanNum(cash), cleanNum(online), remarks.trim())
            onClose()
          }}
          className="space-y-4 pt-2"
        >
          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Client Name / Description *
            </label>
            <input
              type="text"
              required
              value={client}
              onChange={e => setClient(e.target.value)}
              className="w-full text-[13px] bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Cash Amount (AED)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cash}
                onChange={e => setCash(e.target.value)}
                className="w-full text-[13px] font-bold text-emerald-800 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">
                Online Amount (AED)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={online}
                onChange={e => setOnline(e.target.value)}
                className="w-full text-[13px] font-bold text-blue-700 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">
              Notes & Remarks (Optional)
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Paid pending shift charges, bank ref #..."
              className="w-full text-[12.5px] bg-slate-50 border border-[#E4E8EC] rounded-xl p-2.5 focus:outline-none focus:border-emerald-500 resize-none font-medium text-slate-700"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-[#E4E8EC]">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
              Save Changes
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/* ── Add Advance Modal ── */
export function AddAdvanceModal({
  open,
  selectedDate,
  onClose,
  onAdd,
}: {
  open: boolean
  selectedDate: string
  onClose: () => void
  onAdd: (item: DailyAdvanceItem) => void
}) {
  const { clients } = useData()

  return (
    <Modal open={open} onClose={onClose} title="Add Advance Item" size="sm">
      <form
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const client = String(fd.get('client') || '').trim()
          const received = cleanNum(fd.get('received'))
          const advance = cleanNum(fd.get('advance'))
          if (!client) return
          onAdd({
            id: `adv-${Date.now()}`,
            date: selectedDate,
            client,
            received,
            advance,
          })
          onClose()
        }}
        className="space-y-4 pt-2"
      >
        <div>
          <Input
            name="client"
            list="clients-advance-widget-list"
            label="Client Name / Description"
            placeholder="Search registered client or type name / building..."
            required
            autoFocus
          />
          <datalist id="clients-advance-widget-list">
            {clients.map(c => (
              <option key={c.id} value={c.full_name}>
                {[c.building_name, c.apartment, c.area].filter(Boolean).join(', ')}
              </option>
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input name="received" label="Received Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" defaultValue="0" />
          <Input name="advance" label="Advance Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" required />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">Add Advance</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Edit Advance Modal ── */
export function EditAdvanceModal({
  item,
  onClose,
  onSave,
}: {
  item: DailyAdvanceItem | null
  onClose: () => void
  onSave: (id: string, client: string, received: number, advance: number) => void
}) {
  const { clients } = useData()

  return (
    <Modal open={!!item} onClose={onClose} title="Edit Advance Item" size="sm">
      {item && (
        <form
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const client = String(fd.get('client') || '').trim()
            const received = cleanNum(fd.get('received'))
            const advance = cleanNum(fd.get('advance'))
            if (!client) return
            onSave(item.id, client, received, advance)
            onClose()
          }}
          className="space-y-4 pt-2"
        >
          <div>
            <Input
              name="client"
              list="clients-advance-widget-edit-list"
              label="Client Name / Description"
              defaultValue={item.client}
              required
              autoFocus
            />
            <datalist id="clients-advance-widget-edit-list">
              {clients.map(c => (
                <option key={c.id} value={c.full_name}>
                  {[c.building_name, c.apartment, c.area].filter(Boolean).join(', ')}
                </option>
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input name="received" label="Received Amount (AED)" type="number" step="0.01" min="0" defaultValue={item.received} />
            <Input name="advance" label="Advance Amount (AED)" type="number" step="0.01" min="0" defaultValue={item.advance} required />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">Save Changes</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/* ── Today Pending Details Pop-up Modal ── */
export interface PendingBalanceDetails {
  id: string
  date: string
  client: string
  amount: number
  staff: string
  address: string
  area: string
  remarks: string
  job?: DailyJob
  isJob: boolean
}

export function PendingDetailsModal({
  details,
  onClose,
  onEditJob,
  onEditPending,
  onMarkCollected,
}: {
  details: PendingBalanceDetails | null
  onClose: () => void
  onEditJob: (job: DailyJob) => void
  onEditPending: (details: PendingBalanceDetails) => void
  onMarkCollected: (details: PendingBalanceDetails) => void
}) {
  if (!details) return null

  return (
    <Modal
      open={!!details}
      onClose={onClose}
      title="Pending Job Details"
      size="sm"
    >
      <div className="space-y-4 pt-1">
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-red-800 block">Amount Due</span>
            <span className="text-[20px] font-black text-red-700">AED {details.amount.toLocaleString()}</span>
          </div>
          <div className="text-right">
            <span className="text-[10.5px] text-slate-500 block">Date</span>
            <span className="text-[12px] font-bold text-slate-800">{fmtDate(details.date)}</span>
          </div>
        </div>

        <div className="space-y-2.5 text-[12.5px] bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
            <span className="text-slate-500 font-medium">Staff:</span>
            <strong className="text-slate-900 font-bold">{details.staff}</strong>
          </div>
          <div className="flex items-start justify-between border-b border-slate-200/70 pb-2 gap-3">
            <span className="text-slate-500 font-medium shrink-0">Address:</span>
            <span className="text-slate-800 font-semibold text-right break-words">{details.address || '—'}</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
            <span className="text-slate-500 font-medium">Area / Zone:</span>
            <span className="text-slate-800 font-semibold">{details.area || '—'}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500 font-medium shrink-0">Remarks:</span>
            <span className="text-slate-700 italic text-right break-words">{details.remarks || '—'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
          >
            Close
          </Button>
          <button
            type="button"
            onClick={() => {
              if (details.job) {
                onEditJob(details.job)
              } else {
                onEditPending(details)
              }
              onClose()
            }}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1.5 font-semibold text-[12px]"
            title="Edit Job / Entry"
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            type="button"
            onClick={() => {
              onMarkCollected(details)
              onClose()
            }}
            className="flex-[1.5] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[13px] shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <CheckCircle size={14} /> Mark as Collected
          </button>
        </div>
      </div>
    </Modal>
  )
}
