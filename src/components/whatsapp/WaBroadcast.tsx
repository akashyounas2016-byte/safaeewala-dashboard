import { useCallback, useEffect, useMemo, useState } from 'react'
import { Megaphone, Plus, Loader2, Users, CheckCircle2, XCircle, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import { notify } from '@/lib/notify'
import { templateBody, templateParamCount, waTemplates, type WaTemplate } from '@/lib/whatsapp'
import { clientAudience, loadBroadcasts, parseRecipients, waBroadcast, type WaBroadcast as Broadcast } from '@/lib/whatsappModules'
import { MigrationNote, btnGhost, btnPrimary, inputCls } from './WaShared'
import { timeOf } from './WaChat'

/**
 * R-WA-02 Broadcast: one approved template to many numbers. Meta allows only templates for this, charges per message,
 * and the people must have agreed to get WhatsApp messages from Safaeewala.
 */
export function WaBroadcast({ canSend }: { canSend: boolean }) {
  const { clients } = useData()
  const [list, setList] = useState<Broadcast[] | null | 'loading'>('loading')
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null)
  const [tpl, setTpl] = useState<WaTemplate | null>(null)
  const [params, setParams] = useState<string[]>([])
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'all' | 'general' | 'monthly' | 'biweekly'>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [pasted, setPasted] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => loadBroadcasts().then(setList).catch(e => { notify.error((e as Error).message); setList([]) }), [])
  useEffect(() => { void refresh() }, [refresh])
  // progress of a broadcast that is still sending
  useEffect(() => {
    if (!Array.isArray(list) || !list.some(b => b.status === 'sending')) return
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [list, refresh])

  const audience = useMemo(() => clientAudience(clients), [clients])
  const shown = audience.filter(a => (mode === 'all' || a.mode === mode) && (!search.trim() || a.name.toLowerCase().includes(search.trim().toLowerCase()) || a.to.includes(search.replace(/\D/g, '') || '§')))
  const extra = parseRecipients(pasted)
  const recipients = [...audience.filter(a => picked.has(a.to)).map(a => ({ to: a.to, name: a.name })), ...extra]

  const start = async () => {
    setOpen(true); setTpl(null); setPicked(new Set()); setPasted(''); setConsent(false); setName('')
    if (templates === null) setTemplates(await waTemplates().catch(e => { notify.error((e as Error).message); return [] }))
  }
  const send = async () => {
    if (!tpl) return
    setBusy(true)
    try {
      const r = await waBroadcast({ name: name.trim(), templateName: tpl.name, language: tpl.language, params, preview: templateBody(tpl, params), recipients })
      notify.success(`Sending to ${r.total} numbers — progress shows below`)
      setOpen(false); void refresh()
    } catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }

  if (list === 'loading') return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div>
  if (list === null) return <MigrationNote />

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 flex flex-wrap items-center gap-4">
        <span className="w-11 h-11 rounded-2xl bg-[#059669] text-white flex items-center justify-center"><Megaphone size={20} /></span>
        <div className="flex-1 min-w-[220px]">
          <p className="text-[15px] font-bold text-[#111827]">Send one approved template to many clients</p>
          <p className="text-[12px] text-slate-500">Offers, reminders, holiday timings. Only to people who agreed to get WhatsApp messages; Meta charges each message.</p>
        </div>
        <button type="button" onClick={() => void start()} disabled={!canSend} title={canSend ? '' : 'Needs the Meta keys on the server'} className={btnPrimary}><Plus size={14} /> New broadcast</button>
      </div>

      <section className="bg-white border border-[#E2E5E0] rounded-[22px] overflow-hidden">
        <header className="px-5 py-3.5 border-b border-[#E2E5E0] text-[14px] font-bold text-[#111827]">Sent broadcasts</header>
        {list.length === 0 ? <p className="p-6 text-center text-[12.5px] text-slate-400">No broadcasts yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {list.map(b => (
              <li key={b.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#111827]">{b.name}</p>
                  <p className="text-[11.5px] text-slate-500">{b.template_name} · {timeOf(b.created_at)} · by {b.created_by || '—'}</p>
                </div>
                <span className="text-[12px] font-semibold text-slate-600 flex items-center gap-1"><Users size={13} />{b.total}</span>
                <span className="text-[12px] font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={13} />{b.sent}</span>
                <span className="text-[12px] font-semibold text-red-600 flex items-center gap-1"><XCircle size={13} />{b.failed}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${b.status === 'sending' ? 'bg-sky-50 text-sky-700' : b.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {b.status === 'sending' ? `Sending ${b.sent + b.failed}/${b.total}` : b.status === 'done' ? 'Done' : 'Failed'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="New broadcast" size="lg">
        {templates === null ? <div className="py-8 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div> : (
          <div className="space-y-4">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name, e.g. Eid offer 2026" className={inputCls} />
            <div>
              <p className="text-[12px] font-bold text-slate-600 mb-1.5">1 · Template</p>
              {templates.length === 0 ? <p className="text-[12.5px] text-slate-500">No approved templates — create one in the Templates tab first.</p> : (
                <select value={tpl ? `${tpl.name}|${tpl.language}` : ''} onChange={e => { const t = templates.find(x => `${x.name}|${x.language}` === e.target.value) || null; setTpl(t); setParams(t ? Array(templateParamCount(t)).fill('') : []) }} className={inputCls}>
                  <option value="">Choose…</option>
                  {templates.map(t => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} · {t.language} · {t.category.toLowerCase()}</option>)}
                </select>
              )}
              {tpl && (
                <div className="mt-2 space-y-2">
                  {params.map((v, i) => <input key={i} value={v} onChange={e => setParams(p => p.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Value for {{${i + 1}}} — {name} = each client's name`} className={inputCls} />)}
                  <div className="bg-[#F4F6F3] rounded-xl p-3 text-[12.5px] whitespace-pre-wrap">{templateBody(tpl, params)}</div>
                </div>
              )}
            </div>
            <div>
              <p className="text-[12px] font-bold text-slate-600 mb-1.5">2 · Who gets it <span className="font-semibold text-slate-400">({recipients.length} selected)</span></p>
              <div className="flex flex-wrap gap-2 mb-2">
                {(['all', 'general', 'monthly', 'biweekly'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={`px-3 py-1 rounded-full text-[12px] font-bold border cursor-pointer ${mode === m ? 'bg-emerald-600 text-white border-emerald-600' : 'border-[#E2E5E0] text-slate-600'}`}>{m === 'all' ? 'All clients' : m === 'general' ? 'One-time' : m === 'monthly' ? 'Monthly' : 'Bi-weekly'}</button>
                ))}
                <button type="button" onClick={() => setPicked(p => new Set([...p, ...shown.map(a => a.to)]))} className={btnGhost}>Select shown</button>
                <button type="button" onClick={() => setPicked(new Set())} className={btnGhost}>Clear</button>
              </div>
              <div className="flex items-center gap-2 border border-[#E2E5E0] rounded-xl px-3 h-9 mb-2"><Search size={13} className="text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients" className="flex-1 outline-none text-[13px]" /></div>
              <ul className="max-h-52 overflow-y-auto border border-[#E2E5E0] rounded-xl divide-y divide-slate-100">
                {shown.length === 0 && <li className="p-3 text-[12px] text-slate-400 text-center">No clients with a phone number here.</li>}
                {shown.map(a => (
                  <li key={a.to}>
                    <label className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={picked.has(a.to)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(a.to); else n.delete(a.to); return n })} />
                      <span className="flex-1 truncate font-semibold">{a.name}</span><span className="text-slate-400">+{a.to}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={3} placeholder={'Or paste numbers, one per line (optional ", name")\n0501234567, Sara'} className={`${inputCls} mt-2`} />
            </div>
            <label className="flex items-start gap-2 text-[12.5px] text-slate-700 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" />
              These people agreed to get WhatsApp messages from Safaeewala. (Messages to people who did not can get the number blocked by Meta.)
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
              <button type="button" onClick={() => void send()} disabled={busy || !tpl || !recipients.length || !consent || params.some(p => !p.trim())} className={btnPrimary}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} Send to {recipients.length}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
