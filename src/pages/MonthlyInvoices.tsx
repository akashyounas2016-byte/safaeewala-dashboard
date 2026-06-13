import { useState, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, MessageCircle, Mail,
  DollarSign, Clock, Users, TrendingUp, MapPin, Phone,
} from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { formatCurrency } from '@/lib/utils'

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

interface ClientStatement {
  clientName: string
  clientPhone: string
  address: string
  visits: { date: string; day: string; address: string; hours: number; amount: number }[]
  totalHours: number
  subtotal: number
  ratePerHour: number
  vatAmount: number
  grandTotal: number
}

export function MonthlyInvoices() {
  const { bookings, clients } = useData()
  const [selectedMonth, setSelectedMonth] = useState(new Date())

  const monthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    const d = new Date(selectedMonth); d.setMonth(d.getMonth() - 1); setSelectedMonth(d)
  }
  const nextMonth = () => {
    const d = new Date(selectedMonth); d.setMonth(d.getMonth() + 1); setSelectedMonth(d)
  }

  // Group completed bookings for the month by client
  const statements = useMemo<ClientStatement[]>(() => {
    const monthBookings = bookings.filter(b =>
      b.scheduled_date?.startsWith(monthKey) &&
      (b.status === 'completed' || b.status === 'confirmed')
    )

    const grouped: Record<string, typeof monthBookings> = {}
    for (const b of monthBookings) {
      const key = b.client_name
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(b)
    }

    return Object.entries(grouped)
      .map(([clientName, visits]) => {
        const sorted = [...visits].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
        const totalHours = sorted.reduce((s, v) => s + (v.duration_hours || 0), 0)
        const subtotal = sorted.reduce((s, v) => s + (v.total_amount || 0), 0)
        const ratePerHour = totalHours > 0 ? subtotal / totalHours : 0
        const vatAmount = subtotal * VAT_RATE
        const grandTotal = subtotal + vatAmount
        return {
          clientName,
          clientPhone: sorted[0]?.client_phone || '',
          address: sorted[0]?.service_address || '',
          visits: sorted.map(v => ({
            date: v.scheduled_date,
            day: getDayName(v.scheduled_date),
            address: v.service_address,
            hours: v.duration_hours || 0,
            amount: v.total_amount || 0,
          })),
          totalHours,
          subtotal,
          ratePerHour,
          vatAmount,
          grandTotal,
        }
      })
      .sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [bookings, monthKey])

  const totalRevenue   = statements.reduce((s, c) => s + c.grandTotal, 0)
  const totalHours     = statements.reduce((s, c) => s + c.totalHours, 0)
  const totalClients   = statements.length
  const totalVAT       = statements.reduce((s, c) => s + c.vatAmount, 0)

  const sendWhatsApp = (s: ClientStatement) => {
    const client = clients.find(c => c.full_name.toLowerCase() === s.clientName.toLowerCase())
    const phone  = (client?.whatsapp || client?.phone || s.clientPhone || '').replace(/\D/g, '')
    const lines  = s.visits.map((v, i) =>
      `${i + 1}. ${shortDate(v.date)} (${v.day}) — ${v.hours}h`
    ).join('\n')

    const msg = [
      `Dear ${s.clientName},`,
      ``,
      `*🧹 Safaeewala LLC — Monthly Statement*`,
      `*Period: ${monthLabel}*`,
      `*Address: ${s.address}*`,
      ``,
      `*Service Visits:*`,
      lines,
      ``,
      `Total Hours: ${s.totalHours}h`,
      `Rate: AED ${s.ratePerHour.toFixed(0)}/hr`,
      `Subtotal: AED ${s.subtotal.toFixed(2)}`,
      `VAT (5%): AED ${s.vatAmount.toFixed(2)}`,
      `*Total: AED ${s.grandTotal.toFixed(2)}*`,
      ``,
      `Thank you for your continued trust! 🙏`,
      `Safaeewala LLC · +971 55 628 2374`,
    ].join('\n')

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const sendEmail = (s: ClientStatement) => {
    const client  = clients.find(c => c.full_name.toLowerCase() === s.clientName.toLowerCase())
    const email   = client?.email || ''
    const subject = `Safaeewala — Monthly Statement ${monthLabel}`
    const lines   = s.visits.map((v, i) =>
      `${i + 1}. ${shortDate(v.date)} (${v.day}) — ${v.hours}h`
    ).join('%0A')

    const body = [
      `Dear ${s.clientName},%0A`,
      `Please find your monthly service statement below.%0A`,
      `Period: ${monthLabel}%0A`,
      `Address: ${s.address}%0A%0A`,
      `Service Visits:%0A${lines}%0A%0A`,
      `Total Hours: ${s.totalHours}h%0A`,
      `Rate: AED ${s.ratePerHour.toFixed(0)}/hr%0A`,
      `Subtotal: AED ${s.subtotal.toFixed(2)}%0A`,
      `VAT (5%): AED ${s.vatAmount.toFixed(2)}%0A`,
      `Total: AED ${s.grandTotal.toFixed(2)}%0A%0A`,
      `Thank you for choosing Safaeewala!%0A`,
      `Safaeewala LLC · +971 55 628 2374`,
    ].join('')

    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${body}`
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Monthly Statements"
        subtitle={`${totalClients} clients · AED ${totalRevenue.toFixed(2)} total`}
        statusChip={`${totalHours}h worked`}
      />

      {/* Month Selector */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronLeft size={20} className="text-slate-600" />
        </button>
        <p className="text-[20px] font-bold text-[#111827]">{monthLabel}</p>
        <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronRight size={20} className="text-slate-600" />
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: `AED ${totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Clients', value: totalClients,                      icon: Users,      color: 'text-blue-600',    bg: 'bg-blue-50'   },
          { label: 'Total Hours',   value: `${totalHours}h`,                  icon: Clock,      color: 'text-violet-600',  bg: 'bg-violet-50' },
          { label: 'VAT Collected', value: `AED ${totalVAT.toFixed(0)}`,      icon: TrendingUp, color: 'text-amber-600',   bg: 'bg-amber-50'  },
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

      {/* Summary Status Table */}
      {statements.length > 0 && (
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E4E8EC] bg-[#f8fafc]">
            <h3 className="text-[14px] font-bold text-[#111827]">{monthLabel} — Clients Overview</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E4E8EC]">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">#</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Client / Address</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Hours</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Visits</th>
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
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-[#111827]">{s.totalHours}h</td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-emerald-600">AED {s.grandTotal.toFixed(0)}</td>
                    <td className="px-4 py-3 text-right text-[12px] text-slate-500">{s.visits.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => sendWhatsApp(s)}
                          className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
                          title="Send WhatsApp"
                        >
                          <MessageCircle size={14} />
                        </button>
                        <button
                          onClick={() => sendEmail(s)}
                          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                          title="Send Email"
                        >
                          <Mail size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-Client Statement Cards */}
      {statements.length === 0 ? (
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-12 text-center">
          <p className="text-slate-400 text-[14px]">No completed bookings found for {monthLabel}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {statements.map((s, idx) => (
            <ClientStatementCard
              key={s.clientName}
              statement={s}
              index={idx + 1}
              monthLabel={monthLabel}
              onWhatsApp={() => sendWhatsApp(s)}
              onEmail={() => sendEmail(s)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ClientStatementCard({
  statement: s, index, monthLabel, onWhatsApp, onEmail,
}: {
  statement: ClientStatement
  index: number
  monthLabel: string
  onWhatsApp: () => void
  onEmail: () => void
}) {
  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      {/* Card Header */}
      <div className="px-6 py-4 flex items-start justify-between gap-4 border-b border-[#E4E8EC]"
        style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)' }}>
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-[14px] shrink-0"
            style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }}
          >
            {index}
          </div>
          <div>
            <p className="text-[16px] font-bold text-[#111827]">{s.clientName}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin size={11} className="text-slate-400 shrink-0" />
              <p className="text-[12px] text-slate-500">{s.address}</p>
            </div>
            {s.clientPhone && (
              <div className="flex items-center gap-1 mt-0.5">
                <Phone size={11} className="text-slate-400 shrink-0" />
                <p className="text-[11px] text-slate-400">{s.clientPhone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onWhatsApp}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-semibold transition-colors shadow-sm"
          >
            <MessageCircle size={14} />
            <span className="hidden sm:inline">WhatsApp</span>
          </button>
          <button
            onClick={onEmail}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-semibold transition-colors shadow-sm"
          >
            <Mail size={14} />
            <span className="hidden sm:inline">Email</span>
          </button>
        </div>
      </div>

      {/* Visits Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#E4E8EC]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 w-10">Sr#</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500">Date</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500">Day</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500">Address / Apt</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500">Hours</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.visits.map((v, i) => (
              <tr key={i} className={`border-b border-[#E4E8EC] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
                <td className="px-4 py-3 text-[12px] text-slate-400 font-medium">{i + 1}</td>
                <td className="px-4 py-3 text-[13px] text-[#111827] font-medium">{shortDate(v.date)}</td>
                <td className="px-4 py-3">
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">{v.day}</span>
                </td>
                <td className="px-4 py-3 text-[12px] text-slate-500">{v.address}</td>
                <td className="px-4 py-3 text-right text-[13px] font-semibold text-[#111827]">{v.hours}h</td>
                <td className="px-4 py-3 text-right text-[13px] text-slate-600">AED {v.amount.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      <div className="px-6 py-4 border-t border-[#E4E8EC] bg-[#f8fafc]">
        <div className="flex flex-wrap gap-x-8 gap-y-2 justify-end">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">T. Hours</span>
            <span className="text-[13px] font-bold text-[#111827]">{s.totalHours}h</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">Rate</span>
            <span className="text-[13px] font-bold text-[#111827]">AED {s.ratePerHour.toFixed(0)}/hr</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">Charges</span>
            <span className="text-[13px] font-bold text-[#111827]">AED {s.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">VAT (5%)</span>
            <span className="text-[13px] font-bold text-amber-600">AED {s.vatAmount.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2 pl-4 border-l border-[#E4E8EC]">
            <span className="text-[13px] font-semibold text-slate-600">Total</span>
            <span className="text-[16px] font-bold text-emerald-600">AED {s.grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
