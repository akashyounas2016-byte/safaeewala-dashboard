import React from 'react'
import { Globe, MessageSquare } from 'lucide-react'
import type { Booking, Client } from '@/types'

export type LeadSourceOrigin = 'fluent_forms' | 'whatsapp' | null

/**
 * Resolves whether a booking originated from Fluent Forms or WhatsApp CRM.
 * Daily Job Sheet records or standard manual bookings return null (no tag applied).
 */
export function resolveBookingSource(b: Partial<Booking> | null | undefined): LeadSourceOrigin {
  if (!b) return null

  // Direct source field
  if (b.source === 'fluent_forms' || b.source === 'fluent-forms') return 'fluent_forms'
  if (b.source === 'whatsapp' || b.source === 'whatsapp_crm') return 'whatsapp'
  if (b.source === 'daily_job_sheet') return null

  // Fallback to checking notes or reference IDs
  const notes = (b.notes || '').toLowerCase()
  if (
    notes.includes('fluent form') ||
    notes.includes('fluent_form') ||
    notes.includes('safaeewala.com') ||
    notes.includes('website form') ||
    notes.includes('auto-synced from converted fluent form')
  ) {
    return 'fluent_forms'
  }

  if (
    notes.includes('whatsapp crm') ||
    notes.includes('whatsapp inquiry') ||
    notes.includes('whatsapp lead') ||
    notes.includes('via whatsapp')
  ) {
    return 'whatsapp'
  }

  return null
}

/**
 * Resolves whether a client originated from Fluent Forms or WhatsApp CRM.
 * Daily Job Sheet records (e.g. dj- prefix or extracted from daily jobs) return null.
 */
export function resolveClientSource(
  c: Partial<Client> | null | undefined,
  bookings: Booking[] = []
): LeadSourceOrigin {
  if (!c) return null

  // Explicit Daily Job Sheet clients never receive a source tag
  if (c.id && c.id.startsWith('dj-')) return null
  if (c.source === 'daily_job_sheet') return null

  // Direct source field
  if (c.source === 'fluent_forms' || c.source === 'fluent-forms') return 'fluent_forms'
  if (c.source === 'whatsapp' || c.source === 'whatsapp_crm') return 'whatsapp'

  // Access notes or notes check
  const text = `${c.access_notes || ''}`.toLowerCase()
  if (text.includes('fluent form') || text.includes('safaeewala.com')) return 'fluent_forms'
  if (text.includes('whatsapp')) return 'whatsapp'

  // Cross-reference with bookings associated with this client
  const clientName = (c.full_name || '').toLowerCase().trim()
  const matchingBooking = bookings.find(
    b => (c.id && b.client_id === c.id) || (clientName && b.client_name.toLowerCase().trim() === clientName)
  )

  if (matchingBooking) {
    const bookingSrc = resolveBookingSource(matchingBooking)
    if (bookingSrc) return bookingSrc
  }

  return null
}

/**
 * Clean source origin badge component.
 * Renders only for Fluent Forms and WhatsApp CRM. Renders nothing for Daily Job Sheet records.
 */
export function SourceOriginTag({
  source,
  className = '',
}: {
  source: LeadSourceOrigin
  className?: string
}) {
  if (!source) return null

  if (source === 'fluent_forms') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/90 shrink-0 shadow-2xs ${className}`}
        title="Origin: Website Fluent Forms Submission"
      >
        <Globe size={11} className="text-indigo-600" />
        <span>Fluent Form</span>
      </span>
    )
  }

  if (source === 'whatsapp') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/90 shrink-0 shadow-2xs ${className}`}
        title="Origin: WhatsApp CRM Lead"
      >
        <MessageSquare size={11} className="text-emerald-600" />
        <span>WhatsApp CRM</span>
      </span>
    )
  }

  return null
}
