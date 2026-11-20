import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Identity documents (Emirates ID, passport, visa, licences …) live in the private Supabase Storage bucket
 * `staff-documents`, readable by admin / manager only (E2E-08, R-SEC-04). The employee / agency row keeps
 * only a reference "storage:<path>" in `file_data`; screens show the file through a short-lived signed link.
 * Old rows that still hold the file itself (a data: URL) keep working and are moved on the next admin login.
 */
export const DOC_BUCKET = 'staff-documents'
const PREFIX = 'storage:'

export const isStoredDoc = (v?: string) => Boolean(v && v.startsWith(PREFIX))
export const isInlineDoc = (v?: string) => Boolean(v && v.startsWith('data:'))

/**
 * R-SYNC-15: a record without its inline files (photos / PDFs as data: URLs) — what goes to the database, the
 * server and the browser cache. The files go to Storage first and their paths are written afterwards; sending
 * them inline made the first save several MB, which failed, did not fit the outbox, and the employee was lost.
 */
export function withoutInlineDocs<T extends object>(rec: T, fileFields: readonly string[] = []): T {
  const r = rec as Record<string, unknown>
  let out: Record<string, unknown> | null = null
  const set = (k: string, v: unknown) => { out = out || { ...r }; out[k] = v }
  if (Array.isArray(r.documents) && r.documents.some(d => isInlineDoc((d as { file_data?: string })?.file_data))) {
    set('documents', (r.documents as { file_data?: string }[]).map(d => (isInlineDoc(d?.file_data) ? { ...d, file_data: '' } : d)))
  }
  for (const k of fileFields) if (typeof r[k] === 'string' && isInlineDoc(r[k] as string)) set(k, null)
  return (out || rec) as T
}

const signed = new Map<string, { url: string; until: number }>()
const localCopy = new Map<string, string>()
const loading = new Set<string>()
const listeners = new Set<() => void>()

/** The address to show / download a document: the data URL itself, or a signed link (empty while it loads) */
export function docSrc(fileData?: string): string {
  if (!fileData) return ''
  if (!isStoredDoc(fileData)) return fileData
  const local = localCopy.get(fileData) // R-EMP-15: a file stored without its type, shown from a typed local copy
  if (local) return local
  const hit = signed.get(fileData)
  if (hit && hit.until > Date.now()) return hit.url
  if (!loading.has(fileData)) {
    loading.add(fileData)
    void supabase.storage.from(DOC_BUCKET).createSignedUrl(fileData.slice(PREFIX.length), 3600)
      .then(({ data }) => {
        if (data?.signedUrl) {
          signed.set(fileData, { url: data.signedUrl, until: Date.now() + 50 * 60_000 })
          listeners.forEach(l => l())
        }
      })
      .finally(() => loading.delete(fileData))
  }
  return hit?.url || ''
}

/** Call once in a component that shows documents: it re-renders when a signed link is ready */
export function useDocUrls(): void {
  const [, bump] = useState(0)
  useEffect(() => {
    const l = () => bump(n => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
}

type DocKind = 'image' | 'pdf' | 'other'

/** R-EMP-15: kind of a stored file read from its first bytes (a file saved without an extension, e.g. "__eid_file-eid_file") */
const sniffed = new Map<string, DocKind>()
const sniffing = new Set<string>()

/** image / pdf / other from the first bytes of a file */
export function kindFromBytes(b: Uint8Array): DocKind {
  const hex = Array.from(b.slice(0, 12), x => x.toString(16).padStart(2, '0')).join('')
  if (hex.startsWith('25504446')) return 'pdf' // %PDF
  if (hex.startsWith('ffd8ff') || hex.startsWith('89504e47') || hex.startsWith('47494638')) return 'image' // JPEG, PNG, GIF
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image' // RIFF....WEBP
  return 'other'
}

function sniff(fileData: string) {
  if (sniffed.has(fileData) || sniffing.has(fileData)) return
  const url = docSrc(fileData)
  if (!url) return // the signed link is not ready yet: the next render asks again
  sniffing.add(fileData)
  void fetch(url)
    .then(async r => {
      if (!r.ok) throw new Error(String(r.status))
      const type = (r.headers.get('content-type') || '').toLowerCase()
      const buf = await r.arrayBuffer()
      const kind = kindFromBytes(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)))
      // Stored as "application/octet-stream": the browser would download it instead of showing it, so show a local copy with the right type
      if (kind !== 'other' && !(kind === 'pdf' ? type.includes('pdf') : type.startsWith('image/'))) {
        const mime = kind === 'pdf' ? 'application/pdf' : /^ffd8/.test(new Uint8Array(buf, 0, 2).reduce((h, x) => h + x.toString(16).padStart(2, '0'), '')) ? 'image/jpeg' : 'image/png'
        localCopy.set(fileData, URL.createObjectURL(new Blob([buf], { type: mime })))
      }
      sniffed.set(fileData, kind)
    })
    .catch(() => { sniffed.set(fileData, 'other') })
    .finally(() => { sniffing.delete(fileData); listeners.forEach(l => l()) })
}

/** True while the kind of a stored file without a known type is still being read (R-EMP-15) */
export function docKindPending(doc: { file_data?: string; file_type?: string; name?: string } | null | undefined): boolean {
  return Boolean(doc && needsSniff(doc) && guessKind(doc) === 'other' && !sniffed.has(doc.file_data!))
}

/** Only a stored file whose path has no extension (".docx" etc. is known not to preview) and no stored type */
function needsSniff(doc: { file_data?: string; file_type?: string }): boolean {
  if (!isStoredDoc(doc.file_data) || doc.file_type) return false
  const last = doc.file_data!.split('/').pop() || ''
  return !/\.[a-z0-9]{2,5}$/i.test(last)
}

/** image / pdf / other — from the data URL, the stored type, the file name, or (R-EMP-15) the file's first bytes */
export function docKind(doc: { file_data?: string; file_type?: string; name?: string } | null | undefined): DocKind {
  if (!doc) return 'other'
  const kind = guessKind(doc)
  if (kind !== 'other' || !needsSniff(doc)) return kind
  const known = sniffed.get(doc.file_data!)
  if (known) return known
  sniff(doc.file_data!)
  return 'other'
}

function guessKind(doc: { file_data?: string; file_type?: string; name?: string }): DocKind {
  const probe = `${doc.file_data?.startsWith('data:') ? doc.file_data.slice(0, 40) : ''} ${doc.file_type || ''} ${doc.name || ''} ${isStoredDoc(doc.file_data) ? doc.file_data : ''}`.toLowerCase()
  if (/image\/|\.(png|jpe?g|gif|webp|svg)\b/.test(probe)) return 'image'
  if (/application\/pdf|\.pdf\b/.test(probe)) return 'pdf'
  return 'other'
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body = ''] = dataUrl.split(',')
  const type = /data:([^;,]+)/.exec(head)?.[1] || 'application/octet-stream'
  if (!head.includes(';base64')) return new Blob([decodeURIComponent(body)], { type })
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/**
 * Upload every document that still holds its file (data: URL) to Storage.
 * Returns id → new reference for the uploaded ones (a failed upload stays as it was and is retried later).
 */
export async function uploadInlineDocs(folder: string, docs: { id?: string; name?: string; file_data?: string }[]): Promise<Map<string, { from: string; to: string }>> {
  const done = new Map<string, { from: string; to: string }>()
  await Promise.all(docs.map(async d => {
    if (!d.id || !isInlineDoc(d.file_data)) return
    const blob = dataUrlToBlob(d.file_data!)
    const safeName = (d.name || 'document').replace(/[^\w.-]+/g, '_').slice(0, 80)
    const path = `${folder}/${d.id}-${safeName}`
    const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type })
    if (!error) done.set(d.id, { from: d.file_data!, to: PREFIX + path })
  }))
  return done
}
