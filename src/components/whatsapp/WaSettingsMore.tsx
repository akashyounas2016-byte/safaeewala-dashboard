import { useEffect, useState } from 'react'
import { BellRing, Loader2, Plus, Tags as TagsIcon, Trash2, MessageSquareText, Power, Star } from 'lucide-react'
import { notify } from '@/lib/notify'
import { templateBody, templateParamCount, waTemplates, type WaTemplate } from '@/lib/whatsapp'
import {
  NOTIFY_KINDS, TAG_COLORS, TAG_TONE, TOKENS, isReviewLink, loadNotifications, loadReviewLink, saveReviewLink, loadQuickReplies, saveNotifications, saveQuickReplies,
  type NotificationSettings, type NotifyConfig, type QuickReply,
} from '@/lib/inboxSettings'
import { setTagDefs, useTagDefs } from './Tags'
import { btnGhost, btnPrimary, inputCls } from './WaShared'

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer shrink-0 ${on ? 'bg-emerald-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

/**
 * R-GHL-01: the Google review link. Pick {review_link} as a value of the Feedback request (or any) template and every
 * client gets the link to review Safaeewala on Google. Get it in Google Business Profile → "Ask for reviews".
 */
function ReviewLinkSetting() {
  const [url, setUrl] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  useEffect(() => { loadReviewLink().then(v => { const u = v?.url || ''; setUrl(u); setSaved(u) }).catch(() => setUrl('')) }, [])
  if (url === null) return null
  const ok = !url.trim() || isReviewLink(url)
  return (
    <article className="border border-amber-200 bg-amber-50/40 rounded-xl p-3 space-y-2">
      <p className="text-[13px] font-bold flex items-center gap-1.5"><Star size={14} className="text-amber-500 fill-amber-400" /> Google review link</p>
      <p className="text-[11.5px] text-slate-600">Google Business Profile → <b>Ask for reviews</b> → copy the link. Then choose <code className="bg-white px-1 rounded">{'{review_link}'}</code> as a value of the Feedback request template below.</p>
      <div className="flex gap-2">
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://g.page/r/…/review" className={`${inputCls} flex-1`} />
        <button type="button" disabled={url === saved || !ok} onClick={async () => { try { await saveReviewLink(url.trim()); setSaved(url.trim()); notify.success('Review link saved') } catch (e) { notify.error((e as Error).message) } }} className={btnPrimary}>Save</button>
        {saved && <a href={saved} target="_blank" rel="noreferrer" className={btnGhost}>Test</a>}
      </div>
      {!ok && <p className="text-[11.5px] text-red-600">This does not look like a Google review link (g.page/r/… or search.google.com/local/writereview…).</p>}
    </article>
  )
}

/**
 * R-WA-04: client notifications — a master switch (pauses every automatic message: notifications, welcome / away /
 * keyword / fallback replies and deal-stage rules) and one switch + template per notification.
 */
export function NotificationsSettings({ configured }: { configured: boolean }) {
  const [v, setV] = useState<NotificationSettings | null | undefined | 'loading'>('loading')
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null)
  useEffect(() => { loadNotifications().then(x => setV(x === null ? { master: true } : x)).catch(() => setV(undefined)) }, [])
  useEffect(() => { if (configured) void waTemplates().then(setTemplates).catch(() => setTemplates([])) }, [configured])
  if (v === 'loading') return <Loader2 className="animate-spin text-slate-300" />
  if (v === undefined || v === null) return <p className="text-[12.5px] text-slate-500">Needs the database step 2026-11-07_whatsapp_modules.sql.</p>

  const save = async (next: NotificationSettings) => {
    setV(next)
    try { await saveNotifications(next) } catch (e) { notify.error((e as Error).message) }
  }
  const setKind = (k: keyof NotificationSettings, patch: Partial<NotifyConfig>) => {
    const cur = (v[k] as NotifyConfig | undefined) || { enabled: false, template: '', language: 'en', params: NOTIFY_KINDS.find(x => x.key === k)?.params || [] }
    const next: NotifyConfig = { ...cur, ...patch }
    // a confirmation switched on only covers bookings made from now on
    if (k === 'confirm' && patch.enabled && !cur.enabled) next.since = new Date().toISOString()
    void save({ ...v, [k]: next })
  }

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-3 rounded-xl p-3 ${v.master === false ? 'bg-red-50' : 'bg-emerald-50'}`}>
        <Power size={17} className={v.master === false ? 'text-red-600' : 'text-emerald-600'} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold">{v.master === false ? 'All automatic messages are OFF' : 'Automatic messages are on'}</p>
          <p className="text-[11.5px] text-slate-600">Master switch: notifications below, welcome / away / keyword / fallback replies and deal-stage rules. Campaigns and replies you type are not affected.</p>
        </div>
        <Switch on={v.master !== false} onChange={on => void save({ ...v, master: on })} label="All automatic messages" />
      </div>
      {!configured && <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Choose templates once the Meta keys are on the server. The switches can be set already.</p>}
      <ReviewLinkSetting />

      {NOTIFY_KINDS.map(k => {
        const cfg = v[k.key] as NotifyConfig | undefined
        const tpl = templates?.find(t => t.name === cfg?.template && t.language === cfg?.language) || null
        return (
          <article key={k.key} className={`border rounded-xl p-3 space-y-2 ${cfg?.enabled && v.master !== false ? 'border-emerald-200' : 'border-[#E6E8E6]'}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[#111827]">{k.label}{!k.auto && <span className="ml-1.5 text-[10.5px] font-semibold text-slate-500 bg-slate-100 px-1.5 rounded">by hand</span>}</p>
                <p className="text-[11.5px] text-slate-500">{k.when}</p>
              </div>
              <Switch on={Boolean(cfg?.enabled)} onChange={on => setKind(k.key, { enabled: on })} label={`${k.label} on or off`} />
            </div>
            {cfg?.enabled && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <select value={cfg.template ? `${cfg.template}|${cfg.language}` : ''} disabled={!templates}
                    onChange={e => { const t = templates?.find(x => `${x.name}|${x.language}` === e.target.value); setKind(k.key, { template: t?.name || '', language: t?.language || 'en', params: t ? Array.from({ length: templateParamCount(t) }, (_, i) => k.params[i] || '{name}') : [] }) }}
                    className={`${inputCls} flex-1 min-w-[200px]`}>
                    <option value="">{templates ? 'Choose an approved template…' : 'Templates load once Meta is connected'}</option>
                    {(templates || []).map(t => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} · {t.language}</option>)}
                  </select>
                  {k.hour && <label className="flex items-center gap-1.5 text-[12px] text-slate-600">from <input type="time" value={cfg.hour || k.hour} onChange={e => setKind(k.key, { hour: e.target.value })} className={`${inputCls} w-28`} /></label>}
                </div>
                {tpl && cfg.params.map((p, i) => (
                  <label key={i} className="flex items-center gap-2 text-[12px]"><span className="w-12 text-slate-500">{`{{${i + 1}}}`}</span>
                    <select value={p} onChange={e => setKind(k.key, { params: cfg.params.map((x, j) => (j === i ? e.target.value : x)) })} className={`${inputCls} flex-1`}>
                      {TOKENS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                ))}
                {tpl && <div className="bg-[#F4F6F3] rounded-lg p-2.5 text-[12px] whitespace-pre-wrap">{templateBody(tpl, cfg.params)}</div>}
                {!cfg.template && <p className="text-[11.5px] text-amber-700">Nothing is sent until a template is chosen.</p>}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

/** R-INBOX-03: the tag list (names + colours) used on every chat */
export function TagsSettings() {
  const defs = useTagDefs()
  const [name, setName] = useState('')
  const [color, setColor] = useState('sky')
  const save = async (next: typeof defs) => { try { await setTagDefs(next) } catch (e) { notify.error((e as Error).message) } }
  const add = () => {
    const n = name.trim().replace(/\s+/g, ' ').slice(0, 30)
    if (!n || defs.some(d => d.name.toLowerCase() === n.toLowerCase())) return
    void save([...defs, { name: n, color }]); setName('')
  }
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {defs.map(d => (
          <li key={d.name} className={`flex items-center gap-1.5 border rounded-lg pl-2 pr-1 py-1 text-[12.5px] font-semibold ${TAG_TONE[d.color]}`}>
            <select value={d.color} onChange={e => void save(defs.map(x => (x.name === d.name ? { ...x, color: e.target.value } : x)))} aria-label={`${d.name} colour`} className="bg-transparent text-[11px] cursor-pointer">
              {TAG_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {d.name}
            <button type="button" onClick={() => { if (window.confirm(`Remove the tag "${d.name}" from the list? Chats keep it until you remove it there.`)) void save(defs.filter(x => x.name !== d.name)) }} className="p-0.5 opacity-60 hover:opacity-100 cursor-pointer" aria-label={`Delete ${d.name}`}><Trash2 size={12} /></button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 items-center">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="New tag, e.g. Monthly Contract" className={`${inputCls} w-60`} />
        <div className="flex gap-1">{TAG_COLORS.map(c => <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} className={`w-6 h-6 rounded-full border-2 cursor-pointer ${TAG_TONE[c]} ${color === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`} />)}</div>
        <button type="button" onClick={add} disabled={!name.trim()} className={btnPrimary}><Plus size={14} /> Add tag</button>
      </div>
    </div>
  )
}

/** R-INBOX-03: saved replies for the 📄 button of every chat (all platforms) */
export function QuickRepliesSettings() {
  const [list, setList] = useState<QuickReply[] | null | undefined | 'loading'>('loading')
  const [form, setForm] = useState({ title: '', text: '' })
  useEffect(() => { loadQuickReplies().then(x => setList(x || [])).catch(() => setList(undefined)) }, [])
  if (list === 'loading') return <Loader2 className="animate-spin text-slate-300" />
  if (list === undefined || list === null) return <p className="text-[12.5px] text-slate-500">Needs the database step 2026-11-07_whatsapp_modules.sql.</p>
  const save = async (next: QuickReply[]) => { setList(next); try { await saveQuickReplies(next) } catch (e) { notify.error((e as Error).message) } }
  return (
    <div className="space-y-3">
      {list.length === 0 ? <p className="text-[12.5px] text-slate-400">No saved replies yet — e.g. price list, areas we cover, what to prepare before the cleaners come.</p> : (
        <ul className="divide-y divide-slate-100 border border-[#ECEEEC] rounded-xl">
          {list.map((r, i) => (
            <li key={i} className="px-3 py-2 flex items-start gap-2">
              <MessageSquareText size={14} className="text-slate-400 mt-0.5" />
              <span className="flex-1 min-w-0"><span className="block text-[12.5px] font-semibold">{r.title}</span><span className="block text-[11.5px] text-slate-500 whitespace-pre-wrap line-clamp-3">{r.text}</span></span>
              <button type="button" onClick={() => void save(list.filter((_, j) => j !== i))} className="p-1 text-red-600 cursor-pointer" aria-label={`Delete ${r.title}`}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Title, e.g. Price list" className={inputCls} />
      <textarea value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} rows={3} placeholder="The reply text" className={inputCls} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setForm({ title: '', text: '' })} className={btnGhost}>Clear</button>
        <button type="button" onClick={() => { if (form.title.trim() && form.text.trim()) { void save([...list, { title: form.title.trim(), text: form.text.trim() }]); setForm({ title: '', text: '' }) } }} disabled={!form.title.trim() || !form.text.trim()} className={btnPrimary}><Plus size={14} /> Save reply</button>
      </div>
    </div>
  )
}

export const SettingsIcons = { BellRing, TagsIcon, MessageSquareText }
