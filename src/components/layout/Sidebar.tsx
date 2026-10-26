import { useState, useMemo, type ElementType } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CalendarCheck, Users, UserCheck,
  FileText, Package, TrendingDown, BarChart3, Settings, X, ClipboardList,
  CreditCard, TrendingUp, Globe, Clock, LogOut, ChevronLeft, Building2,
  CalendarDays, Star, SlidersHorizontal, ArrowUp, ArrowDown, RotateCcw, Sparkles,
} from 'lucide-react'
import { useCurrentUser, useCanAccess } from '@/store/UserContext'
import { useFluentFormsUnreadCount, markFluentFormsAsRead } from '@/lib/fluentFormsSync'
import { useSimpleAuth, isLocalEnvironment } from '@/lib/simpleAuth'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

export interface NavItemConfig {
  to: string
  label: string
  icon: ElementType
  tag?: string
  category: 'Workspace' | 'Finance & Operations' | 'Operations'
  adminOnly?: boolean
}

export const ALL_NAV_ITEMS: NavItemConfig[] = [
  // ── Workspace ──
  { to: '/',                 label: 'Overview',          icon: LayoutDashboard, tag: 'Coming Soon', category: 'Workspace' },
  { to: '/bookings',         label: 'Bookings',          icon: CalendarCheck,                              category: 'Workspace' },
  { to: '/daily-job-sheet',  label: 'Daily Job Sheet',   icon: ClipboardList,   adminOnly: true,    category: 'Workspace' },
  { to: '/fluent-forms',     label: 'Fluent Forms',      icon: Globe,                               category: 'Workspace' },
  { to: '/clients',          label: 'Clients',           icon: Users,                               category: 'Workspace' },
  { to: '/monthly-clients',  label: 'Monthly Clients',   icon: TrendingUp,                          category: 'Workspace' },
  { to: '/employees',        label: 'Employees',         icon: UserCheck,                           category: 'Workspace' },
  { to: '/attendance',       label: 'Attendance System', icon: CalendarDays,                        category: 'Workspace' },
  { to: '/agencies',         label: 'Agencies',          icon: Building2,                           category: 'Workspace' },

  // ── Finance & Operations ──
  { to: '/invoices',         label: 'Invoices',          icon: FileText,                            category: 'Finance & Operations' },
  { to: '/inventory',        label: 'Inventory',         icon: Package,                             category: 'Finance & Operations' },
  { to: '/expenses',         label: 'Expenses',          icon: TrendingDown,                        category: 'Finance & Operations' },
  { to: '/payments',         label: 'Payments',          icon: CreditCard,                          category: 'Finance & Operations' },
  { to: '/pending',          label: 'Pending',           icon: Clock,                               category: 'Finance & Operations' },

  // ── Operations ──
  { to: '/reports',          label: 'Reports',           icon: BarChart3,                           category: 'Operations' },
  { to: '/analytics',        label: 'Analytics',         icon: BarChart3,                           category: 'Operations' },
  { to: '/settings',         label: 'Settings',          icon: Settings,                            category: 'Operations' },
]

export interface SidebarProps {
  open: boolean
  onClose: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

interface NavItemProps {
  to: string
  label: string
  icon: ElementType
  onClose: () => void
  tag?: string
  badge?: number
  onClick?: () => void
  isFavorite?: boolean
  onToggleFavorite?: (e: React.MouseEvent) => void
}

function NavItem({ to, label, icon: Icon, onClose, tag, badge, onClick, isFavorite, onToggleFavorite }: NavItemProps) {
  const handleClick = () => {
    onClose()
    if (to === '/agencies') {
      window.dispatchEvent(new CustomEvent('nav-agencies-main'))
    }
    if (onClick) onClick()
  }

  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={handleClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-medium transition-all duration-150 group',
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

          {/* Quick Favorite Star Button */}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleFavorite(e)
              }}
              className={cn(
                'p-1 rounded-lg transition-all cursor-pointer shrink-0 ml-1',
                isFavorite
                  ? 'text-amber-400 hover:text-amber-300 opacity-100'
                  : 'text-slate-500 hover:text-amber-400 opacity-0 group-hover:opacity-100'
              )}
              title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites (Pin to Top)'}
              aria-label={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            >
              <Star
                size={13}
                className={cn('transition-transform hover:scale-115', isFavorite && 'fill-amber-400')}
              />
            </button>
          )}

          {isActive && !tag && !(typeof badge === 'number' && badge > 0) && !isFavorite && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] shrink-0" />
          )}
        </>
      )}
    </NavLink>
  )
}

interface SidebarContentProps {
  onClose: () => void
  showClose?: boolean
  onToggleCollapse?: () => void
}

function SidebarContent({ onClose, onToggleCollapse }: SidebarContentProps) {
  const currentUser    = useCurrentUser()
  const { logout, currentUser: authUser } = useSimpleAuth()
  const canAccessDJS   = useCanAccess('Daily Job Sheet')
  const fluentUnreadCount = useFluentFormsUnreadCount()

  // ── Customizer Modal State ──
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // ── Sidebar Sequence Order (persisted in localStorage) ──
  const [navOrder, setNavOrder] = useState<string[]>(() => {
    const defaultList = ALL_NAV_ITEMS.map(i => i.to)
    const saved = safeLocalStorageGet<string[]>('safaeewala_sidebar_nav_order', [])
    if (!Array.isArray(saved) || saved.length === 0) return defaultList
    // Make sure all default items are present
    const valid = saved.filter(to => defaultList.includes(to))
    defaultList.forEach(to => {
      if (!valid.includes(to)) valid.push(to)
    })
    return valid
  })

  // ── Favorites (persisted in localStorage) ──
  const [favorites, setFavorites] = useState<string[]>(() => {
    return safeLocalStorageGet<string[]>('safaeewala_sidebar_favorites', [])
  })

  // ── Toggle Favorite Handler ──
  const toggleFavorite = (to: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setFavorites(prev => {
      const exists = prev.includes(to)
      const next = exists ? prev.filter(p => p !== to) : [...prev, to]
      safeLocalStorageSet('safaeewala_sidebar_favorites', next)
      return next
    })
  }

  // ── Sequence Reorder Handlers ──
  const moveItemUp = (index: number) => {
    if (index <= 0) return
    setNavOrder(prev => {
      const next = [...prev]
      const temp = next[index]
      next[index] = next[index - 1]
      next[index - 1] = temp
      safeLocalStorageSet('safaeewala_sidebar_nav_order', next)
      return next
    })
  }

  const moveItemDown = (index: number) => {
    if (index >= navOrder.length - 1) return
    setNavOrder(prev => {
      const next = [...prev]
      const temp = next[index]
      next[index] = next[index + 1]
      next[index + 1] = temp
      safeLocalStorageSet('safaeewala_sidebar_nav_order', next)
      return next
    })
  }

  const resetToDefault = () => {
    const defaultOrder = ALL_NAV_ITEMS.map(i => i.to)
    setNavOrder(defaultOrder)
    setFavorites([])
    safeLocalStorageSet('safaeewala_sidebar_nav_order', defaultOrder)
    safeLocalStorageSet('safaeewala_sidebar_favorites', [])
  }

  // ── Sorted & Filtered Navigation Lists ──
  const sortedNavItems = useMemo(() => {
    return [...ALL_NAV_ITEMS].sort((a, b) => {
      const idxA = navOrder.indexOf(a.to)
      const idxB = navOrder.indexOf(b.to)
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB)
    })
  }, [navOrder])

  const accessibleItems = useMemo(() => {
    return sortedNavItems.filter(item => {
      if (item.adminOnly && !canAccessDJS) return false
      return true
    })
  }, [sortedNavItems, canAccessDJS])

  // Items pinned to Favorites at the very top
  const favoriteItems = useMemo(() => {
    return accessibleItems.filter(item => favorites.includes(item.to))
  }, [accessibleItems, favorites])

  // Non-favorite items for the sections below
  const nonFavoriteItems = useMemo(() => {
    return accessibleItems.filter(item => !favorites.includes(item.to))
  }, [accessibleItems, favorites])

  const workspaceNav = useMemo(() => {
    return nonFavoriteItems.filter(item => item.category === 'Workspace')
  }, [nonFavoriteItems])

  const financeNav = useMemo(() => {
    return nonFavoriteItems.filter(item => item.category === 'Finance & Operations')
  }, [nonFavoriteItems])

  const operationsNav = useMemo(() => {
    return nonFavoriteItems.filter(item => item.category === 'Operations')
  }, [nonFavoriteItems])

  // State to hide / show active Admin card
  const [hideAdminSection, setHideAdminSection] = useState(() => {
    try {
      return localStorage.getItem('safaeewala_hide_admin_card') === 'true'
    } catch {
      return false
    }
  })

  return (
    <div className="flex flex-col h-full sidebar-bg">

      {/* Brand Header */}
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

          <div className="flex items-center gap-1.5">
            {/* Sidebar Settings / Customizer Button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer shrink-0"
              title="Sidebar Settings (Change Sequence & Favorites)"
              aria-label="Sidebar Settings"
            >
              <SlidersHorizontal size={15} />
            </button>

            {/* Arrow button next to "Safaeewala LLC Dubai" to hide sidebar */}
            <button
              type="button"
              onClick={onToggleCollapse || onClose}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer shrink-0 group"
              title="Hide / Collapse Sidebar"
              aria-label="Hide Sidebar"
            >
              <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-1">
        {/* ── Favorite Items (Pinned at the very top) ── */}
        {favoriteItems.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between px-3 mb-2">
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-amber-400 font-extrabold flex items-center gap-1.5">
                <Star size={11} className="fill-amber-400 text-amber-400" />
                <span>Favorites</span>
              </p>
              <span className="text-[9px] font-black text-amber-300 bg-amber-400/15 border border-amber-400/20 px-1.5 py-0.2 rounded-md">
                {favoriteItems.length}
              </span>
            </div>
            <div className="space-y-1">
              {favoriteItems.map(item => (
                <NavItem
                  key={`fav-${item.to}`}
                  {...item}
                  isFavorite={true}
                  onToggleFavorite={(e) => toggleFavorite(item.to, e)}
                  badge={item.to === '/fluent-forms' ? fluentUnreadCount : undefined}
                  onClick={item.to === '/fluent-forms' ? () => markFluentFormsAsRead() : undefined}
                  onClose={onClose}
                />
              ))}
            </div>
            <div className="my-3 mx-2 border-t border-white/10" />
          </div>
        )}

        {/* ── Workspace ── */}
        {workspaceNav.length > 0 && (
          <>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2 px-3 font-semibold">
              Workspace
            </p>
            {workspaceNav.map(item => {
              const isFluent = item.to === '/fluent-forms'
              return (
                <NavItem
                  key={item.to}
                  {...item}
                  isFavorite={favorites.includes(item.to)}
                  onToggleFavorite={(e) => toggleFavorite(item.to, e)}
                  badge={isFluent ? fluentUnreadCount : undefined}
                  onClick={isFluent ? () => markFluentFormsAsRead() : undefined}
                  onClose={onClose}
                />
              )
            })}
          </>
        )}

        {financeNav.length > 0 && (
          <>
            <div className="my-4 mx-2 border-t border-white/5" />
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2 px-3 font-semibold">
              Finance & Operations
            </p>
            {financeNav.map(item => (
              <NavItem
                key={item.to}
                {...item}
                isFavorite={favorites.includes(item.to)}
                onToggleFavorite={(e) => toggleFavorite(item.to, e)}
                onClose={onClose}
              />
            ))}
          </>
        )}

        {operationsNav.length > 0 && (
          <>
            <div className="my-4 mx-2 border-t border-white/5" />
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2 px-3 font-semibold">
              Operations
            </p>
            {operationsNav.map(item => (
              <NavItem
                key={item.to}
                {...item}
                isFavorite={favorites.includes(item.to)}
                onToggleFavorite={(e) => toggleFavorite(item.to, e)}
                onClose={onClose}
              />
            ))}
          </>
        )}

        {/* Customize Sidebar Sequence Link */}
        <div className="pt-3 px-2">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11.5px] font-semibold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer group"
          >
            <SlidersHorizontal size={13} className="text-slate-500 group-hover:text-emerald-400 transition-colors" />
            <span className="flex-1 text-left truncate">Customize Items Sequence</span>
            <span className="text-[9px] font-bold text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.2 rounded">
              Edit
            </span>
          </button>
        </div>
      </nav>

      {/* ── Modal: Sidebar Navigation Settings ── */}
      {isSettingsOpen && (
        <Modal
          open={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          title="Sidebar Navigation Settings"
          size="lg"
          className="max-w-2xl sm:max-w-3xl"
        >
          <div className="space-y-4">
            {/* Guide Banner */}
            <div className="bg-gradient-to-r from-teal-50 via-emerald-50/60 to-slate-50 border border-teal-200/80 rounded-xl p-3.5 text-[12px] text-slate-700 space-y-1">
              <p className="font-bold text-teal-950 flex items-center gap-1.5">
                <Sparkles size={15} className="text-teal-600" />
                <span>Sequence & Favorites Manager</span>
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Click ⭐ <strong>Favorite</strong> to pin any item to the top under <strong>Favorites</strong>.
                Use <strong>▲ Up</strong> and <strong>▼ Down</strong> to arrange the navigation items in your exact preferred sequence.
              </p>
            </div>

            {/* Quick Actions & Count */}
            <div className="flex items-center justify-between text-[11.5px] px-1 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70">
              <span className="text-slate-600 font-medium flex items-center gap-2">
                <span>Total Items: <strong className="text-slate-800 font-extrabold">{accessibleItems.length}</strong></span>
                <span className="text-slate-300">|</span>
                <span>Pinned Favorites: <strong className="text-amber-700 font-extrabold">{favorites.length}</strong></span>
              </span>
              <button
                type="button"
                onClick={resetToDefault}
                className="text-slate-600 hover:text-rose-600 font-bold flex items-center gap-1.5 text-[11.5px] cursor-pointer hover:underline transition-colors"
              >
                <RotateCcw size={12} />
                <span>Reset to Default Sequence</span>
              </button>
            </div>

            {/* Scrollable Sequence List */}
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {accessibleItems.map((item, index) => {
                const isFav = favorites.includes(item.to)
                const ItemIcon = item.icon
                const isFirst = index === 0
                const isLast = index === accessibleItems.length - 1

                return (
                  <div
                    key={item.to}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isFav
                        ? 'bg-amber-50/70 border-amber-200/90 shadow-2xs'
                        : 'bg-white hover:bg-slate-50/80 border-slate-200/80 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Sequence Number */}
                      <span className="text-[11px] font-black text-slate-500 w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200/60">
                        #{index + 1}
                      </span>

                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isFav ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-2xs' : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        <ItemIcon size={16} />
                      </div>

                      {/* Label & Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13.5px] font-extrabold text-slate-800">
                            {item.label}
                          </p>
                          <span className="text-[10.5px] font-mono text-slate-400 bg-slate-100/70 px-1.5 py-0.2 rounded border border-slate-200/50">
                            {item.to}
                          </span>
                          {isFav && (
                            <span className="text-[9.5px] font-black bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                              <Star size={10} className="fill-amber-500 text-amber-600" />
                              Favorite · Top
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60">
                            {item.category}
                          </span>
                          {item.adminOnly && (
                            <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded font-bold">
                              Admin Only
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Controls: Favorite & Move Up / Down */}
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {/* Favorite Button */}
                      <button
                        type="button"
                        onClick={() => toggleFavorite(item.to)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11.5px] font-bold transition-all cursor-pointer ${
                          isFav
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300 shadow-2xs'
                            : 'bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border-slate-200 shadow-2xs'
                        }`}
                        title={isFav ? 'Remove from Favorites' : 'Pin to Top under Favorites'}
                      >
                        <Star size={13} className={isFav ? 'fill-amber-500 text-amber-600' : 'text-slate-400'} />
                        <span>{isFav ? 'Pinned' : 'Favorite'}</span>
                      </button>

                      {/* Move Up */}
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => moveItemUp(index)}
                        className="px-2.5 py-1.5 rounded-lg border bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 border-slate-200 cursor-pointer transition-colors flex items-center gap-1 text-[11.5px] font-bold shadow-2xs"
                        title="Move Up in Sequence"
                      >
                        <ArrowUp size={13} className="text-slate-500" />
                        <span>Up</span>
                      </button>

                      {/* Move Down */}
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => moveItemDown(index)}
                        className="px-2.5 py-1.5 rounded-lg border bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 border-slate-200 cursor-pointer transition-colors flex items-center gap-1 text-[11.5px] font-bold shadow-2xs"
                        title="Move Down in Sequence"
                      >
                        <ArrowDown size={13} className="text-slate-500" />
                        <span>Down</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-slate-200">
              <Button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 text-[12.5px] cursor-pointer shadow-xs"
              >
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Active Admin Section with Close / Hide Button */}
      <div className="px-4 pb-5 shrink-0">
        <div className="border-t border-white/5 mb-4" />

        {hideAdminSection ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setHideAdminSection(false)
                try { localStorage.setItem('safaeewala_hide_admin_card', 'false') } catch {}
              }}
              className="text-[10.5px] text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 py-1 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer"
              title="Unhide Active Admin Section"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Show Admin</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-2xl bg-white/5 border border-white/10 group relative">
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

            <div className="flex items-center gap-1 shrink-0">
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
                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                title="Sign Out / Lock CRM"
              >
                <LogOut size={15} />
              </button>

              {/* Close button to hide the active Admin section */}
              <button
                type="button"
                onClick={() => {
                  setHideAdminSection(true)
                  try { localStorage.setItem('safaeewala_hide_admin_card', 'true') } catch {}
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Hide Admin Section"
                aria-label="Hide Admin Section"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

export function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          'hidden lg:flex flex-col shrink-0 h-screen overflow-hidden transition-all duration-300 ease-in-out',
          collapsed
            ? 'w-0 -translate-x-full opacity-0 pointer-events-none'
            : 'w-[260px] translate-x-0 opacity-100'
        )}
      >
        <SidebarContent onClose={() => {}} onToggleCollapse={onToggleCollapse} />
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
        <SidebarContent onClose={onClose} onToggleCollapse={onClose} showClose />
      </aside>
    </>
  )
}
