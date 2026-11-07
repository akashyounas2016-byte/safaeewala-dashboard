import { useCallback, useEffect, useMemo, useState } from 'react'
import { Handshake, Plus, Trash2, MessageCircle, Trophy, Target, Percent, Loader2, Search, CalendarClock, UserCircle2, Send } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { Modal } from '@/components/ui/Modal'
import { notify } from '@/lib/notify'
import { useAuth } from '@/store/UserContext'
import { todayDubai } from '@/lib/dubaiTime'
import { formatWaNumber } from '@/lib/whatsapp'
import { DEAL_STAGES, dealSummary, deleteDeal, loadDeals, saveDeal, type DealStage, type WaDeal } from '@/lib/whatsappModules'
import { addDealEvent, loadDealEvents, waDealStage, type WaAgent, type WaDealEvent } from '@/lib/whatsappCrm'
import { MigrationNote, aed, btnGhost, btnPrimary, inputCls } from './WaShared'
import { timeOf } from './WaChat'

/**
 * R-WA-02 / R-WA-03 Deals: pipeline New → Contacted → Quote sent → Won / Lost, with owner, expected close,
 * search and filters, and an activity log (notes, stage moves, automations). A stage move runs the deal-stage rules.
 */
export function WaDeals({ onOpenChat, agents = [] }: { onOpenChat: (conversationId: string) => void; agents?: WaAgent[] }) {
  const { user } = useAuth()
  const author = user?.full_name || user?.email || 'Staff'
  const [deals, setDeals] = useState<WaDeal[] | null | 'loading'>('loading')
  const [edit, setEdit] = useState<Partial<WaDeal> | null>(null)
  const [events, setEvents] = useState<WaDealEvent[] | null>(null)
  const [note, setNote] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [owner, setOwner] = useState('all')

  const refresh = useCallback(() => loadDeals().then(setDeals).catch(e => { notify.error((e as Error).message); setDeals([]) }), [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (edit?.id) loadDealEvents(edit.id).then(setEvents).catch(() => setEvents([])); else setEvents(null) }, [edit?.id])
  const nameOf = (id: string | null | undefined) => (id ? agents.find(a => a.id === id)?.name || 'Agent' : null)

  const list = useMemo(() => {
    if (!Array.isArray(deals)) return []
    const qy = search.trim().toLowerCase()
    return deals.filter(d => (owner === 'all' || (owner === 'none' ? !d.owner : d.owner === owner))
      && (!qy || [d.title, d.contact_name, d.wa_id, d.notes].some(v => String(v || '').toLowerCase().includes(qy))))
  }, [deals, search, owner])

  if (deals === 'loading') return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
  if (deals === null) return <MigrationNote />
  const s = dealSummary(list)
  const ownerOn = deals.some(d => 'owner' in d)
  const today = todayDubai()

  const move = async (d: WaDeal, stage: DealStage) => {
    if (d.stage === stage) return
    setDeals(l => (Array.isArray(l) ? l.map(x => (x.id === d.id ? { ...x, stage } : x)) : l))
    try {
      await saveDeal({ id: d.id, title: d.title, stage })
      await addDealEvent(d.id, 'stage', `${DEAL_STAGES.find(x => x.key === d.stage)?.label} → ${DEAL_STAGES.find(x => x.key === stage)?.label}`, author)
      waDealStage(d.id, d.stage).then(r => { if (r.fired) notify.success(`${r.fired} automation${r.fired > 1 ? 's' : ''} ran for this deal`) }).catch(() => {})
    } catch (e) { notify.error((e as Error).message); void refresh() }
  }
  const save = async () => {
    if (!edit?.title?.trim()) return notify.error('Give the deal a title')
    const before = Array.isArray(deals) ? deals.find(d => d.id === edit.id) : undefined
    try {
      const saved = await saveDeal({ ...edit, title: edit.title.trim(), ...(ownerOn ? {} : { owner: undefined, expected_close: undefined }) })
      if (!before) await addDealEvent(saved.id, 'note', 'Deal created', author)
      else if (before.stage !== saved.stage) {
        await addDealEvent(saved.id, 'stage', `${DEAL_STAGES.find(x => x.key === before.stage)?.label} → ${DEAL_STAGES.find(x => x.key === saved.stage)?.label}`, author)
        waDealStage(saved.id, before.stage).catch(() => {})
      }
      setEdit(null); void refresh()
    } catch (e) { notify.error((e as Error).message) }
  }
  const remove = async (d: WaDeal) => {
    if (!window.confirm(`Delete the deal "${d.title}"?`)) return
    try { await deleteDeal(d.id); void refresh() } catch (e) { notify.error((e as Error).message) }
  }
  const postNote = async () => {
    if (!edit?.id || !note.trim()) return
    try { await addDealEvent(edit.id, 'note', note.trim(), author); setNote(''); setEvents(await loadDealEvents(edit.id)) } catch (e) { notify.error((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Open pipeline" value={aed(s.open)} sub={`${s.by.new.count + s.by.contacted.count + s.by.quoted.count} open deals`} icon={Target} labelColor="text-sky-700" iconSolid="bg-[#0284c7] shadow-sky-500/25" />
        <KpiCard label="Quotes sent" value={s.by.quoted.count} sub={aed(s.by.quoted.value)} icon={Handshake} labelColor="text-amber-700" iconSolid="bg-[#d97706] shadow-amber-500/25" />
        <KpiCard label="Won" value={aed(s.won)} sub={`${s.by.won.count} deals`} icon={Trophy} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" />
        <KpiCard label="Win rate" value={s.winRate === null ? '—' : `${s.winRate}%`} sub="won ÷ (won + lost)" icon={Percent} labelColor="text-violet-700" iconSolid="bg-[#7c3aed] shadow-violet-500/25" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-white border border-[#E6E8E6] rounded-xl px-3 h-9 flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deals or customers" className="outline-none text-[13px] flex-1 bg-transparent" />
        </div>
        {ownerOn && (
          <select value={owner} onChange={e => setOwner(e.target.value)} className="h-9 rounded-xl border border-[#E6E8E6] bg-white px-2.5 text-[12.5px] font-semibold text-slate-600" aria-label="Owner">
            <option value="all">All owners</option><option value="none">Unassigned</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => setEdit({ title: '', value: 0, stage: 'new', owner: user?.id || null })} className={btnPrimary}><Plus size={14} /> New deal</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {DEAL_STAGES.map(st => {
          const col = list.filter(d => d.stage === st.key)
          return (
            <section key={st.key} onDragOver={e => e.preventDefault()} onDrop={() => { const d = list.find(x => x.id === dragId); if (d) void move(d, st.key); setDragId(null) }}
              className="bg-[#F4F6F3] rounded-2xl p-2.5 min-h-[160px] flex flex-col gap-2">
              <header className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-[12px] font-bold ${st.tone}`}>
                <span>{st.label} · {col.length}</span><span>{aed(s.by[st.key].value)}</span>
              </header>
              {col.map(d => {
                const late = d.expected_close && d.expected_close < today && d.stage !== 'won' && d.stage !== 'lost'
                return (
                  <article key={d.id} draggable onDragStart={() => setDragId(d.id)} className="bg-white rounded-xl border border-[#E2E5E0] p-3 space-y-1.5 cursor-grab active:cursor-grabbing">
                    <button type="button" onClick={() => setEdit(d)} className="text-left w-full cursor-pointer">
                      <p className="text-[13px] font-bold text-[#111827] break-words">{d.title}</p>
                      <p className="text-[11.5px] text-slate-500 truncate">{d.contact_name || (d.wa_id ? formatWaNumber(d.wa_id) : '—')}</p>
                    </button>
                    {(nameOf(d.owner) || d.expected_close) && (
                      <p className="flex items-center gap-2 text-[10.5px] text-slate-500 flex-wrap">
                        {nameOf(d.owner) && <span className="flex items-center gap-0.5"><UserCircle2 size={10} />{nameOf(d.owner)}</span>}
                        {d.expected_close && <span className={`flex items-center gap-0.5 ${late ? 'text-red-600 font-bold' : ''}`}><CalendarClock size={10} />{d.expected_close}</span>}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[12.5px] font-black text-[#111827]">{aed(d.value)}</span>
                      <span className="flex gap-1">
                        {d.conversation_id && <button type="button" onClick={() => onOpenChat(d.conversation_id!)} title="Open chat" className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 cursor-pointer"><MessageCircle size={13} /></button>}
                        <button type="button" onClick={() => void remove(d)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"><Trash2 size={13} /></button>
                      </span>
                    </div>
                    <select value={d.stage} onChange={e => void move(d, e.target.value as DealStage)} aria-label="Stage" className="w-full text-[11.5px] rounded-lg border border-[#E2E5E0] px-2 py-1 bg-white md:hidden">
                      {DEAL_STAGES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                  </article>
                )
              })}
            </section>
          )
        })}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Deal' : 'New deal'} size="lg">
        {edit && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4">
            <div className="space-y-3">
              <input value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="Title, e.g. Villa deep clean — Arabian Ranches" className={inputCls} />
              <input value={edit.contact_name || ''} onChange={e => setEdit({ ...edit, contact_name: e.target.value })} placeholder="Contact name" className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <input value={String(edit.value ?? '')} onChange={e => setEdit({ ...edit, value: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} inputMode="decimal" placeholder="Value (AED)" className={inputCls} />
                <select value={edit.stage || 'new'} onChange={e => setEdit({ ...edit, stage: e.target.value as DealStage })} className={inputCls}>
                  {DEAL_STAGES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </div>
              {ownerOn && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={edit.owner || ''} onChange={e => setEdit({ ...edit, owner: e.target.value || null })} className={inputCls} aria-label="Owner">
                    <option value="">No owner</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <input type="date" value={edit.expected_close || ''} onChange={e => setEdit({ ...edit, expected_close: e.target.value || null })} className={inputCls} aria-label="Expected close" title="Expected close" />
                </div>
              )}
              <textarea value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} rows={3} placeholder="Notes" className={inputCls} />
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setEdit(null)} className={btnGhost}>Cancel</button><button type="button" onClick={() => void save()} className={btnPrimary}>Save</button></div>
            </div>
            {edit.id && (
              <aside className="border border-[#ECEEEC] rounded-xl flex flex-col max-h-[420px]">
                <p className="px-3 py-2 border-b border-[#ECEEEC] text-[12px] font-bold text-slate-600">Activity</p>
                <ul className="flex-1 overflow-y-auto p-2.5 space-y-2">
                  {events === null ? <li className="text-[11.5px] text-slate-400">Activity needs the database step (2026-11-07_whatsapp_crm_more.sql).</li>
                    : events.length === 0 ? <li className="text-[11.5px] text-slate-400">No activity yet.</li>
                    : events.map(ev => (
                      <li key={ev.id} className="text-[11.5px]">
                        <p className={ev.kind === 'note' ? 'text-[#111827]' : ev.kind === 'automation' ? 'text-violet-700' : 'text-slate-500'}>{ev.body}</p>
                        <p className="text-[10px] text-slate-400">{ev.author} · {timeOf(ev.created_at)}</p>
                      </li>
                    ))}
                </ul>
                {events !== null && (
                  <div className="p-2 border-t border-[#ECEEEC] flex gap-1.5">
                    <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void postNote() }} placeholder="Add a note" className="flex-1 rounded-lg bg-[#F4F5F4] px-2.5 py-1.5 text-[12px] outline-none" />
                    <button type="button" onClick={() => void postNote()} disabled={!note.trim()} className="p-2 rounded-lg bg-emerald-600 text-white disabled:opacity-30 cursor-pointer" aria-label="Add note"><Send size={12} /></button>
                  </div>
                )}
              </aside>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
