import { NavLink, useLocation } from 'react-router-dom'
import { useAuth, useRolePerms } from '@/store/UserContext'
import { useFieldStaff } from '@/store/useFieldStaff'
import { canAccessModule, moduleForPath } from '@/lib/permissions'
import { MODULE_GROUPS } from '@/lib/moduleGroups'

/** UX-117: the tabs of a merged screen (Clients · Monthly Clients, Expenses · Inventory, …) — only the allowed ones */
export function ModuleTabs({ tone = 'light' }: { tone?: 'light' | 'dark' } = {}) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const perms = useRolePerms()
  const field = useFieldStaff()
  // only on the tab screens themselves (not on a client profile, …)
  const path = pathname.replace(/\/+$/, '')
  const parent = Object.keys(MODULE_GROUPS).find(p => MODULE_GROUPS[p].some(t => t.to === path))
  if (!parent) return null
  const staffRole = user?.role === 'employee' ? field.employee?.role : undefined
  const tabs = MODULE_GROUPS[parent].filter(t => { const m = moduleForPath(t.to); return !m || canAccessModule(user?.role, perms, m, staffRole) })
  if (tabs.length < 2) return null
  const dark = tone === 'dark'
  return (
    <nav aria-label="Sections" className={dark
      ? 'relative z-10 mt-5 -mb-1 flex items-center gap-1 p-1 rounded-2xl bg-white/10 border border-white/15 w-fit max-w-full overflow-x-auto backdrop-blur-sm'
      : '-mt-2 mb-6 flex items-center gap-1 p-1 bg-white rounded-2xl border border-[#E4E8EC] shadow-[0_2px_10px_rgba(15,23,42,0.04)] w-fit max-w-full overflow-x-auto'}>
      {tabs.map(t => (
        <NavLink key={t.to} to={t.to} end
          className={({ isActive }) => `px-4 py-1.5 rounded-xl text-[13px] whitespace-nowrap transition-colors ${dark
            ? (isActive ? 'bg-white text-[#0F1F19] font-bold shadow-sm' : 'text-white/75 font-semibold hover:text-white hover:bg-white/10')
            : (isActive ? 'bg-[#0F1F19] text-white font-bold' : 'text-slate-600 font-semibold hover:bg-slate-50')}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
