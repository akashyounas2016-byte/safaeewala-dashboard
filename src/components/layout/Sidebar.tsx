import { type ElementType } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CalendarCheck, Users, UserCheck, MapPin,
  FileText, Package, BarChart3, Settings, X, ClipboardList,
} from 'lucide-react'
import { useCurrentUser, useCanAccess } from '@/store/UserContext'

const workspaceNavBase = [
  { to: '/',                label: 'Overview',        icon: LayoutDashboard },
  { to: '/bookings',        label: 'Bookings',        icon: CalendarCheck },
  { to: '/clients',         label: 'Clients',         icon: Users },
  { to: '/employees',       label: 'Employees',       icon: UserCheck },
  { to: '/dispatch',        label: 'Dispatch',        icon: MapPin },
]

const adminOnlyNav = [
  { to: '/daily-job-sheet', label: 'Daily Job Sheet', icon: ClipboardList },
]

const financeNav = [
  { to: '/invoices',  label: 'Invoices',   icon: FileText },
  { to: '/inventory', label: 'Inventory',  icon: Package },
  { to: '/reports',   label: 'Reports',    icon: BarChart3 },
  { to: '/settings',  label: 'Settings',   icon: Settings },
]

interface SidebarProps { open: boolean; onClose: () => void }

function NavItem({ to, label, icon: Icon, onClose }: { to: string; label: string; icon: ElementType; onClose: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClose}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-medium transition-all duration-150',
          isActive ? 'nav-active' : 'nav-inactive'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            className={cn('shrink-0', isActive ? 'text-[#34d399]' : 'text-[#64748b]')}
          />
          <span className="flex-1 truncate">{label}</span>
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] shrink-0" />
          )}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ onClose, showClose }: { onClose: () => void; showClose?: boolean }) {
  const currentUser    = useCurrentUser()
  const canAccessDJS   = useCanAccess('Daily Job Sheet')
  const workspaceNav   = canAccessDJS ? [...workspaceNavBase, ...adminOnlyNav] : workspaceNavBase

  return (
    <div className="flex flex-col h-full sidebar-bg">

      {/* Brand */}
      <div className="px-5 pt-6 pb-5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-extrabold text-xl text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #34d399 0%, #065f46 100%)' }}
            >
              S
            </div>
            <div>
              <p className="text-[15px] font-bold text-white leading-tight">Safaeewala</p>
              <p className="text-[11px] text-slate-400 mt-0.5">LLC · Dubai</p>
            </div>
          </div>
          {showClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-1">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3 px-3 font-semibold">
          Workspace
        </p>
        {workspaceNav.map(item => (
          <NavItem key={item.to} {...item} onClose={onClose} />
        ))}

        <div className="my-5 mx-2 border-t border-white/5" />

        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3 px-3 font-semibold">
          Finance
        </p>
        {financeNav.map(item => (
          <NavItem key={item.to} {...item} onClose={onClose} />
        ))}
      </nav>

      {/* User card */}
      <div className="px-4 pb-5 shrink-0">
        <div className="border-t border-white/5 mb-4" />
        <div className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/5 border border-white/10">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 text-black"
            style={{ background: 'linear-gradient(135deg, #fbbf24, #f97316)' }}
          >
            AY
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-white truncate leading-tight">Akash Younas</p>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">Owner · Admin</p>
          </div>
        </div>
      </div>

    </div>
  )
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex flex-col w-[260px] shrink-0 h-screen overflow-hidden">
        <SidebarContent onClose={() => {}} />
      </aside>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[260px] lg:hidden overflow-hidden',
          'transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent onClose={onClose} showClose />
      </aside>
    </>
  )
}
