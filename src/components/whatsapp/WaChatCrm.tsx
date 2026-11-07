import { useCallback, useEffect, useState } from 'react'
import { StickyNote, X, Send, Tag, UserCircle2, History, BellOff } from 'lucide-react'
import { notify } from '@/lib/notify'
import { useAuth } from '@/store/UserContext'
import type { ChatStatus, WaConversation } from '@/lib/whatsapp'
import { CHAT_STATUSES, addNote, loadNotes, updateChat, type WaAgent, type WaNote } from '@/lib/whatsappCrm'
import { timeOf } from './WaChat'

/**
 * R-WA-03: the team bar of a chat — status, assignee, tags, opt-out — and the notes drawer
 * (team notes + assignment / status history). Changes are written straight to Supabase (RLS: staff only).
 */
export function ChatCrmBar({ conv, agents, me, onChanged }: { conv: WaConversation; agents: WaAgent[]; me: string | null; onChanged: () => void }) {
  const { user } = useAuth()
  const author = user?.full_name || user?.email || 'Staff'
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<WaNote[] | null>(null)
  const [text, setText] = useState('')
  const [tagText, setTagText] = useState('')
  const nameOf = (id: string | null | undefined) => (id ? agents.find(a => a.id === id)?.name || 'Agent' : 'Nobody')

  const reload = useCallback(() => loadNotes(conv.id).then(setNotes).catch(() => setNotes([])), [conv.id])
  useEffect(() => { if (open) void reload() }, [open, reload])

  const change = async (patch: Parameters<typeof updateChat>[1], history?: { kind: WaNote['kind']; body: string }) => {
    try {
      await updateChat(conv.id, patch)
      if (history) await addNote(conv.id, history.kind, history.body, author).catch(() => {})
      onChanged(); if (open) void reload()
    } catch (e) { notify.error((e as Error).message) }
  }
  const setStatus = (s: ChatStatus) => {
    if (s === conv.status) return
    const until = s === 'snoozed' ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null
    void change({ status: s, snoozed_until: until }, { kind: 'status', body: `Status: ${CHAT_STATUSES.find(x => x.key === s)?.label}${s === 'snoozed' ? ' (24 h — opens again when the client writes)' : ''}` })
  }
  const assign = (id: string) => void change({ assigned_to: id || null }, { kind: 'assign', body: `Assigned to ${nameOf(id || null)}` })
  const addTag = () => {
    const t = tagText.trim().toLowerCase()
    if (!t) return
    setTagText('')
    if ((conv.tags || []).includes(t)) return
    void change({ tags: [...(conv.tags || []), t] })
  }
  const post = async () => {
    if (!text.trim()) return
    try { await addNote(conv.id, 'note', text.trim(), author); setText(''); void reload() } catch (e) { notify.error((e as Error).message) }
  }

  return (
    <>
      <div className="px-4 py-2 border-b border-[#ECEEEC] flex items-center gap-2 flex-wrap text-[12px] shrink-0">
        <select value={conv.status || 'open'} onChange={e => setStatus(e.target.value as ChatStatus)} aria-label="Chat status"
          className={`rounded-lg px-2 py-1 font-semibold border-0 cursor-pointer ${CHAT_STATUSES.find(s => s.key === (conv.status || 'open'))?.tone}`}>
          {CHAT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-slate-500">
          <UserCircle2 size={13} />
          <select value={conv.assigned_to || ''} onChange={e => assign(e.target.value)} aria-label="Assign to" className="rounded-lg px-1.5 py-1 bg-[#F4F5F4] font-semibold text-slate-700 cursor-pointer">
            <option value="">Unassigned</option>
            {me && agents.some(a => a.id === me) && <option value={me}>Me</option>}
            {agents.filter(a => a.id !== me).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <span className="flex items-center gap-1 flex-wrap">
          {(conv.tags || []).map(t => (
            <span key={t} className="flex items-center gap-0.5 text-[11px] font-semibold text-violet-700 bg-violet-50 pl-1.5 pr-0.5 rounded">
              {t}<button type="button" onClick={() => void change({ tags: (conv.tags || []).filter(x => x !== t) })} className="p-0.5 cursor-pointer" aria-label={`Remove ${t}`}><X size={10} /></button>
            </span>
          ))}
          <span className="flex items-center gap-1 text-slate-400">
            <Tag size={12} />
            <input value={tagText} onChange={e => setTagText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag() }} placeholder="Add tag" className="w-20 outline-none bg-transparent text-[12px]" />
          </span>
        </span>
        <span className="flex-1" />
        {conv.unsubscribed && (
          <button type="button" onClick={() => void change({ unsubscribed: false }, { kind: 'status', body: 'Opt-out removed by staff' })} title="The client wrote STOP — campaigns skip this number. Click to undo (only if the client asked)."
            className="flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg cursor-pointer"><BellOff size={12} /> Opted out</button>
        )}
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 font-semibold text-slate-600 hover:bg-slate-100 px-2 py-1 rounded-lg cursor-pointer"><StickyNote size={13} /> Notes</button>
      </div>

      {open && (
        <div className="absolute inset-y-0 right-0 w-full sm:w-[340px] bg-white border-l border-[#ECEEEC] shadow-xl z-20 flex flex-col">
          <header className="h-14 px-4 border-b border-[#ECEEEC] flex items-center gap-2 shrink-0">
            <StickyNote size={15} className="text-amber-500" />
            <p className="text-[14px] font-semibold flex-1">Team notes</p>
            <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Close notes"><X size={15} /></button>
          </header>
          <ul className="flex-1 overflow-y-auto p-3 space-y-2">
            {notes === null && <li className="text-[12px] text-slate-400 text-center py-4">Loading…</li>}
            {notes?.length === 0 && <li className="text-[12px] text-slate-400 text-center py-4">No notes yet. Only the team sees them — never the client.</li>}
            {notes?.map(n => (
              <li key={n.id} className={n.kind === 'note' ? 'bg-amber-50 border border-amber-100 rounded-xl p-2.5' : 'flex items-start gap-1.5 text-[11.5px] text-slate-500 px-1'}>
                {n.kind === 'note' ? (
                  <>
                    <p className="text-[12.5px] text-[#111827] whitespace-pre-wrap">{n.body}</p>
                    <p className="text-[10.5px] text-slate-400 mt-1">{n.author} · {timeOf(n.created_at)}</p>
                  </>
                ) : <><History size={11} className="mt-0.5 shrink-0" /><span>{n.body} · {n.author} · {timeOf(n.created_at)}</span></>}
              </li>
            ))}
          </ul>
          <footer className="p-3 border-t border-[#ECEEEC] flex gap-2 shrink-0">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Add a note for your team…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void post() } }}
              className="flex-1 resize-none rounded-xl bg-[#F4F5F4] px-3 py-2 text-[12.5px] outline-none focus:bg-white focus:ring-2 focus:ring-amber-100" />
            <button type="button" onClick={() => void post()} disabled={!text.trim()} className="self-end h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer" aria-label="Post note"><Send size={14} /></button>
          </footer>
        </div>
      )}
    </>
  )
}
