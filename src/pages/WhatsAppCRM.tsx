import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, Loader2, Inbox as InboxIcon, CalendarCheck, Handshake, Megaphone, BarChart3, Settings2, FileText, Maximize2, PanelLeftOpen, CircleCheck, CircleAlert, MoreVertical, FlaskConical, CloudUpload, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { demo, useInboxDemo } from '@/lib/inboxDemo'
import { backupInbox, waDeleteAll } from '@/lib/inboxBackup'
import { useLayout } from '@/components/layout/Layout'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { notify } from '@/lib/notify'
import { loadConversations, subscribeWhatsApp, waStart, waStatus, type WaConversation } from '@/lib/whatsapp'
import { loadRules } from '@/lib/whatsappModules'
import { waAgents, type WaAgent } from '@/lib/whatsappCrm'
import { WaInbox } from '@/components/whatsapp/WaInbox'
import { Facebook, Instagram } from '@/components/whatsapp/GhlChat'
import { ghlStatus } from '@/lib/ghlInbox'
import { WaJobs } from '@/components/whatsapp/WaJobs'
import { WaDeals } from '@/components/whatsapp/WaDeals'
import { WaBroadcast } from '@/components/whatsapp/WaBroadcast'
import { WaAnalytics } from '@/components/whatsapp/WaAnalytics'
import { WaSettings } from '@/components/whatsapp/WaSettings'
import { WaTemplatesHub } from '@/components/whatsapp/WaTemplatesHub'

/**
 * R-WA-01..03, UX-114: the CRM's own WhatsApp (Meta Cloud API, no GHL).
 * Layout like the WhatsApp CRM prototype: a module rail on the left, the module on the right, and a
 * Full screen mode (no CRM sidebar) with "Back to Sidebar". Nothing is blocked by setup: a missing step
 * shows inside the module that needs it.
 */
const MODULES = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon, note: '' },
  { key: 'jobs', label: 'Jobs', icon: CalendarCheck, note: 'Bookings of WhatsApp clients' },
  { key: 'deals', label: 'Deals', icon: Handshake, note: 'Sales pipeline' },
  { key: 'broadcast', label: 'Broadcasts', icon: Megaphone, note: 'Contact lists and campaigns' },
  { key: 'templates', label: 'Templates', icon: FileText, note: 'Meta templates, quick replies, automation, keyword triggers' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, note: 'Volumes, reply time, agents' },
  { key: 'settings', label: 'Settings', icon: Settings2, note: 'Users, notifications, tags, connection' },
] as const
type ModuleKey = (typeof MODULES)[number]['key']

export function WhatsAppCRM() {
  const { clients } = useData()
  const { user } = useAuth()
  const { focusMode, setFocusMode } = useLayout()
  const [params, setParams] = useSearchParams()
  // R-INBOX-05: Templates, Quick replies, Automation and Keyword Triggers live in the Templates module — old links land there
  const oldTab = params.get('tab') || ''
  const oldS = params.get('s') || ''
  const moved = (oldTab === 'automation' || oldTab === 'keywords') ? oldTab
    : (oldTab === 'settings' && ['templates', 'replies', 'automation', 'keywords'].includes(oldS)) ? oldS : ''
  useEffect(() => { if (moved) setParams(p => { p.set('tab', 'templates'); p.set('t', moved); p.delete('s'); return p }, { replace: true }) }, [moved, setParams])
  const tab: ModuleKey = (MODULES.find(t => t.key === params.get('tab'))?.key) || 'inbox'
  const mod = MODULES.find(m => m.key === tab)!
  const setTab = useCallback((t: ModuleKey) => setParams(p => { p.set('tab', t); return p }, { replace: true }), [setParams])

  const [loading, setLoading] = useState(true)
  const [ghlOn, setGhlOn] = useState(false)
  useEffect(() => { void ghlStatus().then(setGhlOn).catch(() => setGhlOn(false)) }, [])
  const [configured, setConfigured] = useState(false)
  const [tablesReady, setTablesReady] = useState(false)
  const [modulesReady, setModulesReady] = useState(false)
  const [convs, setConvs] = useState<WaConversation[]>([])
  const [agents, setAgents] = useState<WaAgent[]>([])
  /** "wa:<id>" or "ghl:<id>" — R-INBOX-02 */
  const [activeId, setActiveId] = useState<string | null>(null)
  const demoState = useInboxDemo()
  const [menu, setMenu] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [delText, setDelText] = useState('')
  const [busy, setBusy] = useState<'backup' | 'delete' | null>(null)
  const isAdmin = user?.role === 'admin'

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
      waStart(phone, params.get('name') || undefined).then(({ id }) => { setActiveId(`wa:${id}`); void refreshConvs() }).catch(e => notify.error((e as Error).message))
    } else notify.error('WhatsApp is not connected yet — see Settings')
    setParams(p => { p.delete('phone'); p.delete('name'); p.set('tab', 'inbox'); return p }, { replace: true })
  }, [params, loading, configured, tablesReady, setParams, refreshConvs])

  const openChat = useCallback((id: string) => { setActiveId(`wa:${id}`); setTab('inbox') }, [setTab])
  const unreadTotal = useMemo(() => convs.reduce((s, c) => s + (c.unread_count || 0), 0) + (demoState.on ? demoState.wa.reduce((s, c) => s + c.unread_count, 0) : 0), [convs, demoState])

  // R-INBOX-02: ⋮ menu
  const runBackup = async () => {
    setMenu(false); setBusy('backup')
    try {
      const r = await backupInbox()
      const what = `${r.counts.whatsapp_chats} WhatsApp chats, ${r.counts.whatsapp_messages} messages, ${r.counts.facebook_instagram_chats} Facebook / Instagram chats`
      if (r.where === 'download') notify.success(`Google Drive is not connected (Settings → Backup), so the backup was downloaded: ${what}`)
      else notify.success(`Backup sent to Google Drive: ${what}`)
      return true
    } catch (e) { notify.error(`Backup failed: ${(e as Error).message}`); return false } finally { setBusy(null) }
  }
  const runDelete = async () => {
    if (delText !== 'DELETE') return
    setBusy('delete')
    try {
      const r = tablesReady ? await waDeleteAll() : { deleted: 0, files: 0 }
      if (demoState.on) demo.clear()
      notify.success(`Deleted ${r.deleted} WhatsApp chats${r.files ? ` and ${r.files} files` : ''}${demoState.on ? ' (and the demo chats)' : ''}`)
      setDelOpen(false); setDelText(''); setActiveId(null); void refreshConvs()
    } catch (e) { notify.error((e as Error).message) } finally { setBusy(null) }
  }
  const crmOn = convs.length > 0 ? convs.some(c => c.status !== undefined) : true

  const menuPanel = (
    <>
      <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(false)} />
      <div role="menu" className="absolute left-0 top-9 z-40 w-72 bg-white border border-[#E6E8E6] rounded-xl shadow-xl p-1.5">
        <button type="button" role="menuitem" onClick={() => { demo.setOn(!demoState.on); setMenu(false); setActiveId(null) }} className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left cursor-pointer">
          <FlaskConical size={15} className="text-violet-600 mt-0.5" />
          <span><span className="block text-[13px] font-semibold">{demoState.on ? 'Hide demo data' : 'Show demo data'}</span><span className="block text-[11px] text-slate-500">Sample WhatsApp chats for testing — only in this browser, never saved to Supabase</span></span>
        </button>
        <button type="button" role="menuitem" onClick={() => void runBackup()} disabled={!tablesReady} className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left cursor-pointer disabled:opacity-40">
          <CloudUpload size={15} className="text-sky-600 mt-0.5" />
          <span><span className="block text-[13px] font-semibold">Backup to Google Drive</span><span className="block text-[11px] text-slate-500">All WhatsApp chats, messages and notes + the Facebook / Instagram chat list</span></span>
        </button>
        {isAdmin && (
          <button type="button" role="menuitem" onClick={() => { setMenu(false); setDelOpen(true) }} className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-red-50 text-left cursor-pointer">
            <Trash2 size={15} className="text-red-600 mt-0.5" />
            <span><span className="block text-[13px] font-semibold text-red-600">Delete all conversations</span><span className="block text-[11px] text-slate-500">Every WhatsApp chat in the CRM, with messages, notes and media</span></span>
          </button>
        )}
      </div>
    </>
  )

  return (
    <div className={`bg-white border border-[#E6E8E6] rounded-[20px] overflow-hidden flex ${focusMode ? 'h-full' : 'h-[calc(100dvh-7rem)] sm:h-[calc(100dvh-3.5rem)] -mt-1 sm:-mt-2 lg:-mt-4'} min-h-[540px]`}>
      {/* module rail */}
      <nav aria-label="WhatsApp modules" className="w-[64px] lg:w-[184px] shrink-0 border-r border-[#ECEEEC] bg-[#FAFBFA] flex flex-col">
        {/* R-INBOX-03 / R-INBOX-06: platform icons and ⋮ on the first row; the connection status under them opens Settings → Connection */}
        <div className="px-3 pt-3 pb-2 border-b border-[#ECEEEC] shrink-0 space-y-1.5">
          <div className="flex items-center justify-center lg:justify-start gap-3">
            {([['WhatsApp', MessageCircle, configured], ['Facebook', Facebook, ghlOn], ['Instagram', Instagram, ghlOn]] as const).map(([label, Icon, on]) => (
              <span key={label} title={`${label}: ${loading ? 'checking…' : on ? 'connected' : 'not connected'}`} className={`relative ${on ? 'text-slate-600' : 'text-slate-300'} ${label !== 'WhatsApp' ? 'hidden lg:inline-flex' : 'inline-flex'}`}>
                <Icon size={17} />
                <span className={`absolute -bottom-0.5 -right-1 w-2 h-2 rounded-full ring-2 ring-[#FAFBFA] ${loading ? 'bg-slate-300' : on ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              </span>
            ))}
            <div className="relative hidden lg:block ml-auto">
              <button type="button" onClick={() => setMenu(m => !m)} aria-label="More" aria-expanded={menu} className="p-1.5 rounded-lg text-slate-500 hover:bg-white cursor-pointer">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <MoreVertical size={15} />}
              </button>
              {menu && menuPanel}
            </div>
          </div>
          {!loading && (
            <button type="button" onClick={() => setParams(p => { p.set('tab', 'settings'); p.set('s', 'connection'); return p }, { replace: true })} title="Open Settings → Connection"
              className={`hidden lg:flex items-center gap-1 text-[11px] font-semibold hover:underline cursor-pointer ${configured && ghlOn ? 'text-emerald-700' : 'text-amber-700'}`}>
              {configured && ghlOn ? <CircleCheck size={11} /> : <CircleAlert size={11} />}
              {[configured, ghlOn].filter(Boolean).length === 0 ? 'Not connected' : configured && ghlOn ? 'All connected' : 'Partly connected'}
            </button>
          )}
          {demoState.on && <span className="hidden lg:inline-block text-[10px] font-black tracking-wider text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">DEMO DATA ON</span>}
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
        {/* R-INBOX-06: the Inbox starts at the top — no title row; other modules keep a slim title */}
        {tab !== 'inbox' && (
          <header className="h-14 px-4 sm:px-6 border-b border-[#ECEEEC] flex items-center gap-3 shrink-0">
            <mod.icon size={18} className="text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] font-bold text-[#0F1F19] leading-tight truncate">{mod.label}</h1>
              <p className="text-[11.5px] text-slate-400 truncate">{mod.note}</p>
            </div>
          </header>
        )}

        {loading && (tab === 'inbox' || tab === 'jobs' || tab === 'analytics' || tab === 'settings' || tab === 'templates') ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
        ) : tab === 'inbox' ? (
          <WaInbox convs={convs} tablesReady={tablesReady} configured={configured} crmOn={crmOn} agents={agents} me={user?.id || null}
            clientName={clientName} activeId={activeId} setActiveId={setActiveId} refresh={() => void refreshConvs()} />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#FBFCFB]">
            {tab === 'jobs' && <WaJobs convs={convs} onOpenChat={openChat} canSend={configured} />}
            {tab === 'deals' && <WaDeals onOpenChat={openChat} agents={agents} />}
            {tab === 'broadcast' && <WaBroadcast canSend={configured && !loading} />}
            {tab === 'templates' && <WaTemplatesHub configured={configured} />}
            {tab === 'analytics' && (tablesReady ? <WaAnalytics agents={agents} /> : <p className="text-center text-[13px] text-slate-500 py-10">Analytics starts once the inbox database step is done.</p>)}
            {tab === 'settings' && <WaSettings configured={configured} tablesReady={tablesReady} modulesReady={modulesReady} crmOn={crmOn && convs.length > 0 ? true : null} agents={agents} />}
          </div>
        )}
      </div>
      <Modal open={delOpen} onClose={() => { setDelOpen(false); setDelText('') }} title="Delete all conversations">
        <div className="space-y-3 text-[13px]">
          <p className="text-slate-700">This deletes <b>every WhatsApp chat in the CRM</b> — {convs.length} chats with all their messages, team notes and photos / voice notes. It cannot be undone.</p>
          <p className="text-slate-500 text-[12px]">Facebook and Instagram chats live in GHL and are not deleted. Deals and campaign results stay (their chat link is removed).</p>
          <button type="button" onClick={() => void runBackup()} disabled={busy !== null || !tablesReady} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-sky-200 text-sky-700 font-semibold hover:bg-sky-50 cursor-pointer disabled:opacity-40">
            {busy === 'backup' ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />} Make a backup first
          </button>
          <label className="block text-[12px] font-semibold text-slate-600">Type <b>DELETE</b> to confirm
            <input value={delText} onChange={e => setDelText(e.target.value)} className="mt-1 w-full rounded-xl border border-[#E2E5E0] px-3 py-2 text-[13px] outline-none focus:border-red-400" autoComplete="off" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setDelOpen(false); setDelText('') }} className="px-4 py-2 rounded-xl border border-[#E2E5E0] font-semibold cursor-pointer">Cancel</button>
            <button type="button" onClick={() => void runDelete()} disabled={delText !== 'DELETE' || busy !== null} className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold disabled:opacity-30 cursor-pointer flex items-center gap-1.5">
              {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete all
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
