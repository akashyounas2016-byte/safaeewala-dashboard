import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

export type AppRole = 'admin' | 'developer' | 'employee'

export interface CurrentUser {
  id: string
  email: string
  full_name: string
  role: AppRole
}

const UserContext = createContext<CurrentUser | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: auth } = await supabase.auth.getUser()
        if (!auth.user) return
        const { data: profile } = await supabase
          .from('profiles').select('full_name, role').eq('id', auth.user.id).single()
        setUser({
          id:        auth.user.id,
          email:     auth.user.email ?? '',
          full_name: profile?.full_name ?? '',
          role:      (profile?.role ?? 'admin') as AppRole,
        })
      } catch {
        // silently fail — AdminRoute handles null user gracefully
      }
    }
    load()
  }, [])

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

export function useCurrentUser() { return useContext(UserContext) }

export function useIsAdmin() {
  const u = useCurrentUser()
  return u?.role === 'admin' || u?.role === 'developer'
}
