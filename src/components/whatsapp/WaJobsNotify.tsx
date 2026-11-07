import { useEffect, useMemo, useState } from 'react'
import { BellRing, Loader2, Truck } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { notify } from '@/lib/notify'
import { todayDubai } from '@/lib/dubaiTime'
import { loadNotifications, waNotify, type NotificationSettings } from '@/lib/inboxSettings'
import { aed } from './WaShared'

/** Phone + name for a job sheet row: its booking first, else the client whose building is the job's address */
export function contactForJob(job: { booking_id?: string; address?: string }, bookings: { id: string; client_phone?: string; client_name?: string; client_id?: string }[], clients: { id: string; full_name: string; phone?: string; whatsapp?: string; building_name?: string }[]) {
  const b = job.booking_id ? bookings.find(x => x.id === job.booking_id) : undefined
  const c = (b?.client_id && clients.find(x => x.id === b.client_id)) || clients.find(x => x.building_name && job.address && x.building_name.trim().toLowerCase() === job.address.trim().toLowerCase())
  return { phone: b?.client_phone || c?.whatsapp || c?.phone || '', name: b?.client_name || c?.full_name || '' }
}

/** Unpaid job sheet rows of the last 60 days (charges more than received) */
export function unpaidJobs<T extends { date: string; charges: number; received: number }>(jobs: T[], today: string) {
  const from = new Date(new Date(`${today}T12:00:00Z`).getTime() - 60 * 86400000).toISOString().slice(0, 10)
  return jobs.filter(j => j.date <= today && j.date >= from && (Number(j.charges) || 0) - (Number(j.received) || 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * R-WA-04: notifications sent by hand from Jobs — "Team on the way" for today's jobs and payment reminders for
 * unpaid jobs. Each button works only when that notification is switched on (Settings → Notifications).
 */
export function WaJobsNotify({ canSend }: { canSend: boolean }) {
  const { dailyJobs, bookings, clients } = useData()
  const [cfg, setCfg] = useState<NotificationSettings | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  useEffect(() => { void loadNotifications().then(v => setCfg(v || null)).catch(() => {}) }, [])
  const today = todayDubai()
  const on = (k: 'payment' | 'on_way') => Boolean(canSend && cfg && cfg.master !== false && cfg[k]?.enabled && cfg[k]?.template)

  const unpaid = useMemo(() => unpaidJobs(dailyJobs, today).slice(0, 100), [dailyJobs, today])
  const todays = useMemo(() => dailyJobs.filter(j => j.date === today).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))), [dailyJobs, today])

  const send = async (kind: 'payment' | 'on_way', job: (typeof dailyJobs)[number]) => {
    const who = contactForJob(job, bookings, clients)
    if (!who.phone) return notify.error('No phone number for this job — link it to a client or booking first')
    const bal = (Number(job.charges) || 0) - (Number(job.received) || 0)
    if (kind === 'payment' && !window.confirm(`Send a payment reminder for ${aed(bal)} to ${who.name || who.phone}?`)) return
    setBusy(`${kind}:${job.id}`)
    try {
      await waNotify(kind, job.id, who.phone, who.name, { date: job.date, time: job.start_time || '', service: job.service || '', address: job.address || '', amount: aed(Number(job.charges) || 0), balance: aed(bal), cleaner: job.staff_name || '' })
      setDone(d => new Set(d).add(`${kind}:${job.id}`)); notify.success('Sent')
    } catch (e) { notify.error((e as Error).message) } finally { setBusy(null) }
  }
  const Btn = ({ kind, job }: { kind: 'payment' | 'on_way'; job: (typeof dailyJobs)[number] }) => {
    const key = `${kind}:${job.id}`
    const enabled = on(kind)
    return (
      <button type="button" onClick={() => void send(kind, job)} disabled={!enabled || busy !== null || done.has(key)}
        title={enabled ? '' : `Switch on "${kind === 'payment' ? 'Payment reminder' : 'Team on the way'}" and choose its template in Settings → Notifications`}
        className="flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1 rounded-lg border border-[#E2E5E0] hover:bg-slate-50 cursor-pointer disabled:opacity-40 disabled:cursor-default whitespace-nowrap">
        {busy === key ? <Loader2 size={12} className="animate-spin" /> : kind === 'payment' ? <BellRing size={12} /> : <Truck size={12} />}
        {done.has(key) ? 'Sent' : kind === 'payment' ? 'Remind' : 'On the way'}
      </button>
    )
  }

  return (
    <>
      <section className="bg-white border border-[#E2E5E0] rounded-[22px] overflow-hidden">
        <header className="px-5 py-3.5 border-b border-[#E2E5E0] text-[14px] font-bold text-[#111827]">Today's jobs <span className="text-[12px] font-semibold text-slate-400">· "Team on the way" by hand (it also goes by itself when a cleaner taps On my way)</span></header>
        {todays.length === 0 ? <p className="p-6 text-center text-[12.5px] text-slate-400">No jobs on today's sheet.</p> : (
          <ul className="divide-y divide-slate-100">
            {todays.slice(0, 60).map(j => {
              const who = contactForJob(j, bookings, clients)
              return (
                <li key={j.id} className="px-5 py-2.5 flex items-center gap-3 text-[12.5px]">
                  <span className="w-20 shrink-0 font-semibold">{j.start_time}</span>
                  <span className="flex-1 min-w-0 truncate">{who.name || j.address}<span className="text-slate-400"> · {j.staff_name}</span></span>
                  {!who.phone && <span className="text-[11px] text-slate-400">no number</span>}
                  <Btn kind="on_way" job={j} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <section className="bg-white border border-[#E2E5E0] rounded-[22px] overflow-hidden">
        <header className="px-5 py-3.5 border-b border-[#E2E5E0] text-[14px] font-bold text-[#111827]">Unpaid jobs <span className="text-[12px] font-semibold text-slate-400">· last 60 days, charges more than received on the job sheet</span></header>
        {unpaid.length === 0 ? <p className="p-6 text-center text-[12.5px] text-slate-400">Nothing unpaid on the job sheet.</p> : (
          <ul className="divide-y divide-slate-100">
            {unpaid.map(j => {
              const who = contactForJob(j, bookings, clients)
              return (
                <li key={j.id} className="px-5 py-2.5 flex items-center gap-3 text-[12.5px]">
                  <span className="w-24 shrink-0 font-semibold">{j.date}</span>
                  <span className="flex-1 min-w-0 truncate">{who.name || j.address}</span>
                  <span className="font-bold text-red-600 whitespace-nowrap">{aed((Number(j.charges) || 0) - (Number(j.received) || 0))}</span>
                  {!who.phone && <span className="text-[11px] text-slate-400">no number</span>}
                  <Btn kind="payment" job={j} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
