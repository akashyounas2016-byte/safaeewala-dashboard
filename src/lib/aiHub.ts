// R-AI-01: the AI Bot hub — answers from the CRM's own data (no AI model yet): OT, cleaner info, search
import { calcJobOTHours, isBogusJob } from '@/lib/clientDataSync'
import type { Booking, Client, DailyJob, Employee, Invoice } from '@/types'

export const splitStaff = (s?: string) => String(s || '').split(/[,+/&]|\band\b/i).map(x => x.trim()).filter(Boolean)
const same = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, ' ').trim() === b.toLowerCase().replace(/\s+/g, ' ').trim()
const r1 = (n: number) => Math.round(n * 10) / 10

export interface StaffMonth { name: string; jobs: number; hours: number; ot: number }

/** Duty hours and OT per cleaner for one month (YYYY-MM), from the Daily Job Sheet (R-OT-01) */
export function monthStaffHours(jobs: DailyJob[], month: string): StaffMonth[] {
  const m = new Map<string, StaffMonth>()
  jobs.forEach(j => {
    if (!String(j.date || '').startsWith(month) || isBogusJob(j)) return
    const ot = calcJobOTHours(j)
    splitStaff(j.staff_name).forEach(n => {
      const cur = m.get(n.toLowerCase()) || { name: n, jobs: 0, hours: 0, ot: 0 }
      cur.jobs += 1; cur.hours += Number(j.duty_hours) || 0; cur.ot += ot
      m.set(n.toLowerCase(), cur)
    })
  })
  return [...m.values()].map(x => ({ ...x, hours: r1(x.hours), ot: r1(x.ot) })).sort((a, b) => b.ot - a.ot || b.hours - a.hours)
}

export interface CleanerSnapshot {
  employee: Employee
  month: StaffMonth
  today: DailyJob[]
  next: DailyJob[]
  docs: { label: string; date: string }[]
}

/** Everything about one cleaner: profile, this month's hours / OT, today's and upcoming jobs, document dates */
export function cleanerSnapshot(e: Employee, jobs: DailyJob[], today: string): CleanerSnapshot {
  const mine = jobs.filter(j => !isBogusJob(j) && splitStaff(j.staff_name).some(n => same(n, e.full_name)))
  const month = monthStaffHours(mine, today.slice(0, 7)).find(x => same(x.name, e.full_name)) || { name: e.full_name, jobs: 0, hours: 0, ot: 0 }
  const docs = ([['Visa', e.visa_expiry], ['Work Permit', e.work_permit_expiry], ['Passport', e.passport_expiry], ['Emirates ID', e.eid_end_date]] as const)
    .filter(([, d]) => !!d).map(([label, d]) => ({ label, date: String(d) }))
  return {
    employee: e, month,
    today: mine.filter(j => j.date === today).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
    next: mine.filter(j => j.date > today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
    docs,
  }
}

export type HubHit =
  | { kind: 'employee'; id: string; title: string; sub: string; employee: Employee }
  | { kind: 'client'; id: string; title: string; sub: string; url: string }
  | { kind: 'booking'; id: string; title: string; sub: string; url: string }
  | { kind: 'invoice'; id: string; title: string; sub: string; url: string }

/** One search across cleaners, clients, bookings and invoices */
export function hubSearch(q: string, d: { employees: Employee[]; clients: Client[]; bookings: Booking[]; invoices: Invoice[] }, limit = 12): HubHit[] {
  const s = q.trim().toLowerCase()
  if (s.length < 2) return []
  const has = (...v: unknown[]) => v.some(x => String(x || '').toLowerCase().includes(s))
  const out: HubHit[] = []
  d.employees.filter(e => has(e.full_name, e.phone, e.nationality)).slice(0, 5).forEach(e => out.push({ kind: 'employee', id: e.id, title: e.full_name, sub: [e.designation || e.role, e.agency_name, e.phone].filter(Boolean).join(' · '), employee: e }))
  d.clients.filter(c => has(c.full_name, c.phone, c.whatsapp, c.building_name, c.area)).slice(0, 5).forEach(c => out.push({ kind: 'client', id: c.id, title: c.full_name, sub: [c.building_name, c.area, c.phone].filter(Boolean).join(' · '), url: `/clients/${c.id}` }))
  d.bookings.filter(b => has(b.client_name, b.client_phone, b.service_address)).slice(0, 4).forEach(b => out.push({ kind: 'booking', id: b.id, title: `${b.client_name} — ${b.scheduled_date}`, sub: [b.service_type, b.status].filter(Boolean).join(' · '), url: '/bookings' }))
  d.invoices.filter(i => has(i.invoice_number, i.client_name)).slice(0, 4).forEach(i => out.push({ kind: 'invoice', id: i.id, title: `${i.invoice_number} — ${i.client_name}`, sub: `AED ${Number(i.total || 0).toLocaleString()} · ${i.status}`, url: '/invoices' }))
  return out.slice(0, limit)
}

/** Did the question ask to book a job? ("book", "new booking", "booking karo") */
export const wantsBooking = (q: string) => /\b(book|booking|new job|add job|job lagao|booking karo)\b/i.test(q)

/** A cleaner named in the question, if any */
export function employeeInQuestion(q: string, employees: Employee[]): Employee | undefined {
  const s = q.toLowerCase()
  return employees
    .filter(e => e.full_name && e.status !== 'inactive')
    .find(e => s.includes(e.full_name.toLowerCase()) || e.full_name.toLowerCase().split(/\s+/).filter(p => p.length >= 4).some(p => new RegExp(`\\b${p}\\b`).test(s)))
}
