import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MessageCircle, Search, Send, FileText, Check, CheckCheck, AlertCircle, Clock, Image as ImageIcon, Mic, Video, Paperclip, ExternalLink, Settings2, X, Loader2 } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import { notify } from '@/lib/notify'
import {
  formatWaNumber, loadConversations, loadMessages, subscribeWhatsApp, templateBody, templateParamCount, waMarkRead, waMediaUrl,
  waSendTemplate, waSendText, waStart, waStatus, waTemplates, windowEndsAt, windowOpen, type WaConversation, type WaMessage, type WaTemplate,
} from '@/lib/whatsapp'

/** R-WA-01: WhatsApp inbox — the CRM's own WhatsApp (Meta Cloud API), no GHL */
const timeOf = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })
    : d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', timeZone: 'Asia/Dubai' })
}

function StatusTick({ m }: { m: WaMessage }) {
  if (m.direction !== 'out') return null
  if (m.status === 'failed') return <span title={m.error || 'Not delivered'}><AlertCircle size={13} className="text-red-500" /></span>
  if (m.status === 'read') return <CheckCheck size={14} className="text-sky-500" />
  if (m.status === 'delivered') return <CheckCheck size={14} className="text-slate-400" />
  return <Check size={14} className="text-slate-400" />
}

function MediaBlock({ m }: { m: WaMessage }) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setBusy(true)
    try { setUrl(await waMediaUrl(m.id)) } catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }
  if (!['image', 'audio', 'video', 'document', 'sticker'].includes(m.type)) return null
  if (!m.media_path) return <p className="text-[11.5px] italic text-slate-500">Downloading the {m.type}…</p>
  if (!url) {
    const Icon = m.type === 'audio' ? Mic : m.type === 'video' ? Video : m.type === 'document' ? Paperclip : ImageIcon
    return (
      <button type="button" onClick={open} className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-800 bg-white/70 border border-emerald-200 rounded-lg px-2.5 py-1.5 cursor-pointer">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />} Show {m.type === 'audio' ? 'voice note' : m.type}{m.media_name ? ` · ${m.media_name}` : ''}
      </button>
    )
  }
  if (m.type === 'image' || m.type === 'sticker') return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="max-w-[260px] max-h-[260px] rounded-lg" /></a>
  if (m.type === 'audio') return <audio src={url} controls className="max-w-[260px]" />
  if (m.type === 'video') return <video src={url} controls className="max-w-[280px] rounded-lg" />
  return <a href={url} target="_blank" rel="noreferrer" className="text-[12.5px] font-bold text-emerald-800 underline">{m.media_name || 'Open document'}</a>
}

function SetupPanel({ reason }: { reason: 'server' | 'database' }) {
  const hook = `${window.location.origin}/api/whatsapp/webhook`
  return (
    <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center"><Settings2 size={20} /></span>
        <div>
          <h2 className="text-[17px] font-bold text-[#111827]">WhatsApp is not connected yet</h2>
          <p className="text-[12.5px] text-slate-500">{reason === 'database' ? 'Step 1 below (the database tables) is still open.' : 'The Meta keys are not on the server yet.'}</p>
        </div>
      </div>
      <ol className="list-decimal pl-5 space-y-1.5 text-[13px] text-slate-700">
        <li>Supabase → SQL editor: run <code className="bg-slate-100 px-1 rounded">supabase/migrations/2026-11-06_whatsapp_inbox.sql</code>.</li>
        <li>Meta Business → WhatsApp: add the business number, create a System User with a permanent token (whatsapp_business_messaging + whatsapp_business_management).</li>
        <li>VPS <code className="bg-slate-100 px-1 rounded">.env</code>: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_WABA_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN — then restart the CRM.</li>
        <li>Meta app → WhatsApp → Configuration → Webhook URL <code className="bg-slate-100 px-1 rounded break-all">{hook}</code>, the same verify token, and subscribe to <b>messages</b>.</li>
      </ol>
    </div>
  )
}

export function WhatsAppCRM() {
  const { clients } = useData()
  const [params, setParams] = useSearchParams()
  const [ready, setReady] = useState<'loading' | 'ok' | 'server' | 'database'>('loading')
  const [convs, setConvs] = useState<WaConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<WaMessage[]>([])
  const [search, setSearch] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null)
  const [pickTemplate, setPickTemplate] = useState(false)
  const [chosen, setChosen] = useState<WaTemplate | null>(null)
  const [tplParams, setTplParams] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const clientName = useCallback((id: string | null) => (id ? clients.find(c => c.id === id)?.full_name || null : null), [clients])
  const active = convs.find(c => c.id === activeId) || null

  const refreshConvs = useCallback(async () => {
    const list = await loadConversations().catch(() => null)
    if (list === null) { setReady('database'); return }
    setConvs(list)
  }, [])

  // setup state, first load
  useEffect(() => {
    let alive = true
    ;(async () => {
      const status = await waStatus().catch(() => ({ configured: false, templates: false }))
      const list = await loadConversations().catch(() => null)
      if (!alive) return
      if (list === null) return setReady('database')
      setConvs(list)
      setReady(status.configured ? 'ok' : 'server')
    })()
    return () => { alive = false }
  }, [])

  // live updates
  useEffect(() => subscribeWhatsApp((table, row) => {
    if (table === 'wa_conversations') void refreshConvs()
    else if (row.conversation_id === activeId) void loadMessages(activeId!).then(setMsgs).catch(() => {})
  }), [activeId, refreshConvs])

  // ?phone=… (from a client profile) opens or starts that chat
  useEffect(() => {
    const phone = params.get('phone')
    if (!phone || ready !== 'ok') return
    waStart(phone, params.get('name') || undefined).then(({ id }) => { setActiveId(id); void refreshConvs() }).catch(e => notify.error((e as Error).message))
    setParams(p => { p.delete('phone'); p.delete('name'); return p }, { replace: true })
  }, [params, ready, setParams, refreshConvs])

  // open a chat: load messages, mark read
  useEffect(() => {
    if (!activeId) { setMsgs([]); return }
    void loadMessages(activeId).then(setMsgs).catch(e => notify.error((e as Error).message))
    const c = convs.find(x => x.id === activeId)
    if (c?.unread_count) void waMarkRead(activeId).then(refreshConvs).catch(() => {})
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const shown = useMemo(() => {
    const qy = search.trim().toLowerCase()
    return convs.filter(c => !qy || [c.name, c.wa_id, clientName(c.client_id), c.last_message_preview].some(v => String(v || '').toLowerCase().includes(qy)))
  }, [convs, search, clientName])
  const unreadTotal = convs.reduce((s, c) => s + (c.unread_count || 0), 0)
  const open = windowOpen(active)

  const send = async () => {
    if (!active || !text.trim()) return
    setSending(true)
    try { await waSendText(active.id, text.trim()); setText(''); setMsgs(await loadMessages(active.id)); void refreshConvs() }
    catch (e) { notify.error((e as Error).message) } finally { setSending(false) }
  }
  const openTemplates = async () => {
    setPickTemplate(true); setChosen(null)
    if (templates === null) setTemplates(await waTemplates().catch(e => { notify.error((e as Error).message); return [] }))
  }
  const sendTemplate = async () => {
    if (!active || !chosen) return
    setSending(true)
    try { await waSendTemplate(active.id, chosen, tplParams); setPickTemplate(false); setMsgs(await loadMessages(active.id)); void refreshConvs() }
    catch (e) { notify.error((e as Error).message) } finally { setSending(false) }
  }

  return (
    <div className="space-y-5">
      <PageHero title="WhatsApp" subtitle="Client chats on the business number — straight from Meta, no GHL" statusChip={ready === 'ok' ? `${unreadTotal} unread` : 'Setup needed'} showSearch={false} />

      {ready === 'loading' && <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-10 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /></div>}
      {(ready === 'server' || ready === 'database') && <SetupPanel reason={ready} />}

      {(ready === 'ok' || (ready === 'server' && convs.length > 0)) && (
        <div className="bg-white border border-[#E2E5E0] rounded-[22px] overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr] h-[calc(100vh-230px)] min-h-[520px]">
          {/* conversation list */}
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

          {/* chat */}
          <section className={`flex flex-col min-h-0 ${active ? 'flex' : 'hidden md:flex'}`}>
            {!active ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2"><MessageCircle size={36} /><p className="text-[13px]">Choose a chat</p></div>
            ) : (
              <>
                <header className="px-4 py-3 border-b border-[#E2E5E0] flex items-center gap-3">
                  <button type="button" onClick={() => setActiveId(null)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Back to chats"><X size={16} /></button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-bold text-[#111827] truncate">{clientName(active.client_id) || active.name || formatWaNumber(active.wa_id)}</p>
                    <p className="text-[11.5px] text-slate-500">{formatWaNumber(active.wa_id)}{active.name && clientName(active.client_id) ? ` · ${active.name}` : ''}</p>
                  </div>
                  {active.client_id && (
                    <Link to={`/clients/${active.client_id}`} className="flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-xl border border-[#E2E5E0] hover:bg-slate-50">Client profile <ExternalLink size={12} /></Link>
                  )}
                </header>
                <div className={`px-4 py-1.5 text-[11.5px] font-semibold flex items-center gap-1.5 ${open ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                  <Clock size={12} />
                  {open ? `Reply window open until ${windowEndsAt(active)!.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })} — free-text replies allowed`
                    : 'More than 24 hours since the client wrote — only an approved template can be sent'}
                </div>
                <div className="flex-1 overflow-y-auto bg-[#F4F6F3] px-4 py-4 space-y-2">
                  {msgs.map(m => (
                    <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-xs space-y-1 ${m.direction === 'out' ? 'bg-emerald-100 rounded-br-md' : 'bg-white rounded-bl-md'}`}>
                        {m.template_name && <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1"><FileText size={10} />{m.template_name}</p>}
                        <MediaBlock m={m} />
                        {m.body && <p className="text-[13px] text-[#111827] whitespace-pre-wrap break-words">{m.body}</p>}
                        <p className="flex items-center justify-end gap-1 text-[10px] text-slate-500">{timeOf(m.created_at)} <StatusTick m={m} /></p>
                        {m.status === 'failed' && m.error && <p className="text-[10.5px] text-red-600">{m.error}</p>}
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                <footer className="p-3 border-t border-[#E2E5E0] flex items-end gap-2">
                  <button type="button" onClick={openTemplates} title="Send an approved template" className="h-10 px-3 rounded-xl border border-[#E2E5E0] text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer shrink-0">
                    <FileText size={14} /> Template
                  </button>
                  <textarea value={text} onChange={e => setText(e.target.value)} disabled={!open || ready !== 'ok'} rows={1}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                    placeholder={open ? 'Type a message — Enter to send, Shift+Enter for a new line' : 'Window closed — use a template'}
                    className="flex-1 resize-none max-h-32 min-h-10 rounded-xl border border-[#E2E5E0] px-3 py-2.5 text-[13px] outline-none focus:border-emerald-500 disabled:bg-slate-50" />
                  <button type="button" onClick={() => void send()} disabled={!open || !text.trim() || sending || ready !== 'ok'} aria-label="Send"
                    className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0">
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}

      <Modal open={pickTemplate} onClose={() => setPickTemplate(false)} title="Send a template" size="lg">
        {templates === null ? <div className="py-8 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
          : templates.length === 0 ? <p className="text-[13px] text-slate-500 py-6 text-center">No approved templates. Create them in Meta → WhatsApp Manager → Message templates.</p>
          : !chosen ? (
            <ul className="space-y-2">
              {templates.map(t => (
                <li key={`${t.name}-${t.language}`}>
                  <button type="button" onClick={() => { setChosen(t); setTplParams(Array(templateParamCount(t)).fill('')) }} className="w-full text-left p-3 rounded-xl border border-[#E2E5E0] hover:border-emerald-400 cursor-pointer">
                    <p className="text-[13px] font-bold text-[#111827]">{t.name} <span className="text-[11px] font-semibold text-slate-400">· {t.language} · {t.category.toLowerCase()}</span></p>
                    <p className="text-[12px] text-slate-600 mt-0.5 line-clamp-2">{templateBody(t)}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] font-bold">{chosen.name}</p>
              {tplParams.map((v, i) => (
                <input key={i} value={v} onChange={e => setTplParams(p => p.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Value for {{${i + 1}}}`}
                  className="w-full rounded-xl border border-[#E2E5E0] px-3 py-2 text-[13px] outline-none focus:border-emerald-500" />
              ))}
              <div className="bg-[#F4F6F3] rounded-xl p-3 text-[13px] whitespace-pre-wrap">{templateBody(chosen, tplParams)}</div>
              <div className="flex justify-between">
                <button type="button" onClick={() => setChosen(null)} className="px-4 py-2 rounded-xl border border-[#E2E5E0] text-[13px] font-semibold cursor-pointer">Back</button>
                <button type="button" onClick={() => void sendTemplate()} disabled={sending || tplParams.some(p => !p.trim())} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-bold disabled:opacity-40 cursor-pointer">Send template</button>
              </div>
            </div>
          )}
      </Modal>
    </div>
  )
}
