import { addDays } from '@/lib/dubaiTime'

/**
 * R-CLI-02 — a Bi-Weekly client: chosen weekdays, every other week, for a set number of months.
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

/** Every visit date: the chosen weekdays of the start week, then every second week, until the end date */
export function biweeklyVisitDates(plan: BiWeeklyPlan): string[] {
  if (!plan.start_date || plan.days.length === 0) return []
  const end = biweeklyEndDate(plan)
  const [y, m, d] = plan.start_date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const weekStart = addDays(plan.start_date, -((dow + 6) % 7)) // Monday of the start week
  const out: string[] = []
  for (let week = weekStart; week <= end; week = addDays(week, 14)) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(week, i)
      const name = WEEKDAY_NAMES[(i + 1) % 7]
      if (date >= plan.start_date && date <= end && plan.days.includes(name)) out.push(date)
    }
  }
  return out
}
