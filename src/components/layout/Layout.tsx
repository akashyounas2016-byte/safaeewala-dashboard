import { createContext, useContext, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Menu } from 'lucide-react'

/* ── Layout context — lets PageHero access openMenu ── */
export const LayoutContext = createContext<{ openMenu: () => void }>({ openMenu: () => {} })
export const useLayout = () => useContext(LayoutContext)

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <LayoutContext.Provider value={{ openMenu: () => setSidebarOpen(true) }}>
      <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7f6]">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex flex-col flex-1 min-w-0 bg-[#f0f4f3]">
          {/* Mobile-only top bar (hamburger + logo) */}
          <div className="lg:hidden flex items-center gap-3 px-4 h-14 bg-[#0B1215] border-b border-white/10 shrink-0">
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

          <main className="flex-1 overflow-y-auto bg-[#f0f4f3]">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-10">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  )
}
