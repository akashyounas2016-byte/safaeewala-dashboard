import { toast } from 'sonner'

/**
 * In-app notifications and confirmations (UX-02) — replace the browser's alert() / confirm(),
 * which block the page and don't match the design.
 */
export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast(message),
  warning: (message: string) => toast.warning(message),
}

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
}

export const CONFIRM_EVENT = 'safaeewala:confirm'
export interface ConfirmRequest extends ConfirmOptions { resolve: (ok: boolean) => void }

/** Promise-based confirm rendered by <ConfirmHost /> in the layout */
export function confirmAsync(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent<ConfirmRequest>(CONFIRM_EVENT, { detail: { ...opts, resolve } }))
  })
}
