import React, { useRef } from 'react'
import {
  FileText, Upload, Eye, Trash2, CheckCircle2, Download,
  ExternalLink, FileCheck, Shield, AlertCircle, Paperclip, X
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { EmployeeDocument } from '@/types'

export interface DocumentSectionProps {
  category: EmployeeDocument['category']
  title: string
  doc?: EmployeeDocument | null
  onUpload: (file: File) => void
  onRemove: () => void
  onPreview: (doc: EmployeeDocument) => void
  children?: React.ReactNode
  description?: string
}

/**
 * Dedicated Document Section with Blue Header and File Upload
 * Matches the layout and styling of the provided specification sheets.
 */
export function EmployeeDocumentSection({
  category,
  title,
  doc,
  onUpload,
  onRemove,
  onPreview,
  children,
  description,
}: DocumentSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(file)
      // reset value so re-uploading same filename fires onChange
      e.target.value = ''
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-b from-blue-50/40 to-slate-50/30 p-3.5 space-y-3 shadow-2xs">
      {/* ── Blue Section Header (Matches blue rows in specification sheet) ── */}
      <div className="bg-[#dbeafe] border border-[#bfdbfe] text-[#1e40af] px-3.5 py-2 rounded-xl flex items-center justify-between flex-wrap gap-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-blue-600/10 flex items-center justify-center text-[#1d4ed8]">
            <FileText size={13} />
          </div>
          <span className="font-black text-[12.5px] uppercase tracking-wider">{title}</span>
          {description && (
            <span className="text-[11px] font-normal text-blue-700/80 hidden sm:inline">
              ({description})
            </span>
          )}
        </div>

        {/* Upload Button & Current Status */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-[11px] shadow-xs transition-all cursor-pointer"
          >
            <Upload size={12} />
            <span>{doc ? 'Replace File' : 'Upload File'}</span>
          </button>
        </div>
      </div>

      {/* Uploaded File Chip / History Item */}
      {doc && (
        <div className="bg-white border border-blue-200 rounded-xl p-2.5 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
              <FileCheck size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-slate-800 truncate" title={doc.name}>
                {doc.name}
              </p>
              <div className="flex items-center gap-2 text-[10.5px] text-slate-400">
                <span>{doc.file_size ? `${Math.round(doc.file_size / 1024)} KB` : 'Uploaded Document'}</span>
                <span>•</span>
                <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                  <CheckCircle2 size={10} /> Saved
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onPreview(doc)}
              className="p-1.5 rounded-lg text-blue-700 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors cursor-pointer"
              title="Preview Document"
            >
              <Eye size={14} />
            </button>
            {doc.file_data && (
              <a
                href={doc.file_data}
                download={doc.name}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Download Document"
              >
                <Download size={14} />
              </a>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
              title="Remove File"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Date & Additional Fields */}
      {children && (
        <div className="pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Preview Modal for uploaded Employee Documents (Images & PDFs)
 */
export function EmployeeDocumentPreviewModal({
  doc,
  onClose,
}: {
  doc: EmployeeDocument | null
  onClose: () => void
}) {
  if (!doc) return null

  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title={`Document Preview — ${doc.name}`}
      size="lg"
      headerActions={
        <div className="flex items-center gap-2">
          {doc.file_data && (
            <a
              href={doc.file_data}
              download={doc.name}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Download size={13} />
              <span>Download</span>
            </a>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-2xl min-h-[300px]">
        {doc.file_data?.startsWith('data:image/') ? (
          <img
            src={doc.file_data}
            alt={doc.name}
            className="max-h-[500px] max-w-full rounded-xl object-contain border border-slate-200 shadow-sm"
          />
        ) : doc.file_data?.startsWith('data:application/pdf') ? (
          <iframe
            src={doc.file_data}
            title={doc.name}
            className="w-full h-[520px] rounded-xl border border-slate-200"
          />
        ) : (
          <div className="text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
              <FileText size={32} />
            </div>
            <h4 className="text-[15px] font-bold text-slate-800">{doc.name}</h4>
            <p className="text-[12px] text-slate-500 mt-1">
              Category: <strong className="capitalize">{doc.category.replace('_', ' ')}</strong>
              {doc.file_size ? ` • ${Math.round(doc.file_size / 1024)} KB` : ''}
            </p>
            {doc.file_data && (
              <a
                href={doc.file_data}
                download={doc.name}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[12.5px] shadow-sm cursor-pointer"
              >
                <Download size={14} /> Download File
              </a>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Document number field with inline upload icon (standard across Add & Edit Employee popups) ──
export function EmployeeDocInput({
  name,
  label,
  placeholder,
  defaultValue,
  doc,
  onUpload,
  onRemove,
  onPreview,
}: {
  name: string
  label: string
  placeholder?: string
  defaultValue?: string
  doc?: EmployeeDocument
  onUpload: (file: File) => void
  onRemove: () => void
  onPreview: (doc: EmployeeDocument) => void
}) {
  const uploadInputId = `emp-upload-${name}-${Math.random().toString(36).slice(2, 7)}`

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[11.5px] font-bold text-slate-700">{label}</label>
        {doc && (
          <span className="text-[10px] font-black text-teal-700 bg-teal-50 border border-teal-200/80 px-1.5 rounded-full flex items-center gap-1">
            <Paperclip size={9} />
            <span>1 file</span>
          </span>
        )}
      </div>

      <div className="relative flex items-center">
        <input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white pl-3 pr-10 py-2 text-[12px] font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600/30 transition-all shadow-2xs"
        />
        <label
          htmlFor={uploadInputId}
          className="absolute right-1.5 p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 cursor-pointer transition-colors"
          title={doc ? `Replace ${label} document` : `Upload ${label} document`}
        >
          <Upload size={14} className="stroke-[2.2]" />
          <input
            id={uploadInputId}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {doc && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-teal-50/90 border border-teal-200/80 text-[10.5px] text-teal-900 shadow-2xs max-w-full">
            <Paperclip size={10} className="text-teal-700 shrink-0" />
            <span className="font-semibold truncate max-w-[125px]" title={doc.name}>{doc.name}</span>
            <button
              type="button"
              onClick={() => onPreview(doc)}
              className="text-teal-700 hover:text-teal-950 p-0.5 rounded hover:bg-teal-100/80 cursor-pointer"
              title="Preview / Download Document"
            >
              <Eye size={11} />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-slate-400 hover:text-rose-600 p-0.5 rounded hover:bg-rose-50 cursor-pointer"
              title="Remove Document"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
