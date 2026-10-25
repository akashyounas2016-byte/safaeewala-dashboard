import { createContext, useContext, useState, useMemo } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { NotificationCenter } from '@/components/NotificationCenter'
import { Menu, Bot, Sparkles, AlertTriangle } from 'lucide-react'
import { CRMAIBotModal } from '@/components/ai/CRMAIBotModal'
import { useData } from '@/store/DataContext'
import { analyzeCRMHealth } from '@/lib/crmAIBot'

/* ── Layout context — lets PageHero access openMenu ── */
export const LayoutContext = createContext<{ openMenu: () => void }>({ openMenu: () => {} })
export const useLayout = () => useContext(LayoutContext)

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showAIBot, setShowAIBot]     = useState(false)
  const [hideBanner, setHideBanner]   = useState(false)

  const { bookings, clients } = useData()

  // Real-time AI Health Analysis
  const aiHealth = useMemo(() => {
    return analyzeCRMHealth(bookings, clients)
  }, [bookings, clients])

  const issueCount = aiHealth.issues.length
  const highIssues = aiHealth.issues.filter(i => i.severity === 'high')

  return (
    <LayoutContext.Provider value={{ openMenu: () => setSidebarOpen(true) }}>
      <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7f6]">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex flex-col flex-1 min-w-0 bg-[#f0f4f3]">
          {/* Mobile-only top bar (hamburger + logo) */}
          <div className="lg:hidden flex items-center justify-between px-4 h-14 bg-[#0B1215] border-b border-white/10 shrink-0">
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

            <button
              onClick={() => setShowAIBot(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/90 text-white font-bold text-[11px] shadow-sm"
            >
              <Bot size={13} className="text-emerald-400" />
              <span>AI Bot ({issueCount})</span>
            </button>
          </div>

          <main id="main-content-scroll" className="flex-1 overflow-y-auto bg-[#f0f4f3] scroll-smooth overscroll-contain">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-10">
              <div className="mb-4">
                <NotificationCenter />
              </div>

              {/* AI Bot Duplication & Discrepancy Alert Banner */}
              {highIssues.length > 0 && !hideBanner && (
                <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-indigo-500/10 border border-amber-300/80 flex items-center justify-between flex-wrap gap-3 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Bot size={18} />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-slate-800 flex items-center gap-1.5">
                        <span>AI Bot Alert: {highIssues.length} high priority discrepancies / duplicate bookings detected!</span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.2 rounded-full bg-rose-100 text-rose-800">
                          Action Advised
                        </span>
                      </p>
                      <p className="text-[11.5px] text-slate-500 mt-0.5">
                        Move suspicious or duplicate bookings to "Pending" to prevent dispatching crew prematurely.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAIBot(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[12px] flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    >
                      <Sparkles size={13} className="text-amber-400" />
                      <span>Review in AI Bot</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHideBanner(true)}
                      className="text-slate-400 hover:text-slate-600 text-[12px] px-2 py-1 font-semibold cursor-pointer"
                      title="Hide notification for now"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <Outlet />
            </div>
          </main>

          {/* ── Persistent Floating AI Bot Trigger Button ── */}
          {!showAIBot && (
            <button
              type="button"
              onClick={() => setShowAIBot(true)}
              className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#0B1215] via-[#064e3b] to-[#0d8a72] text-white font-bold text-[12.5px] shadow-[0_10px_30px_rgba(6,78,59,0.35)] border border-[#0d8a72]/40 hover:border-emerald-400/60 hover:scale-105 active:scale-95 transition-all cursor-pointer group"
              title="Safaeewala AI Bot: Click to open interactive chat, OT reports, revenue analysis & duplicate check"
            >
              <div className="relative flex items-center justify-center">
                <Bot size={18} className="text-emerald-300 group-hover:rotate-12 transition-transform" />
                {highIssues.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
                )}
              </div>
              <span className="tracking-wide">AI Bot</span>
              {issueCount > 0 ? (
                <span className="bg-rose-500 text-white text-[11px] font-extrabold px-2 py-0.5 rounded-full shadow-2xs">
                  {issueCount}
                </span>
              ) : (
                <span className="bg-emerald-500/30 text-emerald-200 text-[10.5px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-400/20">
                  100%
                </span>
              )}
            </button>
          )}

          {/* ── AI Bot Draggable Floating Window / Chat Pop-up ── */}
          <CRMAIBotModal
            open={showAIBot}
            onClose={() => setShowAIBot(false)}
          />
        </div>
      </div>
    </LayoutContext.Provider>
  )
}

