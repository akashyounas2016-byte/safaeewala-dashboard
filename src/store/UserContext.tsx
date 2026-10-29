/* eslint-disable react-refresh/only-export-components -- context file: provider + its hooks belong together */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ALL_MODULE_KEYS, DEFAULT_ROLE_PERMS, canAccessModule, normalizeRolePerms,
  type AppRole, type ModuleKey, type RolePerms,
} from '@/lib/permissions'

export { ALL_MODULE_KEYS as ALL_MODULES, DEFAULT_ROLE_PERMS }
export type { AppRole, RolePerms, ModuleKey }

/**
 * Signed-in user (SEC-01). Supabase Auth holds the session; the role and status come from
 * public.profiles, which only the server (admin endpoints) can change. Nobody is an admin by
 * default — until the profile has loaded the user has no access.
 */
export interface CurrentUser {
  id: string
  email: string
  login_id: string
  full_name: string
  role: AppRole
  employee_id: string | null
}

export type AuthStatus = 'loading' | 'signed_out' | 'no_profile' | 'disabled' | 'ready'

interface AuthState {
  status: AuthStatus
  user: CurrentUser | null
  signOut: () => Promise<void>
  /** Re-read the profile (after an admin changes it) */
  refresh: () => Promise<void>
}

const AuthCtx         = createContext<AuthState>({ status: 'loading', user: null, signOut: async () => {}, refresh: async () => {} })
const RolePermsCtx    = createContext<RolePerms>(DEFAULT_ROLE_PERMS)
const SetRolePermsCtx = createContext<(p: RolePerms) => void>(() => {})

export function UserProvider({ children }: { children: ReactNode }) {
  const [status, setStatus]       = useState<AuthStatus>('loading')
  const [user, setUser]           = useState<CurrentUser | null>(null)
  const [rolePerms, setRolePerms] = useState<RolePerms>(DEFAULT_ROLE_PERMS)

  const loadProfile = useCallback(async (authUserId: string | null, email: string) => {
    if (!authUserId) { setUser(null); setStatus('signed_out'); return }
    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabase.from('profiles').select('login_id, full_name, role, status, employee_id').eq('id', authUserId).maybeSingle(),
      supabase.from('company_settings').select('data').eq('id', 1).maybeSingle(),
    ])
    setRolePerms(normalizeRolePerms(settings?.data?.rolePermissions))
    if (!profile) { setUser(null); setStatus('no_profile'); return }
    if (profile.status !== 'active') { setUser(null); setStatus('disabled'); return }
    setUser({
      id: authUserId,
      email,
      login_id: profile.login_id,
      full_name: profile.full_name || profile.login_id,
      role: profile.role as AppRole,
      employee_id: profile.employee_id ?? null,
    })
    setStatus('ready')
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) void loadProfile(data.session?.user.id ?? null, data.session?.user.email ?? '')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_IN') setStatus('loading')
      // defer: Supabase must not be called inside this callback
      setTimeout(() => { void loadProfile(session?.user.id ?? null, session?.user.email ?? '') }, 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setStatus('signed_out')
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadProfile(data.session?.user.id ?? null, data.session?.user.email ?? '')
  }, [loadProfile])

  return (
    <SetRolePermsCtx.Provider value={setRolePerms}>
      <RolePermsCtx.Provider value={rolePerms}>
        <AuthCtx.Provider value={{ status, user, signOut, refresh }}>{children}</AuthCtx.Provider>
      </RolePermsCtx.Provider>
    </SetRolePermsCtx.Provider>
  )
}

export function useAuth()         { return useContext(AuthCtx) }
export function useCurrentUser()  { return useContext(AuthCtx).user }
export function useRolePerms()    { return useContext(RolePermsCtx) }
export function useSetRolePerms() { return useContext(SetRolePermsCtx) }

export function useIsAdmin() {
  return useCurrentUser()?.role === 'admin'
}

/** Can the signed-in user open this screen? No user → no access. */
export function useCanAccess(module: ModuleKey): boolean {
  const u     = useCurrentUser()
  const perms = useContext(RolePermsCtx)
  return canAccessModule(u?.role, perms, module)
}
