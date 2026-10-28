import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MessageCircle, Wallet, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Pager } from '@/components/common/Pager'
import { usePagination } from '@/hooks/usePagination'
import { cleanClientNameFromAddress, normalizeKey } from '@/lib/clientDataSync'
import { ageBucket, whatsappReminderLink, type AgeBucket } from '@/lib/receivables'
import { getCompanyInfo } from '@/lib/companyInfo'
import type { Client } from '@/types'

/** The fields this view needs from a pending record (Pending screen's UnifiedPendingRecord) */
export interface PendingRow {
  id: string
  date: string
  clientName: string
  service?: string
  staffName: string
  pendingAmount: number
  source: string
}

export type CollectMode = 'Cash' | 'Bank Transfer' | 'Credit Card' | 'Cheque' | 'Online'

interface ClientGroup {
  key: string
  name: string
  rows: PendingRow[]
  total: number
  buckets: Record<AgeBucket, number>
  phone: string
}

const BUCKET_STYLE: Record<AgeBucket, string> = {
  '0-30': 'bg-slate-100 text-slate-700 border-slate-200',
  '31-60': 'bg-amber-50 text-amber-800 border-amber-200',
  '60+': 'bg-rose-50 text-rose-700 border-rose-200',
}

/**
 * Receivables grouped by client (UX-08) with ageing buckets and WhatsApp reminders (UX-09)
 * and one receipt for several visits of a client (UX-10).
 */
export function ReceivablesByClient({ rows, clients, onCollect }: {
  rows: PendingRow[]
  clients: Client[]
  onCollect: (rows: PendingRow[], amount: number, mode: CollectMode, notes: string) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [collecting, setCollecting] = useState<ClientGroup | null>(null)

  const groups = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>()
    for (const r of rows) {
      const name = cleanClientNameFromAddress(r.clientName) || r.clientName || 'Client'
      const key = normalizeKey(name) || r.id
      if (!map.has(key)) {
        const client = clients.find(c => normalizeKey(c.full_name) === key || (!!c.building_name && normalizeKey(c.building_name) === key))
        map.set(key, { key, name, rows: [], total: 0, buckets: { '0-30': 0, '31-60': 0, '60+': 0 }, phone: client?.whatsapp || client?.phone || '' })
      }
      const g = map.get(key)!
      g.rows.push(r)
      g.total += r.pendingAmount
      g.buckets[ageBucket(r.date)] += r.pendingAmount
    }
    const q = search.toLowerCase().trim()
    return Array.from(map.values())
      .map(g => ({ ...g, rows: [...g.rows].sort((a, b) => a.date.localeCompare(b.date)) }))
      .filter(g => !q || g.name.toLowerCase().includes(q))
      .sort((a, b) => b.total - a.total)
  }, [rows, clients, search])

  const pager = usePagination(groups, 20)
  const totals = useMemo(() => groups.reduce((t, g) => {
    t['0-30'] += g.buckets['0-30']; t['31-60'] += g.buckets['31-60']; t['60+'] += g.buckets['60+']
    return t
  }, { '0-30': 0, '31-60': 0, '60+': 0 } as Record<AgeBucket, number>), [groups])

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const company = getCompanyInfo()

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-[16px] font-bold text-[#111827]">Dues by Client</h3>
          <p className="text-[11.5px] text-slate-400">{groups.length} clients · oldest dues first inside each client</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['0-30', '31-60', '60+'] as AgeBucket[]).map(b => (
            <span key={b} className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${BUCKET_STYLE[b]}`} title={`Dues ${b} days old`}>
              {b} days: AED {Math.round(totals[b]).toLocaleString()}
            </span>
          ))}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search client…"
              className="pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#E4E8EC]">
        {pager.pageItems.map(g => {
          const isOpen = open.has(g.key)
          return (
            <div key={g.key}>
              <div className="px-5 py-3.5 flex items-center gap-3 flex-wrap hover:bg-slate-50/60">
                <button type="button" onClick={() => toggle(g.key)} className="flex items-center gap-2 flex-1 min-w-[220px] text-left cursor-pointer">
                  {isOpen ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                  <span className="font-bold text-[13.5px] text-[#111827]">{g.name}</span>
                  <span className="text-[11px] text-slate-400">{g.rows.length} due{g.rows.length === 1 ? '' : 's'}</span>
                </button>
                <div className="flex items-center gap-1.5">
                  {(['0-30', '31-60', '60+'] as AgeBucket[]).filter(b => g.buckets[b] > 0).map(b => (
                    <span key={b} className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md border ${BUCKET_STYLE[b]}`}>
                      {b}d · {Math.round(g.buckets[b]).toLocaleString()}
                    </span>
                  ))}
                </div>
                <span className="font-black text-[14px] text-red-700 w-[110px] text-right">AED {Math.round(g.total).toLocaleString()}</span>
                <div className="flex items-center gap-1.5">
                  {g.phone ? (
                    <a
                      href={whatsappReminderLink(g.phone, g.name, Math.round(g.total), company.company_name)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                      title="Send a payment reminder on WhatsApp"
                    >
                      <MessageCircle size={13} /> Remind
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate-400 px-2" title="No phone saved for this client">No phone</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setCollecting(g)}
                    className="flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 cursor-pointer"
                  >
                    <Wallet size={13} /> Collect
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="bg-slate-50/70 px-12 py-2">
                  {g.rows.map(r => (
                    <div key={r.id} className="flex items-center gap-3 py-1.5 text-[12px] border-b border-slate-100 last:border-0">
                      <span className="w-[90px] text-slate-500">{r.date || '—'}</span>
                      <span className="flex-1 text-slate-700 truncate">{r.service || r.source}{r.staffName && r.staffName !== '—' ? ` · ${r.staffName}` : ''}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${BUCKET_STYLE[ageBucket(r.date)]}`}>{ageBucket(r.date)}d</span>
                      <span className="w-[90px] text-right font-bold text-slate-800">AED {Math.round(r.pendingAmount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {groups.length === 0 && (
          <p className="py-14 text-center text-[13px] text-slate-400">No outstanding dues for the selected filters.</p>
        )}
      </div>
      <Pager {...pager} />

      <Modal open={!!collecting} onClose={() => setCollecting(null)} title={collecting ? `Collect from ${collecting.name}` : ''} size="md">
        {collecting && (
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              onCollect(collecting.rows, Number(fd.get('amount')) || 0, (fd.get('mode') as CollectMode) || 'Cash', (fd.get('notes') as string) || '')
              setCollecting(null)
            }}
          >
            <p className="text-[12.5px] text-slate-600">
              Total due <strong className="text-red-700">AED {Math.round(collecting.total).toLocaleString()}</strong> across {collecting.rows.length} visit{collecting.rows.length === 1 ? '' : 's'}.
              The amount is applied to the <strong>oldest dues first</strong> — one receipt per visit.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input name="amount" label="Amount received (AED)" type="number" min="0" step="0.01" defaultValue={String(Math.round(collecting.total * 100) / 100)} required />
              <Select name="mode" label="Paid by" defaultValue="Cash">
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Online">Online</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Cheque">Cheque</option>
              </Select>
            </div>
            <Textarea name="notes" label="Notes" rows={2} placeholder="Reference, who paid…" />
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCollecting(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold">Record collection</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
