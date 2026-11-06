import type { Booking, Client, DailyExpense, DailyJob, DailyPendingReceivedItem, Invoice } from '@/types'
import { isBogusJob, jobCollected, splitStaffNames, calcJobCollectable, buildPendingCalcContext, loadClientAdjustments } from '@/lib/clientDataSync'
import { invoiceBalance, invoicedJobIds } from '@/lib/receivables'
import { todayDubai } from '@/lib/dubaiTime'

/**
 * R-FIN-07: one set of business figures for Reports and Analytics (they used different formulas).
 *
 * - Revenue (work value) = job-sheet charges + bookings that have no job-sheet row (completed / live)
 *   + monthly-contract payments (monthly visits carry no charges on the sheet; the contract is paid
 *   through Monthly Clients → payments, so without them monthly revenue was missing).
 * - Collected = money received on job rows (R-FIN-03) + pending recoveries + monthly-contract payments.
 * - Gross profit = revenue − daily expenses (salaries are not in the CRM, so it is before salaries).
 */

export interface MonthlyPaymentLike { amount: number | string; date: string; clientName?: string; clientId?: string }

export interface MetricsInput {
  dailyJobs: DailyJob[]
  bookings: Booking[]
  clients: Client[]
  dailyExpenses: DailyExpense[]
  invoices: Invoice[]
  monthlyPayments: MonthlyPaymentLike[]
  pendingReceipts: DailyPendingReceivedItem[]
}

export interface MonthFigures {
  key: string          // YYYY-MM
  label: string        // "Nov 2026"
  short: string        // "Nov"
  revenue: number
  oneOffRevenue: number
  contractRevenue: number
  collected: number
  expenses: number
  profit: number
  jobs: number
  dutyHours: number
  newClients: number
}

const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0 }
const monthOf = (d?: string) => String(d || '').slice(0, 7)

/** The last `count` months (oldest first), in Dubai time */
export function lastMonths(count: number, today = todayDubai()): { key: string; label: string; short: string }[] {
  const [y, m] = today.split('-').map(Number)
  const list: { key: string; label: string; short: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    list.push({
      key,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      short: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
    })
  }
  return list
}

const realJobs = (jobs: DailyJob[]) => jobs.filter(j => !isBogusJob(j))
/** Bookings that count as work but have no job-sheet row (R-FIN-03: a linked booking counts through its row) */
export function bookingsWithoutRow(bookings: Booking[], jobs: DailyJob[]): Booking[] {
  const linked = new Set(jobs.map(j => j.booking_id).filter(Boolean))
  return bookings.filter(b => !linked.has(b.id) && (b.status === 'completed' || b.status === 'in_progress'))
}

export function monthlyFigures(input: MetricsInput, months: { key: string; label: string; short: string }[]): MonthFigures[] {
  const jobs = realJobs(input.dailyJobs)
  const extraBookings = bookingsWithoutRow(input.bookings, jobs)
  return months.map(m => {
    const mj = jobs.filter(j => monthOf(j.date) === m.key)
    const mb = extraBookings.filter(b => monthOf(b.scheduled_date) === m.key)
    const contractRevenue = input.monthlyPayments.filter(p => monthOf(p.date) === m.key).reduce((s, p) => s + num(p.amount), 0)
    const oneOffRevenue = mj.reduce((s, j) => s + num(j.charges), 0) + mb.reduce((s, b) => s + num(b.total_amount), 0)
    const revenue = oneOffRevenue + contractRevenue
    const recoveries = input.pendingReceipts.filter(p => monthOf(p.date) === m.key).reduce((s, p) => s + num(p.cash) + num(p.online), 0)
    const collected = mj.reduce((s, j) => s + jobCollected(j), 0) + mb.reduce((s, b) => s + num(b.received_amount), 0) + recoveries + contractRevenue
    const expenses = input.dailyExpenses.filter(e => monthOf(e.date) === m.key).reduce((s, e) => s + num(e.amount), 0)
    return {
      ...m,
      revenue, oneOffRevenue, contractRevenue, collected, expenses,
      profit: revenue - expenses,
      jobs: mj.length + mb.length,
      dutyHours: Math.round(mj.reduce((s, j) => s + num(j.duty_hours), 0) * 10) / 10,
      newClients: input.clients.filter(c => monthOf(c.created_at) === m.key).length,
    }
  })
}

/** Money still to collect today: job dues (same formula as Pending / Payments) + open invoice balances */
export function outstandingNow(input: Pick<MetricsInput, 'dailyJobs' | 'invoices' | 'pendingReceipts'>): { jobs: number; invoices: number; total: number } {
  const ctx = buildPendingCalcContext(loadClientAdjustments(), input.pendingReceipts)
  const invoiced = invoicedJobIds(input.invoices)
  const jobs = realJobs(input.dailyJobs).reduce((s, j) => s + calcJobCollectable(j, ctx, invoiced), 0)
  const inv = input.invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + invoiceBalance(i), 0)
  return { jobs: Math.round(jobs), invoices: Math.round(inv), total: Math.round(jobs + inv) }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface Insights {
  busiestDay: { day: string; jobs: number } | null
  byWeekday: { day: string; jobs: number }[]
  topAreas: { area: string; revenue: number; jobs: number }[]
  staff: { name: string; jobs: number; hours: number; revenue: number }[]
  revenuePerHour: number
  avgJobValue: number
  retainedClients: number   // served last month and this month
  lastMonthClients: number
}

/** Operational insights over the jobs of the given months */
export function insightsFor(input: Pick<MetricsInput, 'dailyJobs'>, monthKeys: string[]): Insights {
  const keys = new Set(monthKeys)
  const jobs = realJobs(input.dailyJobs).filter(j => keys.has(monthOf(j.date)))
  const byDay = WEEKDAYS.map(day => ({ day, jobs: 0 }))
  const areas = new Map<string, { revenue: number; jobs: number }>()
  const staff = new Map<string, { jobs: number; hours: number; revenue: number }>()
  let charges = 0, hours = 0
  jobs.forEach(j => {
    const d = new Date(`${String(j.date).slice(0, 10)}T12:00:00Z`)
    if (!isNaN(d.getTime())) byDay[d.getUTCDay()].jobs++
    const area = (j.area || '').trim() || 'Not set'
    const a = areas.get(area) || { revenue: 0, jobs: 0 }
    a.revenue += num(j.charges); a.jobs++; areas.set(area, a)
    charges += num(j.charges); hours += num(j.duty_hours)
    const names = splitStaffNames(j.staff_name || '')
    names.forEach(n => {
      const s = staff.get(n) || { jobs: 0, hours: 0, revenue: 0 }
      s.jobs++; s.hours += num(j.duty_hours); s.revenue += num(j.charges) / names.length
      staff.set(n, s)
    })
  })
  const busiest = [...byDay].sort((a, b) => b.jobs - a.jobs)[0]
  const thisKey = monthKeys[monthKeys.length - 1], prevKey = monthKeys[monthKeys.length - 2]
  const clientsIn = (k?: string) => new Set(realJobs(input.dailyJobs).filter(j => k && monthOf(j.date) === k).map(j => (j.address || '').trim().toLowerCase()).filter(Boolean))
  const last = clientsIn(prevKey), now = clientsIn(thisKey)
  return {
    busiestDay: busiest && busiest.jobs > 0 ? busiest : null,
    byWeekday: byDay,
    topAreas: [...areas.entries()].map(([area, v]) => ({ area, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    staff: [...staff.entries()].map(([name, v]) => ({ name, jobs: v.jobs, hours: Math.round(v.hours * 10) / 10, revenue: Math.round(v.revenue) }))
      .sort((a, b) => b.hours - a.hours).slice(0, 8),
    revenuePerHour: hours > 0 ? Math.round(charges / hours) : 0,
    avgJobValue: jobs.length > 0 ? Math.round(charges / jobs.length) : 0,
    retainedClients: [...last].filter(c => now.has(c)).length,
    lastMonthClients: last.size,
  }
}

/** % change, null when there is nothing to compare with */
export const pctChange = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 100) : null)
