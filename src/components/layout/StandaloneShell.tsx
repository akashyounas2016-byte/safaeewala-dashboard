import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ConfirmHost } from '@/components/common/ConfirmHost'
import { FormGuard } from '@/components/common/FormGuard'

/**
 * UX-188: full-screen pages outside the Layout (the Excel Job Sheet) also get the confirm dialog, the toasts and
 * the required-field check. Without them a "Save anyway?" question (e.g. a phone number not in UAE format, a
 * possible duplicate client) was never shown and its Save waited for ever — Add New Client on the Excel sheet
 * "did not save" (2026-11-21).
 */
export function StandaloneShell() {
  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <ConfirmHost />
      <FormGuard />
      <Outlet />
    </>
  )
}
