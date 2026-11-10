/* eslint-disable react-refresh/only-export-components -- context file: provider + its hooks belong together */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
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

  /** Who is signed in now — a repeated SIGNED_IN for the same person must not reload the app (SET-01) */
  const signedInAs = useRef<string | null>(null)
  const profileRetries = useRef(0)
  const loadProfileRef = useRef<(id: string | null, email: string) => Promise<void>>(async () => {})

  const loadProfile = useCallback(async (authUserId: string | null, email: string) => {
    if (!authUserId) { signedInAs.current = null; setUser(null); setStatus('signed_out'); return }
    const [{ data: profile, error: profError }, { data: settings }] = await Promise.all([
      supabase.from('profiles').select('login_id, full_name, role, status, employee_id').eq('id', authUserId).maybeSingle(),
      supabase.from('company_settings').select('data').eq('id', 1).maybeSingle(),
    ])
    setRolePerms(normalizeRolePerms(settings?.data?.rolePermissions))
    // Network glitch / temporary error: keep existing signed-in user instead of kicking out to no_profile / signed_out
    if (profError) {
      console.warn('Profile fetch network error:', profError.message)
      if (signedInAs.current === authUserId) return
      // First sign-in and the profile could not be read: try again shortly instead of staying on "loading" for ever
      if (profileRetries.current < 5) {
        profileRetries.current += 1
        setTimeout(() => { void loadProfileRef.current(authUserId, email) }, 3000)
        return
      }
    }
    profileRetries.current = 0
    if (!profile) {
      // no profile row → no_profile; still no answer after the retries → back to the sign-in screen (never stuck)
      signedInAs.current = null; setUser(null); setStatus(profError ? 'signed_out' : 'no_profile')
      return
    }
    if (profile.status !== 'active') { signedInAs.current = null; setUser(null); setStatus('disabled'); return }
    const next: CurrentUser = {
      id: authUserId,
      email,
      login_id: profile.login_id,
      full_name: profile.full_name || profile.login_id,
      role: profile.role as AppRole,
      employee_id: profile.employee_id ?? null,
    }
    // Same profile → keep the same object, so screens that depend on the user are not reset (SET-01)
    setUser(prev => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    signedInAs.current = authUserId
    setStatus('ready')
  }, [])
  useEffect(() => { loadProfileRef.current = loadProfile }, [loadProfile])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) void loadProfile(data.session?.user.id ?? null, data.session?.user.email ?? '')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return
      // SET-01: Supabase sends SIGNED_IN again whenever the browser tab becomes visible. Showing the
      // loader for it unmounted every screen — Settings jumped back to Company, open forms were lost.
      // Only a sign-in by someone else (or after sign-out) shows the loader; the same user is re-checked quietly.
      if (event === 'SIGNED_IN' && session?.user.id !== signedInAs.current) setStatus('loading')
      // defer: Supabase must not be called inside this callback
      setTimeout(() => { void loadProfile(session?.user.id ?? null, session?.user.email ?? '') }, 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    signedInAs.current = null
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
export function useCanAccess(module: ModuleKey, staffRole?: string | null): boolean {
  const u     = useCurrentUser()
  const perms = useContext(RolePermsCtx)
  return canAccessModule(u?.role, perms, module, staffRole)
}
