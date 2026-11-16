import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, MousePointerClick, Smartphone, FileText, RefreshCw, Search, Megaphone } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { KpiCard, Widget } from '@/components/ui/KpiCard'
import { supabase } from '@/lib/supabase'
import { todayDubai, toDubaiDate } from '@/lib/dubaiTime'
import { clicksInRange, countBy, pageOf, sourceOf, type ClickRange, type WhatsAppClick } from '@/lib/whatsappClicks'

/** Count per key as bars (biggest first, top 8) */
function Bars({ list }: { list: { key: string; count: number }[] }) {
  const max = list[0]?.count || 1
  if (list.length === 0) return <p className="text-[12.5px] text-slate-400 text-center py-6">No clicks</p>
  return (
    <ul className="space-y-2">
      {list.slice(0, 8).map(r => (
        <li key={r.key}>
          <div className="flex justify-between gap-3 text-[12.5px]"><span className="truncate text-slate-700" title={r.key}>{r.key}</span><span className="font-bold text-slate-900 shrink-0">{r.count}</span></div>
          <div className="h-1.5 rounded-full bg-slate-100 mt-1"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(4, Math.round((r.count / max) * 100))}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

/**
 * R-MKT-03: clicks on the website's WhatsApp buttons (WordPress plugin → /api/webhook/whatsapp-clicks →
 * whatsapp_clicks). A click has no customer phone — it shows which pages, buttons and campaigns bring chats.
 */
export function WhatsAppClicks() {
  const [rows, setRows] = useState<WhatsAppClick[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState<ClickRange>('30')
  const [q, setQ] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase.from('whatsapp_clicks').select('*').order('clicked_at', { ascending: false }).range(0, 4999)
    if (err) setError(/relation|does not exist|schema cache/i.test(err.message) ? 'The WhatsApp clicks table is not set up yet — run supabase/migrations/2026-11-16_whatsapp_clicks.sql.' : err.message)
    else { setError(''); setRows((data || []) as WhatsAppClick[]) }
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const today = todayDubai()
  const inRange = useMemo(() => clicksInRange(rows, range, today), [rows, range, today])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return inRange
    return inRange.filter(c => [c.page_title, c.page_url, c.button_text, c.utm_campaign, c.utm_source, c.referrer, c.device].some(v => String(v || '').toLowerCase().includes(t)))
  }, [inRange, q])
  const todayCount = rows.filter(c => toDubaiDate(new Date(c.clicked_at)) === today).length
  const mobile = shown.filter(c => (c.device || '').toLowerCase() === 'mobile').length
  const byPage = countBy(shown, pageOf)
  const bySource = countBy(shown, sourceOf)
  const byButton = countBy(shown, c => c.button_text || '—')
  return (
    <div className="space-y-6">
      <PageHero title="WhatsApp Clicks" subtitle="Clicks on the WhatsApp buttons of the website — which pages and campaigns bring chats" showSearch={false}
        actions={<button type="button" onClick={() => void load()} className="h-11 px-5 rounded-2xl bg-white text-emerald-700 font-bold text-sm shadow-lg hover:bg-emerald-50 flex items-center gap-2 cursor-pointer"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>} />

      {error && <div role="alert" className="px-4 py-3 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 text-[13px]">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
        <KpiCard label="Clicks" value={shown.length} sub={range === 'all' ? 'All time' : `Last ${range} days`} icon={MousePointerClick} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" />
        <KpiCard label="Today" value={todayCount} sub={today} icon={MessageCircle} labelColor="text-teal-700" iconSolid="bg-[#0d9488] shadow-teal-500/25" />
        <KpiCard label="On mobile" value={shown.length ? `${Math.round((mobile / shown.length) * 100)}%` : '—'} sub={`${mobile} of ${shown.length}`} icon={Smartphone} labelColor="text-sky-700" iconSolid="bg-[#0284c7] shadow-sky-500/25" />
        <KpiCard label="Top page" value={byPage[0]?.count ?? 0} sub={byPage[0]?.key || '—'} icon={FileText} labelColor="text-purple-700" iconSolid="bg-[#7c3aed] shadow-purple-500/25" />
      </div>

      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search page, button, campaign…" className="w-full text-[13px] pl-10 pr-3 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500" />
        </div>
        <select value={range} onChange={e => setRange(e.target.value as ClickRange)} aria-label="Date range" className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl text-slate-700 font-medium cursor-pointer">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <Widget title="By page" note="Which pages bring WhatsApp chats" icon={FileText}><Bars list={byPage} /></Widget>
        <Widget title="By source / campaign" note="UTM campaign, source or referring site" icon={Megaphone}><Bars list={bySource} /></Widget>
        <Widget title="By button" note="Which button was clicked" icon={MousePointerClick}><Bars list={byButton} /></Widget>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">When</th><th className="py-3 px-3">Page</th><th className="py-3 px-3">Button</th><th className="py-3 px-3">Source</th><th className="py-3 px-3">Device</th><th className="py-3 px-4">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[12.5px]">
              {shown.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-slate-400">{loading ? 'Loading…' : 'No clicks in this period'}</td></tr>}
              {shown.slice(0, 300).map(c => (
                <tr key={c.id} className="hover:bg-emerald-50/40">
                  <td className="py-2.5 px-4 whitespace-nowrap text-slate-700">{new Date(c.clicked_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-2.5 px-3 max-w-[260px]">{c.page_url ? <a href={c.page_url} target="_blank" rel="noreferrer" className="text-emerald-800 hover:underline truncate block" title={c.page_url}>{pageOf(c)}</a> : pageOf(c)}</td>
                  <td className="py-2.5 px-3 text-slate-700">{c.button_text || '—'}{c.button_location ? <span className="text-slate-400"> · {c.button_location}</span> : null}</td>
                  <td className="py-2.5 px-3 text-slate-700">{sourceOf(c)}</td>
                  <td className="py-2.5 px-3 capitalize text-slate-700">{c.device || '—'}</td>
                  <td className="py-2.5 px-4 text-slate-500 max-w-[280px] truncate" title={c.wa_message || ''}>{c.wa_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length > 300 && <p className="text-[11.5px] text-slate-400 text-center py-2.5 border-t border-slate-100">Showing the newest 300 of {shown.length} — narrow the search or the date range</p>}
      </div>
    </div>
  )
}
