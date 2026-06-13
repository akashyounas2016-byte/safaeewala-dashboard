import { useState, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, MessageCircle, Mail,
  DollarSign, Clock, Users, TrendingUp, MapPin, Phone,
  LayoutGrid, List, AlignJustify, Pencil, X, Check,
} from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'

const VAT_RATE = 0.05

function getDayName(dateStr: string) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { weekday: 'short' })
}
function shortDate(dateStr: string) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function calcEndTime(startTime: string, durationHours: number): string {
  if (!startTime || !startTime.includes(':')) return '—'
  const [h, m] = startTime.split(':').map(Number)
  const totalMins = h * 60 + m + Math.round(durationHours * 60)
  const eh = Math.floor(totalMins / 60) % 24
  const em = totalMins % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

type ViewMode = 'card' | 'table' | 'compact'

interface Visit {
  id: string
  date: string
  day: string
  address: string
  startTime: string
  endTime: string
  hours: number
  amount: number
  remarks: string
}
interface ClientStatement {
  clientName: string
  clientPhone: string
  address: string
  visits: Visit[]
  totalHours: number
  subtotal: number
  ratePerHour: number
  vatAmount: number
  grandTotal: number
}

export function MonthlyInvoices() {
  const { bookings, clients, updateBooking } = useData()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [viewMode, setViewMode]           = useState<ViewMode>('card')
  const [editVisit, setEditVisit]         = useState<(Visit & { clientName: string }) | null>(null)

  const monthKey   = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const prevMonth = () => { const d = new Date(selectedMonth); d.setMonth(d.getMonth() - 1); setSelectedMonth(d) }
  const nextMonth = () => { const d = new Date(selectedMonth); d.setMonth(d.getMonth() + 1); setSelectedMonth(d) }

  const statements = useMemo<ClientStatement[]>(() => {
    const mb = bookings.filter(b =>
      b.scheduled_date?.startsWith(monthKey) &&
      (b.status === 'completed' || b.status === 'confirmed')
    )
    const grouped: Record<string, typeof mb> = {}
    for (const b of mb) {
      if (!grouped[b.client_name]) grouped[b.client_name] = []
      grouped[b.client_name].push(b)
    }
    return Object.entries(grouped).map(([clientName, visits]) => {
      const sorted     = [...visits].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      const totalHours = sorted.reduce((s, v) => s + (v.duration_hours || 0), 0)
      const subtotal   = sorted.reduce((s, v) => s + (v.total_amount || 0), 0)
      const vatAmount  = subtotal * VAT_RATE
      return {
        clientName,
        clientPhone: sorted[0]?.client_phone || '',
        address: sorted[0]?.service_address || '',
        visits: sorted.map(v => ({
          id:        v.id,
          date:      v.scheduled_date,
          day:       getDayName(v.scheduled_date),
          address:   v.service_address,
          startTime: v.scheduled_time || '',
          endTime:   calcEndTime(v.scheduled_time || '', v.duration_hours || 0),
          hours:     v.duration_hours || 0,
          amount:    v.total_amount || 0,
          remarks:   v.notes || '',
        })),
        totalHours,
        subtotal,
        ratePerHour: totalHours > 0 ? subtotal / totalHours : 0,
        vatAmount,
        grandTotal: subtotal + vatAmount,
      }
    }).sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [bookings, monthKey])

  const totalRevenue = statements.reduce((s, c) => s + c.grandTotal, 0)
  const totalHours   = statements.reduce((s, c) => s + c.totalHours, 0)
  const totalVAT     = statements.reduce((s, c) => s + c.vatAmount, 0)

  const sendWhatsApp = (s: ClientStatement) => {
    const client = clients.find(c => c.full_name.toLowerCase() === s.clientName.toLowerCase())
    const phone  = (client?.whatsapp || client?.phone || s.clientPhone || '').replace(/\D/g, '')
    const lines  = s.visits.map((v, i) =>
      `${i + 1}. ${shortDate(v.date)} (${v.day})${v.startTime ? ` ${v.startTime}–${v.endTime}` : ''} — ${v.hours}h${v.remarks ? ` | ${v.remarks}` : ''}`
    ).join('\n')
    const msg = [`Dear ${s.clientName},`, '', `*🧹 Safaeewala LLC — Monthly Statement*`, `*Period: ${monthLabel}*`, `*Address: ${s.address}*`, '', `*Service Visits:*`, lines, '', `Total Hours: ${s.totalHours}h`, `Rate: AED ${s.ratePerHour.toFixed(0)}/hr`, `Subtotal: AED ${s.subtotal.toFixed(2)}`, `VAT (5%): AED ${s.vatAmount.toFixed(2)}`, `*Total: AED ${s.grandTotal.toFixed(2)}*`, '', `Thank you! 🙏`, `Safaeewala LLC · +971 55 628 2374`].join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const sendEmail = (s: ClientStatement) => {
    const client  = clients.find(c => c.full_name.toLowerCase() === s.clientName.toLowerCase())
    const email   = client?.email || ''
    const subject = `Safaeewala — Monthly Statement ${monthLabel}`
    const lines   = s.visits.map((v, i) => `${i + 1}. ${shortDate(v.date)} (${v.day}) ${v.startTime ? `${v.startTime}-${v.endTime}` : ''} — ${v.hours}h`).join('%0A')
    const body    = `Dear ${s.clientName},%0A%0APeriod: ${monthLabel}%0AAddress: ${s.address}%0A%0AVisits:%0A${lines}%0A%0ATotal: AED ${s.grandTotal.toFixed(2)}%0A%0ASafaeewala LLC`
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${body}`
  }

  const handleSaveEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editVisit) return
    const f = new FormData(e.currentTarget)
    updateBooking(editVisit.id, {
      scheduled_date: f.get('date') as string,
      scheduled_time: f.get('startTime') as string,
      duration_hours: Number(f.get('hours')) || editVisit.hours,
      total_amount:   Number(f.get('amount')) || editVisit.amount,
      notes:          f.get('remarks') as string,
    })
    setEditVisit(null)
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Monthly Statements"
        subtitle={`${statements.length} clients · AED ${totalRevenue.toFixed(0)} total`}
        statusChip={`${totalHours}h worked`}
      />

      {/* Month Selector + View Toggle */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex items-center justify-between gap-4">
        <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronLeft size={20} className="text-slate-600" />
        </button>
        <p className="text-[20px] font-bold text-[#111827]">{monthLabel}</p>
        <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronRight size={20} className="text-slate-600" />
        </button>
        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 ml-auto shrink-0">
          {([
            { mode: 'card',    icon: LayoutGrid,    label: 'Card' },
            { mode: 'table',   icon: AlignJustify,  label: 'Table' },
            { mode: 'compact', icon: List,           label: 'Compact' },
          ] as const).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              title={label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                viewMode === mode ? 'bg-white text-[#111827] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: `AED ${totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Clients', value: statements.length,                icon: Users,      color: 'text-blue-600',    bg: 'bg-blue-50'   },
          { label: 'Total Hours',   value: `${totalHours}h`,                 icon: Clock,      color: 'text-violet-600',  bg: 'bg-violet-50' },
          { label: 'VAT Collected', value: `AED ${totalVAT.toFixed(0)}`,     icon: TrendingUp, color: 'text-amber-600',   bg: 'bg-amber-50'  },
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

      {/* Summary Table (always shown) */}
      {statements.length > 0 && (
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E4E8EC] bg-[#f8fafc]">
            <h3 className="text-[14px] font-bold text-[#111827]">{monthLabel} — Overview</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E4E8EC]">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">#</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Client / Address</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Visits</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Hours</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Send</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((s, i) => (
                  <tr key={s.clientName} className="border-b border-[#E4E8EC] hover:bg-[#f8fafc]">
                    <td className="px-4 py-3 text-[12px] text-slate-400 font-medium">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-semibold text-[#111827]">{s.clientName}</p>
                      <p className="text-[11px] text-slate-400">{s.address}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] text-slate-500">{s.visits.length}</td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-[#111827]">{s.totalHours}h</td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-emerald-600">AED {s.grandTotal.toFixed(0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => sendWhatsApp(s)} className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors" title="WhatsApp"><MessageCircle size={14} /></button>
                        <button onClick={() => sendEmail(s)} className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors" title="Email"><Mail size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View: CARD */}
      {viewMode === 'card' && (
        <div className="space-y-5">
          {statements.length === 0 ? (
            <EmptyState month={monthLabel} />
          ) : statements.map((s, idx) => (
            <div key={s.clientName} className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 flex items-start justify-between gap-4 border-b border-[#E4E8EC]"
                style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)' }}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-[14px] shrink-0"
                    style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }}>{idx + 1}</div>
                  <div>
                    <p className="text-[16px] font-bold text-[#111827]">{s.clientName}</p>
                    <div className="flex items-center gap-1 mt-0.5"><MapPin size={11} className="text-slate-400 shrink-0" /><p className="text-[12px] text-slate-500">{s.address}</p></div>
                    {s.clientPhone && <div className="flex items-center gap-1 mt-0.5"><Phone size={11} className="text-slate-400 shrink-0" /><p className="text-[11px] text-slate-400">{s.clientPhone}</p></div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => sendWhatsApp(s)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-semibold transition-colors shadow-sm"><MessageCircle size={14} /><span className="hidden sm:inline">WhatsApp</span></button>
                  <button onClick={() => sendEmail(s)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-semibold transition-colors shadow-sm"><Mail size={14} /><span className="hidden sm:inline">Email</span></button>
                </div>
              </div>
              {/* Visit Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-[#E4E8EC]">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 w-8">Sr#</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500">Date</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500">Day</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500">Start</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500">End</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500">Address</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500">Hours</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500">Amount</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500">Remarks</th>
                      <th className="px-4 py-3 text-center text-[11px] font-semibold text-slate-500">Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.visits.map((v, i) => (
                      <tr key={v.id} className={`border-b border-[#E4E8EC] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
                        <td className="px-4 py-3 text-[12px] text-slate-400 font-medium">{i + 1}</td>
                        <td className="px-4 py-3 text-[13px] text-[#111827] font-medium whitespace-nowrap">{shortDate(v.date)}</td>
                        <td className="px-4 py-3"><span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">{v.day}</span></td>
                        <td className="px-4 py-3 text-[12px] text-slate-600 whitespace-nowrap">{v.startTime || '—'}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-600 whitespace-nowrap">{v.endTime}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-500 max-w-[160px] truncate">{v.address}</td>
                        <td className="px-4 py-3 text-right text-[13px] font-semibold text-[#111827]">{v.hours}h</td>
                        <td className="px-4 py-3 text-right text-[13px] text-slate-600 whitespace-nowrap">AED {v.amount.toFixed(0)}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-400 max-w-[120px] truncate">{v.remarks || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setEditVisit({ ...v, clientName: s.clientName })}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Edit visit">
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Totals */}
              <div className="px-6 py-4 border-t border-[#E4E8EC] bg-[#f8fafc]">
                <div className="flex flex-wrap gap-x-8 gap-y-2 justify-end">
                  <div className="flex items-center gap-2"><span className="text-[12px] text-slate-500">T. Hours</span><span className="text-[13px] font-bold text-[#111827]">{s.totalHours}h</span></div>
                  <div className="flex items-center gap-2"><span className="text-[12px] text-slate-500">Rate</span><span className="text-[13px] font-bold text-[#111827]">AED {s.ratePerHour.toFixed(0)}/hr</span></div>
                  <div className="flex items-center gap-2"><span className="text-[12px] text-slate-500">Charges</span><span className="text-[13px] font-bold text-[#111827]">AED {s.subtotal.toFixed(2)}</span></div>
                  <div className="flex items-center gap-2"><span className="text-[12px] text-slate-500">VAT (5%)</span><span className="text-[13px] font-bold text-amber-600">AED {s.vatAmount.toFixed(2)}</span></div>
                  <div className="flex items-center gap-2 pl-4 border-l border-[#E4E8EC]"><span className="text-[13px] font-semibold text-slate-600">Total</span><span className="text-[16px] font-bold text-emerald-600">AED {s.grandTotal.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View: TABLE */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
          {statements.length === 0 ? <div className="py-16 text-center text-slate-400 text-[14px]">No data for {monthLabel}</div> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#E4E8EC]">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Sr#</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Day</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Start</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">End</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Address</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Hrs</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Remarks</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.flatMap((s, si) =>
                    s.visits.map((v, vi) => (
                      <tr key={v.id} className={`border-b border-[#E4E8EC] hover:bg-[#f8fafc] ${vi === 0 ? 'border-t-2 border-t-emerald-100' : ''}`}>
                        <td className="px-4 py-3 text-[12px] text-slate-400">{vi + 1}</td>
                        <td className="px-4 py-3">
                          {vi === 0 && <p className="text-[12px] font-semibold text-emerald-700">{s.clientName}</p>}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[#111827] font-medium whitespace-nowrap">{shortDate(v.date)}</td>
                        <td className="px-4 py-3"><span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">{v.day}</span></td>
                        <td className="px-4 py-3 text-[12px] text-slate-600">{v.startTime || '—'}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-600">{v.endTime}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-500 max-w-[140px] truncate">{v.address}</td>
                        <td className="px-4 py-3 text-right text-[12px] font-semibold text-[#111827]">{v.hours}h</td>
                        <td className="px-4 py-3 text-right text-[12px] text-slate-600">AED {v.amount.toFixed(0)}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-400 max-w-[120px] truncate">{v.remarks || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setEditVisit({ ...v, clientName: s.clientName })} className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"><Pencil size={13} /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* View: COMPACT */}
      {viewMode === 'compact' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {statements.length === 0 ? <EmptyState month={monthLabel} /> : statements.map((s, idx) => (
            <div key={s.clientName} className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-[13px] shrink-0"
                  style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }}>{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-[#111827] truncate">{s.clientName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{s.address}</p>
                </div>
              </div>
              {/* Mini visit list */}
              <div className="space-y-1.5 mb-4">
                {s.visits.map((v, i) => (
                  <div key={v.id} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-400 shrink-0">{i + 1}.</span>
                      <span className="text-[#111827] font-medium whitespace-nowrap">{shortDate(v.date)}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{v.day}</span>
                      {v.startTime && <span className="text-slate-400">{v.startTime}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-500">{v.hours}h</span>
                      <button onClick={() => setEditVisit({ ...v, clientName: s.clientName })} className="p-1 rounded hover:bg-emerald-50 text-slate-300 hover:text-emerald-600 transition-colors"><Pencil size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min((s.totalHours / 60) * 100, 100)}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500">{s.totalHours}h · {s.visits.length} visits</p>
                  <p className="text-[15px] font-bold text-emerald-600">AED {s.grandTotal.toFixed(0)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => sendWhatsApp(s)} className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"><MessageCircle size={15} /></button>
                  <button onClick={() => sendEmail(s)} className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"><Mail size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Visit Modal */}
      <Modal open={!!editVisit} onClose={() => setEditVisit(null)} title="Edit Visit" size="md">
        {editVisit && (
          <form className="space-y-4" onSubmit={handleSaveEdit}>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <p className="text-[12px] font-semibold text-emerald-700">{editVisit.clientName}</p>
              <p className="text-[11px] text-emerald-600">{editVisit.address}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input name="date" label="Date" type="date" defaultValue={editVisit.date} required />
              <Input name="startTime" label="Start Time" type="time" defaultValue={editVisit.startTime} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input name="hours" label="Duration (Hours)" type="number" min="0.5" max="24" step="0.5" defaultValue={String(editVisit.hours)} />
              <Input name="amount" label="Amount (AED)" type="number" min="0" step="0.01" defaultValue={String(editVisit.amount)} />
            </div>
            <Textarea name="remarks" label="Remarks" defaultValue={editVisit.remarks} rows={2} placeholder="Any notes or remarks…" />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditVisit(null)}>
                <X size={14} className="mr-1" /> Cancel
              </Button>
              <Button type="submit" className="flex-1">
                <Check size={14} className="mr-1" /> Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

function EmptyState({ month }: { month: string }) {
  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-12 text-center col-span-full">
      <p className="text-slate-400 text-[14px]">No completed bookings found for {month}</p>
    </div>
  )
}
