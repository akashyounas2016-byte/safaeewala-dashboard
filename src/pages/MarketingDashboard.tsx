import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserX, UserPlus, Repeat, UserCheck, Tag, Megaphone, Plus, Pencil, Trash2, Download, MessageCircle, Copy, Database, Loader2, Search, CalendarClock } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { KpiCard } from '@/components/ui/KpiCard'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { notify, confirmAsync } from '@/lib/notify'
import { todayDubai } from '@/lib/dubaiTime'
import { formatDate } from '@/lib/utils'
import {
  AUDIENCES, audienceOf, daysSince, deleteCampaign, deleteOffer, fillMessage, loadCampaigns, loadOffers, offerLive, offerText,
  saveCampaign, saveOffer, segmentCounts, type Audience, type Campaign, type Offer,
} from '@/lib/marketing'

/**
 * R-MKT-01: Marketing for a cleaning business — Client base (segments synced from the job sheet and bookings:
 * inactive, first-time, repeat, active, never booked), Offers and Campaigns.
 */
const TABS = [{ key: 'clients', label: 'Client base', icon: Users }, { key: 'offers', label: 'Offers', icon: Tag }, { key: 'campaigns', label: 'Campaigns', icon: Megaphone }] as const
type TabKey = (typeof TABS)[number]['key']
const SEG_ICON: Record<Audience, typeof Users> = { inactive: UserX, first_time: UserPlus, repeat: Repeat, active: UserCheck, never: Users, all: Users }
const SEG_STYLE: Record<Audience, [string, string]> = {
  inactive: ['text-rose-700', 'bg-[#e11d48] shadow-rose-500/25'], first_time: ['text-sky-700', 'bg-[#0284c7] shadow-sky-500/25'],
  repeat: ['text-emerald-700', 'bg-[#059669] shadow-emerald-500/25'], active: ['text-teal-700', 'bg-[#0d9488] shadow-teal-500/25'],
  never: ['text-amber-700', 'bg-[#d97706] shadow-amber-500/25'], all: ['text-slate-700', 'bg-[#475569] shadow-slate-500/25'],
}
const STATUS_TONE: Record<Campaign['status'], string> = {
  draft: 'bg-slate-100 text-slate-600', scheduled: 'bg-sky-50 text-sky-700', running: 'bg-emerald-50 text-emerald-700', done: 'bg-violet-50 text-violet-700', cancelled: 'bg-rose-50 text-rose-700',
}
const card = 'bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]'
const phoneOf = (c: { whatsapp?: string; phone?: string }) => String(c.whatsapp || c.phone || '').trim()

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = name
  a.click()
}

export function MarketingDashboard() {
  const { clients } = useData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>('clients')
  const [seg, setSeg] = useState<Audience>('inactive')
  const [q, setQ] = useState('')
  const [offers, setOffers] = useState<Offer[] | null | 'loading'>('loading')
  const [campaigns, setCampaigns] = useState<Campaign[] | null | 'loading'>('loading')
  const [offerForm, setOfferForm] = useState<Partial<Offer> | null>(null)
  const [campForm, setCampForm] = useState<Partial<Campaign> | null>(null)
  const today = todayDubai()
  const by = user?.full_name || user?.email || 'Staff'

  const reload = () => {
    loadOffers().then(setOffers).catch(e => { notify.error((e as Error).message); setOffers([]) })
    loadCampaigns().then(setCampaigns).catch(e => { notify.error((e as Error).message); setCampaigns([]) })
  }
  useEffect(reload, [])
  const ready = offers !== null && campaigns !== null
  const offerList = Array.isArray(offers) ? offers : []
  const campList = Array.isArray(campaigns) ? campaigns : []

  const counts = useMemo(() => segmentCounts(clients), [clients])
  const segClients = useMemo(() => {
    const s = q.trim().toLowerCase()
    return audienceOf(clients, seg)
      .filter(c => !s || [c.full_name, c.phone, c.whatsapp, c.building_name, c.area].some(v => String(v || '').toLowerCase().includes(s)))
      .sort((a, b) => (b.last_service || '').localeCompare(a.last_service || ''))
  }, [clients, seg, q])

  const exportSeg = (a: Audience) => {
    const list = audienceOf(clients, a)
    downloadCsv(`clients-${a}-${today}.csv`, [['Name', 'Phone', 'Area', 'Visits', 'Last visit'], ...list.map(c => [c.full_name, phoneOf(c), c.area || '', c.total_bookings || 0, c.last_service ? String(c.last_service).slice(0, 10) : ''])])
  }
  const copyNumbers = (a: Audience) => {
    const nums = audienceOf(clients, a).map(phoneOf).join('\n')
    void navigator.clipboard.writeText(nums).then(() => notify.success('Numbers copied'))
  }

  const submitOffer = async () => {
    if (!offerForm?.title?.trim()) return notify.error('Give the offer a title')
    try { await saveOffer({ ...offerForm, title: offerForm.title.trim(), ...(offerForm.id ? {} : { created_by: by }) }); notify.success('Offer saved'); setOfferForm(null); reload() }
    catch (e) { notify.error((e as Error).message) }
  }
  const submitCampaign = async () => {
    if (!campForm?.name?.trim()) return notify.error('Give the campaign a name')
    const audience_count = audienceOf(clients, (campForm.audience || 'inactive') as Audience).length
    try { await saveCampaign({ ...campForm, name: campForm.name.trim(), audience_count, ...(campForm.id ? {} : { created_by: by }) }); notify.success('Campaign saved'); setCampForm(null); reload() }
    catch (e) { notify.error((e as Error).message) }
  }

  const liveOffers = offerList.filter(o => offerLive(o, today)).length
  const runningCamps = campList.filter(c => c.status === 'running' || c.status === 'scheduled').length

  return (
    <div className="space-y-6">
      <PageHero title="Marketing" subtitle={`${counts.inactive} inactive · ${counts.first_time} first-time clients · ${liveOffers} live offers · ${runningCamps} running campaigns`}
        statusChip={counts.inactive > 0 ? `${counts.inactive} to win back` : 'All active'} showSearch={false}
        actionLabel={tab === 'offers' ? 'New Offer' : 'New Campaign'}
        onAction={() => { if (!ready) return notify.error('Run the database step first (see the note below)'); if (tab === 'offers') setOfferForm({ discount_type: 'percent', discount_value: 10, audience: 'all', active: true, valid_from: today }); else { setTab('campaigns'); setCampForm({ audience: seg, channel: 'whatsapp', status: 'draft', start_date: today, message: 'Hi {name}, we miss you at Safaeewala! ' }) } }} />

      {!ready && offers !== 'loading' && (
        <div className="bg-amber-50 border border-amber-200 rounded-[18px] px-4 py-3 text-[12.5px] text-amber-900 flex items-start gap-2">
          <Database size={15} className="mt-0.5 shrink-0" />
          <span>Offers and Campaigns need the database step: run <code className="bg-white px-1 rounded">supabase/migrations/2026-11-09_marketing_complaints.sql</code> in Supabase → SQL editor. The client base below already works.</span>
        </div>
      )}

      <nav aria-label="Marketing" className="flex gap-1 bg-white border border-[#E4E8EC] rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={tab === t.key ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] cursor-pointer ${tab === t.key ? 'bg-[#0F1F19] text-white font-bold' : 'text-slate-600 font-semibold hover:bg-slate-50'}`}>
            <t.icon size={14} /> {t.label}
            {t.key === 'offers' && liveOffers > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full bg-emerald-500 text-white">{liveOffers}</span>}
          </button>
        ))}
      </nav>

      {tab === 'clients' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {AUDIENCES.map(a => (
              <KpiCard key={a.key} label={a.label} value={counts[a.key]} sub={a.note} icon={SEG_ICON[a.key]} labelColor={SEG_STYLE[a.key][0]} iconSolid={SEG_STYLE[a.key][1]}
                active={seg === a.key} onClick={() => setSeg(a.key)} title="Clients with a phone number — synced from the Daily Job Sheet and Bookings" />
            ))}
          </div>
          <section className={`${card} overflow-hidden`}>
            <header className="px-5 py-3.5 border-b border-[#E4E8EC] flex items-center gap-2 flex-wrap">
              <p className="text-[15px] font-bold text-[#111827] mr-auto">{AUDIENCES.find(a => a.key === seg)?.label} clients <span className="text-slate-400 font-semibold">· {segClients.length}</span></p>
              <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, area…" className="h-9 pl-9 pr-3 text-[12.5px] rounded-xl border border-[#E4E8EC] bg-[#f8fafc] outline-none focus:border-emerald-400 w-56" /></div>
              <button type="button" onClick={() => copyNumbers(seg)} className="h-9 px-3 rounded-xl border border-[#E4E8EC] text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"><Copy size={13} /> Copy numbers</button>
              <button type="button" onClick={() => exportSeg(seg)} className="h-9 px-3 rounded-xl border border-[#E4E8EC] text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"><Download size={13} /> CSV</button>
              <button type="button" onClick={() => { if (!ready) return notify.error('Run the database step first'); setTab('campaigns'); setCampForm({ audience: seg, channel: 'whatsapp', status: 'draft', start_date: today, name: `${AUDIENCES.find(a => a.key === seg)?.label} — ${formatDate(today)}`, message: 'Hi {name}, ' }) }}
                className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-[12.5px] font-bold flex items-center gap-1.5 hover:bg-emerald-700 cursor-pointer"><Megaphone size={13} /> Campaign for this group</button>
            </header>
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-[12.5px] table-fixed">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500"><tr>
                  <th className="px-4 py-2.5 w-[28%]">Client</th><th className="px-3 py-2.5 w-[17%]">Phone</th><th className="px-3 py-2.5">Area</th><th className="px-3 py-2.5 w-[9%]">Visits</th><th className="px-3 py-2.5 w-[15%]">Last visit</th><th className="px-3 py-2.5 w-[90px]" />
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {segClients.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400">No clients in this group.</td></tr>}
                  {segClients.slice(0, 300).map(c => {
                    const since = daysSince(c.last_service)
                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 truncate"><button type="button" onClick={() => navigate(`/clients/${c.id}`)} className="font-semibold text-[#111827] hover:underline cursor-pointer truncate max-w-full text-left">{c.full_name}</button></td>
                        <td className="px-3 py-2.5 truncate text-slate-600">{phoneOf(c)}</td>
                        <td className="px-3 py-2.5 truncate text-slate-500">{[c.building_name, c.area].filter(Boolean).join(', ') || '—'}</td>
                        <td className="px-3 py-2.5 font-bold">{c.total_bookings || 0}</td>
                        <td className="px-3 py-2.5 text-slate-600">{c.last_service ? <>{formatDate(String(c.last_service).slice(0, 10))}{since !== null && <span className={`block text-[10.5px] ${since > 60 ? 'text-rose-600' : 'text-slate-400'}`}>{since} days ago</span>}</> : '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" onClick={() => navigate(`/whatsapp-crm?phone=${encodeURIComponent(phoneOf(c))}&name=${encodeURIComponent(c.full_name)}`)} title="Open a WhatsApp chat" className="h-8 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11.5px] font-bold inline-flex items-center gap-1 hover:bg-emerald-100 cursor-pointer"><MessageCircle size={12} /> Chat</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {segClients.length > 300 && <p className="px-4 py-2 text-[11.5px] text-slate-400">First 300 shown — use CSV for all {segClients.length}.</p>}
            </div>
          </section>
        </>
      )}

      {tab === 'offers' && (
        offers === 'loading' ? <Loader2 className="animate-spin text-slate-300 mx-auto" /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {offerList.length === 0 && <p className={`${card} p-8 text-center text-[13px] text-slate-500 md:col-span-2 xl:col-span-3`}>No offers yet — e.g. "First deep clean 20% off", "Win-back: 2 free hours", "Sofa + carpet bundle".</p>}
            {offerList.map(o => {
              const live = offerLive(o, today)
              return (
                <article key={o.id} className={`${card} p-5 space-y-2`}>
                  <div className="flex items-start gap-2">
                    <span className="w-10 h-10 rounded-2xl bg-[#059669] text-white flex items-center justify-center shrink-0 shadow-md"><Tag size={17} /></span>
                    <div className="min-w-0 flex-1"><p className="text-[14.5px] font-bold text-[#111827] truncate">{o.title}</p><p className="text-[12px] font-bold text-emerald-700">{offerText(o)}{o.code ? ` · code ${o.code}` : ''}</p></div>
                    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{live ? 'Live' : o.active ? 'Not in dates' : 'Off'}</span>
                  </div>
                  <p className="text-[12px] text-slate-500">For: <b>{AUDIENCES.find(a => a.key === o.audience)?.label || 'All clients'}</b>{o.services ? ` · ${o.services}` : ''}</p>
                  <p className="text-[12px] text-slate-500 flex items-center gap-1"><CalendarClock size={12} /> {o.valid_from ? formatDate(o.valid_from) : 'Any time'} – {o.valid_to ? formatDate(o.valid_to) : 'no end'}</p>
                  {o.terms && <p className="text-[11.5px] text-slate-400 line-clamp-2">{o.terms}</p>}
                  <div className="flex gap-1.5 pt-1">
                    <button type="button" onClick={() => setOfferForm(o)} className="h-8 px-2.5 rounded-lg border border-[#E4E8EC] text-[12px] font-semibold flex items-center gap-1 hover:bg-slate-50 cursor-pointer"><Pencil size={12} /> Edit</button>
                    <button type="button" onClick={() => { setTab('campaigns'); setCampForm({ name: o.title, offer_id: o.id, audience: o.audience, channel: 'whatsapp', status: 'draft', start_date: today, message: `Hi {name}, ${o.title}: ${offerText(o)}${o.code ? ` with code ${o.code}` : ''}. Reply to book!` }) }} className="h-8 px-2.5 rounded-lg border border-[#E4E8EC] text-[12px] font-semibold flex items-center gap-1 hover:bg-slate-50 cursor-pointer"><Megaphone size={12} /> Use in campaign</button>
                    <button type="button" onClick={async () => { if (await confirmAsync({ title: 'Delete offer', message: `Delete "${o.title}"?`, confirmLabel: 'Delete', tone: 'danger' })) { await deleteOffer(o.id).catch(e => notify.error((e as Error).message)); reload() } }} className="ml-auto h-8 w-8 rounded-lg text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer" aria-label="Delete offer"><Trash2 size={13} /></button>
                  </div>
                </article>
              )
            })}
          </div>
        )
      )}

      {tab === 'campaigns' && (
        campaigns === 'loading' ? <Loader2 className="animate-spin text-slate-300 mx-auto" /> : (
          <section className={`${card} overflow-hidden`}>
            <table className="w-full text-[12.5px] table-fixed">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500"><tr>
                <th className="px-4 py-2.5 w-[26%]">Campaign</th><th className="px-3 py-2.5">Audience</th><th className="px-3 py-2.5 w-[11%]">Channel</th><th className="px-3 py-2.5 w-[11%]">Status</th><th className="px-3 py-2.5 w-[13%]">Dates</th><th className="px-3 py-2.5 w-[13%]">Result</th><th className="px-3 py-2.5 w-[120px]" />
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {campList.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No campaigns yet — start one from a client group or an offer.</td></tr>}
                {campList.map(c => {
                  const offer = offerList.find(o => o.id === c.offer_id)
                  const roi = c.budget > 0 ? Math.round(((c.revenue - c.budget) / c.budget) * 100) : null
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 align-top">
                      <td className="px-4 py-3"><p className="font-semibold text-[#111827] truncate">{c.name}</p>{offer && <p className="text-[11px] text-emerald-700 truncate">{offer.title} · {offerText(offer)}</p>}</td>
                      <td className="px-3 py-3">{AUDIENCES.find(a => a.key === c.audience)?.label} <span className="text-slate-400">· {c.audience_count}</span></td>
                      <td className="px-3 py-3 capitalize">{c.channel}</td>
                      <td className="px-3 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_TONE[c.status]}`}>{c.status}</span></td>
                      <td className="px-3 py-3 text-slate-600">{c.start_date ? formatDate(c.start_date) : '—'}{c.end_date ? <span className="block text-[11px] text-slate-400">to {formatDate(c.end_date)}</span> : null}</td>
                      <td className="px-3 py-3">{c.bookings} bookings<span className="block text-[11px] text-slate-500">AED {Number(c.revenue || 0).toLocaleString()}{roi !== null ? ` · ROI ${roi}%` : ''}</span></td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {c.channel === 'whatsapp' && <button type="button" onClick={() => navigate('/whatsapp-crm?tab=broadcast')} title="Send it as a WhatsApp broadcast (approved template)" className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 cursor-pointer"><MessageCircle size={14} /></button>}
                        <button type="button" onClick={() => { const list = audienceOf(clients, c.audience); downloadCsv(`campaign-${c.name.replace(/\W+/g, '-')}.csv`, [['Name', 'Phone', 'Message'], ...list.map(x => [x.full_name, phoneOf(x), fillMessage(c.message || '', x.full_name)])]) }} title="Audience with the message (CSV)" className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"><Download size={14} /></button>
                        <button type="button" onClick={() => setCampForm(c)} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"><Pencil size={14} /></button>
                        <button type="button" onClick={async () => { if (await confirmAsync({ title: 'Delete campaign', message: `Delete "${c.name}"?`, confirmLabel: 'Delete', tone: 'danger' })) { await deleteCampaign(c.id).catch(e => notify.error((e as Error).message)); reload() } }} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      )}

      {/* offer form */}
      <Modal open={!!offerForm} onClose={() => setOfferForm(null)} title={offerForm?.id ? 'Edit offer' : 'New offer'} size="lg"
        footer={<div className="flex gap-2"><button type="button" onClick={() => setOfferForm(null)} className="px-4 py-2 rounded-xl border border-[#E2E5E0] text-[13px] font-semibold cursor-pointer">Cancel</button><button type="button" onClick={() => void submitOffer()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-bold cursor-pointer">Save offer</button></div>}>
        {offerForm && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Title *" value={offerForm.title || ''} onChange={e => setOfferForm({ ...offerForm, title: e.target.value })} placeholder="First deep clean 20% off" /></div>
            <Select label="Discount" value={offerForm.discount_type || 'percent'} onChange={e => setOfferForm({ ...offerForm, discount_type: e.target.value as Offer['discount_type'] })}>
              <option value="percent">% off</option><option value="amount">AED off</option><option value="free_hours">Free hours</option><option value="none">No discount (bundle / gift)</option>
            </Select>
            <Input label="Value" type="number" min={0} value={offerForm.discount_value ?? 0} onChange={e => setOfferForm({ ...offerForm, discount_value: Number(e.target.value) || 0 })} />
            <Input label="Promo code" value={offerForm.code || ''} onChange={e => setOfferForm({ ...offerForm, code: e.target.value.toUpperCase() })} placeholder="WELCOME20" />
            <Select label="For" value={offerForm.audience || 'all'} onChange={e => setOfferForm({ ...offerForm, audience: e.target.value as Audience })}>
              {AUDIENCES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </Select>
            <div className="col-span-2"><Input label="Services" value={offerForm.services || ''} onChange={e => setOfferForm({ ...offerForm, services: e.target.value })} placeholder="Deep cleaning, Sofa shampoo" /></div>
            <Input label="Valid from" type="date" value={offerForm.valid_from || ''} onChange={e => setOfferForm({ ...offerForm, valid_from: e.target.value || null })} />
            <Input label="Valid to" type="date" value={offerForm.valid_to || ''} onChange={e => setOfferForm({ ...offerForm, valid_to: e.target.value || null })} />
            <div className="col-span-2"><Textarea label="Terms" rows={2} value={offerForm.terms || ''} onChange={e => setOfferForm({ ...offerForm, terms: e.target.value })} placeholder="Minimum 4 hours, Dubai only" /></div>
            <label className="col-span-2 flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={offerForm.active !== false} onChange={e => setOfferForm({ ...offerForm, active: e.target.checked })} /> Active</label>
          </div>
        )}
      </Modal>

      {/* campaign form */}
      <Modal open={!!campForm} onClose={() => setCampForm(null)} title={campForm?.id ? 'Edit campaign' : 'New campaign'} size="lg"
        footer={<div className="flex gap-2"><button type="button" onClick={() => setCampForm(null)} className="px-4 py-2 rounded-xl border border-[#E2E5E0] text-[13px] font-semibold cursor-pointer">Cancel</button><button type="button" onClick={() => void submitCampaign()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-bold cursor-pointer">Save campaign</button></div>}>
        {campForm && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Name *" value={campForm.name || ''} onChange={e => setCampForm({ ...campForm, name: e.target.value })} placeholder="Win-back — November" /></div>
            <Select label={`Audience · ${audienceOf(clients, (campForm.audience || 'inactive') as Audience).length} clients`} value={campForm.audience || 'inactive'} onChange={e => setCampForm({ ...campForm, audience: e.target.value as Audience })}>
              {AUDIENCES.map(a => <option key={a.key} value={a.key}>{a.label} ({counts[a.key]})</option>)}
            </Select>
            <Select label="Offer" value={campForm.offer_id || ''} onChange={e => setCampForm({ ...campForm, offer_id: e.target.value || null })}>
              <option value="">No offer</option>
              {offerList.map(o => <option key={o.id} value={o.id}>{o.title} · {offerText(o)}</option>)}
            </Select>
            <Select label="Channel" value={campForm.channel || 'whatsapp'} onChange={e => setCampForm({ ...campForm, channel: e.target.value })}>
              {['whatsapp', 'facebook', 'instagram', 'email', 'sms', 'other'].map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
            </Select>
            <Select label="Status" value={campForm.status || 'draft'} onChange={e => setCampForm({ ...campForm, status: e.target.value as Campaign['status'] })}>
              {(['draft', 'scheduled', 'running', 'done', 'cancelled'] as const).map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </Select>
            <div className="col-span-2"><Textarea label="Message ({name} = the client's first name)" rows={3} value={campForm.message || ''} onChange={e => setCampForm({ ...campForm, message: e.target.value })} /></div>
            <Input label="Start" type="date" value={campForm.start_date || ''} onChange={e => setCampForm({ ...campForm, start_date: e.target.value || null })} />
            <Input label="End" type="date" value={campForm.end_date || ''} onChange={e => setCampForm({ ...campForm, end_date: e.target.value || null })} />
            <Input label="Budget (AED)" type="number" min={0} value={campForm.budget ?? 0} onChange={e => setCampForm({ ...campForm, budget: Number(e.target.value) || 0 })} />
            <Input label="Bookings won" type="number" min={0} value={campForm.bookings ?? 0} onChange={e => setCampForm({ ...campForm, bookings: Number(e.target.value) || 0 })} />
            <Input label="Revenue won (AED)" type="number" min={0} value={campForm.revenue ?? 0} onChange={e => setCampForm({ ...campForm, revenue: Number(e.target.value) || 0 })} />
            <Input label="Notes" value={campForm.notes || ''} onChange={e => setCampForm({ ...campForm, notes: e.target.value })} />
            {campForm.channel === 'whatsapp' && <p className="col-span-2 text-[11.5px] text-slate-500">WhatsApp: a campaign to many clients is sent from Conversations → Broadcasts with a Meta-approved template (WhatsApp's rule). The CSV gives every number with its message.</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
