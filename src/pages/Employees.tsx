import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, AlertTriangle, Phone, Shield, Users, UserCheck, Star, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatDate, daysUntil } from '@/lib/utils'
import { useData } from '@/store/DataContext'

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

/* ─── Document expiry indicator (used in detail modal) ─── */
function ExpiryIndicator({ date, label }: { date: string; label: string }) {
  const days = daysUntil(date)
  let bg = 'bg-emerald-50'; let text = 'text-emerald-700'
  if (days < 0)  { bg = 'bg-red-50';    text = 'text-red-700' }
  else if (days < 30)  { bg = 'bg-red-50';    text = 'text-red-700' }
  else if (days < 90)  { bg = 'bg-amber-50';  text = 'text-amber-700' }
  return (
    <div className={`rounded-xl p-3 text-center border border-[#E4E8EC] ${bg}`}>
      <p className={`text-[11px] font-semibold ${text}`}>{label}</p>
      <p className={`text-[11px] mt-0.5 ${text}`}>{formatDate(date)}</p>
      {days < 90 && <p className={`text-[11px] font-bold mt-0.5 ${text}`}>{days < 0 ? 'EXPIRED' : `${days}d left`}</p>}
    </div>
  )
}

/* ─── Status badge ─── */
const statusStyles: Record<string, { bg: string; label: string }> = {
  active:              { bg: 'bg-emerald-50 text-emerald-700', label: 'Active' },
  inactive:            { bg: 'bg-slate-100 text-slate-500',    label: 'Inactive' },
  on_leave:            { bg: 'bg-amber-50 text-amber-700',     label: 'On Leave' },
  engaged_in_project:  { bg: 'bg-blue-50 text-blue-700',       label: 'Engaged' },
}
function StatusBadge({ status }: { status: string }) {
  const s = statusStyles[status] ?? { bg: 'bg-slate-100 text-slate-500', label: status }
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${s.bg}`}>
      {s.label}
    </span>
  )
}

export function Employees() {
  const { employees, addEmployee, updateEmployee } = useData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<typeof employees[0] | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const expiringCount = employees.filter(e => {
    const soonest = Math.min(daysUntil(e.visa_expiry), daysUntil(e.work_permit_expiry), daysUntil(e.passport_expiry))
    return soonest < 90
  }).length

  const activeCount = employees.filter(e => e.status === 'active').length
  const crewLeads = employees.filter(e => e.role === 'crew_lead').length

  const filtered = employees.filter(e => {
    const matchSearch = e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.nationality.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || e.role === roleFilter
    return matchSearch && matchRole
  })

  /* Aggregate all skills across all employees */
  const skillCounts = employees.reduce((acc, e) => {
    e.skills.forEach(s => { acc[s] = (acc[s] || 0) + 1 })
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Employees"
        subtitle={`${employees.length} staff · ${activeCount} active · ${expiringCount} documents expiring soon`}
        statusChip={expiringCount > 0 ? `${expiringCount} Alerts` : 'All Clear'}
        actionLabel="Add Employee"
        onAction={() => setShowModal(true)}
        searchPlaceholder="Search employees…"
      />

      {/* ── Compliance Alert Banner ── */}
      {expiringCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-[22px] px-5 py-4">
          <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-amber-600" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-amber-800">Document Compliance Alert</p>
            <p className="text-[12px] text-amber-700 mt-0.5">
              {expiringCount} employee{expiringCount > 1 ? 's have' : ' has'} visas or permits expiring within 90 days — immediate review required
            </p>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Staff',     value: employees.length,  sub: 'All roles',        icon: Users,      iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    delta: '+2',   deltaUp: true  },
          { label: 'Active',          value: activeCount,           sub: 'Currently working', icon: UserCheck,  iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: '+1',   deltaUp: true  },
          { label: 'Crew Leads',      value: crewLeads,             sub: 'Senior staff',     icon: Star,       iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  delta: '0',    deltaUp: true  },
          { label: 'Docs Expiring',   value: expiringCount,         sub: 'Within 90 days',   icon: Shield,     iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   delta: expiringCount > 0 ? `${expiringCount} !` : 'OK', deltaUp: expiringCount === 0 },
          { label: 'Avg Rating',      value: '4.8',                 sub: 'Client feedback',  icon: Star,       iconBg: 'bg-rose-50',    iconColor: 'text-rose-600',    delta: '+0.2', deltaUp: true  },
          { label: 'Utilization',     value: '87%',                 sub: 'This week',        icon: TrendingUp, iconBg: 'bg-teal-50',    iconColor: 'text-teal-600',    delta: '+4%',  deltaUp: true  },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon size={18} className={card.iconColor} />
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${card.deltaUp ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>
                {card.delta}
              </span>
            </div>
            <p className="text-2xl font-bold text-[#111827] tracking-tight">{card.value}</p>
            <p className="text-[12px] font-semibold text-[#111827] mt-1">{card.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main content + sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Filters + Employee Cards ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or nationality…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 focus:bg-white placeholder-slate-400 transition-colors"
                />
              </div>
              <div className="flex gap-2">
                {['all', 'crew_lead', 'cleaner'].map(r => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-2 rounded-xl text-[12px] font-semibold transition-colors ${
                      roleFilter === r ? 'bg-[#111827] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {r === 'all' ? 'All' : r === 'crew_lead' ? 'Crew Leads' : 'Cleaners'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Employee cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((emp, idx) => {
              const minDays = Math.min(daysUntil(emp.visa_expiry), daysUntil(emp.work_permit_expiry), daysUntil(emp.passport_expiry))
              const hasAlert = minDays < 90
              return (
                <div
                  key={emp.id}
                  onClick={() => setSelected(emp)}
                  className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 cursor-pointer hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] hover:border-emerald-200 transition-all"
                >
                  <div className="flex items-start gap-3 mb-4">
                    <Avatar name={emp.full_name} size="md" idx={idx} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-bold text-[#111827] truncate">{emp.full_name}</p>
                        {hasAlert && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                      </div>
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        {emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'} · {emp.nationality}
                      </p>
                    </div>
                    <StatusBadge status={emp.status} />
                  </div>

                  <div className="space-y-1.5 text-[12px] text-slate-500 mb-4">
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-slate-400 shrink-0" />
                      <span>{emp.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield size={12} className="text-slate-400 shrink-0" />
                      <span>Visa: {formatDate(emp.visa_expiry)}</span>
                      {daysUntil(emp.visa_expiry) < 90 && (
                        <span className="text-red-600 font-semibold">({daysUntil(emp.visa_expiry)}d)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {emp.skills.slice(0, 3).map(s => (
                      <span key={s} className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{s}</span>
                    ))}
                    {emp.skills.length > 3 && <span className="text-[11px] text-slate-400">+{emp.skills.length - 3}</span>}
                  </div>

                  <div className="flex items-center justify-between pt-3.5 border-t border-[#E4E8EC]">
                    <span className="text-[12px] text-slate-500">Since {formatDate(emp.joined_date)}</span>
                    <span className="text-[14px] font-bold text-[#111827]">AED {emp.pay_rate_hourly}/hr</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right sidebar widgets ── */}
        <div className="space-y-5">

          {/* Live Crew Status */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Live Crew Status</h3>
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
            <div className="space-y-3">
              {employees.slice(0, 5).map((emp, idx) => {
                const statuses = ['On Job', 'Available', 'On Job', 'Break', 'On Job']
                const status = statuses[idx % statuses.length]
                const statusStyle = status === 'On Job'
                  ? 'bg-emerald-50 text-emerald-700'
                  : status === 'Available'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-amber-50 text-amber-700'
                return (
                  <div key={emp.id} className="flex items-center gap-3">
                    <Avatar name={emp.full_name} size="sm" idx={idx} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#111827] truncate">{emp.full_name}</p>
                      <p className="text-[11px] text-slate-500">{emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusStyle}`}>
                      {status}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Compliance Alerts */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Compliance Alerts</h3>
              {expiringCount > 0 && (
                <span className="bg-amber-50 text-amber-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {expiringCount}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {employees
                .filter(e => {
                  const days = Math.min(daysUntil(e.visa_expiry), daysUntil(e.work_permit_expiry))
                  return days < 90
                })
                .slice(0, 4)
                .map((emp, idx) => {
                  const visaDays = daysUntil(emp.visa_expiry)
                  const permitDays = daysUntil(emp.work_permit_expiry)
                  const minDays = Math.min(visaDays, permitDays)
                  const doc = visaDays <= permitDays ? 'Visa' : 'Work Permit'
                  const urgent = minDays < 30
                  return (
                    <div key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl border ${urgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <Avatar name={emp.full_name} size="sm" idx={idx} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-[#111827] truncate">{emp.full_name}</p>
                        <p className={`text-[11px] font-medium mt-0.5 ${urgent ? 'text-red-700' : 'text-amber-700'}`}>
                          {doc}: {minDays < 0 ? 'EXPIRED' : `${minDays}d remaining`}
                        </p>
                      </div>
                      <AlertTriangle size={14} className={urgent ? 'text-red-500' : 'text-amber-500'} />
                    </div>
                  )
                })}
              {employees.filter(e => Math.min(daysUntil(e.visa_expiry), daysUntil(e.work_permit_expiry)) < 90).length === 0 && (
                <div className="text-center py-4">
                  <p className="text-[13px] text-slate-500">All documents are up to date</p>
                </div>
              )}
            </div>
          </div>

          {/* Skills Coverage */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Skills Coverage</h3>
              <span className="text-[11px] text-slate-400">Team capabilities</span>
            </div>
            <div className="space-y-2.5">
              {Object.entries(skillCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 7)
                .map(([skill, count]) => {
                  const pct = Math.round((count / employees.length) * 100)
                  return (
                    <div key={skill}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium text-slate-700 truncate">{skill}</span>
                        <span className="text-[11px] font-bold text-slate-500 ml-2">{count}/{employees.length}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

        </div>
      </div>

      {/* ── Add Employee Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New Employee" size="lg">
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          addEmployee({
            full_name: fd.get('full_name') as string,
            phone: fd.get('phone') as string,
            role: fd.get('role') as 'cleaner' | 'crew_lead',
            nationality: fd.get('nationality') as string,
            emirates_id: fd.get('emirates_id') as string,
            pay_rate_hourly: Number(fd.get('pay_rate_hourly')),
            visa_expiry: fd.get('visa_expiry') as string,
            work_permit_expiry: fd.get('work_permit_expiry') as string,
            passport_expiry: fd.get('passport_expiry') as string,
            medical_insurance_expiry: fd.get('medical_insurance_expiry') as string,
            joined_date: fd.get('joined_date') as string,
            status: 'active',
            skills: [],
          })
          setShowModal(false)
        }}>
          <div className="grid grid-cols-2 gap-4">
            <Input name="full_name" label="Full Name" placeholder="Full name" required />
            <Input name="phone" label="Phone" placeholder="+971 50 000 0000" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select name="role" label="Role">
              <option value="cleaner">Cleaner</option>
              <option value="crew_lead">Crew Lead</option>
            </Select>
            <Input name="nationality" label="Nationality" placeholder="e.g. Filipino, Indian..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="emirates_id" label="Emirates ID" placeholder="784-XXXX-XXXXXXX-X" />
            <Input name="pay_rate_hourly" label="Pay Rate (AED/hr)" type="number" placeholder="14" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="visa_expiry" label="Visa Expiry" type="date" />
            <Input name="work_permit_expiry" label="Work Permit Expiry" type="date" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="passport_expiry" label="Passport Expiry" type="date" />
            <Input name="medical_insurance_expiry" label="Medical Insurance Expiry" type="date" />
          </div>
          <Input name="joined_date" label="Joined Date" type="date" />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Save Employee</Button>
          </div>
        </form>
      </Modal>

      {/* ── Employee Detail / Edit Modal ── */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setIsEditing(false) }}
        title={isEditing ? 'Edit Employee' : 'Employee Profile'}
        size="lg"
      >
        {selected && !isEditing && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={selected.full_name} size="lg" idx={0} />
              <div>
                <p className="text-[18px] font-bold text-[#111827]">{selected.full_name}</p>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  {selected.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'} · {selected.nationality}
                </p>
                <StatusBadge status={selected.status} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Phone',       value: selected.phone },
                { label: 'Emirates ID', value: selected.emirates_id },
                { label: 'Pay Rate',    value: `AED ${selected.pay_rate_hourly}/hr` },
                { label: 'Joined',      value: formatDate(selected.joined_date) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
                  <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-1">{label}</p>
                  <p className="text-[13px] font-semibold text-[#111827]">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.1em] mb-2">Document Expiry Tracker</p>
              <div className="grid grid-cols-2 gap-2">
                <ExpiryIndicator date={selected.visa_expiry} label="Visa" />
                <ExpiryIndicator date={selected.work_permit_expiry} label="Work Permit" />
                <ExpiryIndicator date={selected.passport_expiry} label="Passport" />
                <ExpiryIndicator date={selected.medical_insurance_expiry} label="Medical Ins." />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.1em] mb-2">Skills</p>
              <div className="flex flex-wrap gap-2">
                {selected.skills.length === 0
                  ? <p className="text-[12px] text-slate-400">No skills added yet</p>
                  : selected.skills.map(s => (
                    <span key={s} className="text-[12px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">{s}</span>
                  ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" size="sm" onClick={() => setIsEditing(true)}>Edit</Button>
              <Button className="flex-1" size="sm" onClick={() => { setSelected(null); setIsEditing(false); navigate('/dispatch') }}>View Schedule</Button>
            </div>
          </div>
        )}

        {selected && isEditing && (
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const patch = {
                full_name:                 fd.get('full_name') as string,
                phone:                     fd.get('phone') as string,
                role:                      fd.get('role') as 'cleaner' | 'crew_lead',
                nationality:               fd.get('nationality') as string,
                emirates_id:               fd.get('emirates_id') as string,
                pay_rate_hourly:           Number(fd.get('pay_rate_hourly')),
                visa_expiry:               fd.get('visa_expiry') as string,
                work_permit_expiry:        fd.get('work_permit_expiry') as string,
                passport_expiry:           fd.get('passport_expiry') as string,
                medical_insurance_expiry:  fd.get('medical_insurance_expiry') as string,
                joined_date:               fd.get('joined_date') as string,
                status:                    fd.get('status') as 'active' | 'inactive',
                skills: (fd.get('skills') as string).split(',').map(s => s.trim()).filter(Boolean),
              }
              updateEmployee(selected.id, patch)
              setSelected({ ...selected, ...patch })
              setIsEditing(false)
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Input name="full_name" label="Full Name" defaultValue={selected.full_name} required />
              <Input name="phone" label="Phone" defaultValue={selected.phone} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select name="role" label="Role" defaultValue={selected.role}>
                <option value="cleaner">Cleaner</option>
                <option value="crew_lead">Crew Lead</option>
              </Select>
              <Select name="status" label="Status" defaultValue={selected.status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On Leave</option>
                <option value="engaged_in_project">Engaged in Project</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input name="nationality" label="Nationality" defaultValue={selected.nationality} />
              <Input name="emirates_id" label="Emirates ID" defaultValue={selected.emirates_id} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input name="pay_rate_hourly" label="Pay Rate (AED/hr)" type="number" defaultValue={String(selected.pay_rate_hourly)} />
              <Input name="joined_date" label="Joined Date" type="date" defaultValue={selected.joined_date} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input name="visa_expiry" label="Visa Expiry" type="date" defaultValue={selected.visa_expiry} />
              <Input name="work_permit_expiry" label="Work Permit Expiry" type="date" defaultValue={selected.work_permit_expiry} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input name="passport_expiry" label="Passport Expiry" type="date" defaultValue={selected.passport_expiry} />
              <Input name="medical_insurance_expiry" label="Medical Ins. Expiry" type="date" defaultValue={selected.medical_insurance_expiry} />
            </div>
            <Input name="skills" label="Skills (comma separated)" defaultValue={selected.skills.join(', ')} placeholder="Deep Clean, Carpet, Window..." />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button type="submit" className="flex-1">Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
