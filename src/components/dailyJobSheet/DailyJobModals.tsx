import React, { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AlertCircle, CheckCircle, Pencil, AlertTriangle, Trash2 } from 'lucide-react'
import type {
  DailyJob,
  DailyExpense,
  DailyPendingItem,
  DailyPendingReceivedItem,
  DailyAdvanceItem,
} from '@/types'
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
  return (
    <Modal open={open} onClose={onClose} title="Add Pending Received Item" size="sm">
      <form
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const client = String(fd.get('client') || '').trim()
          const cash = cleanNum(fd.get('cash'))
          const online = cleanNum(fd.get('online'))
          if (!client) return
          onAdd({
            id: `pr-${Date.now()}`,
            date: selectedDate,
            client,
            cash,
            online,
          })
          onClose()
        }}
        className="space-y-4 pt-2"
      >
        <Input name="client" label="Client Name / Description" placeholder="e.g. Villa 63B Street 62B..." required autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input name="cash" label="Cash Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" defaultValue="0" />
          <Input name="online" label="Online Amount (AED)" type="number" step="0.01" min="0" placeholder="0.00" defaultValue="0" />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">Add Record</Button>
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
  onSave: (id: string, client: string, cash: number, online: number) => void
}) {
  return (
    <Modal open={!!item} onClose={onClose} title="Edit Pending Received Item" size="sm">
      {item && (
        <form
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const client = String(fd.get('client') || '').trim()
            const cash = cleanNum(fd.get('cash'))
            const online = cleanNum(fd.get('online'))
            if (!client) return
            onSave(item.id, client, cash, online)
            onClose()
          }}
          className="space-y-4 pt-2"
        >
          <Input name="client" label="Client Name / Description" defaultValue={item.client} required autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Input name="cash" label="Cash Amount (AED)" type="number" step="0.01" min="0" defaultValue={item.cash} />
            <Input name="online" label="Online Amount (AED)" type="number" step="0.01" min="0" defaultValue={item.online} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">Save Changes</Button>
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
        <Input name="client" label="Client Name / Description" placeholder="e.g. 615 Zarooni 2..." required autoFocus />
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
          <Input name="client" label="Client Name / Description" defaultValue={item.client} required autoFocus />
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
export function PendingDetailsModal({
  details,
  onClose,
  onEditJob,
  onEditPending,
  onMarkCollected,
}: {
  details: {
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
  } | null
  onClose: () => void
  onEditJob: (job: DailyJob) => void
  onEditPending: (details: any) => void
  onMarkCollected: (details: any) => void
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
