import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MessageSquareWarning, AlertTriangle, Clock, CheckCircle2, Timer, Search, Pencil, Trash2, Database, Loader2, Inbox, Plus, RotateCcw } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { KpiCard } from '@/components/ui/KpiCard'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { notify, confirmAsync } from '@/lib/notify'
import { formatDate } from '@/lib/utils'
import { fetchFluentFormLeads } from '@/lib/fluentFormsSync'
import { loadConversations } from '@/lib/whatsapp'
import { ghlConversations } from '@/lib/ghlInbox'
import { loadGhlTags } from '@/lib/inboxSettings'
import {
  COMPLAINT_CATEGORIES, COMPLAINT_SOURCES, COMPLAINT_STATUSES, complaintSummary, deleteComplaint, loadComplaints, looksLikeComplaint,
  nextComplaintRef, saveComplaint, type Complaint, type ComplaintSource, type ComplaintStatus,
} from '@/lib/complaints'

/** A message from a form or a chat that may be a complaint, not yet in the list */
interface Suggestion { source: ComplaintSource; source_ref: string; client_name: string; phone: string; description: string; at: string | null; why: string }

const card = 'bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]'
const PRIORITY_TONE: Record<Complaint['priority'], string> = { high: 'bg-rose-50 text-rose-700', medium: 'bg-amber-50 text-amber-700', low: 'bg-slate-100 text-slate-600' }
const sourceLabel = (s: string) => COMPLAINT_SOURCES.find(x => x.key === s)?.label || s

/**
 * R-CMP-01: Complaints — one list for complaints from Fluent Forms, Facebook / Instagram (GHL), WhatsApp, phone or
 * typed in, with status Open → In progress → Resolved → Closed, priority, assignee and resolution.
 * "To review" lists website messages with complaint words and chats tagged "Complaint", to add in one click.
 */
export function Complaints() {
  const { clients, employees } = useData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [list, setList] = useState<Complaint[] | null | 'loading'>('loading')
  const [suggestions, setSuggestions] = useState<Suggestion[] | 'loading'>('loading')
  const [status, setStatus] = useState<ComplaintStatus | 'all' | 'active'>('active')
  const [source, setSource] = useState<string>('all')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<Partial<Complaint> | null>(null)
  const by = user?.full_name || user?.email || 'Staff'

  const reload = () => loadComplaints().then(setList).catch(e => { notify.error((e as Error).message); setList([]) })
  useEffect(() => { void reload() }, [])

  // To review: website leads with complaint words, WhatsApp / Facebook / Instagram chats tagged "Complaint"
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [leads, wa, ghl, tags] = await Promise.all([
        fetchFluentFormLeads().catch(() => []), loadConversations().catch(() => null), ghlConversations().catch(() => []), loadGhlTags().catch(() => null),
      ])
      const out: Suggestion[] = []
      leads.forEach(l => {
        const text = [l.service, l.category, l.message].filter(Boolean).join(' · ')
        if (looksLikeComplaint(text) || /complain/i.test(l.form_title || '')) out.push({ source: 'fluent_forms', source_ref: l.id, client_name: l.client_name, phone: l.phone, description: l.message || text, at: l.created_at, why: 'Website form' })
      })
      ;(wa || []).forEach(c => { if ((c.tags || []).some(t => /complaint/i.test(t))) out.push({ source: 'whatsapp', source_ref: c.id, client_name: c.name || `+${c.wa_id}`, phone: `+${c.wa_id}`, description: c.last_message_preview || '', at: c.last_message_at, why: 'Chat tagged Complaint' }) })
      ghl.forEach(c => { if (((tags || {})[`ghl:${c.id}`] || []).some(t => /complaint/i.test(t))) out.push({ source: c.channel, source_ref: c.id, client_name: c.name, phone: '', description: c.preview, at: c.lastMessageAt, why: 'Chat tagged Complaint' }) })
      if (alive) setSuggestions(out)
    })()
    return () => { alive = false }
  }, [])

  // ?new=1&source=&ref=&name=&phone=&text= opens the form (from a lead or a chat)
  useEffect(() => {
    if (params.get('new') !== '1') return
    setForm({ source: (params.get('source') as ComplaintSource) || 'manual', source_ref: params.get('ref') || null, client_name: params.get('name') || '', phone: params.get('phone') || '', description: params.get('text') || '', priority: 'medium', status: 'open', category: 'Service quality' })
    setParams(p => { ['new', 'source', 'ref', 'name', 'phone', 'text'].forEach(k => p.delete(k)); return p }, { replace: true })
  }, [params, setParams])

  const rows = Array.isArray(list) ? list : []
  const sum = complaintSummary(rows)
  const known = new Set(rows.map(c => `${c.source}:${c.source_ref}`))
  const toReview = Array.isArray(suggestions) ? suggestions.filter(s => !known.has(`${s.source}:${s.source_ref}`)) : []
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter(c =>
      (status === 'all' || (status === 'active' ? c.status === 'open' || c.status === 'in_progress' : c.status === status)) &&
      (source === 'all' || c.source === source) &&
      (!s || [c.ref, c.client_name, c.phone, c.description, c.cleaner, c.category].some(v => String(v || '').toLowerCase().includes(s))))
  }, [rows, status, source, q])

  const submit = async () => {
    if (!form?.client_name?.trim()) return notify.error('Client name is required')
    if (!form.description?.trim()) return notify.error('Write what the complaint is about')
    const phoneDigits = String(form.phone || '').replace(/\D/g, '').slice(-8)
    const client = form.client_id ? null : clients.find(c => phoneDigits.length >= 7 && [c.phone, c.whatsapp].some(p => String(p || '').replace(/\D/g, '').endsWith(phoneDigits)))
    try {
      await saveComplaint({
        ...form, client_name: form.client_name.trim(), client_id: form.client_id || client?.id || null,
        ...(form.id ? {} : { ref: nextComplaintRef(rows.map(r => r.ref)), created_by: by }),
      })
      notify.success(form.id ? 'Complaint updated' : 'Complaint added'); setForm(null); void reload()
    } catch (e) { notify.error((e as Error).message) }
  }
  const quickStatus = async (c: Complaint, s: ComplaintStatus) => {
    if ((s === 'resolved' || s === 'closed') && !c.resolution) { setForm({ ...c, status: s }); return notify.info('Write how it was resolved, then save') }
    try { await saveComplaint({ ...c, status: s }); void reload() } catch (e) { notify.error((e as Error).message) }
  }

  const ready = list !== null
  return (
    <div className="space-y-6">
      <PageHero title="Complaints" subtitle={`${sum.open} open · ${sum.high} high priority · ${toReview.length} to review`} statusChip={sum.open > 0 ? `${sum.open} Open` : 'All Clear'} showSearch={false}
        actionLabel="New Complaint" onAction={() => ready ? setForm({ source: 'phone', priority: 'medium', status: 'open', category: 'Service quality' }) : notify.error('Run the database step first (see the note below)')} />

      {list === null && (
        <div className="bg-amber-50 border border-amber-200 rounded-[18px] px-4 py-3 text-[12.5px] text-amber-900 flex items-start gap-2">
          <Database size={15} className="mt-0.5 shrink-0" />
          <span>Complaints need the database step: run <code className="bg-white px-1 rounded">supabase/migrations/2026-11-09_marketing_complaints.sql</code> in Supabase → SQL editor.</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard label="Open" value={sum.open} sub="Open + in progress" icon={MessageSquareWarning} labelColor="text-rose-700" iconSolid="bg-[#e11d48] shadow-rose-500/25" active={status === 'active'} onClick={() => setStatus('active')} />
        <KpiCard label="High priority" value={sum.high} sub="Still open" icon={AlertTriangle} labelColor="text-amber-700" iconSolid="bg-[#d97706] shadow-amber-500/25" />
        <KpiCard label="Over 2 days" value={sum.overdue} sub="Open longer than 48 h" icon={Clock} labelColor="text-violet-700" iconSolid="bg-[#7c3aed] shadow-violet-500/25" chip={sum.overdue > 0 ? 'Follow up' : undefined} chipTone="down" />
        <KpiCard label="Resolved" value={sum.resolved} sub={`of ${sum.total} complaints`} icon={CheckCircle2} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" active={status === 'resolved'} onClick={() => setStatus('resolved')} />
        <KpiCard label="Avg. resolve time" value={sum.avgHours === null ? '—' : sum.avgHours < 48 ? `${sum.avgHours} h` : `${Math.round(sum.avgHours / 24)} d`} sub="From report to resolved" icon={Timer} labelColor="text-sky-700" iconSolid="bg-[#0284c7] shadow-sky-500/25" />
      </div>

      {toReview.length > 0 && ready && (
        <section className={`${card} overflow-hidden`}>
          <header className="px-5 py-3 border-b border-[#E4E8EC] flex items-center gap-2"><Inbox size={16} className="text-amber-600" /><p className="text-[14.5px] font-bold text-[#111827]">To review <span className="text-slate-400">· {toReview.length}</span></p><p className="text-[11.5px] text-slate-500 ml-2 hidden sm:block">Website messages with complaint words and chats tagged "Complaint"</p></header>
          <ul className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
            {toReview.slice(0, 50).map(s => (
              <li key={`${s.source}:${s.source_ref}`} className="px-5 py-2.5 flex items-center gap-3 text-[12.5px]">
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">{sourceLabel(s.source)}</span>
                <span className="font-semibold text-[#111827] shrink-0 max-w-[180px] truncate">{s.client_name}</span>
                <span className="text-slate-500 truncate flex-1">{s.description || s.why}</span>
                {s.at && <span className="text-[11px] text-slate-400 shrink-0">{formatDate(String(s.at).slice(0, 10))}</span>}
                <button type="button" onClick={() => setForm({ source: s.source, source_ref: s.source_ref, client_name: s.client_name, phone: s.phone, description: s.description, priority: 'medium', status: 'open', category: 'Service quality' })}
                  className="h-8 px-2.5 rounded-lg bg-rose-50 text-rose-700 text-[11.5px] font-bold inline-flex items-center gap-1 hover:bg-rose-100 cursor-pointer shrink-0"><Plus size={12} /> Add as complaint</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${card} overflow-hidden`}>
        <div className="p-3 flex items-center gap-2 flex-wrap lg:flex-nowrap border-b border-[#E4E8EC]">
          <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ref, client, phone, cleaner…" className="w-full h-10 pl-10 pr-3 text-[13px] rounded-xl border border-[#E4E8EC] bg-[#f8fafc] outline-none focus:border-emerald-400" /></div>
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)} aria-label="Status" className="h-10 px-3 text-[13px] rounded-xl border border-[#E4E8EC] bg-[#f8fafc] cursor-pointer">
            <option value="active">Open + in progress</option><option value="all">All statuses</option>
            {COMPLAINT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={source} onChange={e => setSource(e.target.value)} aria-label="Source" className="h-10 px-3 text-[13px] rounded-xl border border-[#E4E8EC] bg-[#f8fafc] cursor-pointer">
            <option value="all">All sources</option>
            {COMPLAINT_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button type="button" onClick={() => { setQ(''); setStatus('active'); setSource('all') }} title="Reset filters" className="h-10 px-3 rounded-xl border border-[#E4E8EC] text-[12.5px] font-bold text-slate-600 inline-flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"><RotateCcw size={14} /> Reset</button>
        </div>
        {list === 'loading' ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div> : (
          <table className="w-full text-[12.5px] table-fixed">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500"><tr>
              <th className="px-4 py-2.5 w-[92px]">Ref</th><th className="px-3 py-2.5 w-[18%]">Client</th><th className="px-3 py-2.5">Complaint</th><th className="px-3 py-2.5 w-[11%]">Source</th><th className="px-3 py-2.5 w-[9%]">Priority</th><th className="px-3 py-2.5 w-[13%]">Status</th><th className="px-3 py-2.5 w-[10%]">Date</th><th className="px-3 py-2.5 w-[72px]" />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shown.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-slate-400">{rows.length ? 'No complaints match.' : 'No complaints yet.'}</td></tr>}
              {shown.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 font-mono text-[11.5px] font-bold text-slate-600">{c.ref || '—'}</td>
                  <td className="px-3 py-3 truncate">{c.client_id ? <button type="button" onClick={() => navigate(`/clients/${c.client_id}`)} className="font-semibold text-[#111827] hover:underline cursor-pointer">{c.client_name}</button> : <span className="font-semibold">{c.client_name}</span>}{c.phone && <span className="block text-[11px] text-slate-400">{c.phone}</span>}</td>
                  <td className="px-3 py-3"><p className="text-[11px] font-bold text-slate-500">{c.category}{c.cleaner ? ` · ${c.cleaner}` : ''}{c.job_date ? ` · job ${formatDate(c.job_date)}` : ''}</p><p className="text-slate-700 line-clamp-2">{c.description}</p>{c.resolution && <p className="text-[11.5px] text-emerald-700 line-clamp-1">✓ {c.resolution}</p>}</td>
                  <td className="px-3 py-3 text-slate-600">{sourceLabel(c.source)}</td>
                  <td className="px-3 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${PRIORITY_TONE[c.priority]}`}>{c.priority}</span></td>
                  <td className="px-3 py-3">
                    <select value={c.status} onChange={e => void quickStatus(c, e.target.value as ComplaintStatus)} aria-label={`Status of ${c.ref}`} className={`text-[11px] font-bold px-2 py-1 rounded-full border cursor-pointer ${COMPLAINT_STATUSES.find(s => s.key === c.status)?.tone}`}>
                      {COMPLAINT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    {c.assigned_to && <span className="block text-[10.5px] text-slate-400 mt-0.5 truncate">→ {c.assigned_to}</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{formatDate(c.created_at.slice(0, 10))}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setForm(c)} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"><Pencil size={13} /></button>
                    <button type="button" onClick={async () => { if (await confirmAsync({ title: 'Delete complaint', message: `Delete ${c.ref || 'this complaint'}?`, confirmLabel: 'Delete', tone: 'danger' })) { await deleteComplaint(c.id).catch(e => notify.error((e as Error).message)); void reload() } }} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Complaint ${form.ref || ''}` : 'New complaint'} size="lg"
        footer={<div className="flex gap-2"><button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-xl border border-[#E2E5E0] text-[13px] font-semibold cursor-pointer">Cancel</button><button type="button" onClick={() => void submit()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-bold cursor-pointer">Save</button></div>}>
        {form && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Client name *" value={form.client_name || ''} onChange={e => setForm({ ...form, client_name: e.target.value })} list="complaint-clients" />
            <datalist id="complaint-clients">{clients.slice(0, 500).map(c => <option key={c.id} value={c.full_name} />)}</datalist>
            <Input label="Phone" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <Select label="Source" value={form.source || 'manual'} onChange={e => setForm({ ...form, source: e.target.value as ComplaintSource })}>
              {COMPLAINT_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
            <Select label="Category" value={form.category || 'Service quality'} onChange={e => setForm({ ...form, category: e.target.value })}>
              {COMPLAINT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <div className="col-span-2"><Textarea label="What happened *" rows={3} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <Input label="Job date" type="date" value={form.job_date || ''} onChange={e => setForm({ ...form, job_date: e.target.value || null })} />
            <Select label="Cleaner" value={form.cleaner || ''} onChange={e => setForm({ ...form, cleaner: e.target.value || null })}>
              <option value="">—</option>
              {employees.filter(e => e.status !== 'inactive').map(e => <option key={e.id} value={e.full_name}>{e.full_name}</option>)}
            </Select>
            <Select label="Priority" value={form.priority || 'medium'} onChange={e => setForm({ ...form, priority: e.target.value as Complaint['priority'] })}>
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </Select>
            <Select label="Status" value={form.status || 'open'} onChange={e => setForm({ ...form, status: e.target.value as ComplaintStatus })}>
              {COMPLAINT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
            <div className="col-span-2"><Input label="Assigned to" value={form.assigned_to || ''} onChange={e => setForm({ ...form, assigned_to: e.target.value || null })} placeholder="Who follows it up" /></div>
            <div className="col-span-2"><Textarea label="Resolution" rows={2} value={form.resolution || ''} onChange={e => setForm({ ...form, resolution: e.target.value || null })} placeholder="e.g. Re-clean done free on 12 Nov, client happy" /></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
