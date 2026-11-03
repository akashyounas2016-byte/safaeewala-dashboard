import type { DailyJob, Employee } from '@/types'
import type { AppRole } from '@/lib/permissions'
import { employeeMatchesStaff, isBogusJob, splitStaffNames } from '@/lib/clientDataSync'
import { cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'
import { buildRouteSites, minutesOf, type RouteSite } from '@/lib/driverRoutes'
import type { DayPlan } from '@/lib/driverPlans'

/**
 * My Duties (R-SEC-05, R-DRV-02): what a field worker sees on their phone.
 * A driver sees only their own route; every other field role sees only their own cleaning jobs.
 */
export type DutyKind = 'driver' | 'cleaner'

/** Driver duties for drivers; cleaning duties for every other staff role */
export const dutyKindOf = (emp?: Pick<Employee, 'role'> | null): DutyKind | null =>
  !emp ? null : emp.role === 'driver' ? 'driver' : 'cleaner'

/**
 * Field staff = an "employee" login linked to a cleaner / driver record (not a supervisor).
 * They open My Duties only, whatever screens the employee role has (R-SEC-05).
 */
export function isFieldStaff(appRole: AppRole | undefined, emp?: Pick<Employee, 'role'> | null): boolean {
  return appRole === 'employee' && !!emp && emp.role !== 'supervisor'
}

export interface CleanerDuty {
  job: DailyJob
  start: string
  end: string
  hours: number
  site: string
  area: string
  teammates: string[]
  /** Cash the cleaner collects at the site (Cash jobs with an amount still due) — no other prices */
  cashToCollect: number
  driver?: { name: string; drop: string; pickup: string }
}

/** One cleaner's jobs on a date, in time order, with the driver who drops them (from the day plan) */
export function cleanerDuties(jobs: DailyJob[], emp: Employee, date: string, plan?: DayPlan, employees: Employee[] = []): CleanerDuty[] {
  const day = jobs.filter(j => (j.date || '').split('T')[0] === date && !isBogusJob(j) && employeeMatchesStaff(emp, j.staff_name || ''))
  const sites: RouteSite[] = plan ? buildRouteSites(jobs, date) : []
  return day
    .map(j => {
      const site = sites.find(s => s.jobIds.includes(j.id))
      const driverId = site ? plan?.assignments[site.key] : undefined
      const driverEmp = driverId ? employees.find(e => e.id === driverId) : undefined
      const due = cleanNum(j.charges) - cleanNum(j.received)
      return {
        job: j,
        start: j.start_time || '',
        end: j.end_time || '',
        hours: cleanNum(j.duty_hours),
        site: (j.address || '').trim() || 'No address',
        area: (j.area || '').trim(),
        teammates: splitStaffNames(j.staff_name || '').filter(n => !employeeMatchesStaff(emp, n)),
        cashToCollect: /^cash$/i.test(String(j.payment_mode || '')) && due > 0 ? due : 0,
        driver: driverEmp && site ? { name: driverEmp.full_name, drop: site.dropTime, pickup: site.pickupTime } : undefined,
      }
    })
    .sort((a, b) => ((minutesOf(a.start) ?? 1e9) - (minutesOf(b.start) ?? 1e9)) || a.site.localeCompare(b.site))
}

/** Google Maps search for a site (opens the Maps app on Android) */
export function mapsSearchUrl(site: string, area?: string): string {
  const q = [site, area, 'Dubai'].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}
