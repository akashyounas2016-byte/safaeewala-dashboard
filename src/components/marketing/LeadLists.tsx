import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, ListPlus, Loader2, Search, Wand2, X, MessageCircle, RotateCcw } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { notify } from '@/lib/notify'
import { todayDubai } from '@/lib/dubaiTime'
import { fetchFluentFormLeads } from '@/lib/fluentFormsSync'
import { loadConversations } from '@/lib/whatsapp'
import { createList } from '@/lib/whatsappCrm'
import { dedupeContacts, extractContacts, filterPool, normalizePhone, SOURCE_LABEL, type ContactSource, type PoolContact, type PoolFilter } from '@/lib/leadLists'

const card = 'bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]'
const SOURCES: ContactSource[] = ['website', 'whatsapp', 'client', 'pasted']

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = name
  a.click()
}

/**
 * R-MKT-02: Lead lists — every contact the CRM knows (website leads, WhatsApp chats, clients) plus contacts pulled out
 * of pasted text (emails, notes, exports). Filter by source, date, lead status, text and phone / email, then save the
 * selection as a contact list (used by Conversations → Broadcasts) or download it.
 */
export function LeadLists() {
  const { clients } = useData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [base, setBase] = useState<PoolContact[] | null>(null)
  const [pasted, setPasted] = useState<PoolContact[]>([])
  const [paste, setPaste] = useState('')
  const [f, setF] = useState<PoolFilter>({ sources: [...SOURCES], need: 'phone', excludeClients: false, status: 'all' })
  const [off, setOff] = useState<Set<string>>(new Set())
  const [listName, setListName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [leads, wa] = await Promise.all([fetchFluentFormLeads().catch(() => []), loadConversations().catch(() => null)])
      const clientPhones = new Set(clients.flatMap(c => [normalizePhone(c.phone), normalizePhone(c.whatsapp)]).filter(Boolean))
      const all: PoolContact[] = [
        ...leads.map(l => ({ key: `lead:${l.id}`, name: l.client_name || '', phone: normalizePhone(l.phone), email: String(l.email || '').toLowerCase(), source: 'website' as const, date: String(l.created_at || '').slice(0, 10), service: l.service, area: l.area, status: l.status })),
        ...(wa || []).map(c => ({ key: `wa:${c.id}`, name: c.name || '', phone: normalizePhone(c.wa_id), email: '', source: 'whatsapp' as const, date: String(c.last_message_at || '').slice(0, 10) })),
        ...clients.map(c => ({ key: `client:${c.id}`, name: c.full_name, phone: normalizePhone(c.whatsapp || c.phone), email: String(c.email || '').toLowerCase(), source: 'client' as const, date: String(c.last_service || c.created_at || '').slice(0, 10), area: c.area, isClient: true })),
      ]
      const pool = all.map(p => ({ ...p, isClient: p.isClient || (!!p.phone && clientPhones.has(p.phone)) }))
      if (alive) setBase(pool)
    })()
    return () => { alive = false }
  }, [clients])

  const pool = useMemo(() => dedupeContacts([...(base || []), ...pasted]), [base, pasted])
  const shown = useMemo(() => filterPool(pool, f), [pool, f])
  const picked = shown.filter(c => !off.has(c.key))
  const counts = useMemo(() => Object.fromEntries(SOURCES.map(s => [s, pool.filter(p => p.source === s).length])) as Record<ContactSource, number>, [pool])

  const extract = () => {
    const found = extractContacts(paste, todayDubai())
    if (!found.length) return notify.error('No phone number or email found in the text')
    setPasted(p => [...p, ...found])
    setPaste('')
    notify.success(`${found.length} contact${found.length === 1 ? '' : 's'} extracted`)
  }
  const save = async () => {
    const members = picked.filter(c => c.phone).map(c => ({ wa_id: c.phone, name: c.name || null }))
    if (!listName.trim()) return notify.error('Give the list a name')
    if (!members.length) return notify.error('No contact with a phone number is selected')
    setSaving(true)
    try {
      await createList(listName.trim(), ['marketing'], members, user?.full_name || user?.email || 'Staff')
      notify.success(`List "${listName.trim()}" saved with ${members.length} numbers — use it in Conversations → Broadcasts`)
      setListName('')
    } catch (e) { notify.error(/wa_contact_lists|schema cache/i.test((e as Error).message) ? 'Contact lists need the database step 2026-11-07_whatsapp_crm_more.sql' : (e as Error).message) }
    finally { setSaving(false) }
  }
  const set = (p: Partial<PoolFilter>) => { setF(x => ({ ...x, ...p })); setOff(new Set()) }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5 items-start">
      <div className="space-y-4">
        <section className={`${card} p-4 space-y-3`}>
          <p className="text-[14px] font-bold text-[#111827] flex items-center gap-2"><Wand2 size={15} className="text-violet-600" /> Extract from text</p>
          <p className="text-[11.5px] text-slate-500">Paste emails, enquiries or any list — names, phone numbers and emails are pulled out.</p>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5} placeholder={'From: Sara Khan <sara@mail.com>\nPhone: 050 123 4567'} className="w-full rounded-xl border border-[#E4E8EC] bg-[#f8fafc] px-3 py-2 text-[12.5px] outline-none focus:border-emerald-400" />
          <div className="flex gap-2">
            <button type="button" onClick={extract} disabled={!paste.trim()} className="h-9 px-3 rounded-xl bg-violet-600 text-white text-[12.5px] font-bold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"><Wand2 size={13} /> Extract</button>
            {pasted.length > 0 && <button type="button" onClick={() => setPasted([])} className="h-9 px-3 rounded-xl border border-[#E4E8EC] text-[12.5px] font-semibold flex items-center gap-1 cursor-pointer"><X size={13} /> Clear {pasted.length} extracted</button>}
          </div>
        </section>

        <section className={`${card} p-4 space-y-3 text-[12.5px]`}>
          <div className="flex items-center justify-between"><p className="text-[14px] font-bold text-[#111827]">Filters</p>
            <button type="button" onClick={() => set({ sources: [...SOURCES], need: 'phone', excludeClients: false, status: 'all', from: '', to: '', text: '' })} className="text-[11.5px] font-bold text-slate-500 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"><RotateCcw size={12} /> Reset</button></div>
          <div className="space-y-1.5">
            {SOURCES.map(s => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={f.sources.includes(s)} onChange={e => set({ sources: e.target.checked ? [...f.sources, s] : f.sources.filter(x => x !== s) })} />
                <span className="flex-1">{SOURCE_LABEL[s]}</span><span className="text-slate-400">{counts[s] || 0}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-slate-500">From<input type="date" value={f.from || ''} onChange={e => set({ from: e.target.value })} className="mt-1 w-full h-9 rounded-lg border border-[#E4E8EC] px-2 text-[12px]" /></label>
            <label className="text-[11px] font-bold text-slate-500">To<input type="date" value={f.to || ''} onChange={e => set({ to: e.target.value })} className="mt-1 w-full h-9 rounded-lg border border-[#E4E8EC] px-2 text-[12px]" /></label>
          </div>
          <select value={f.status || 'all'} onChange={e => set({ status: e.target.value })} className="w-full h-9 rounded-lg border border-[#E4E8EC] px-2" aria-label="Lead status">
            <option value="all">Any lead status</option>{['new', 'contacted', 'quoted', 'converted', 'lost'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)} (website leads)</option>)}
          </select>
          <select value={f.need} onChange={e => set({ need: e.target.value as PoolFilter['need'] })} className="w-full h-9 rounded-lg border border-[#E4E8EC] px-2" aria-label="Must have">
            <option value="phone">Has a phone number</option><option value="email">Has an email</option><option value="any">Phone or email</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f.excludeClients} onChange={e => set({ excludeClients: e.target.checked })} /> Leave out existing clients</label>
        </section>
      </div>

      <section className={`${card} overflow-hidden`}>
        <header className="px-5 py-3 border-b border-[#E4E8EC] flex items-center gap-2 flex-wrap">
          <p className="text-[15px] font-bold text-[#111827] mr-auto">{picked.length} of {shown.length} contacts selected</p>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={f.text || ''} onChange={e => set({ text: e.target.value })} placeholder="Name, number, service, area…" className="h-9 pl-8 pr-3 w-52 rounded-xl border border-[#E4E8EC] bg-[#f8fafc] text-[12.5px] outline-none focus:border-emerald-400" /></div>
          <button type="button" onClick={() => downloadCsv(`lead-list-${todayDubai()}.csv`, [['Name', 'Phone', 'Email', 'Source', 'Date', 'Service', 'Area', 'Status'], ...picked.map(c => [c.name, c.phone ? `+${c.phone}` : '', c.email, SOURCE_LABEL[c.source], c.date, c.service || '', c.area || '', c.status || ''])])} disabled={!picked.length}
            className="h-9 px-3 rounded-xl border border-[#E4E8EC] text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"><Download size={13} /> CSV</button>
          <input value={listName} onChange={e => setListName(e.target.value)} placeholder="List name, e.g. Website leads Nov" className="h-9 px-3 w-56 rounded-xl border border-[#E4E8EC] text-[12.5px] outline-none focus:border-emerald-400" />
          <button type="button" onClick={() => void save()} disabled={saving || !picked.length} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-[12.5px] font-bold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer">{saving ? <Loader2 size={13} className="animate-spin" /> : <ListPlus size={13} />} Save list</button>
          <button type="button" onClick={() => navigate('/whatsapp-crm?tab=broadcast')} title="Send to a saved list" className="h-9 w-9 rounded-xl border border-[#E4E8EC] flex items-center justify-center text-emerald-700 hover:bg-emerald-50 cursor-pointer"><MessageCircle size={14} /></button>
        </header>
        {base === null ? <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div> : (
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-[12.5px] table-fixed">
              <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500"><tr>
                <th className="pl-4 py-2.5 w-10"><input type="checkbox" checked={shown.length > 0 && off.size === 0} onChange={e => setOff(e.target.checked ? new Set() : new Set(shown.map(c => c.key)))} aria-label="Select all" /></th>
                <th className="px-2 py-2.5 w-[22%]">Name</th><th className="px-2 py-2.5 w-[16%]">Phone</th><th className="px-2 py-2.5">Email</th><th className="px-2 py-2.5 w-[14%]">Source</th><th className="px-2 py-2.5 w-[12%]">Date</th><th className="px-2 py-2.5 w-[18%]">Service / area</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shown.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No contacts match — change the filters or paste text to extract.</td></tr>}
                {shown.slice(0, 500).map(c => (
                  <tr key={c.key} className={off.has(c.key) ? 'opacity-50' : 'hover:bg-slate-50'}>
                    <td className="pl-4 py-2"><input type="checkbox" checked={!off.has(c.key)} onChange={() => setOff(s => { const n = new Set(s); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n })} aria-label={`Select ${c.name || c.phone}`} /></td>
                    <td className="px-2 py-2 truncate font-semibold">{c.name || <span className="text-slate-400 font-normal">—</span>}{c.isClient && <span className="ml-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">client</span>}</td>
                    <td className="px-2 py-2 truncate text-slate-600">{c.phone ? `+${c.phone}` : '—'}</td>
                    <td className="px-2 py-2 truncate text-slate-600">{c.email || '—'}</td>
                    <td className="px-2 py-2 truncate">{SOURCE_LABEL[c.source]}{c.status ? <span className="block text-[10.5px] text-slate-400 capitalize">{c.status}</span> : null}</td>
                    <td className="px-2 py-2 text-slate-500">{c.date || '—'}</td>
                    <td className="px-2 py-2 truncate text-slate-500">{[c.service, c.area].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > 500 && <p className="px-4 py-2 text-[11.5px] text-slate-400">First 500 shown — the list and CSV take all {picked.length} selected.</p>}
          </div>
        )}
      </section>
    </div>
  )
}
