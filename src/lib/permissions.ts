/**
 * Login + screen permissions (SEC-01, R-SEC-03).
 * Users sign in with a Login ID (e.g. SW-0007) or an email; an admin creates every user —
 * there is no sign-up. What a user can open depends on their role.
 */

export type AppRole = 'admin' | 'manager' | 'employee'

export const ROLE_META: Record<AppRole, { label: string; desc: string; badge: string }> = {
  admin:    { label: 'Admin',    desc: 'Everything, including users, roles and settings', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  manager:  { label: 'Manager',  desc: 'Day-to-day operations; screens chosen by the admin; can delete records', badge: 'bg-sky-50 text-sky-800 border-sky-200' },
  employee: { label: 'Employee', desc: 'Only the screens the admin allows; cannot delete records', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
}

/** Every screen that can be allowed or blocked, with the routes that belong to it */
export const APP_MODULES = [
  { key: 'Overview',        paths: ['/'] },
  { key: 'Bookings',        paths: ['/bookings'] },
  { key: 'Daily Job Sheet', paths: ['/daily-job-sheet'] },
  { key: 'Fluent Forms',    paths: ['/fluent-forms', '/whatsapp-crm', '/marketing', '/feedback'] },
  { key: 'Clients',         paths: ['/clients'] },
  { key: 'Monthly Clients', paths: ['/monthly-clients', '/subscriptions'] },
  { key: 'Employees',       paths: ['/employees'] },
  { key: 'Attendance',      paths: ['/attendance'] },
  { key: 'Agencies',        paths: ['/agencies'] },
  { key: 'Invoices',        paths: ['/invoices', '/monthly-invoices'] },
  { key: 'Inventory',       paths: ['/inventory'] },
  { key: 'Expenses',        paths: ['/expenses'] },
  { key: 'Payments',        paths: ['/payments'] },
  { key: 'Pending',         paths: ['/pending'] },
  { key: 'Reports',         paths: ['/reports'] },
  { key: 'Analytics',       paths: ['/analytics'] },
  { key: 'Settings',        paths: ['/settings'] },
] as const

export type ModuleKey = (typeof APP_MODULES)[number]['key']
export const ALL_MODULE_KEYS = APP_MODULES.map(m => m.key) as ModuleKey[]

/** Screens each role gets until the admin changes them (admin always gets everything) */
export type RolePerms = Record<Exclude<AppRole, 'admin'>, ModuleKey[]>
export const DEFAULT_ROLE_PERMS: RolePerms = {
  manager:  ALL_MODULE_KEYS.filter(k => k !== 'Settings'),
  employee: ['Overview', 'Bookings', 'Attendance'],
}

/** Which screen a URL belongs to ("/clients/123" → Clients) */
export function moduleForPath(pathname: string): ModuleKey | null {
  const p = pathname.replace(/\/+$/, '') || '/'
  let best: { key: ModuleKey; len: number } | null = null
  for (const m of APP_MODULES) {
    for (const base of m.paths) {
      const hit = base === '/' ? p === '/' : p === base || p.startsWith(`${base}/`)
      if (hit && (!best || base.length > best.len)) best = { key: m.key, len: base.length }
    }
  }
  return best?.key ?? null
}

/** Clean stored permissions: keep only known screens */
export function normalizeRolePerms(stored: unknown): RolePerms {
  const out: RolePerms = { manager: [...DEFAULT_ROLE_PERMS.manager], employee: [...DEFAULT_ROLE_PERMS.employee] }
  if (stored && typeof stored === 'object') {
    for (const role of ['manager', 'employee'] as const) {
      const list = (stored as Record<string, unknown>)[role]
      if (Array.isArray(list)) out[role] = list.filter((k): k is ModuleKey => ALL_MODULE_KEYS.includes(k as ModuleKey))
    }
  }
  return out
}

export function canAccessModule(role: AppRole | undefined, perms: RolePerms, module: ModuleKey): boolean {
  if (!role) return false
  if (role === 'admin') return true
  return perms[role].includes(module)
}

/** First screen a user may open (for redirects) */
export function firstAllowedPath(role: AppRole | undefined, perms: RolePerms): string | null {
  const m = APP_MODULES.find(x => canAccessModule(role, perms, x.key))
  return m ? m.paths[0] : null
}

// ── Login IDs and passwords (same rules as the server, webhookServer.cjs) ──
export const LOGIN_EMAIL_DOMAIN = 'staff.safaeewala.com'

/** "SW-0007" → "sw-0007@staff.safaeewala.com"; a real email is used as it is */
export function loginIdToEmail(loginId: string): string {
  const id = loginId.trim().toLowerCase()
  return id.includes('@') ? id : `${id}@${LOGIN_EMAIL_DOMAIN}`
}

/** null when the password is strong enough, else what is missing */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'At least 10 characters.'
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use upper case, lower case and a number.'
  return null
}

/** 0–4 strength score for the meter */
export function passwordStrength(pw: string): number {
  let s = 0
  if (pw.length >= 10) s++
  if (pw.length >= 14) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  return s
}

/** Random strong password (no look-alike characters) */
export function generatePassword(length = 14): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*?']
  const all = sets.join('')
  const rnd = (n: number) => {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] % n
  }
  const chars = sets.map(s => s[rnd(s.length)])
  while (chars.length < length) chars.push(all[rnd(all.length)])
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join('')
}

/** Next employee login ID: SW-0001, SW-0002 … */
export function nextLoginId(existing: string[]): string {
  const nums = existing.map(id => /^SW-(\d+)$/i.exec(id)?.[1]).filter(Boolean).map(Number)
  const n = (nums.length ? Math.max(...nums) : 0) + 1
  return `SW-${String(n).padStart(4, '0')}`
}
