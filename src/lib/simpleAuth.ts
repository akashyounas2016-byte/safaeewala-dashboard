import { createElement, useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'

export interface AdminCredentials {
  username: string
  password: string
}

export interface AuthSession {
  isAuthenticated: boolean
  username: string
  loggedInAt: number
  expiresAt: number
}

const SESSION_KEY = 'safaeewala_auth_session'
const CUSTOM_CREDS_KEY = 'safaeewala_admin_custom_credentials'
const ATTEMPTS_KEY = 'safaeewala_login_attempts'

// 7 days session lifetime (in ms)
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000

/**
 * Detects whether the app is running locally (localhost / dev mode).
 * On local dev, password & login screen are bypassed.
 * On VPS / production deployment, login screen is active and enforced.
 */
export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return (
    Boolean(import.meta.env.DEV) ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local')
  )
}

export function getAdminCredentials(): AdminCredentials {
  // 1. Check if custom credentials were saved in localStorage
  try {
    const custom = localStorage.getItem(CUSTOM_CREDS_KEY)
    if (custom) {
      const parsed = JSON.parse(custom)
      if (parsed.username && parsed.password) {
        return parsed
      }
    }
  } catch {
    // fallback
  }

  // 2. Read from .env via Vite (VITE_ADMIN_USERNAME / VITE_ADMIN_PASSWORD)
  const envUser = import.meta.env.VITE_ADMIN_USERNAME || import.meta.env.VITE_ADMIN_USER
  const envPass = import.meta.env.VITE_ADMIN_PASSWORD || import.meta.env.VITE_ADMIN_PASS

  return {
    username: (envUser || 'admin').trim(),
    password: (envPass || 'safaeewala2026').trim(),
  }
}

export function saveCustomCredentials(creds: AdminCredentials) {
  try {
    localStorage.setItem(CUSTOM_CREDS_KEY, JSON.stringify(creds))
  } catch (err) {
    console.error('Failed to save custom credentials:', err)
  }
}

export function getStoredSession(): AuthSession | null {
  try {
    // Check localStorage first (remember me), then sessionStorage
    const local = localStorage.getItem(SESSION_KEY)
    const session = local || sessionStorage.getItem(SESSION_KEY)
    if (!session) return null

    const data: AuthSession = JSON.parse(session)
    if (!data.isAuthenticated) return null

    // Check expiry
    if (data.expiresAt && Date.now() > data.expiresAt) {
      clearStoredSession()
      return null
    }

    return data
  } catch {
    clearStoredSession()
    return null
  }
}

export function saveStoredSession(session: AuthSession, rememberMe: boolean) {
  try {
    const json = JSON.stringify(session)
    if (rememberMe) {
      localStorage.setItem(SESSION_KEY, json)
    } else {
      sessionStorage.setItem(SESSION_KEY, json)
    }
  } catch (err) {
    console.error('Failed to save session:', err)
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

// ── Rate Limiting for Login Protection ──
interface LoginRateLimit {
  count: number
  lockedUntil: number
}

export function checkRateLimit(): { isLocked: boolean; remainingSeconds: number } {
  try {
    const raw = sessionStorage.getItem(ATTEMPTS_KEY)
    if (!raw) return { isLocked: false, remainingSeconds: 0 }
    const limit: LoginRateLimit = JSON.parse(raw)
    const now = Date.now()
    if (limit.lockedUntil && now < limit.lockedUntil) {
      return {
        isLocked: true,
        remainingSeconds: Math.ceil((limit.lockedUntil - now) / 1000),
      }
    }
  } catch {
    // ignore
  }
  return { isLocked: false, remainingSeconds: 0 }
}

export function recordFailedAttempt(): { isLocked: boolean; remainingSeconds: number } {
  try {
    const now = Date.now()
    const raw = sessionStorage.getItem(ATTEMPTS_KEY)
    const limit: LoginRateLimit = raw ? JSON.parse(raw) : { count: 0, lockedUntil: 0 }
    limit.count += 1

    if (limit.count >= 5) {
      limit.lockedUntil = now + 60 * 1000 // lock for 60 seconds
      limit.count = 0
      sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(limit))
      return { isLocked: true, remainingSeconds: 60 }
    }

    sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(limit))
  } catch {
    // ignore
  }
  return { isLocked: false, remainingSeconds: 0 }
}

export function resetRateLimit() {
  try {
    sessionStorage.removeItem(ATTEMPTS_KEY)
  } catch {
    // ignore
  }
}

// ── Authentication Context & Hook ──
interface SimpleAuthContextType {
  isAuthenticated: boolean
  currentUser: string | null
  login: (username: string, password: string, rememberMe?: boolean) => { success: boolean; error?: string }
  logout: () => void
}

const SimpleAuthContext = createContext<SimpleAuthContextType>({
  isAuthenticated: false,
  currentUser: null,
  login: () => ({ success: false }),
  logout: () => {},
})

export function SimpleAuthProvider({ children }: { children: ReactNode }) {
  const isLocal = isLocalEnvironment()
  const [session, setSession] = useState<AuthSession | null>(() => {
    if (isLocal) {
      return {
        isAuthenticated: true,
        username: 'admin',
        loggedInAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL,
      }
    }
    return getStoredSession()
  })

  useEffect(() => {
    if (isLocal) return
    // Re-verify on mount or storage events (cross-tab sync)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) {
        setSession(getStoredSession())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [isLocal])

  const login = useCallback((usernameInput: string, passwordInput: string, rememberMe: boolean = true) => {
    const rate = checkRateLimit()
    if (rate.isLocked) {
      return {
        success: false,
        error: `Bohat zyada nakam koshishain! Baraye meherbani ${rate.remainingSeconds} second intezar karein.`,
      }
    }

    const creds = getAdminCredentials()
    const inputUser = usernameInput.trim()
    const inputPass = passwordInput.trim()

    // Case-insensitive comparison for username, exact match for password
    const userMatch = inputUser.toLowerCase() === creds.username.toLowerCase()
    const passMatch = inputPass === creds.password

    if (userMatch && passMatch) {
      resetRateLimit()
      const newSession: AuthSession = {
        isAuthenticated: true,
        username: creds.username,
        loggedInAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL,
      }
      saveStoredSession(newSession, rememberMe)
      setSession(newSession)
      return { success: true }
    } else {
      const lockStatus = recordFailedAttempt()
      if (lockStatus.isLocked) {
        return {
          success: false,
          error: `Ghalat credentials! 5 nakam koshishon ke baad system 60 second ke liye lock ho gaya hai.`,
        }
      }
      return {
        success: false,
        error: 'Ghalat username ya password. Baraye meherbani durust credentials darj karein.',
      }
    }
  }, [])

  const logout = useCallback(() => {
    clearStoredSession()
    if (!isLocal) {
      setSession(null)
    }
  }, [isLocal])

  return createElement(
    SimpleAuthContext.Provider,
    {
      value: {
        isAuthenticated: isLocal || !!session?.isAuthenticated,
        currentUser: session?.username ?? (isLocal ? 'admin' : null),
        login,
        logout,
      },
    },
    children
  )
}

export function useSimpleAuth() {
  return useContext(SimpleAuthContext)
}
