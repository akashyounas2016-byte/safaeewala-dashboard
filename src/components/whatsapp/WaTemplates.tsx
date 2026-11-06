import { useCallback, useEffect, useState } from 'react'
import { FileText, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { notify } from '@/lib/notify'
import { templateBody } from '@/lib/whatsapp'
import { waCreateTemplate, waDeleteTemplate, waTemplatesAll, type WaTemplateFull } from '@/lib/whatsappModules'
import { btnGhost, btnPrimary, inputCls } from './WaShared'

const TONE: Record<string, string> = { APPROVED: 'bg-emerald-50 text-emerald-700', PENDING: 'bg-amber-50 text-amber-700', REJECTED: 'bg-red-50 text-red-600', PAUSED: 'bg-slate-100 text-slate-600', DISABLED: 'bg-slate-100 text-slate-600' }

/** R-WA-02 Templates: list every template of the WhatsApp account, create one for Meta's review, delete one */
export function WaTemplates({ canSend }: { canSend: boolean }) {
  const [list, setList] = useState<WaTemplateFull[] | 'loading' | 'off'>('loading')
  const [form, setForm] = useState<{ name: string; category: 'UTILITY' | 'MARKETING'; language: string; body: string; examples: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    if (!canSend) { setList('off'); return }
    setList('loading')
    waTemplatesAll().then(setList).catch(e => { notify.error((e as Error).message); setList([]) })
  }, [canSend])
  useEffect(() => { refresh() }, [refresh])

  const count = form ? new Set(form.body.match(/\{\{\d+\}\}/g) || []).size : 0
  const create = async () => {
    if (!form) return
    setBusy(true)
    try { const r = await waCreateTemplate({ ...form, examples: form.examples.slice(0, count) }); notify.success(`"${r.name}" sent to Meta for review (${r.status?.toLowerCase() || 'pending'})`); setForm(null); refresh() }
    catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }
  const remove = async (t: WaTemplateFull) => {
    if (!window.confirm(`Delete the template "${t.name}" (all languages) at Meta?`)) return
    try { await waDeleteTemplate(t.name); refresh() } catch (e) { notify.error((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 flex flex-wrap items-center gap-4">
        <span className="w-11 h-11 rounded-2xl bg-[#0284c7] text-white flex items-center justify-center"><FileText size={20} /></span>
        <div className="flex-1 min-w-[220px]">
          <p className="text-[15px] font-bold text-[#111827]">Message templates</p>
          <p className="text-[12px] text-slate-500">Needed to write first, or after 24 hours, and for broadcasts. Meta reviews each new template — usually within minutes.</p>
        </div>
        <button type="button" onClick={refresh} disabled={!canSend} className={btnGhost}><RefreshCw size={14} /> Refresh</button>
        <button type="button" onClick={() => setForm({ name: '', category: 'UTILITY', language: 'en', body: '', examples: [] })} disabled={!canSend} title={canSend ? '' : 'Needs the Meta keys on the server'} className={btnPrimary}><Plus size={14} /> New template</button>
      </div>
      {list === 'off' ? <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-8 text-center text-[12.5px] text-slate-500">Templates are read from Meta — they show here once the Meta keys are on the server (Settings tab).</div>
        : list === 'loading' ? <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
        : list.length === 0 ? <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-8 text-center text-[12.5px] text-slate-400">No templates yet.</div>
        : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map(t => (
              <article key={`${t.name}-${t.language}`} className="bg-white border border-[#E2E5E0] rounded-[18px] p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-bold text-[#111827] flex-1 truncate">{t.name}</p>
                  <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${TONE[t.status] || TONE.PAUSED}`}>{t.status.toLowerCase()}</span>
                </div>
                <p className="text-[11px] text-slate-400">{t.language} · {t.category.toLowerCase()}</p>
                <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap bg-[#F4F6F3] rounded-xl p-2.5 line-clamp-5">{templateBody(t)}</p>
                {t.status === 'REJECTED' && t.rejected_reason && <p className="text-[11.5px] text-red-600">Reason: {t.rejected_reason}</p>}
                <div className="flex justify-end"><button type="button" onClick={() => void remove(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer" title="Delete"><Trash2 size={13} /></button></div>
              </article>
            ))}
          </div>
        )}
      <Modal open={!!form} onClose={() => setForm(null)} title="New template" size="lg">
        {form && (
          <div className="space-y-3">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name (small letters and _ only), e.g. booking_reminder" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as 'UTILITY' | 'MARKETING' })} className={inputCls}>
                <option value="UTILITY">Utility — bookings, reminders, payments (cheaper)</option>
                <option value="MARKETING">Marketing — offers, promotions</option>
              </select>
              <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} className={inputCls}>
                <option value="en">English</option><option value="ar">Arabic</option><option value="ur">Urdu</option><option value="hi">Hindi</option>
              </select>
            </div>
            <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={5} placeholder={'Hi {{1}}, your cleaning is confirmed for {{2}}. Reply here if anything changes. — Safaeewala'} className={inputCls} />
            {count > 0 && (
              <div className="space-y-2">
                <p className="text-[12px] font-bold text-slate-600">Example values (Meta needs them for review)</p>
                {Array.from({ length: count }, (_, i) => (
                  <input key={i} value={form.examples[i] || ''} onChange={e => { const ex = [...form.examples]; ex[i] = e.target.value; setForm({ ...form, examples: ex }) }} placeholder={`Example for {{${i + 1}}}`} className={inputCls} />
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={btnGhost}>Cancel</button>
              <button type="button" onClick={() => void create()} disabled={busy || !form.name.trim() || !form.body.trim()} className={btnPrimary}>{busy && <Loader2 size={14} className="animate-spin" />} Send for review</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
