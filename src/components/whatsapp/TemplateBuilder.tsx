import { Fragment, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, X, MessageSquare, LayoutGrid, CalendarClock, Timer, GalleryHorizontalEnd, Package, PackageOpen, PhoneCall,
  Type, Image as ImageIcon, Video, File as FileIcon, MapPin, Bold, Italic, Strikethrough, Braces, Plus, Trash2, Loader2, Reply,
  ExternalLink, Phone, Copy, MessageCircle, Upload, Check, AlertCircle,
} from 'lucide-react'
import { notify } from '@/lib/notify'
import { useAuth } from '@/store/UserContext'
import { fileToBase64 } from '@/lib/inboxSettings'
import {
  LANGUAGES, TEMPLATE_TYPES, buildComponents, cleanName, extractVars, fillPreview, presetFor, saveTemplate, typeMeta, validateTemplate,
  waSubmitTemplate, waTemplateMedia, type ButtonKind, type Category, type HeaderKind, type TButton, type TCard, type TemplateForm, type TemplateType, type WaTemplateRow,
} from '@/lib/templateBuilder'

const TYPE_ICON: Record<TemplateType, typeof MessageSquare> = {
  custom_message: MessageSquare, flows: LayoutGrid, appointment_reminder: CalendarClock, limited_time_offer: Timer,
  carousel: GalleryHorizontalEnd, catalog: Package, multi_product: PackageOpen, call_permission: PhoneCall,
}
const HEADER_OPTIONS: { id: HeaderKind; label: string; icon: typeof Type }[] = [
  { id: 'none', label: 'None', icon: X }, { id: 'text', label: 'Text', icon: Type }, { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Video }, { id: 'document', label: 'Document', icon: FileIcon }, { id: 'location', label: 'Location', icon: MapPin },
]
const BTN_LABEL: Record<ButtonKind, string> = { QUICK_REPLY: 'Quick reply', URL: 'Visit website', PHONE_NUMBER: 'Call phone', COPY_CODE: 'Copy offer code' }
const field = 'w-full rounded-xl border border-[#E2E5E0] bg-white px-3 py-2 text-[13px] outline-none focus:border-emerald-500'
const label = 'block text-[12px] font-semibold text-slate-600 mb-1'

/** WhatsApp formatting in the preview: *bold* _italic_ ~strike~ */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g)
  return <>{parts.map((p, i) => p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <b key={i}>{p.slice(1, -1)}</b>
    : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <i key={i}>{p.slice(1, -1)}</i>
    : p.startsWith('~') && p.endsWith('~') && p.length > 2 ? <s key={i}>{p.slice(1, -1)}</s> : <Fragment key={i}>{p}</Fragment>)}</>
}
const BtnIcon = ({ t }: { t: ButtonKind | 'FLOW' | 'CATALOG' }) => t === 'URL' ? <ExternalLink size={13} /> : t === 'PHONE_NUMBER' ? <Phone size={13} /> : t === 'COPY_CODE' ? <Copy size={13} /> : t === 'QUICK_REPLY' ? <Reply size={13} /> : <LayoutGrid size={13} />

/** Live WhatsApp-style preview */
export function TemplatePreview({ type, form }: { type: TemplateType | null; form: TemplateForm | null }) {
  if (!type || !form || (!form.body && !form.header.text)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 text-[12.5px] text-center px-6">
        <MessageCircle size={30} className="text-slate-300" />Type in the form to see your template preview
      </div>
    )
  }
  const buttons: { t: ButtonKind | 'FLOW' | 'CATALOG'; text: string }[] = [
    ...form.buttons.map(b => ({ t: b.type, text: b.type === 'COPY_CODE' ? 'Copy code' : b.text })),
    ...(type === 'flows' ? [{ t: 'FLOW' as const, text: form.flowButton || 'Open' }] : []),
    ...(type === 'catalog' || type === 'multi_product' ? [{ t: 'CATALOG' as const, text: form.catalogButton || 'View' }] : []),
  ]
  const h = form.header
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-[300px] space-y-1">
        <div className="bg-white rounded-xl rounded-tl-sm shadow-sm overflow-hidden">
          {type !== 'carousel' && h.kind !== 'none' && h.kind !== 'text' && (
            <div className="h-32 bg-slate-100 flex items-center justify-center text-slate-400 text-[11px] gap-1.5">
              {h.kind === 'location' ? <MapPin size={18} /> : h.kind === 'video' ? <Video size={18} /> : h.kind === 'document' ? <FileIcon size={18} /> : <ImageIcon size={18} />}
              {h.fileName || h.kind}
            </div>
          )}
          {type === 'limited_time_offer' && form.offerText && (
            <div className="mx-2 mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[12px]"><p className="font-bold text-rose-700 flex items-center gap-1"><Timer size={12} />{form.offerText}</p><p className="text-rose-600/80 text-[11px]">Offer ends in 2 days</p></div>
          )}
          <div className="px-2.5 pt-2 pb-1.5 space-y-1">
            {h.kind === 'text' && h.text && <p className="text-[13px] font-bold text-[#111827]"><Rich text={fillPreview(h.text, form.examples)} /></p>}
            <p className="text-[12.5px] text-[#111827] whitespace-pre-wrap break-words"><Rich text={fillPreview(form.body, form.examples)} /></p>
            {form.footer && type !== 'carousel' && type !== 'limited_time_offer' && <p className="text-[11px] text-slate-400">{form.footer}</p>}
            <p className="text-right text-[10px] text-slate-400">12:00</p>
          </div>
          {type === 'call_permission' && <div className="border-t border-slate-100 py-2 text-center text-[12px] font-semibold text-sky-600 flex items-center justify-center gap-1"><PhoneCall size={13} />Allow calls</div>}
          {buttons.map((b, i) => <div key={i} className="border-t border-slate-100 py-2 text-center text-[12.5px] font-semibold text-sky-600 flex items-center justify-center gap-1.5"><BtnIcon t={b.t} />{b.text || '…'}</div>)}
        </div>
        {type === 'carousel' && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(form.cards || []).map((c, i) => (
              <div key={i} className="w-48 shrink-0 bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="h-24 bg-slate-100 flex items-center justify-center text-slate-400 text-[11px] gap-1"><ImageIcon size={16} />{c.fileName || 'image'}</div>
                <p className="px-2.5 py-2 text-[12px] whitespace-pre-wrap">{c.body || '…'}</p>
                {c.buttons.map((b, j) => <div key={j} className="border-t border-slate-100 py-1.5 text-center text-[12px] font-semibold text-sky-600 flex items-center justify-center gap-1"><BtnIcon t={b.type} />{b.text || '…'}</div>)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ButtonsEditor({ buttons, onChange, allowed, max }: { buttons: TButton[]; onChange: (b: TButton[]) => void; allowed: ButtonKind[]; max: number }) {
  const set = (i: number, p: Partial<TButton>) => onChange(buttons.map((b, j) => (j === i ? { ...b, ...p } : b)))
  return (
    <div className="space-y-2">
      {buttons.map((b, i) => (
        <div key={i} className="border border-[#ECEEEC] rounded-xl p-2.5 space-y-2 bg-[#FBFCFB]">
          <div className="flex gap-2">
            <select value={b.type} onChange={e => set(i, { type: e.target.value as ButtonKind })} className={`${field} w-44`}>
              {allowed.map(k => <option key={k} value={k}>{BTN_LABEL[k]}</option>)}
            </select>
            {b.type !== 'COPY_CODE' && <input value={b.text} onChange={e => set(i, { text: e.target.value.slice(0, 25) })} placeholder="Button text (max 25)" className={field} />}
            <button type="button" onClick={() => onChange(buttons.filter((_, j) => j !== i))} className="p-2 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer" aria-label="Remove button"><Trash2 size={14} /></button>
          </div>
          {b.type === 'URL' && <input value={b.url || ''} onChange={e => set(i, { url: e.target.value })} placeholder="https://safaeewala.com/book" className={field} />}
          {b.type === 'URL' && /\{\{1\}\}/.test(b.url || '') && <input value={b.urlExample || ''} onChange={e => set(i, { urlExample: e.target.value })} placeholder="Example full link for review" className={field} />}
          {b.type === 'PHONE_NUMBER' && <input value={b.phone || ''} onChange={e => set(i, { phone: e.target.value })} placeholder="+971 50 000 0000" className={field} />}
          {b.type === 'COPY_CODE' && <input value={b.code || ''} onChange={e => set(i, { code: e.target.value.slice(0, 15) })} placeholder="Offer code, e.g. CLEAN20" className={field} />}
        </div>
      ))}
      {buttons.length < max && (
        <button type="button" onClick={() => onChange([...buttons, { type: allowed[0], text: '' }])} className="px-3 py-1.5 rounded-xl border border-dashed border-slate-300 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><Plus size={13} /> Add button</button>
      )}
    </div>
  )
}

function SampleUpload({ fileName, onDone, accept }: { fileName?: string; onDone: (handle: string, name: string) => void; accept: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (f?: File) => {
    if (!f) return
    setBusy(true)
    try { const { handle } = await waTemplateMedia({ base64: await fileToBase64(f), mime: f.type, name: f.name }); onDone(handle, f.name); notify.success('Sample uploaded') }
    catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="px-3 py-1.5 rounded-xl border border-[#E2E5E0] text-[12.5px] font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {fileName ? 'Replace sample' : 'Upload sample'}
      </button>
      {fileName && <span className="text-[11.5px] text-emerald-700 flex items-center gap-1"><Check size={12} />{fileName}</span>}
      <input ref={ref} type="file" hidden accept={accept} onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
    </span>
  )
}

/**
 * R-WA-05: Create Template — step 1 choose one of 8 types, step 2 the form with a live preview on the right.
 * "Save draft" works without Meta; "Submit for review" sends it to Meta when WhatsApp is connected.
 */
export function TemplateBuilder({ initial, canSubmit, onClose, onSaved }: { initial: WaTemplateRow | null; canSubmit: boolean; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const [type, setType] = useState<TemplateType | null>(initial?.type || null)
  const [name, setName] = useState(initial?.name || '')
  const [language, setLanguage] = useState(initial?.language || 'en')
  const [category, setCategory] = useState<Category>(initial?.category || 'UTILITY')
  const [form, setForm] = useState<TemplateForm | null>(initial?.form || null)
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const locked = Boolean(initial && initial.status !== 'DRAFT' && initial.status !== 'REJECTED')

  const choose = (t: TemplateType) => {
    const p = presetFor(t)
    setType(t); setForm(p.form); setCategory(p.category); if (!name) setName(p.name)
  }
  const set = (p: Partial<TemplateForm>) => setForm(f => (f ? { ...f, ...p } : f))
  const vars = useMemo(() => (form ? extractVars(`${form.header.kind === 'text' ? form.header.text || '' : ''} ${form.body}`) : []), [form])
  const errors = useMemo(() => (type && form ? validateTemplate(type, cleanName(name), category, form) : []), [type, form, name, category])

  const wrap = (mark: string) => {
    const el = bodyRef.current
    if (!el || !form) return
    const a = el.selectionStart; const b = el.selectionEnd
    const sel = form.body.slice(a, b) || 'text'
    set({ body: form.body.slice(0, a) + mark + sel + mark + form.body.slice(b) })
  }
  const addVar = () => {
    if (!form) return
    const next = vars.length ? Math.max(...vars.map(Number)) + 1 : 1
    const el = bodyRef.current; const a = el?.selectionStart ?? form.body.length
    set({ body: `${form.body.slice(0, a)}{{${next}}}${form.body.slice(a)}` })
  }

  const save = async (submit: boolean) => {
    if (!type || !form) return
    const clean = cleanName(name)
    if (submit && errors.length) return notify.error(errors[0])
    if (!clean || !form.body.trim()) return notify.error('Name and body are required')
    setBusy(submit ? 'submit' : 'draft')
    try {
      let row = await saveTemplate({ ...(initial ? { id: initial.id } : { created_by: user?.full_name || user?.email || 'Staff', status: 'DRAFT' }), name: clean, language, category, type, form })
      if (submit) {
        const r = await waSubmitTemplate({ name: clean, language, category, components: buildComponents(type, form) })
        row = await saveTemplate({ id: row.id, name: clean, language, category, type, form, status: (r.status || 'PENDING').toUpperCase(), meta_id: r.id, rejected_reason: null })
        notify.success(`"${row.name}" sent to Meta for review`)
      } else notify.success('Draft saved')
      onSaved()
    } catch (e) { notify.error((e as Error).message) } finally { setBusy(null) }
  }

  const meta = type ? typeMeta(type) : null
  const allowed: ButtonKind[] = type === 'limited_time_offer' ? ['COPY_CODE', 'URL'] : ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE']

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Create Template">
      <div className="bg-white rounded-[18px] shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_400px]">
        {/* left: steps */}
        <div className="overflow-y-auto p-5 sm:p-7 space-y-5 max-h-[94vh]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-bold text-[#111827]">{initial ? 'Edit Template' : 'Create Template'}</h2>
              <p className="text-[13.5px] text-slate-500">Design a new template — choose from 8 types including carousel, appointment reminders, and more</p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 flex items-center gap-1 px-3.5 py-2 rounded-full border border-[#E2E5E0] text-[12.5px] font-semibold hover:bg-slate-50 cursor-pointer"><ChevronLeft size={14} /> All Templates</button>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-[#0F1F19] text-white text-[13px] font-bold flex items-center justify-center">1</span>
            <div><p className="text-[16px] font-semibold">Choose a template type</p><p className="text-[12px] text-slate-500">{type ? `${meta?.label} — click another to switch` : 'Click a type below to get started'}</p></div>
          </div>
          {(!type || !initial) && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {TEMPLATE_TYPES.map(t => {
                const Icon = TYPE_ICON[t.id]
                const on = type === t.id
                return (
                  <button key={t.id} type="button" onClick={() => choose(t.id)} disabled={locked}
                    className={`text-center rounded-2xl border p-4 space-y-2 cursor-pointer transition-all ${on ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/30' : 'border-[#E6E8E6] hover:border-slate-300 hover:shadow-sm'} ${type && !on ? 'py-3' : ''}`}>
                    <span className={`mx-auto w-11 h-11 rounded-full flex items-center justify-center ${t.tint}`}><Icon size={19} /></span>
                    <p className="text-[14px] font-semibold text-[#111827] leading-tight">{t.label}</p>
                    {(!type || on) && <p className="text-[11.5px] text-slate-500 leading-snug">{t.description}</p>}
                  </button>
                )
              })}
            </div>
          )}

          {type && form && (
            <>
              <div className="flex items-center gap-3 pt-1">
                <span className="w-8 h-8 rounded-full bg-[#0F1F19] text-white text-[13px] font-bold flex items-center justify-center">2</span>
                <div><p className="text-[16px] font-semibold">Template details</p><p className="text-[12px] text-slate-500">{meta?.needs ? `Needs: ${meta.needs}` : 'Meta reviews every template, usually within minutes'}</p></div>
              </div>
              {locked && <p className="text-[12px] bg-amber-50 text-amber-800 rounded-lg px-3 py-2">This template is {initial?.status.toLowerCase()} at Meta — a copy can be edited with "Duplicate" in the list.</p>}
              <fieldset disabled={locked} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="sm:col-span-1"><span className={label}>Template name *</span><input value={name} onChange={e => setName(e.target.value)} onBlur={() => setName(cleanName(name))} placeholder="my_template_name" className={field} /></label>
                  <label><span className={label}>Category</span>
                    <select value={category} onChange={e => setCategory(e.target.value as Category)} className={field}>
                      <option value="UTILITY">🔧 Utility</option><option value="MARKETING">📣 Marketing</option><option value="AUTHENTICATION">🔐 Authentication</option>
                    </select>
                  </label>
                  <label><span className={label}>Language</span>
                    <select value={language} onChange={e => setLanguage(e.target.value)} className={field}>{LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  </label>
                </div>

                {type !== 'carousel' && type !== 'call_permission' && (
                  <div>
                    <span className={label}>Header — format (optional)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {HEADER_OPTIONS.filter(o => type !== 'multi_product' || o.id === 'text').map(o => (
                        <button key={o.id} type="button" onClick={() => set({ header: { kind: o.id, text: form.header.text } })}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12.5px] font-semibold cursor-pointer ${form.header.kind === o.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-[#E2E5E0] text-slate-600 hover:bg-slate-50'}`}>
                          <o.icon size={13} />{o.label}
                        </button>
                      ))}
                    </div>
                    {form.header.kind === 'text' && <input value={form.header.text || ''} onChange={e => set({ header: { ...form.header, text: e.target.value.slice(0, 60) } })} placeholder="Header text (max 60), e.g. Hi {{1}} 👋" className={`${field} mt-2`} />}
                    {['image', 'video', 'document'].includes(form.header.kind) && (
                      <div className="mt-2"><SampleUpload fileName={form.header.fileName} accept={form.header.kind === 'image' ? 'image/jpeg,image/png' : form.header.kind === 'video' ? 'video/mp4' : 'application/pdf'} onDone={(handle, n) => set({ header: { ...form.header, handle, fileName: n } })} /><p className="text-[11px] text-slate-400 mt-1">Meta needs a sample to review; the real file is chosen when sending.</p></div>
                    )}
                  </div>
                )}

                {type === 'limited_time_offer' && <label className="block"><span className={label}>Offer text * (max 16)</span><input value={form.offerText || ''} onChange={e => set({ offerText: e.target.value.slice(0, 16) })} placeholder="Deep clean offer" className={field} /></label>}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`${label} mb-0`}>Body * <span className="font-normal text-slate-400">{form.body.length}/1024</span></span>
                    <span className="flex gap-0.5">
                      {[['*', Bold, 'Bold'], ['_', Italic, 'Italic'], ['~', Strikethrough, 'Strikethrough']].map(([m, Icon, t]) => (
                        <button key={t as string} type="button" onClick={() => wrap(m as string)} title={t as string} aria-label={t as string} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"><Icon size={14} /></button>
                      ))}
                      <button type="button" onClick={addVar} className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 text-[12px] font-semibold cursor-pointer"><Braces size={13} /> Add variable</button>
                    </span>
                  </div>
                  <textarea ref={bodyRef} value={form.body} onChange={e => set({ body: e.target.value.slice(0, 1024) })} rows={5} placeholder="Hi {{1}}, your cleaning is confirmed for {{2}}." className={field} />
                </div>

                {vars.length > 0 && (
                  <div className="space-y-1.5">
                    <span className={label}>Sample values (Meta needs them for review)</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {vars.map(v => <label key={v} className="flex items-center gap-2"><span className="w-12 text-[12px] font-mono text-slate-500">{`{{${v}}}`}</span><input value={form.examples[v] || ''} onChange={e => set({ examples: { ...form.examples, [v]: e.target.value } })} placeholder="e.g. Sara" className={field} /></label>)}
                    </div>
                  </div>
                )}

                {type !== 'limited_time_offer' && type !== 'carousel' && <label className="block"><span className={label}>Footer (optional, max 60)</span><input value={form.footer} onChange={e => set({ footer: e.target.value.slice(0, 60) })} placeholder="Optional footer text (max 60)" className={field} /></label>}

                {type === 'flows' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label><span className={label}>Flow ID *</span><input value={form.flowId || ''} onChange={e => set({ flowId: e.target.value.replace(/\D/g, '') })} placeholder="From Meta → WhatsApp Manager → Flows" className={field} /></label>
                    <label><span className={label}>Button text</span><input value={form.flowButton || ''} onChange={e => set({ flowButton: e.target.value.slice(0, 25) })} className={field} /></label>
                  </div>
                )}
                {(type === 'catalog' || type === 'multi_product') && <label className="block"><span className={label}>Button text</span><input value={form.catalogButton || ''} onChange={e => set({ catalogButton: e.target.value.slice(0, 25) })} className={field} /></label>}

                {type === 'carousel' && (
                  <div className="space-y-2">
                    <span className={label}>Cards (2–10)</span>
                    {(form.cards || []).map((c, i) => {
                      const setCard = (p: Partial<TCard>) => set({ cards: (form.cards || []).map((x, j) => (j === i ? { ...x, ...p } : x)) })
                      return (
                        <div key={i} className="border border-[#ECEEEC] rounded-xl p-3 space-y-2 bg-[#FBFCFB]">
                          <div className="flex items-center justify-between"><p className="text-[12.5px] font-bold">Card {i + 1}</p><button type="button" onClick={() => set({ cards: (form.cards || []).filter((_, j) => j !== i) })} className="p-1.5 text-red-600 cursor-pointer" aria-label="Remove card"><Trash2 size={13} /></button></div>
                          <SampleUpload fileName={c.fileName} accept="image/jpeg,image/png" onDone={(handle, n) => setCard({ handle, fileName: n })} />
                          <textarea value={c.body} onChange={e => setCard({ body: e.target.value.slice(0, 160) })} rows={2} placeholder="Card text (max 160)" className={field} />
                          <ButtonsEditor buttons={c.buttons} onChange={b => setCard({ buttons: b })} allowed={['QUICK_REPLY', 'URL']} max={2} />
                        </div>
                      )
                    })}
                    {(form.cards || []).length < 10 && <button type="button" onClick={() => set({ cards: [...(form.cards || []), { body: '', buttons: [{ type: 'QUICK_REPLY', text: '' }] }] })} className="px-3 py-1.5 rounded-xl border border-dashed border-slate-300 text-[12.5px] font-semibold cursor-pointer flex items-center gap-1.5"><Plus size={13} /> Add card</button>}
                  </div>
                )}

                {!['carousel', 'catalog', 'multi_product', 'call_permission'].includes(type) && (
                  <div><span className={label}>Buttons (optional)</span><ButtonsEditor buttons={form.buttons} onChange={b => set({ buttons: b })} allowed={allowed} max={type === 'limited_time_offer' ? 2 : 10} /></div>
                )}
              </fieldset>

              {errors.length > 0 && (
                <ul className="text-[12px] text-amber-800 bg-amber-50 rounded-xl px-3.5 py-2.5 space-y-0.5">
                  {errors.map(e => <li key={e} className="flex items-start gap-1.5"><AlertCircle size={12} className="mt-0.5 shrink-0" />{e}</li>)}
                </ul>
              )}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-[#E2E5E0] text-[13px] font-semibold cursor-pointer">Cancel</button>
                {!locked && <button type="button" onClick={() => void save(false)} disabled={busy !== null} className="px-4 py-2 rounded-xl border border-[#0F1F19] text-[13px] font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5">{busy === 'draft' && <Loader2 size={14} className="animate-spin" />} Save draft</button>}
                {!locked && (
                  <button type="button" onClick={() => void save(true)} disabled={busy !== null || !canSubmit || errors.length > 0} title={canSubmit ? '' : 'Needs the Meta keys on the server — save a draft for now'}
                    className="px-4 py-2 rounded-xl bg-[#0F1F19] text-white text-[13px] font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5">{busy === 'submit' && <Loader2 size={14} className="animate-spin" />} Submit for review</button>
                )}
              </div>
            </>
          )}
        </div>

        {/* right: preview */}
        <aside className="hidden lg:flex flex-col border-l border-[#ECEEEC] bg-[#FAFBFA] max-h-[94vh]">
          <div className="h-14 px-5 flex items-center justify-between">
            <p className="text-[12px] font-bold tracking-[0.18em] text-slate-500">PREVIEW</p>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Close"><X size={17} /></button>
          </div>
          <div className="mx-5 mb-3 flex-1 min-h-[420px] rounded-2xl border border-[#ECE7DA] flex flex-col overflow-hidden" style={{ backgroundColor: '#F5F1E8', backgroundImage: 'radial-gradient(#D8D2C2 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
            <TemplatePreview type={type} form={form} />
          </div>
          <p className="px-5 pb-5 text-center text-[12px] text-slate-500">This needs to be approved by WhatsApp before sending.</p>
        </aside>
      </div>
    </div>
  )
}
