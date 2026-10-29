import { supabase } from '@/lib/supabase'

/**
 * Send the signed-in user's token with every call to our own server (/api/…), so the VPS can
 * refuse anyone who is not signed in (SEC-04). Installed once in main.tsx; calls that already
 * set an Authorization header are left alone.
 */
export function installApiAuth(): void {
  if (typeof window === 'undefined' || (window.fetch as { __apiAuth?: boolean }).__apiAuth) return
  const original = window.fetch.bind(window)
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const sameOriginApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`)
    if (!sameOriginApi) return original(input, init)
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
    if (!headers.has('Authorization')) {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }
    return original(input, { ...init, headers })
  }
  ;(wrapped as { __apiAuth?: boolean }).__apiAuth = true
  window.fetch = wrapped as typeof window.fetch
}
