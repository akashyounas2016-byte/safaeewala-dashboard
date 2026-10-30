import { useEffect, useState } from 'react'
import { CloudOff, RotateCcw, X } from 'lucide-react'
import { SYNC_STATUS_EVENT, getSyncStatus, flushOutbox } from '@/lib/syncQueue'
import { CLOUD_STATE_EVENT, getCloudStateStatus, retryCloudState } from '@/lib/cloudState'
import { STORAGE_PROBLEM_EVENT, getStorageProblem } from '@/lib/storageUtils'

/** Tells the user when changes have not reached Supabase yet (AUD-20) */
export function SyncStatusBanner() {
  const read = () => {
    const db = getSyncStatus()
    const cloud = getCloudStateStatus()
    return { pending: db.pending + cloud.unsynced, error: db.lastError || cloud.lastError, storage: getStorageProblem() }
  }
  const [status, setStatus] = useState(read)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const update = () => setStatus(read())
    window.addEventListener(SYNC_STATUS_EVENT, update)
    window.addEventListener(CLOUD_STATE_EVENT, update)
    window.addEventListener(STORAGE_PROBLEM_EVENT, update)
    return () => {
      window.removeEventListener(STORAGE_PROBLEM_EVENT, update)
      window.removeEventListener(SYNC_STATUS_EVENT, update)
      window.removeEventListener(CLOUD_STATE_EVENT, update)
    }
  }, [])

  // TA-21: storage full is shown in red and cannot be dismissed
  if (status.storage) {
    return (
      <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-2xl border border-rose-300 bg-rose-50 text-rose-900 text-[12.5px] shadow-2xs">
        <CloudOff size={16} className="mt-0.5 shrink-0 text-rose-600" />
        <div className="flex-1 min-w-0">
          <p className="font-bold">{status.storage}</p>
          <p className="mt-0.5">Changes still go to the cloud when online. Download a backup (Settings → Backup), then clear old browser data for this site or use another browser.</p>
        </div>
      </div>
    )
  }
  if (dismissed || (status.pending === 0 && !status.error)) return null

  return (
    <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 text-[12.5px] shadow-2xs">
      <CloudOff size={16} className="mt-0.5 shrink-0 text-amber-600" />
      <div className="flex-1 min-w-0">
        <p className="font-bold">
          {status.pending > 0
            ? `${status.pending} change${status.pending === 1 ? '' : 's'} not saved to the cloud yet — kept on this device and retried automatically.`
            : 'Cloud sync problem'}
        </p>
        {status.error && <p className="mt-0.5 text-amber-800/90 break-words">{status.error}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => { setDismissed(false); void flushOutbox(); retryCloudState() }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-800 hover:bg-amber-100 cursor-pointer shadow-2xs"
        >
          <RotateCcw size={12} /> Retry
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg text-amber-700 hover:text-amber-900 hover:bg-amber-200/60 cursor-pointer transition-colors"
          title="Close notice"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
