import { type ElementType } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CalendarCheck, Users, UserCheck,
  FileText, Package, TrendingDown, BarChart3, Settings, X, ClipboardList,
  CreditCard, TrendingUp, Globe, Clock, MessageSquare, LogOut,
} from 'lucide-react'
import { useCurrentUser, useCanAccess } from '@/store/UserContext'
import { useFluentFormsUnreadCount, markFluentFormsAsRead } from '@/lib/fluentFormsSync'
import { useSimpleAuth, isLocalEnvironment } from '@/lib/simpleAuth'

const workspaceNavBase: Array<{ to: string; label: string; icon: ElementType; tag?: string }> = [
  { to: '/',                 label: 'Overview',        icon: LayoutDashboard, tag: 'Coming Soon' },
  { to: '/bookings',         label: 'Bookings',        icon: CalendarCheck,   tag: 'Coming Soon' },
  { to: '/fluent-forms',     label: 'Fluent Forms',    icon: Globe },
  { to: '/whatsapp-crm',     label: 'WhatsApp CRM',    icon: MessageSquare,   tag: 'Coming Soon' },
  { to: '/clients',          label: 'Clients',         icon: Users },
  { to: '/monthly-clients',  label: 'Monthly Clients', icon: TrendingUp },
  { to: '/employees',        label: 'Employees',       icon: UserCheck },
]

const adminOnlyNav = [
  { to: '/daily-job-sheet', label: 'Daily Job Sheet', icon: ClipboardList },
]

const financeNav = [
  { to: '/invoices',         label: 'Invoices',         icon: FileText },
  { to: '/inventory',        label: 'Inventory',        icon: Package },
  { to: '/expenses',         label: 'Expenses',         icon: TrendingDown },
  { to: '/payments',         label: 'Payments',         icon: CreditCard },
  { to: '/pending',          label: 'Pending',          icon: Clock },
]

const operationsNav = [
  { to: '/reports',       label: 'Reports',       icon: BarChart3 },
  { to: '/analytics',     label: 'Analytics',     icon: BarChart3 },
  { to: '/settings',      label: 'Settings',      icon: Settings },
]

interface SidebarProps { open: boolean; onClose: () => void }

interface NavItemProps {
  to: string
  label: string
  icon: ElementType
  onClose: () => void
  tag?: string
  badge?: number
  onClick?: () => void
}

function NavItem({ to, label, icon: Icon, onClose, tag, badge, onClick }: NavItemProps) {
  const handleClick = () => {
    onClose()
    if (onClick) onClick()
  }

  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={handleClick}
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
          {tag && (
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[9.5px] font-bold tracking-wide uppercase shrink-0 transition-colors',
                isActive
                  ? 'bg-amber-400 text-amber-950 font-extrabold shadow-xs'
                  : 'bg-amber-400/10 text-amber-300 border border-amber-400/25'
              )}
            >
              {tag}
            </span>
          )}
          {typeof badge === 'number' && badge > 0 && !tag && (
            <span
              title={`${badge} new form submission${badge > 1 ? 's' : ''}`}
              className="inline-flex items-center justify-center px-2 py-0.5 min-w-[20px] h-5 rounded-full text-[11px] font-black bg-[#34d399] text-[#064e3b] shadow-[0_2px_10px_rgba(52,211,153,0.45)] animate-pulse shrink-0"
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
          {isActive && !tag && !(typeof badge === 'number' && badge > 0) && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] shrink-0" />
          )}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ onClose, showClose }: { onClose: () => void; showClose?: boolean }) {
  const currentUser    = useCurrentUser()
  const { logout, currentUser: authUser } = useSimpleAuth()
  const canAccessDJS   = useCanAccess('Daily Job Sheet')
  const workspaceNav   = canAccessDJS ? [...workspaceNavBase, ...adminOnlyNav] : workspaceNavBase
  const fluentUnreadCount = useFluentFormsUnreadCount()

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
        {workspaceNav.map(item => {
          const isFluent = item.to === '/fluent-forms'
          return (
            <NavItem
              key={item.to}
              {...item}
              badge={isFluent ? fluentUnreadCount : undefined}
              onClick={isFluent ? () => markFluentFormsAsRead() : undefined}
              onClose={onClose}
            />
          )
        })}

        <div className="my-5 mx-2 border-t border-white/5" />

        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3 px-3 font-semibold">
          Finance & Operations
        </p>
        {financeNav.map(item => (
          <NavItem key={item.to} {...item} onClose={onClose} />
        ))}

        <div className="my-5 mx-2 border-t border-white/5" />

        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3 px-3 font-semibold">
          Operations
        </p>
        {operationsNav.map(item => (
          <NavItem key={item.to} {...item} onClose={onClose} />
        ))}
      </nav>

      {/* User card with Sign Out button */}
      <div className="px-4 pb-5 shrink-0">
        <div className="border-t border-white/5 mb-4" />
        <div className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 text-black shadow-sm"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f97316)' }}
            >
              AY
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white truncate leading-tight">
                {authUser || currentUser?.full_name || 'Akash Younas'}
              </p>
              <p className="text-[10.5px] text-emerald-400 truncate mt-0.5 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Admin · Active</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isLocalEnvironment()) {
                alert('Local Environment: Password & Login screen are disabled locally. The login screen is active on the VPS production server.')
                return
              }
              if (window.confirm('Kiya aap Safaeewala CRM se Sign Out karna chahtay hain?')) {
                logout()
              }
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
            title="Sign Out / Lock CRM"
          >
            <LogOut size={16} />
          </button>
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
