import { todayDubai, addDays } from '@/lib/dubaiTime'
import { getDriveWebhookUrl } from '@/lib/googleDrive'

/**
 * R-OPS-08: automatic daily copies besides the nightly server backup.
 *  - This computer: a folder picked once (Chrome / Edge). Every day, the first time an admin has the CRM open,
 *    the whole database is saved there as JSON (restorable in Settings → Backup) and Excel. 30 days are kept.
 *  - Google Drive: when a Drive webhook (n8n / Apps Script) is set in Settings → Backup, the same daily Excel
 *    copy is sent to it.
 * The folder is remembered in this browser (IndexedDB); the browser may ask once to allow it again.
 */
export interface BackupData {
  bookings: unknown[]; clients: unknown[]; employees: unknown[]; invoices: unknown[]
  inventory: unknown[]; dailyJobs: unknown[]; dailyExpenses: unknown[]
}
export interface LastCopy { date: string; at: string; file?: string; error?: string }
export interface LocalBackupState {
  supported: boolean
  folder: string | null
  permission: 'granted' | 'prompt' | 'denied' | 'none'
  last: LastCopy | null
  drive: LastCopy | null
}
export type BackupRun = 'saved' | 'not-due' | 'no-folder' | 'needs-permission' | 'unsupported' | 'error'

export const KEEP_LOCAL_DAYS = 30
const LAST_KEY = 'safaeewala_local_backup_last'   // this device only (not shared between devices)
const DRIVE_KEY = 'safaeewala_drive_backup_last'
export const BACKUP_FILE = /^safaeewala-backup-(\d{4}-\d{2}-\d{2})\.(json|xlsx)$/

// Minimal File System Access API types (not in every TS lib)
type Perm = 'granted' | 'prompt' | 'denied'
interface WritableFile { write(data: Blob | string): Promise<void>; close(): Promise<void> }
interface FileHandle { createWritable(): Promise<WritableFile> }
interface DirHandle {
  name: string
  queryPermission(o: { mode: 'readwrite' }): Promise<Perm>
  requestPermission(o: { mode: 'readwrite' }): Promise<Perm>
  getFileHandle(name: string, o: { create: boolean }): Promise<FileHandle>
  removeEntry(name: string): Promise<void>
  keys(): AsyncIterable<string>
}

export const localBackupSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window && typeof indexedDB !== 'undefined'

// ── folder handle in IndexedDB ──
const DB = 'safaeewala-local-backup'
const idb = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  const open = indexedDB.open(DB, 1)
  open.onupgradeneeded = () => open.result.createObjectStore('handles')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const tx = open.result.transaction('handles', mode)
    const req = run(tx.objectStore('handles'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }
})
const getFolder = async (): Promise<DirHandle | null> => { try { return (await idb<DirHandle | undefined>('readonly', s => s.get('dir') as IDBRequest<DirHandle | undefined>)) || null } catch { return null } }
const setFolder = (h: DirHandle | null) => idb<unknown>('readwrite', s => (h ? s.put(h, 'dir') : s.delete('dir')) as IDBRequest<unknown>)

const readLast = (key: string): LastCopy | null => { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
const writeLast = (key: string, v: LastCopy) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage full */ } }

export async function getLocalBackupState(): Promise<LocalBackupState> {
  const supported = localBackupSupported()
  const folder = supported ? await getFolder() : null
  let permission: LocalBackupState['permission'] = 'none'
  if (folder) { try { permission = await folder.queryPermission({ mode: 'readwrite' }) } catch { permission = 'prompt' } }
  return { supported, folder: folder?.name || null, permission, last: readLast(LAST_KEY), drive: readLast(DRIVE_KEY) }
}

/** Pick the folder (needs a click); the first copy is saved right away by the caller */
export async function chooseBackupFolder(): Promise<string | null> {
  if (!localBackupSupported()) return null
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker
  const dir = await picker({ id: 'safaeewala-backups', mode: 'readwrite', startIn: 'documents' })
  await setFolder(dir)
  return dir.name
}
export async function forgetBackupFolder(): Promise<void> { await setFolder(null) }
/** The browser asks again after a restart (unless "Allow on every visit" was chosen) — needs a click */
export async function allowBackupFolder(): Promise<boolean> {
  const dir = await getFolder()
  if (!dir) return false
  try { return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted' } catch { return false }
}

/** The same shape as Settings → Backup → JSON, so the file can be restored there */
export const backupJson = (d: BackupData) => JSON.stringify({ ...d, exported_at: new Date().toISOString() }, null, 2)

export async function backupExcel(d: BackupData): Promise<Blob> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const sheets: [string, unknown[]][] = [['Bookings', d.bookings], ['Clients', d.clients], ['Employees', d.employees], ['Invoices', d.invoices], ['Inventory', d.inventory], ['Daily Jobs', d.dailyJobs], ['Daily Expenses', d.dailyExpenses]]
  // nested values (team splits, schedules) as text; inline files left out — they live in Storage
  const flat = (rows: unknown[]) => rows.map(r => Object.fromEntries(Object.entries(r as Record<string, unknown>)
    .filter(([, v]) => !(typeof v === 'string' && v.startsWith('data:')))
    .map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v).slice(0, 30000) : v])))
  sheets.forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat(rows)), name))
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Files older than the kept days, from a folder listing */
export function oldBackupFiles(names: string[], today: string, keepDays = KEEP_LOCAL_DAYS): string[] {
  const cutoff = addDays(today, -keepDays)
  return names.filter(n => { const m = BACKUP_FILE.exec(n); return Boolean(m && m[1] < cutoff) })
}

/** Today's copy into the chosen folder (once a day unless `force`) */
export async function writeLocalBackup(data: BackupData, opts: { force?: boolean } = {}): Promise<BackupRun> {
  if (!localBackupSupported()) return 'unsupported'
  const today = todayDubai()
  if (!opts.force && readLast(LAST_KEY)?.date === today && !readLast(LAST_KEY)?.error) return 'not-due'
  const dir = await getFolder()
  if (!dir) return 'no-folder'
  try {
    if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') return 'needs-permission'
    const save = async (name: string, body: Blob | string) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable()
      await w.write(body)
      await w.close()
    }
    const base = `safaeewala-backup-${today}`
    await save(`${base}.json`, backupJson(data))
    await save(`${base}.xlsx`, await backupExcel(data))
    const names: string[] = []
    for await (const n of dir.keys()) names.push(n)
    for (const n of oldBackupFiles(names, today)) { try { await dir.removeEntry(n) } catch { /* in use */ } }
    writeLast(LAST_KEY, { date: today, at: new Date().toISOString(), file: `${dir.name}/${base}.json + .xlsx` })
    return 'saved'
  } catch (e) {
    writeLast(LAST_KEY, { date: today, at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) })
    return 'error'
  }
}

/** Today's Excel copy to the Google Drive webhook, when one is set (once a day unless `force`) */
export async function sendDriveBackup(data: BackupData, opts: { force?: boolean } = {}): Promise<BackupRun> {
  const url = getDriveWebhookUrl()
  if (!url) return 'no-folder'
  const today = todayDubai()
  if (!opts.force && readLast(DRIVE_KEY)?.date === today && !readLast(DRIVE_KEY)?.error) return 'not-due'
  try {
    const blob = await backupExcel(data)
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onloadend = () => resolve(String(r.result).split(',')[1] || '')
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
    const filename = `safaeewala-backup-${today}.xlsx`
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'full_backup', date: today, filename, mime_type: blob.type, file_base64: base64, file_size_bytes: blob.size, exported_at: new Date().toISOString() }),
    })
    if (!res.ok) throw new Error(`Drive webhook answered ${res.status}`)
    writeLast(DRIVE_KEY, { date: today, at: new Date().toISOString(), file: filename })
    return 'saved'
  } catch (e) {
    writeLast(DRIVE_KEY, { date: today, at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) })
    return 'error'
  }
}
