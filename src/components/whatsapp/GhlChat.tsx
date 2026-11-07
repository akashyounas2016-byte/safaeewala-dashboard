import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Loader2, ArrowLeft, RefreshCw } from 'lucide-react'
import { notify } from '@/lib/notify'
import { ghlMessages, ghlRead, ghlSend, type GhlConversation, type GhlMessage } from '@/lib/ghlInbox'
import { demo, isDemoId, useInboxDemo } from '@/lib/inboxDemo'
import { timeOf } from './WaChat'
import { Composer } from './Composer'
import { TagPicker } from './Tags'
import { ghlSendFile } from '@/lib/inboxSettings'

/** lucide has no brand icons: two small plain marks for the channel badges */
export const Facebook = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7H17l.5-4h-4V8.8c0-.5.3-.8.5-.8z" /></svg>
)
export const Instagram = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>
)
export const CHANNEL = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, dot: 'bg-emerald-500', text: 'text-emerald-600' },
  facebook: { label: 'Facebook', icon: Facebook, dot: 'bg-blue-600', text: 'text-blue-600' },
  instagram: { label: 'Instagram', icon: Instagram, dot: 'bg-pink-500', text: 'text-pink-600' },
} as const

/** R-INBOX-01: a Facebook / Instagram chat from the GHL sub-account (DEMO chats stay in this browser) */
export function GhlChat({ conv, onBack, onChanged, tags, onTags }: { conv: GhlConversation; onBack: () => void; onChanged: () => void; tags?: string[]; onTags?: (next: string[]) => void }) {
  const isDemo = isDemoId(conv.id)
  const demoState = useInboxDemo()
  const [remote, setRemote] = useState<GhlMessage[] | null>(null)
  const msgs = isDemo ? demoState.ghlMsgs[conv.id] || [] : remote
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const ch = CHANNEL[conv.channel]

  const load = useCallback(() => (isDemo ? Promise.resolve() : ghlMessages(conv.id).then(setRemote).catch(e => { notify.error((e as Error).message); setRemote([]) })), [conv.id, isDemo])
  useEffect(() => {
    if (isDemo) { if (conv.unread) demo.readGhl(conv.id); return }
    void load()
    if (conv.unread) void ghlRead(conv.id).then(onChanged).catch(() => {})
    const t = setInterval(() => void load(), 15000) // GHL has no live feed for us: check every 15 s while the chat is open
    return () => clearInterval(t)
  }, [conv.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])

  const send = async () => {
    if (!text.trim()) return
    if (isDemo) { demo.sendGhl(conv.id, text.trim()); setText(''); return }
    setSending(true)
    try { await ghlSend(conv, text.trim()); setText(''); await load(); onChanged() }
    catch (e) { notify.error((e as Error).message) } finally { setSending(false) }
  }

  return (
    <>
      <header className="h-16 px-5 border-b border-[#ECEEEC] flex items-center gap-3 shrink-0">
        <button type="button" onClick={onBack} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Back"><ArrowLeft size={16} /></button>
        <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 font-bold text-[13px] flex items-center justify-center shrink-0">{(conv.name || '#').replace('DEMO · ', '').slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#111827] truncate">{conv.name}</p>
          <p className={`text-[11.5px] flex items-center gap-1 ${ch.text}`}><ch.icon size={11} /> {ch.label}{isDemo ? ' · demo, not sent anywhere' : ''}</p>
        </div>
        {!isDemo && <button type="button" onClick={() => void load()} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer" title="Refresh"><RefreshCw size={15} /></button>}
      </header>
      {onTags && <div className="px-5 py-2 border-b border-[#ECEEEC] shrink-0"><TagPicker tags={tags || []} onChange={onTags} /></div>}
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
      {/* R-INBOX-03: attachment, saved replies, emoji */}
      <Composer text={text} setText={setText} onSend={() => void send()} sending={sending} disabled={false} accent="blue" canAttach={!isDemo}
        onAttach={async (file, caption) => { await ghlSendFile(conv, file, caption); await load(); onChanged() }}
        placeholder={`Reply on ${ch.label}…`} />
    </>
  )
}
