import { useEffect, useState } from 'react'
import { CloudOff, RotateCcw } from 'lucide-react'
import { SYNC_STATUS_EVENT, getSyncStatus, flushOutbox } from '@/lib/syncQueue'
import { CLOUD_STATE_EVENT, getCloudStateStatus, retryCloudState } from '@/lib/cloudState'

/** Tells the user when changes have not reached Supabase yet (AUD-20) */
export function SyncStatusBanner() {
  const read = () => {
    const db = getSyncStatus()
    const cloud = getCloudStateStatus()
    return { pending: db.pending + cloud.unsynced, error: db.lastError || cloud.lastError }
  }
  const [status, setStatus] = useState(read)

  useEffect(() => {
    const update = () => setStatus(read())
    window.addEventListener(SYNC_STATUS_EVENT, update)
    window.addEventListener(CLOUD_STATE_EVENT, update)
    return () => {
      window.removeEventListener(SYNC_STATUS_EVENT, update)
      window.removeEventListener(CLOUD_STATE_EVENT, update)
    }
  }, [])

  if (status.pending === 0 && !status.error) return null

  return (
    <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 text-[12.5px]">
      <CloudOff size={16} className="mt-0.5 shrink-0 text-amber-600" />
      <div className="flex-1 min-w-0">
        <p className="font-bold">
          {status.pending > 0
            ? `${status.pending} change${status.pending === 1 ? '' : 's'} not saved to the cloud yet — kept on this device and retried automatically.`
            : 'Cloud sync problem'}
        </p>
        {status.error && <p className="mt-0.5 text-amber-800/90 break-words">{status.error}</p>}
      </div>
      <button
        type="button"
        onClick={() => { void flushOutbox(); retryCloudState() }}
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-800 hover:bg-amber-100 cursor-pointer"
      >
        <RotateCcw size={12} /> Retry
      </button>
    </div>
  )
}
