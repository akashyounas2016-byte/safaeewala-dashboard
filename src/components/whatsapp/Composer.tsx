import { useEffect, useRef, useState } from 'react'
import { Paperclip, FileText, Smile, Send, Loader2, X, MessageSquareText } from 'lucide-react'
import { EMOJIS, MAX_FILE, loadQuickReplies, loadReviewLink, type QuickReply } from '@/lib/inboxSettings'
import { notify } from '@/lib/notify'

let repliesCache: QuickReply[] | null = null

/**
 * R-INBOX-03: the message bar of every chat — attachment (photo / file), template + saved replies, emoji, send.
 * Enter sends, Shift+Enter makes a new line. With a file chosen, the text becomes its caption.
 */
export function Composer({ text, setText, onSend, onAttach, onOpenTemplates, disabled, sending, placeholder, accent = 'emerald', canAttach = true }: {
  text: string
  setText: (v: string) => void
  onSend: () => void
  onAttach?: (file: File, caption: string) => Promise<void>
  /** WhatsApp only: opens the approved Meta templates */
  onOpenTemplates?: () => void
  disabled: boolean
  sending: boolean
  placeholder: string
  accent?: 'emerald' | 'blue'
  canAttach?: boolean
}) {
  const [menu, setMenu] = useState<'templates' | 'emoji' | null>(null)
  const [replies, setReplies] = useState<QuickReply[] | null>(repliesCache)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (menu === 'templates' && replies === null) void loadQuickReplies().then(r => { repliesCache = r || []; setReplies(repliesCache) }).catch(() => setReplies([]))
  }, [menu, replies])
  // R-GHL-01: {review_link} in a quick reply becomes the saved Google review link
  const [reviewLink, setReviewLink] = useState('')
  useEffect(() => { if (menu === 'templates') void loadReviewLink().then(v => setReviewLink(v?.url || '')).catch(() => {}) }, [menu])
  const fillReply = (t: string) => t.replace(/\{review_link\}/g, reviewLink || '{review_link}')

  const insert = (s: string) => {
    const el = areaRef.current
    if (!el) { setText(text + s); return }
    const a = el.selectionStart ?? text.length; const b = el.selectionEnd ?? text.length
    setText(text.slice(0, a) + s + text.slice(b))
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + s.length })
  }
  const pick = (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_FILE) { notify.error('A file can be at most 16 MB'); return }
    setFile(f)
  }
  const go = async () => {
    if (file && onAttach) {
      setBusy(true)
      try { await onAttach(file, text.trim()); setFile(null); setText('') } catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
      return
    }
    onSend()
  }
  const btn = 'relative z-30 p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-30 disabled:cursor-default'
  const sendTone = accent === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'

  return (
    <footer className="relative p-3 border-t border-[#ECEEEC] shrink-0">
      {file && (
        <div className="mb-2 flex items-center gap-2 text-[12px] bg-[#F4F5F4] rounded-lg px-2.5 py-1.5">
          <Paperclip size={13} className="text-slate-500" /><span className="flex-1 truncate font-semibold">{file.name}</span><span className="text-slate-400">{Math.ceil(file.size / 1024)} KB</span>
          <button type="button" onClick={() => setFile(null)} className="p-0.5 cursor-pointer" aria-label="Remove file"><X size={13} /></button>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        {canAttach && onAttach && (
          <>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled} className={btn} title="Attach a photo or file" aria-label="Attach"><Paperclip size={17} /></button>
            <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
          </>
        )}
        <button type="button" onClick={() => setMenu(m => (m === 'templates' ? null : 'templates'))} className={btn} title="Templates and saved replies" aria-label="Templates"><FileText size={17} /></button>
        <button type="button" onClick={() => setMenu(m => (m === 'emoji' ? null : 'emoji'))} disabled={disabled} className={btn} title="Emoji" aria-label="Emoji"><Smile size={17} /></button>
        <textarea ref={areaRef} value={text} onChange={e => setText(e.target.value)} disabled={disabled} rows={1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void go() } }}
          placeholder={file ? 'Add a caption (optional)' : placeholder}
          className="flex-1 resize-none max-h-32 min-h-10 rounded-xl bg-[#F4F5F4] px-3.5 py-2.5 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-emerald-100 disabled:opacity-60" />
        <button type="button" onClick={() => void go()} disabled={disabled || sending || busy || (!text.trim() && !file)} aria-label="Send"
          className={`h-10 w-10 rounded-xl text-white flex items-center justify-center disabled:opacity-30 cursor-pointer shrink-0 ${sendTone}`}>
          {sending || busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>

      {menu && <button type="button" aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={() => setMenu(null)} />}
      {menu === 'emoji' && (
        <div className="absolute bottom-16 left-3 z-30 bg-white border border-[#E6E8E6] rounded-xl shadow-xl p-2 grid grid-cols-8 gap-0.5 w-[288px]">
          {EMOJIS.map(e => <button key={e} type="button" onClick={() => insert(e)} className="h-8 w-8 rounded-lg hover:bg-slate-100 text-[18px] cursor-pointer">{e}</button>)}
        </div>
      )}
      {menu === 'templates' && (
        <div className="absolute bottom-16 left-3 z-30 bg-white border border-[#E6E8E6] rounded-xl shadow-xl p-1.5 w-[320px] max-h-[320px] overflow-y-auto">
          {onOpenTemplates && (
            <button type="button" onClick={() => { setMenu(null); onOpenTemplates() }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-left cursor-pointer">
              <FileText size={14} className="text-emerald-600" /><span className="text-[12.5px] font-semibold">Approved WhatsApp templates…</span>
            </button>
          )}
          <p className="px-3 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Quick replies</p>
          {replies === null ? <Loader2 className="mx-3 my-2 animate-spin text-slate-300" size={16} /> : replies.length === 0
            ? <p className="px-3 py-2 text-[12px] text-slate-400">None yet — add them in Templates → Quick replies (or "Save as quick reply" in the template builder).</p>
            : replies.map(r => (
              <button key={r.title} type="button" onClick={() => { setMenu(null); insert(fillReply(r.text)) }} disabled={disabled} className="w-full flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-left cursor-pointer disabled:opacity-40">
                <MessageSquareText size={14} className="text-slate-400 mt-0.5 shrink-0" /><span className="min-w-0"><span className="block text-[12.5px] font-semibold truncate">{r.title}</span><span className="block text-[11.5px] text-slate-500 line-clamp-2">{r.text}</span></span>
              </button>
            ))}
        </div>
      )}
    </footer>
  )
}
