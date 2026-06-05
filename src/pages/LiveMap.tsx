import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet'
import { Icon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Truck, Clock, CheckCircle, Phone, MessageCircle, AlertCircle, TrendingUp, Users, Zap, Navigation, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select, Input } from '@/components/ui/Input'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'

// Dubai-based area coordinates (sample approximations)
const DUBAI_AREAS: Record<string, [number, number]> = {
  'downtown dubai': [25.2048, 55.2708],
  'marina': [25.0887, 55.1411],
  'jbr': [25.0854, 55.1414],
  'deira': [25.2744, 55.3089],
  'bur dubai': [25.2696, 55.2998],
  'jumeirah': [25.1972, 55.1971],
  'dubai hills': [25.1393, 55.1717],
  'business bay': [25.1965, 55.2696],
  'difc': [25.1939, 55.2723],
  'sports city': [25.0936, 55.1608],
  'al barsha': [25.0918, 55.0851],
  'discovery gardens': [25.0725, 54.9897],
  'al quoz': [25.1366, 55.1859],
  'karama': [25.2372, 55.3038],
  'naif': [25.2810, 55.3319],
}

// Default to Dubai center
const DEFAULT_LOCATION: [number, number] = [25.2048, 55.2708]

function getCoordinatesFromAddress(address: string): [number, number] {
  const addressLower = address.toLowerCase()
  for (const [area, coords] of Object.entries(DUBAI_AREAS)) {
    if (addressLower.includes(area)) {
      // Add small random offset so overlapping jobs don't hide each other
      const offset = 0.003
      return [
        coords[0] + (Math.random() - 0.5) * offset,
        coords[1] + (Math.random() - 0.5) * offset,
      ]
    }
  }
  return DEFAULT_LOCATION
}

function JobMarker({ job, status }: { job: any; status: string }) {
  const coords = getCoordinatesFromAddress(job.service_address)
  const isLive = status === 'in_progress'
  const isPending = status === 'pending' || status === 'confirmed'

  const color = isLive ? '#10b981' : isPending ? '#3b82f6' : '#94a3b8'
  const size = isLive ? 40 : isPending ? 35 : 28

  const crewNames = job.assigned_crew.length > 0 ? job.assigned_crew : ['👤 Unassigned']

  return (
    <>
      <CircleMarker
        center={coords}
        radius={size / 2}
        pathOptions={{
          fillColor: color,
          color: 'white',
          weight: 3,
          opacity: 1,
          fillOpacity: 0.9,
        }}
      >
        <Popup>
          <div className="w-56">
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-sm text-[#111827]">{job.client_name}</p>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                isLive ? 'bg-emerald-100 text-emerald-700' :
                isPending ? 'bg-blue-100 text-blue-700' :
                'bg-slate-100 text-slate-700'
              }`}>
                {isLive ? '🔴 LIVE' : isPending ? '✓ CONFIRMED' : '✓ DONE'}
              </span>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 mb-3">
              <p className="text-xs font-semibold text-[#111827]">{job.service_type}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">Duration: {job.duration_hours}h · AED {job.total_amount.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500 mt-1">📍 {job.service_address}</p>
              <p className="text-[10px] text-slate-500">⏰ {job.scheduled_time}</p>
            </div>

            <div className="border-t border-slate-200 pt-2.5 mb-3">
              <p className="text-[10px] font-bold text-slate-600 mb-2">ASSIGNED CREW</p>
              <div className="space-y-1.5">
                {crewNames.map((crew: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-2">
                    <span className="text-lg">👤</span>
                    <div>
                      <p className="text-[11px] font-bold text-purple-900">{crew}</p>
                      <p className="text-[9px] text-purple-600">On the job</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {job.client_phone && (
                <a href={`tel:${job.client_phone}`} className="flex-1">
                  <Button size="sm" className="w-full flex items-center justify-center gap-1 text-xs">
                    <Phone size={12} /> Call
                  </Button>
                </a>
              )}
              {job.client_phone && (
                <a href={`https://wa.me/${job.client_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex-1">
                  <Button size="sm" variant="outline" className="w-full flex items-center justify-center gap-1 text-xs bg-green-50 hover:bg-green-100">
                    <MessageCircle size={12} /> Chat
                  </Button>
                </a>
              )}
            </div>
          </div>
        </Popup>
      </CircleMarker>

      {/* Show crew member names as floating labels on map */}
      {crewNames.length > 0 && isLive && (
        <div className="leaflet-marker-pane">
          {crewNames.map((crew: string, idx: number) => (
            <div
              key={idx}
              style={{
                position: 'absolute',
                left: `${coords[1]}px`,
                top: `${coords[0]}px`,
                transform: 'translate(-50%, -100%)',
                marginTop: `-${30 + idx * 25}px`,
              }}
              className="bg-white rounded-lg shadow-lg px-2.5 py-1.5 text-[11px] font-bold text-purple-700 border-l-4 border-purple-500 whitespace-nowrap"
            >
              👤 {crew}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export function LiveMap() {
  const { bookings, employees } = useData()
  const [filterStatus, setFilterStatus] = useState<'all' | 'in_progress' | 'pending' | 'confirmed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'time' | 'client' | 'service'>('time')

  const today = new Date().toISOString().split('T')[0]
  const todayJobs = bookings.filter(b => b.scheduled_date === today)

  const enrichedJobs = useMemo(() => {
    return todayJobs
      .filter(b => {
        if (filterStatus === 'all') return true
        return b.status === filterStatus
      })
      .filter(b => {
        const matchSearch = searchQuery === '' ||
          b.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.service_address.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.service_type.toLowerCase().includes(searchQuery.toLowerCase())
        return matchSearch
      })
      .map(b => ({
        ...b,
        assigned_crew: b.assigned_crew.map(id => {
          const emp = employees.find(e => e.id === id)
          return emp?.full_name || 'Unknown'
        }),
      }))
  }, [todayJobs, filterStatus, searchQuery, employees])

  const sorted = useMemo(() => {
    const copy = [...enrichedJobs]
    if (sortBy === 'time') return copy.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
    if (sortBy === 'client') return copy.sort((a, b) => a.client_name.localeCompare(b.client_name))
    if (sortBy === 'service') return copy.sort((a, b) => a.service_type.localeCompare(b.service_type))
    return copy
  }, [enrichedJobs, sortBy])

  const liveCount = enrichedJobs.filter(j => j.status === 'in_progress').length
  const pendingCount = enrichedJobs.filter(j => j.status === 'pending' || j.status === 'confirmed').length
  const completedCount = enrichedJobs.filter(j => j.status === 'completed').length
  const totalRevenue = enrichedJobs.reduce((s, j) => s + j.total_amount, 0)

  // Service breakdown
  const serviceBreakdown = enrichedJobs.reduce((acc, j) => {
    acc[j.service_type] = (acc[j.service_type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-4">

      <PageHero
        title="🗺️ Live Operations Map"
        subtitle={`Real-time job tracking · ${enrichedJobs.length} total · ${liveCount} active now`}
        statusChip={liveCount > 0 ? `🔴 ${liveCount} LIVE` : 'No active jobs'}
      />

      {/* Advanced KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: '🚗 Live', value: liveCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '⏳ Pending', value: pendingCount, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: '✓ Done', value: completedCount, color: 'text-slate-600', bg: 'bg-slate-50' },
          { label: '💰 Revenue', value: `AED ${(totalRevenue/1000).toFixed(1)}k`, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: '👥 Crew', value: new Set(enrichedJobs.flatMap(j => j.assigned_crew)).size, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} rounded-[16px] p-3.5 border border-[#E4E8EC]`}>
            <p className="text-[11px] text-slate-600 font-semibold">{card.label}</p>
            <p className={`text-2xl font-black ${card.color} mt-1`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left: Map (Smaller) + Filters */}
        <div className="lg:col-span-2 space-y-4">

          {/* Map Container - Reduced Height */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] overflow-hidden shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
            <div className="h-[280px]">
              <MapContainer center={DEFAULT_LOCATION} zoom={11} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                {enrichedJobs.map(job => <JobMarker key={job.id} job={job} status={job.status} />)}
              </MapContainer>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search jobs by client, address, service…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="text-[12px]">
                  <option value="all">📋 All Status</option>
                  <option value="in_progress">🔴 Live</option>
                  <option value="pending">⏳ Pending</option>
                  <option value="confirmed">✓ Confirmed</option>
                </Select>
                <Select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="text-[12px]">
                  <option value="time">⏰ By Time</option>
                  <option value="client">👤 By Client</option>
                  <option value="service">🧹 By Service</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Detailed Job List */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E4E8EC] bg-gradient-to-r from-slate-50 to-transparent">
              <h3 className="text-[15px] font-bold text-[#111827]">Job Details ({sorted.length})</h3>
            </div>
            {sorted.length === 0 ? (
              <p className="text-[13px] text-slate-400 text-center py-8">No jobs match your filters</p>
            ) : (
              <div className="divide-y divide-[#E4E8EC] max-h-[500px] overflow-y-auto">
                {sorted.map(job => (
                  <div key={job.id} className="p-4 hover:bg-slate-50/50 transition-colors border-l-4" style={{
                    borderLeftColor: job.status === 'in_progress' ? '#10b981' : job.status === 'confirmed' ? '#3b82f6' : '#94a3b8'
                  }}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-[13px] font-bold text-[#111827]">{job.client_name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{job.service_address}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        job.status === 'in_progress' ? 'bg-emerald-100 text-emerald-700' :
                        job.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {job.status === 'in_progress' ? '🔴 LIVE' : job.status === 'confirmed' ? '✓ CONFIRMED' : '⏳ PENDING'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div>📌 <span className="font-semibold">{job.service_type}</span> · {job.duration_hours}h</div>
                      <div>⏰ {job.scheduled_time} (AED {job.total_amount.toLocaleString()})</div>
                    </div>
                    {job.assigned_crew.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {job.assigned_crew.map((crew, i) => (
                          <span key={i} className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                            👤 {crew}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Sidebar: Advanced Stats & Breakdown */}
        <div className="space-y-4">

          {/* Service Type Breakdown */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <h3 className="text-[14px] font-bold text-[#111827] mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-600" />
              Service Mix
            </h3>
            {Object.entries(serviceBreakdown).length === 0 ? (
              <p className="text-[12px] text-slate-400">No services</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(serviceBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([service, count]) => (
                    <div key={service}>
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-[12px] font-semibold text-slate-700 truncate">{service}</p>
                        <span className="text-[11px] font-bold text-emerald-600">{count} jobs</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
                          style={{ width: `${(count / enrichedJobs.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-[22px] border border-emerald-200 p-5">
            <h3 className="text-[14px] font-bold text-emerald-900 mb-3 flex items-center gap-2">
              <Zap size={16} className="text-emerald-600" />
              Live Efficiency
            </h3>
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-emerald-700">Avg Service Duration</span>
                <span className="font-bold text-emerald-900">{enrichedJobs.length > 0 ? (enrichedJobs.reduce((s, j) => s + j.duration_hours, 0) / enrichedJobs.length).toFixed(1) : 0}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-700">Completion Rate</span>
                <span className="font-bold text-emerald-900">{enrichedJobs.length > 0 ? Math.round((completedCount / enrichedJobs.length) * 100) : 0}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-700">Active Crew</span>
                <span className="font-bold text-emerald-900">{new Set(enrichedJobs.filter(j => j.status === 'in_progress').flatMap(j => j.assigned_crew)).size} on job</span>
              </div>
            </div>
          </div>

          {/* Route Tips */}
          <div className="bg-amber-50 rounded-[22px] border border-amber-200 p-5">
            <h3 className="text-[14px] font-bold text-amber-900 mb-3 flex items-center gap-2">
              <Navigation size={16} className="text-amber-600" />
              Route Tips
            </h3>
            <p className="text-[12px] text-amber-800 leading-relaxed">
              💡 Sort by <strong>Time</strong> for optimal sequencing · Click map markers for details · Use search to find specific jobs
            </p>
          </div>

          {/* Legend */}
          <div className="bg-slate-50 rounded-[22px] border border-slate-200 p-4">
            <h3 className="text-[12px] font-bold text-slate-700 mb-2.5">Map Legend</h3>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
                <span className="text-slate-600">Live / In Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white" />
                <span className="text-slate-600">Pending / Confirmed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-400" />
                <span className="text-slate-600">Completed</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  )
}
