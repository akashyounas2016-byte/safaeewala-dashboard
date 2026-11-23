import { NavLink } from 'react-router-dom'
import { FileText, MousePointerClick } from 'lucide-react'

/**
 * R-LEAD-11: Leads (Website) has two tabs — Fluent Forms (the form submissions) and WhatsApp Clicks (the website's
 * WhatsApp buttons). The sidebar shows one "Leads (Website)" item under Marketing; /whatsapp-clicks still works.
 */
export function LeadsTabs() {
  const tab = (to: string, label: string, Icon: typeof FileText) => (
    <NavLink to={to} end
      className={({ isActive }) => `inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
        isActive ? 'bg-[#111827] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}>
      <Icon size={14} /> {label}
    </NavLink>
  )
  return (
    // R-LEAD-12: under the page header, in the full-width tab bar the other screens use (Settings, Payments)
    <nav aria-label="Leads" className="w-full flex items-center gap-1.5 flex-wrap bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-2.5 sm:p-3">
      {tab('/fluent-forms', 'Fluent Forms', FileText)}
      {tab('/whatsapp-clicks', 'WhatsApp Clicks', MousePointerClick)}
    </nav>
  )
}
