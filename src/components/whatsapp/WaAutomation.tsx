import { useCallback, useEffect, useState } from 'react'
import { Bot, Clock, Hand, KeyRound, Loader2, Plus, Trash2, Pencil, Handshake, MessageSquareDashed, ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { notify } from '@/lib/notify'
import { DEAL_STAGES, DEFAULT_HOURS, deleteRule, loadHours, loadRules, saveHours, saveRule, type BusinessHours, type DealStage, type RuleKind, type WaRule } from '@/lib/whatsappModules'
import { templateBody, templateParamCount, waTemplates, type WaTemplate } from '@/lib/whatsapp'
import { MigrationNote, btnGhost, btnPrimary, inputCls } from './WaShared'
import { timeOf } from './WaChat'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function useRules() {
  const [rules, setRules] = useState<WaRule[] | null | 'loading'>('loading')
  const refresh = useCallback(() => loadRules().then(setRules).catch(e => { notify.error((e as Error).message); setRules([]) }), [])
  useEffect(() => { void refresh() }, [refresh])
  return { rules, refresh }
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer shrink-0 ${on ? 'bg-emerald-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

/** One fixed rule (welcome / away): on/off and its message */
function FixedRule({ kind, rule, onSaved, icon: Icon, title, note }: { kind: RuleKind; rule?: WaRule; onSaved: () => void; icon: typeof Bot; title: string; note: string }) {
  const [reply, setReply] = useState(rule?.reply || '')
  useEffect(() => { setReply(rule?.reply || '') }, [rule?.reply])
  const save = async (patch: Partial<WaRule> = {}) => {
    const text = (patch.reply ?? reply).trim()
    if (!text) return notify.error('Write the message first')
    try { await saveRule({ ...(rule ? { id: rule.id } : {}), kind, name: title, reply: text, enabled: patch.enabled ?? rule?.enabled ?? true }); notify.success('Saved'); onSaved() }
    catch (e) { notify.error((e as Error).message) }
  }
  return (
    <section className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-[#7c3aed] text-white flex items-center justify-center shrink-0"><Icon size={18} /></span>
        <div className="flex-1 min-w-0"><p className="text-[14.5px] font-bold text-[#111827]">{title}</p><p className="text-[12px] text-slate-500">{note}</p></div>
        <Toggle on={Boolean(rule?.enabled)} onChange={v => void save({ enabled: v })} label={`${title} on or off`} />
      </div>
      <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3} placeholder="Message text" className={inputCls} />
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] text-slate-400">{rule ? `Sent ${rule.fire_count} times${rule.last_fired_at ? ` · last ${timeOf(rule.last_fired_at)}` : ''}` : 'Not saved yet'}</p>
        <button type="button" onClick={() => void save()} className={btnPrimary}>Save</button>
      </div>
    </section>
  )
}

/** R-WA-03: deal moves into a stage → send a template to the contact and / or log a note on the deal */
function DealStageRules({ rules, refresh, canSend }: { rules: WaRule[]; refresh: () => void; canSend: boolean }) {
  const list = rules.filter(r => r.kind === 'deal_stage')
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null)
  const [edit, setEdit] = useState<{ id?: string; name: string; from_stage: DealStage | ''; to_stage: DealStage; template: string; params: string[]; note: string; enabled: boolean } | null>(null)
  useEffect(() => { if (edit && templates === null && canSend) void waTemplates().then(setTemplates).catch(() => setTemplates([])) }, [edit, templates, canSend])
  const key = (t: { name: string; language: string }) => `${t.name}|${t.language}`
  const tpl = templates?.find(t => key(t) === edit?.template) || null
  const label = (k: string | null | undefined) => DEAL_STAGES.find(s => s.key === k)?.label || 'Any stage'

  const save = async () => {
    if (!edit) return
    if (!edit.template && !edit.note.trim()) return notify.error('Choose a template, a note, or both')
    try {
      await saveRule({
        ...(edit.id ? { id: edit.id } : {}), kind: 'deal_stage', name: edit.name.trim() || `${label(edit.from_stage || null)} → ${label(edit.to_stage)}`, reply: '', enabled: edit.enabled,
        from_stage: edit.from_stage || null, to_stage: edit.to_stage, template_name: tpl?.name || null, language: tpl?.language || null, params: edit.params, note: edit.note.trim() || null,
      })
      setEdit(null); refresh()
    } catch (e) { notify.error(/check constraint|template_name|to_stage|schema cache/i.test((e as Error).message) ? 'Deal-stage rules need the database step 2026-11-07_whatsapp_crm_more.sql' : (e as Error).message) }
  }
  const remove = (r: WaRule) => { if (window.confirm(`Delete "${r.name}"?`)) void deleteRule(r.id).then(refresh).catch(e => notify.error((e as Error).message)) }

  return (
    <section className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-[#0284c7] text-white flex items-center justify-center shrink-0"><Handshake size={18} /></span>
        <div className="flex-1 min-w-0"><p className="text-[14.5px] font-bold text-[#111827]">Deal stage rules</p><p className="text-[12px] text-slate-500">When a deal moves to a stage: send the client a template (e.g. Quote sent → follow-up) and / or log a note on the deal.</p></div>
        <button type="button" onClick={() => setEdit({ name: '', from_stage: '', to_stage: 'quoted', template: '', params: [], note: '', enabled: true })} className={btnPrimary}><Plus size={14} /> Rule</button>
      </div>
      {list.length === 0 ? <p className="text-[12.5px] text-slate-400">No deal stage rules yet.</p> : (
        <ul className="divide-y divide-slate-100">
          {list.map(r => (
            <li key={r.id} className="py-2.5 flex items-center gap-3 text-[12.5px]">
              <span className="flex-1 min-w-0">
                <span className="font-bold block truncate">{r.name}</span>
                <span className="text-slate-500 flex items-center gap-1 flex-wrap">{label(r.from_stage)} <ArrowRight size={11} /> {label(r.to_stage)}{r.template_name && <> · template <b>{r.template_name}</b></>}{r.note && <> · note</>} · ran {r.fire_count}×</span>
              </span>
              <Toggle on={r.enabled} onChange={v => void saveRule({ ...r, enabled: v }).then(refresh).catch(e => notify.error((e as Error).message))} label={`${r.name} on or off`} />
              <button type="button" onClick={() => setEdit({ id: r.id, name: r.name, from_stage: r.from_stage || '', to_stage: r.to_stage || 'quoted', template: r.template_name ? `${r.template_name}|${r.language}` : '', params: r.params || [], note: r.note || '', enabled: r.enabled })} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" title="Edit"><Pencil size={13} /></button>
              <button type="button" onClick={() => remove(r)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer" title="Delete"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit deal stage rule' : 'New deal stage rule'}>
        {edit && (
          <div className="space-y-3">
            <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Name, e.g. Quote sent — follow up" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <select value={edit.from_stage} onChange={e => setEdit({ ...edit, from_stage: e.target.value as DealStage | '' })} className={inputCls} aria-label="From stage">
                <option value="">From any stage</option>{DEAL_STAGES.map(s => <option key={s.key} value={s.key}>From {s.label}</option>)}
              </select>
              <select value={edit.to_stage} onChange={e => setEdit({ ...edit, to_stage: e.target.value as DealStage })} className={inputCls} aria-label="To stage">
                {DEAL_STAGES.map(s => <option key={s.key} value={s.key}>To {s.label}</option>)}
              </select>
            </div>
            {canSend ? (templates === null ? <Loader2 className="animate-spin text-slate-300" /> : (
              <>
                <select value={edit.template} onChange={e => { const t = templates.find(x => key(x) === e.target.value); setEdit({ ...edit, template: e.target.value, params: t ? Array(templateParamCount(t)).fill('{name}') : [] }) }} className={inputCls}>
                  <option value="">No template</option>{templates.map(t => <option key={key(t)} value={key(t)}>Send template: {t.name} · {t.language}</option>)}
                </select>
                {tpl && edit.params.map((v, i) => <input key={i} value={v} onChange={e => setEdit({ ...edit, params: edit.params.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Value for {{${i + 1}}} — {name} = the deal's contact`} className={inputCls} />)}
                {tpl && <div className="bg-[#F4F6F3] rounded-xl p-3 text-[12.5px] whitespace-pre-wrap">{templateBody(tpl, edit.params)}</div>}
              </>
            )) : <p className="text-[12px] text-slate-500">Templates show once the Meta keys are on the server; a note works already.</p>}
            <input value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="Activity note on the deal (optional), e.g. Follow up in 2 days" className={inputCls} />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEdit(null)} className={btnGhost}>Cancel</button><button type="button" onClick={() => void save()} className={btnPrimary}>Save</button></div>
          </div>
        )}
      </Modal>
    </section>
  )
}

/** R-WA-02 Automation: welcome message, away message, business hours; R-WA-03 deal stage rules */
export function WaAutomation({ canSend = false }: { canSend?: boolean }) {
  const { rules, refresh } = useRules()
  const [hours, setHours] = useState<BusinessHours | null | undefined | 'loading'>('loading')
  useEffect(() => { loadHours().then(h => setHours(h === null ? DEFAULT_HOURS : h)).catch(() => setHours(DEFAULT_HOURS)) }, [])

  if (rules === 'loading' || hours === 'loading') return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
  if (rules === null || hours === undefined) return <MigrationNote />
  const h = hours || DEFAULT_HOURS
  const setH = (p: Partial<BusinessHours>) => setHours({ ...h, ...p })
  const persistHours = async () => {
    if (!h.days.length || h.from >= h.to) return notify.error('Choose at least one day, and an end time after the start')
    try { await saveHours(h); notify.success('Business hours saved') } catch (e) { notify.error((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-slate-500">Automatic replies are sent by the server the moment a client writes — free, because the client opened the 24-hour window. A keyword reply (Templates → Keyword Triggers) goes first; then the welcome or away message.</p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FixedRule kind="welcome" rule={rules.find(r => r.kind === 'welcome')} onSaved={refresh} icon={Hand} title="Welcome message" note="Sent once, to the first message of a new chat." />
        <FixedRule kind="away" rule={rules.find(r => r.kind === 'away')} onSaved={refresh} icon={Clock} title="Away message" note="Sent outside business hours — at most once every 12 hours per chat." />
      </div>
      <DealStageRules rules={rules} refresh={refresh} canSend={canSend} />
      <section className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-3">
        <p className="text-[14.5px] font-bold text-[#111827]">Business hours <span className="text-[12px] font-semibold text-slate-400">· Dubai time · used by the away message</span></p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => setH({ days: h.days.includes(i) ? h.days.filter(x => x !== i) : [...h.days, i].sort() })}
              className={`w-12 py-1.5 rounded-xl text-[12px] font-bold border cursor-pointer ${h.days.includes(i) ? 'bg-emerald-600 text-white border-emerald-600' : 'border-[#E2E5E0] text-slate-500'}`}>{d}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          From <input type="time" value={h.from} onChange={e => setH({ from: e.target.value })} className={`${inputCls} w-32`} />
          to <input type="time" value={h.to} onChange={e => setH({ to: e.target.value })} className={`${inputCls} w-32`} />
          <button type="button" onClick={() => void persistHours()} className={btnPrimary}>Save hours</button>
        </div>
      </section>
    </div>
  )
}

/** R-WA-02 Keyword Trigger: a word in the client's message → an instant reply */
export function WaKeywords() {
  const { rules, refresh } = useRules()
  const [edit, setEdit] = useState<{ id?: string; name: string; keywords: string; match: 'contains' | 'exact'; reply: string; enabled: boolean } | null>(null)

  if (rules === 'loading') return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
  if (rules === null) return <MigrationNote />
  const list = rules.filter(r => r.kind === 'keyword')

  const save = async () => {
    if (!edit) return
    const keywords = edit.keywords.split(',').map(k => k.trim()).filter(Boolean)
    if (!keywords.length || !edit.reply.trim()) return notify.error('Add at least one keyword and the reply')
    try { await saveRule({ ...(edit.id ? { id: edit.id } : {}), kind: 'keyword', name: edit.name.trim() || keywords[0], keywords, match: edit.match, reply: edit.reply.trim(), enabled: edit.enabled }); setEdit(null); void refresh() }
    catch (e) { notify.error((e as Error).message) }
  }
  const toggle = async (r: WaRule, enabled: boolean) => { try { await saveRule({ ...r, enabled }); void refresh() } catch (e) { notify.error((e as Error).message) } }
  const remove = async (r: WaRule) => { if (!window.confirm(`Delete "${r.name}"?`)) return; try { await deleteRule(r.id); void refresh() } catch (e) { notify.error((e as Error).message) } }

  return (
    <div className="space-y-4">
      <FixedRule kind="fallback" rule={rules.find(r => r.kind === 'fallback')} onSaved={refresh} icon={MessageSquareDashed} title="Fallback reply"
        note="When no keyword matches (and no welcome / away message went out), e.g. 'Thanks! Our team will reply shortly.' At most once every 12 hours per chat." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-slate-500">Example: a client writes "price" or "rates" → the price list goes out at once. Upper / lower case does not matter. The first matching trigger wins.</p>
        <button type="button" onClick={() => setEdit({ name: '', keywords: '', match: 'contains', reply: '', enabled: true })} className={btnPrimary}><Plus size={14} /> New trigger</button>
      </div>
      {list.length === 0 ? <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-8 text-center text-[12.5px] text-slate-400">No keyword triggers yet.</div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map(r => (
            <article key={r.id} className="bg-white border border-[#E2E5E0] rounded-[18px] p-4 space-y-2">
              <div className="flex items-center gap-2">
                <KeyRound size={15} className="text-violet-600 shrink-0" />
                <p className="text-[13.5px] font-bold text-[#111827] flex-1 truncate">{r.name}</p>
                <Toggle on={r.enabled} onChange={v => void toggle(r, v)} label={`${r.name} on or off`} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.keywords.map(k => <span key={k} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{r.match === 'exact' ? `= ${k}` : k}</span>)}
              </div>
              <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap line-clamp-3 bg-[#F4F6F3] rounded-xl p-2.5">{r.reply}</p>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-400">Sent {r.fire_count} times</p>
                <span className="flex gap-1">
                  <button type="button" onClick={() => setEdit({ id: r.id, name: r.name, keywords: r.keywords.join(', '), match: r.match, reply: r.reply, enabled: r.enabled })} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" title="Edit"><Pencil size={13} /></button>
                  <button type="button" onClick={() => void remove(r)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer" title="Delete"><Trash2 size={13} /></button>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit trigger' : 'New keyword trigger'}>
        {edit && (
          <div className="space-y-3">
            <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Name, e.g. Price list" className={inputCls} />
            <input value={edit.keywords} onChange={e => setEdit({ ...edit, keywords: e.target.value })} placeholder="Keywords, comma separated: price, rates, cost" className={inputCls} />
            <select value={edit.match} onChange={e => setEdit({ ...edit, match: e.target.value as 'contains' | 'exact' })} className={inputCls}>
              <option value="contains">Message contains the word</option>
              <option value="exact">Message is exactly the word</option>
            </select>
            <textarea value={edit.reply} onChange={e => setEdit({ ...edit, reply: e.target.value })} rows={5} placeholder="Reply" className={inputCls} />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEdit(null)} className={btnGhost}>Cancel</button><button type="button" onClick={() => void save()} className={btnPrimary}>Save</button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
