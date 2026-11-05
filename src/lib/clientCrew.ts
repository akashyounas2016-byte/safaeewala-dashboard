import type { Client, DailyJob, Employee } from '@/types'
import { employeeMatchesStaff, getClientDailyJobsHistory, splitStaffNames } from '@/lib/clientDataSync'
import { isParentCompanyEmployee } from '@/lib/utils'

export interface ClientCrewMix {
  inHouse: string[]
  outsourced: string[]
}

/**
 * UX-95: the cleaners who work for a client (preferred cleaners and everyone in the client's job history),
 * split into in-house staff and outsourced staff (an agency that is not Safaeewala itself, isParentCompanyEmployee). Names that are not a
 * registered employee are left out, so the counts never guess.
 */
export function clientCrewMix(client: Client, dailyJobs: DailyJob[], employees: Employee[]): ClientCrewMix {
  const names = new Set<string>()
  splitStaffNames(client.preferred_cleaner || '').forEach(n => names.add(n))
  getClientDailyJobsHistory(client, dailyJobs).forEach(j => splitStaffNames(j.staff_name || '').forEach(n => names.add(n)))
  const seen = new Set<string>()
  const mix: ClientCrewMix = { inHouse: [], outsourced: [] }
  names.forEach(n => {
    const emp = employees.find(e => employeeMatchesStaff(e, n))
    if (!emp || seen.has(emp.id)) return
    seen.add(emp.id)
    if (isParentCompanyEmployee(emp)) mix.inHouse.push(emp.full_name)
    else mix.outsourced.push(emp.full_name)
  })
  return mix
}
