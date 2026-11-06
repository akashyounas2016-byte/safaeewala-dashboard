import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, Search, Loader2, Inbox as InboxIcon, CalendarCheck, Handshake, Megaphone, BarChart3, Bot, KeyRound, FileText, Settings2, Database } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { notify } from '@/lib/notify'
import { formatWaNumber, loadConversations, subscribeWhatsApp, waStart, waStatus, type WaConversation } from '@/lib/whatsapp'
import { loadRules } from '@/lib/whatsappModules'
import { WaChat, timeOf } from '@/components/whatsapp/WaChat'
import { SetupStrip } from '@/components/whatsapp/WaShared'
import { WaJobs } from '@/components/whatsapp/WaJobs'
import { WaDeals } from '@/components/whatsapp/WaDeals'
import { WaBroadcast } from '@/components/whatsapp/WaBroadcast'
import { WaAnalytics } from '@/components/whatsapp/WaAnalytics'
import { WaAutomation, WaKeywords } from '@/components/whatsapp/WaAutomation'
import { WaTemplates } from '@/components/whatsapp/WaTemplates'
import { WaSettings } from '@/components/whatsapp/WaSettings'

/**
 * R-WA-01 / R-WA-02: the CRM's own WhatsApp (Meta Cloud API, no GHL) with its modules as tabs.
 * Every tab opens even before the Meta keys or a database step are done — a missing step is
 * shown inside the tab that needs it, never as a wall over the whole screen.
 */
const TABS = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon },
  { key: 'jobs', label: 'Jobs', icon: CalendarCheck },
  { key: 'deals', label: 'Deals', icon: Handshake },
  { key: 'broadcast', label: 'Broadcast', icon: Megaphone },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'automation', label: 'Automation', icon: Bot },
  { key: 'keywords', label: 'Keyword Trigger', icon: KeyRound },
  { key: 'templates', label: 'Templates', icon: FileText },
  { key: 'settings', label: 'Settings', icon: Settings2 },
] as const
type TabKey = (typeof TABS)[number]['key']

export function WhatsAppCRM() {
  const { clients } = useData()
  const [params, setParams] = useSearchParams()
  const tab: TabKey = (TABS.find(t => t.key === params.get('tab'))?.key) || 'inbox'
  const setTab = useCallback((t: TabKey) => setParams(p => { p.set('tab', t); return p }, { replace: true }), [setParams])

  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [tablesReady, setTablesReady] = useState(false)
  const [modulesReady, setModulesReady] = useState(false)
  const [convs, setConvs] = useState<WaConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const clientName = useCallback((id: string | null) => (id ? clients.find(c => c.id === id)?.full_name || null : null), [clients])
  const active = convs.find(c => c.id === activeId) || null

  const refreshConvs = useCallback(async () => {
    const list = await loadConversations().catch(() => null)
    setTablesReady(list !== null)
    if (list) setConvs(list)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [status, list, rules] = await Promise.all([
        waStatus().catch(() => ({ configured: false, templates: false })),
        loadConversations().catch(() => null),
        loadRules().catch(() => null),
      ])
      if (!alive) return
      setConfigured(status.configured); setTablesReady(list !== null); setModulesReady(rules !== null)
      if (list) setConvs(list)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!tablesReady) return
    return subscribeWhatsApp(table => { if (table === 'wa_conversations') void refreshConvs() })
  }, [tablesReady, refreshConvs])

  // ?phone=… (from a client profile) opens or starts that chat
  useEffect(() => {
    const phone = params.get('phone')
    if (!phone || loading) return
    if (configured && tablesReady) {
      waStart(phone, params.get('name') || undefined).then(({ id }) => { setActiveId(id); void refreshConvs() }).catch(e => notify.error((e as Error).message))
    } else notify.error('WhatsApp is not connected yet — see the Settings tab')
    setParams(p => { p.delete('phone'); p.delete('name'); p.set('tab', 'inbox'); return p }, { replace: true })
  }, [params, loading, configured, tablesReady, setParams, refreshConvs])

  const openChat = useCallback((id: string) => { setActiveId(id); setTab('inbox') }, [setTab])

  const shown = useMemo(() => {
    const qy = search.trim().toLowerCase()
    return convs.filter(c => !qy || [c.name, c.wa_id, clientName(c.client_id), c.last_message_preview].some(v => String(v || '').toLowerCase().includes(qy)))
  }, [convs, search, clientName])
  const unreadTotal = convs.reduce((s, c) => s + (c.unread_count || 0), 0)

  return (
    <div className="space-y-4">
      <PageHero title="WhatsApp" subtitle="Client chats on the business number — straight from Meta, no GHL" statusChip={configured ? `${unreadTotal} unread` : 'Not connected'} showSearch={false} />

      <nav className="bg-white border border-[#E2E5E0] rounded-2xl p-1.5 flex gap-1 overflow-x-auto" aria-label="WhatsApp modules">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={tab === t.key ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-bold whitespace-nowrap cursor-pointer transition-colors ${tab === t.key ? 'bg-[#0F1F19] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            <t.icon size={14} />{t.label}
            {t.key === 'inbox' && unreadTotal > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center">{unreadTotal}</span>}
          </button>
        ))}
      </nav>

      {!loading && !configured && tab !== 'settings' && <SetupStrip onOpenSettings={() => setTab('settings')} />}

      {/* only the tabs that need the inbox data wait for it; the others open at once */}
      {loading && (tab === 'inbox' || tab === 'jobs' || tab === 'analytics' || tab === 'settings')
        ? <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-10 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /></div> : (
        <>
          {tab === 'inbox' && (
            !tablesReady ? (
              <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-8 text-center space-y-2">
                <Database className="mx-auto text-amber-500" />
                <p className="text-[13px] text-slate-600">The inbox needs the database step: run <code className="bg-slate-100 px-1 rounded">2026-11-06_whatsapp_inbox.sql</code> in Supabase.</p>
              </div>
            ) : (
              <div className="bg-white border border-[#E2E5E0] rounded-[22px] overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr] h-[calc(100vh-290px)] min-h-[520px]">
                <aside className={`border-r border-[#E2E5E0] flex flex-col min-h-0 ${active ? 'hidden md:flex' : 'flex'}`}>
                  <div className="p-3 border-b border-[#E2E5E0]">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 h-9">
                      <Search size={14} className="text-slate-400" />
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats…" className="bg-transparent outline-none text-[13px] flex-1" />
                    </div>
                  </div>
                  <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
                    {shown.length === 0 && <li className="p-6 text-center text-[12.5px] text-slate-400">No chats yet. Messages sent to the business number appear here.</li>}
                    {shown.map(c => {
                      const cn = clientName(c.client_id)
                      return (
                        <li key={c.id}>
                          <button type="button" onClick={() => setActiveId(c.id)} className={`w-full text-left px-3.5 py-3 flex gap-3 cursor-pointer ${c.id === activeId ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                            <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[13px] flex items-center justify-center shrink-0">{(cn || c.name || '#').slice(0, 1).toUpperCase()}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-[13.5px] font-bold text-[#111827] truncate">{cn || c.name || formatWaNumber(c.wa_id)}</span>
                                <span className="text-[10.5px] text-slate-400 shrink-0">{timeOf(c.last_message_at)}</span>
                              </span>
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-[12px] text-slate-500 truncate">{c.last_direction === 'out' ? 'You: ' : ''}{c.last_message_preview || ''}</span>
                                {c.unread_count > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-[10.5px] font-bold flex items-center justify-center shrink-0">{c.unread_count}</span>}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </aside>
                <section className={`flex flex-col min-h-0 ${active ? 'flex' : 'hidden md:flex'}`}>
                  {active
                    ? <WaChat key={active.id} conv={active} clientName={clientName(active.client_id)} canSend={configured} onBack={() => setActiveId(null)} onChanged={() => void refreshConvs()} />
                    : <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2"><MessageCircle size={36} /><p className="text-[13px]">Choose a chat</p></div>}
                </section>
              </div>
            )
          )}
          {tab === 'jobs' && <WaJobs convs={convs} onOpenChat={openChat} />}
          {tab === 'deals' && <WaDeals onOpenChat={openChat} />}
          {tab === 'broadcast' && <WaBroadcast canSend={configured && !loading} />}
          {tab === 'analytics' && (tablesReady ? <WaAnalytics /> : <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-8 text-center text-[13px] text-slate-500">Analytics starts once the inbox database step is done.</div>)}
          {tab === 'automation' && <WaAutomation />}
          {tab === 'keywords' && <WaKeywords />}
          {tab === 'templates' && <WaTemplates key={String(configured)} canSend={configured} />}
          {tab === 'settings' && <WaSettings configured={configured} tablesReady={tablesReady} modulesReady={modulesReady} />}
        </>
      )}
    </div>
  )
}
