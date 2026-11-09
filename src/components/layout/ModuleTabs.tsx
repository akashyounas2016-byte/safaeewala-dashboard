import { NavLink, useLocation } from 'react-router-dom'
import { useAuth, useRolePerms } from '@/store/UserContext'
import { useFieldStaff } from '@/store/useFieldStaff'
import { canAccessModule, moduleForPath } from '@/lib/permissions'
import { MODULE_GROUPS } from '@/lib/moduleGroups'

/** UX-117: the tabs of a merged screen (Clients · Monthly Clients, Expenses · Inventory, …) — only the allowed ones */
export function ModuleTabs() {
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
  return (
    <nav aria-label="Sections" className="flex items-center gap-1 p-1 bg-white rounded-2xl border border-[#E4E8EC] shadow-[0_2px_10px_rgba(15,23,42,0.04)] w-fit max-w-full overflow-x-auto">
      {tabs.map(t => (
        <NavLink key={t.to} to={t.to} end
          className={({ isActive }) => `px-4 py-2 rounded-xl text-[13px] whitespace-nowrap transition-colors ${isActive ? 'bg-[#0F1F19] text-white font-bold' : 'text-slate-600 font-semibold hover:bg-slate-50'}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
