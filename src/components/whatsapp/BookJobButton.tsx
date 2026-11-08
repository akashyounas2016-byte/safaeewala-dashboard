import { useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { NewBookingModal } from '@/components/bookings/NewBookingModal'
import { useData } from '@/store/DataContext'
import { chatToJob } from '@/lib/leadBooking'

/**
 * R-INBOX-06: "Book Job" in a chat header — the Daily Job Sheet's Add Job popup, filled from the chat
 * (client's building / area when known, name + number for a new client). Saving makes the booking and its job row.
 */
export function BookJobButton({ clientId, name, phone, channel, disabled }: { clientId?: string | null; name: string; phone?: string; channel: string; disabled?: boolean }) {
  const { clients, addBooking } = useData()
  const [open, setOpen] = useState(false)
  const prefill = useMemo(() => (open ? { clientId: clientId || undefined, name: name.replace(/^DEMO · /, ''), phone, job: chatToJob({ clientId, name, phone, channel }, clients) } : null), [open, clientId, name, phone, channel, clients])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? 'Demo chat — nothing is booked' : 'Book a job for this client'}
        className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-40 shrink-0">
        <CalendarPlus size={13} /> Book Job
      </button>
      {open && (
        <NewBookingModal open={open} onClose={() => setOpen(false)} title={`Book Job — ${name.replace(/^DEMO · /, '')}`} prefill={prefill}
          onAdd={b => addBooking({ ...b, client_phone: b.client_phone || phone || '', source: channel.toLowerCase() })} />
      )}
    </>
  )
}
