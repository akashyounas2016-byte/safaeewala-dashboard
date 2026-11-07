import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, Loader2, Inbox as InboxIcon, CalendarCheck, Handshake, Megaphone, BarChart3, Bot, KeyRound, FileText, Settings2, Maximize2, PanelLeftOpen, CircleCheck, CircleAlert } from 'lucide-react'
import { useLayout } from '@/components/layout/Layout'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { notify } from '@/lib/notify'
import { loadConversations, subscribeWhatsApp, waStart, waStatus, type WaConversation } from '@/lib/whatsapp'
import { loadRules } from '@/lib/whatsappModules'
import { waAgents, type WaAgent } from '@/lib/whatsappCrm'
import { WaInbox } from '@/components/whatsapp/WaInbox'
import { WaJobs } from '@/components/whatsapp/WaJobs'
import { WaDeals } from '@/components/whatsapp/WaDeals'
import { WaBroadcast } from '@/components/whatsapp/WaBroadcast'
import { WaAnalytics } from '@/components/whatsapp/WaAnalytics'
import { WaAutomation, WaKeywords } from '@/components/whatsapp/WaAutomation'
import { WaTemplates } from '@/components/whatsapp/WaTemplates'
import { WaSettings } from '@/components/whatsapp/WaSettings'

/**
 * R-WA-01..03, UX-114: the CRM's own WhatsApp (Meta Cloud API, no GHL).
 * Layout like the WhatsApp CRM prototype: a module rail on the left, the module on the right, and a
 * Full screen mode (no CRM sidebar) with "Back to Sidebar". Nothing is blocked by setup: a missing step
 * shows inside the module that needs it.
 */
const MODULES = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon, note: 'Chats on the business number' },
  { key: 'jobs', label: 'Jobs', icon: CalendarCheck, note: 'Bookings of WhatsApp clients' },
  { key: 'deals', label: 'Deals', icon: Handshake, note: 'Sales pipeline' },
  { key: 'broadcast', label: 'Broadcasts', icon: Megaphone, note: 'Contact lists and campaigns' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, note: 'Volumes, reply time, agents' },
  { key: 'automation', label: 'Automations', icon: Bot, note: 'Welcome, away, deal-stage rules' },
  { key: 'keywords', label: 'Keyword Trigger', icon: KeyRound, note: 'Instant replies to words' },
  { key: 'templates', label: 'Templates', icon: FileText, note: 'Approved message templates' },
  { key: 'settings', label: 'Settings', icon: Settings2, note: 'Connection, team, hours' },
] as const
type ModuleKey = (typeof MODULES)[number]['key']

export function WhatsAppCRM() {
  const { clients } = useData()
  const { user } = useAuth()
  const { focusMode, setFocusMode } = useLayout()
  const [params, setParams] = useSearchParams()
  const tab: ModuleKey = (MODULES.find(t => t.key === params.get('tab'))?.key) || 'inbox'
  const mod = MODULES.find(m => m.key === tab)!
  const setTab = useCallback((t: ModuleKey) => setParams(p => { p.set('tab', t); return p }, { replace: true }), [setParams])

  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [tablesReady, setTablesReady] = useState(false)
  const [modulesReady, setModulesReady] = useState(false)
  const [convs, setConvs] = useState<WaConversation[]>([])
  const [agents, setAgents] = useState<WaAgent[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const clientName = useCallback((id: string | null) => (id ? clients.find(c => c.id === id)?.full_name || null : null), [clients])
  const refreshConvs = useCallback(async () => {
    const list = await loadConversations().catch(() => null)
    setTablesReady(list !== null)
    if (list) setConvs(list)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [status, list, rules, team] = await Promise.all([
        waStatus().catch(() => ({ configured: false, templates: false })),
        loadConversations().catch(() => null),
        loadRules().catch(() => null),
        waAgents().catch(() => [] as WaAgent[]),
      ])
      if (!alive) return
      setConfigured(status.configured); setTablesReady(list !== null); setModulesReady(rules !== null); setAgents(team)
      if (list) setConvs(list)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])
  useEffect(() => () => setFocusMode?.(false), [setFocusMode]) // leaving WhatsApp brings the sidebar back

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
    } else notify.error('WhatsApp is not connected yet — see Settings')
    setParams(p => { p.delete('phone'); p.delete('name'); p.set('tab', 'inbox'); return p }, { replace: true })
  }, [params, loading, configured, tablesReady, setParams, refreshConvs])

  const openChat = useCallback((id: string) => { setActiveId(id); setTab('inbox') }, [setTab])
  const unreadTotal = useMemo(() => convs.reduce((s, c) => s + (c.unread_count || 0), 0), [convs])
  const crmOn = convs.length > 0 ? convs.some(c => c.status !== undefined) : true

  return (
    <div className={`bg-white border border-[#E6E8E6] rounded-[20px] overflow-hidden flex ${focusMode ? 'h-full' : 'h-[calc(100dvh-7rem)] sm:h-[calc(100dvh-3.5rem)] -mt-1 sm:-mt-2 lg:-mt-4'} min-h-[540px]`}>
      {/* module rail */}
      <nav aria-label="WhatsApp modules" className="w-[64px] lg:w-[220px] shrink-0 border-r border-[#ECEEEC] bg-[#FAFBFA] flex flex-col">
        <div className="h-16 px-3 lg:px-4 flex items-center gap-2.5 border-b border-[#ECEEEC] shrink-0">
          <span className="w-9 h-9 rounded-xl bg-[#0F1F19] text-emerald-300 flex items-center justify-center shrink-0"><MessageCircle size={18} /></span>
          <span className="hidden lg:block min-w-0">
            <span className="block text-[14px] font-bold text-[#0F1F19] leading-tight">WhatsApp CRM</span>
            <span className={`flex items-center gap-1 text-[11px] font-semibold ${configured ? 'text-emerald-600' : 'text-amber-600'}`}>
              {configured ? <CircleCheck size={11} /> : <CircleAlert size={11} />}{loading ? 'Checking…' : configured ? 'Connected' : 'Not connected'}
            </span>
          </span>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {MODULES.map(m => {
            const on = tab === m.key
            return (
              <li key={m.key}>
                <button type="button" onClick={() => setTab(m.key)} aria-current={on ? 'page' : undefined} title={m.label}
                  className={`w-full flex items-center gap-2.5 px-2.5 lg:px-3 py-2.5 rounded-xl text-[13px] cursor-pointer transition-colors justify-center lg:justify-start ${on ? 'bg-white text-[#0F1F19] font-semibold shadow-[0_1px_3px_rgba(15,31,25,0.08)] border border-[#E6E8E6]' : 'text-slate-500 hover:bg-white hover:text-slate-800 border border-transparent'}`}>
                  <m.icon size={17} className={on ? 'text-emerald-600' : ''} />
                  <span className="hidden lg:block flex-1 text-left truncate">{m.label}</span>
                  {m.key === 'inbox' && unreadTotal > 0 && <span className="hidden lg:flex min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold items-center justify-center">{unreadTotal}</span>}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="p-2 border-t border-[#ECEEEC] shrink-0">
          <button type="button" onClick={() => setFocusMode?.(!focusMode)} title={focusMode ? 'Back to Sidebar' : 'Full screen'}
            className="w-full flex items-center gap-2.5 px-2.5 lg:px-3 py-2.5 rounded-xl text-[12.5px] font-semibold text-slate-600 hover:bg-white hover:text-[#0F1F19] cursor-pointer justify-center lg:justify-start">
            {focusMode ? <PanelLeftOpen size={17} /> : <Maximize2 size={17} />}
            <span className="hidden lg:block">{focusMode ? 'Back to Sidebar' : 'Full screen'}</span>
          </button>
        </div>
      </nav>

      {/* module */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-4 sm:px-6 border-b border-[#ECEEEC] flex items-center gap-3 shrink-0">
          <mod.icon size={18} className="text-emerald-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-bold text-[#0F1F19] leading-tight truncate">{mod.label}</h1>
            <p className="text-[11.5px] text-slate-400 truncate">{mod.note}</p>
          </div>
          {!loading && !configured && tab !== 'settings' && (
            <button type="button" onClick={() => setTab('settings')} className="hidden sm:flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg cursor-pointer">
              <CircleAlert size={13} /> Sending off — connect in Settings
            </button>
          )}
          <button type="button" onClick={() => setFocusMode?.(!focusMode)}
            className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer ${focusMode ? 'bg-[#0F1F19] text-white hover:bg-[#1c3a2f]' : 'border border-[#E6E8E6] text-slate-600 hover:bg-slate-50'}`}>
            {focusMode ? <><PanelLeftOpen size={14} /> Back to Sidebar</> : <><Maximize2 size={14} /> Full screen</>}
          </button>
        </header>

        {loading && (tab === 'inbox' || tab === 'jobs' || tab === 'analytics' || tab === 'settings') ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
        ) : tab === 'inbox' ? (
          <WaInbox convs={convs} tablesReady={tablesReady} configured={configured} crmOn={crmOn} agents={agents} me={user?.id || null}
            clientName={clientName} activeId={activeId} setActiveId={setActiveId} refresh={() => void refreshConvs()} />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#FBFCFB]">
            {tab === 'jobs' && <WaJobs convs={convs} onOpenChat={openChat} />}
            {tab === 'deals' && <WaDeals onOpenChat={openChat} agents={agents} />}
            {tab === 'broadcast' && <WaBroadcast canSend={configured && !loading} />}
            {tab === 'analytics' && (tablesReady ? <WaAnalytics agents={agents} /> : <p className="text-center text-[13px] text-slate-500 py-10">Analytics starts once the inbox database step is done.</p>)}
            {tab === 'automation' && <WaAutomation canSend={configured} />}
            {tab === 'keywords' && <WaKeywords />}
            {tab === 'templates' && <WaTemplates key={String(configured)} canSend={configured} />}
            {tab === 'settings' && <WaSettings configured={configured} tablesReady={tablesReady} modulesReady={modulesReady} crmOn={crmOn && convs.length > 0 ? true : null} agents={agents} />}
          </div>
        )}
      </div>
    </div>
  )
}
