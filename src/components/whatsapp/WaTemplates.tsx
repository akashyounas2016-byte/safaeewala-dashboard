import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, Star, Pencil, Copy, Trash2, Loader2, Filter, FileText } from 'lucide-react'
import { notify } from '@/lib/notify'
import { waDeleteTemplate, waTemplatesAll } from '@/lib/whatsappModules'
import {
  STATUS_TABS, TEMPLATE_TYPES, deleteTemplateRow, formFromMeta, loadTemplates, saveTemplate, typeMeta, type Category, type WaTemplateRow,
} from '@/lib/templateBuilder'
import { TemplateBuilder } from './TemplateBuilder'
import { MigrationNote } from './WaShared'

const TONE: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700', PENDING: 'bg-amber-50 text-amber-700', REJECTED: 'bg-red-50 text-red-600', DRAFT: 'bg-slate-100 text-slate-600',
  PAUSED: 'bg-sky-50 text-sky-700', DISABLED: 'bg-slate-100 text-slate-500', PENDING_DELETION: 'bg-rose-50 text-rose-600',
}
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' })

/**
 * R-WA-05: All Templates — made here with the template builder (drafts work without Meta) or imported from Meta.
 * Refresh brings Meta's review results in (and templates made in Meta). Drafts are submitted from the builder.
 */
export function WaTemplates({ canSend }: { canSend: boolean }) {
  const [rows, setRows] = useState<WaTemplateRow[] | null | 'loading'>('loading')
  const [tab, setTab] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('all')
  const [type, setType] = useState('all')
  const [sort, setSort] = useState('updated')
  const [builder, setBuilder] = useState<{ row: WaTemplateRow | null } | null>(null)
  const [syncing, setSyncing] = useState(false)

  const reload = useCallback(() => loadTemplates().then(setRows).catch(e => { notify.error((e as Error).message); setRows([]) }), [])
  useEffect(() => { void reload() }, [reload])

  /** Meta's statuses → our rows; templates made in Meta are added to the list */
  const sync = useCallback(async (quiet = false) => {
    if (!canSend) { if (!quiet) notify.error('Refresh reads Meta — it works once the Meta keys are on the server'); return }
    const local = await loadTemplates()
    if (local === null) return
    setSyncing(true)
    try {
      const meta = await waTemplatesAll()
      let added = 0; let changed = 0
      for (const m of meta) {
        const mine = local.find(r => r.name === m.name && r.language === m.language)
        if (mine) {
          if (mine.status !== m.status || (mine.rejected_reason || null) !== (m.rejected_reason || null)) {
            await saveTemplate({ id: mine.id, name: mine.name, language: mine.language, category: mine.category, type: mine.type, form: mine.form, status: m.status, rejected_reason: m.rejected_reason && m.rejected_reason !== 'NONE' ? m.rejected_reason : null }); changed++
          }
        } else {
          await saveTemplate({ name: m.name, language: m.language, category: (m.category as Category) || 'UTILITY', type: 'custom_message', form: formFromMeta(m), status: m.status, created_by: 'Meta' }); added++
        }
      }
      if (!quiet) notify.success(added || changed ? `Updated from Meta: ${changed} changed, ${added} added` : 'Up to date with Meta')
      await reload()
    } catch (e) { if (!quiet) notify.error((e as Error).message) } finally { setSyncing(false) }
  }, [canSend, reload])
  useEffect(() => { void sync(true) }, [sync])

  const list = useMemo(() => {
    if (!Array.isArray(rows)) return [] as WaTemplateRow[]
    const qy = search.trim().toLowerCase()
    return rows
      .filter(r => (tab === 'all' || (tab === 'favorites' ? r.favorite : r.status === tab)) && (cat === 'all' || r.category === cat) && (type === 'all' || r.type === type)
        && (!qy || `${r.name} ${r.form?.body || ''}`.toLowerCase().includes(qy)))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at)))
  }, [rows, tab, cat, type, search, sort])
  const count = (id: string) => (Array.isArray(rows) ? rows.filter(r => (id === 'all' ? true : id === 'favorites' ? r.favorite : r.status === id)).length : 0)

  const fav = async (r: WaTemplateRow) => { try { await saveTemplate({ ...r, favorite: !r.favorite }); void reload() } catch (e) { notify.error((e as Error).message) } }
  const duplicate = async (r: WaTemplateRow) => {
    try { await saveTemplate({ name: `${r.name}_copy`.slice(0, 500), language: r.language, category: r.category, type: r.type, form: r.form, status: 'DRAFT', created_by: 'Copy' }); notify.success('Copied as a draft'); void reload() }
    catch (e) { notify.error((e as Error).message) }
  }
  const remove = async (r: WaTemplateRow) => {
    const atMeta = r.status !== 'DRAFT'
    if (!window.confirm(atMeta ? `Delete "${r.name}" here and at Meta (all its languages)?` : `Delete the draft "${r.name}"?`)) return
    try {
      if (atMeta) { if (!canSend) throw new Error('Deleting at Meta needs the Meta keys on the server'); await waDeleteTemplate(r.name) }
      await deleteTemplateRow(r.id); void reload()
    } catch (e) { notify.error((e as Error).message) }
  }

  if (rows === 'loading') return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-300" /></div>
  const noTable = rows === null // never block: the screen and the builder open; saving needs the database step

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="text-[22px] font-bold text-[#111827]">All Templates</h2>
          <p className="text-[13px] text-slate-500">View, search and manage all your WhatsApp message templates</p>
        </div>
        <button type="button" onClick={() => void sync()} disabled={syncing} title={canSend ? 'Get review results from Meta' : 'Works once Meta is connected'} className="h-10 w-10 rounded-xl border border-[#E2E5E0] bg-white flex items-center justify-center hover:bg-slate-50 cursor-pointer disabled:opacity-50" aria-label="Refresh from Meta">
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
        </button>
        <button type="button" onClick={() => setBuilder({ row: null })} className="h-10 px-4 rounded-xl bg-[#0F1F19] text-white text-[13px] font-bold flex items-center gap-1.5 cursor-pointer hover:bg-[#1c3a2f]"><Plus size={15} /> New Template</button>
      </div>

      {noTable && <MigrationNote file="2026-11-07_wa_templates.sql" />}
      <div className="flex gap-2 overflow-x-auto pb-1 border-b border-[#ECEEEC]">
        {STATUS_TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`px-3.5 py-1.5 mb-2 rounded-full border text-[12.5px] whitespace-nowrap cursor-pointer ${tab === t.id ? 'border-[#0F1F19] bg-white font-bold text-[#0F1F19]' : 'border-[#E6E8E6] text-slate-500 hover:text-slate-800'}`}>
            {t.label}{count(t.id) > 0 && <span className="ml-1 text-slate-400">{count(t.id)}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 bg-white border border-[#E6E8E6] rounded-xl px-3 h-10 flex-1 min-w-[220px]"><Search size={15} className="text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..." className="flex-1 outline-none text-[13px] bg-transparent" /></div>
        <select value={cat} onChange={e => setCat(e.target.value)} className="h-10 rounded-xl border border-[#E6E8E6] bg-white px-3 text-[13px]" aria-label="Category"><option value="all">All Categories</option><option value="UTILITY">Utility</option><option value="MARKETING">Marketing</option><option value="AUTHENTICATION">Authentication</option></select>
        <select value={type} onChange={e => setType(e.target.value)} className="h-10 rounded-xl border border-[#E6E8E6] bg-white px-3 text-[13px]" aria-label="Type"><option value="all">All Types</option>{TEMPLATE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        <label className="h-10 rounded-xl border border-[#E6E8E6] bg-white pl-3 flex items-center gap-1.5 text-[12.5px] text-slate-600"><Filter size={14} />
          <select value={sort} onChange={e => setSort(e.target.value)} className="h-full pr-2 bg-transparent outline-none" aria-label="Sort"><option value="updated">Last updated</option><option value="created">Newest first</option><option value="name">Name A–Z</option></select>
        </label>
      </div>

      <div className="bg-white border border-[#E6E8E6] rounded-[16px] overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[860px]">
          <thead className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-[#FAFBFA] border-b border-[#ECEEEC]">
            <tr>{['', 'Template name', 'Category', 'Language', 'Status', 'Type', 'Created', 'Updated', 'Actions'].map((h, i) => <th key={i} className={`px-4 py-3 font-semibold ${h === 'Actions' ? 'text-right' : ''}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 && (
              <tr><td colSpan={9} className="py-14 text-center">
                <span className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3"><FileText size={22} /></span>
                <p className="text-[13.5px] text-slate-500 mb-3">{(rows || []).length ? 'No templates match.' : 'No templates yet'}</p>
                {!(rows || []).length && <button type="button" onClick={() => setBuilder({ row: null })} className="mx-auto h-10 px-4 rounded-xl bg-[#0F1F19] text-white text-[13px] font-bold flex items-center gap-1.5 cursor-pointer"><Plus size={15} /> Create your first template</button>}
              </td></tr>
            )}
            {list.map(r => (
              <tr key={r.id} className="hover:bg-[#FAFBFA]">
                <td className="pl-4 py-3 w-8"><button type="button" onClick={() => void fav(r)} aria-label={r.favorite ? 'Unfavourite' : 'Favourite'} className="cursor-pointer"><Star size={15} className={r.favorite ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-400'} /></button></td>
                <td className="px-4 py-3"><button type="button" onClick={() => setBuilder({ row: r })} className="font-semibold text-[#111827] hover:underline cursor-pointer text-left">{r.name}</button><p className="text-[11px] text-slate-400 truncate max-w-[260px]">{r.form?.body}</p>{r.status === 'REJECTED' && r.rejected_reason && <p className="text-[11px] text-red-600">Reason: {r.rejected_reason}</p>}</td>
                <td className="px-4 py-3 capitalize">{r.category.toLowerCase()}</td>
                <td className="px-4 py-3">{r.language}</td>
                <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${TONE[r.status] || TONE.DRAFT}`}>{r.status.toLowerCase().replace('_', ' ')}</span></td>
                <td className="px-4 py-3">{typeMeta(r.type).label}</td>
                <td className="px-4 py-3 whitespace-nowrap">{day(r.created_at)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{day(r.updated_at)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" onClick={() => setBuilder({ row: r })} title={r.status === 'DRAFT' || r.status === 'REJECTED' ? 'Edit / submit' : 'View'} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"><Pencil size={14} /></button>
                  <button type="button" onClick={() => void duplicate(r)} title="Duplicate as a draft" className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"><Copy size={14} /></button>
                  <button type="button" onClick={() => void remove(r)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!canSend && <p className="text-[12px] text-slate-500">Templates can be made and saved as drafts now. "Submit for review" and Refresh start once the Meta keys are on the server.</p>}
      {builder && <TemplateBuilder initial={builder.row} canSubmit={canSend} onClose={() => setBuilder(null)} onSaved={() => { setBuilder(null); void reload() }} />}
    </div>
  )
}
