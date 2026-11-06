import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Search, Loader2, Send, ArrowLeft, Info, RefreshCw, Inbox as InboxIcon, Layers } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { notify } from '@/lib/notify'
import { formatWaNumber, loadConversations, subscribeWhatsApp, waStatus, type WaConversation } from '@/lib/whatsapp'
import { ghlConversations, ghlMessages, ghlRead, ghlSend, ghlStatus, mergeInbox, type GhlConversation, type GhlMessage, type InboxChannel } from '@/lib/ghlInbox'
import { WaChat, timeOf } from '@/components/whatsapp/WaChat'

/** lucide has no brand icons: two small plain marks for the channel badges */
const Facebook = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7H17l.5-4h-4V8.8c0-.5.3-.8.5-.8z" /></svg>
)
const Instagram = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>
)

/**
 * R-INBOX-01: one Inbox for every channel — WhatsApp from the CRM's own WhatsApp (R-WA-01),
 * Facebook and Instagram from the GHL sub-account. A channel that is not connected yet is noted, never blocks the others.
 * UX-113: no page header — the inbox starts at the top and fills the screen; a wide chat list with clear platform tabs.
 */
const CHANNEL = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, dot: 'bg-emerald-500', text: 'text-emerald-600' },
  facebook: { label: 'Facebook', icon: Facebook, dot: 'bg-blue-600', text: 'text-blue-600' },
  instagram: { label: 'Instagram', icon: Instagram, dot: 'bg-pink-500', text: 'text-pink-600' },
} as const
const TABS: { key: 'all' | InboxChannel; label: string; icon: typeof Layers | typeof Facebook }[] = [
  { key: 'all', label: 'All', icon: Layers },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'facebook', label: 'Facebook', icon: Facebook },
  { key: 'instagram', label: 'Instagram', icon: Instagram },
]

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
      <header className="h-16 px-5 border-b border-[#ECEEEC] flex items-center gap-3 shrink-0">
        <button type="button" onClick={onBack} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Back"><ArrowLeft size={16} /></button>
        <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 font-bold text-[13px] flex items-center justify-center shrink-0">{(conv.name || '#').slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#111827] truncate">{conv.name}</p>
          <p className={`text-[11.5px] flex items-center gap-1 ${ch.text}`}><ch.icon size={11} /> {ch.label}</p>
        </div>
        <button type="button" onClick={() => void load()} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer" title="Refresh"><RefreshCw size={15} /></button>
      </header>
      <div className="flex-1 overflow-y-auto bg-[#F7F8F7] px-5 py-4 space-y-2">
        {msgs === null ? <Loader2 className="mx-auto animate-spin text-slate-300" /> : msgs.length === 0 ? <p className="text-center text-[12px] text-slate-400 py-6">No messages.</p> : msgs.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[72%] rounded-2xl px-3.5 py-2 space-y-1 ${m.direction === 'out' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white border border-[#ECEEEC] text-[#111827] rounded-bl-md'}`}>
              {m.attachments.map(a => <a key={a} href={a} target="_blank" rel="noreferrer" className="block text-[12px] font-semibold underline break-all">Attachment</a>)}
              {m.body && <p className="text-[13px] whitespace-pre-wrap break-words">{m.body}</p>}
              <p className={`text-right text-[10px] ${m.direction === 'out' ? 'text-white/70' : 'text-slate-400'}`}>{timeOf(m.at)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <footer className="p-3 border-t border-[#ECEEEC] flex items-end gap-2 shrink-0">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={1} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder={`Reply on ${ch.label}…`} className="flex-1 resize-none max-h-32 min-h-10 rounded-xl bg-[#F4F5F4] px-3.5 py-2.5 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-blue-200" />
        <button type="button" onClick={() => void send()} disabled={!text.trim() || sending} aria-label="Send" className="h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0">
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
  const [unreadOnly, setUnreadOnly] = useState(false)
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
  const shown = items.filter(i => (filter === 'all' || i.channel === filter) && (!unreadOnly || i.unread > 0) && (!search.trim() || `${i.name} ${i.preview}`.toLowerCase().includes(search.trim().toLowerCase())))
  const counts = { all: items.length, whatsapp: 0, facebook: 0, instagram: 0 } as Record<'all' | InboxChannel, number>
  items.forEach(i => { counts[i.channel]++ })
  const unread = items.reduce((s, i) => s + i.unread, 0)
  const active = items.find(i => i.key === activeKey) || null
  const activeWa = active?.channel === 'whatsapp' ? wa.find(c => c.id === active.id) : undefined
  const activeGhl = active && active.channel !== 'whatsapp' ? ghl.find(c => c.id === active.id) : undefined
  const busy = waState === 'loading' || ghlState === 'loading'

  const notes: React.ReactNode[] = []
  if (waState === 'nodb') notes.push(<span key="wa">WhatsApp needs its database step — <Link to="/whatsapp-crm?tab=settings" className="underline">Settings</Link></span>)
  else if (waState === 'ok' && !waConfigured) notes.push(<span key="wa2">WhatsApp not connected yet — <Link to="/whatsapp-crm?tab=settings" className="underline">Settings</Link></span>)
  if (ghlState === 'off') notes.push(<span key="ghl">Facebook / Instagram: GHL key not on the server</span>)
  if (ghlState === 'error') notes.push(<span key="ghl2">Facebook / Instagram: GHL did not answer</span>)

  return (
    // starts at the top of the page and fills the screen (Layout padding: mobile bar 3.5rem + 1rem top + 2.5rem bottom; desktop 2rem + 2.5rem)
    <div className="bg-white border border-[#E6E8E6] rounded-[20px] overflow-hidden grid grid-cols-1 md:grid-cols-[minmax(360px,420px)_1fr] h-[calc(100dvh-7rem)] sm:h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3.5rem)] min-h-[520px] -mt-1 sm:-mt-2 lg:-mt-4">
      <aside className={`border-r border-[#ECEEEC] flex flex-col min-h-0 ${active ? 'hidden md:flex' : 'flex'}`}>
        {/* title row */}
        <div className="h-16 px-5 flex items-center gap-2.5 shrink-0">
          <InboxIcon size={18} className="text-[#0F1F19]" />
          <h1 className="text-[17px] font-bold text-[#0F1F19] flex-1">Inbox</h1>
          <button type="button" onClick={() => setUnreadOnly(v => !v)} aria-pressed={unreadOnly}
            className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${unreadOnly ? 'bg-[#0F1F19] text-white' : 'bg-[#F1F3F1] text-slate-600 hover:bg-[#E8EBE8]'}`}>
            {unread} unread
          </button>
          <button type="button" onClick={() => { void refreshWa(); if (ghlState === 'ok' || ghlState === 'error') void refreshGhl() }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer" title="Refresh"><RefreshCw size={15} /></button>
        </div>
        {/* platform tabs */}
        <div role="tablist" aria-label="Platforms" className="grid grid-cols-4 border-b border-[#ECEEEC] px-2 shrink-0">
          {TABS.map(t => {
            const on = filter === t.key
            const tone = t.key === 'all' ? 'text-[#0F1F19]' : CHANNEL[t.key].text
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setFilter(t.key)}
                className={`relative flex flex-col items-center gap-1 pt-1.5 pb-2.5 text-[12px] font-semibold cursor-pointer transition-colors ${on ? tone : 'text-slate-400 hover:text-slate-600'}`}>
                <span className="flex items-center gap-1.5" title={t.label}><t.icon size={15} /><span className="hidden min-[480px]:inline md:hidden lg:inline">{t.label}</span></span>
                <span className={`text-[10.5px] font-bold ${on ? '' : 'text-slate-300'}`}>{counts[t.key]}</span>
                {on && <span className={`absolute bottom-0 left-3 right-3 h-[2.5px] rounded-full ${t.key === 'all' ? 'bg-[#0F1F19]' : CHANNEL[t.key].dot}`} />}
              </button>
            )
          })}
        </div>
        {/* search */}
        <div className="px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 bg-[#F4F5F4] rounded-xl px-3 h-9 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or message" className="bg-transparent outline-none text-[13px] flex-1" />
          </div>
        </div>
        {/* chats */}
        <ul className="flex-1 overflow-y-auto">
          {busy && items.length === 0 && <li className="p-8 text-center"><Loader2 className="mx-auto animate-spin text-slate-300" /></li>}
          {!busy && shown.length === 0 && <li className="p-8 text-center text-[12.5px] text-slate-400">{unreadOnly ? 'No unread chats.' : 'No chats here yet.'}</li>}
          {shown.map(i => {
            const ch = CHANNEL[i.channel]
            const on = i.key === activeKey
            return (
              <li key={i.key}>
                <button type="button" onClick={() => setActiveKey(i.key)}
                  className={`w-full text-left px-4 py-3 flex gap-3 cursor-pointer border-l-[3px] transition-colors ${on ? 'bg-[#F2F7F4] border-l-emerald-600' : 'border-l-transparent hover:bg-[#F8F9F8]'}`}>
                  <span className="relative w-11 h-11 rounded-full bg-[#EEF1EE] text-slate-600 font-semibold text-[14px] flex items-center justify-center shrink-0">
                    {(i.name || '#').slice(0, 1).toUpperCase()}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full ${ch.dot} text-white flex items-center justify-center ring-2 ring-white`} title={ch.label}><ch.icon size={10} /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`text-[13.5px] truncate ${i.unread ? 'font-bold text-[#111827]' : 'font-semibold text-[#1F2937]'}`}>{i.name}</span>
                      <span className={`text-[10.5px] shrink-0 ${i.unread ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>{timeOf(i.at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`text-[12.5px] truncate ${i.unread ? 'text-slate-700' : 'text-slate-400'}`}>{i.lastDirection === 'out' ? 'You: ' : ''}{i.preview}</span>
                      {i.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i.unread}</span>}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {notes.length > 0 && (
          <div className="px-4 py-2.5 border-t border-[#ECEEEC] text-[11.5px] text-slate-500 flex gap-2 shrink-0">
            <Info size={13} className="shrink-0 mt-0.5 text-amber-500" /><div className="space-y-0.5">{notes.map((n, k) => <p key={k}>{n}</p>)}</div>
          </div>
        )}
      </aside>
      <section className={`flex flex-col min-h-0 ${active ? 'flex' : 'hidden md:flex'}`}>
        {activeWa ? <WaChat key={activeWa.id} conv={activeWa} clientName={clientName(activeWa.client_id)} canSend={waConfigured} onBack={() => setActiveKey(null)} onChanged={() => void refreshWa()} />
          : activeGhl ? <GhlChat key={activeGhl.id} conv={activeGhl} onBack={() => setActiveKey(null)} onChanged={() => void refreshGhl()} />
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
