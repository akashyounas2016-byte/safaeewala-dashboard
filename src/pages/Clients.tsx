import { useState, useRef, useEffect } from 'react'
import { Search, Phone, MapPin, Calendar, TrendingUp, Users, Star, DollarSign, Heart, Award, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatDate } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { BookingFrequency } from '@/types'

const serviceTypes = [
  'Standard Clean', 'Deep Clean', 'Move-in', 'Move-out',
  'Commercial', 'Post-construction', 'Office', 'Carpet', 'Window',
]

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

function CrewSelector({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { employees } = useData()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activeEmps = employees.filter(e => e.status === 'active' || e.status === 'engaged_in_project')
  const filtered = search
    ? activeEmps.filter(e => e.full_name.toLowerCase().includes(search.toLowerCase()))
    : activeEmps
  const selectedEmps = activeEmps.filter(e => selected.includes(e.id))
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }
  return (
    <div>
      <p className="text-[12px] font-semibold text-slate-600 mb-2">Assign Crew</p>
      {selectedEmps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedEmps.map(emp => (
            <span key={emp.id} className="inline-flex items-center gap-1 text-[11.5px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-medium">
              {emp.full_name}
              <button type="button" onClick={() => toggle(emp.id)} className="ml-0.5 hover:text-red-600 font-bold leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative" ref={ref}>
        <input
          type="text"
          placeholder={activeEmps.length === 0 ? 'No active employees — add employees first' : 'Search and select cleaners…'}
          value={search}
          onFocus={() => setOpen(true)}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          disabled={activeEmps.length === 0}
          className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50 focus:outline-none focus:border-emerald-400 placeholder-slate-400 disabled:opacity-50 transition-colors"
        />
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-[#E4E8EC] rounded-xl shadow-xl max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-slate-400 px-4 py-3">No employees match "{search}"</p>
            ) : filtered.map(emp => {
              const checked = selected.includes(emp.id)
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => { toggle(emp.id); setSearch('') }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-[#E4E8EC] last:border-0 transition-colors ${checked ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                    {checked && <span className="text-white text-[9px] font-bold">✓</span>}
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#111827]">{emp.full_name}</p>
                    <p className="text-[10.5px] text-slate-400">{emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {selectedEmps.length > 0 && (
        <p className="text-[11px] text-emerald-600 font-medium mt-1.5">{selectedEmps.length} cleaner{selectedEmps.length > 1 ? 's' : ''} assigned</p>
      )}
    </div>
  )
}

export function Clients() {
  const { clients, bookings, addClient, updateClient, addBooking } = useData()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<typeof clients[0] | null>(null)
  const [isEditingClient, setIsEditingClient] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [bookingClient, setBookingClient] = useState<{ name: string; phone: string } | null>(null)
  const [areaFilter, setAreaFilter] = useState('all')

  const totalSpent    = clients.reduce((s, c) => s + c.total_spent, 0)
  const avgLtv        = Math.round(totalSpent / (clients.length || 1))
  const activeClients = clients.filter(c => c.last_service && new Date(c.last_service) > new Date('2026-01-01')).length
  const vipClients    = clients.filter(c => c.total_spent > 2000).length
  const repeatClients = clients.filter(c => c.total_bookings > 1).length
  const repeatRate    = clients.length > 0 ? Math.round((repeatClients / clients.length) * 100) : 0

  const areas = [...new Set(clients.map(c => c.area))]

  const filtered = clients.filter(c => {
    const matchSearch = c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.area.toLowerCase().includes(search.toLowerCase())
    const matchArea = areaFilter === 'all' || c.area === areaFilter
    return matchSearch && matchArea
  })

  const topClients = [...clients].sort((a, b) => b.total_spent - a.total_spent).slice(0, 5)

  const areaCounts = clients.reduce((acc, c) => {
    acc[c.area] = (acc[c.area] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Clients"
        subtitle={`${clients.length} total clients · ${activeClients} active this year · AED ${totalSpent.toLocaleString()} lifetime`}
        statusChip={`${vipClients} VIP`}
        actionLabel="Add Client"
        onAction={() => setShowModal(true)}
        searchPlaceholder="Search clients…"
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Clients',    value: clients.length,             sub: 'All time',       icon: Users,     iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    delta: '+3',   deltaUp: true  },
          { label: 'Active (30d)',     value: activeClients,                  sub: 'Recent activity', icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: '+1',   deltaUp: true  },
          { label: 'VIP Clients',      value: vipClients,                     sub: 'AED 2k+ spent',  icon: Award,     iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  delta: '+2',   deltaUp: true  },
          { label: 'Avg Lifetime',     value: `AED ${avgLtv.toLocaleString()}`, sub: 'Per client',   icon: DollarSign, iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   delta: '+8%',  deltaUp: true  },
          { label: 'Total Revenue',    value: `AED ${(totalSpent/1000).toFixed(1)}k`, sub: 'All clients', icon: Star,  iconBg: 'bg-rose-50',    iconColor: 'text-rose-600',    delta: '+12%', deltaUp: true  },
          { label: 'Repeat Rate',      value: `${repeatRate}%`,               sub: 'Have 2+ bookings',  icon: Heart,  iconBg: 'bg-pink-50',    iconColor: 'text-pink-600',    delta: `${repeatClients} clients`, deltaUp: repeatRate > 0 },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon size={18} className={card.iconColor} />
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${card.deltaUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {card.delta}
              </span>
            </div>
            <p className="text-2xl font-bold text-[#111827] tracking-tight">{card.value}</p>
            <p className="text-[12px] font-semibold text-[#111827] mt-1">{card.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main content: Client list + Sidebar widgets ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Filters + Client Grid ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, phone, area…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 focus:bg-white placeholder-slate-400 transition-colors"
                />
              </div>
              <select
                value={areaFilter}
                onChange={e => setAreaFilter(e.target.value)}
                className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                <option value="all">All Areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer">
                <option>Sort by: Recent</option>
                <option>Sort by: Top Spenders</option>
                <option>Sort by: Name</option>
              </select>
            </div>
          </div>

          {/* Client cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((c, idx) => (
              <div
                key={c.id}
                onClick={() => setSelected(c)}
                className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 cursor-pointer hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] hover:border-emerald-200 transition-all"
              >
                <div className="flex items-start gap-3 mb-4">
                  <Avatar name={c.full_name} size="md" idx={idx} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#111827] truncate">{c.full_name}</p>
                    <p className="text-[12px] text-slate-500 mt-0.5">{c.nationality}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[15px] font-bold text-[#111827]">AED {c.total_spent.toLocaleString()}</p>
                    <p className="text-[11px] text-slate-400">lifetime</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-[12px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <Phone size={12} className="shrink-0 text-slate-400" />
                    <span>{c.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={12} className="shrink-0 text-slate-400" />
                    <span className="truncate">{c.building_name ? `${c.building_name}, ` : ''}{c.area}</span>
                  </div>
                  {c.last_service && (
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="shrink-0 text-slate-400" />
                      <span>Last service: {formatDate(c.last_service)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-3.5 border-t border-[#E4E8EC]">
                  <span className="text-[12px] text-slate-500">{c.total_bookings} bookings</span>
                  <div className="flex gap-1.5">
                    {c.pet_info && (
                      <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">Pet</span>
                    )}
                    {c.preferred_cleaner && (
                      <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">Preferred</span>
                    )}
                    {c.total_spent > 2000 && (
                      <span className="text-[11px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">VIP</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] py-16 text-center">
              <Users className="mx-auto mb-3 text-slate-300" size={40} strokeWidth={1.25} />
              <p className="text-[13px] text-slate-500">No clients match your search</p>
            </div>
          )}
        </div>

        {/* ── Right sidebar widgets ── */}
        <div className="space-y-5">

          {/* Client Loyalty — Top Clients */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Top Clients</h3>
              <span className="text-[11px] text-slate-400">By lifetime value</span>
            </div>
            <div className="space-y-3">
              {topClients.map((c, idx) => {
                const pct = Math.round((c.total_spent / topClients[0].total_spent) * 100)
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className={`text-[12px] font-bold w-4 shrink-0 ${idx === 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                      {idx + 1}
                    </span>
                    <Avatar name={c.full_name} size="sm" idx={idx} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#111827] truncate">{c.full_name}</p>
                      <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-[12px] font-bold text-[#111827] shrink-0">AED {c.total_spent.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent Bookings (real) */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Recent Bookings</h3>
              <span className="text-[11px] text-slate-400">Latest activity</span>
            </div>
            {bookings.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-4">No bookings yet</p>
            ) : (
              <div className="space-y-3">
                {[...bookings]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .slice(0, 5)
                  .map((b, idx) => {
                    const statusColor =
                      b.status === 'completed'   ? 'bg-slate-100 text-slate-600' :
                      b.status === 'in_progress' ? 'bg-emerald-50 text-emerald-700' :
                      b.status === 'confirmed'   ? 'bg-blue-50 text-blue-700' :
                      b.status === 'cancelled'   ? 'bg-red-50 text-red-600' :
                      'bg-amber-50 text-amber-700'
                    const statusLabel =
                      b.status === 'completed'   ? 'Done' :
                      b.status === 'in_progress' ? 'Live' :
                      b.status === 'confirmed'   ? 'Scheduled' :
                      b.status === 'cancelled'   ? 'Cancelled' : 'Pending'
                    return (
                      <div key={b.id} className="flex items-center gap-3">
                        <Avatar name={b.client_name} size="sm" idx={idx} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-[#111827] truncate">{b.client_name}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{b.service_type} · {b.scheduled_date}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Client Density by Area */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Client Density</h3>
              <span className="text-[11px] text-slate-400">By area</span>
            </div>
            <div className="space-y-2.5">
              {Object.entries(areaCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([area, count]) => {
                  const maxCount = Math.max(...Object.values(areaCounts))
                  const pct = Math.round((count / maxCount) * 100)
                  return (
                    <div key={area}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium text-slate-700 truncate">{area}</span>
                        <span className="text-[12px] font-bold text-[#111827] shrink-0 ml-2">{count}</span>
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

      {/* ── Add Client Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New Client" size="lg">
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault()
          const f = new FormData(e.currentTarget as HTMLFormElement)
          addClient({
            full_name:     String(f.get('full_name') || 'New Client'),
            phone:         String(f.get('phone') || ''),
            whatsapp:      String(f.get('whatsapp') || ''),
            email:         String(f.get('email') || ''),
            nationality:   '',
            city:          String(f.get('city') || 'Dubai'),
            building_name: String(f.get('building') || ''),
            apartment:     '',
            area:          String(f.get('area') || 'Dubai'),
            access_notes:  String(f.get('access_notes') || ''),
            pet_info:      String(f.get('pet_info') || ''),
            total_bookings: 0,
            total_spent:   0,
          })
          setShowModal(false)
        }}>
          <div className="grid grid-cols-2 gap-4">
            <Input name="full_name" label="Full Name" placeholder="Full name" />
            <Input name="phone" label="Phone" placeholder="+971 50 000 0000" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="whatsapp" label="WhatsApp" placeholder="+971 50 000 0000" />
            <Input name="email" label="Email" type="email" placeholder="email@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input name="building" label="Building / Villa Name" placeholder="Building or villa name" />
            <Select name="city" label="Emirate">
              <option>Dubai</option><option>Abu Dhabi</option><option>Sharjah</option><option>Ajman</option>
            </Select>
          </div>
          <Input name="area" label="Area / Community" placeholder="e.g. Dubai Marina, JBR..." />
          <Textarea name="access_notes" label="Access Notes" placeholder="Key with concierge, parking instructions, gate code..." rows={2} />
          <Textarea name="pet_info" label="Pet Information" placeholder="Pet type, breed, any cleaning product restrictions..." rows={2} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Save Client</Button>
          </div>
        </form>
      </Modal>

      {/* ── Client Detail / Edit Modal ── */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setIsEditingClient(false) }}
        title={isEditingClient ? 'Edit Client' : 'Client Profile'}
        size="lg"
      >
        {selected && !isEditingClient && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={selected.full_name} size="lg" idx={0} />
              <div>
                <p className="text-[18px] font-bold text-[#111827]">{selected.full_name}</p>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  {selected.nationality ? `${selected.nationality} · ` : ''}Client since {formatDate(selected.created_at)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Phone',          value: selected.phone },
                { label: 'WhatsApp',       value: selected.whatsapp ?? selected.phone },
                { label: 'Email',          value: selected.email ?? '—' },
                { label: 'Area',           value: `${selected.building_name ? selected.building_name + ', ' : ''}${selected.area}` },
                { label: 'Total Bookings', value: selected.total_bookings },
                { label: 'Total Spent',    value: `AED ${selected.total_spent.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
                  <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-1">{label}</p>
                  <p className="text-[13px] font-semibold text-[#111827]">{value}</p>
                </div>
              ))}
            </div>

            {selected.access_notes && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-[10.5px] text-blue-700 uppercase tracking-[0.08em] font-semibold mb-1">Access Notes</p>
                <p className="text-[13px] text-blue-700">{selected.access_notes}</p>
              </div>
            )}
            {selected.pet_info && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-[10.5px] text-amber-700 uppercase tracking-[0.08em] font-semibold mb-1">Pet Information</p>
                <p className="text-[13px] text-amber-700">{selected.pet_info}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" size="sm" onClick={() => setIsEditingClient(true)}>Edit Profile</Button>
              <Button className="flex-1" size="sm" onClick={() => { setBookingClient({ name: selected!.full_name, phone: selected!.phone }); setSelected(null); setIsEditingClient(false); setShowBookingModal(true) }}>New Booking</Button>
            </div>
          </div>
        )}

        {selected && isEditingClient && (
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              const patch = {
                full_name:     f.get('full_name') as string,
                phone:         f.get('phone') as string,
                whatsapp:      f.get('whatsapp') as string,
                email:         f.get('email') as string,
                city:          f.get('city') as string,
                building_name: f.get('building') as string,
                area:          f.get('area') as string,
                access_notes:  f.get('access_notes') as string,
                pet_info:      f.get('pet_info') as string,
              }
              updateClient(selected.id, patch)
              setSelected({ ...selected, ...patch })
              setIsEditingClient(false)
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Input name="full_name" label="Full Name" defaultValue={selected.full_name} required />
              <Input name="phone" label="Phone" defaultValue={selected.phone} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input name="whatsapp" label="WhatsApp" defaultValue={selected.whatsapp ?? ''} />
              <Input name="email" label="Email" type="email" defaultValue={selected.email ?? ''} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input name="building" label="Building / Villa" defaultValue={selected.building_name ?? ''} />
              <Select name="city" label="Emirate" defaultValue={selected.city}>
                <option>Dubai</option><option>Abu Dhabi</option><option>Sharjah</option><option>Ajman</option>
              </Select>
            </div>
            <Input name="area" label="Area / Community" defaultValue={selected.area} />
            <Textarea name="access_notes" label="Access Notes" defaultValue={selected.access_notes ?? ''} rows={2} />
            <Textarea name="pet_info" label="Pet Information" defaultValue={selected.pet_info ?? ''} rows={2} />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditingClient(false)}>Cancel</Button>
              <Button type="submit" className="flex-1">Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── New Booking for Client Modal ── */}
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

function ClientBookingForm({ clientName, clientPhone, onClose, onAdd }: {
  clientName: string; clientPhone: string
  onClose: () => void; onAdd: (b: any) => void
}) {
  const [selectedCrew, setSelectedCrew] = useState<string[]>([])
  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        onAdd({
          client_id: '',
          client_name: clientName,
          client_phone: clientPhone,
          service_address: f.get('service_address') as string,
          service_type: f.get('service_type') as string,
          frequency: (f.get('frequency') as BookingFrequency) || 'once',
          scheduled_date: f.get('scheduled_date') as string,
          scheduled_time: f.get('scheduled_time') as string,
          duration_hours: Number(f.get('duration_hours')) || 3,
          total_amount: Number(f.get('total_amount')) || 0,
          notes: f.get('notes') as string,
          status: 'pending',
          assigned_crew: selectedCrew,
        })
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
          <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-1">Client</p>
          <p className="text-[13px] font-semibold text-[#111827]">{clientName}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
          <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-1">Phone</p>
          <p className="text-[13px] font-semibold text-[#111827]">{clientPhone}</p>
        </div>
      </div>
      <Input name="service_address" label="Service Address" placeholder="Street, unit, neighborhood" />
      <div className="grid grid-cols-2 gap-4">
        <Select name="service_type" label="Service Type">
          <option value="">Select service…</option>
          {serviceTypes.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select name="frequency" label="Frequency">
          <option value="once">One-time</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="monthly">Monthly</option>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input name="scheduled_date" label="Date" type="date" required />
        <Input name="scheduled_time" label="Time" type="time" />
        <Input name="duration_hours" label="Duration (hrs)" type="number" min="1" max="12" defaultValue="3" />
      </div>
      <Input name="total_amount" label="Total Amount (AED)" type="number" placeholder="0.00" />
      <CrewSelector selected={selectedCrew} onChange={setSelectedCrew} />
      <Textarea name="notes" label="Notes" placeholder="Access instructions, special requirements…" rows={2} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Create Booking</Button>
      </div>
    </form>
  )
}
