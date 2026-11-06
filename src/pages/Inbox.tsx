import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Search, Loader2, Send, ArrowLeft, Info, RefreshCw } from 'lucide-react'

/** lucide has no brand icons: two small plain marks for the channel badges */
const Facebook = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7H17l.5-4h-4V8.8c0-.5.3-.8.5-.8z" /></svg>
)
const Instagram = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>
)
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { notify } from '@/lib/notify'
import { formatWaNumber, loadConversations, subscribeWhatsApp, waStatus, type WaConversation } from '@/lib/whatsapp'
import { ghlConversations, ghlMessages, ghlRead, ghlSend, ghlStatus, mergeInbox, type GhlConversation, type GhlMessage, type InboxChannel } from '@/lib/ghlInbox'
import { WaChat, timeOf } from '@/components/whatsapp/WaChat'

/**
 * R-INBOX-01: one Inbox for every channel — WhatsApp from the CRM's own WhatsApp (R-WA-01),
 * Facebook and Instagram from the GHL sub-account. A channel that is not connected yet is noted, never blocks the others.
 */
const CHANNEL = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700' },
  facebook: { label: 'Facebook', icon: Facebook, dot: 'bg-blue-600', chip: 'bg-blue-50 text-blue-700' },
  instagram: { label: 'Instagram', icon: Instagram, dot: 'bg-pink-500', chip: 'bg-pink-50 text-pink-700' },
} as const

function GhlChat({ conv, onBack, onChanged }: { conv: GhlConversation; onBack: () => void; onChanged: () => void }) {
  const [msgs, setMsgs] = useState<GhlMessage[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const ch = CHANNEL[conv.channel]

  const load = useCallback(() => ghlMessages(conv.id).then(setMsgs).catch(e => { notify.error((e as Error).message); setMsgs([]) }), [conv.id])
  useEffect(() => {
    void load()
    if (conv.unread) void ghlRead(conv.id).then(onChanged).catch(() => {})
    const t = setInterval(() => void load(), 15000) // GHL has no live feed for us: check every 15 s while the chat is open
    return () => clearInterval(t)
  }, [conv.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    try { await ghlSend(conv, text.trim()); setText(''); await load(); onChanged() }
    catch (e) { notify.error((e as Error).message) } finally { setSending(false) }
  }

  return (
    <>
      <header className="px-4 py-3 border-b border-[#E2E5E0] flex items-center gap-3">
        <button type="button" onClick={onBack} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Back"><ArrowLeft size={16} /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold text-[#111827] truncate">{conv.name}</p>
          <p className="text-[11.5px] text-slate-500 flex items-center gap-1"><ch.icon size={11} /> {ch.label} · through GHL</p>
        </div>
        <button type="button" onClick={() => void load()} className="p-2 rounded-lg hover:bg-slate-100 cursor-pointer" title="Refresh"><RefreshCw size={14} /></button>
      </header>
      <div className="flex-1 overflow-y-auto bg-[#F4F6F3] px-4 py-4 space-y-2">
        {msgs === null ? <Loader2 className="mx-auto animate-spin text-slate-400" /> : msgs.length === 0 ? <p className="text-center text-[12px] text-slate-400 py-6">No messages.</p> : msgs.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-xs space-y-1 ${m.direction === 'out' ? 'bg-blue-50 rounded-br-md' : 'bg-white rounded-bl-md'}`}>
              {m.attachments.map(a => <a key={a} href={a} target="_blank" rel="noreferrer" className="block text-[12px] font-bold text-blue-700 underline break-all">Attachment</a>)}
              {m.body && <p className="text-[13px] text-[#111827] whitespace-pre-wrap break-words">{m.body}</p>}
              <p className="text-right text-[10px] text-slate-500">{timeOf(m.at)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <footer className="p-3 border-t border-[#E2E5E0] flex items-end gap-2">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={1} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder={`Reply on ${ch.label} — Enter to send`} className="flex-1 resize-none max-h-32 min-h-10 rounded-xl border border-[#E2E5E0] px-3 py-2.5 text-[13px] outline-none focus:border-blue-500" />
        <button type="button" onClick={() => void send()} disabled={!text.trim() || sending} aria-label="Send" className="h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </footer>
    </>
  )
}

export function Inbox() {
  const { clients } = useData()
  const [filter, setFilter] = useState<'all' | InboxChannel>('all')
  const [search, setSearch] = useState('')
  const [wa, setWa] = useState<WaConversation[]>([])
  const [waState, setWaState] = useState<'loading' | 'ok' | 'nodb'>('loading')
  const [waConfigured, setWaConfigured] = useState(false)
  const [ghl, setGhl] = useState<GhlConversation[]>([])
  const [ghlState, setGhlState] = useState<'loading' | 'ok' | 'off' | 'error'>('loading')
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const clientName = useCallback((id: string | null) => (id ? clients.find(c => c.id === id)?.full_name || null : null), [clients])
  const refreshWa = useCallback(async () => {
    const list = await loadConversations().catch(() => null)
    if (list === null) { setWaState('nodb'); return }
    setWa(list); setWaState('ok')
  }, [])
  const refreshGhl = useCallback(async () => {
    try { setGhl(await ghlConversations()); setGhlState('ok') } catch { setGhlState('error') }
  }, [])

  useEffect(() => {
    void refreshWa()
    void waStatus().then(s => setWaConfigured(s.configured)).catch(() => {})
    void ghlStatus().then(ok => { if (ok) void refreshGhl(); else setGhlState('off') }).catch(() => setGhlState('off'))
  }, [refreshWa, refreshGhl])
  useEffect(() => { if (waState !== 'ok') return; return subscribeWhatsApp(t => { if (t === 'wa_conversations') void refreshWa() }) }, [waState, refreshWa])
  useEffect(() => { if (ghlState !== 'ok') return; const t = setInterval(() => void refreshGhl(), 30000); return () => clearInterval(t) }, [ghlState, refreshGhl])

  const items = useMemo(() => mergeInbox(wa, ghl, c => clientName(c.client_id) || c.name || formatWaNumber(c.wa_id)), [wa, ghl, clientName])
  const shown = items.filter(i => (filter === 'all' || i.channel === filter) && (!search.trim() || `${i.name} ${i.preview}`.toLowerCase().includes(search.trim().toLowerCase())))
  const counts = { all: items.length, whatsapp: 0, facebook: 0, instagram: 0 } as Record<'all' | InboxChannel, number>
  items.forEach(i => { counts[i.channel]++ })
  const unread = items.reduce((s, i) => s + i.unread, 0)
  const active = items.find(i => i.key === activeKey) || null
  const activeWa = active?.channel === 'whatsapp' ? wa.find(c => c.id === active.id) : undefined
  const activeGhl = active && active.channel !== 'whatsapp' ? ghl.find(c => c.id === active.id) : undefined

  const notes: React.ReactNode[] = []
  if (waState === 'nodb') notes.push(<span key="wa">WhatsApp: run the inbox database step — <Link to="/whatsapp-crm?tab=settings" className="underline font-bold">WhatsApp → Settings</Link>.</span>)
  else if (waState === 'ok' && !waConfigured) notes.push(<span key="wa2">WhatsApp: chats can be read; sending starts once the Meta keys are on the server — <Link to="/whatsapp-crm?tab=settings" className="underline font-bold">Settings</Link>.</span>)
  if (ghlState === 'off') notes.push(<span key="ghl">Facebook / Instagram: put <code className="bg-white/70 px-1 rounded">GHL_API_KEY</code> and <code className="bg-white/70 px-1 rounded">GHL_LOCATION_ID</code> in the VPS .env (GHL → Settings → Private Integrations, with the Conversations scopes).</span>)
  if (ghlState === 'error') notes.push(<span key="ghl2">Facebook / Instagram: GHL did not answer — check that the GHL key has the Conversations scopes.</span>)

  return (
    <div className="space-y-4">
      <PageHero title="Inbox" subtitle="WhatsApp, Facebook and Instagram chats on one screen" statusChip={`${unread} unread`} showSearch={false} />

      {notes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 flex gap-2.5 text-[12.5px] text-amber-900">
          <Info size={15} className="shrink-0 mt-0.5" /><div className="space-y-1">{notes.map((n, i) => <p key={i}>{n}</p>)}</div>
        </div>
      )}

      <div className="bg-white border border-[#E2E5E0] rounded-[22px] overflow-hidden grid grid-cols-1 md:grid-cols-[340px_1fr] h-[calc(100vh-250px)] min-h-[520px]">
        <aside className={`border-r border-[#E2E5E0] flex flex-col min-h-0 ${active ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-[#E2E5E0] space-y-2">
            <div className="flex gap-1.5 overflow-x-auto">
              {(['all', 'whatsapp', 'facebook', 'instagram'] as const).map(k => (
                <button key={k} type="button" onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded-full text-[11.5px] font-bold whitespace-nowrap border cursor-pointer ${filter === k ? 'bg-[#0F1F19] text-white border-[#0F1F19]' : 'border-[#E2E5E0] text-slate-600'}`}>
                  {k === 'all' ? 'All' : CHANNEL[k].label} · {counts[k]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 h-9">
              <Search size={14} className="text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats…" className="bg-transparent outline-none text-[13px] flex-1" />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {(waState === 'loading' || ghlState === 'loading') && items.length === 0 && <li className="p-6 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></li>}
            {waState !== 'loading' && ghlState !== 'loading' && shown.length === 0 && <li className="p-6 text-center text-[12.5px] text-slate-400">No chats here yet.</li>}
            {shown.map(i => {
              const ch = CHANNEL[i.channel]
              return (
                <li key={i.key}>
                  <button type="button" onClick={() => setActiveKey(i.key)} className={`w-full text-left px-3.5 py-3 flex gap-3 cursor-pointer ${i.key === activeKey ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                    <span className="relative w-10 h-10 rounded-full bg-slate-100 text-slate-700 font-bold text-[13px] flex items-center justify-center shrink-0">
                      {(i.name || '#').slice(0, 1).toUpperCase()}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full ${ch.dot} text-white flex items-center justify-center ring-2 ring-white`}><ch.icon size={10} /></span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13.5px] font-bold text-[#111827] truncate">{i.name}</span>
                        <span className="text-[10.5px] text-slate-400 shrink-0">{timeOf(i.at)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-slate-500 truncate">{i.lastDirection === 'out' ? 'You: ' : ''}{i.preview}</span>
                        {i.unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-[10.5px] font-bold flex items-center justify-center shrink-0">{i.unread}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>
        <section className={`flex flex-col min-h-0 ${active ? 'flex' : 'hidden md:flex'}`}>
          {activeWa ? <WaChat key={activeWa.id} conv={activeWa} clientName={clientName(activeWa.client_id)} canSend={waConfigured} onBack={() => setActiveKey(null)} onChanged={() => void refreshWa()} />
            : activeGhl ? <GhlChat key={activeGhl.id} conv={activeGhl} onBack={() => setActiveKey(null)} onChanged={() => void refreshGhl()} />
            : <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2"><MessageCircle size={36} /><p className="text-[13px]">Choose a chat</p></div>}
        </section>
      </div>
    </div>
  )
}
