import { useMemo } from 'react'
import { useAuth } from '@/store/UserContext'
import { useData } from '@/store/DataContext'
import { dutyKindOf, isFieldStaff, type DutyKind } from '@/lib/duties'
import type { Employee } from '@/types'

/**
 * The signed-in user's staff record and whether they are field staff (My Duties only, R-SEC-05).
 * `resolving`: an employee login whose staff record has not loaded yet — show nothing until it has,
 * so a cleaner never sees another screen for a moment.
 */
export function useFieldStaff(): { isField: boolean; resolving: boolean; employee: Employee | undefined; kind: DutyKind | null } {
  const { user } = useAuth()
  const { employees, loading } = useData()
  return useMemo(() => {
    const employee = user?.employee_id ? employees.find(e => e.id === user.employee_id) : undefined
    const resolving = user?.role === 'employee' && !!user.employee_id && !employee && loading
    return { isField: isFieldStaff(user?.role, employee), resolving, employee, kind: dutyKindOf(employee) }
  }, [user?.role, user?.employee_id, employees, loading])
}
