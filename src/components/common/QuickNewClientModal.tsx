import { useMemo } from 'react'
import { useData } from '@/store/DataContext'
import type { Client } from '@/types'
import { notify } from '@/lib/notify'
import { ClientModalForm } from '@/components/clients/ClientModalForm'

export interface QuickNewClientModalProps {
  open: boolean
  onClose: () => void
  initialName?: string
  initialArea?: string
  initialBuilding?: string
  /** R-LEAD-02: the number from a website lead */
  initialPhone?: string
  onClientRegistered: (client: Client) => void
}

/**
 * New client typed on a job (Add Job Entry, Excel Job Sheet, row edit): opens the same "Add New Client"
 * popup as the Clients screen, with the typed address filled in, so details and WhatsApp number are saved
 * before the job entry is finished.
 */
export function QuickNewClientModal({
  open,
  onClose,
  initialName = '',
  initialArea = '',
  initialBuilding = '',
  initialPhone = '',
  onClientRegistered,
}: QuickNewClientModalProps) {
  const { addClient, employees } = useData()

  const prefill = useMemo<Partial<Client>>(() => ({
    full_name: initialName,
    building_name: initialBuilding || initialName,
    area: initialArea,
    ...(initialPhone ? { phone: initialPhone, whatsapp: initialPhone } : {}),
  }), [initialName, initialBuilding, initialArea, initialPhone])

  return (
    <ClientModalForm
      open={open}
      onClose={onClose}
      employees={employees}
      prefill={prefill}
      onSave={data => {
        const payload: Omit<Client, 'id' | 'created_at'> = {
          full_name: data.full_name || 'New Client',
          phone: data.phone || data.whatsapp || '—',
          whatsapp: data.whatsapp || data.phone || '',
          email: data.email || '',
          city: data.city || 'Dubai',
          building_name: data.building_name || undefined,
          apartment: data.apartment || undefined,
          area: data.area || 'Dubai',
          preferred_cleaner: data.preferred_cleaner || '',
          remarks: data.remarks || '',
          notes: data.notes || '',
          access_notes: data.access_notes || '',
          advance_amount: data.advance_amount || 0,
          adjustment_amount: data.adjustment_amount || 0,
          pending_amount: data.pending_amount || 0,
          source: 'daily_job_sheet',
          total_bookings: 1,
          total_spent: 0,
        }
        addClient(payload)
        notify.success(`New client "${payload.full_name}" registered in system!`)
        onClientRegistered({ ...payload, id: `client-${Date.now()}`, created_at: new Date().toISOString() })
      }}
    />
  )
}
