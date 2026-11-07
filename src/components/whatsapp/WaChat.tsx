import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, FileText, Check, CheckCheck, AlertCircle, Clock, Image as ImageIcon, Mic, Video, Paperclip, ExternalLink, ArrowLeft, Loader2, CalendarPlus, Handshake, Bot } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { notify } from '@/lib/notify'
import {
  formatWaNumber, loadMessages, subscribeWhatsApp, templateBody, templateParamCount, waMarkRead, waMediaUrl,
  waSendTemplate, waSendText, waTemplates, windowEndsAt, windowOpen, type WaConversation, type WaMessage, type WaTemplate,
} from '@/lib/whatsapp'
import { saveDeal } from '@/lib/whatsappModules'
import type { WaAgent } from '@/lib/whatsappCrm'
import { ChatCrmBar } from './WaChatCrm'
import { demo, isDemoId, useInboxDemo } from '@/lib/inboxDemo'

/** R-WA-01 / R-WA-02: one WhatsApp chat — messages, reply window, composer, templates, and quick Booking / Deal */
export const timeOf = (iso: string | null) => {
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

export function WaChat({ conv, clientName, canSend, onBack, onChanged, crm }: {
  conv: WaConversation
  clientName: string | null
  /** false while the Meta keys are not on the server: the chat can be read, not answered */
  canSend: boolean
  onBack: () => void
  onChanged: () => void
  /** R-WA-03: status, assignment, tags and team notes (once the CRM columns exist) */
  crm?: { agents: WaAgent[]; me: string | null }
}) {
  const isDemo = isDemoId(conv.id) // R-INBOX-02: a DEMO chat lives in this browser only
  const demoState = useInboxDemo()
  const [remoteMsgs, setMsgs] = useState<WaMessage[]>([])
  const msgs = isDemo ? demoState.waMsgs[conv.id] || [] : remoteMsgs
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null)
  const [pickTemplate, setPickTemplate] = useState(false)
  const [chosen, setChosen] = useState<WaTemplate | null>(null)
  const [tplParams, setTplParams] = useState<string[]>([])
  const [dealOpen, setDealOpen] = useState(false)
  const [deal, setDeal] = useState({ title: '', value: '' })
  const bottomRef = useRef<HTMLDivElement>(null)
  const title = clientName || conv.name || formatWaNumber(conv.wa_id)

  useEffect(() => {
    if (isDemo) { if (conv.unread_count) demo.readWa(conv.id); return }
    let alive = true
    void loadMessages(conv.id).then(m => { if (alive) setMsgs(m) }).catch(e => notify.error((e as Error).message))
    if (conv.unread_count && canSend) void waMarkRead(conv.id).then(onChanged).catch(() => {})
    const off = subscribeWhatsApp((table, row) => { if (table === 'wa_messages' && row.conversation_id === conv.id) void loadMessages(conv.id).then(m => { if (alive) setMsgs(m) }).catch(() => {}) })
    return () => { alive = false; off() }
  }, [conv.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const open = isDemo || windowOpen(conv)
  const send = async () => {
    if (!text.trim()) return
    if (isDemo) { demo.sendWa(conv.id, text.trim()); setText(''); return }
    setSending(true)
    try { await waSendText(conv.id, text.trim()); setText(''); setMsgs(await loadMessages(conv.id)); onChanged() }
    catch (e) { notify.error((e as Error).message) } finally { setSending(false) }
  }
  const openTemplates = async () => {
    setPickTemplate(true); setChosen(null)
    if (templates === null) setTemplates(await waTemplates().catch(e => { notify.error((e as Error).message); return [] }))
  }
  const sendTemplate = async () => {
    if (!chosen) return
    setSending(true)
    try { await waSendTemplate(conv.id, chosen, tplParams); setPickTemplate(false); setMsgs(await loadMessages(conv.id)); onChanged() }
    catch (e) { notify.error((e as Error).message) } finally { setSending(false) }
  }
  const addDeal = async () => {
    if (isDemo) return notify.error('This is a DEMO chat — deals are made from real chats only')
    try {
      await saveDeal({ title: deal.title.trim() || `${title} — enquiry`, value: Number(deal.value) || 0, stage: 'new', conversation_id: conv.id, client_id: conv.client_id, contact_name: title, wa_id: conv.wa_id })
      notify.success('Deal added — see the Deals tab')
      setDealOpen(false); setDeal({ title: '', value: '' })
    } catch (e) { notify.error(/wa_deals|schema cache/i.test((e as Error).message) ? 'Deals need the database step: run 2026-11-07_whatsapp_modules.sql' : (e as Error).message) }
  }
  const bookingLink = `/bookings?new=1${conv.client_id ? `&client=${encodeURIComponent(conv.client_id)}` : ''}&name=${encodeURIComponent(clientName || conv.name || '')}&phone=${encodeURIComponent('+' + conv.wa_id)}`

  return (
    <>
      <header className="px-4 py-3 border-b border-[#E2E5E0] flex items-center gap-2 flex-wrap">
        <button type="button" onClick={onBack} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Back to chats"><ArrowLeft size={16} /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold text-[#111827] truncate">{title}</p>
          <p className="text-[11.5px] text-slate-500">{formatWaNumber(conv.wa_id)}{conv.name && clientName ? ` · ${conv.name}` : ''}</p>
        </div>
        <Link to={bookingLink} title="New booking for this client" className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-xl border border-[#E2E5E0] hover:bg-slate-50"><CalendarPlus size={13} /> Booking</Link>
        <button type="button" onClick={() => setDealOpen(true)} title="Add to the Deals pipeline" className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-xl border border-[#E2E5E0] hover:bg-slate-50 cursor-pointer"><Handshake size={13} /> Deal</button>
        {conv.client_id && <Link to={`/clients/${conv.client_id}`} className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-xl border border-[#E2E5E0] hover:bg-slate-50">Profile <ExternalLink size={12} /></Link>}
      </header>
      {isDemo && <p className="px-4 py-1 text-[11px] font-bold bg-violet-50 text-violet-700 shrink-0">DEMO chat — only in this browser, nothing is sent or saved</p>}
      {crm && <ChatCrmBar conv={conv} agents={crm.agents} me={crm.me} onChanged={onChanged} />}
      <div className={`px-4 py-1.5 text-[11.5px] font-semibold flex items-center gap-1.5 ${open ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        <Clock size={12} />
        {open ? `Reply window open until ${windowEndsAt(conv)!.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })} — free-text replies allowed`
          : 'More than 24 hours since the client wrote — only an approved template can be sent'}
      </div>
      <div className="flex-1 overflow-y-auto bg-[#F4F6F3] px-4 py-4 space-y-2">
        {msgs.length === 0 && <p className="text-center text-[12px] text-slate-400 py-6">No messages yet.</p>}
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-xs space-y-1 ${m.direction === 'out' ? 'bg-emerald-100 rounded-br-md' : 'bg-white rounded-bl-md'}`}>
              {m.template_name && <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1"><FileText size={10} />{m.template_name}</p>}
              {m.sent_by === 'automation' && <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 flex items-center gap-1"><Bot size={10} />Automatic reply</p>}
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
        <button type="button" onClick={openTemplates} disabled={!canSend} title="Send an approved template" className="h-10 px-3 rounded-xl border border-[#E2E5E0] text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-40">
          <FileText size={14} /> Template
        </button>
        <textarea value={text} onChange={e => setText(e.target.value)} disabled={!open || (!canSend && !isDemo)} rows={1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder={isDemo ? 'Type a DEMO reply — stays in this browser' : !canSend ? 'Sending starts once the Meta keys are on the server (Settings tab)' : open ? 'Type a message — Enter to send, Shift+Enter for a new line' : 'Window closed — use a template'}
          className="flex-1 resize-none max-h-32 min-h-10 rounded-xl border border-[#E2E5E0] px-3 py-2.5 text-[13px] outline-none focus:border-emerald-500 disabled:bg-slate-50" />
        <button type="button" onClick={() => void send()} disabled={!open || !text.trim() || sending || (!canSend && !isDemo)} aria-label="Send"
          className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </footer>

      <Modal open={pickTemplate} onClose={() => setPickTemplate(false)} title="Send a template" size="lg">
        {templates === null ? <div className="py-8 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
          : templates.length === 0 ? <p className="text-[13px] text-slate-500 py-6 text-center">No approved templates yet. Create one in the Templates tab — Meta reviews it, usually within minutes.</p>
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

      <Modal open={dealOpen} onClose={() => setDealOpen(false)} title={`New deal — ${title}`}>
        <div className="space-y-3">
          <input value={deal.title} onChange={e => setDeal(d => ({ ...d, title: e.target.value }))} placeholder={`${title} — enquiry`} className="w-full rounded-xl border border-[#E2E5E0] px-3 py-2 text-[13px] outline-none focus:border-emerald-500" />
          <input value={deal.value} onChange={e => setDeal(d => ({ ...d, value: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder="Expected value (AED)" className="w-full rounded-xl border border-[#E2E5E0] px-3 py-2 text-[13px] outline-none focus:border-emerald-500" />
          <div className="flex justify-end"><button type="button" onClick={() => void addDeal()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-bold cursor-pointer">Add deal</button></div>
        </div>
      </Modal>
    </>
  )
}
