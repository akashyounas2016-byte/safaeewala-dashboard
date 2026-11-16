import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CONFIRM_EVENT, type ConfirmRequest } from '@/lib/notify'

/** Renders confirmAsync() requests as an in-app dialog (UX-02). Mounted once in Layout. */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const [typed, setTyped] = useState('')
  // UX-165: spaces at the ends and doubled spaces do not count; the letters must match
  const norm = (t: string) => t.trim().replace(/\s+/g, ' ')
  const typedOk = !req?.typeToConfirm || norm(typed) === norm(req.typeToConfirm)

  useEffect(() => {
    const onRequest = (e: Event) => { setTyped(''); setReq((e as CustomEvent<ConfirmRequest>).detail) }
    window.addEventListener(CONFIRM_EVENT, onRequest)
    return () => window.removeEventListener(CONFIRM_EVENT, onRequest)
  }, [])

  const close = (ok: boolean) => {
    if (ok && !typedOk) return
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
          {req.typeToConfirm && (
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700">Type <strong className="text-rose-700 select-all">{req.typeToConfirm}</strong> to confirm</span>
              <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus aria-label="Type the name to confirm"
                onKeyDown={e => { if (e.key === 'Enter' && typedOk) close(true) }} placeholder={req.typeToConfirm}
                className="mt-1.5 w-full h-10 px-3 rounded-xl border border-rose-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none text-[13px]" />
            </label>
          )}
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => close(false)}>
              {req.cancelLabel || 'Cancel'}
            </Button>
            <Button
              type="button"
              autoFocus={!req.typeToConfirm}
              disabled={!typedOk}
              className={`flex-1 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed ${req.tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'}`}
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
