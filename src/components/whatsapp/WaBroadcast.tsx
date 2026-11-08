import { useCallback, useEffect, useMemo, useState } from 'react'
import { Megaphone, Plus, Loader2, Users, CheckCircle2, XCircle, Search, ListChecks, Send, RotateCcw, Trash2, Tag, CalendarClock, Ban, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { notify } from '@/lib/notify'
import { formatWaNumber, loadConversations, templateBody, templateParamCount, waTemplates, type WaConversation, type WaTemplate } from '@/lib/whatsapp'
import { clientAudience, loadBroadcasts, parseRecipients, waBroadcast, type RetargetRule, type WaBroadcast as Broadcast } from '@/lib/whatsappModules'
import {
  RETARGET_RULES, addListTags, createList, deleteLists, loadListMembers, loadLists, loadRecipients, membersFromClients,
  updateChat, waCancelBroadcast, waRetargetPreview, type WaContactList, type WaRecipient,
} from '@/lib/whatsappCrm'
import { MigrationNote, btnGhost, btnPrimary, inputCls } from './WaShared'
import { timeOf } from './WaChat'

/**
 * R-WA-02 / R-WA-03 Broadcasts, laid out like the prototype: Contacts List · Create Campaign · Campaign List · Retarget Campaign.
 * Campaigns send one approved template to many numbers — now or at a set time (the server sends it) — and skip anyone who wrote STOP.
 */
type Sub = 'lists' | 'create' | 'campaigns' | 'retarget'
const SUBS: { key: Sub; label: string; icon: typeof Users }[] = [
  { key: 'lists', label: 'Contacts List', icon: Users },
  { key: 'create', label: 'Create Campaign', icon: Plus },
  { key: 'campaigns', label: 'Campaign List', icon: Send },
  { key: 'retarget', label: 'Retarget Campaign', icon: RotateCcw },
]
const STATUS_TONE: Record<string, string> = { scheduled: 'bg-sky-50 text-sky-700', sending: 'bg-amber-50 text-amber-700', done: 'bg-emerald-50 text-emerald-700', failed: 'bg-red-50 text-red-600', cancelled: 'bg-slate-100 text-slate-500' }

/** Template picker + values, shared by Create and Retarget */
function TemplateFields({ templates, tpl, setTpl, params, setParams }: { templates: WaTemplate[] | null; tpl: WaTemplate | null; setTpl: (t: WaTemplate | null) => void; params: string[]; setParams: (p: string[]) => void }) {
  if (templates === null) return <Loader2 className="animate-spin text-slate-300" />
  if (!templates.length) return <p className="text-[12.5px] text-slate-500">No approved templates — create one in Templates first.</p>
  return (
    <div className="space-y-2">
      <select value={tpl ? `${tpl.name}|${tpl.language}` : ''} onChange={e => { const t = templates.find(x => `${x.name}|${x.language}` === e.target.value) || null; setTpl(t); setParams(t ? Array(templateParamCount(t)).fill('') : []) }} className={inputCls}>
        <option value="">Choose a template…</option>
        {templates.map(t => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} · {t.language} · {t.category.toLowerCase()}</option>)}
      </select>
      {tpl && (
        <>
          {params.map((v, i) => <input key={i} value={v} onChange={e => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Value for {{${i + 1}}} — {name} = each person's name`} className={inputCls} />)}
          <div className="bg-[#F4F6F3] rounded-xl p-3 text-[12.5px] whitespace-pre-wrap">{templateBody(tpl, params)}</div>
        </>
      )}
    </div>
  )
}

export function WaBroadcast({ canSend }: { canSend: boolean }) {
  const { clients } = useData()
  const { user } = useAuth()
  const by = user?.full_name || user?.email || 'Staff'
  const [sub, setSub] = useState<Sub>('lists')
  const [campaigns, setCampaigns] = useState<Broadcast[] | null | 'loading'>('loading')
  const [lists, setLists] = useState<WaContactList[] | null | 'loading'>('loading')
  const [convs, setConvs] = useState<WaConversation[]>([])
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null)

  const refreshCampaigns = useCallback(() => loadBroadcasts().then(setCampaigns).catch(() => setCampaigns([])), [])
  const refreshLists = useCallback(() => loadLists().then(setLists).catch(() => setLists([])), [])
  useEffect(() => { void refreshCampaigns(); void refreshLists(); void loadConversations().then(c => setConvs(c || [])).catch(() => {}) }, [refreshCampaigns, refreshLists])
  useEffect(() => { if ((sub === 'create' || sub === 'retarget') && templates === null && canSend) void waTemplates().then(setTemplates).catch(() => setTemplates([])) }, [sub, templates, canSend])
  useEffect(() => {
    if (!Array.isArray(campaigns) || !campaigns.some(b => b.status === 'sending' || b.status === 'scheduled')) return
    const t = setInterval(() => void refreshCampaigns(), 5000)
    return () => clearInterval(t)
  }, [campaigns, refreshCampaigns])

  if (campaigns === 'loading') return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
  if (campaigns === null) return <MigrationNote />

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-5">
      <nav className="flex lg:flex-col gap-1 overflow-x-auto" aria-label="Broadcasts">
        {SUBS.map(s => (
          <button key={s.key} type="button" onClick={() => setSub(s.key)}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold whitespace-nowrap cursor-pointer ${sub === s.key ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-white'}`}>
            <s.icon size={15} />{s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0">
        {sub === 'lists' && <ContactLists lists={lists} refresh={refreshLists} convs={convs} clients={clients} by={by} onCampaign={() => setSub('create')} onConvsChanged={() => void loadConversations().then(c => setConvs(c || []))} />}
        {sub === 'create' && <CreateCampaign canSend={canSend} templates={templates} lists={Array.isArray(lists) ? lists : []} clients={clients} convs={convs} onDone={() => { void refreshCampaigns(); setSub('campaigns') }} />}
        {sub === 'campaigns' && <CampaignList campaigns={campaigns} refresh={refreshCampaigns} onNew={() => setSub('create')} />}
        {sub === 'retarget' && <Retarget canSend={canSend} templates={templates} campaigns={campaigns} onDone={() => { void refreshCampaigns(); setSub('campaigns') }} />}
      </div>
    </div>
  )
}

// ── Contacts List ──
function ContactLists({ lists, refresh, convs, clients, by, onCampaign, onConvsChanged }: {
  lists: WaContactList[] | null | 'loading'; refresh: () => void; convs: WaConversation[]
  clients: { id: string; full_name: string; phone?: string; whatsapp?: string; service_mode?: string }[]; by: string; onCampaign: () => void; onConvsChanged: () => void
}) {
  const [view, setView] = useState<'lists' | 'contacts' | 'unsub'>('lists')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ name: string; tags: string; source: 'clients' | 'chats' | 'paste'; mode: string; pasted: string } | null>(null)
  const [tagFor, setTagFor] = useState<string>('')
  const [busy, setBusy] = useState(false)

  if (lists === 'loading') return <Loader2 className="animate-spin text-slate-300" />
  if (lists === null) return <MigrationNote file="2026-11-07_whatsapp_crm_more.sql" />

  const contacts = (() => {
    const seen = new Map<string, { wa_id: string; name: string; source: string; unsub: boolean }>()
    convs.forEach(c => seen.set(c.wa_id, { wa_id: c.wa_id, name: c.name || formatWaNumber(c.wa_id), source: 'Chat', unsub: Boolean(c.unsubscribed) }))
    clientAudience(clients).forEach(a => { if (!seen.has(a.to)) seen.set(a.to, { wa_id: a.to, name: a.name, source: 'Client', unsub: false }) })
    return [...seen.values()]
  })()
  const qy = search.trim().toLowerCase()
  const shownLists = lists.filter(l => !qy || l.name.toLowerCase().includes(qy) || l.tags.some(t => t.includes(qy)))
  const shownContacts = contacts.filter(c => (view !== 'unsub' || c.unsub) && (!qy || c.name.toLowerCase().includes(qy) || c.wa_id.includes(qy.replace(/\D/g, '') || '§')))

  const create = async () => {
    if (!form?.name.trim()) return notify.error('Name the list')
    let members: { wa_id: string; name?: string | null; client_id?: string | null }[] = []
    if (form.source === 'clients') members = membersFromClients(clients.filter(c => form.mode === 'all' || (c.service_mode || 'general') === form.mode))
    if (form.source === 'chats') members = convs.filter(c => !c.unsubscribed).map(c => ({ wa_id: c.wa_id, name: c.name, client_id: c.client_id }))
    if (form.source === 'paste') members = parseRecipients(form.pasted).map(r => ({ wa_id: r.to, name: r.name || null }))
    if (!members.length) return notify.error('No numbers for this list')
    setBusy(true)
    try { await createList(form.name.trim(), form.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean), members, by); notify.success(`List saved — ${members.length} numbers`); setForm(null); refresh() }
    catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }
  const removeSel = async () => {
    if (!picked.size || !window.confirm(`Delete ${picked.size} list(s)? The contacts themselves stay.`)) return
    try { await deleteLists([...picked]); setPicked(new Set()); refresh() } catch (e) { notify.error((e as Error).message) }
  }
  const tagSel = async () => {
    const tags = tagFor.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    if (!picked.size || !tags.length) return
    try { await addListTags([...picked], tags, lists); setTagFor(''); refresh() } catch (e) { notify.error((e as Error).message) }
  }
  const resubscribe = async (waId: string) => {
    const c = convs.find(x => x.wa_id === waId)
    if (!c || !window.confirm('Only do this if the client asked to get messages again. Continue?')) return
    try { await updateChat(c.id, { unsubscribed: false }); onConvsChanged() } catch (e) { notify.error((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-bold text-[#0F1F19] mr-2">Contacts List</h2>
        <span className="text-[12.5px] text-slate-500 mr-auto">Total lists: <b className="text-[#0F1F19]">{lists.length}</b></span>
        <button type="button" onClick={() => setForm({ name: '', tags: '', source: 'clients', mode: 'all', pasted: '' })} className={btnGhost}><Plus size={14} /> New List</button>
        <span className="flex items-center gap-1 border border-[#E2E5E0] rounded-xl pl-2.5 bg-white">
          <Tag size={13} className="text-amber-500" />
          <input value={tagFor} onChange={e => setTagFor(e.target.value)} placeholder="Add tags" className="w-24 outline-none text-[12.5px] py-2" />
          <button type="button" onClick={() => void tagSel()} disabled={!picked.size || !tagFor.trim()} className="px-2.5 py-2 text-[12px] font-bold text-slate-600 disabled:opacity-30 cursor-pointer">Add</button>
        </span>
        <button type="button" onClick={() => void removeSel()} disabled={!picked.size} className={`${btnGhost} text-red-600`}><Trash2 size={14} /> Delete</button>
        <button type="button" onClick={onCampaign} className="px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 text-[12.5px] font-bold hover:bg-emerald-50 cursor-pointer flex items-center gap-1.5"><Megaphone size={14} /> Create Campaign</button>
      </div>
      <div className="bg-white border border-[#E6E8E6] rounded-[18px] overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-3 border-b border-[#ECEEEC]">
          <div className="flex bg-[#F4F5F4] rounded-xl p-1">
            {([['lists', 'All List'], ['contacts', 'All Contacts'], ['unsub', 'Unsubscribers']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setView(k)} className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold cursor-pointer ${view === k ? 'bg-white shadow-xs text-[#0F1F19]' : 'text-slate-500'}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 border border-[#E6E8E6] rounded-xl px-3 h-9 ml-auto w-full sm:w-64">
            <Search size={14} className="text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="flex-1 outline-none text-[13px]" />
          </div>
        </div>
        <div className="overflow-x-auto">
          {view === 'lists' ? (
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-[#FAFBFA]"><tr>
                <th className="px-4 py-2.5 w-8"><input type="checkbox" aria-label="Select all" checked={picked.size > 0 && picked.size === shownLists.length} onChange={e => setPicked(e.target.checked ? new Set(shownLists.map(l => l.id)) : new Set())} /></th>
                {['List name', 'Count', 'Created on', 'Created by', 'Tags'].map(h => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shownLists.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">No lists yet — "New List" makes one from your clients, your chats or pasted numbers.</td></tr>}
                {shownLists.map(l => (
                  <tr key={l.id} className="hover:bg-[#FAFBFA]">
                    <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${l.name}`} checked={picked.has(l.id)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n })} /></td>
                    <td className="px-4 py-3 font-semibold text-[#111827]">{l.name}</td>
                    <td className="px-4 py-3">{l.count}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{timeOf(l.created_at)}</td>
                    <td className="px-4 py-3">{l.created_by || '—'}</td>
                    <td className="px-4 py-3">{l.tags.length ? l.tags.map(t => <span key={t} className="mr-1 text-[11px] font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">{t}</span>) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-[#FAFBFA]"><tr>{['Name', 'Number', 'From', ''].map(h => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shownContacts.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">{view === 'unsub' ? 'Nobody has opted out. A client who writes STOP shows here and is skipped by every campaign.' : 'No contacts.'}</td></tr>}
                {shownContacts.slice(0, 300).map(c => (
                  <tr key={c.wa_id}>
                    <td className="px-4 py-2.5 font-semibold">{c.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatWaNumber(c.wa_id)}</td>
                    <td className="px-4 py-2.5">{c.source}{c.unsub && <span className="ml-1.5 text-[10.5px] font-bold text-red-600 bg-red-50 px-1.5 rounded">Opted out</span>}</td>
                    <td className="px-4 py-2.5 text-right">{view === 'unsub' && <button type="button" onClick={() => void resubscribe(c.wa_id)} className="text-[12px] font-bold text-emerald-700 hover:underline cursor-pointer">Subscribe again</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="New contact list">
        {form && (
          <div className="space-y-3">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="List name, e.g. Monthly clients — Marina" className={inputCls} />
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Tags, comma separated (optional)" className={inputCls} />
            <div className="grid grid-cols-3 gap-1 bg-[#F4F5F4] rounded-xl p-1">
              {([['clients', 'CRM clients'], ['chats', 'WhatsApp chats'], ['paste', 'Paste numbers']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, source: k })} className={`py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer ${form.source === k ? 'bg-white shadow-xs' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
            {form.source === 'clients' && (
              <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} className={inputCls}>
                <option value="all">All clients with a number ({membersFromClients(clients).length})</option>
                <option value="general">One-time clients</option><option value="monthly">Monthly clients</option><option value="biweekly">Bi-weekly clients</option>
              </select>
            )}
            {form.source === 'chats' && <p className="text-[12.5px] text-slate-500">Everyone who has a WhatsApp chat ({convs.filter(c => !c.unsubscribed).length}), opted-out numbers left out.</p>}
            {form.source === 'paste' && <textarea value={form.pasted} onChange={e => setForm({ ...form, pasted: e.target.value })} rows={5} placeholder={'One number per line, optional ", name"\n0501234567, Sara'} className={inputCls} />}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setForm(null)} className={btnGhost}>Cancel</button><button type="button" onClick={() => void create()} disabled={busy} className={btnPrimary}>{busy && <Loader2 size={14} className="animate-spin" />} Save list</button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Create Campaign ──
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#E6E8E6] rounded-[18px] p-5 space-y-3">
      <p className="text-[13.5px] font-bold text-[#0F1F19] flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[11px] flex items-center justify-center">{n}</span>{title}</p>
      {children}
    </section>
  )
}


function CreateCampaign({ canSend, templates, lists, clients, convs, onDone }: {
  canSend: boolean; templates: WaTemplate[] | null; lists: WaContactList[]
  clients: { id: string; full_name: string; phone?: string; whatsapp?: string; service_mode?: string }[]; convs: WaConversation[]; onDone: () => void
}) {
  const [name, setName] = useState('')
  const [tpl, setTpl] = useState<WaTemplate | null>(null)
  const [params, setParams] = useState<string[]>([])
  const [source, setSource] = useState<'lists' | 'clients' | 'paste'>(lists.length ? 'lists' : 'clients')
  const [listIds, setListIds] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [pasted, setPasted] = useState('')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [at, setAt] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [listMembers, setListMembers] = useState<{ to: string; name?: string }[]>([])
  useEffect(() => { void loadListMembers([...listIds]).then(m => setListMembers(m.map(x => ({ to: x.wa_id, name: x.name || undefined })))).catch(() => setListMembers([])) }, [listIds])

  const audience = useMemo(() => clientAudience(clients), [clients])
  const optedOut = useMemo(() => new Set(convs.filter(c => c.unsubscribed).map(c => c.wa_id)), [convs])
  const recipients = useMemo(() => {
    const raw = source === 'lists' ? listMembers : source === 'clients' ? audience.filter(a => picked.has(a.to)).map(a => ({ to: a.to, name: a.name })) : parseRecipients(pasted)
    const seen = new Set<string>()
    return raw.filter(r => !seen.has(r.to) && seen.add(r.to))
  }, [source, listMembers, audience, picked, pasted])
  const skipped = recipients.filter(r => optedOut.has(r.to)).length
  const shown = audience.filter(a => !search.trim() || a.name.toLowerCase().includes(search.trim().toLowerCase()))

  const send = async () => {
    if (!tpl) return
    if (when === 'later' && (!at || new Date(at).getTime() < Date.now())) return notify.error('Choose a time in the future')
    setBusy(true)
    try {
      const r = await waBroadcast({ name: name.trim(), templateName: tpl.name, language: tpl.language, params, preview: templateBody(tpl, params), recipients, ...(when === 'later' ? { scheduledAt: new Date(at).toISOString() } : {}) })
      notify.success(r.scheduled ? `Scheduled for ${new Date(at).toLocaleString('en-AE', { timeZone: 'Asia/Dubai' })} — ${r.total} numbers` : `Sending to ${r.total} numbers`)
      onDone()
    } catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }

  if (!canSend) return <div className="bg-white border border-[#E6E8E6] rounded-[18px] p-8 text-center text-[13px] text-slate-500">Campaigns need the Meta keys on the server (Settings). Contact lists can already be made.</div>
  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-[18px] font-bold text-[#0F1F19]">Create Campaign</h2>
      <Step n={1} title="Name and template">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Campaign name, e.g. Eid offer 2026" className={inputCls} />
        <TemplateFields templates={templates} tpl={tpl} setTpl={setTpl} params={params} setParams={setParams} />
      </Step>
      <Step n={2} title={`Audience — ${recipients.length} numbers${skipped ? ` (${skipped} opted out, skipped)` : ''}`}>
        <div className="grid grid-cols-3 gap-1 bg-[#F4F5F4] rounded-xl p-1">
          {([['lists', 'Contact lists'], ['clients', 'Pick clients'], ['paste', 'Paste numbers']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSource(k)} className={`py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer ${source === k ? 'bg-white shadow-xs' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
        {source === 'lists' && (lists.length === 0 ? <p className="text-[12.5px] text-slate-500">No contact lists yet — make one in Contacts List.</p> : (
          <ul className="border border-[#ECEEEC] rounded-xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
            {lists.map(l => (
              <li key={l.id}><label className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={listIds.has(l.id)} onChange={e => setListIds(p => { const n = new Set(p); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n })} />
                <span className="flex-1 font-semibold">{l.name}</span><span className="text-slate-400">{l.count}</span>
              </label></li>
            ))}
          </ul>
        ))}
        {source === 'clients' && (
          <>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 border border-[#E2E5E0] rounded-xl px-3 h-9 flex-1"><Search size={13} className="text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients" className="flex-1 outline-none text-[13px]" /></div>
              <button type="button" onClick={() => setPicked(p => new Set([...p, ...shown.map(a => a.to)]))} className={btnGhost}>Select shown</button>
              <button type="button" onClick={() => setPicked(new Set())} className={btnGhost}>Clear</button>
            </div>
            <ul className="max-h-52 overflow-y-auto border border-[#ECEEEC] rounded-xl divide-y divide-slate-100">
              {shown.map(a => (
                <li key={a.to}><label className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(a.to)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(a.to); else n.delete(a.to); return n })} />
                  <span className="flex-1 truncate font-semibold">{a.name}</span><span className="text-slate-400">+{a.to}</span>
                </label></li>
              ))}
            </ul>
          </>
        )}
        {source === 'paste' && <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={4} placeholder={'One number per line, optional ", name"\n0501234567, Sara'} className={inputCls} />}
      </Step>
      <Step n={3} title="When">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={when === 'now'} onChange={() => setWhen('now')} /> Send now</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={when === 'later'} onChange={() => setWhen('later')} /> Schedule</label>
          {when === 'later' && <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className={`${inputCls} w-auto`} />}
        </div>
        <label className="flex items-start gap-2 text-[12.5px] text-slate-700 cursor-pointer">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" />
          These people agreed to get WhatsApp messages from Safaeewala. (Messages to people who did not can get the number blocked by Meta; each message is charged.)
        </label>
        <div className="flex justify-end">
          <button type="button" onClick={() => void send()} disabled={busy || !tpl || !recipients.length || !consent || params.some(p => !p.trim())} className={btnPrimary}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : when === 'later' ? <CalendarClock size={14} /> : <Megaphone size={14} />} {when === 'later' ? 'Schedule' : 'Send'} to {recipients.length - skipped}
          </button>
        </div>
      </Step>
    </div>
  )
}

// ── Campaign List ──
function CampaignList({ campaigns, refresh, onNew }: { campaigns: Broadcast[]; refresh: () => void; onNew: () => void }) {
  const [open, setOpen] = useState<Broadcast | null>(null)
  const [recips, setRecips] = useState<WaRecipient[] | null>(null)
  useEffect(() => { if (open) { setRecips(null); void loadRecipients(open.id).then(setRecips).catch(() => setRecips([])) } }, [open])
  const cancel = async (b: Broadcast) => {
    if (!window.confirm(`Cancel the scheduled campaign "${b.name}"?`)) return
    try { await waCancelBroadcast(b.id); refresh() } catch (e) { notify.error((e as Error).message) }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><h2 className="text-[18px] font-bold text-[#0F1F19] mr-auto">Campaign List</h2><button type="button" onClick={onNew} className={btnPrimary}><Plus size={14} /> Create Campaign</button></div>
      <div className="bg-white border border-[#E6E8E6] rounded-[18px] overflow-hidden">
        {campaigns.length === 0 ? <p className="p-8 text-center text-[12.5px] text-slate-400">No campaigns yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {campaigns.map(b => (
              <li key={b.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setOpen(b)} className="min-w-0 flex-1 text-left cursor-pointer">
                  <p className="text-[13px] font-bold text-[#111827] flex items-center gap-1">{b.name}{b.retarget_of && <span className="text-[10.5px] font-semibold text-violet-700 bg-violet-50 px-1.5 rounded">Retarget</span>}<ChevronRight size={13} className="text-slate-300" /></p>
                  <p className="text-[11.5px] text-slate-500">{b.template_name} · {b.status === 'scheduled' && b.scheduled_at ? `for ${new Date(b.scheduled_at).toLocaleString('en-AE', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : timeOf(b.created_at)} · by {b.created_by || '—'}</p>
                </button>
                <span className="text-[12px] font-semibold text-slate-600 flex items-center gap-1"><Users size={13} />{b.total}</span>
                <span className="text-[12px] font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={13} />{b.sent}</span>
                <span className="text-[12px] font-semibold text-red-600 flex items-center gap-1"><XCircle size={13} />{b.failed}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_TONE[b.status] || ''}`}>{b.status === 'sending' ? `Sending ${b.sent + b.failed}/${b.total}` : b.status}</span>
                {b.status === 'scheduled' && <button type="button" onClick={() => void cancel(b)} title="Cancel" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"><Ban size={14} /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Recipients — ${open.name}` : ''} size="lg">
        {recips === null ? <Loader2 className="mx-auto animate-spin text-slate-300" /> : (
          <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {recips.map(r => (
              <li key={r.id} className="py-2 flex items-center gap-3 text-[12.5px]">
                <span className="flex-1 font-semibold">{r.name || '—'}</span><span className="text-slate-400">{formatWaNumber(r.wa_id)}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : r.status === 'failed' ? 'bg-red-50 text-red-600' : r.status === 'skipped' ? 'bg-slate-100 text-slate-500' : 'bg-sky-50 text-sky-700'}`} title={r.error || ''}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  )
}

// ── Retarget Campaign ──
function Retarget({ canSend, templates, campaigns, onDone }: { canSend: boolean; templates: WaTemplate[] | null; campaigns: Broadcast[]; onDone: () => void }) {
  const sources = campaigns.filter(c => c.status === 'done' || c.status === 'failed')
  const [src, setSrc] = useState('')
  const [rule, setRule] = useState<RetargetRule>('no_reply')
  const [count, setCount] = useState<number | null>(null)
  const [tpl, setTpl] = useState<WaTemplate | null>(null)
  const [params, setParams] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)
  useEffect(() => { if (!src || !canSend) { setCount(null); return } setCount(null); void waRetargetPreview(src, rule).then(setCount).catch(() => setCount(0)) }, [src, rule, canSend])
  const retargets = campaigns.filter(c => c.retarget_of)

  const send = async () => {
    if (!tpl || !src) return
    setBusy(true)
    try {
      const source = campaigns.find(c => c.id === src)
      const r = await waBroadcast({ name: `${source?.name || 'Campaign'} — ${RETARGET_RULES.find(x => x.key === rule)?.label.toLowerCase()}`, templateName: tpl.name, language: tpl.language, params, preview: templateBody(tpl, params), retargetOf: src, retargetRule: rule })
      notify.success(`Retargeting ${r.total} numbers`); onDone()
    } catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }

  if (!started) {
    return (
      <div className="space-y-4">
        <h2 className="text-[18px] font-bold text-[#0F1F19]">Retarget Campaign</h2>
        {retargets.length === 0 ? (
          <div className="bg-white border border-[#E6E8E6] rounded-[18px] p-10 text-center space-y-3">
            <span className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 inline-flex items-center justify-center"><RotateCcw size={24} /></span>
            <p className="text-[15px] font-bold text-[#0F1F19]">No retarget campaigns yet</p>
            <p className="text-[12.5px] text-slate-500">Re-engage contacts who didn't respond to previous campaigns.</p>
            <button type="button" onClick={() => setStarted(true)} disabled={!canSend || !sources.length} className={`${btnPrimary} mx-auto`}><Plus size={14} /> Create Retarget Campaign</button>
            {!sources.length && <p className="text-[11.5px] text-slate-400">Send a campaign first — retargeting picks from its recipients.</p>}
          </div>
        ) : (
          <>
            <div className="flex justify-end"><button type="button" onClick={() => setStarted(true)} disabled={!canSend} className={btnPrimary}><Plus size={14} /> Create Retarget Campaign</button></div>
            <ul className="bg-white border border-[#E6E8E6] rounded-[18px] divide-y divide-slate-100">
              {retargets.map(b => (
                <li key={b.id} className="px-5 py-3 flex items-center gap-3 text-[12.5px]">
                  <span className="flex-1 min-w-0"><span className="font-bold block truncate">{b.name}</span><span className="text-slate-500">{RETARGET_RULES.find(r => r.key === b.retarget_rule)?.label} · {timeOf(b.created_at)}</span></span>
                  <span className="text-emerald-700 font-semibold">{b.sent}/{b.total}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_TONE[b.status] || ''}`}>{b.status}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-[18px] font-bold text-[#0F1F19]">Create Retarget Campaign</h2>
      <section className="bg-white border border-[#E6E8E6] rounded-[18px] p-5 space-y-3">
        <p className="text-[13px] font-bold">1 · Earlier campaign</p>
        <select value={src} onChange={e => setSrc(e.target.value)} className={inputCls}>
          <option value="">Choose…</option>
          {sources.map(c => <option key={c.id} value={c.id}>{c.name} · {c.sent}/{c.total} sent · {timeOf(c.created_at)}</option>)}
        </select>
        <p className="text-[13px] font-bold pt-1">2 · Who gets it again</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {RETARGET_RULES.map(r => (
            <button key={r.key} type="button" onClick={() => setRule(r.key)} className={`text-left p-3 rounded-xl border cursor-pointer ${rule === r.key ? 'border-emerald-500 bg-emerald-50/50' : 'border-[#E6E8E6]'}`}>
              <p className="text-[12.5px] font-bold">{r.label}</p><p className="text-[11px] text-slate-500">{r.note}</p>
            </button>
          ))}
        </div>
        {src && <p className="text-[12.5px] text-slate-600 flex items-center gap-1.5"><ListChecks size={14} /> {count === null ? 'Counting…' : `${count} numbers match`}</p>}
      </section>
      <section className="bg-white border border-[#E6E8E6] rounded-[18px] p-5 space-y-3">
        <p className="text-[13px] font-bold">3 · Template</p>
        <TemplateFields templates={templates} tpl={tpl} setTpl={setTpl} params={params} setParams={setParams} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setStarted(false)} className={btnGhost}>Back</button>
          <button type="button" onClick={() => void send()} disabled={busy || !tpl || !src || !count || params.some(p => !p.trim())} className={btnPrimary}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Retarget {count || 0}</button>
        </div>
      </section>
    </div>
  )
}
