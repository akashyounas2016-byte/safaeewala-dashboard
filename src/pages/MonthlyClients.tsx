import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Search, Phone, MapPin, Calendar,
  Users, TrendingUp, DollarSign, Star, Award, Heart, ExternalLink, Trash2,
} from 'lucide-react'
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

export function MonthlyClients() {
  const { clients, bookings, invoices, addClient, updateClient, deleteClient, addBooking } = useData()

  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [search, setSearch]             = useState('')
  const [areaFilter, setAreaFilter]     = useState('all')
  const [sortOrder, setSortOrder]       = useState<'top_spent' | 'name' | 'bookings'>('bookings')
  const [showModal, setShowModal]       = useState(false)
  const [selected, setSelected]         = useState<typeof clients[0] | null>(null)
  const [isEditing, setIsEditing]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [bookingClient, setBookingClient] = useState<{ name: string; phone: string } | null>(null)

  const monthKey  = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`
  const monthName = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const prevMonth = () => { const d = new Date(selectedMonth); d.setMonth(d.getMonth() - 1); setSelectedMonth(d) }
  const nextMonth = () => { const d = new Date(selectedMonth); d.setMonth(d.getMonth() + 1); setSelectedMonth(d) }

  // Bookings in this month
  const monthBookings = bookings.filter(b => b.scheduled_date?.startsWith(monthKey))
  const monthClientIds = new Set(monthBookings.map(b => b.client_id).filter(Boolean))
  const monthClientNames = new Set(monthBookings.map(b => b.client_name.toLowerCase().trim()))

  // Clients active this month
  const monthClients = clients.filter(c =>
    monthClientIds.has(c.id) || monthClientNames.has(c.full_name.toLowerCase().trim())
  )

  const monthRevenue  = monthBookings.filter(b => b.status === 'completed').reduce((s, b) => s + b.total_amount, 0)
  const totalHours    = monthBookings.reduce((s, b) => s + (b.duration_hours || 0), 0)
  const newClients    = monthClients.filter(c => c.created_at?.startsWith(monthKey)).length
  const avgValue      = monthClients.length > 0 ? monthRevenue / monthClients.length : 0

  const areas = [...new Set(monthClients.map(c => c.area).filter(Boolean))]

  const filtered = (() => {
    const base = monthClients.filter(c => {
      const matchSearch = !search ||
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search) ||
        c.area?.toLowerCase().includes(search.toLowerCase())
      const matchArea = areaFilter === 'all' || c.area === areaFilter
      return matchSearch && matchArea
    })
    if (sortOrder === 'top_spent') return [...base].sort((a, b) => b.total_spent - a.total_spent)
    if (sortOrder === 'name')      return [...base].sort((a, b) => a.full_name.localeCompare(b.full_name))
    return [...base].sort((a, b) => {
      const aB = monthBookings.filter(bk => bk.client_id === a.id || bk.client_name.toLowerCase() === a.full_name.toLowerCase()).length
      const bB = monthBookings.filter(bk => bk.client_id === b.id || bk.client_name.toLowerCase() === b.full_name.toLowerCase()).length
      return bB - aB
    })
  })()

  const topClients = [...monthClients].sort((a, b) => {
    const aAmt = monthBookings.filter(bk => bk.client_id === a.id || bk.client_name.toLowerCase() === a.full_name.toLowerCase()).reduce((s, bk) => s + bk.total_amount, 0)
    const bAmt = monthBookings.filter(bk => bk.client_id === b.id || bk.client_name.toLowerCase() === b.full_name.toLowerCase()).reduce((s, bk) => s + bk.total_amount, 0)
    return bAmt - aAmt
  }).slice(0, 5)

  const areaCounts = monthClients.reduce((acc, c) => {
    if (c.area) acc[c.area] = (acc[c.area] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      <PageHero
        title="Monthly Clients"
        subtitle={`${monthClients.length} clients · AED ${monthRevenue.toLocaleString()} revenue`}
        statusChip={`${monthBookings.length} visits`}
        actionLabel="Add Client"
        onAction={() => setShowModal(true)}
      />

      {/* Month Selector */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronLeft size={20} className="text-slate-600" />
        </button>
        <p className="text-[20px] font-bold text-[#111827]">{monthName}</p>
        <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronRight size={20} className="text-slate-600" />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Clients',  value: monthClients.length,            icon: Users,      color: 'text-blue-600',    bg: 'bg-blue-50'    },
          { label: 'New This Month',  value: newClients,                     icon: Star,       color: 'text-purple-600',  bg: 'bg-purple-50'  },
          { label: 'Total Revenue',   value: `AED ${monthRevenue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Hours',     value: `${totalHours}h`,               icon: TrendingUp, color: 'text-amber-600',   bg: 'bg-amber-50'   },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon size={18} className={card.color} />
            </div>
            <p className="text-2xl font-bold text-[#111827]">{card.value}</p>
            <p className="text-[12px] text-slate-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left: Client Cards */}
        <div className="xl:col-span-2 space-y-4">

          {/* Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search clients…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 placeholder-slate-400 transition-colors"
                />
              </div>
              <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
                className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer">
                <option value="all">All Areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={sortOrder} onChange={e => setSortOrder(e.target.value as typeof sortOrder)}
                className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer">
                <option value="bookings">Sort: Most Visits</option>
                <option value="top_spent">Sort: Top Spenders</option>
                <option value="name">Sort: Name</option>
              </select>
            </div>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((c, idx) => {
              const cBookings = monthBookings.filter(b => b.client_id === c.id || b.client_name.toLowerCase() === c.full_name.toLowerCase())
              const cRevenue  = cBookings.reduce((s, b) => s + b.total_amount, 0)
              const cInvs     = invoices.filter(i => i.client_id === c.id || i.client_name.toLowerCase() === c.full_name.toLowerCase())
              const outstanding = cInvs.reduce((s, i) => s + i.total, 0) - cInvs.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
              return (
                <div key={c.id} onClick={() => setSelected(c)}
                  className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 cursor-pointer hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] hover:border-emerald-200 transition-all">
                  <div className="flex items-start gap-3 mb-4">
                    <Avatar name={c.full_name} size="md" idx={idx} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-[#111827] truncate">{c.full_name}</p>
                      <p className="text-[12px] text-slate-500 mt-0.5">{c.nationality || c.city || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[15px] font-bold text-[#111827]">AED {cRevenue.toLocaleString()}</p>
                      <p className="text-[11px] text-slate-400">this month</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-[12px] text-slate-500">
                    <div className="flex items-center gap-2"><Phone size={12} className="shrink-0 text-slate-400" /><span>{c.phone}</span></div>
                    <div className="flex items-center gap-2"><MapPin size={12} className="shrink-0 text-slate-400" /><span className="truncate">{c.building_name ? `${c.building_name}, ` : ''}{c.area}</span></div>
                    {c.last_service && <div className="flex items-center gap-2"><Calendar size={12} className="shrink-0 text-slate-400" /><span>Last: {formatDate(c.last_service)}</span></div>}
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3.5 border-t border-[#E4E8EC]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12px] text-slate-500">{cBookings.length} visit{cBookings.length !== 1 ? 's' : ''}</span>
                      {c.total_spent > 2000 && <span className="text-[11px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">VIP</span>}
                      {c.pet_info && <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">Pet</span>}
                      {outstanding > 0 && <span className="text-[11px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-semibold">AED {outstanding.toLocaleString()} owed</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); deleteClient(c.id) }} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                      <Link to={`/clients/${c.id}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors shrink-0">
                        View Profile <ExternalLink size={11} />
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] py-16 text-center">
              <Users className="mx-auto mb-3 text-slate-300" size={40} strokeWidth={1.25} />
              <p className="text-[13px] text-slate-500">No clients found for {monthName}</p>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-5">
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Top Clients</h3>
              <span className="text-[11px] text-slate-400">{monthName}</span>
            </div>
            {topClients.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-4">No data</p>
            ) : (
              <div className="space-y-3">
                {topClients.map((c, idx) => {
                  const amt = monthBookings.filter(b => b.client_id === c.id || b.client_name.toLowerCase() === c.full_name.toLowerCase()).reduce((s, b) => s + b.total_amount, 0)
                  const maxAmt = monthBookings.filter(b => b.client_id === topClients[0].id || b.client_name.toLowerCase() === topClients[0].full_name.toLowerCase()).reduce((s, b) => s + b.total_amount, 0)
                  const pct = maxAmt > 0 ? Math.round((amt / maxAmt) * 100) : 0
                  return (
                    <Link key={c.id} to={`/clients/${c.id}`} className="flex items-center gap-3 hover:bg-slate-50 rounded-xl -mx-2 px-2 py-1 transition-colors">
                      <span className={`text-[12px] font-bold w-4 shrink-0 ${idx === 0 ? 'text-amber-500' : 'text-slate-400'}`}>{idx + 1}</span>
                      <Avatar name={c.full_name} size="sm" idx={idx} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-[#111827] truncate">{c.full_name}</p>
                        <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-[12px] font-bold text-[#111827] shrink-0">AED {amt.toLocaleString()}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {Object.keys(areaCounts).length > 0 && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-bold text-[#111827]">Client Density</h3>
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
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Client Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New Client" size="lg">
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault()
          const f = new FormData(e.currentTarget as HTMLFormElement)
          addClient({
            full_name: String(f.get('full_name') || 'New Client'),
            phone: String(f.get('phone') || ''),
            whatsapp: String(f.get('whatsapp') || ''),
            email: String(f.get('email') || ''),
            nationality: '',
            city: String(f.get('city') || 'Dubai'),
            building_name: String(f.get('building') || ''),
            apartment: '',
            area: String(f.get('area') || 'Dubai'),
            access_notes: String(f.get('access_notes') || ''),
            pet_info: String(f.get('pet_info') || ''),
            total_bookings: 0,
            total_spent: 0,
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
            <Input name="building" label="Building / Villa" placeholder="Building or villa name" />
            <Select name="city" label="Emirate"><option>Dubai</option><option>Abu Dhabi</option><option>Sharjah</option><option>Ajman</option></Select>
          </div>
          <Input name="area" label="Area / Community" placeholder="e.g. Dubai Marina, JBR..." />
          <Textarea name="access_notes" label="Access Notes" rows={2} />
          <Textarea name="pet_info" label="Pet Information" rows={2} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Save Client</Button>
          </div>
        </form>
      </Modal>

      {/* Client Detail Modal */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setIsEditing(false); setConfirmDelete(false) }}
        title={isEditing ? 'Edit Client' : 'Client Profile'} size="lg">
        {selected && !isEditing && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={selected.full_name} size="lg" idx={0} />
              <div>
                <p className="text-[18px] font-bold text-[#111827]">{selected.full_name}</p>
                <p className="text-[13px] text-slate-500 mt-0.5">Client since {formatDate(selected.created_at)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Phone',    value: selected.phone },
                { label: 'WhatsApp', value: selected.whatsapp ?? selected.phone },
                { label: 'Email',    value: selected.email ?? '—' },
                { label: 'Area',     value: `${selected.building_name ? selected.building_name + ', ' : ''}${selected.area}` },
                { label: 'Total Bookings', value: selected.total_bookings },
                { label: 'Total Spent', value: `AED ${selected.total_spent.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]">
                  <p className="text-[10.5px] text-slate-500 uppercase tracking-[0.08em] font-semibold mb-1">{label}</p>
                  <p className="text-[13px] font-semibold text-[#111827]">{value}</p>
                </div>
              ))}
            </div>
            {selected.access_notes && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-[10.5px] text-blue-700 uppercase font-semibold mb-1">Access Notes</p>
                <p className="text-[13px] text-blue-700">{selected.access_notes}</p>
              </div>
            )}
            {confirmDelete ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-[13px] font-semibold text-red-700 mb-1">Delete {selected.full_name}?</p>
                <p className="text-[12px] text-red-600 mb-3">This cannot be undone.</p>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <button type="button" className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold py-2 rounded-xl transition-colors"
                    onClick={() => { deleteClient(selected!.id); setSelected(null); setConfirmDelete(false) }}>Yes, Delete</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-[12px] font-semibold hover:bg-red-50 transition-colors"><Trash2 size={13} /> Delete</button>
                <Button variant="outline" className="flex-1" size="sm" onClick={() => setIsEditing(true)}>Edit Profile</Button>
                <Button className="flex-1" size="sm" onClick={() => { setBookingClient({ name: selected!.full_name, phone: selected!.phone }); setSelected(null); setShowBookingModal(true) }}>New Booking</Button>
              </div>
            )}
          </div>
        )}
        {selected && isEditing && (
          <form className="space-y-4" onSubmit={e => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const patch = { full_name: f.get('full_name') as string, phone: f.get('phone') as string, whatsapp: f.get('whatsapp') as string, email: f.get('email') as string, city: f.get('city') as string, building_name: f.get('building') as string, area: f.get('area') as string, access_notes: f.get('access_notes') as string, pet_info: f.get('pet_info') as string }
            updateClient(selected.id, patch)
            setSelected({ ...selected, ...patch })
            setIsEditing(false)
          }}>
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
              <Select name="city" label="Emirate" defaultValue={selected.city}><option>Dubai</option><option>Abu Dhabi</option><option>Sharjah</option><option>Ajman</option></Select>
            </div>
            <Input name="area" label="Area" defaultValue={selected.area} />
            <Textarea name="access_notes" label="Access Notes" defaultValue={selected.access_notes ?? ''} rows={2} />
            <Textarea name="pet_info" label="Pet Information" defaultValue={selected.pet_info ?? ''} rows={2} />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button type="submit" className="flex-1">Save Changes</Button>
            </div>
          </form>
        )}
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
    </div>
  )
}

function ClientBookingForm({ clientName, clientPhone, onClose, onAdd }: { clientName: string; clientPhone: string; onClose: () => void; onAdd: (b: any) => void }) {
  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      onAdd({ client_id: '', client_name: clientName, client_phone: clientPhone, service_address: f.get('service_address') as string, service_type: f.get('service_type') as string, frequency: (f.get('frequency') as BookingFrequency) || 'once', scheduled_date: f.get('scheduled_date') as string, scheduled_time: f.get('scheduled_time') as string, duration_hours: Number(f.get('duration_hours')) || 3, total_amount: Number(f.get('total_amount')) || 0, notes: f.get('notes') as string, status: 'pending', assigned_crew: [] })
    }}>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]"><p className="text-[10.5px] text-slate-500 uppercase font-semibold mb-1">Client</p><p className="text-[13px] font-semibold text-[#111827]">{clientName}</p></div>
        <div className="bg-slate-50 rounded-xl p-3 border border-[#E4E8EC]"><p className="text-[10.5px] text-slate-500 uppercase font-semibold mb-1">Phone</p><p className="text-[13px] font-semibold text-[#111827]">{clientPhone}</p></div>
      </div>
      <Input name="service_address" label="Service Address" placeholder="Street, unit, neighborhood" />
      <div className="grid grid-cols-2 gap-4">
        <Select name="service_type" label="Service Type"><option value="">Select service…</option>{serviceTypes.map(s => <option key={s}>{s}</option>)}</Select>
        <Select name="frequency" label="Frequency"><option value="once">One-time</option><option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option><option value="monthly">Monthly</option></Select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input name="scheduled_date" label="Date" type="date" required />
        <Input name="scheduled_time" label="Start Time" type="time" />
        <Input name="duration_hours" label="Hours" type="number" min="1" max="24" defaultValue="3" />
      </div>
      <Input name="total_amount" label="Total Amount (AED)" type="number" placeholder="0.00" />
      <Textarea name="notes" label="Remarks" rows={2} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Create Booking</Button>
      </div>
    </form>
  )
}
