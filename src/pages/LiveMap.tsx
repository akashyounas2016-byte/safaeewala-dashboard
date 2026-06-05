import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet'
import { Icon } from 'leaflet'
import { MapPin, Truck, Clock, CheckCircle, Phone, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
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
  const size = isLive ? 35 : isPending ? 30 : 25

  const crewName = job.assigned_crew.length > 0
    ? job.assigned_crew[0].split('-')[0]
    : 'Unassigned'

  return (
    <CircleMarker
      center={coords}
      radius={size / 2}
      pathOptions={{
        fillColor: color,
        color: color,
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.8,
      }}
    >
      <Popup>
        <div className="w-48">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-sm text-[#111827]">{job.client_name}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              isLive ? 'bg-emerald-100 text-emerald-700' :
              isPending ? 'bg-blue-100 text-blue-700' :
              'bg-slate-100 text-slate-700'
            }`}>
              {status}
            </span>
          </div>
          <p className="text-xs text-slate-600 mb-2">{job.service_type} · {job.duration_hours}h</p>
          <p className="text-xs text-slate-500 mb-2">{job.service_address}</p>
          <div className="flex items-center gap-1 text-xs text-slate-600 mb-3">
            <Truck size={12} />
            <span>{crewName}</span>
          </div>
          <div className="flex gap-2">
            {job.client_phone && (
              <a href={`tel:${job.client_phone}`}>
                <Button size="sm" variant="outline" className="flex items-center gap-1 text-xs">
                  <Phone size={12} /> Call
                </Button>
              </a>
            )}
            {job.client_phone && (
              <a href={`https://wa.me/${job.client_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="flex items-center gap-1 text-xs bg-green-50">
                  <MessageCircle size={12} /> Chat
                </Button>
              </a>
            )}
          </div>
        </div>
      </Popup>
    </CircleMarker>
  )
}

export function LiveMap() {
  const { bookings, employees } = useData()
  const [filterStatus, setFilterStatus] = useState<'all' | 'in_progress' | 'pending' | 'confirmed'>('all')
  const [filterCrew, setFilterCrew] = useState('all')

  const today = new Date().toISOString().split('T')[0]
  const todayJobs = bookings
    .filter(b => b.scheduled_date === today)

  const enrichedJobs = useMemo(() => {
    return todayJobs
      .filter(b => {
        if (filterStatus === 'all') return true
        return b.status === filterStatus
      })
      .filter(b => {
        if (filterCrew === 'all') return true
        return b.assigned_crew.length > 0
      })
      .map(b => ({
        ...b,
        assigned_crew: b.assigned_crew.map(id => {
          const emp = employees.find(e => e.id === id)
          return emp?.full_name || 'Unknown'
        }),
      }))
  }, [todayJobs, filterStatus, filterCrew, employees])

  const liveCount = enrichedJobs.filter(j => j.status === 'in_progress').length
  const pendingCount = enrichedJobs.filter(j => j.status === 'pending' || j.status === 'confirmed').length
  const completedCount = enrichedJobs.filter(j => j.status === 'completed').length

  // Calculate route sequence
  const routeSequence = enrichedJobs
    .filter(j => j.status === 'in_progress' || j.status === 'pending' || j.status === 'confirmed')
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))

  return (
    <div className="space-y-6 h-full">

      <PageHero
        title="Live Map"
        subtitle={`${enrichedJobs.length} jobs today · ${liveCount} live · ${pendingCount} pending`}
        statusChip={`${liveCount} Active`}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Live Now', value: liveCount, icon: Truck, bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Pending', value: pendingCount, icon: Clock, bg: 'bg-blue-50', color: 'text-blue-600' },
          { label: 'Completed', value: completedCount, icon: CheckCircle, bg: 'bg-slate-50', color: 'text-slate-600' },
        ].map(card => (
          <div key={card.label} className={`rounded-[20px] border border-[#E4E8EC] ${card.bg} p-4 flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
              <card.icon size={18} className={card.color} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#111827]">{card.value}</p>
              <p className="text-[12px] text-slate-500">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">

        {/* Map */}
        <div className="lg:col-span-3 bg-white rounded-[22px] border border-[#E4E8EC] overflow-hidden shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
          <div className="h-[500px] lg:h-[600px]">
            <MapContainer
              center={DEFAULT_LOCATION}
              zoom={11}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              {enrichedJobs.map(job => (
                <JobMarker key={job.id} job={job} status={job.status} />
              ))}
            </MapContainer>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">

          {/* Filters */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <h3 className="text-[14px] font-bold text-[#111827] mb-3">Filters</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 uppercase">Status</label>
                <Select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value as any)}
                  className="text-[12px] mt-1"
                >
                  <option value="all">All Jobs</option>
                  <option value="in_progress">Live Only</option>
                  <option value="pending">Pending Only</option>
                  <option value="confirmed">Confirmed Only</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Route Sequence */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <h3 className="text-[14px] font-bold text-[#111827] mb-3 flex items-center gap-2">
              <MapPin size={16} />
              Route Sequence
            </h3>
            {routeSequence.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-4">No jobs to route</p>
            ) : (
              <div className="space-y-2">
                {routeSequence.map((job, i) => (
                  <div
                    key={job.id}
                    className={`text-[12px] p-3 rounded-lg border-l-4 flex items-start gap-2 ${
                      job.status === 'in_progress'
                        ? 'bg-emerald-50 border-l-emerald-500'
                        : 'bg-blue-50 border-l-blue-500'
                    }`}
                  >
                    <span className="text-[11px] font-bold text-slate-500 shrink-0 w-5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#111827] truncate">{job.client_name}</p>
                      <p className="text-[11px] text-slate-500">{job.service_type}</p>
                      <p className="text-[10px] text-slate-400">{job.scheduled_time}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                      job.status === 'in_progress' ? 'bg-emerald-200 text-emerald-700' : 'bg-blue-200 text-blue-700'
                    }`}>
                      {job.status === 'in_progress' ? '🔴' : '⏳'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-3 italic">
              💡 Sequence based on scheduled time for optimal routing
            </p>
          </div>

          {/* Legend */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <h3 className="text-[14px] font-bold text-[#111827] mb-3">Map Legend</h3>
            <div className="space-y-2 text-[12px]">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-500" />
                <span className="text-slate-600">Live (In Progress)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500" />
                <span className="text-slate-600">Pending/Confirmed</span>
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
