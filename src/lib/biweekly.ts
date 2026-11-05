import { addDays } from '@/lib/dubaiTime'

/**
 * R-CLI-02 — a Bi-Weekly client: chosen weekdays (each with its time and cleaner) for a set number of
 * months, every week by default or every other week. R-SCHED-07: the visits go to the Daily Job Sheet
 * by themselves, like monthly visits.
 * The plan is kept on the client (`clients.biweekly_plan`); it is not a monthly schedule, so it never
 * makes the client monthly (R-SCHED-04).
 */
export type ClientServiceMode = 'general' | 'biweekly' | 'monthly'

export interface BiWeeklyDay {
  startTime: string
  endTime: string
  cleaner: string
  duration: number
}

export interface BiWeeklyPlan {
  days: string[]
  day_schedules: Record<string, BiWeeklyDay>
  /** First week of service (YYYY-MM-DD) */
  start_date: string
  /** How long the client wants the service */
  months: number
  /** 1 = the chosen days every week (default), 2 = every other week */
  every_weeks?: 1 | 2
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Last day of the contract: start + months, minus one day */
export function biweeklyEndDate(plan: Pick<BiWeeklyPlan, 'start_date' | 'months'>): string {
  const [y, m, d] = plan.start_date.split('-').map(Number)
  if (!y || !m || !d || !(plan.months > 0)) return plan.start_date
  const total = m - 1 + plan.months
  const ey = y + Math.floor(total / 12)
  const em = (total % 12) + 1
  const lastOfMonth = new Date(Date.UTC(ey, em, 0)).getUTCDate()
  const end = `${ey}-${String(em).padStart(2, '0')}-${String(Math.min(d, lastOfMonth)).padStart(2, '0')}`
  return addDays(end, -1)
}

/** Every visit date: the chosen weekdays from the start week, every week or every second week, until the end date */
export function biweeklyVisitDates(plan: BiWeeklyPlan): string[] {
  if (!plan.start_date || plan.days.length === 0) return []
  const end = biweeklyEndDate(plan)
  const [y, m, d] = plan.start_date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const weekStart = addDays(plan.start_date, -((dow + 6) % 7)) // Monday of the start week
  const out: string[] = []
  const step = plan.every_weeks === 2 ? 14 : 7
  for (let week = weekStart; week <= end; week = addDays(week, step)) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(week, i)
      const name = WEEKDAY_NAMES[(i + 1) % 7]
      if (date >= plan.start_date && date <= end && plan.days.includes(name)) out.push(date)
    }
  }
  return out
}

/** R-SCHED-07: the visit of a Bi-Weekly plan on one date (its day's time and cleaner), or null */
export function biweeklyVisitOn(plan: BiWeeklyPlan | null | undefined, date: string): (BiWeeklyDay & { day: string }) | null {
  if (!plan || !plan.start_date || plan.days.length === 0) return null
  if (date < plan.start_date || date > biweeklyEndDate(plan)) return null
  const [y, m, d] = date.split('-').map(Number)
  const day = WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  if (!plan.days.includes(day)) return null
  if (plan.every_weeks === 2 && !biweeklyVisitDates(plan).includes(date)) return null
  const row = plan.day_schedules[day]
  return row ? { ...row, day } : null
}
