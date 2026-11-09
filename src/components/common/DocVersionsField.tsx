import { useId, useState } from 'react'
import { Upload, Eye, Trash2, CheckCircle2, Paperclip, Download, History, ChevronDown } from 'lucide-react'
import { docSrc, docKind, useDocUrls } from '@/lib/docStorage'
import { currentDocs, earlierDocs, type VersionedDoc } from '@/lib/docVersions'
import { formatDate } from '@/lib/utils'

const ACCENT = {
  sky: 'hover:border-sky-400 hover:text-sky-800', purple: 'hover:border-purple-400 hover:text-purple-800', amber: 'hover:border-amber-400 hover:text-amber-800',
  emerald: 'hover:border-emerald-400 hover:text-emerald-800', blue: 'hover:border-blue-400 hover:text-blue-800', indigo: 'hover:border-indigo-400 hover:text-indigo-800',
  teal: 'hover:border-teal-400 hover:text-teal-800',
} as const
export type DocAccent = keyof typeof ACCENT

function Row<T extends VersionedDoc>({ d, faded, onPreview, onRemove }: { d: T; faded?: boolean; onPreview: (d: T) => void; onRemove?: (id: string) => void }) {
  const src = docSrc(d.file_data)
  return (
    <div className={`flex items-center justify-between gap-2 p-1.5 rounded-xl border shadow-2xs ${faded ? 'bg-slate-50 border-slate-200/80' : 'bg-white border-slate-200/90'}`}>
      <button type="button" onClick={() => onPreview(d)} className="flex items-center gap-2 min-w-0 text-left cursor-pointer" title="Preview">
        {docKind(d) === 'image' && src
          ? <img src={src} alt={d.name} className={`w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0 ${faded ? 'opacity-75' : ''}`} />
          : <span className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0"><Paperclip size={14} /></span>}
        <span className="min-w-0">
          <span className="block text-[11.5px] font-bold text-slate-800 truncate" title={d.name}>{d.name || 'Document'}</span>
          <span className="block text-[10px] text-slate-400 truncate">
            {d.file_size ? `${Math.round(d.file_size / 1024)} KB · ` : ''}{formatDate(d.uploaded_at.slice(0, 10))}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}{d.removed_at ? ' · removed' : ''}
          </span>
        </span>
      </button>
      <span className="flex items-center gap-0.5 shrink-0">
        <button type="button" onClick={() => onPreview(d)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer" title="Preview"><Eye size={13} /></button>
        {src && <a href={src} download={d.name} target="_blank" rel="noreferrer" className="p-1 rounded-lg text-slate-500 hover:bg-slate-100" title="Download"><Download size={13} /></a>}
        {onRemove && <button type="button" onClick={() => onRemove(d.id)} className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer" title="Remove (kept in history)"><Trash2 size={13} /></button>}
      </span>
    </div>
  )
}

/**
 * R-DOC-01: one document field (Passport, EID, Work Permit, Trade License …). One or more images can be uploaded at
 * once; they become the current set, and the set they replace shows right under it as "Previous". Older sets are
 * under "History". Remove never deletes a file.
 */
export function DocVersionsField<T extends VersionedDoc>({ label, category, docs, onUpload, onRemove, onPreview, accent = 'teal', uploadText = 'Upload Image / Copy' }: {
  label?: string
  category: string
  docs: T[]
  onUpload: (files: FileList) => void
  onRemove: (id: string) => void
  onPreview: (d: T) => void
  accent?: DocAccent
  uploadText?: string
}) {
  useDocUrls()
  const inputId = `doc-up-${category}-${useId().replace(/:/g, '')}`
  const [showHistory, setShowHistory] = useState(false)
  const current = currentDocs(docs, category)
  const { previous, history } = earlierDocs(docs, category)

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[11.5px] font-bold text-slate-700">{label}</label>
          {current.length
            ? <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={10} /> {current.length > 1 ? `${current.length} images` : 'Image Attached'}</span>
            : <span className="text-[10px] font-semibold text-slate-400">No image</span>}
        </div>
      )}
      <input id={inputId} type="file" multiple accept="image/*,application/pdf" className="hidden"
        onChange={e => { if (e.target.files?.length) onUpload(e.target.files); e.target.value = '' }} />

      {current.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9.5px] font-black uppercase tracking-wider text-emerald-700">Current</p>
          {current.map(d => <Row key={d.id} d={d} onPreview={onPreview} onRemove={onRemove} />)}
        </div>
      )}

      <label htmlFor={inputId} className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl border border-dashed border-slate-300 bg-white ${ACCENT[accent]} text-slate-600 transition-all cursor-pointer shadow-2xs`}>
        <Upload size={13} className="text-slate-400" />
        <span className="text-[11.5px] font-bold">{current.length ? 'Upload new (one or more)' : uploadText}</span>
      </label>

      {previous.length > 0 && (
        <div className="space-y-1 pt-0.5">
          <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-500">Previous · replaced {formatDate(String(previous[0].archived_at || previous[0].removed_at || '').slice(0, 10))}</p>
          {previous.map(d => <Row key={d.id} d={d} faded onPreview={onPreview} />)}
        </div>
      )}
      {history.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowHistory(v => !v)} className="text-[10.5px] font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer">
            <History size={11} /> Older history ({history.length}) <ChevronDown size={11} className={showHistory ? 'rotate-180' : ''} />
          </button>
          {showHistory && <div className="space-y-1 mt-1">{history.map(d => <Row key={d.id} d={d} faded onPreview={onPreview} />)}</div>}
        </div>
      )}
    </div>
  )
}
