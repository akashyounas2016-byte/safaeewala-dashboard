import type { Agency, DailyExpense, DailyJob, Employee } from '@/types'

/**
 * Automatic backup before destructive actions (BAK-5): "Delete All Data", replacing a day
 * (delete day / re-import) and deleting an agency with its staff.
 *
 * The snapshot uses the same keys as Settings → Backup (dailyJobs, dailyExpenses, employees …),
 * so a downloaded snapshot can be restored there. Copies are also kept in this browser
 * (local only, newest 10) and listed in Settings → Backup → "Before-delete copies".
 */
export interface DeletionSnapshot {
  id: string
  label: string
  created_at: string
  counts: Record<string, number>
  data: {
    dailyJobs?: DailyJob[]
    dailyExpenses?: DailyExpense[]
    employees?: Employee[]
    agencies?: Agency[]
    appState?: Record<string, unknown>
  }
}

export const SNAPSHOT_KEY = 'safaeewala_deletion_snapshots' // local only, never cloud-synced
const MAX_SNAPSHOTS = 10
const MAX_STORED_CHARS = 2_500_000 // keep localStorage usable for the app's own cache
export const SNAPSHOT_EVENT = 'safaeewala:snapshots-changed'

export function listSnapshots(): DeletionSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    const list = raw ? (JSON.parse(raw) as DeletionSnapshot[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function store(list: DeletionSnapshot[]): boolean {
  // Drop the oldest copies until the list fits
  let keep = list.slice(0, MAX_SNAPSHOTS)
  while (keep.length > 0 && JSON.stringify(keep).length > MAX_STORED_CHARS) keep = keep.slice(0, -1)
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(keep))
    window.dispatchEvent(new Event(SNAPSHOT_EVENT))
    return keep.length > 0 && keep[0].id === list[0]?.id
  } catch {
    return false
  }
}

export function deleteSnapshot(id: string): void {
  store(listSnapshots().filter(s => s.id !== id))
}

/** Same format as Settings → Backup "Download JSON Backup", plus the snapshot details */
export function downloadSnapshot(s: DeletionSnapshot): void {
  const file = { ...s.data, snapshot: { label: s.label, created_at: s.created_at, counts: s.counts }, exported_at: s.created_at }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = s.created_at.replace(/[:T]/g, '-').slice(0, 16)
  a.download = `safaeewala-before-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Keep a copy of what is about to be deleted. Returns the snapshot, or null when there was
 * nothing to keep. With `download`, the copy is also saved as a file (always for Delete All,
 * and whenever it is too big to keep in the browser).
 */
export function saveDeletionSnapshot(label: string, data: DeletionSnapshot['data'], opts: { download?: boolean } = {}): DeletionSnapshot | null {
  const counts: Record<string, number> = {}
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) counts[k] = v.length
    else if (v && typeof v === 'object') counts[k] = Object.keys(v).length
  }
  if (Object.values(counts).every(n => n === 0)) return null
  const snap: DeletionSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    created_at: new Date().toISOString(),
    counts,
    data,
  }
  const kept = store([snap, ...listSnapshots()])
  if (opts.download || !kept) downloadSnapshot(snap)
  return snap
}
