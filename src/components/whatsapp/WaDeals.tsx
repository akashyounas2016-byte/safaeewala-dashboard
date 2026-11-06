import { useCallback, useEffect, useState } from 'react'
import { Handshake, Plus, Trash2, MessageCircle, Trophy, Target, Percent, Loader2 } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { Modal } from '@/components/ui/Modal'
import { notify } from '@/lib/notify'
import { formatWaNumber } from '@/lib/whatsapp'
import { DEAL_STAGES, dealSummary, deleteDeal, loadDeals, saveDeal, type DealStage, type WaDeal } from '@/lib/whatsappModules'
import { MigrationNote, aed, btnGhost, btnPrimary, inputCls } from './WaShared'

/** R-WA-02 Deals: a simple pipeline for WhatsApp enquiries (New → Contacted → Quote sent → Won / Lost) */
export function WaDeals({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  const [deals, setDeals] = useState<WaDeal[] | null | 'loading'>('loading')
  const [edit, setEdit] = useState<Partial<WaDeal> | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const refresh = useCallback(() => loadDeals().then(setDeals).catch(e => { notify.error((e as Error).message); setDeals([]) }), [])
  useEffect(() => { void refresh() }, [refresh])

  if (deals === 'loading') return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
  if (deals === null) return <MigrationNote />
  const s = dealSummary(deals)

  const move = async (d: WaDeal, stage: DealStage) => {
    if (d.stage === stage) return
    setDeals(list => (Array.isArray(list) ? list.map(x => (x.id === d.id ? { ...x, stage } : x)) : list))
    try { await saveDeal({ id: d.id, title: d.title, stage }) } catch (e) { notify.error((e as Error).message); void refresh() }
  }
  const save = async () => {
    if (!edit?.title?.trim()) return notify.error('Give the deal a title')
    try { await saveDeal({ ...edit, title: edit.title.trim() }); setEdit(null); void refresh() } catch (e) { notify.error((e as Error).message) }
  }
  const remove = async (d: WaDeal) => {
    if (!window.confirm(`Delete the deal "${d.title}"?`)) return
    try { await deleteDeal(d.id); void refresh() } catch (e) { notify.error((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Open pipeline" value={aed(s.open)} sub={`${s.by.new.count + s.by.contacted.count + s.by.quoted.count} open deals`} icon={Target} labelColor="text-sky-700" iconSolid="bg-[#0284c7] shadow-sky-500/25" />
        <KpiCard label="Quotes sent" value={s.by.quoted.count} sub={aed(s.by.quoted.value)} icon={Handshake} labelColor="text-amber-700" iconSolid="bg-[#d97706] shadow-amber-500/25" />
        <KpiCard label="Won" value={aed(s.won)} sub={`${s.by.won.count} deals`} icon={Trophy} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" />
        <KpiCard label="Win rate" value={s.winRate === null ? '—' : `${s.winRate}%`} sub="won ÷ (won + lost)" icon={Percent} labelColor="text-violet-700" iconSolid="bg-[#7c3aed] shadow-violet-500/25" />
      </div>
      <div className="flex justify-between items-center">
        <p className="text-[12px] text-slate-500">Drag a card to another column, or use "Deal" in a chat to add one.</p>
        <button type="button" onClick={() => setEdit({ title: '', value: 0, stage: 'new' })} className={btnPrimary}><Plus size={14} /> New deal</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {DEAL_STAGES.map(st => {
          const list = deals.filter(d => d.stage === st.key)
          return (
            <section key={st.key} onDragOver={e => e.preventDefault()} onDrop={() => { const d = deals.find(x => x.id === dragId); if (d) void move(d, st.key); setDragId(null) }}
              className="bg-[#F4F6F3] rounded-2xl p-2.5 min-h-[160px] flex flex-col gap-2">
              <header className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-[12px] font-bold ${st.tone}`}>
                <span>{st.label} · {list.length}</span><span>{aed(s.by[st.key].value)}</span>
              </header>
              {list.map(d => (
                <article key={d.id} draggable onDragStart={() => setDragId(d.id)} className="bg-white rounded-xl border border-[#E2E5E0] p-3 space-y-1.5 cursor-grab active:cursor-grabbing">
                  <button type="button" onClick={() => setEdit(d)} className="text-left w-full cursor-pointer">
                    <p className="text-[13px] font-bold text-[#111827] break-words">{d.title}</p>
                    <p className="text-[11.5px] text-slate-500 truncate">{d.contact_name || (d.wa_id ? formatWaNumber(d.wa_id) : '—')}</p>
                  </button>
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
              ))}
            </section>
          )
        })}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit deal' : 'New deal'}>
        {edit && (
          <div className="space-y-3">
            <input value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="Title, e.g. Villa deep clean — Arabian Ranches" className={inputCls} />
            <input value={edit.contact_name || ''} onChange={e => setEdit({ ...edit, contact_name: e.target.value })} placeholder="Contact name" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input value={String(edit.value ?? '')} onChange={e => setEdit({ ...edit, value: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} inputMode="decimal" placeholder="Value (AED)" className={inputCls} />
              <select value={edit.stage || 'new'} onChange={e => setEdit({ ...edit, stage: e.target.value as DealStage })} className={inputCls}>
                {DEAL_STAGES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </div>
            <textarea value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} rows={3} placeholder="Notes" className={inputCls} />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEdit(null)} className={btnGhost}>Cancel</button><button type="button" onClick={() => void save()} className={btnPrimary}>Save</button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
