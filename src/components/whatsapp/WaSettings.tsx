import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Copy, Link2, Loader2, Phone, PlugZap, Users, BellOff } from 'lucide-react'
import { notify } from '@/lib/notify'
import { waConnect, waPhone, type WaPhoneInfo } from '@/lib/whatsappModules'
import { loadAssignment, loadLists, saveAssignment, type AssignmentSetting, type WaAgent } from '@/lib/whatsappCrm'
import { NotificationsSettings, QuickRepliesSettings, SettingsIcons, TagsSettings } from './WaSettingsMore'
import { loadGhlTags } from '@/lib/inboxSettings'
import { loadTemplates } from '@/lib/templateBuilder'
import { useSearchParams } from 'react-router-dom'
import { WaTemplates } from './WaTemplates'
import { WaAutomation, WaKeywords } from './WaAutomation'
import { btnGhost, btnPrimary, inputCls } from './WaShared'

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[13px] text-slate-700">
      {done ? <CheckCircle2 size={17} className="text-emerald-600 shrink-0 mt-0.5" /> : <Circle size={17} className="text-slate-300 shrink-0 mt-0.5" />}
      <span>{children}</span>
    </li>
  )
}

/** R-WA-02 Settings: connection checklist, the number as Meta sees it, register + subscribe without a terminal */
/** R-WA-03: who gets new chats — by hand, or in turn (round-robin) among the chosen agents */
function TeamAssignment({ agents }: { agents: WaAgent[] }) {
  const [v, setV] = useState<AssignmentSetting | null | undefined | 'loading'>('loading')
  useEffect(() => { loadAssignment().then(x => setV(x === null ? { mode: 'manual', agents: [] } : x)).catch(() => setV(undefined)) }, [])
  if (v === 'loading') return <Loader2 className="animate-spin text-slate-300" />
  if (v === undefined || v === null) return <p className="text-[12.5px] text-slate-500">Needs the database step 2026-11-07_whatsapp_modules.sql.</p>
  const save = async () => {
    if (v.mode === 'round_robin' && !v.agents.length) return notify.error('Pick at least one agent for round-robin')
    try { await saveAssignment(v); notify.success('Saved') } catch (e) { notify.error((e as Error).message) }
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 bg-[#F4F5F4] rounded-xl p-1 max-w-sm">
        {(['manual', 'round_robin'] as const).map(m => (
          <button key={m} type="button" onClick={() => setV({ ...v, mode: m })} className={`py-1.5 rounded-lg text-[12.5px] font-semibold cursor-pointer ${v.mode === m ? 'bg-white shadow-xs' : 'text-slate-500'}`}>{m === 'manual' ? 'Manual' : 'Round-robin'}</button>
        ))}
      </div>
      <p className="text-[12px] text-slate-500">{v.mode === 'manual' ? 'New chats stay unassigned; anyone can take one with "Assign" in the chat.' : 'Each new chat goes to the next agent below, in turn.'}</p>
      {v.mode === 'round_robin' && (
        <ul className="border border-[#ECEEEC] rounded-xl divide-y divide-slate-100">
          {agents.length === 0 && <li className="p-3 text-[12px] text-slate-400">No admins / managers found.</li>}
          {agents.map(a => (
            <li key={a.id}><label className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] cursor-pointer">
              <input type="checkbox" checked={v.agents.includes(a.id)} onChange={e => setV({ ...v, agents: e.target.checked ? [...v.agents, a.id] : v.agents.filter(x => x !== a.id) })} />
              <span className="flex-1 font-semibold">{a.name}</span><span className="text-slate-400 capitalize">{a.role}</span>
            </label></li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => void save()} className={btnPrimary}>Save</button>
    </div>
  )
}

function ConnectionPanel({ configured, tablesReady, modulesReady }: { configured: boolean; tablesReady: boolean; modulesReady: boolean }) {
  const [crmReady, setCrmReady] = useState<boolean | null>(null)
  useEffect(() => { loadLists().then(l => setCrmReady(l !== null)).catch(() => setCrmReady(false)) }, [])
  const [tagsReady, setTagsReady] = useState<boolean | null>(null)
  const [tplReady, setTplReady] = useState<boolean | null>(null)
  useEffect(() => { loadTemplates().then(t => setTplReady(t !== null)).catch(() => setTplReady(false)) }, [])
  useEffect(() => { loadGhlTags().then(t => setTagsReady(t !== null)).catch(() => setTagsReady(false)) }, [])
  const hook = `${window.location.origin}/api/whatsapp/webhook`
  const [info, setInfo] = useState<WaPhoneInfo | null | 'loading'>(configured ? 'loading' : null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => { if (!configured) return; setInfo('loading'); waPhone().then(setInfo).catch(e => { notify.error((e as Error).message); setInfo(null) }) }
  useEffect(load, [configured]) // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy(true)
    try { const r = await waConnect(pin.trim() || undefined); notify.success(r.done.length ? `Done: ${r.done.join(' + ')}` : 'Nothing to do'); setPin(''); load() }
    catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }
  const p = info && info !== 'loading' ? info.phone : null

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <section className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-3">
        <p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><PlugZap size={17} className="text-emerald-600" /> Connection checklist</p>
        <ol className="space-y-2">
          <Step done={tablesReady}>Database: <code className="bg-slate-100 px-1 rounded">2026-11-06_whatsapp_inbox.sql</code> run in Supabase.</Step>
          <Step done={modulesReady}>Database: <code className="bg-slate-100 px-1 rounded">2026-11-07_whatsapp_modules.sql</code> run (Deals, Broadcast, Automation, Keyword Trigger).</Step>
          <Step done={Boolean(crmReady)}>Database: <code className="bg-slate-100 px-1 rounded">2026-11-07_whatsapp_crm_more.sql</code> run (status, assignment, notes, contact lists, retarget).</Step>
          <Step done={Boolean(tagsReady)}>Database: <code className="bg-slate-100 px-1 rounded">2026-11-07_inbox_tags_notifications.sql</code> run (tags on Facebook / Instagram chats, client notifications).</Step>
          <Step done={Boolean(tplReady)}>Database: <code className="bg-slate-100 px-1 rounded">2026-11-07_wa_templates.sql</code> run (template builder).</Step>
          <Step done={configured}>VPS <code className="bg-slate-100 px-1 rounded">.env</code>: the five <code className="bg-slate-100 px-1 rounded">WHATSAPP_*</code> keys, then restart.</Step>
          <Step done={Boolean(p?.display_phone_number)}>Number added in Meta and visible here.</Step>
          <Step done={info !== 'loading' && Boolean(info?.subscribed)}>WhatsApp account subscribed to the app (button below).</Step>
          <Step done={false}>Meta app → WhatsApp → Configuration → Webhook: the URL below, the same verify token, and <b>messages</b> subscribed. Then write to the number from a phone.</Step>
        </ol>
        <div className="flex items-center gap-2 bg-[#F4F6F3] rounded-xl px-3 py-2">
          <Link2 size={14} className="text-slate-500 shrink-0" />
          <code className="text-[12px] flex-1 break-all">{hook}</code>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(hook); notify.success('Copied') }} className="p-1.5 rounded-lg hover:bg-white cursor-pointer" title="Copy"><Copy size={13} /></button>
        </div>
      </section>

      <section className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-3">
        <p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><Phone size={17} className="text-emerald-600" /> Business number</p>
        {!configured ? <p className="text-[12.5px] text-slate-500">Shows once the Meta keys are on the server.</p>
          : info === 'loading' ? <Loader2 className="animate-spin text-slate-400" />
          : !p ? <p className="text-[12.5px] text-red-600">Meta did not answer — check WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.</p>
          : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
              {[
                ['Number', p.display_phone_number], ['Name', p.verified_name], ['Name review', p.name_status], ['Quality', p.quality_rating],
                ['Verification', p.code_verification_status], ['Platform', p.platform_type], ['App subscribed', info?.subscribed === null ? '—' : info?.subscribed ? 'Yes' : 'No'],
              ].map(([k, v]) => <div key={k}><dt className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">{k}</dt><dd className="font-semibold text-[#111827]">{v || '—'}</dd></div>)}
            </dl>
          )}
        <div className="border-t border-[#E2E5E0] pt-3 space-y-2">
          <p className="text-[12.5px] text-slate-600"><b>Connect the number</b> — registers it on the Cloud API (needs a 6-digit PIN you choose; it becomes the number's two-step PIN) and subscribes the WhatsApp account to this app. Leave the PIN empty to only subscribe. Admins only.</p>
          <div className="flex gap-2">
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6-digit PIN (optional)" className={`${inputCls} w-48`} />
            <button type="button" onClick={() => void connect()} disabled={!configured || busy} className={btnPrimary}>{busy && <Loader2 size={14} className="animate-spin" />} Connect</button>
            <button type="button" onClick={load} disabled={!configured} className={btnGhost}>Refresh</button>
          </div>
        </div>
      </section>
      <section className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-2">
        <p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><BellOff size={17} className="text-red-500" /> Opt-out (STOP)</p>
        <p className="text-[12.5px] text-slate-600">A client who writes <b>STOP</b> (or UNSUBSCRIBE) is marked "Opted out", gets one confirmation, and every campaign skips the number. <b>START</b> subscribes again. The list is in Broadcasts → Contacts List → Unsubscribers. Chats themselves keep working.</p>
      </section>
    </div>
  )
}

/**
 * R-INBOX-04: Settings with tabs — Users, Notifications, Tags, Templates, Replies, Automation, Keyword Trigger,
 * Connection. Automation, Keyword Trigger and Templates moved here from the module rail.
 */
const SETTINGS_TABS = [
  { key: 'users', label: 'Users' }, { key: 'notifications', label: 'Notifications' }, { key: 'tags', label: 'Tags' },
  { key: 'templates', label: 'Templates' }, { key: 'replies', label: 'Replies' }, { key: 'automation', label: 'Automation' },
  { key: 'keywords', label: 'Keyword Trigger' }, { key: 'connection', label: 'Connection' },
] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]['key']

export function WaSettings({ configured, tablesReady, modulesReady, agents = [] }: { configured: boolean; tablesReady: boolean; modulesReady: boolean; crmOn?: boolean | null; agents?: WaAgent[] }) {
  const [params, setParams] = useSearchParams()
  const tab: SettingsTab = SETTINGS_TABS.find(t => t.key === params.get('s'))?.key || 'users'
  const card = 'bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-3'
  return (
    <div className="space-y-4">
      <nav aria-label="Settings" className="flex gap-1 overflow-x-auto border-b border-[#ECEEEC] -mt-1">
        {SETTINGS_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setParams(p => { p.set('s', t.key); return p }, { replace: true })} aria-current={tab === t.key ? 'page' : undefined}
            className={`relative px-3.5 py-2.5 text-[13px] whitespace-nowrap cursor-pointer ${tab === t.key ? 'font-bold text-[#0F1F19]' : 'font-semibold text-slate-500 hover:text-slate-800'}`}>
            {t.label}{tab === t.key && <span className="absolute left-2 right-2 -bottom-px h-[2.5px] rounded-full bg-emerald-600" />}
          </button>
        ))}
      </nav>
      {tab === 'users' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className={card}>
            <p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><Users size={17} className="text-emerald-600" /> Team — conversation assignment</p>
            <TeamAssignment agents={agents} />
          </section>
          <section className={card}>
            <p className="text-[15px] font-bold text-[#111827]">Agents</p>
            <p className="text-[12px] text-slate-500">Admins and managers can open Conversations and be given chats. Logins are managed in the CRM's main Settings → Users.</p>
            {agents.length === 0 ? <p className="text-[12.5px] text-slate-400">No agents found.</p> : (
              <ul className="divide-y divide-slate-100 border border-[#ECEEEC] rounded-xl">
                {agents.map(a => <li key={a.id} className="px-3 py-2 flex items-center gap-2 text-[12.5px]"><span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center">{a.name.slice(0, 1).toUpperCase()}</span><span className="flex-1 font-semibold">{a.name}</span><span className="text-slate-400 capitalize">{a.role}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      )}
      {tab === 'notifications' && <section className={card}><p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><SettingsIcons.BellRing size={17} className="text-emerald-600" /> Notifications to clients</p><NotificationsSettings configured={configured} /></section>}
      {tab === 'tags' && <section className={card}><p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><SettingsIcons.TagsIcon size={17} className="text-violet-600" /> Tags</p><TagsSettings /></section>}
      {tab === 'templates' && <WaTemplates key={String(configured)} canSend={configured} />}
      {tab === 'replies' && <section className={card}><p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><SettingsIcons.MessageSquareText size={17} className="text-sky-600" /> Saved replies</p><QuickRepliesSettings /></section>}
      {tab === 'automation' && <WaAutomation canSend={configured} />}
      {tab === 'keywords' && <WaKeywords />}
      {tab === 'connection' && <ConnectionPanel configured={configured} tablesReady={tablesReady} modulesReady={modulesReady} />}
    </div>
  )
}
