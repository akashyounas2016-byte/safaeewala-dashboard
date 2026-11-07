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
const loading = new Set<string>()
const listeners = new Set<() => void>()

/** The address to show / download a document: the data URL itself, or a signed link (empty while it loads) */
export function docSrc(fileData?: string): string {
  if (!fileData) return ''
  if (!isStoredDoc(fileData)) return fileData
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

/** image / pdf / other — from the data URL, the stored type, or the file name */
export function docKind(doc: { file_data?: string; file_type?: string; name?: string } | null | undefined): 'image' | 'pdf' | 'other' {
  if (!doc) return 'other'
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
