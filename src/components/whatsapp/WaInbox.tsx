import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageCircle, Search, Database, UserCircle2, Layers, Info, SlidersHorizontal, X } from 'lucide-react'
import { notify } from '@/lib/notify'
import { loadGhlTags, saveGhlTags, tagSummary } from '@/lib/inboxSettings'
import { TagChip, useTagDefs } from './Tags'
import { formatWaNumber, type ChatStatus, type WaConversation } from '@/lib/whatsapp'
import { ghlConversations, ghlStatus, type GhlConversation, type InboxChannel } from '@/lib/ghlInbox'
import { CHAT_STATUSES, filterChats, type WaAgent } from '@/lib/whatsappCrm'
import { isDemoId, useInboxDemo } from '@/lib/inboxDemo'
import { WaChat, timeOf } from './WaChat'
import { CHANNEL, Facebook, GhlChat, Instagram } from './GhlChat'

/**
 * R-INBOX-02: one inbox inside the WhatsApp CRM — platform switcher All · WhatsApp · Facebook · Instagram.
 * WhatsApp chats keep their status tabs, Mine / Unassigned, assignment and notes (R-WA-03); Facebook and
 * Instagram come from the GHL sub-account (R-INBOX-01). DEMO chats (⋮ → Demo data) are mixed in, marked, and stay local.
 */
type Platform = 'all' | InboxChannel
const PLATFORMS: { key: Platform; label: string; icon: typeof Layers | typeof Facebook }[] = [
  { key: 'all', label: 'All', icon: Layers },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'facebook', label: 'Facebook', icon: Facebook },
  { key: 'instagram', label: 'Instagram', icon: Instagram },
]
type Item = { key: string; channel: InboxChannel; id: string; name: string; preview: string; out: boolean; at: string | null; unread: number; tags: string[]; wa?: WaConversation; ghl?: GhlConversation }
type Filters = { unread: boolean; tag: string; status: ChatStatus | ''; who: 'all' | 'mine' | 'unassigned'; optedOut: boolean }
const NO_FILTERS: Filters = { unread: false, tag: '', status: '', who: 'all', optedOut: false }

export function WaInbox({ convs, tablesReady, configured, crmOn, agents, me, clientName, activeId, setActiveId, refresh }: {
  convs: WaConversation[]
  tablesReady: boolean
  configured: boolean
  /** the R-WA-03 columns exist (status, assignment, notes) */
  crmOn: boolean
  agents: WaAgent[]
  me: string | null
  clientName: (id: string | null) => string | null
  /** "wa:<id>" or "ghl:<id>" */
  activeId: string | null
  setActiveId: (key: string | null) => void
  refresh: () => void
}) {
  const demoState = useInboxDemo()
  const [platform, setPlatform] = useState<Platform>('all')
  const [status, setStatus] = useState<ChatStatus | 'all'>('open')
  const [who, setWho] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [search, setSearch] = useState('')
  const [ghl, setGhl] = useState<GhlConversation[]>([])
  const [ghlState, setGhlState] = useState<'loading' | 'ok' | 'off' | 'error'>('loading')
  const tagDefs = useTagDefs()
  const [ghlTags, setGhlTags] = useState<Record<string, string[]> | null>({})
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  useEffect(() => { void loadGhlTags().then(setGhlTags).catch(() => setGhlTags(null)) }, [])
  const setTagsFor = async (ref: string, tags: string[]) => {
    if (ghlTags === null) { notify.error('Tags on Facebook / Instagram chats need the database step 2026-11-07_inbox_tags_notifications.sql'); return }
    setGhlTags(m => ({ ...(m || {}), [ref]: tags }))
    try { await saveGhlTags(ref, tags) } catch (e) { notify.error((e as Error).message) }
  }
  const filterCount = Object.entries(filters).filter(([k, v]) => (k === 'who' ? v !== 'all' : Boolean(v))).length

  const refreshGhl = useCallback(async () => { try { setGhl(await ghlConversations()); setGhlState('ok') } catch { setGhlState('error') } }, [])
  useEffect(() => { void ghlStatus().then(ok => { if (ok) void refreshGhl(); else setGhlState('off') }).catch(() => setGhlState('off')) }, [refreshGhl])
  useEffect(() => { if (ghlState !== 'ok') return; const t = setInterval(() => void refreshGhl(), 30000); return () => clearInterval(t) }, [ghlState, refreshGhl])

  const waAll = useMemo(() => (demoState.on ? [...demoState.wa, ...convs] : convs), [demoState.on, demoState.wa, convs])
  const ghlAll = useMemo(() => (demoState.on ? [...demoState.ghl, ...ghl] : ghl), [demoState.on, demoState.ghl, ghl])
  const agentName = useCallback((id: string | null | undefined) => (id ? agents.find(a => a.id === id)?.name || 'Agent' : null), [agents])
  const waOnly = platform === 'whatsapp'
  const crmFilters = waOnly && (crmOn || demoState.on)

  const items = useMemo<Item[]>(() => {
    const qy = search.trim().toLowerCase()
    const wa = (crmFilters ? filterChats(waAll, status, who, me) : waAll).map(c => ({
      key: `wa:${c.id}`, channel: 'whatsapp' as const, id: c.id, name: clientName(c.client_id) || c.name || formatWaNumber(c.wa_id),
      preview: c.last_message_preview || '', out: c.last_direction === 'out', at: c.last_message_at, unread: c.unread_count || 0, tags: c.tags || [], wa: c,
    }))
    const gh = ghlAll.map(c => ({ key: `ghl:${c.id}`, channel: c.channel, id: c.id, name: c.name, preview: c.preview, out: c.lastDirection === 'out', at: c.lastMessageAt, unread: c.unread, tags: (ghlTags || {})[`ghl:${c.id}`] || [], ghl: c }))
    return ([...wa, ...gh] as Item[])
      .filter(i => (platform === 'all' || i.channel === platform) && (!qy || `${i.name} ${i.preview} ${i.tags.join(' ')} ${i.wa?.wa_id || ''}`.toLowerCase().includes(qy)))
      .filter(i => (!filters.unread || i.unread > 0) && (!filters.tag || i.tags.some(t => t.toLowerCase() === filters.tag.toLowerCase()))
        && (!filters.status || (i.wa && (i.wa.status || 'open') === filters.status)) && (!filters.optedOut || Boolean(i.wa?.unsubscribed))
        && (filters.who === 'all' || (i.wa && (filters.who === 'mine' ? i.wa.assigned_to === me : !i.wa.assigned_to))))
      // R-INBOX-03: unread chats always on top, then newest first
      .sort((a, b) => (Number(b.unread > 0) - Number(a.unread > 0)) || String(b.at || '').localeCompare(String(a.at || '')))
  }, [waAll, ghlAll, ghlTags, platform, crmFilters, status, who, me, search, clientName, filters])

  const summary = useMemo(() => tagSummary([
    ...waAll.filter(() => platform === 'all' || platform === 'whatsapp').map(c => ({ unread: c.unread_count || 0, status: c.status, tags: c.tags || [] })),
    ...ghlAll.filter(c => platform === 'all' || c.channel === platform).map(c => ({ unread: c.unread, tags: (ghlTags || {})[`ghl:${c.id}`] || [] })),
  ]), [waAll, ghlAll, ghlTags, platform])
  const counts = useMemo(() => ({ all: waAll.length + ghlAll.length, whatsapp: waAll.length, facebook: ghlAll.filter(c => c.channel === 'facebook').length, instagram: ghlAll.filter(c => c.channel === 'instagram').length }), [waAll, ghlAll])
  const unread = (ch: Platform) => (ch === 'all' || ch === 'whatsapp' ? waAll.reduce((s, c) => s + (c.unread_count || 0), 0) : 0) + (ch === 'whatsapp' ? 0 : ghlAll.filter(c => ch === 'all' || c.channel === ch).reduce((s, c) => s + c.unread, 0))
  const statusCounts = useMemo(() => Object.fromEntries(CHAT_STATUSES.map(s => [s.key, waAll.filter(c => (c.status || 'open') === s.key).length])) as Record<ChatStatus, number>, [waAll])

  const activeWa = activeId?.startsWith('wa:') ? waAll.find(c => c.id === activeId.slice(3)) : undefined
  const activeGhl = activeId?.startsWith('ghl:') ? ghlAll.find(c => c.id === activeId.slice(4)) : undefined
  const active = activeWa || activeGhl
  useEffect(() => { if (activeId && !active) setActiveId(null) }, [activeId, active, setActiveId])

  const notes: string[] = []
  if (!tablesReady) notes.push('WhatsApp needs its database step (Settings)')
  else if (!configured) notes.push('WhatsApp: reading works; sending starts once the Meta keys are on the server')
  if (ghlState === 'off') notes.push('Facebook / Instagram: GHL key not on the server')
  if (ghlState === 'error') notes.push('Facebook / Instagram: GHL did not answer')

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(320px,380px)_1fr]">
      <aside className={`border-r border-[#ECEEEC] flex flex-col min-h-0 ${active ? 'hidden md:flex' : 'flex'}`}>
        {/* platform switcher */}
        <div role="tablist" aria-label="Platforms" className="grid grid-cols-4 border-b border-[#ECEEEC] px-1.5 shrink-0">
          {PLATFORMS.map(p => {
            const on = platform === p.key
            const tone = p.key === 'all' ? 'text-[#0F1F19]' : CHANNEL[p.key].text
            const u = unread(p.key)
            return (
              <button key={p.key} type="button" role="tab" aria-selected={on} onClick={() => setPlatform(p.key)} title={p.label}
                className={`relative flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11.5px] font-semibold cursor-pointer ${on ? tone : 'text-slate-400 hover:text-slate-600'}`}>
                <span className="relative"><p.icon size={16} />{u > 0 && <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">{u}</span>}</span>
                <span className="hidden min-[420px]:inline md:hidden xl:inline">{p.label}</span>
                <span className={`text-[10px] font-bold ${on ? '' : 'text-slate-300'}`}>{counts[p.key]}</span>
                {on && <span className={`absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full ${p.key === 'all' ? 'bg-[#0F1F19]' : CHANNEL[p.key].dot}`} />}
              </button>
            )
          })}
        </div>
        {crmFilters && (
          <div className="flex gap-1 px-3 pt-2.5 overflow-x-auto shrink-0">
            {[...CHAT_STATUSES.map(s => ({ key: s.key as ChatStatus | 'all', label: s.label, n: statusCounts[s.key] })), { key: 'all' as const, label: 'All', n: waAll.length }].map(s => (
              <button key={s.key} type="button" onClick={() => setStatus(s.key)}
                className={`px-2.5 py-1 rounded-lg text-[11.5px] font-semibold whitespace-nowrap cursor-pointer ${status === s.key ? 'bg-[#0F1F19] text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                {s.label} <span className={status === s.key ? 'text-white/60' : 'text-slate-300'}>{s.n}</span>
              </button>
            ))}
          </div>
        )}
        <div className="px-3 pt-2.5 pb-3 space-y-2 border-b border-[#ECEEEC] shrink-0">
          {crmFilters && (
            <div className="grid grid-cols-3 bg-[#F4F5F4] rounded-lg p-0.5">
              {(['all', 'mine', 'unassigned'] as const).map(k => (
                <button key={k} type="button" onClick={() => setWho(k)} className={`py-1 rounded-md text-[11.5px] font-semibold cursor-pointer ${who === k ? 'bg-white shadow-xs text-[#0F1F19]' : 'text-slate-500'}`}>
                  {k === 'all' ? 'Everyone' : k === 'mine' ? 'Mine' : 'Unassigned'}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <div className="flex items-center gap-2 bg-[#F4F5F4] rounded-xl px-3 h-9 flex-1 min-w-0 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100">
              <Search size={14} className="text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, number, message, tag" className="bg-transparent outline-none text-[13px] flex-1 min-w-0" />
            </div>
            <div className="relative">
              <button type="button" onClick={() => setFilterOpen(o => !o)} aria-label="Filters" aria-expanded={filterOpen} className={`h-9 px-2.5 rounded-xl flex items-center gap-1 text-[12px] font-semibold cursor-pointer ${filterCount ? 'bg-[#0F1F19] text-white' : 'bg-[#F4F5F4] text-slate-600 hover:bg-slate-200'}`}>
                <SlidersHorizontal size={14} />{filterCount > 0 && filterCount}
              </button>
              {filterOpen && (
                <>
                  <button type="button" aria-label="Close filters" className="fixed inset-0 z-20 cursor-default" onClick={() => setFilterOpen(false)} />
                  <div className="absolute right-0 top-10 z-30 w-64 bg-white border border-[#E6E8E6] rounded-xl shadow-xl p-3 space-y-2.5 text-[12.5px]">
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={filters.unread} onChange={e => setFilters(f => ({ ...f, unread: e.target.checked }))} /> Unread only</label>
                    <label className="block"><span className="text-[11px] font-bold text-slate-500">Tag</span>
                      <select value={filters.tag} onChange={e => setFilters(f => ({ ...f, tag: e.target.value }))} className="mt-0.5 w-full rounded-lg border border-[#E6E8E6] px-2 py-1.5"><option value="">Any tag</option>{tagDefs.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}</select>
                    </label>
                    <label className="block"><span className="text-[11px] font-bold text-slate-500">WhatsApp status</span>
                      <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value as ChatStatus | '' }))} className="mt-0.5 w-full rounded-lg border border-[#E6E8E6] px-2 py-1.5"><option value="">Any status</option>{CHAT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                    </label>
                    <label className="block"><span className="text-[11px] font-bold text-slate-500">Assigned</span>
                      <select value={filters.who} onChange={e => setFilters(f => ({ ...f, who: e.target.value as Filters['who'] }))} className="mt-0.5 w-full rounded-lg border border-[#E6E8E6] px-2 py-1.5"><option value="all">Everyone</option><option value="mine">Mine</option><option value="unassigned">Unassigned</option></select>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={filters.optedOut} onChange={e => setFilters(f => ({ ...f, optedOut: e.target.checked }))} /> Opted out (STOP)</label>
                    <button type="button" onClick={() => setFilters(NO_FILTERS)} className="w-full py-1.5 rounded-lg border border-[#E6E8E6] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Clear filters</button>
                  </div>
                </>
              )}
            </div>
          </div>
          {/* R-INBOX-03: summary — unread, pending and every tag in use; click to filter */}
          <div className="flex gap-1 flex-wrap">
            <button type="button" onClick={() => setFilters(f => ({ ...f, unread: !f.unread }))} className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border cursor-pointer ${filters.unread ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>Unread {summary.unread}</button>
            {summary.pending > 0 && <button type="button" onClick={() => setFilters(f => ({ ...f, status: f.status === 'pending' ? '' : 'pending' }))} className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border cursor-pointer ${filters.status === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>Pending {summary.pending}</button>}
            {Object.entries(summary.tags).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
              <button key={t} type="button" onClick={() => setFilters(f => ({ ...f, tag: f.tag === t ? '' : t }))} className={`cursor-pointer rounded-md ${filters.tag === t ? 'ring-2 ring-slate-400' : ''}`}><TagChip name={`${t} ${n}`} defsList={[...tagDefs.map(d => ({ ...d, name: `${d.name} ${summary.tags[d.name] ?? ''}` }))]} /></button>
            ))}
            {filterCount > 0 && <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-[11px] font-semibold text-slate-500 flex items-center gap-0.5 cursor-pointer"><X size={11} />Clear</button>}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {!tablesReady && platform === 'whatsapp' && !demoState.on && (
            <li className="p-6 text-center text-[12.5px] text-slate-500"><Database className="mx-auto text-amber-500 mb-1" size={18} />Run <code className="bg-slate-100 px-1 rounded">2026-11-06_whatsapp_inbox.sql</code> in Supabase.</li>
          )}
          {items.length === 0 && <li className="p-8 text-center text-[12.5px] text-slate-400">{ghlState === 'loading' ? 'Loading…' : 'No chats in this view.'}</li>}
          {items.map(i => {
            const ch = CHANNEL[i.channel]
            const on = i.key === activeId
            const owner = agentName(i.wa?.assigned_to)
            const isDemo = isDemoId(i.id)
            return (
              <li key={i.key}>
                <button type="button" onClick={() => setActiveId(i.key)} className={`w-full text-left px-3.5 py-3 flex gap-3 cursor-pointer border-l-[3px] ${on ? 'bg-[#F2F7F4] border-l-emerald-600' : 'border-l-transparent hover:bg-[#F8F9F8]'}`}>
                  <span className="relative w-10 h-10 rounded-full bg-[#EEF1EE] text-slate-600 font-semibold text-[13px] flex items-center justify-center shrink-0">
                    {i.name.replace('DEMO · ', '').slice(0, 1).toUpperCase()}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-[17px] h-[17px] rounded-full ${ch.dot} text-white flex items-center justify-center ring-2 ring-white`} title={ch.label}><ch.icon size={9} /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`text-[13.5px] truncate ${i.unread ? 'font-bold text-[#111827]' : 'font-semibold text-[#1F2937]'}`}>{i.name}</span>
                      <span className={`text-[10.5px] shrink-0 ${i.unread ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>{timeOf(i.at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`text-[12px] truncate ${i.unread ? 'text-slate-700' : 'text-slate-400'}`}>{i.out ? 'You: ' : ''}{i.preview}</span>
                      {i.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i.unread}</span>}
                    </span>
                    {(isDemo || owner || i.wa?.unsubscribed || i.tags.length > 0 || (i.wa?.status && i.wa.status !== 'open')) && (
                      <span className="flex items-center gap-1 mt-1 flex-wrap">
                        {isDemo && <span className="text-[9.5px] font-black tracking-wider text-violet-700 bg-violet-50 px-1.5 rounded">DEMO</span>}
                        {i.wa?.status && i.wa.status !== 'open' && <span className={`text-[10px] font-semibold px-1.5 rounded ${CHAT_STATUSES.find(s => s.key === i.wa!.status)?.tone}`}>{CHAT_STATUSES.find(s => s.key === i.wa!.status)?.label}</span>}
                        {owner && <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-0.5"><UserCircle2 size={10} />{owner}</span>}
                        {i.wa?.unsubscribed && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 rounded">Opted out</span>}
                        {i.tags.slice(0, 3).map(t => <TagChip key={t} name={t} defsList={tagDefs} />)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {notes.length > 0 && (
          <div className="px-4 py-2 border-t border-[#ECEEEC] text-[11px] text-slate-500 flex gap-2 shrink-0">
            <Info size={12} className="shrink-0 mt-0.5 text-amber-500" /><div>{notes.map(n => <p key={n}>{n}</p>)}</div>
          </div>
        )}
      </aside>
      <section className={`relative flex flex-col min-h-0 ${active ? 'flex' : 'hidden md:flex'}`}>
        {activeWa ? <WaChat key={activeWa.id} conv={activeWa} clientName={clientName(activeWa.client_id)} canSend={configured} onBack={() => setActiveId(null)} onChanged={refresh}
            crm={crmOn || isDemoId(activeWa.id) ? { agents, me } : undefined} />
          : activeGhl ? <GhlChat key={activeGhl.id} conv={activeGhl} onBack={() => setActiveId(null)} onChanged={() => void refreshGhl()} tags={(ghlTags || {})[`ghl:${activeGhl.id}`] || []} onTags={tags => void setTagsFor(`ghl:${activeGhl.id}`, tags)} />
          : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#FAFBFA]">
              <span className="w-14 h-14 rounded-2xl bg-white border border-[#ECEEEC] flex items-center justify-center text-slate-300"><MessageCircle size={26} /></span>
              <p className="text-[14px] font-semibold text-slate-600">Select a conversation</p>
              <p className="text-[12px] text-slate-400">WhatsApp, Facebook and Instagram — reply from here</p>
            </div>
          )}
      </section>
    </div>
  )
}
