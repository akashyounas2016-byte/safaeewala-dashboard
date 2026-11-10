import { useEffect, useState } from 'react'
import { FileText, Plus, Trash2, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { readAndStore } from '@/lib/docVersions'
import { notify } from '@/lib/notify'
import { docSrc } from '@/lib/docStorage'
import type { AgencyTradeLicense } from '@/types'

/**
 * R-AGN-07: a Third Party (Group) company holds several trade licenses — one row each:
 * Upload Image / PDF · Issue Date · Expiry Date · Name / Remarks.
 */

const newRow = (): AgencyTradeLicense => ({ id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: '', issue_date: '', expiry_date: '' })

export function tradeLicenseProblems(list: AgencyTradeLicense[]): string[] {
  const out: string[] = []
  list.forEach((l, i) => {
    const label = l.name?.trim() || `License ${i + 1}`
    if (l.issue_date && l.expiry_date && l.issue_date > l.expiry_date) out.push(`${label}: issue date is after the expiry date`)
  })
  return out
}

/** Rows with nothing filled in are dropped on save */
export const filledLicenses = (list: AgencyTradeLicense[]) =>
  list.filter(l => l.name?.trim() || l.issue_date || l.expiry_date || l.file_data)

export function TradeLicensesModal({ open, onClose, value, onSave }: {
  open: boolean
  onClose: () => void
  value: AgencyTradeLicense[]
  onSave: (list: AgencyTradeLicense[]) => void
}) {
  const [rows, setRows] = useState<AgencyTradeLicense[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { if (open) setRows(value.length ? value.map(v => ({ ...v })) : [newRow()]) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, patch: Partial<AgencyTradeLicense>) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const upload = async (id: string, files: FileList | null) => {
    if (!files?.length) return
    setBusy(id)
    try {
      const [doc] = await readAndStore([files[0]], 'trade_license', 'agencies/trade-licenses')
      if (doc) set(id, { file_data: doc.file_data, file_type: doc.file_type, file_name: files[0].name })
    } finally { setBusy(null) }
  }
  const save = () => {
    const list = filledLicenses(rows)
    const problems = tradeLicenseProblems(list)
    if (problems.length) { notify.error(problems[0]); return }
    onSave(list)
    onClose()
  }

  const cell = 'w-full text-[12px] px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600 font-medium text-slate-800'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Trade Licenses — Third Party (Group)"
      size="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button type="button" variant="outline" size="sm" onClick={() => setRows(prev => [...prev, newRow()])}>
            <Plus size={13} /> <span>Add License</span>
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="button" size="sm" onClick={save} disabled={!!busy} className="bg-teal-600 hover:bg-teal-700 text-white">Save Licenses</Button>
          </div>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-500">
              <th className="py-1.5 pr-2 font-bold">Upload Image / PDF</th>
              <th className="py-1.5 pr-2 font-bold w-36">Issue Date</th>
              <th className="py-1.5 pr-2 font-bold w-36">Expiry Date</th>
              <th className="py-1.5 pr-2 font-bold">Name / Remarks</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.id}>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-teal-300 bg-teal-50/60 text-teal-800 font-bold text-[11px] cursor-pointer hover:bg-teal-50 whitespace-nowrap">
                      <Upload size={12} /> {busy === r.id ? 'Uploading…' : r.file_data ? 'Replace' : 'Upload Image and PDF'}
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { void upload(r.id, e.target.files); e.target.value = '' }} />
                    </label>
                    {r.file_data && (
                      <a href={docSrc(r.file_data)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-teal-700 truncate max-w-[140px]" title={r.file_name}>
                        <FileText size={12} className="shrink-0" /> <span className="truncate">{r.file_name || 'View'}</span>
                      </a>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-2"><input type="date" aria-label="Issue Date" value={r.issue_date || ''} onChange={e => set(r.id, { issue_date: e.target.value })} className={cell} /></td>
                <td className="py-2 pr-2"><input type="date" aria-label="Expiry Date" value={r.expiry_date || ''} onChange={e => set(r.id, { expiry_date: e.target.value })} className={cell} /></td>
                <td className="py-2 pr-2"><input type="text" aria-label="Name / Remarks" value={r.name || ''} onChange={e => set(r.id, { name: e.target.value })} placeholder="e.g. Al Safa Group — Branch 2" className={cell} /></td>
                <td className="py-2 text-right">
                  <button type="button" aria-label="Remove license" onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 text-center text-slate-400 text-[12px]">No licenses — press Add License</p>}
      </div>
    </Modal>
  )
}
