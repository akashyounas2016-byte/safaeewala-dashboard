import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarPlus, CalendarClock, MessageCircle, UserPlus } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { useData } from '@/store/DataContext'
import { todayDubai } from '@/lib/dubaiTime'
import { formatWaNumber, type WaConversation } from '@/lib/whatsapp'
import { toWaId } from '@/lib/whatsappModules'
import { aed } from './WaShared'
import { timeOf } from './WaChat'

/**
 * R-WA-02 Jobs: the CRM's own bookings for clients who chat on WhatsApp — no second job list.
 * New jobs are made with the normal booking form (opened with the client filled in).
 */
export function WaJobs({ convs, onOpenChat }: { convs: WaConversation[]; onOpenChat: (conversationId: string) => void }) {
  const { bookings } = useData()
  const today = todayDubai()

  const { jobs, leads } = useMemo(() => {
    const byClient = new Map(convs.filter(c => c.client_id).map(c => [c.client_id!, c]))
    const byTail = new Map(convs.map(c => [c.wa_id.slice(-9), c]))
    const convOf = (b: { client_id?: string; client_phone?: string }) => (b.client_id && byClient.get(b.client_id)) || (b.client_phone ? byTail.get(toWaId(b.client_phone).slice(-9)) : undefined)
    const jobs = bookings.map(b => ({ b, conv: convOf(b) })).filter(x => x.conv)
    const booked = new Set(jobs.map(x => x.conv!.id))
    const since = Date.now() - 30 * 86400000
    const leads = convs.filter(c => !booked.has(c.id) && c.last_inbound_at && new Date(c.last_inbound_at).getTime() > since)
    return { jobs, leads }
  }, [bookings, convs])

  const upcoming = jobs.filter(x => x.b.scheduled_date >= today && x.b.status !== 'cancelled' && x.b.status !== 'completed')
    .sort((a, b) => `${a.b.scheduled_date}${a.b.scheduled_time}`.localeCompare(`${b.b.scheduled_date}${b.b.scheduled_time}`))
  const month = today.slice(0, 7)
  const doneMonth = jobs.filter(x => x.b.status === 'completed' && x.b.scheduled_date.startsWith(month))
  const bookingLink = (c: WaConversation) => `/bookings?new=1${c.client_id ? `&client=${encodeURIComponent(c.client_id)}` : ''}&name=${encodeURIComponent(c.name || '')}&phone=${encodeURIComponent('+' + c.wa_id)}`

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Upcoming jobs" value={upcoming.length} sub="clients who chat on WhatsApp" icon={CalendarClock} labelColor="text-sky-700" iconSolid="bg-[#0284c7] shadow-sky-500/25" />
        <KpiCard label="Today" value={upcoming.filter(x => x.b.scheduled_date === today).length} sub={today} icon={CalendarCheck} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" />
        <KpiCard label="Completed this month" value={doneMonth.length} sub={aed(doneMonth.reduce((s, x) => s + (Number(x.b.total_amount) || 0), 0))} icon={CalendarCheck} labelColor="text-violet-700" iconSolid="bg-[#7c3aed] shadow-violet-500/25" />
        <KpiCard label="Chats without a booking" value={leads.length} sub="wrote in the last 30 days" icon={UserPlus} labelColor="text-amber-700" iconSolid="bg-[#d97706] shadow-amber-500/25" />
      </div>

      <section className="bg-white border border-[#E2E5E0] rounded-[22px] overflow-hidden">
        <header className="px-5 py-3.5 border-b border-[#E2E5E0] text-[14px] font-bold text-[#111827]">Upcoming jobs</header>
        {upcoming.length === 0 ? <p className="p-6 text-center text-[12.5px] text-slate-400">No upcoming bookings for WhatsApp clients.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-[#0F1F19] text-white/90 text-left"><tr>{['Date', 'Time', 'Client', 'Service', 'Status', 'Amount', ''].map(h => <th key={h} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {upcoming.slice(0, 100).map(({ b, conv }) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap font-semibold">{b.scheduled_date}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{b.scheduled_time}</td>
                    <td className="px-4 py-2.5">{b.client_name}</td>
                    <td className="px-4 py-2.5">{b.service_type}</td>
                    <td className="px-4 py-2.5 capitalize">{String(b.status).replace('_', ' ')}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{aed(b.total_amount)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        <button type="button" onClick={() => onOpenChat(conv!.id)} title="Open chat" className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 cursor-pointer"><MessageCircle size={14} /></button>
                        <Link to={`/bookings?booking=${encodeURIComponent(b.id)}`} className="text-[12px] font-bold text-emerald-700 hover:underline px-1.5 py-1">Open</Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border border-[#E2E5E0] rounded-[22px] overflow-hidden">
        <header className="px-5 py-3.5 border-b border-[#E2E5E0] text-[14px] font-bold text-[#111827]">Chats without a booking <span className="text-[12px] font-semibold text-slate-400">· turn an enquiry into a job</span></header>
        {leads.length === 0 ? <p className="p-6 text-center text-[12.5px] text-slate-400">Every recent chat already has a booking.</p> : (
          <ul className="divide-y divide-slate-100">
            {leads.slice(0, 50).map(c => (
              <li key={c.id} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#111827] truncate">{c.name || formatWaNumber(c.wa_id)}</p>
                  <p className="text-[11.5px] text-slate-500 truncate">{timeOf(c.last_message_at)} · {c.last_message_preview}</p>
                </div>
                <button type="button" onClick={() => onOpenChat(c.id)} title="Open chat" className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-700 cursor-pointer"><MessageCircle size={15} /></button>
                <Link to={bookingLink(c)} className="flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"><CalendarPlus size={13} /> Book</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
