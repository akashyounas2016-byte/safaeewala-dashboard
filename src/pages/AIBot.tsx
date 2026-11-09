import { useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot, Send, Search, CalendarPlus, UserCheck, Users, Clock, Receipt, MessageSquareWarning, Package, ShieldAlert, Sparkles,
  CalendarCheck, FileText, ClipboardList, Megaphone, X, Phone, Building2, KeyRound,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { NewBookingModal } from '@/components/bookings/NewBookingModal'
import { useData } from '@/store/DataContext'
import { useLayout } from '@/components/layout/Layout'
import { todayDubai } from '@/lib/dubaiTime'
import { formatDate, daysUntil, DOC_ALERT_DAYS } from '@/lib/utils'
import { safeLocalStorageGet } from '@/lib/storageUtils'
import { askCRMAIBot, analyzeCRMHealth, type AIChatMessage } from '@/lib/crmAIBot'
import { employeeDocAlerts } from '@/lib/alerts'
import { loadComplaints, complaintSummary } from '@/lib/complaints'
import { cleanerSnapshot, employeeInQuestion, hubSearch, monthStaffHours, splitStaff, wantsBooking, type HubHit } from '@/lib/aiHub'
import type { Employee } from '@/types'

/**
 * R-AI-01: AI Bot — a full-width hub, the CRM's "central brain".
 *  - Ask: answers from the CRM's own data (OT, revenue, pending, duplicates, staff, a named cleaner) and opens the
 *    booking form when asked to book. An AI model (Claude) is added later; until its key is on the server the
 *    answers come from fixed rules.
 *  - Quick actions, live cards from every module (jobs, cleaners, OT, money, complaints, stock, documents),
 *    one search across cleaners / clients / bookings / invoices, cleaner info and the month's OT table.
 */
const card = 'bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]'
const SUGGEST = ['Who has the most OT this month?', 'How much is pending?', "Today's revenue", 'Check duplicate bookings', 'New booking']

/** **bold** and new lines, nothing else */
function Rich({ text }: { text: string }) {
  return <>{text.split('\n').map((line, i) => <p key={i} className="min-h-[0.6em]">{line.split(/(\*\*[^*]+\*\*)/g).map((p, k) => p.startsWith('**') ? <b key={k}>{p.slice(2, -2)}</b> : p.replace(/^\*(.*)\*$/, '$1'))}</p>)}</>
}

export function AIBot() {
  const { bookings, clients, dailyJobs, invoices, employees, inventory, addBooking } = useData()
  const { openAIBot } = useLayout()
  const navigate = useNavigate()
  const today = todayDubai()
  const month = today.slice(0, 7)
  const [msgs, setMsgs] = useState<AIChatMessage[]>([])
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [booking, setBooking] = useState(false)
  const [cleaner, setCleaner] = useState<Employee | null>(null)
  const [openComplaints, setOpenComplaints] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { loadComplaints().then(l => setOpenComplaints(l ? complaintSummary(l).open : null)).catch(() => setOpenComplaints(null)) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  // ── live figures from every module ──
  const todayJobs = useMemo(() => dailyJobs.filter(j => j.date === today), [dailyJobs, today])
  const activeStaff = useMemo(() => employees.filter(e => e.status !== 'inactive'), [employees])
  const workingToday = useMemo(() => new Set(todayJobs.flatMap(j => splitStaff(j.staff_name).map(n => n.toLowerCase()))), [todayJobs])
  const available = activeStaff.filter(e => !workingToday.has(e.full_name.toLowerCase()))
  const otRows = useMemo(() => monthStaffHours(dailyJobs, month), [dailyJobs, month])
  const otTotal = Math.round(otRows.reduce((s, r) => s + r.ot, 0) * 10) / 10
  const unpaid = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const unpaidAmt = unpaid.reduce((s, i) => s + (Number(i.total) || 0) - (Number(i.amount_paid) || 0), 0)
  const lowStock = inventory.filter(i => i.current_stock <= i.min_stock).length
  const docAlerts = useMemo(() => employeeDocAlerts(employees).length, [employees])
  const health = useMemo(() => analyzeCRMHealth(bookings, clients), [bookings, clients])
  const hits = useMemo(() => hubSearch(q, { employees, clients, bookings, invoices }), [q, employees, clients, bookings, invoices])
  const snap = useMemo(() => (cleaner ? cleanerSnapshot(cleaner, dailyJobs, today) : null), [cleaner, dailyJobs, today])

  const ask = (text?: string) => {
    const question = (text ?? input).trim()
    if (!question) return
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const user: AIChatMessage = { id: `u-${Date.now()}`, sender: 'user', text: question, timestamp: t }
    let reply: AIChatMessage
    const emp = employeeInQuestion(question, employees)
    if (wantsBooking(question)) {
      setBooking(true)
      reply = { id: `a-${Date.now()}`, sender: 'ai', text: '📅 The **Add Job** form is open — fill the cleaner, address and time, then **Save Booking**. It is added to Bookings and the Daily Job Sheet.', timestamp: t }
    } else if (emp) {
      const s = cleanerSnapshot(emp, dailyJobs, today)
      setCleaner(emp)
      reply = {
        id: `a-${Date.now()}`, sender: 'ai', timestamp: t,
        text: `👤 **${emp.full_name}** — ${emp.designation || emp.role}${emp.agency_name ? ` · ${emp.agency_name}` : ''}${emp.phone ? ` · ${emp.phone}` : ''}\n\n• **This month:** ${s.month.jobs} jobs · **${s.month.hours} h** duty · **${s.month.ot} h OT**\n• **Today:** ${s.today.length ? s.today.map(j => `${j.start_time}–${j.end_time} ${j.address}`).join('; ') : 'no job (available)'}\n• **Next:** ${s.next.length ? s.next.map(j => `${formatDate(j.date)} ${j.address}`).join('; ') : 'nothing booked'}\n\nThe cleaner card on the right has the details.`,
      }
    } else {
      reply = askCRMAIBot(question, {
        bookings, clients, dailyJobs, invoices,
        monthlyPayments: safeLocalStorageGet('safaeewala_monthly_client_payments', []),
        pendingList: safeLocalStorageGet('safaeewala_daily_pending_items', []),
        pendingRcvdList: safeLocalStorageGet('safaeewala_daily_pending_rcvd_items', []),
      })
    }
    setMsgs(m => [...m, user, reply])
    setInput('')
  }

  const actions = [
    { label: 'New booking', icon: CalendarPlus, run: () => setBooking(true), tone: 'bg-emerald-600 text-white hover:bg-emerald-700' },
    { label: 'Daily Job Sheet', icon: ClipboardList, run: () => navigate('/daily-job-sheet') },
    { label: 'New invoice', icon: FileText, run: () => navigate('/invoices') },
    { label: 'New complaint', icon: MessageSquareWarning, run: () => navigate('/complaints?new=1') },
    { label: 'Win-back campaign', icon: Megaphone, run: () => navigate('/marketing') },
    { label: 'Attendance', icon: CalendarCheck, run: () => navigate('/attendance') },
    { label: 'Full data check', icon: ShieldAlert, run: () => openAIBot() },
  ]

  return (
    <div className="space-y-5">
      {/* header */}
      <section className="rounded-[24px] bg-gradient-to-br from-[#0F1F19] to-[#14532d] text-white p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-4">
        <span className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center"><Bot size={24} className="text-emerald-300" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-black tracking-tight">AI Bot</h1>
          <p className="text-[12.5px] text-emerald-100/80">The CRM's central brain — bookings, cleaners, OT, money, complaints and stock in one place</p>
        </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map(a => (
            <button key={a.label} type="button" onClick={a.run} className={`h-9 px-3 rounded-xl text-[12.5px] font-bold inline-flex items-center gap-1.5 cursor-pointer ${a.tone || 'bg-white/10 hover:bg-white/20 text-white border border-white/15'}`}>
              <a.icon size={14} /> {a.label}
            </button>
          ))}
        </div>
      </section>

      {/* live cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Jobs today" value={todayJobs.length} sub={formatDate(today)} icon={CalendarCheck} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" onClick={() => navigate('/daily-job-sheet')} />
        <KpiCard label="Working" value={workingToday.size} sub="Cleaners on jobs" icon={UserCheck} labelColor="text-sky-700" iconSolid="bg-[#0284c7] shadow-sky-500/25" />
        <KpiCard label="Available" value={available.length} sub="No job today" icon={Users} labelColor="text-teal-700" iconSolid="bg-[#0d9488] shadow-teal-500/25" />
        <KpiCard label="OT this month" value={`${otTotal} h`} sub={`${otRows.filter(r => r.ot > 0).length} cleaners`} icon={Clock} labelColor="text-violet-700" iconSolid="bg-[#7c3aed] shadow-violet-500/25" />
        <KpiCard label="Unpaid invoices" value={`AED ${(unpaidAmt / 1000).toFixed(1)}k`} sub={`${unpaid.length} invoices`} icon={Receipt} labelColor="text-rose-700" iconSolid="bg-[#e11d48] shadow-rose-500/25" onClick={() => navigate('/invoices')} />
        <KpiCard label="Complaints" value={openComplaints ?? '—'} sub="Open" icon={MessageSquareWarning} labelColor="text-amber-700" iconSolid="bg-[#d97706] shadow-amber-500/25" onClick={() => navigate('/complaints')} />
        <KpiCard label="Low stock" value={lowStock} sub="Items to reorder" icon={Package} labelColor="text-orange-700" iconSolid="bg-[#ea580c] shadow-orange-500/25" onClick={() => navigate('/inventory')} />
        <KpiCard label="Documents" value={docAlerts} sub={`Expired / ≤${DOC_ALERT_DAYS} days`} icon={ShieldAlert} labelColor="text-slate-700" iconSolid="bg-[#475569] shadow-slate-500/25" onClick={() => navigate('/alerts')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5">
        {/* ask */}
        <section className={`${card} flex flex-col h-[600px] overflow-hidden`}>
          <header className="px-5 py-3.5 border-b border-[#E4E8EC] flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-600" />
            <p className="text-[15px] font-bold text-[#111827] flex-1">Ask the CRM</p>
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 inline-flex items-center gap-1" title="Answers come from fixed rules over your data. The AI model (Claude) is connected later with an API key on the server."><KeyRound size={11} /> AI model: not connected</span>
          </header>
          <div className="flex-1 overflow-y-auto bg-[#F7F8F7] px-5 py-4 space-y-3 text-[13px]">
            {msgs.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <Bot size={30} className="mx-auto text-emerald-500 mb-2" />
                <p className="font-semibold text-[#111827]">Ask about OT, revenue, pending payments, duplicates or a cleaner by name</p>
                <p className="text-[12px] mt-1">"New booking" opens the booking form here.</p>
              </div>
            )}
            {msgs.map(m => (
              <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 space-y-0.5 leading-relaxed ${m.sender === 'user' ? 'bg-emerald-600 text-white rounded-br-md' : 'bg-white border border-[#ECEEEC] text-[#111827] rounded-bl-md'}`}>
                  <Rich text={m.text} />
                  <p className={`text-[10px] ${m.sender === 'user' ? 'text-emerald-100' : 'text-slate-400'}`}>{m.timestamp}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="px-4 pt-2 flex gap-1.5 flex-wrap border-t border-[#E4E8EC]">
            {SUGGEST.map(s => <button key={s} type="button" onClick={() => ask(s)} className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer">{s}</button>)}
          </div>
          <form onSubmit={e => { e.preventDefault(); ask() }} className="p-3 flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} placeholder='e.g. "Fatima ka OT", "pending payments", "new booking"' className="flex-1 h-11 px-4 rounded-xl border border-[#E4E8EC] bg-[#f8fafc] text-[13px] outline-none focus:border-emerald-400" />
            <button type="submit" disabled={!input.trim()} className="h-11 w-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center disabled:opacity-40 cursor-pointer" aria-label="Ask"><Send size={16} /></button>
          </form>
        </section>

        <div className="space-y-5">
          {/* search */}
          <section className={`${card} p-4 space-y-2`}>
            <div className="relative"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search cleaners, clients, bookings, invoices…" className="w-full h-11 pl-10 pr-3 rounded-xl border border-[#E4E8EC] bg-[#f8fafc] text-[13px] outline-none focus:border-emerald-400" />
            </div>
            {hits.length > 0 && (
              <ul className="divide-y divide-slate-100 border border-[#ECEEEC] rounded-xl max-h-[240px] overflow-y-auto">
                {hits.map((h: HubHit) => (
                  <li key={`${h.kind}-${h.id}`}>
                    <button type="button" onClick={() => { if (h.kind === 'employee') { setCleaner(h.employee); setQ('') } else navigate(h.url) }} className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 w-16 text-center shrink-0">{h.kind === 'employee' ? 'cleaner' : h.kind}</span>
                      <span className="min-w-0"><span className="block text-[12.5px] font-semibold truncate">{h.title}</span><span className="block text-[11px] text-slate-500 truncate">{h.sub}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.trim().length >= 2 && hits.length === 0 && <p className="text-[12px] text-slate-400 px-1">Nothing found.</p>}
          </section>

          {/* cleaner card */}
          {snap ? (
            <section className={`${card} p-5 space-y-3`}>
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 font-black flex items-center justify-center">{snap.employee.full_name.slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-[#111827] truncate">{snap.employee.full_name}</p>
                  <p className="text-[12px] text-slate-500 truncate flex items-center gap-2">{snap.employee.designation || snap.employee.role}{snap.employee.agency_name && <span className="inline-flex items-center gap-0.5"><Building2 size={11} />{snap.employee.agency_name}</span>}{snap.employee.phone && <span className="inline-flex items-center gap-0.5"><Phone size={11} />{snap.employee.phone}</span>}</p>
                </div>
                <button type="button" onClick={() => setCleaner(null)} className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Close"><X size={15} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['Jobs', snap.month.jobs], ['Duty', `${snap.month.hours} h`], ['OT', `${snap.month.ot} h`]].map(([k, v]) => <div key={k} className="rounded-xl bg-slate-50 py-2"><p className="text-[17px] font-black">{v}</p><p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{k} · this month</p></div>)}
              </div>
              <div className="text-[12.5px] space-y-1">
                <p className="font-bold text-slate-600">Today</p>
                {snap.today.length ? snap.today.map(j => <p key={j.id}>{j.start_time}–{j.end_time} · {j.address}{j.area ? `, ${j.area}` : ''}</p>) : <p className="text-emerald-700">No job — available</p>}
                {snap.next.length > 0 && <><p className="font-bold text-slate-600 pt-1">Next</p>{snap.next.map(j => <p key={j.id}>{formatDate(j.date)} · {j.start_time} · {j.address}</p>)}</>}
              </div>
              {snap.docs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {snap.docs.map(d => { const n = daysUntil(d.date); return <span key={d.label} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${n < 0 ? 'bg-rose-50 text-rose-700' : n <= DOC_ALERT_DAYS ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{d.label}: {formatDate(d.date)}</span> })}
                </div>
              )}
              <button type="button" onClick={() => navigate(`/employees/${snap.employee.id}`)} className="text-[12.5px] font-bold text-emerald-700 hover:underline cursor-pointer">Open profile →</button>
            </section>
          ) : (
            /* OT table */
            <section className={`${card} overflow-hidden`}>
              <header className="px-5 py-3 border-b border-[#E4E8EC] flex items-center gap-2"><Clock size={15} className="text-violet-600" /><p className="text-[14.5px] font-bold text-[#111827] flex-1">Duty & OT — this month</p><span className="text-[11px] text-slate-400">click a name for details</span></header>
              <div className="max-h-[330px] overflow-y-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500 text-left sticky top-0"><tr><th className="px-4 py-2">Cleaner</th><th className="px-3 py-2 text-right">Jobs</th><th className="px-3 py-2 text-right">Duty</th><th className="px-4 py-2 text-right">OT</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {otRows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">No jobs this month yet.</td></tr>}
                    {otRows.map(r => {
                      const emp = employees.find(e => e.full_name.toLowerCase() === r.name.toLowerCase())
                      return (
                        <tr key={r.name} className="hover:bg-slate-50">
                          <td className="px-4 py-2">{emp ? <button type="button" onClick={() => setCleaner(emp)} className="font-semibold hover:underline cursor-pointer">{r.name}</button> : <span className="font-semibold">{r.name}</span>}</td>
                          <td className="px-3 py-2 text-right">{r.jobs}</td><td className="px-3 py-2 text-right">{r.hours} h</td>
                          <td className={`px-4 py-2 text-right font-bold ${r.ot > 0 ? 'text-violet-700' : 'text-slate-400'}`}>{r.ot} h</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className={`${card} p-4 flex items-center gap-3`}>
            <ShieldAlert size={18} className={health.highCount ? 'text-rose-600' : 'text-emerald-600'} />
            <p className="text-[12.5px] flex-1"><b>Data health {health.score}%</b> · {health.issues.length} findings{health.highCount ? `, ${health.highCount} high` : ''}</p>
            <button type="button" onClick={() => openAIBot()} className="h-8 px-3 rounded-lg border border-[#E4E8EC] text-[12px] font-bold hover:bg-slate-50 cursor-pointer">Review</button>
          </section>
        </div>
      </div>

      {booking && <NewBookingModal open={booking} onClose={() => setBooking(false)} onAdd={addBooking} />}
    </div>
  )
}
