import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * R-APP-04: job proof — a photo at Start job, a photo and the client's signature at End job. Files go to the private
 * Storage bucket "job-proofs" (migration 2026-11-26_job_proofs.sql): <date>/<job id>/<cleaner>-<start|end|signature>.
 * Staff can add files; only office logins (and the uploader) can see them. Optional: a step is never blocked by it.
 */
export const PROOF_BUCKET = 'job-proofs'
export type ProofKind = 'start' | 'end' | 'signature'
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'staff'
export const proofFolder = (date: string, jobId: string) => `${date}/${jobId}`
export const proofPath = (date: string, jobId: string, cleaner: string, kind: ProofKind) =>
  `${proofFolder(date, jobId)}/${slug(cleaner)}-${kind}.${kind === 'signature' ? 'png' : 'jpg'}`

/** A camera photo made small (longest side 1280 px, JPEG) so it uploads quickly on mobile data */
export function shrinkImage(file: File, max = 1280): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Photo could not be read'))), 'image/jpeg', 0.75)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo could not be read')) }
    img.src = url
  })
}

export async function uploadProof(path: string, blob: Blob): Promise<string | null> {
  const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' })
  return error ? error.message : null
}

export interface ProofFile { name: string; kind: ProofKind; url: string }

/** The proof files of one job (office): signed links valid for an hour */
export function useJobProofs(date: string, jobId: string, enabled: boolean): ProofFile[] {
  const [files, setFiles] = useState<ProofFile[]>([])
  useEffect(() => {
    if (!enabled) return
    let alive = true
    void (async () => {
      const folder = proofFolder(date, jobId)
      const { data } = await supabase.storage.from(PROOF_BUCKET).list(folder)
      if (!data?.length) return
      const out: ProofFile[] = []
      for (const f of data) {
        const kind = (/-(start|end|signature)\.\w+$/.exec(f.name)?.[1] || 'start') as ProofKind
        const { data: signed } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(`${folder}/${f.name}`, 3600)
        if (signed?.signedUrl) out.push({ name: f.name, kind, url: signed.signedUrl })
      }
      if (alive) setFiles(out)
    })()
    return () => { alive = false }
  }, [date, jobId, enabled])
  return files
}
