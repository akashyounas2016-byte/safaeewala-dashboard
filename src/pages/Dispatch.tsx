import { useState } from 'react'
import { Clock, MapPin, TrendingUp, Users, CheckCircle, AlertCircle, Truck, Activity, Phone } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHero } from '@/components/layout/PageHero'
import { formatTime } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { Booking, BookingStatus, BookingFrequency } from '@/types'

const timeSlots = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
const serviceTypes = ['Standard Clean', 'Deep Clean', 'Move-in', 'Move-out', 'Commercial', 'Post-construction', 'Office', 'Carpet', 'Window']

/* ─── Avatar ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72' },
  { bg: '#fce4d6', text: '#c66a3a' },
  { bg: '#e4dff5', text: '#6b5bb5' },
  { bg: '#d6e7f5', text: '#3a7ab8' },
  { bg: '#fcecc8', text: '#a8842a' },
]
function Avatar({ name, idx = 0 }: { name: string; idx?: number }) {
  const parts = name.trim().split(' ')
  const init = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0"
      style={{ background: color.bg, color: color.text }}>
      {init}
    </div>
  )
}

/* ─── Status pill ─── */
const statusCfg: Record<string, { bg: string; text: string; label: string }> = {
  confirmed:   { bg: 'bg-emerald-50',  text: 'text-emerald-700', label: 'Scheduled' },
  in_progress: { bg: 'bg-emerald-500', text: 'text-white',        label: 'Live' },
  pending:     { bg: 'bg-amber-50',    text: 'text-amber-700',    label: 'Pending' },
  cancelled:   { bg: 'bg-red-50',      text: 'text-red-700',      label: 'Cancelled' },
  completed:   { bg: 'bg-slate-100',   text: 'text-slate-600',    label: 'Done' },
}
function StatusPill({ status }: { status: string }) {
  const c = statusCfg[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600', label: status }
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>{c.label}</span>
}

/* ─── Job Detail Modal ─── */
function JobDetail({ job, onUpdate, onClose }: {
  job: Booking
  onUpdate: (id: string, patch: Partial<Booking>) => void
  onClose: () => void
}) {
  const { employees } = useData()
  const [status, setStatus] = useState<BookingStatus>(job.status)
  const [notes, setNotes] = useState(job.notes || '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const nextStatus: Partial<Record<BookingStatus, BookingStatus>> = {
    pending:     'confirmed',
    confirmed:   'in_progress',
    in_progress: 'completed',
  }
  const nextLabel: Partial<Record<BookingStatus, string>> = {
    pending:     'Confirm Job',
    confirmed:   'Start Job (Mark Live)',
    in_progress: 'Complete Job',
  }

  function advance() {
    const next = nextStatus[status]
    if (!next) return
    setStatus(next)
    onUpdate(job.id, { status: next })
  }

  function cancel() {
    setStatus('cancelled')
    onUpdate(job.id, { status: 'cancelled' })
    onClose()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[18px] font-bold text-[#111827]">{job.client_name}</p>
          <p className="text-[13px] text-slate-500 mt-0.5">{job.client_phone}</p>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Service',   value: job.service_type },
          { label: 'Frequency', value: job.frequency },
          { label: 'Date',      value: job.scheduled_date },
          { label: 'Time',      value: formatTime(`${job.scheduled_date}T${job.scheduled_time}`) },
          { label: 'Duration',  value: `${job.duration_hours} hours` },
          { label: 'Amount',    value: `AED ${job.total_amount.toLocaleString()}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.08em] font-semibold">{label}</p>
            <p className="text-[13px] font-semibold text-[#111827] mt-1 capitalize">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 bg-slate-50 border border-[#E4E8EC] rounded-xl p-3">
        <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[13px] text-[#111827] font-medium">{job.service_address}</p>
      </div>

      <div>
        <p className="text-[11px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-2">Assigned Crew</p>
        {job.assigned_crew.length === 0 ? (
          <p className="text-[12px] text-slate-400 italic">No crew assigned yet</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {job.assigned_crew.map((id, i) => {
              const emp = employees.find(e => e.id === id)
              if (!emp) return null
              return (
                <div key={id} className="flex items-center gap-2 bg-slate-50 border border-[#E4E8EC] rounded-xl px-3 py-2">
                  <Avatar name={emp.full_name} idx={i} />
                  <div>
                    <p className="text-[12px] font-semibold text-[#111827]">{emp.full_name}</p>
                    <p className="text-[11px] text-slate-500 capitalize">{emp.role.replace('_', ' ')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
        <p className="text-[10px] text-sky-700 uppercase tracking-[0.08em] font-semibold mb-2 flex items-center justify-between">
          <span>Job Notes</span>
          {status === 'in_progress' && (
            <button
              onClick={() => setEditingNotes(!editingNotes)}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-sky-100 hover:bg-sky-200 transition-colors"
            >
              {editingNotes ? '✓ Done' : '✎ Edit'}
            </button>
          )}
        </p>
        {editingNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== job.notes) {
                onUpdate(job.id, { notes })
              }
              setEditingNotes(false)
            }}
            placeholder="Add progress notes, issues, or observations…"
            className="w-full text-[12px] px-3 py-2 rounded-lg border border-sky-300 bg-white focus:outline-none focus:border-sky-500"
            rows={2}
          />
        ) : (
          <p className="text-[13px] text-sky-700 mt-1">{notes || '(No notes yet)'}</p>
        )}
      </div>

      {status === 'in_progress' && (
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4">
          <p className="text-[10px] text-blue-700 uppercase tracking-[0.08em] font-semibold mb-3">📸 Job Photo (Proof of Work)</p>

          {photoPreview ? (
            <div className="space-y-3">
              <img src={photoPreview} alt="Job proof" className="w-full rounded-lg border-2 border-blue-300 max-h-48 object-cover" />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'image/*'
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0]
                      if (file) {
                        setUploadingPhoto(true)
                        const reader = new FileReader()
                        reader.onload = () => {
                          setPhotoPreview(reader.result as string)
                          setUploadingPhoto(false)
                        }
                        reader.readAsDataURL(file)
                      }
                    }
                    input.click()
                  }}
                  disabled={uploadingPhoto}
                  className="flex-1 text-[12px] font-semibold px-3 py-2 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50"
                >
                  {uploadingPhoto ? '⏳ Uploading...' : '🔄 Change'}
                </button>
                <button
                  onClick={() => {
                    setPhotoPreview(null)
                    const notesWithoutPhoto = notes.split('\n[PHOTO]')[0]
                    setNotes(notesWithoutPhoto)
                  }}
                  className="flex-1 text-[12px] font-semibold px-3 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                >
                  ✕ Remove
                </button>
              </div>
              <p className="text-[11px] text-blue-600 font-medium">✓ Photo attached to job proof</p>
            </div>
          ) : (
            <div
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0]
                  if (file) {
                    setUploadingPhoto(true)
                    const reader = new FileReader()
                    reader.onload = () => {
                      setPhotoPreview(reader.result as string)
                      setUploadingPhoto(false)
                    }
                    reader.readAsDataURL(file)
                  }
                }
                input.click()
              }}
              className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center hover:border-blue-400 hover:bg-blue-100/50 transition-colors cursor-pointer"
            >
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-[13px] text-blue-700 font-semibold">Click to upload job photo</p>
                <p className="text-[11px] text-blue-600">Proof of work completion</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-[#E4E8EC]">
        {nextStatus[status] && (
          <Button className="flex-1" onClick={advance}>{nextLabel[status]}</Button>
        )}
        {job.client_phone && (
          <a href={`tel:${job.client_phone}`}>
            <Button variant="outline" size="sm" className="flex items-center gap-1.5">
              <Phone size={13} /> Call Client
            </Button>
          </a>
        )}
        {status !== 'cancelled' && status !== 'completed' && (
          <Button variant="danger" size="sm" onClick={cancel}>Cancel Job</Button>
        )}
      </div>
    </div>
  )
}

/* ─── New Job Form ─── */
function NewJobForm({ onClose, onAdd }: { onClose: () => void; onAdd: (b: Omit<Booking, 'id' | 'created_at'>) => void }) {
  const { employees } = useData()
  const activeEmps = employees.filter(e => e.status === 'active' || e.status === 'engaged_in_project')
  const today = new Date().toISOString().split('T')[0]

  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      const crewId = f.get('crew_id') as string
      onAdd({
        client_id:       '',
        client_name:     f.get('client_name') as string,
        client_phone:    f.get('phone') as string,
        service_address: f.get('address') as string,
        service_type:    f.get('service_type') as string,
        frequency:       'once' as BookingFrequency,
        scheduled_date:  (f.get('date') as string) || today,
        scheduled_time:  (f.get('time') as string) || '09:00',
        duration_hours:  Number(f.get('duration')) || 3,
        total_amount:    Number(f.get('amount')) || 0,
        notes:           f.get('notes') as string,
        status:          'confirmed' as BookingStatus,
        assigned_crew:   crewId ? [crewId] : [],
      })
      onClose()
    }}>
      <div className="grid grid-cols-2 gap-4">
        <Input name="client_name" label="Client Name" placeholder="Full name" required />
        <Input name="phone" label="Phone" placeholder="+971 50 000 0000" />
      </div>
      <Input name="address" label="Service Address" placeholder="Street, unit, area" />
      <div className="grid grid-cols-2 gap-4">
        <Select name="service_type" label="Service Type">
          <option value="">Select service…</option>
          {serviceTypes.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select name="crew_id" label="Assign Crew Lead">
          <option value="">No crew yet</option>
          {activeEmps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input name="date" label="Date" type="date" defaultValue={today} />
        <Input name="time" label="Time" type="time" defaultValue="09:00" />
        <Input name="duration" label="Duration (hrs)" type="number" min="1" max="12" defaultValue="3" />
      </div>
      <Input name="amount" label="Amount (AED)" type="number" placeholder="0.00" />
      <Textarea name="notes" label="Notes / Instructions" placeholder="Access code, special instructions, parking info…" rows={3} />
      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Dispatch Job</Button>
      </div>
    </form>
  )
}

/* ─── Dispatch page ─── */
export function Dispatch() {
  const { bookings, employees, updateBooking, addBooking } = useData()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [showNewJob, setShowNewJob] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
  const [bulkCrew, setBulkCrew] = useState<string>('')
  const [showAllCrew, setShowAllCrew] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const todayDisplay = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const todayJobs = bookings
    .filter(b => b.scheduled_date === today)
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))

  const selectedJob = selectedJobId ? bookings.find(b => b.id === selectedJobId) ?? null : null

  const activeJobs    = todayJobs.filter(b => b.status === 'in_progress').length
  const completedJobs = todayJobs.filter(b => b.status === 'completed').length
  const pendingJobs   = todayJobs.filter(b => b.status === 'pending' || b.status === 'confirmed').length
  const totalRevenue  = todayJobs.filter(b => b.status !== 'cancelled').reduce((s, b) => s + b.total_amount, 0)
  const activeCrewIds = new Set(todayJobs.filter(b => b.status === 'in_progress').flatMap(b => b.assigned_crew))
  const avgDuration   = todayJobs.length > 0
    ? (todayJobs.reduce((s, b) => s + b.duration_hours, 0) / todayJobs.length).toFixed(1)
    : '0'

  const activeEmps = employees.filter(e => e.status === 'active' || e.status === 'engaged_in_project')

  // Crew efficiency metrics
  const crewMetrics = activeEmps.map(emp => {
    const assigned = todayJobs.filter(b => b.assigned_crew.includes(emp.id))
    const completed = assigned.filter(b => b.status === 'completed').length
    const onJob = assigned.filter(b => b.status === 'in_progress').length
    const totalHours = assigned.reduce((s, b) => s + b.duration_hours, 0)
    const utilization = totalHours > 0 ? Math.round((totalHours / 10) * 100) : 0 // Assume 10h working day
    const onTimeCount = assigned.filter(b => b.status === 'completed').length
    const onTimeRate = assigned.length > 0 ? Math.round((onTimeCount / assigned.length) * 100) : 0
    return { emp, assigned: assigned.length, completed, onJob, utilization, onTimeRate }
  })

  // Job elapsed time
  function getJobProgress(job: Booking) {
    if (job.status !== 'in_progress') return null
    const now = new Date()
    const start = new Date(`${job.scheduled_date}T${job.scheduled_time}`)
    const elapsed = Math.round((now.getTime() - start.getTime()) / 60000) // minutes
    const expectedEnd = new Date(start.getTime() + job.duration_hours * 60 * 60 * 1000)
    const remaining = Math.max(0, Math.round((expectedEnd.getTime() - now.getTime()) / 60 * 1000))
    const isLate = elapsed > job.duration_hours * 60
    return { elapsed, expectedEnd, remaining, isLate }
  }

  const areaBreakdown = todayJobs.reduce((acc, b) => {
    const parts = b.service_address.split(',')
    const area = (parts[parts.length - 1] ?? b.service_address).trim() || 'Unknown'
    acc[area] = (acc[area] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Dispatch"
        subtitle={`${todayDisplay} · ${todayJobs.length} jobs today · ${activeJobs} crews live`}
        statusChip={activeJobs > 0 ? `${activeJobs} Live` : 'No Active Jobs'}
        actionLabel="New Job"
        onAction={() => setShowNewJob(true)}
        searchPlaceholder="Search dispatch…"
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Active Jobs',   value: activeJobs,                              sub: 'Crew on site',   icon: Activity,    iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: 'Live'  },
          { label: 'Upcoming',      value: pendingJobs,                             sub: 'Queued today',   icon: Clock,       iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    delta: 'Today' },
          { label: 'Completed',     value: completedJobs,                           sub: 'Finished today', icon: CheckCircle, iconBg: 'bg-slate-100',  iconColor: 'text-slate-600',   delta: 'Done'  },
          { label: 'Revenue Today', value: `AED ${totalRevenue.toLocaleString()}`,  sub: 'Ex. cancelled',  icon: TrendingUp,  iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   delta: '+'     },
          { label: 'Crew Deployed', value: activeCrewIds.size,                      sub: 'On active jobs', icon: Users,       iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  delta: 'Now'   },
          { label: 'Avg Duration',  value: `${avgDuration}h`,                       sub: 'Per job today',  icon: Truck,       iconBg: 'bg-rose-50',    iconColor: 'text-rose-600',    delta: 'hrs'   },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon size={18} className={card.iconColor} />
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">{card.delta}</span>
            </div>
            <p className="text-2xl font-bold text-[#111827] tracking-tight">{card.value}</p>
            <p className="text-[12px] font-semibold text-[#111827] mt-1">{card.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Ops Alert ── */}
      {pendingJobs > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[22px] px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle size={16} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-amber-800">Dispatch Alert</p>
            <p className="text-[12px] text-amber-700 mt-0.5">
              {pendingJobs} job{pendingJobs > 1 ? 's' : ''} pending — confirm before start time to avoid delays
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowNewJob(true)}>Assign Now</Button>
        </div>
      )}

      {/* ── Timeline + Crew Panel ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Timeline */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-[#111827]">Today's Timeline</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSelectMode(!selectMode); setSelectedJobs(new Set()) }}
                  className={`text-[12px] font-semibold px-2 py-1 rounded-lg transition-colors ${selectMode ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {selectMode ? '✓ Select mode' : 'Multi-select'}
                </button>
                <span className="text-[12px] text-slate-500">{todayJobs.length} jobs</span>
              </div>
            </div>

            {selectMode && selectedJobs.size > 0 && (
              <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-emerald-700">{selectedJobs.size} selected</span>
                <div className="flex items-center gap-2">
                  <Select value={bulkCrew} onChange={e => setBulkCrew(e.target.value)} className="text-[12px]">
                    <option value="">Assign crew…</option>
                    {activeEmps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                  </Select>
                  <Button size="sm" onClick={() => {
                    selectedJobs.forEach(jobId => {
                      const job = bookings.find(b => b.id === jobId)
                      if (job && bulkCrew) {
                        const newCrew = Array.from(new Set([...job.assigned_crew, bulkCrew]))
                        updateBooking(jobId, { assigned_crew: newCrew })
                      }
                    })
                    setSelectedJobs(new Set())
                    setBulkCrew('')
                  }} disabled={!bulkCrew} className="text-[12px]">Assign</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedJobs(new Set())} className="text-[12px]">Clear</Button>
                </div>
              </div>
            )}

            {todayJobs.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-slate-400 text-[14px]">No jobs scheduled for today</p>
                <button onClick={() => setShowNewJob(true)} className="mt-3 text-emerald-600 font-semibold text-sm hover:underline">
                  + Add a job
                </button>
              </div>
            ) : (
              <div>
                {timeSlots.map(slot => {
                  const slotHour = slot.split(':')[0]
                  const jobs = todayJobs.filter(b => b.scheduled_time?.split(':')[0] === slotHour)
                  return (
                    <div key={slot} className={`flex gap-4 px-6 py-2.5 border-b border-[#E4E8EC] last:border-0 ${jobs.length > 0 ? 'bg-slate-50/60' : ''}`}>
                      <div className="w-14 shrink-0 text-right pt-0.5">
                        <span className="text-[11px] text-slate-400 font-mono font-medium">{slot}</span>
                      </div>
                      <div className="flex-1 border-l-2 border-[#E4E8EC] pl-4 min-h-[28px] flex flex-col gap-2">
                        {jobs.map(job => {
                          const borderColor = job.status === 'in_progress' ? '#10b981'
                            : job.status === 'completed' ? '#94a3b8'
                            : job.status === 'cancelled' ? '#f87171'
                            : '#60a5fa'
                          const bg = job.status === 'in_progress' ? 'bg-emerald-50 hover:bg-emerald-100'
                            : job.status === 'completed'  ? 'bg-slate-50 hover:bg-slate-100'
                            : job.status === 'cancelled'  ? 'bg-red-50 opacity-60'
                            : 'bg-blue-50 hover:bg-blue-100'
                          const progress = getJobProgress(job)
                          const isSelected = selectedJobs.has(job.id)
                          return (
                            <button
                              key={job.id}
                              onClick={() => {
                                if (selectMode) {
                                  const newSelected = new Set(selectedJobs)
                                  if (newSelected.has(job.id)) newSelected.delete(job.id)
                                  else newSelected.add(job.id)
                                  setSelectedJobs(newSelected)
                                } else {
                                  setSelectedJobId(job.id)
                                }
                              }}
                              className={`rounded-xl p-3.5 border-l-4 text-left w-full transition-all cursor-pointer ${bg} ${isSelected ? 'ring-2 ring-emerald-400' : ''}`}
                              style={{ borderLeftColor: borderColor }}
                            >
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="flex items-start gap-2 flex-1">
                                  {selectMode && (
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}}
                                      className="w-4 h-4 mt-1 rounded accent-emerald-500"
                                    />
                                  )}
                                  <div>
                                    <p className="text-[13px] font-bold text-[#111827]">{job.client_name}</p>
                                    <p className="text-[12px] text-slate-500 capitalize">{job.service_type} · {job.duration_hours}h</p>
                                  </div>
                                </div>
                                <StatusPill status={job.status} />
                              </div>
                              {progress && (
                                <div className="mb-2 flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${progress.isLate ? 'bg-red-500' : 'bg-emerald-500'}`}
                                      style={{ width: `${Math.min(100, (progress.elapsed / (job.duration_hours * 60)) * 100)}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] font-mono font-semibold whitespace-nowrap ${progress.isLate ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {progress.elapsed}m
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2">
                                <MapPin size={11} className="shrink-0" />
                                <span className="truncate">{job.service_address}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {job.assigned_crew.map((id, i) => {
                                    const emp = employees.find(e => e.id === id)
                                    return emp ? (
                                      <div key={id} className="flex items-center gap-1.5">
                                        <Avatar name={emp.full_name} idx={i} />
                                        <span className="text-[11px] text-slate-600 font-medium truncate">{emp.full_name.split(' ')[0]}</span>
                                      </div>
                                    ) : null
                                  })}
                                </div>
                                {job.status !== 'completed' && job.status !== 'cancelled' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      updateBooking(job.id, { status: 'completed' })
                                    }}
                                    className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                  >
                                    ✓ Done
                                  </button>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Crew Status */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Crew Status</h3>
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
            {activeEmps.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-4">No active employees — add employees first</p>
            ) : (
              <>
                <div className="space-y-3">
                  {crewMetrics.slice(0, showAllCrew ? crewMetrics.length : 3).map(({ emp, assigned, completed, onJob, utilization, onTimeRate }, idx) => {
                  const currentJob = todayJobs.find(b => b.assigned_crew.includes(emp.id) && b.status === 'in_progress')
                  const nextJob    = todayJobs.find(b => b.assigned_crew.includes(emp.id) && (b.status === 'confirmed' || b.status === 'pending'))
                  const progress   = currentJob ? getJobProgress(currentJob) : null
                  const isOnJob    = !!currentJob
                  return (
                    <button
                      key={emp.id}
                      onClick={() => currentJob ? setSelectedJobId(currentJob.id) : nextJob ? setSelectedJobId(nextJob.id) : undefined}
                      className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-[#E4E8EC] w-full text-left hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors"
                    >
                      <div className="relative">
                        <Avatar name={emp.full_name} idx={idx} />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${isOnJob ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-[12px] font-bold text-[#111827] truncate">{emp.full_name}</p>
                          <span className="text-[10px] font-semibold text-slate-500">{onTimeRate}% on-time</span>
                        </div>
                        {currentJob && progress ? (
                          <>
                            <p className={`text-[11px] font-medium truncate ${progress.isLate ? 'text-red-600' : 'text-emerald-600'}`}>
                              {progress.isLate ? '⚠️ Running late' : '✓ On job'}: {currentJob.service_type}
                            </p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all ${progress.isLate ? 'bg-red-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${Math.min(100, (progress.elapsed / (currentJob.duration_hours * 60)) * 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">{progress.elapsed}m / {Math.round(currentJob.duration_hours * 60)}m</span>
                            </div>
                          </>
                        ) : nextJob ? (
                          <p className="text-[11px] text-blue-600 font-medium truncate">
                            Next: {formatTime(`${nextJob.scheduled_date}T${nextJob.scheduled_time}`)} · {nextJob.service_type}
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-400">Available</p>
                        )}
                        <div className="mt-1 flex gap-2 text-[10px] text-slate-500">
                          <span>Jobs: {assigned}</span>
                          <span>·</span>
                          <span>{utilization}% util.</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
                </div>
                {crewMetrics.length > 3 && (
                  <button
                    onClick={() => setShowAllCrew(!showAllCrew)}
                    className="w-full mt-3 py-2 px-3 text-[12px] font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    {showAllCrew ? '↑ Show less' : `+ Show all (${crewMetrics.length})`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Revenue Today */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <h3 className="text-[15px] font-bold text-[#111827] mb-4">Revenue Today</h3>
            <p className="text-3xl font-bold text-[#111827] tracking-tight">AED {totalRevenue.toLocaleString()}</p>
            <p className="text-[12px] text-slate-500 mt-1">
              {todayJobs.filter(b => b.status !== 'cancelled').length} jobs · excluding cancelled
            </p>
            {todayJobs.filter(b => b.status !== 'cancelled').length > 0 && (
              <div className="mt-4 space-y-2 pt-4 border-t border-[#E4E8EC]">
                {todayJobs.filter(b => b.status !== 'cancelled').map(b => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedJobId(b.id)}
                    className="flex items-center justify-between text-[12px] w-full hover:bg-slate-50 rounded-lg px-1 py-0.5 transition-colors"
                  >
                    <span className="text-slate-600 truncate flex-1 text-left">{b.client_name}</span>
                    <span className="font-bold text-[#111827] ml-2 shrink-0">AED {b.total_amount.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Areas Today */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Coverage Areas</h3>
              <MapPin size={15} className="text-slate-400" />
            </div>
            {Object.keys(areaBreakdown).length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-3">No jobs today</p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(areaBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([area, count]) => (
                    <div key={area} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-[12px] text-slate-600 truncate">{area}</span>
                      </div>
                      <span className="text-[12px] font-bold text-[#111827] ml-2 shrink-0">{count} job{count > 1 ? 's' : ''}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Modals ── */}
      <Modal open={!!selectedJob} onClose={() => setSelectedJobId(null)} title="Job Details" size="md">
        {selectedJob && (
          <JobDetail job={selectedJob} onUpdate={updateBooking} onClose={() => setSelectedJobId(null)} />
        )}
      </Modal>

      <Modal open={showNewJob} onClose={() => setShowNewJob(false)} title="Dispatch New Job" size="lg">
        <NewJobForm onClose={() => setShowNewJob(false)} onAdd={addBooking} />
      </Modal>

    </div>
  )
}
