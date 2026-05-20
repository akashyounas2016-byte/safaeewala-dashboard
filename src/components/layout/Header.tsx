import { Menu, Search, Bell, Plus, ChevronDown } from 'lucide-react'

interface HeaderProps {
  title: string
  subtitle?: string
  eyebrow?: string
  onMenuClick: () => void
}

export function Header({ title, subtitle, eyebrow, onMenuClick }: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-[#e2e8f0] flex items-center px-6 gap-4 shrink-0">

      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-[#94a3b8] hover:text-[#475569] hover:bg-[#f8fafc] transition-colors cursor-pointer shrink-0"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-[0.14em] leading-none mb-0.5 hidden lg:block">{eyebrow}</p>
        )}
        <h1 className="text-[16px] font-semibold text-[#0f172a] leading-none truncate">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-[#94a3b8] mt-[3px] truncate hidden sm:block">{subtitle}</p>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">

        {/* Search */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-[13px] text-[#94a3b8] hover:border-[#cbd5e1] transition-colors cursor-pointer w-44">
          <Search size={14} strokeWidth={2} />
          <span className="text-[12.5px]">Search…</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 bg-white border border-[#e2e8f0] rounded text-[#94a3b8] font-mono leading-none">⌘K</kbd>
        </div>

        {/* Search icon (mobile) */}
        <button className="md:hidden w-9 h-9 rounded-lg border border-[#e2e8f0] bg-white flex items-center justify-center text-[#94a3b8] hover:text-[#475569] hover:bg-[#f8fafc] transition-colors cursor-pointer">
          <Search size={16} />
        </button>

        {/* Notifications */}
        <button className="relative w-9 h-9 rounded-lg border border-[#e2e8f0] bg-white flex items-center justify-center text-[#94a3b8] hover:text-[#475569] hover:bg-[#f8fafc] transition-colors cursor-pointer">
          <Bell size={16} />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#ef4444] ring-2 ring-white" />
        </button>

        {/* New Booking */}
        <button className="flex items-center gap-2 px-4 py-2 bg-[#059669] hover:bg-[#047857] active:bg-[#065f46] text-white text-[13px] font-semibold rounded-lg transition-colors cursor-pointer shadow-sm">
          <Plus size={15} strokeWidth={2.5} />
          <span className="hidden sm:inline">New Booking</span>
        </button>

      </div>
    </header>
  )
}
