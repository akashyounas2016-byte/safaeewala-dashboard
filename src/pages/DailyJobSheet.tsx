import { useState } from 'react'
import * as XLSX from 'xlsx'
import {
  ChevronLeft, ChevronRight, Calendar, Printer, Download, Plus,
  Trash2, AlertCircle, TrendingUp, Users, Briefcase, CloudUpload,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import type { DailyJob, DailyExpense, PaymentMode, MaterialType } from '@/types'
import { authorizeGoogleDrive, getAccessToken, uploadToDrive, gdriveConfigured } from '@/lib/googleDrive'

const MATERIALS: MaterialType[] = ['No', 'Yes', 'Sofa', 'Ladder', 'Sofa Seat']
const PAYMENT_MODES: PaymentMode[] = ['Cash', 'Online', 'Pending', 'Monthly', 'Above']
const EXPENSE_CATEGORIES = ['Fuel', 'Parking', 'Toll', 'Vehicle maintenance', 'Supplies', 'Other']

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff > 0 ? Math.round(diff / 60 * 10) / 10 : 0
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

function PaymentBadge({ mode }: { mode: PaymentMode }) {
  const cfg: Record<PaymentMode, string> = {
    Cash:    'bg-emerald-50 text-emerald-700',
    Online:  'bg-blue-50 text-blue-700',
    Pending: 'bg-red-50 text-red-600',
    Monthly: 'bg-purple-50 text-purple-700',
    Above:   'bg-amber-50 text-amber-700',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg[mode]}`}>
      {mode}
    </span>
  )
}

/* ─── Add Job Form ─── */
function AddJobForm({
  employees, onSave, onClose, initial,
}: {
  employees: { full_name: string }[]
  onSave: (j: Omit<DailyJob, 'id' | 'created_at'>) => void
  onClose: () => void
  initial?: Partial<DailyJob>
}) {
  const [startTime, setStartTime] = useState(initial?.start_time ?? '')
  const [endTime, setEndTime]     = useState(initial?.end_time ?? '')
  const dutyHours = calcHours(startTime, endTime)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    onSave({
      date:         fd.get('date') as string,
      staff_name:   fd.get('staff_name') as string,
      start_time:   startTime,
      end_time:     endTime,
      duty_hours:   dutyHours,
      address:      fd.get('address') as string,
      area:         fd.get('area') as string,
      material:     (fd.get('material') as MaterialType) || 'No',
      charges:      Number(fd.get('charges')) || 0,
      received:     Number(fd.get('received')) || 0,
      payment_mode: (fd.get('payment_mode') as PaymentMode) || 'Cash',
      is_overtime:  fd.get('is_overtime') === 'on',
      remarks:      fd.get('remarks') as string,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Staff Name</label>
          <select
            name="staff_name"
            defaultValue={initial?.staff_name ?? ''}
            required
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700"
          >
            <option value="">Select staff…</option>
            {employees.map(e => <option key={e.full_name} value={e.full_name}>{e.full_name}</option>)}
          </select>
        </div>
        <Input name="date" label="Date" type="date" defaultValue={initial?.date ?? new Date().toISOString().split('T')[0]} required />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">End Time</label>
          <input
            type="time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Duty Hours</label>
          <div className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-100 text-slate-700 font-bold">
            {dutyHours > 0 ? `${dutyHours}h` : '—'}
          </div>
        </div>
      </div>

      <Input name="address" label="Address" defaultValue={initial?.address ?? ''} placeholder="Client address" />

      <div className="grid grid-cols-2 gap-4">
        <Input name="area" label="Area / Location" defaultValue={initial?.area ?? ''} placeholder="e.g. Mirdif, Al Barsha…" />
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Material</label>
          <select name="material" defaultValue={initial?.material ?? 'No'} className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700">
            {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input name="charges" label="Charges (AED)" type="number" min="0" step="0.01" defaultValue={initial?.charges ?? ''} placeholder="0.00" />
        <Input name="received" label="Received (AED)" type="number" min="0" step="0.01" defaultValue={initial?.received ?? ''} placeholder="0.00" />
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Payment Mode</label>
          <select name="payment_mode" defaultValue={initial?.payment_mode ?? 'Cash'} className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700">
            {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input type="checkbox" id="is_overtime" name="is_overtime" defaultChecked={initial?.is_overtime} className="w-4 h-4 rounded accent-emerald-500" />
        <label htmlFor="is_overtime" className="text-[13px] font-medium text-slate-700 cursor-pointer">Overtime (OT)</label>
      </div>

      <Input name="remarks" label="Remarks" defaultValue={initial?.remarks ?? ''} placeholder="e.g. Deep clean, Sofa machine, Online…" />

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Save Job</Button>
      </div>
    </form>
  )
}

/* ─── Main Page ─── */
export function DailyJobSheet() {
  const { dailyJobs, dailyExpenses, employees, addDailyJob, updateDailyJob, deleteDailyJob, addDailyExpense, deleteDailyExpense } = useData()

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [showAddJob, setShowAddJob]         = useState(false)
  const [editJob, setEditJob]               = useState<DailyJob | null>(null)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [driveStatus, setDriveStatus]       = useState<'idle' | 'connecting' | 'uploading' | 'done' | 'error'>('idle')
  const [driveLink, setDriveLink]           = useState('')
  const [driveError, setDriveError]         = useState('')

  const todayJobs     = dailyJobs.filter(j => j.date === selectedDate).sort((a, b) => a.start_time.localeCompare(b.start_time))
  const todayExpenses = dailyExpenses.filter(e => e.date === selectedDate)

  // ── Auto-calculations ──
  const grossCollected = todayJobs.filter(j => j.payment_mode !== 'Monthly').reduce((s, j) => s + j.received, 0)
  const pendingTotal   = todayJobs.filter(j => j.payment_mode === 'Pending').reduce((s, j) => s + j.charges, 0)
  const onlineTotal    = todayJobs.filter(j => j.payment_mode === 'Online').reduce((s, j) => s + j.received, 0)
  const totalExpenses  = todayExpenses.reduce((s, e) => s + e.amount, 0)
  const netTotal       = grossCollected - totalExpenses
  const staffOnDuty    = new Set(todayJobs.map(j => j.staff_name)).size
  const jobsCount      = todayJobs.length

  // Driver summary — collected per staff (excluding Monthly + Pending)
  const driverSummary = todayJobs.reduce((acc, job) => {
    if (job.payment_mode !== 'Monthly' && job.payment_mode !== 'Pending') {
      acc[job.staff_name] = (acc[job.staff_name] || 0) + job.received
    }
    return acc
  }, {} as Record<string, number>)

  // ── Date navigation ──
  function prevDay() {
    const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() - 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }
  function nextDay() {
    const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() + 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  // ── Excel export ──
  function buildWorkbook() {
    const wb = XLSX.utils.book_new()
    const jobRows = todayJobs.map(j => ({
      Date: j.date, Staff: j.staff_name,
      'Start': j.start_time, 'End': j.end_time, 'Hrs': j.duty_hours,
      Address: j.address, Area: j.area, Material: j.material,
      'Charges AED': j.charges, 'Received AED': j.received,
      'Payment Mode': j.payment_mode, OT: j.is_overtime ? 'Yes' : 'No',
      Remarks: j.remarks,
    }))
    const expRows = todayExpenses.map(e => ({
      Date: e.date, Name: e.name, Category: e.category, 'Amount AED': e.amount,
    }))
    const summary = [{
      Date: selectedDate,
      'Gross Collected': grossCollected,
      'Pending': pendingTotal,
      'Online': onlineTotal,
      'Total Expenses': totalExpenses,
      'Net Total': netTotal,
      'Staff on Duty': staffOnDuty,
      'Jobs Count': jobsCount,
    }]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary),  'Summary')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobRows),  'Jobs')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows),  'Expenses')
    return wb
  }

  function exportExcel() {
    const wb = buildWorkbook()
    XLSX.writeFile(wb, `DailyJobSheet-${selectedDate}.xlsx`)
  }

  // ── Print ──
  function printSheet() {
    const jobRows = todayJobs.map(j => `
      <tr>
        <td>${j.staff_name}</td><td>${j.start_time}</td><td>${j.end_time}</td>
        <td style="text-align:center">${j.duty_hours}h</td>
        <td>${j.address}</td><td>${j.area}</td><td>${j.material}</td>
        <td style="text-align:right">${j.charges}</td>
        <td style="text-align:right">${j.received}</td>
        <td>${j.payment_mode}</td>
        <td style="text-align:center">${j.is_overtime ? '✓' : ''}</td>
        <td>${j.remarks}</td>
      </tr>`).join('')

    const expRows = todayExpenses.map(e => `
      <tr><td>${e.name}</td><td>${e.category}</td><td style="text-align:right">AED ${e.amount}</td></tr>`).join('')

    const driverRows = Object.entries(driverSummary).map(([name, amt]) =>
      `<tr><td>${name}</td><td style="text-align:right">AED ${amt}</td></tr>`).join('')

    const win = window.open('', '_blank', 'width=1100,height=800')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Daily Job Sheet — ${selectedDate}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:32px;font-size:11px;color:#111}
        h1{font-size:18px;margin-bottom:4px}
        .sub{color:#666;font-size:11px;margin-bottom:20px}
        .kpis{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
        .kpi{background:#f3f4f6;padding:10px 16px;border-radius:8px;min-width:100px}
        .kpi-val{font-size:16px;font-weight:700;color:#111}
        .kpi-lbl{font-size:10px;color:#666;margin-top:2px}
        table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px}
        th{background:#111827;color:white;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
        td{padding:5px 8px;border-bottom:1px solid #e5e7eb}
        tr:nth-child(even)td{background:#f9fafb}
        .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}
        h3{font-size:13px;font-weight:700;margin-bottom:8px}
        @media print{body{padding:16px}}
      </style>
    </head><body>
      <h1>Daily Job Sheet</h1>
      <p class="sub">Safaeewala Cleaning & Maintenance LLC &nbsp;·&nbsp; ${fmtDate(selectedDate)}</p>
      <div class="kpis">
        <div class="kpi"><div class="kpi-val">AED ${grossCollected.toLocaleString()}</div><div class="kpi-lbl">Gross Collected</div></div>
        <div class="kpi"><div class="kpi-val">AED ${pendingTotal.toLocaleString()}</div><div class="kpi-lbl">Pending</div></div>
        <div class="kpi"><div class="kpi-val">AED ${netTotal.toLocaleString()}</div><div class="kpi-lbl">Net Total</div></div>
        <div class="kpi"><div class="kpi-val">AED ${onlineTotal.toLocaleString()}</div><div class="kpi-lbl">Online</div></div>
        <div class="kpi"><div class="kpi-val">AED ${totalExpenses.toLocaleString()}</div><div class="kpi-lbl">Expenses</div></div>
        <div class="kpi"><div class="kpi-val">${staffOnDuty}</div><div class="kpi-lbl">Staff on Duty</div></div>
        <div class="kpi"><div class="kpi-val">${jobsCount}</div><div class="kpi-lbl">Jobs</div></div>
      </div>
      <table>
        <thead><tr><th>Staff</th><th>Start</th><th>End</th><th>Hrs</th><th>Address</th><th>Area</th><th>Material</th><th>Charges</th><th>Received</th><th>Mode</th><th>OT</th><th>Remarks</th></tr></thead>
        <tbody>${jobRows || '<tr><td colspan="12" style="text-align:center;color:#999">No jobs</td></tr>'}</tbody>
        <tfoot><tr style="font-weight:700;background:#f3f4f6">
          <td colspan="7">Totals</td>
          <td>AED ${todayJobs.reduce((s,j)=>s+j.charges,0).toLocaleString()}</td>
          <td>AED ${grossCollected.toLocaleString()}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>
      <div class="two-col">
        <div>
          <h3>Expenses</h3>
          <table>
            <thead><tr><th>Name</th><th>Category</th><th>Amount</th></tr></thead>
            <tbody>${expRows || '<tr><td colspan="3" style="text-align:center;color:#999">No expenses</td></tr>'}</tbody>
            <tfoot><tr style="font-weight:700"><td colspan="2">Total</td><td style="text-align:right">AED ${totalExpenses.toLocaleString()}</td></tr></tfoot>
          </table>
        </div>
        <div>
          <h3>Driver Summary</h3>
          <table>
            <thead><tr><th>Staff</th><th>Collected</th></tr></thead>
            <tbody>${driverRows || '<tr><td colspan="2" style="text-align:center;color:#999">No data</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`)
    win.document.close()
  }

  // ── Google Drive backup ──
  async function backupToDrive() {
    try {
      setDriveStatus('connecting')
      setDriveError('')
      let token = getAccessToken()
      if (!token) token = await authorizeGoogleDrive()
      setDriveStatus('uploading')
      const wb = buildWorkbook()
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const link = await uploadToDrive(blob, `DailyJobSheet-${selectedDate}.xlsx`, token)
      setDriveLink(link)
      setDriveStatus('done')
    } catch (err: any) {
      setDriveError(err.message || 'Upload failed')
      setDriveStatus('error')
    }
  }

  const activeEmps = employees.filter(e => e.status === 'active' || e.status === 'engaged_in_project')

  return (
    <div className="space-y-6 pb-10">

      {/* ── Top bar ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-[20px] font-black text-[#111827] tracking-tight">Daily Job Sheet</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">Admin view · All data saved to Supabase</p>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-2">
            <button onClick={prevDay} className="p-2 rounded-xl border border-[#E4E8EC] hover:bg-slate-50 transition-colors">
              <ChevronLeft size={16} className="text-slate-600" />
            </button>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-[13px] font-semibold text-[#111827] px-4 py-2 border border-[#E4E8EC] rounded-xl bg-slate-50 focus:outline-none focus:border-emerald-400 cursor-pointer"
              />
            </div>
            <button onClick={nextDay} className="p-2 rounded-xl border border-[#E4E8EC] hover:bg-slate-50 transition-colors">
              <ChevronRight size={16} className="text-slate-600" />
            </button>
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 text-[12px] font-semibold hover:bg-emerald-100 transition-colors"
            >
              Today
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E4E8EC] text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <Download size={13} /> Excel
            </button>
            <button onClick={printSheet} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E4E8EC] text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <Printer size={13} /> Print
            </button>
            {gdriveConfigured ? (
              <button
                onClick={backupToDrive}
                disabled={driveStatus === 'connecting' || driveStatus === 'uploading'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-300 bg-blue-50 text-blue-700 text-[12px] font-semibold hover:bg-blue-100 transition-colors disabled:opacity-60"
              >
                <CloudUpload size={13} />
                {driveStatus === 'connecting' ? 'Connecting…' : driveStatus === 'uploading' ? 'Uploading…' : 'Google Drive'}
              </button>
            ) : null}
            <Button size="sm" onClick={() => setShowAddJob(true)}>
              <Plus size={13} className="mr-1" /> Add Job
            </Button>
          </div>
        </div>

        {/* Drive feedback */}
        {driveStatus === 'done' && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <p className="text-[12px] text-emerald-700 font-semibold">Uploaded to Google Drive</p>
            <a href={driveLink} target="_blank" rel="noopener noreferrer" className="text-[12px] text-emerald-600 underline font-medium">Open file</a>
          </div>
        )}
        {driveStatus === 'error' && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <p className="text-[12px] text-red-700">{driveError}</p>
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { label: 'Gross Collected', value: `AED ${grossCollected.toLocaleString()}`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending',         value: `AED ${pendingTotal.toLocaleString()}`,   color: 'text-red-600',     bg: 'bg-red-50'     },
          { label: 'Net Total',       value: `AED ${netTotal.toLocaleString()}`,        color: netTotal >= 0 ? 'text-[#111827]' : 'text-red-600', bg: 'bg-slate-50' },
          { label: 'Online',          value: `AED ${onlineTotal.toLocaleString()}`,    color: 'text-blue-600',    bg: 'bg-blue-50'    },
          { label: 'Expenses',        value: `AED ${totalExpenses.toLocaleString()}`,  color: 'text-amber-700',   bg: 'bg-amber-50'   },
          { label: 'Staff on Duty',   value: String(staffOnDuty),                      color: 'text-purple-600',  bg: 'bg-purple-50', icon: Users   },
          { label: 'Jobs Today',      value: String(jobsCount),                        color: 'text-slate-700',   bg: 'bg-slate-100', icon: Briefcase },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-[18px] border border-[#E4E8EC] p-4 text-center`}>
            <p className={`text-[18px] font-black ${c.color}`}>{c.value}</p>
            <p className="text-[10.5px] text-slate-500 font-semibold mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* ── Jobs Table ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#111827]">
            Jobs — <span className="text-slate-400 font-normal">{fmtDate(selectedDate)}</span>
          </h3>
          <span className="text-[12px] text-slate-400">{jobsCount} {jobsCount === 1 ? 'job' : 'jobs'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ minWidth: 1000 }}>
            <thead>
              <tr className="bg-slate-50 border-b border-[#E4E8EC]">
                {['Staff', 'Start', 'End', 'Hrs', 'Address', 'Area', 'Material', 'Charges', 'Received', 'Mode', 'OT', 'Remarks', ''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-[0.07em] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E8EC]">
              {todayJobs.map(job => (
                <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3 font-semibold text-[#111827] whitespace-nowrap">{job.staff_name}</td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{job.start_time || '—'}</td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{job.end_time || '—'}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">
                    {job.duty_hours > 0 ? `${job.duty_hours}h` : '—'}
                  </td>
                  <td className="px-3 py-3 text-slate-600 max-w-[160px] truncate">{job.address || '—'}</td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{job.area || '—'}</td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{job.material}</td>
                  <td className="px-3 py-3 font-semibold text-[#111827] whitespace-nowrap">
                    {job.payment_mode === 'Monthly' ? <span className="text-purple-600">Monthly</span> : `AED ${job.charges.toLocaleString()}`}
                  </td>
                  <td className="px-3 py-3 font-semibold text-emerald-700 whitespace-nowrap">
                    {job.payment_mode === 'Pending' || job.payment_mode === 'Monthly' ? '—' : `AED ${job.received.toLocaleString()}`}
                  </td>
                  <td className="px-3 py-3"><PaymentBadge mode={job.payment_mode} /></td>
                  <td className="px-3 py-3 text-center">
                    {job.is_overtime && <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">OT</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-500 max-w-[140px] truncate">{job.remarks || '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditJob(job)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Edit">
                        <Calendar size={13} />
                      </button>
                      <button onClick={() => deleteDailyJob(job.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {todayJobs.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-[#E4E8EC] font-bold text-[12px]">
                  <td colSpan={7} className="px-3 py-3 text-slate-600">Totals</td>
                  <td className="px-3 py-3 text-[#111827]">AED {todayJobs.reduce((s, j) => s + j.charges, 0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-emerald-700">AED {grossCollected.toLocaleString()}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>

          {todayJobs.length === 0 && (
            <div className="py-16 text-center">
              <Briefcase className="mx-auto mb-3 text-slate-300" size={36} strokeWidth={1.25} />
              <p className="text-[13px] text-slate-500 mb-3">No jobs recorded for {fmtDate(selectedDate)}</p>
              <Button size="sm" onClick={() => setShowAddJob(true)}>
                <Plus size={13} className="mr-1" /> Add First Job
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom panels ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Expenses Log */}
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-[#111827]">Expenses Log</h3>
            <button onClick={() => setShowAddExpense(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
              <Plus size={13} /> Add Expense
            </button>
          </div>
          <div className="divide-y divide-[#E4E8EC]">
            {todayExpenses.map(exp => (
              <div key={exp.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#111827]">{exp.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{exp.category}</p>
                </div>
                <span className="text-[13px] font-bold text-amber-700 shrink-0">AED {exp.amount.toLocaleString()}</span>
                <button onClick={() => deleteDailyExpense(exp.id)} className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {todayExpenses.length === 0 && (
              <p className="text-[12px] text-slate-400 text-center py-8">No expenses for this day</p>
            )}
          </div>
          {todayExpenses.length > 0 && (
            <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-amber-800">Total Expenses</span>
              <span className="text-[14px] font-black text-amber-700">AED {totalExpenses.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Driver Summary */}
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-[#111827]">Driver / Staff Summary</h3>
            <span className="text-[11px] text-slate-400">Cash + Online collected</span>
          </div>
          <div className="divide-y divide-[#E4E8EC]">
            {Object.entries(driverSummary).length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-8">No collections yet</p>
            ) : Object.entries(driverSummary)
              .sort((a, b) => b[1] - a[1])
              .map(([name, amount]) => {
                const max = Math.max(...Object.values(driverSummary))
                const pct = Math.round((amount / max) * 100)
                return (
                  <div key={name} className="px-5 py-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[13px] font-semibold text-[#111827]">{name}</p>
                      <span className="text-[13px] font-bold text-emerald-700">AED {amount.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
          </div>
          {Object.keys(driverSummary).length > 0 && (
            <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-emerald-800">Total Collected</span>
              <span className="text-[14px] font-black text-emerald-700">AED {grossCollected.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Supabase setup notice (shown when no data ever) ── */}
      {dailyJobs.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[22px] p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-amber-800 mb-2">One-time Supabase setup required</p>
              <p className="text-[12px] text-amber-700 mb-3">Run this SQL in your Supabase project (Dashboard → SQL Editor):</p>
              <pre className="bg-slate-900 text-emerald-400 text-[11px] p-4 rounded-xl overflow-x-auto leading-relaxed">{`CREATE TABLE daily_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL,
  staff_name TEXT NOT NULL DEFAULT '',
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  duty_hours NUMERIC DEFAULT 0,
  address TEXT DEFAULT '',
  area TEXT DEFAULT '',
  material TEXT DEFAULT 'No',
  charges NUMERIC DEFAULT 0,
  received NUMERIC DEFAULT 0,
  payment_mode TEXT DEFAULT 'Cash',
  is_overtime BOOLEAN DEFAULT FALSE,
  remarks TEXT DEFAULT ''
);

CREATE TABLE daily_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT '',
  amount NUMERIC DEFAULT 0
);`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Job Modal ── */}
      <Modal open={showAddJob} onClose={() => setShowAddJob(false)} title="Add Job Entry" size="lg">
        <AddJobForm
          employees={activeEmps}
          onClose={() => setShowAddJob(false)}
          onSave={j => { addDailyJob({ ...j, date: selectedDate }); setShowAddJob(false) }}
          initial={{ date: selectedDate }}
        />
      </Modal>

      {/* ── Edit Job Modal ── */}
      <Modal open={!!editJob} onClose={() => setEditJob(null)} title="Edit Job Entry" size="lg">
        {editJob && (
          <AddJobForm
            employees={activeEmps}
            onClose={() => setEditJob(null)}
            onSave={j => { updateDailyJob(editJob.id, j); setEditJob(null) }}
            initial={editJob}
          />
        )}
      </Modal>

      {/* ── Add Expense Modal ── */}
      <Modal open={showAddExpense} onClose={() => setShowAddExpense(false)} title="Add Expense" size="sm">
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget as HTMLFormElement)
          addDailyExpense({
            date:     selectedDate,
            name:     fd.get('name') as string,
            category: fd.get('category') as string,
            amount:   Number(fd.get('amount')) || 0,
          })
          setShowAddExpense(false)
        }}>
          <Input name="name" label="Driver / Person Name" placeholder="e.g. Ahmed, Raju…" required />
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Category</label>
            <select name="category" className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700">
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Input name="amount" label="Amount (AED)" type="number" min="0" step="0.01" placeholder="0.00" required />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddExpense(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Add Expense</Button>
          </div>
        </form>
      </Modal>

    </div>
  )
}
