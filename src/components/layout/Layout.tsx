import { createContext, useCallback, useContext, useState, useMemo } from 'react'
import { ModuleTabs } from './ModuleTabs'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Menu, Bot, ChevronRight } from 'lucide-react'
import { CRMAIBotModal } from '@/components/ai/CRMAIBotModal'
import { useData } from '@/store/DataContext'
import { useFieldStaff } from '@/store/useFieldStaff'
import { analyzeCRMHealth } from '@/lib/crmAIBot'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SyncStatusBanner } from './SyncStatusBanner'
import { Toaster } from 'sonner'
import { ConfirmHost } from '@/components/common/ConfirmHost'
import { FormGuard } from '@/components/common/FormGuard'

/* ── Layout context — lets PageHero access openMenu and toggleSidebar ── */
export const LayoutContext = createContext<{
  openMenu: () => void
  /** R-ALERT-01: Alerts → AI Bot findings open the AI Bot */
  openAIBot: () => void
  /** UX-112: AI Bot findings, shown on the AI Bot item in the sidebar */
  aiIssueCount?: number
  aiHighIssues?: number
  toggleSidebar?: () => void
  isSidebarCollapsed?: boolean
  /** UX-114: full-screen mode for a page (WhatsApp) — no sidebar, no page padding; "Back to Sidebar" turns it off */
  focusMode?: boolean
  setFocusMode?: (on: boolean) => void
}>({ openMenu: () => {}, openAIBot: () => {} })
export const useLayout = () => useContext(LayoutContext)

export function Layout() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('safaeewala_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [showAIBot, setShowAIBot]     = useState(false)
  const [focusMode, setFocusMode]     = useState(false)
  // full screen belongs to one page: leaving it brings the sidebar back
  const [focusPath, setFocusPath]     = useState<string | null>(null)
  if (focusMode && focusPath !== null && focusPath !== location.pathname) { setFocusMode(false); setFocusPath(null) }
  // stable, so a page can turn full screen off when it unmounts without turning it off on every render
  const pathname = location.pathname
  const enterFocus = useCallback((on: boolean) => { setFocusMode(on); setFocusPath(on ? pathname : null) }, [pathname])

  const handleToggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('safaeewala_sidebar_collapsed', String(next)) } catch {}
      return next
    })
  }

  const { bookings, clients } = useData()
  // R-SEC-05: cleaners / drivers get no AI bot (revenue, OT reports) and no office notifications
  const { isField } = useFieldStaff()

  // Real-time AI Health Analysis
  const aiHealth = useMemo(() => {
    return analyzeCRMHealth(bookings, clients)
  }, [bookings, clients])

  const issueCount = aiHealth.issues.length
  const highIssues = aiHealth.issues.filter(i => i.severity === 'high')

  return (
    <LayoutContext.Provider
      value={{
        openMenu: () => setSidebarOpen(true),
        openAIBot: () => setShowAIBot(true),
        aiIssueCount: issueCount,
        aiHighIssues: highIssues.length,
        toggleSidebar: handleToggleSidebar,
        isSidebarCollapsed: sidebarCollapsed,
        focusMode,
        setFocusMode: enterFocus,
      }}
    >
      <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7f6]">
        {!focusMode && <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
        />}

        {/* Floating Expand Sidebar Button (Shown when sidebar is collapsed on desktop) */}
        {sidebarCollapsed && !focusMode && (
          <button
            type="button"
            onClick={handleToggleSidebar}
            className="hidden lg:flex fixed left-0 top-5 z-40 items-center gap-2 pl-3 pr-3.5 py-2.5 bg-[#0B1215] hover:bg-[#064e3b] text-white rounded-r-2xl border-y border-r border-emerald-500/40 shadow-[0_8px_25px_rgba(0,0,0,0.35)] hover:pl-4 transition-all cursor-pointer group animate-in fade-in slide-in-from-left-4 duration-200"
            title="Expand / Show Sidebar"
            aria-label="Expand Sidebar"
          >
            <div className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ChevronRight size={15} />
            </div>
            <span className="text-[12px] font-bold text-slate-200 group-hover:text-white">
              Safaeewala
            </span>
          </button>
        )}

        <div className="flex flex-col flex-1 min-w-0 bg-[#f0f4f3]">
          {/* Mobile-only top bar (hamburger + logo) */}
          <div className={`${focusMode ? 'hidden' : 'lg:hidden flex'} items-center justify-between px-4 h-14 bg-[#0B1215] border-b border-white/10 shrink-0`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Menu size={18} />
              </button>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-sm"
                  style={{ background: 'linear-gradient(135deg, #34d399 0%, #065f46 100%)' }}>
                  S
                </div>
                <span className="text-white font-semibold text-sm">Safaeewala</span>
              </div>
            </div>

            {!isField && (
            <button
              onClick={() => setShowAIBot(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/90 text-white font-bold text-[11px] shadow-sm"
            >
              <Bot size={13} className="text-emerald-400" />
              <span>AI Bot ({issueCount})</span>
            </button>
            )}
          </div>

          <main id="main-content-scroll" className="flex-1 overflow-y-auto bg-[#f0f4f3] scroll-smooth overscroll-y-auto">
            <div className={focusMode ? 'h-full p-2 sm:p-3' : `max-w-[1440px] mx-auto pt-4 sm:pt-6 lg:pt-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))] ${isField ? 'px-3 sm:px-6 lg:px-8' : 'px-4 sm:px-6 lg:px-8'}`}>
              {/* R-ALERT-01: notifications and AI Bot alerts live in Sidebar → Alerts, not on every screen */}
              <SyncStatusBanner />
              <Toaster position="top-right" richColors closeButton />
              <ConfirmHost />
              <FormGuard /> {/* UX-84: required fields in every popup */}

              {/* UX-117: Clients · Monthly Clients, Expenses · Inventory, Reports · Analytics, Alerts · Complaints */}
              <div className="mb-4 empty:hidden"><ModuleTabs /></div>
              <ErrorBoundary key={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>

          {/* UX-112: the AI Bot opens from Sidebar → AI Bot (the floating button bottom-right was removed) */}
          {/* ── AI Bot Draggable Floating Window / Chat Pop-up ── */}
          <CRMAIBotModal
            open={showAIBot && !isField}
            onClose={() => setShowAIBot(false)}
          />
        </div>
      </div>
    </LayoutContext.Provider>
  )
}

