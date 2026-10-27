import { Link, useLocation } from 'react-router-dom'
import { Clock, Users, BookOpen, CreditCard } from 'lucide-react'

/**
 * One "Receivables" module across the Pending and Payments screens (UX-01):
 * the same tab bar on both, so dues, client view, cash book and collections live together.
 */
const TABS = [
  { to: '/pending',                label: 'Outstanding',          icon: Clock,      match: (p: string, t: string | null) => p === '/pending' && (!t || t === 'outstanding' || t === 'recovered' || t === 'staff_summary') },
  { to: '/pending?tab=by_client',  label: 'By Client',            icon: Users,      match: (p: string, t: string | null) => p === '/pending' && t === 'by_client' },
  { to: '/pending?tab=cash_book',  label: 'Cash Book',            icon: BookOpen,   match: (p: string, t: string | null) => p === '/pending' && t === 'cash_book' },
  { to: '/payments',               label: 'Collections & History', icon: CreditCard, match: (p: string) => p === '/payments' },
]

export function ReceivablesNav() {
  const { pathname, search } = useLocation()
  const tab = new URLSearchParams(search).get('tab')
  return (
    <nav className="flex items-center gap-1.5 flex-wrap bg-white p-1.5 rounded-2xl border border-[#E4E8EC] shadow-xs" aria-label="Receivables">
      <span className="px-2.5 text-[11px] font-black uppercase tracking-wider text-slate-400">Receivables</span>
      {TABS.map(t => {
        const active = t.match(pathname, tab)
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold transition-colors ${
              active ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
