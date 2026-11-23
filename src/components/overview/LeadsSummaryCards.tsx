import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, FileText, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { addDays, todayDubai, toDubaiDate } from '@/lib/dubaiTime'
import { isDummyLead, readDeletedLeadIds } from '@/lib/fluentFormsSync'

/**
 * R-LEAD-15: Overview → daily leads. Two rows of cards — Fluent Forms (website forms) and WhatsApp Clicks —
 * each Today / Yesterday / Last 7 days / Last 30 days (Dubai dates). The block folds to one line; the choice is
 * remembered on this device. A card opens the Leads tab.
 */
const OPEN_KEY = 'safaeewala_overview_leads_open'
type Counts = { today: number; yesterday: number; d7: number; d30: number }
const ZERO: Counts = { today: 0, yesterday: 0, d7: 0, d30: 0 }

export function countByPeriod(dates: string[], today: string): Counts {
  const y = addDays(today, -1), f7 = addDays(today, -6), f30 = addDays(today, -29)
  return dates.reduce((c, d) => ({
    today: c.today + (d === today ? 1 : 0),
    yesterday: c.yesterday + (d === y ? 1 : 0),
    d7: c.d7 + (d >= f7 && d <= today ? 1 : 0),
    d30: c.d30 + (d >= f30 && d <= today ? 1 : 0),
  }), ZERO)
}

export function LeadsSummaryCards() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true } })
  const [forms, setForms] = useState<Counts | null>(null)
  const [clicks, setClicks] = useState<Counts | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const today = todayDubai()
      const since = `${addDays(today, -30)}T00:00:00+04:00`
      const deleted = readDeletedLeadIds()
      const [f, w] = await Promise.all([
        supabase.from('fluent_form_leads').select('id, created_at').gte('created_at', since).range(0, 4999),
        supabase.from('whatsapp_clicks').select('id, clicked_at').gte('clicked_at', since).range(0, 4999),
      ])
      if (!alive) return
      if (!f.error) setForms(countByPeriod((f.data || []).filter(l => !isDummyLead(l) && !deleted.has(l.id)).map(l => toDubaiDate(new Date(l.created_at))), today))
      if (!w.error) setClicks(countByPeriod((w.data || []).map(c => toDubaiDate(new Date(c.clicked_at))), today))
    }
    void load()
    const t = window.setInterval(load, 60_000)
    return () => { alive = false; window.clearInterval(t) }
  }, [])

  const toggle = () => setOpen(v => { try { localStorage.setItem(OPEN_KEY, v ? '0' : '1') } catch { /* private mode */ } return !v })
  const rows = [
    { key: 'forms', label: 'Fluent Forms', sub: 'Website form submissions', icon: FileText, tone: 'text-indigo-600 bg-indigo-50', data: forms, to: '/fluent-forms' },
    { key: 'clicks', label: 'WhatsApp Clicks', sub: 'WhatsApp buttons on the website', icon: MessageCircle, tone: 'text-emerald-600 bg-emerald-50', data: clicks, to: '/whatsapp-clicks' },
  ]
  const cells: { k: keyof Counts; label: string }[] = [
    { k: 'today', label: 'Today' }, { k: 'yesterday', label: 'Yesterday' }, { k: 'd7', label: 'Last 7 days' }, { k: 'd30', label: 'Last 30 days' },
  ]

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 sm:p-5 mb-6">
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center justify-between gap-3 cursor-pointer text-left">
        <div>
          <h3 className="text-[17px] font-bold text-[#111827]">Daily Leads</h3>
          <p className="text-[12.5px] text-[#6B7280]">
            {open ? 'Fluent Forms and WhatsApp Clicks by day' : `Today: ${forms?.today ?? '…'} form${forms?.today === 1 ? '' : 's'} · ${clicks?.today ?? '…'} WhatsApp click${clicks?.today === 1 ? '' : 's'}`}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl">
          {open ? <><ChevronUp size={14} /> Collapse</> : <><ChevronDown size={14} /> Expand</>}
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          {rows.map(r => (
            <div key={r.key} className="grid grid-cols-2 lg:grid-cols-[200px_repeat(4,1fr)] gap-3 items-stretch">
              <div className="col-span-2 lg:col-span-1 flex items-center gap-2.5">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${r.tone}`}><r.icon size={17} /></span>
                <span><span className="block text-[13px] font-bold text-[#111827]">{r.label}</span><span className="block text-[11px] text-slate-500">{r.sub}</span></span>
              </div>
              {cells.map(c => (
                <button key={c.k} type="button" onClick={() => navigate(r.to)}
                  className="rounded-2xl border border-[#E2E5E0] hover:border-emerald-300 hover:bg-emerald-50/40 px-4 py-3 text-left transition-colors cursor-pointer">
                  <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{c.label}</span>
                  <span className="block text-[22px] font-black text-slate-900 leading-tight">{r.data ? r.data[c.k] : '…'}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
