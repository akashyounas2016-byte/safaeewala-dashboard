import { LeadsTabs } from '@/components/leads/LeadsTabs'
import React, { useEffect, useMemo, useState } from 'react'
import { MessageCircle, MousePointerClick, Smartphone, FileText, RefreshCw, Search, Megaphone, Pencil, Trash2, CalendarDays, CalendarRange, History, MapPin, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { confirmAsync, notify } from '@/lib/notify'
import { logAudit } from '@/lib/auditLog'
import { PageHero } from '@/components/layout/PageHero'
import { Widget } from '@/components/ui/KpiCard'
import { supabase } from '@/lib/supabase'
import { todayDubai, toDubaiDate } from '@/lib/dubaiTime'
import { locationOf, clicksBetween, countBy, pageOf, presetDates, sourceOf, type ClickPreset, type WhatsAppClick } from '@/lib/whatsappClicks'
import { DUBAI_AREAS } from '@/lib/excelSheet/sheetConfig'
import { loadIpLocations, type IpLocationData } from '@/lib/geo/ipLocation'

/** R-MKT-06: a summary card in the Daily Job Sheet design; a date card sets the date filter */
function ClickCard({ label, value, sub, icon: Icon, tone, active, onClick, children }: {
  label: string; value: string | number; sub?: string; icon: typeof MousePointerClick
  tone: { label: string; icon: string }; active?: boolean; onClick?: () => void; children?: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`group relative rounded-[16px] bg-white hover:bg-[#FAFBF9] border ${active ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-[#E2E5E0] hover:border-[#C9D2CC]'} shadow-[0_1px_2px_rgba(20,32,27,0.04)] p-4 sm:p-5 transition-all duration-200 ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] cursor-pointer' : 'cursor-default'} flex flex-col justify-between text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-400`}>
      <div className="flex items-start justify-between gap-2 mb-2 w-full">
        <span className={`text-[11px] font-bold tracking-wider uppercase leading-[1.3] ${tone.label}`}>{label}</span>
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-md ${tone.icon}`}><Icon size={18} strokeWidth={2.2} /></div>
      </div>
      <div className="w-full">
        <p className="text-[23px] sm:text-[26px] font-black tracking-tight leading-tight truncate text-slate-900">{value}</p>
        {sub && <p className="text-[11px] sm:text-[11.5px] font-medium mt-1 truncate text-slate-500" title={sub}>{sub}</p>}
        {children}
      </div>
    </button>
  )
}
const TONES = {
  emerald: { label: 'text-emerald-700', icon: 'bg-[#059669] shadow-emerald-500/25' },
  teal: { label: 'text-teal-700', icon: 'bg-[#0d9488] shadow-teal-500/25' },
  blue: { label: 'text-blue-700', icon: 'bg-[#2563eb] shadow-blue-500/25' },
  indigo: { label: 'text-indigo-700', icon: 'bg-[#4f46e5] shadow-indigo-500/25' },
  slate: { label: 'text-slate-700', icon: 'bg-[#334155] shadow-slate-500/25' },
  sky: { label: 'text-sky-700', icon: 'bg-[#0284c7] shadow-sky-500/25' },
  purple: { label: 'text-purple-700', icon: 'bg-[#7c3aed] shadow-purple-500/25' },
  amber: { label: 'text-amber-800', icon: 'bg-[#ea580c] shadow-amber-500/25' },
}

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

const EDIT_FIELDS: { key: keyof WhatsAppClick; label: string; wide?: boolean }[] = [
  { key: 'page_title', label: 'Page', wide: true },
  { key: 'page_url', label: 'Page link', wide: true },
  { key: 'button_text', label: 'Button' },
  { key: 'button_location', label: 'Button place' },
  { key: 'utm_source', label: 'Source' },
  { key: 'utm_campaign', label: 'Campaign' },
  { key: 'device', label: 'Device' },
  { key: 'wa_message', label: 'Message', wide: true },
]
const NO_RIGHTS = 'Not saved — run supabase/migrations/2026-11-17_whatsapp_clicks_edit.sql (admin / manager only).'

/** R-MKT-04: edit one click (page, button, source, device, message) */
function EditClickModal({ click, onClose, onSaved }: { click: WhatsAppClick | null; onClose: () => void; onSaved: (c: WhatsAppClick) => void }) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (click) setForm(Object.fromEntries(EDIT_FIELDS.map(f => [f.key, String(click[f.key] ?? '')])))
  }, [click])
  if (!click) return null
  const save = async () => {
    setSaving(true)
    const patch = Object.fromEntries(EDIT_FIELDS.map(f => [f.key, (form[f.key] || '').trim() || null]))
    const { data, error } = await supabase.from('whatsapp_clicks').update(patch).eq('id', click.id).select()
    setSaving(false)
    if (error || !data?.length) { notify.error(error ? `Not saved: ${error.message}` : NO_RIGHTS); return }
    logAudit({ action: 'updated', entity: 'whatsapp_click', entity_id: click.id, entity_name: click.page_title || click.page_url || 'WhatsApp click' })
    onSaved({ ...click, ...(data[0] as WhatsAppClick) })
    notify.success('Click updated')
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Edit WhatsApp click" size="lg"
      footer={<div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 px-4 rounded-xl border border-slate-200 text-[12.5px] font-semibold text-slate-600 bg-white cursor-pointer">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-bold cursor-pointer disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
      </div>}>
      <p className="text-[12px] text-slate-500 mb-3">{new Date(click.clicked_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EDIT_FIELDS.map(f => (
          <label key={f.key} className={`block ${f.wide ? 'sm:col-span-2' : ''}`}>
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1">{f.label}</span>
            {f.key === 'wa_message'
              ? <textarea rows={3} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full text-[13px] px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 resize-none" />
              : <input value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full h-9.5 text-[13px] px-3 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" />}
          </label>
        ))}
      </div>
    </Modal>
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
  // R-MKT-06: date preset (or custom range), page and area filters; the cards follow them
  const [preset, setPreset] = useState<ClickPreset>('30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [pageFilter, setPageFilter] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [moreCards, setMoreCards] = useState(false)
  const [q, setQ] = useState('')
  // R-MKT-08: offline IP → UAE location table (loaded with this screen only)
  const [ipData, setIpData] = useState<IpLocationData | null>(null)
  useEffect(() => { loadIpLocations().then(setIpData, () => setIpData(null)) }, [])
  const areaOf = (c: WhatsAppClick) => locationOf(c, DUBAI_AREAS, ipData).label
  const [editing, setEditing] = useState<WhatsAppClick | null>(null)
  // R-MKT-05: the last deliveries from the WordPress plugin (time and result), so a missing click can be traced
  const [deliveries, setDeliveries] = useState<{ at: string; status: number; reason: string; page?: string }[] | null>(null)

  // R-MKT-04: delete one click (a test click, a duplicate)
  const remove = async (c: WhatsAppClick) => {
    const ok = await confirmAsync({ title: 'Delete click', message: `Delete this click?\n${c.page_title || c.page_url || ''} · ${c.button_text || ''}`, confirmLabel: 'Delete', tone: 'danger' })
    if (!ok) return
    const { data, error } = await supabase.from('whatsapp_clicks').delete().eq('id', c.id).select()
    if (error || !data?.length) { notify.error(error ? `Not deleted: ${error.message}` : NO_RIGHTS.replace('Not saved', 'Not deleted')); return }
    logAudit({ action: 'deleted', entity: 'whatsapp_click', entity_id: c.id, entity_name: c.page_title || c.page_url || 'WhatsApp click' })
    setRows(prev => prev.filter(x => x.id !== c.id))
    notify.success('Click deleted')
  }

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase.from('whatsapp_clicks').select('*').order('clicked_at', { ascending: false }).range(0, 4999)
    if (err) setError(/relation|does not exist|schema cache/i.test(err.message) ? 'The WhatsApp clicks table is not set up yet — run supabase/migrations/2026-11-16_whatsapp_clicks.sql.' : err.message)
    else { setError(''); setRows((data || []) as WhatsAppClick[]) }
    setLoading(false)
  }
  const loadLog = async () => {
    try { const r = await fetch('/api/webhook/whatsapp-clicks/log'); setDeliveries(r.ok ? await r.json() : []) } catch { setDeliveries([]) }
  }
  useEffect(() => {
    void load(); void loadLog()
    // R-MKT-05: new clicks show without pressing Refresh
    const t = window.setInterval(() => { void load(); void loadLog() }, 60_000)
    // R-MKT-06: a new click shows at once (live channel); the minute reload stays as a fallback
    const ch = supabase.channel('whatsapp-clicks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_clicks' }, () => { void load() })
      .subscribe()
    return () => { window.clearInterval(t); void supabase.removeChannel(ch) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayDubai()
  // R-MKT-06: page, area and search filter everything; the date cards count inside them
  const base = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter(c =>
      (!pageFilter || pageOf(c) === pageFilter) &&
      (!areaFilter || areaOf(c) === areaFilter) &&
      (!t || [c.page_title, c.page_url, c.button_text, c.utm_campaign, c.utm_source, c.referrer, c.device, c.wa_message].some(v => String(v || '').toLowerCase().includes(t))))
  }, [rows, pageFilter, areaFilter, q, ipData]) // eslint-disable-line react-hooks/exhaustive-deps
  const { from, to } = presetDates(preset, today, { from: customFrom, to: customTo })
  const shown = useMemo(() => clicksBetween(base, from, to), [base, from, to])
  const countFor = (p: ClickPreset) => { const r = presetDates(p, today); return clicksBetween(base, r.from, r.to).length }
  const mobile = shown.filter(c => (c.device || '').toLowerCase() === 'mobile').length
  const byPage = countBy(shown, pageOf)
  const bySource = countBy(shown, sourceOf)
  const byButton = countBy(shown, c => c.button_text || '—')
  const byArea = countBy(shown, c => areaOf(c))
  const pageChoices = useMemo(() => countBy(rows, pageOf).map(r => r.key), [rows])
  const areaChoices = useMemo(() => countBy(rows, c => areaOf(c)).map(r => r.key), [rows, ipData]) // eslint-disable-line react-hooks/exhaustive-deps
  const periodLabel = preset === 'today' ? 'Today' : preset === 'yesterday' ? 'Yesterday' : preset === 'all' ? 'All time' : preset === 'custom' ? `${from || '…'} → ${to || '…'}` : `Last ${preset} days`
  const filtered = Boolean(pageFilter || areaFilter || q.trim())
  return (
    <div className="space-y-6">
      <PageHero title="WhatsApp Clicks" subtitle="Clicks on the WhatsApp buttons of the website — which pages and campaigns bring chats" showSearch={false}
        actions={<button type="button" onClick={() => void load()} className="h-11 px-5 rounded-2xl bg-white text-emerald-700 font-bold text-sm shadow-lg hover:bg-emerald-50 flex items-center gap-2 cursor-pointer"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>} />

      <LeadsTabs /> {/* R-LEAD-11, R-LEAD-12: a tab of Leads (Website), under the header */}

      {/* R-MKT-05: is the website sending? */}
      {deliveries && (() => {
        const last = deliveries[0]
        const okToday = deliveries.some(d => d.status === 201 && toDubaiDate(new Date(d.at)) === today)
        const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        const bad = last && last.status !== 201
        return (
          <div className={`px-4 py-3 rounded-2xl border text-[12.5px] ${!last ? 'border-slate-200 bg-white text-slate-600' : bad ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            <span className="font-bold">Website connection: </span>
            {!last ? 'no delivery from the website plugin recorded yet (recording started 17 Nov). If the plugin shows clicks today, check in WordPress → WhatsApp Clicks → Settings & Webhook that "Enable webhook delivery" is ticked and the URL is https://crm.safaeewala.com/api/webhook/whatsapp-clicks.'
              : bad ? `last delivery ${fmt(last.at)} was refused (${last.status}): ${last.reason}.`
              : `last click received ${fmt(last.at)}${okToday ? '' : ' — none today yet'}.`}
          </div>
        )
      })()}

      {error && <div role="alert" className="px-4 py-3 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 text-[13px]">{error}</div>}

      {/* R-MKT-06: summary cards (Daily Job Sheet design). Row 1 = the periods, row 2 opens with "More cards" */}
      <div className="space-y-3 sm:space-y-3.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
          <ClickCard label="Today" value={countFor('today')} sub={today} icon={MessageCircle} tone={TONES.emerald} active={preset === 'today'} onClick={() => setPreset('today')} />
          <ClickCard label="Yesterday" value={countFor('yesterday')} sub={presetDates('yesterday', today).from} icon={History} tone={TONES.teal} active={preset === 'yesterday'} onClick={() => setPreset('yesterday')} />
          <ClickCard label="Last 7 days" value={countFor('7')} sub="Click to filter" icon={CalendarDays} tone={TONES.blue} active={preset === '7'} onClick={() => setPreset('7')} />
          <ClickCard label="Last 30 days" value={countFor('30')} sub="Click to filter" icon={CalendarRange} tone={TONES.indigo} active={preset === '30'} onClick={() => setPreset('30')} />
          <ClickCard label="All time" value={countFor('all')} sub="Total clicks" icon={MousePointerClick} tone={TONES.slate} active={preset === 'all'} onClick={() => setPreset('all')} />
        </div>
        {moreCards && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5">
            <ClickCard label="Mobile clicks" value={mobile} sub={shown.length ? `${Math.round((mobile / shown.length) * 100)}% of ${shown.length} · ${periodLabel}` : periodLabel} icon={Smartphone} tone={TONES.sky} />
            <ClickCard label="Top pages" value={byPage[0]?.count ?? 0} sub={periodLabel} icon={FileText} tone={TONES.purple}>
              <ul className="mt-2 space-y-1">{byPage.slice(0, 3).map(r => <li key={r.key} className="flex justify-between gap-2 text-[11.5px]"><span className="truncate text-slate-600" title={r.key}>{r.key}</span><b className="text-slate-900">{r.count}</b></li>)}</ul>
            </ClickCard>
            <ClickCard label="Top areas" value={byArea[0]?.count ?? 0} sub={periodLabel} icon={MapPin} tone={TONES.amber}>
              <ul className="mt-2 space-y-1">{byArea.slice(0, 3).map(r => <li key={r.key} className="flex justify-between gap-2 text-[11.5px]"><span className="truncate text-slate-600" title={r.key}>{r.key}</span><b className="text-slate-900">{r.count}</b></li>)}</ul>
            </ClickCard>
          </div>
        )}
        <button type="button" onClick={() => setMoreCards(v => !v)} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-dashed border-slate-300 text-[12px] font-bold text-slate-600 hover:bg-white cursor-pointer">
          {moreCards ? <><ChevronUp size={14} /> Fewer cards</> : <><ChevronDown size={14} /> More cards: mobile clicks, top pages, top areas</>}
        </button>
      </div>

      {/* R-MKT-06: filters (period, custom range, page, area, search); the cards above follow them */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search page, button, campaign, message…" className="w-full text-[13px] pl-10 pr-3 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500" />
          </div>
          <select value={preset} onChange={e => setPreset(e.target.value as ClickPreset)} aria-label="Date range" className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl text-slate-700 font-medium cursor-pointer">
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom range…</option>
          </select>
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
              <input type="date" value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)} aria-label="From" className="px-2.5 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl" />
              <span>to</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)} aria-label="To" className="px-2.5 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-500">By page
            <select value={pageFilter} onChange={e => setPageFilter(e.target.value)} className="max-w-[320px] text-[13px] px-3 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl text-slate-700 font-medium cursor-pointer">
              <option value="">All pages</option>
              {pageChoices.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-500">By area
            <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="max-w-[260px] text-[13px] px-3 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl text-slate-700 font-medium cursor-pointer">
              <option value="">All areas</option>
              {areaChoices.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <span className="text-[12px] text-slate-500"><b className="text-slate-800">{shown.length}</b> clicks · {periodLabel}</span>
          {filtered && (
            <button type="button" onClick={() => { setPageFilter(''); setAreaFilter(''); setQ('') }} className="flex items-center gap-1 text-[12px] font-bold text-rose-600 hover:underline cursor-pointer"><X size={12} /> Clear filters</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
        <Widget title="By page" note="Which pages bring WhatsApp chats" icon={FileText}><Bars list={byPage} /></Widget>
        <Widget title="By source / campaign" note="UTM campaign, source or referring site" icon={Megaphone}><Bars list={bySource} /></Widget>
        <Widget title="By button" note="Which button was clicked" icon={MousePointerClick}><Bars list={byButton} /></Widget>
        <Widget title="By area" note="Area of the page, else the visitor's location from their IP (approximate)" icon={MapPin}>
          <Bars list={byArea} />
          {/* R-MKT-08: DB-IP's free table needs this credit (CC BY 4.0) */}
          <p className="mt-2 text-[10.5px] text-slate-400">IP location by <a href="https://db-ip.com" target="_blank" rel="noreferrer" className="underline">DB-IP</a></p>
        </Widget>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">When</th><th className="py-3 px-3">Page</th><th className="py-3 px-3">Button</th><th className="py-3 px-3">Source</th><th className="py-3 px-3">Area / location</th><th className="py-3 px-3">Device</th><th className="py-3 px-3">Message</th><th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[12.5px]">
              {shown.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-slate-400">{loading ? 'Loading…' : 'No clicks in this period'}</td></tr>}
              {shown.slice(0, 300).map(c => (
                <tr key={c.id} className="hover:bg-emerald-50/40">
                  <td className="py-2.5 px-4 whitespace-nowrap text-slate-700">{new Date(c.clicked_at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-2.5 px-3 max-w-[260px]">{c.page_url ? <a href={c.page_url} target="_blank" rel="noreferrer" className="text-emerald-800 hover:underline truncate block" title={c.page_url}>{pageOf(c)}</a> : pageOf(c)}</td>
                  <td className="py-2.5 px-3 text-slate-700">{c.button_text || '—'}{c.button_location ? <span className="text-slate-400"> · {c.button_location}</span> : null}</td>
                  <td className="py-2.5 px-3 text-slate-700">{sourceOf(c)}</td>
                  {(() => { const l = locationOf(c, DUBAI_AREAS, ipData); return (
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap" title={l.from === 'ip' ? "From the visitor's IP (approximate)" : l.from === 'page' ? 'From the page link / message' : 'No IP stored for this click'}>
                      {l.label}{l.from === 'ip' && <span className="ml-1 text-[10px] font-bold text-slate-400">IP</span>}
                    </td>) })()}
                  <td className="py-2.5 px-3 capitalize text-slate-700">{c.device || '—'}</td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-[280px] truncate" title={c.wa_message || ''}>{c.wa_message || '—'}</td>
                  <td className="py-2.5 px-4">
                    {/* R-MKT-04: edit / delete the row */}
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setEditing(c)} title="Edit" aria-label="Edit click" className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-emerald-700 hover:border-emerald-300 flex items-center justify-center cursor-pointer"><Pencil size={14} /></button>
                      <button type="button" onClick={() => void remove(c)} title="Delete" aria-label="Delete click" className="w-8 h-8 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length > 300 && <p className="text-[11.5px] text-slate-400 text-center py-2.5 border-t border-slate-100">Showing the newest 300 of {shown.length} — narrow the search or the date range</p>}
      </div>
      <EditClickModal click={editing} onClose={() => setEditing(null)} onSaved={c => setRows(prev => prev.map(x => (x.id === c.id ? c : x)))} />
    </div>
  )
}
