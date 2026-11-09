import { useAuth, useRolePerms } from '@/store/UserContext'
import { useFieldStaff } from '@/store/useFieldStaff'
import { canAccessModule, type ModuleKey } from '@/lib/permissions'

/** Can the signed-in user use this screen / permission (Settings → Roles & Access)? Admin always can. */
export function useModuleAccess(module: ModuleKey): boolean {
  const { user } = useAuth()
  const perms = useRolePerms()
  const field = useFieldStaff()
  const staffRole = user?.role === 'employee' ? field.employee?.role : undefined
  return canAccessModule(user?.role, perms, module, staffRole)
}

/** R-SEC-08: cleaners' salaries are shown only to Admin and to the roles given "Salary" in Roles & Access */
export const useSalaryAccess = () => useModuleAccess('Salary')

/** What is shown instead of a salary the user may not see */
export const SALARY_HIDDEN = '••••'
