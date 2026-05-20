import { useState } from 'react'
import { Plus, Search, Phone, MapPin, Calendar, TrendingUp, Users, Star, DollarSign, Heart, Award } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatCurrency, formatDate } from '@/lib/utils'
import { mockClients } from '@/data/mock'

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

export function Clients() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<typeof mockClients[0] | null>(null)
  const [areaFilter, setAreaFilter] = useState('all')

  const totalSpent = mockClients.reduce((s, c) => s + c.total_spent, 0)
  const avgLtv = Math.round(totalSpent / mockClients.length)
  const activeClients = mockClients.filter(c => c.last_service && new Date(c.last_service) > new Date('2026-01-01')).length
  const vipClients = mockClients.filter(c => c.total_spent > 2000).length

  const areas = [...new Set(mockClients.map(c => c.area))]

  const filtered = mockClients.filter(c => {
    const matchSearch = c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.area.toLowerCase().includes(search.toLowerCase())
    const matchArea = areaFilter === 'all' || c.area === areaFilter
    return matchSearch && matchArea
  })

  const topClients = [...mockClients].sort((a, b) => b.total_spent - a.total_spent).slice(0, 5)

  const areaCounts = mockClients.reduce((acc, c) => {
    acc[c.area] = (acc[c.area] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Clients"
        subtitle={`${mockClients.length} total clients · ${activeClients} active this year · AED ${totalSpent.toLocaleString()} lifetime`}
        statusChip={`${vipClients} VIP`}
        actionLabel="Add Client"
        onAction={() => setShowModal(true)}
        searchPlaceholder="Search clients…"
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Clients',    value: mockClients.length,             sub: 'All time',       icon: Users,     iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    delta: '+3',   deltaUp: true  },
          { label: 'Active (30d)',     value: activeClients,                  sub: 'Recent activity', icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: '+1',   deltaUp: true  },
          { label: 'VIP Clients',      value: vipClients,                     sub: 'AED 2k+ spent',  icon: Award,     iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  delta: '+2',   deltaUp: true  },
          { label: 'Avg Lifetime',     value: `AED ${avgLtv.toLocaleString()}`, sub: 'Per client',   icon: DollarSign, iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   delta: '+8%',  deltaUp: true  },
          { label: 'Total Revenue',    value: `AED ${(totalSpent/1000).toFixed(1)}k`, sub: 'All clients', icon: Star,  iconBg: 'bg-rose-50',    iconColor: 'text-rose-600',    delta: '+12%', deltaUp: true  },
          { label: 'Retention Rate',   value: '78%',                          sub: 'Returning clients', icon: Heart,  iconBg: 'bg-pink-50',    iconColor: 'text-pink-600',    delta: '+5%',  deltaUp: true  },
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

          {/* Live Activity */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Recent Activity</h3>
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
            <div className="space-y-3">
              {[
                { name: 'Sarah Al-Mansouri', action: 'Booking confirmed', time: '2m ago', color: 'bg-emerald-50 text-emerald-700' },
                { name: 'Raj Patel',         action: 'Service completed',  time: '18m ago', color: 'bg-blue-50 text-blue-700' },
                { name: 'Emma Wilson',       action: 'Invoice paid',       time: '1h ago',  color: 'bg-purple-50 text-purple-700' },
                { name: 'Khalid Al-Rashid',  action: 'New booking',        time: '2h ago',  color: 'bg-amber-50 text-amber-700' },
                { name: 'Aisha Mohamed',     action: 'Profile updated',    time: '3h ago',  color: 'bg-slate-100 text-slate-600' },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <Avatar name={item.name} size="sm" idx={idx} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[#111827] truncate">{item.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.action}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${item.color}`}>
                    {item.time}
                  </span>
                </div>
              ))}
            </div>
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
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); setShowModal(false) }}>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name" placeholder="Full name" />
            <Input label="Phone" placeholder="+971 50 000 0000" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="WhatsApp" placeholder="+971 50 000 0000" />
            <Input label="Email" type="email" placeholder="email@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nationality" placeholder="e.g. Emirati, Indian..." />
            <Select label="Emirate">
              <option>Dubai</option>
              <option>Abu Dhabi</option>
              <option>Sharjah</option>
              <option>Ajman</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Building / Villa Name" placeholder="Building or villa name" />
            <Input label="Apartment / Unit" placeholder="Unit number" />
          </div>
          <Input label="Area / Community" placeholder="e.g. Dubai Marina, JBR..." />
          <Textarea label="Access Notes" placeholder="Key with concierge, parking instructions, gate code..." rows={2} />
          <Textarea label="Pet Information" placeholder="Pet type, breed, any cleaning product restrictions..." rows={2} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Save Client</Button>
          </div>
        </form>
      </Modal>

      {/* ── Client Detail Modal ── */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Client Profile" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={selected.full_name} size="lg" idx={0} />
              <div>
                <p className="text-[18px] font-bold text-[#111827]">{selected.full_name}</p>
                <p className="text-[13px] text-slate-500 mt-0.5">{selected.nationality} · Client since {formatDate(selected.created_at)}</p>
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
              <Button variant="outline" className="flex-1" size="sm">Edit Profile</Button>
              <Button className="flex-1" size="sm">New Booking</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
