import React, { useState, useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  AlertCircle, CheckCircle, Pencil, AlertTriangle, Trash2, Users, MapPin, Link2,
  Wallet, Plus, Clock, FileText, Check, ChevronDown
} from 'lucide-react'
import type { TodayPendingEntry } from './ReconciliationWidgets'
import { useData } from '@/store/DataContext'
import type {
  DailyJob,
  DailyExpense,
  DailyPendingItem,
  DailyPendingReceivedItem,
  DailyAdvanceItem,
  Client,
  Employee,
} from '@/types'
import { allocateClientCollection, calcClientPendingBalance, getAssignableClients } from '@/lib/clientDataSync'
import { ClientPicker } from './ClientPicker'
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

/* ── Driver / Staff Detail Modal with Live Advance & Pending Sync ── */
export function DriverStaffModal({
  staff,
  selectedDate,
  todayJobs,
  employees = [],
  driverSummary = {},
  todayAdvanceItems = [],
  todayPendingRcvdItems = [],
  todayPendingEntries = [],
  onClose,
  onEditJob,
  onSelectStaff,
  onAddAdvance,
  onAddPendingRcvd,
  onDeleteAdvance,
  onDeletePendingRcvd,
}: {
  staff: { name: string; currentAmount: number } | null
  selectedDate: string
  todayJobs: DailyJob[]
  employees?: Employee[]
  driverSummary?: Record<string, number>
  todayAdvanceItems?: DailyAdvanceItem[]
  todayPendingRcvdItems?: DailyPendingReceivedItem[]
  todayPendingEntries?: TodayPendingEntry[]
  onClose: () => void
  onEditJob: (job: DailyJob) => void
  onSelectStaff?: (staff: { name: string; currentAmount: number }) => void
  onAddAdvance?: (item: DailyAdvanceItem) => void
  onAddPendingRcvd?: (item: DailyPendingReceivedItem) => void
  onDeleteAdvance?: (id: string) => void
  onDeletePendingRcvd?: (id: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'jobs' | 'advance' | 'pending'>('jobs')

  // Advance Form State
  const [showAdvanceForm, setShowAdvanceForm] = useState(false)
  const [advClient, setAdvClient] = useState('')
  const [advAmount, setAdvAmount] = useState('')
  const [advNotes, setAdvNotes] = useState('')

  // Pending Form State
  const [showPendingForm, setShowPendingForm] = useState(false)
  const [pendClient, setPendClient] = useState('')
  const [pendCash, setPendCash] = useState('')
  const [pendOnline, setPendOnline] = useState('')
  const [pendRemarks, setPendRemarks] = useState('')

  const availableDrivers = useMemo(() => {
    const map = new Map<string, number>()
    // 1. Include only actual drivers from employees roster
    employees.forEach(e => {
      const r = (e.role || '').toLowerCase()
      const d = (e.designation || '').toLowerCase()
      const n = (e.full_name || '').toLowerCase()
      if (r.includes('driver') || d.includes('driver') || n.includes('driver')) {
        const name = (e.full_name || '').trim()
        if (name) map.set(name, driverSummary[name] || 0)
      }
    })
    // 2. Also retain any drivers recorded in driverSummary
    Object.entries(driverSummary).forEach(([name, amt]) => {
      const trimmed = name.trim()
      if (trimmed && !map.has(trimmed)) {
        map.set(trimmed, amt)
      }
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [driverSummary, employees])

  if (!staff) return null

  const activeStaffName = (staff.name || '').trim()

  // Filter shifts for this cleaner / driver
  const staffJobs = todayJobs.filter(j => (j.staff_name || '').trim().toLowerCase() === activeStaffName.toLowerCase())

  // Filter advances for this cleaner / driver
  const staffAdvances = todayAdvanceItems.filter(a => {
    const cRef = ((a as any).cleaner || (a as any).driver || (a as any).staff || a.notes || '').toLowerCase()
    return cRef.includes(activeStaffName.toLowerCase())
  })

  // Filter pending payments collected for this cleaner / driver
  const staffPendingRcvd = todayPendingRcvdItems.filter(p => {
    const pRef = ((p as any).driver || (p as any).staff || p.remarks || p.notes || '').toLowerCase()
    return pRef.includes(activeStaffName.toLowerCase())
  })

  // Filter pending dues for this cleaner
  const staffPendingDues = todayPendingEntries.filter(p => (p.staff || '').toLowerCase().includes(activeStaffName.toLowerCase()))

  // Financial calculations
  const jobsCollectedTotal = staffJobs.reduce((s, j) => {
    if (j.payment_mode !== 'Monthly' && j.payment_mode !== 'Pending') {
      return s + cleanNum(j.received)
    }
    return s
  }, 0)
  const advancesTotal = staffAdvances.reduce((s, a) => s + cleanNum(a.received), 0)
  const pendingRcvdTotal = staffPendingRcvd.reduce((s, p) => s + cleanNum(p.cash) + cleanNum(p.online), 0)
  const grandTotalInHand = jobsCollectedTotal + advancesTotal + pendingRcvdTotal
  const pendingDuesTotal = staffPendingDues.reduce((s, p) => s + cleanNum(p.amount), 0)

  const handleSaveAdvance = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = cleanNum(advAmount)
    const client = advClient.trim() || activeStaffName
    if (amt <= 0 || !onAddAdvance) return
    onAddAdvance({
      id: newId('adv'),
      date: selectedDate,
      client,
      received: amt,
      advance: amt,
      notes: `Driver/Staff: ${activeStaffName}${advNotes.trim() ? ` · ${advNotes.trim()}` : ''}`,
      ...( { cleaner: activeStaffName, driver: activeStaffName } as any ),
    })
    setAdvClient('')
    setAdvAmount('')
    setAdvNotes('')
    setShowAdvanceForm(false)
  }

  const handleSavePending = (e: React.FormEvent) => {
    e.preventDefault()
    const cash = cleanNum(pendCash)
    const online = cleanNum(pendOnline)
    const client = pendClient.trim()
    if ((cash <= 0 && online <= 0) || !client || !onAddPendingRcvd) return
    onAddPendingRcvd({
      id: newId('prcvd'),
      date: selectedDate,
      client,
      cash,
      online,
      remarks: `Driver/Staff: ${activeStaffName}${pendRemarks.trim() ? ` · ${pendRemarks.trim()}` : ''}`,
      ...( { driver: activeStaffName, staff: activeStaffName } as any ),
    })
    setPendClient('')
    setPendCash('')
    setPendOnline('')
    setPendRemarks('')
    setShowPendingForm(false)
  }

  return (
    <Modal
      open={!!staff}
      onClose={onClose}
      title="Driver Payment Received & Cleaner Reconciliation"
      size="lg"
    >
      <div className="space-y-4 pt-1">
        {/* Driver Selector Dropdown */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            Select Driver / Cleaner:
          </label>
          <select
            value={activeStaffName}
            onChange={e => {
              const selectedName = e.target.value
              const amt = driverSummary[selectedName] || 0
              if (onSelectStaff) {
                onSelectStaff({ name: selectedName, currentAmount: amt })
              }
            }}
            className="w-full text-[12.5px] font-bold text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
          >
            {availableDrivers.length === 0 ? (
              <option value="">No drivers found</option>
            ) : (
              availableDrivers.map(([dName, amt]) => (
                <option key={dName} value={dName}>
                  {dName} {amt > 0 ? `· AED ${amt.toLocaleString()} collected` : '· (0 AED)'}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Selected Driver Summary Card with Real-Time Breakdown */}
        <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-200 rounded-2xl shadow-xs space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-emerald-800 font-semibold text-[12px]">Staff Record:</span>{' '}
              <strong className="text-emerald-950 font-black text-[14px]">{activeStaffName}</strong>
              <span className="text-slate-500 text-[11px] ml-2">({staffJobs.length} shift{staffJobs.length !== 1 ? 's' : ''} on {fmtDate(selectedDate)})</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-emerald-800 block">Total Accounted In-Hand:</span>
              <span className="text-[18px] font-black text-emerald-900">AED {grandTotalInHand.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-emerald-200/80 text-[11px]">
            <div className="bg-white/90 p-2 rounded-xl border border-emerald-200">
              <span className="text-slate-500 block">Shift Collections</span>
              <span className="font-extrabold text-slate-800 text-[12.5px]">AED {jobsCollectedTotal.toLocaleString()}</span>
            </div>
            <div className="bg-white/90 p-2 rounded-xl border border-amber-200">
              <span className="text-amber-700 block">Advances Rcvd</span>
              <span className="font-extrabold text-amber-800 text-[12.5px]">AED {advancesTotal.toLocaleString()}</span>
            </div>
            <div className="bg-white/90 p-2 rounded-xl border border-blue-200">
              <span className="text-blue-700 block">Pending Collected</span>
              <span className="font-extrabold text-blue-800 text-[12.5px]">AED {pendingRcvdTotal.toLocaleString()}</span>
            </div>
            <div className="bg-white/90 p-2 rounded-xl border border-rose-200">
              <span className="text-rose-700 block">Uncollected Due</span>
              <span className="font-extrabold text-rose-800 text-[12.5px]">AED {pendingDuesTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* ── Synchronized Tabs: Shifts & Jobs | Advance | Pending ── */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200 text-[12px] font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('jobs')}
            className={`flex-1 py-1.5 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'jobs'
                ? 'bg-white text-emerald-900 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Clock size={13} />
            <span>Job Shifts ({staffJobs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advance')}
            className={`flex-1 py-1.5 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'advance'
                ? 'bg-white text-amber-900 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Wallet size={13} />
            <span>Advance ({staffAdvances.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`flex-1 py-1.5 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-white text-blue-900 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileText size={13} />
            <span>Pending ({staffPendingRcvd.length + staffPendingDues.length})</span>
          </button>
        </div>

        {/* ── TAB 1: JOB SHIFTS & PAYMENTS ── */}
        {activeTab === 'jobs' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">
                Assign Job and Received Amount
              </h5>
              <span className="text-[11px] text-slate-400 font-medium">
                Linked Cleaner &amp; Job References
              </span>
            </div>

            {staffJobs.length === 0 ? (
              <p className="text-[12px] text-slate-400 py-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                No shifts or payments recorded under {activeStaffName} on this date.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                {staffJobs.map(job => (
                  <div key={job.id} className="p-3 flex items-center justify-between gap-3 text-[12px] hover:bg-slate-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 truncate">{job.address || 'No address'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatTimeOnly(job.start_time)} – {formatTimeOnly(job.end_time)} · Mode: <strong className="text-slate-600">{job.payment_mode}</strong> · Charges: AED {cleanNum(job.charges)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-200/80">
                          <Users size={10} /> Cleaner Ref: {job.staff_name}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold border border-purple-200/80 truncate max-w-[180px]">
                          <MapPin size={10} /> {job.address || 'No Address'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium border border-slate-200">
                          Ref #{job.id ? job.id.slice(0, 6) : 'Direct'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-medium">Received</span>
                        <span className="font-bold text-emerald-700">AED {cleanNum(job.received)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onEditJob(job)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                        title="Edit this job reference"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reference Link Field */}
            <div className="pt-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                <Link2 size={12} className="text-emerald-600" />
                Link Payment to Cleaner / Job Reference:
              </label>
              <select
                onChange={e => {
                  const jobId = e.target.value
                  const targetJob = todayJobs.find(j => j.id === jobId)
                  if (targetJob) onEditJob(targetJob)
                }}
                defaultValue=""
                className="w-full text-[12px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-emerald-500 font-medium cursor-pointer"
              >
                <option value="" disabled>Select shift to link or edit payment reference…</option>
                {todayJobs.map(j => (
                  <option key={j.id} value={j.id}>
                    Cleaner: {j.staff_name} · {j.address || 'No Address'} · Received: AED {cleanNum(j.received)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ── TAB 2: ADVANCES (SYNCHRONIZED WITH ADVANCE TAB) ── */}
        {activeTab === 'advance' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-[12px] font-bold text-amber-900 uppercase tracking-wider">
                  Advance Payments Synchronized
                </h5>
                <p className="text-[10.5px] text-slate-500">Recorded for {activeStaffName} on {fmtDate(selectedDate)}</p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setShowAdvanceForm(prev => !prev)}
                className="h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                <Plus size={12} />
                <span>{showAdvanceForm ? 'Cancel' : 'Add Advance'}</span>
              </Button>
            </div>

            {/* Inline Quick Add Advance Form */}
            {showAdvanceForm && (
              <form onSubmit={handleSaveAdvance} className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5 animate-in fade-in">
                <p className="text-[11px] font-bold text-amber-900">Record Advance Payment (Syncs with Daily Job Sheet)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    label="Client / Destination Name"
                    placeholder="Client name or reason"
                    value={advClient}
                    onChange={e => setAdvClient(e.target.value)}
                    required
                  />
                  <Input
                    type="number"
                    label="Advance Amount (AED)"
                    placeholder="e.g. 200"
                    value={advAmount}
                    onChange={e => setAdvAmount(e.target.value)}
                    required
                  />
                </div>
                <Input
                  label="Remarks & Notes"
                  placeholder="e.g. Advance cash handed by driver"
                  value={advNotes}
                  onChange={e => setAdvNotes(e.target.value)}
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAdvanceForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                    Save Advance
                  </Button>
                </div>
              </form>
            )}

            {staffAdvances.length === 0 ? (
              <p className="text-[12px] text-slate-400 py-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                No advance entries recorded for {activeStaffName} on this date.
              </p>
            ) : (
              <div className="divide-y divide-amber-100 border border-amber-200/90 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                {staffAdvances.map(adv => (
                  <div key={adv.id} className="p-3 flex items-center justify-between gap-3 text-[12px] bg-white hover:bg-amber-50/40 transition-colors">
                    <div>
                      <p className="font-bold text-slate-900">{adv.client}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{adv.notes || 'No remarks recorded'}</p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-black text-amber-800 text-[13px]">AED {cleanNum(adv.received).toLocaleString()}</span>
                      {onDeleteAdvance && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete advance of AED ${adv.received} for ${adv.client}?`)) {
                              onDeleteAdvance(adv.id)
                            }
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Advance"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: PENDING PAYMENTS (SYNCHRONIZED WITH PENDING TABS) ── */}
        {activeTab === 'pending' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-[12px] font-bold text-blue-900 uppercase tracking-wider">
                  Pending Collections &amp; Balances
                </h5>
                <p className="text-[10.5px] text-slate-500">Live sync with Today Pending &amp; Pending Received tabs</p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setShowPendingForm(prev => !prev)}
                className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                <Plus size={12} />
                <span>{showPendingForm ? 'Cancel' : 'Record Pending Received'}</span>
              </Button>
            </div>

            {/* Inline Quick Add Pending Received Form */}
            {showPendingForm && (
              <form onSubmit={handleSavePending} className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5 animate-in fade-in">
                <p className="text-[11px] font-bold text-blue-900">Record Pending Payment Received (Syncs with Daily Job Sheet)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-1">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Client Name *</label>
                    <input
                      type="text"
                      list="driver-pending-clients"
                      required
                      placeholder="Client Name"
                      value={pendClient}
                      onChange={e => setPendClient(e.target.value)}
                      className="w-full text-[12px] p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                    <datalist id="driver-pending-clients">
                      {staffPendingDues.map(d => <option key={d.id} value={d.client} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Cash (AED)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={pendCash}
                      onChange={e => setPendCash(e.target.value)}
                      className="w-full text-[12px] p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Online (AED)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={pendOnline}
                      onChange={e => setPendOnline(e.target.value)}
                      className="w-full text-[12px] p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 font-bold"
                    />
                  </div>
                </div>
                <Input
                  label="Remarks & Notes"
                  placeholder="e.g. Cleared at site in cash"
                  value={pendRemarks}
                  onChange={e => setPendRemarks(e.target.value)}
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowPendingForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                    Save Collection
                  </Button>
                </div>
              </form>
            )}

            {/* 1. Collected Pending Payments Today */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                Collected Today ({staffPendingRcvd.length}):
              </span>
              {staffPendingRcvd.length === 0 ? (
                <p className="text-[11.5px] text-slate-400 py-3 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  No pending payments collected today by {activeStaffName}.
                </p>
              ) : (
                <div className="divide-y divide-emerald-100 border border-emerald-200/80 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  {staffPendingRcvd.map(item => (
                    <div key={item.id} className="p-2.5 flex items-center justify-between gap-2 text-[12px] bg-white hover:bg-emerald-50/40">
                      <div>
                        <p className="font-bold text-slate-900">{item.client}</p>
                        <p className="text-[10.5px] text-slate-500">
                          Cash: AED {item.cash || 0} · Online: AED {item.online || 0} {item.remarks ? `· ${item.remarks}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-emerald-800 text-[12.5px]">
                          AED {(cleanNum(item.cash) + cleanNum(item.online)).toLocaleString()}
                        </span>
                        {onDeletePendingRcvd && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Delete collection for ${item.client}?`)) {
                                onDeletePendingRcvd(item.id)
                              }
                            }}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Pending Dues Remaining */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
                Client Pending Dues Remaining ({staffPendingDues.length}):
              </span>
              {staffPendingDues.length === 0 ? (
                <p className="text-[11.5px] text-slate-400 py-3 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  No outstanding client dues for {activeStaffName}'s shifts.
                </p>
              ) : (
                <div className="divide-y divide-rose-100 border border-rose-200/80 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  {staffPendingDues.map(due => (
                    <div key={due.id} className="p-2.5 flex items-center justify-between gap-2 text-[12px] bg-white hover:bg-rose-50/30">
                      <div>
                        <p className="font-bold text-slate-900">{due.client}</p>
                        <p className="text-[10.5px] text-slate-500">{due.address} · {due.remarks || 'Pending balance'}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-rose-700 text-[12.5px]">AED {cleanNum(due.amount).toLocaleString()}</span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setPendClient(due.client)
                            setPendCash(String(due.amount))
                            setShowPendingForm(true)
                          }}
                          className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                          title="Collect this pending due"
                        >
                          Collect
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Add Pending Modal (Matches Pending Received UX with searchable client list, pending amounts & custom entry) ── */
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
  const { clients, dailyJobs } = useData()

  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [amount, setAmount] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)

  // Reset when modal opens/closes
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setClientSearch('')
      setSelectedClient(null)
      setAmount('')
    }
  }

  // Pre-fetch clients with outstanding pending balance
  const clientsWithPending = useMemo(() => {
    return clients
      .map(c => {
        const bal = calcClientPendingBalance(c, dailyJobs)
        return { client: c, pendingBalance: bal }
      })
      .filter(x => x.pendingBalance > 0)
      .sort((a, b) => b.pendingBalance - a.pendingBalance)
  }, [clients, dailyJobs])

  const handleSelectClient = (c: Client | null) => {
    setSelectedClient(c)
    if (c) {
      const bal = calcClientPendingBalance(c, dailyJobs)
      if (bal > 0) {
        setAmount(String(bal))
      }
    }
  }

  const clientName = (selectedClient ? selectedClient.full_name : clientSearch).trim()
  const amountNum = cleanNum(amount)
  const canSave = amountNum > 0 && !!clientName

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return

    onAdd({
      id: `p-${Date.now()}`,
      date: selectedDate,
      client: clientName,
      amount: amountNum,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Pending Item"
      size="md"
      headerActions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 px-3 text-[11.5px] font-semibold">
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-pending-form"
            size="sm"
            disabled={!canSave}
            className="h-8 px-4 text-[11.5px] bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50"
          >
            Add Pending{amountNum > 0 ? ` · AED ${amountNum.toLocaleString()}` : ''}
          </Button>
        </div>
      }
    >
      <form id="add-pending-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
        {/* Quick select clients with active pending dues */}
        {clientsWithPending.length > 0 && !selectedClient && (
          <div className="space-y-1.5 p-3 bg-red-50/60 border border-red-200/80 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-red-900">Clients with Outstanding Pending:</span>
              <span className="text-[10px] text-red-600 font-semibold">{clientsWithPending.length} clients</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
              {clientsWithPending.slice(0, 10).map(({ client, pendingBalance }) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => handleSelectClient(client)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-red-200 hover:border-red-400 hover:bg-red-50 text-[11.5px] transition-all cursor-pointer shadow-2xs"
                >
                  <span className="font-semibold text-slate-800">{client.full_name}</span>
                  <span className="font-black text-red-700">AED {pendingBalance.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <ClientPicker
          selected={selectedClient}
          onSelect={handleSelectClient}
          search={clientSearch}
          onSearch={setClientSearch}
          label="Client Name *"
        />

        {/* Custom typed client not in registered list */}
        {!selectedClient && clientSearch.trim() && (
          <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl text-[11.5px] text-amber-800">
            <span className="font-bold">Custom Client:</span> &quot;{clientSearch.trim()}&quot; will be added with pending amount.
          </div>
        )}

        {/* Pending Amount */}
        <div>
          <label className="block text-[12px] font-bold text-slate-700 mb-1">
            Pending Amount (AED) *
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
            className="w-full text-[13px] font-bold text-red-800 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-red-500"
          />
        </div>
      </form>
    </Modal>
  )
}

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

/** Unique id for a new side-table record */
const newId = (prefix: string) => `${prefix}-${Date.now()}`

/* ── Pending Received Modal (client list = Clients screen, actions in the header) ── */
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
  const { dailyJobs } = useData()

  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [cash, setCash] = useState('')
  const [online, setOnline] = useState('')
  const [remarks, setRemarks] = useState('')
  const [manualPending, setManualPending] = useState<string>('')
  const [prevOpen, setPrevOpen] = useState(open)

  // Reset whenever the modal opens or closes
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setClientSearch('')
      setSelectedClient(null)
      setCash('')
      setOnline('')
      setRemarks('')
      setManualPending('')
    }
  }

  const previousPending = useMemo(
    () => (selectedClient ? calcClientPendingBalance(selectedClient, dailyJobs) : cleanNum(manualPending)),
    [selectedClient, dailyJobs, manualPending],
  )

  const totalReceived = cleanNum(cash) + cleanNum(online)
  const remainingPending = Math.max(0, previousPending - totalReceived)
  const isOverpaid = totalReceived > previousPending && previousPending > 0
  const overpaidAmount = isOverpaid ? totalReceived - previousPending : 0
  const canSave = totalReceived > 0 && !!(selectedClient || clientSearch.trim())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clientName = (selectedClient ? selectedClient.full_name : clientSearch).trim()
    if (!clientName || !canSave) return
    const cashNum = cleanNum(cash)
    const onlineNum = cleanNum(online)

    // Split the collection over the opening balance and oldest unpaid jobs.
    // client.pending_amount stays the original opening balance, so the
    // job pending is never counted twice.
    const allocation = selectedClient
      ? allocateClientCollection(selectedClient, cashNum + onlineNum, dailyJobs)
      : null

    onAdd({
      id: newId('pr'),
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
    <Modal
      open={open}
      onClose={onClose}
      title="Pending Received"
      size="md"
      headerActions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 px-3 text-[11.5px] font-semibold">
            Cancel
          </Button>
          <Button
            type="submit"
            form="pending-received-form"
            size="sm"
            disabled={!canSave}
            className="h-8 px-4 text-[11.5px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-50"
          >
            Add Record{totalReceived > 0 ? ` · AED ${totalReceived.toLocaleString()}` : ''}
          </Button>
        </div>
      }
    >
      <form id="pending-received-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
        <ClientPicker
          selected={selectedClient}
          onSelect={setSelectedClient}
          search={clientSearch}
          onSearch={setClientSearch}
          label="Client *"
        />

        {/* Typed name that is not on the Clients screen */}
        {!selectedClient && clientSearch.trim() && (
          <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1.5">
            <p className="text-[11.5px] font-bold text-amber-800">Client not on the Clients screen — saved as typed</p>
            <label className="block text-[11px] font-bold text-slate-600">Previous pending for this entry (AED, optional)</label>
            <input
              type="number" step="0.01" min="0" placeholder="e.g. 200"
              value={manualPending} onChange={e => setManualPending(e.target.value)}
              className="w-full text-[12px] font-bold bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400"
            />
          </div>
        )}

        {/* Amounts received */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-[12px] font-bold text-slate-700">Payment Received *</label>
            {previousPending > 0 && (
              <div className="flex items-center gap-1.5 text-[10.5px]">
                <span className="text-slate-400">Quick fill:</span>
                <button type="button" onClick={() => { setCash(String(previousPending)); setOnline('0') }}
                  className="font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md cursor-pointer">Full Cash</button>
                <button type="button" onClick={() => { setOnline(String(previousPending)); setCash('0') }}
                  className="font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-md cursor-pointer">Full Online</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-emerald-800 mb-1">Cash (AED)</label>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={cash} onChange={e => setCash(e.target.value)}
                className="w-full text-[13px] font-bold text-emerald-800 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-blue-800 mb-1">Online (AED)</label>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={online} onChange={e => setOnline(e.target.value)}
                className="w-full text-[13px] font-bold text-blue-800 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500" />
            </div>
          </div>
        </div>

        {/* Live balance */}
        <div className="p-3.5 bg-slate-50 border border-[#E4E8EC] rounded-2xl space-y-2">
          <div className="flex justify-between text-[12px] text-slate-600"><span>Previous pending</span><span className="font-bold text-slate-800">AED {previousPending.toLocaleString()}</span></div>
          <div className="flex justify-between text-[12px] text-slate-600"><span>Received now (cash + online)</span><span className="font-bold text-emerald-700">AED {totalReceived.toLocaleString()}</span></div>
          <div className="border-t border-[#E4E8EC] pt-2 flex justify-between items-center">
            <span className="text-[12.5px] font-bold text-slate-900">Remaining pending</span>
            <span className={`text-[16px] font-black ${remainingPending > 0 ? 'text-red-600' : 'text-emerald-700'}`}>AED {remainingPending.toLocaleString()}</span>
          </div>
          {isOverpaid && (
            <div className="bg-amber-50 border border-amber-200 p-2 rounded-xl text-[11px] text-amber-800 font-semibold text-center">
              Extra AED {overpaidAmount.toLocaleString()} — record it as an Advance for this client
            </div>
          )}
        </div>

        <div>
          <label className="block text-[12px] font-bold text-slate-700 mb-1">Notes or Remarks</label>
          <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="e.g. Paid at site in cash, bank transfer ref #…"
            className="w-full text-[12.5px] bg-slate-50 border border-[#E4E8EC] rounded-xl p-2.5 focus:outline-none focus:border-emerald-500 resize-none font-medium text-slate-700" />
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

/* ── Advance Modal — same layout as Pending Received: client from the Clients screen, amounts, notes ── */
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
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [received, setReceived] = useState('')
  const [advance, setAdvance] = useState('')
  const [notes, setNotes] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setClientSearch('')
      setSelectedClient(null)
      setReceived('')
      setAdvance('')
      setNotes('')
    }
  }

  const advanceNum = cleanNum(advance)
  const receivedNum = cleanNum(received)
  const canSave = advanceNum > 0 && !!(selectedClient || clientSearch.trim())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const client = (selectedClient ? selectedClient.full_name : clientSearch).trim()
    if (!client || !canSave) return
    onAdd({
      id: newId('adv'),
      date: selectedDate,
      client,
      client_id: selectedClient?.id,
      received: receivedNum,
      advance: advanceNum,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Advance"
      size="md"
      headerActions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 px-3 text-[11.5px] font-semibold">
            Cancel
          </Button>
          <Button
            type="submit"
            form="advance-form"
            size="sm"
            disabled={!canSave}
            className="h-8 px-4 text-[11.5px] bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-50"
          >
            Add Advance{advanceNum > 0 ? ` · AED ${advanceNum.toLocaleString()}` : ''}
          </Button>
        </div>
      }
    >
      <form id="advance-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
        <ClientPicker
          selected={selectedClient}
          onSelect={setSelectedClient}
          search={clientSearch}
          onSearch={setClientSearch}
          accent="amber"
          label="Client *"
        />

        {!selectedClient && clientSearch.trim() && (
          <p className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-xl text-[11.5px] font-bold text-amber-800">
            Client not on the Clients screen — saved as typed
          </p>
        )}

        <div className="space-y-2">
          <label className="block text-[12px] font-bold text-slate-700">Amounts *</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-emerald-800 mb-1">Received now (AED)</label>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={received} onChange={e => setReceived(e.target.value)}
                className="w-full text-[13px] font-bold text-emerald-800 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-amber-800 mb-1">Advance credit (AED) *</label>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={advance} onChange={e => setAdvance(e.target.value)}
                className="w-full text-[13px] font-bold text-amber-800 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500" />
            </div>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 border border-[#E4E8EC] rounded-2xl space-y-2">
          <div className="flex justify-between text-[12px] text-slate-600"><span>Received now</span><span className="font-bold text-emerald-700">AED {receivedNum.toLocaleString()}</span></div>
          <div className="border-t border-[#E4E8EC] pt-2 flex justify-between items-center">
            <span className="text-[12.5px] font-bold text-slate-900">Advance credit for this client</span>
            <span className="text-[16px] font-black text-amber-700">AED {advanceNum.toLocaleString()}</span>
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-bold text-slate-700 mb-1">Notes or Remarks</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Advance for next month's visits, paid by bank transfer…"
            className="w-full text-[12.5px] bg-slate-50 border border-[#E4E8EC] rounded-xl p-2.5 focus:outline-none focus:border-amber-500 resize-none font-medium text-slate-700" />
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
  onSave: (id: string, client: string, received: number, advance: number, notes?: string) => void
}) {
  const { clients } = useData()
  const pool = useMemo(() => getAssignableClients(clients), [clients])

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title="Edit Advance"
      size="md"
      headerActions={item ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 px-3 text-[11.5px] font-semibold">Cancel</Button>
          <Button type="submit" form="edit-advance-form" size="sm" className="h-8 px-4 text-[11.5px] bg-amber-600 hover:bg-amber-700 text-white font-bold">Save Changes</Button>
        </div>
      ) : undefined}
    >
      {item && (
        <form
          id="edit-advance-form"
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const client = String(fd.get('client') || '').trim()
            if (!client) return
            onSave(item.id, client, cleanNum(fd.get('received')), cleanNum(fd.get('advance')), String(fd.get('notes') || '').trim() || undefined)
            onClose()
          }}
          className="space-y-4 pt-1"
        >
          <div>
            <Input name="client" list="clients-advance-widget-edit-list" label="Client *" defaultValue={item.client} required autoFocus />
            <datalist id="clients-advance-widget-edit-list">
              {pool.map(c => (
                <option key={c.id} value={c.full_name}>{[c.building_name, c.apartment, c.area].filter(Boolean).join(', ')}</option>
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input name="received" label="Received now (AED)" type="number" step="0.01" min="0" defaultValue={item.received} />
            <Input name="advance" label="Advance credit (AED) *" type="number" step="0.01" min="0" defaultValue={item.advance} required />
          </div>
          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-1">Notes or Remarks</label>
            <textarea name="notes" rows={2} defaultValue={item.notes || ''}
              className="w-full text-[12.5px] bg-slate-50 border border-[#E4E8EC] rounded-xl p-2.5 focus:outline-none focus:border-amber-500 resize-none font-medium text-slate-700" />
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
