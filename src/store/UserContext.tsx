import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

export type AppRole = 'admin' | 'developer' | 'employee'

export interface CurrentUser {
  id: string
  email: string
  full_name: string
  role: AppRole
}

export type RolePerms = Record<AppRole, string[]>

export const ALL_MODULES = [
  'Overview', 'Bookings', 'Clients', 'Employees', 'Dispatch',
  'Daily Job Sheet', 'Invoices', 'Inventory', 'Reports', 'Settings',
] as const

export const DEFAULT_ROLE_PERMS: RolePerms = {
  admin:     [...ALL_MODULES],
  developer: [...ALL_MODULES],
  employee:  ['Overview', 'Bookings', 'Clients', 'Employees', 'Dispatch', 'Invoices', 'Inventory', 'Reports'],
}

const UserContext     = createContext<CurrentUser | null>(null)
const RolePermsCtx    = createContext<RolePerms>(DEFAULT_ROLE_PERMS)
const SetRolePermsCtx = createContext<(p: RolePerms) => void>(() => {})

export function UserProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<CurrentUser | null>(null)
  const [rolePerms, setRolePerms] = useState<RolePerms>(DEFAULT_ROLE_PERMS)

  useEffect(() => {
    async function load() {
      try {
        const { data: auth } = await supabase.auth.getUser()
        if (!auth.user) return

        const [{ data: profile }, { data: settings }] = await Promise.all([
          supabase.from('profiles').select('full_name, role').eq('id', auth.user.id).single(),
          supabase.from('company_settings').select('data').eq('id', 1).single(),
        ])

        const stored = settings?.data?.rolePermissions as Partial<RolePerms> | undefined
        if (stored) setRolePerms(p => ({ ...p, ...stored }))

        setUser({
          id:        auth.user.id,
          email:     auth.user.email ?? '',
          full_name: profile?.full_name ?? '',
          role:      (profile?.role ?? 'admin') as AppRole,
        })
      } catch {
        // silently fail — AuthGuard handles null user
      }
    }
    load()
  }, [])

  return (
    <SetRolePermsCtx.Provider value={setRolePerms}>
      <RolePermsCtx.Provider value={rolePerms}>
        <UserContext.Provider value={user}>{children}</UserContext.Provider>
      </RolePermsCtx.Provider>
    </SetRolePermsCtx.Provider>
  )
}

export function useCurrentUser()  { return useContext(UserContext) }
export function useRolePerms()    { return useContext(RolePermsCtx) }
export function useSetRolePerms() { return useContext(SetRolePermsCtx) }

export function useIsAdmin() {
  const u = useCurrentUser()
  return u?.role === 'admin' || u?.role === 'developer'
}

export function useCanAccess(module: string): boolean {
  const u     = useCurrentUser()
  const perms = useContext(RolePermsCtx)
  if (u === null) return true  // still loading — show everything
  return (perms[u.role] ?? []).includes(module)
}
