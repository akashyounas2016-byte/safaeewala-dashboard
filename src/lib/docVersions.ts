/**
 * R-DOC-01: document images keep their history. Uploading one or more new images makes them the CURRENT set of
 * that document; the set that was current becomes PREVIOUS (shown right under it); older sets stay in HISTORY.
 * Nothing is deleted: "Remove" only takes an image out of the current set (it stays in history), and the files
 * stay in the private Storage bucket, which the nightly VPS backup copies.
 */
export interface VersionedDoc {
  id: string
  category: string
  name?: string
  file_data?: string
  file_type?: string
  file_size?: number
  uploaded_at: string
  is_active?: boolean
  archived_at?: string
  removed_at?: string
  uploaded_by?: string
  version?: number
}

const hasFile = (d: VersionedDoc) => Boolean(d.file_data)
export const isCurrent = (d: VersionedDoc) => d.is_active !== false && !d.archived_at && !d.removed_at

/** The current images of a document, newest first */
export function currentDocs<T extends VersionedDoc>(docs: T[], category: string): T[] {
  return docs.filter(d => d.category === category && hasFile(d) && isCurrent(d)).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
}

/** Earlier images, newest first: `previous` = the set replaced last, `history` = everything older */
export function earlierDocs<T extends VersionedDoc>(docs: T[], category: string): { previous: T[]; history: T[] } {
  const old = docs.filter(d => d.category === category && hasFile(d) && !isCurrent(d))
    .sort((a, b) => (b.archived_at || b.removed_at || b.uploaded_at).localeCompare(a.archived_at || a.removed_at || a.uploaded_at))
  if (!old.length) return { previous: [], history: [] }
  const when = old[0].archived_at || old[0].removed_at || old[0].uploaded_at
  const previous = old.filter(d => (d.archived_at || d.removed_at || d.uploaded_at) === when)
  return { previous, history: old.filter(d => !previous.includes(d)) }
}

/** New uploads become current; the images that were current move to previous (one time stamp for the whole set) */
export function addVersion<T extends VersionedDoc>(docs: T[], category: string, added: T[], now = new Date().toISOString()): T[] {
  if (!added.length) return docs
  const version = Math.max(0, ...docs.filter(d => d.category === category).map(d => d.version || 1)) + 1
  const archived = docs.map(d => (d.category === category && isCurrent(d) && hasFile(d) ? { ...d, is_active: false, archived_at: now } : d))
  return [...added.map(d => ({ ...d, category, is_active: true, version, uploaded_at: d.uploaded_at || now })), ...archived]
}

/** "Remove" keeps the image in history (marked removed), it is never deleted */
export function removeVersion<T extends VersionedDoc>(docs: T[], id: string, now = new Date().toISOString()): T[] {
  return docs.map(d => (d.id === id ? { ...d, is_active: false, removed_at: now } : d))
}

/** Read picked files as data URLs (they move to Storage when the record is saved) */
export function readFiles(files: FileList | File[] | null, category: string, by?: string): Promise<VersionedDoc[]> {
  const list = files ? Array.from(files) : []
  return Promise.all(list.map(file => new Promise<VersionedDoc>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve({
      id: `doc-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category, name: file.name, file_data: r.result as string, file_type: file.type || 'application/octet-stream',
      file_size: file.size, uploaded_at: new Date().toISOString(), ...(by ? { uploaded_by: by } : {}),
    })
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })))
}

/**
 * Employees: the documents list with every image of every version. Old employees only have one image per document
 * in eid_file, passport_file … — that image is added as the current one when the list has none for the document.
 */
export function seedFromFields<T extends VersionedDoc>(docs: T[] | undefined, fields: [string, string, string | undefined][], createdAt: string): T[] {
  const list = (docs || []).filter(hasFile)
  for (const [category, name, fileData] of fields) {
    if (fileData && !list.some(d => d.category === category)) {
      list.push({ id: `doc-${category}-legacy`, category, name, file_data: fileData, uploaded_at: createdAt, is_active: true, version: 1 } as T)
    }
  }
  return list
}
