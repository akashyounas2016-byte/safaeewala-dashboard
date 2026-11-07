import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageCircle, Search, Database, UserCircle2 } from 'lucide-react'
import { formatWaNumber, type ChatStatus, type WaConversation } from '@/lib/whatsapp'
import { CHAT_STATUSES, filterChats, type WaAgent } from '@/lib/whatsappCrm'
import { WaChat, timeOf } from './WaChat'

/**
 * R-WA-01 / R-WA-03: the WhatsApp inbox — status tabs (Open · Pending · Snoozed · Resolved · All),
 * "Mine / Unassigned / Everyone", and the chat with assignment, status and team notes.
 */
export function WaInbox({ convs, tablesReady, configured, crmOn, agents, me, clientName, activeId, setActiveId, refresh }: {
  convs: WaConversation[]
  tablesReady: boolean
  configured: boolean
  /** the R-WA-03 columns exist (status, assignment, notes) */
  crmOn: boolean
  agents: WaAgent[]
  me: string | null
  clientName: (id: string | null) => string | null
  activeId: string | null
  setActiveId: (id: string | null) => void
  refresh: () => void
}) {
  const [status, setStatus] = useState<ChatStatus | 'all'>('open')
  const [who, setWho] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [search, setSearch] = useState('')
  const statusTab = crmOn ? status : 'all'
  const agentName = useCallback((id: string | null | undefined) => (id ? agents.find(a => a.id === id)?.name || 'Agent' : null), [agents])

  const counts = useMemo(() => Object.fromEntries(CHAT_STATUSES.map(s => [s.key, convs.filter(c => (c.status || 'open') === s.key).length])) as Record<ChatStatus, number>, [convs])
  const shown = useMemo(() => {
    const qy = search.trim().toLowerCase()
    return filterChats(convs, statusTab, crmOn ? who : 'all', me)
      .filter(c => !qy || [c.name, c.wa_id, clientName(c.client_id), c.last_message_preview, ...(c.tags || [])].some(v => String(v || '').toLowerCase().includes(qy)))
  }, [convs, statusTab, who, crmOn, me, search, clientName])
  const active = convs.find(c => c.id === activeId) || null
  // a chat that leaves the current tab (e.g. resolved) stays open until another is picked
  useEffect(() => { if (activeId && !convs.some(c => c.id === activeId)) setActiveId(null) }, [convs, activeId, setActiveId])

  if (!tablesReady) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center">
        <Database className="text-amber-500" />
        <p className="text-[13px] text-slate-600">The inbox needs the database step: run <code className="bg-slate-100 px-1 rounded">2026-11-06_whatsapp_inbox.sql</code> in Supabase.</p>
      </div>
    )
  }
  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(300px,360px)_1fr]">
      <aside className={`border-r border-[#ECEEEC] flex flex-col min-h-0 ${active ? 'hidden md:flex' : 'flex'}`}>
        {crmOn && (
          <div className="flex gap-1 px-3 pt-3 overflow-x-auto shrink-0">
            {[...CHAT_STATUSES.map(s => ({ key: s.key as ChatStatus | 'all', label: s.label, n: counts[s.key] })), { key: 'all' as const, label: 'All', n: convs.length }].map(s => (
              <button key={s.key} type="button" onClick={() => setStatus(s.key)}
                className={`px-2.5 py-1 rounded-lg text-[11.5px] font-semibold whitespace-nowrap cursor-pointer ${status === s.key ? 'bg-[#0F1F19] text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                {s.label} <span className={status === s.key ? 'text-white/60' : 'text-slate-300'}>{s.n}</span>
              </button>
            ))}
          </div>
        )}
        <div className="px-3 pt-2.5 pb-3 space-y-2 border-b border-[#ECEEEC] shrink-0">
          {crmOn && (
            <div className="grid grid-cols-3 bg-[#F4F5F4] rounded-lg p-0.5">
              {(['all', 'mine', 'unassigned'] as const).map(k => (
                <button key={k} type="button" onClick={() => setWho(k)} className={`py-1 rounded-md text-[11.5px] font-semibold cursor-pointer ${who === k ? 'bg-white shadow-xs text-[#0F1F19]' : 'text-slate-500'}`}>
                  {k === 'all' ? 'Everyone' : k === 'mine' ? 'Mine' : 'Unassigned'}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 bg-[#F4F5F4] rounded-xl px-3 h-9 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, number, tag" className="bg-transparent outline-none text-[13px] flex-1" />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {shown.length === 0 && <li className="p-8 text-center text-[12.5px] text-slate-400">{convs.length ? 'No chats in this view.' : 'No chats yet. Messages sent to the business number appear here.'}</li>}
          {shown.map(c => {
            const cn = clientName(c.client_id)
            const on = c.id === activeId
            const owner = agentName(c.assigned_to)
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setActiveId(c.id)} className={`w-full text-left px-3.5 py-3 flex gap-3 cursor-pointer border-l-[3px] ${on ? 'bg-[#F2F7F4] border-l-emerald-600' : 'border-l-transparent hover:bg-[#F8F9F8]'}`}>
                  <span className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-800 font-semibold text-[13px] flex items-center justify-center shrink-0">{(cn || c.name || '#').slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`text-[13.5px] truncate ${c.unread_count ? 'font-bold text-[#111827]' : 'font-semibold text-[#1F2937]'}`}>{cn || c.name || formatWaNumber(c.wa_id)}</span>
                      <span className={`text-[10.5px] shrink-0 ${c.unread_count ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>{timeOf(c.last_message_at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`text-[12px] truncate ${c.unread_count ? 'text-slate-700' : 'text-slate-400'}`}>{c.last_direction === 'out' ? 'You: ' : ''}{c.last_message_preview || ''}</span>
                      {c.unread_count > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{c.unread_count}</span>}
                    </span>
                    {(owner || c.unsubscribed || (c.tags || []).length > 0) && (
                      <span className="flex items-center gap-1 mt-1 flex-wrap">
                        {owner && <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-0.5"><UserCircle2 size={10} />{owner}</span>}
                        {c.unsubscribed && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 rounded">Opted out</span>}
                        {(c.tags || []).slice(0, 3).map(t => <span key={t} className="text-[10px] font-semibold text-violet-700 bg-violet-50 px-1.5 rounded">{t}</span>)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>
      <section className={`relative flex flex-col min-h-0 ${active ? 'flex' : 'hidden md:flex'}`}>
        {active
          ? <WaChat key={active.id} conv={active} clientName={clientName(active.client_id)} canSend={configured} onBack={() => setActiveId(null)} onChanged={refresh} crm={crmOn ? { agents, me } : undefined} />
          : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#FAFBFA]">
              <span className="w-14 h-14 rounded-2xl bg-white border border-[#ECEEEC] flex items-center justify-center text-slate-300"><MessageCircle size={26} /></span>
              <p className="text-[14px] font-semibold text-slate-600">Select a chat</p>
            </div>
          )}
      </section>
    </div>
  )
}
