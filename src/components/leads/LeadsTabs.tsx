import { NavLink } from 'react-router-dom'
import { FileText, MousePointerClick } from 'lucide-react'

/**
 * R-LEAD-11: Leads (Website) has two tabs — Fluent Forms (the form submissions) and WhatsApp Clicks (the website's
 * WhatsApp buttons). The sidebar shows one "Leads (Website)" item under Marketing; /whatsapp-clicks still works.
 */
export function LeadsTabs() {
  const tab = (to: string, label: string, Icon: typeof FileText) => (
    <NavLink to={to} end
      className={({ isActive }) => `inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
        isActive ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'
      }`}>
      <Icon size={14} /> {label}
    </NavLink>
  )
  return (
    <nav aria-label="Leads" className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-200/60 border border-slate-200">
      {tab('/fluent-forms', 'Fluent Forms', FileText)}
      {tab('/whatsapp-clicks', 'WhatsApp Clicks', MousePointerClick)}
    </nav>
  )
}
