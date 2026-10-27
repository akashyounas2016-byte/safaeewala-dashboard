import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CONFIRM_EVENT, type ConfirmRequest } from '@/lib/notify'

/** Renders confirmAsync() requests as an in-app dialog (UX-02). Mounted once in Layout. */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    const onRequest = (e: Event) => setReq((e as CustomEvent<ConfirmRequest>).detail)
    window.addEventListener(CONFIRM_EVENT, onRequest)
    return () => window.removeEventListener(CONFIRM_EVENT, onRequest)
  }, [])

  const close = (ok: boolean) => {
    req?.resolve(ok)
    setReq(null)
  }

  return (
    <Modal open={!!req} onClose={() => close(false)} title={req?.title || 'Please confirm'} size="sm">
      {req && (
        <div className="space-y-4">
          <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${req.tone === 'danger' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
            <AlertTriangle size={17} className={`shrink-0 mt-0.5 ${req.tone === 'danger' ? 'text-rose-600' : 'text-amber-600'}`} />
            <p className="text-[13px] whitespace-pre-line">{req.message}</p>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => close(false)}>
              {req.cancelLabel || 'Cancel'}
            </Button>
            <Button
              type="button"
              autoFocus
              className={`flex-1 text-white font-bold ${req.tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'}`}
              onClick={() => close(true)}
            >
              {req.confirmLabel || 'Confirm'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
