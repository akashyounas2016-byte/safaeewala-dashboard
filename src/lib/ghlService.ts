import { todayDubai } from '@/lib/dubaiTime'
/**
 * Safaeewala CRM - GoHighLevel (GHL) Integration Service
 * Manages GHL connection credentials, webhook workflow triggers, and booking confirmation email automation.
 */

export interface GHLConfig {
  enabled: boolean
  locationId: string
  apiKey: string
  webhookUrl: string
  autoSendOnBooking: boolean
  autoSendOnConvert: boolean
  lastConnectedAt?: string
}

const GHL_STORAGE_KEY = 'safaeewala_ghl_config'

export const DEFAULT_GHL_CONFIG: GHLConfig = {
  enabled: false,
  locationId: '',
  apiKey: '',
  webhookUrl: '',
  autoSendOnBooking: true,
  autoSendOnConvert: true,
  lastConnectedAt: undefined,
}

export function getGHLConfig(): GHLConfig {
  try {
    const raw = localStorage.getItem(GHL_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_GHL_CONFIG }
    const parsed = JSON.parse(raw)
    // TA-18: an API key saved by an older version is removed from the browser
    if (parsed.apiKey) { delete parsed.apiKey; localStorage.setItem(GHL_STORAGE_KEY, JSON.stringify(parsed)) }
    return { ...DEFAULT_GHL_CONFIG, ...parsed, apiKey: '' }
  } catch {
    return { ...DEFAULT_GHL_CONFIG }
  }
}

export function saveGHLConfig(config: Partial<GHLConfig>): GHLConfig {
  try {
    const current = getGHLConfig()
    const updated = { ...current, ...config }
    localStorage.setItem(GHL_STORAGE_KEY, JSON.stringify(updated))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('safaeewala_ghl_config_updated', { detail: updated }))
    }
    return updated
  } catch {
    return { ...DEFAULT_GHL_CONFIG, ...config }
  }
}

export interface BookingConfirmationPayload {
  client_name: string
  client_phone: string
  client_email?: string
  service_type: string
  scheduled_date: string
  scheduled_time: string
  service_address: string
  total_amount?: number
  lead_id?: string
  notes?: string
}

/**
 * Test GHL connection by sending a test ping to the webhook or checking API credentials.
 */
export async function testGHLConnection(configOverride?: GHLConfig): Promise<{ success: boolean; message: string }> {
  const config = configOverride || getGHLConfig()

  // No webhook URL → test the API key held on the server (step 2 below, TA-18)

  // 1. If Webhook URL is provided, test by dispatching a test event
  if (config.webhookUrl) {
    try {
      const res = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          event: 'test_connection',
          source: 'Safaeewala CRM',
          timestamp: new Date().toISOString(),
          test_message: 'Testing GoHighLevel connection from Safaeewala CRM',
          sample_client: {
            name: 'Akash Younas (Test)',
            phone: '+971501234567',
            email: 'admin@safaeewala.com',
            service: 'Deep Cleaning',
            date: todayDubai(),
            address: 'Downtown Dubai',
          },
        }),
        mode: 'no-cors', // Avoid browser CORS block if GHL webhook does not send permissive CORS headers
      })

      const now = new Date().toISOString()
      saveGHLConfig({ ...config, lastConnectedAt: now, enabled: true })

      return {
        success: true,
        message: '✓ Test signal successfully dispatched to GoHighLevel Webhook! Check your GHL Execution Logs.',
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to trigger GHL Webhook: ${err.message || 'Network error'}`,
      }
    }
  }

  // 2. API key on the server (GHL_API_KEY) — TA-18
  {
    try {
      const res = await fetch('/api/ghl/test', { method: 'POST' })
      const out = await res.json().catch(() => ({})) as { success?: boolean; message?: string }
      if (res.ok && out.success) {
        const now = new Date().toISOString()
        saveGHLConfig({ ...config, lastConnectedAt: now, enabled: true })
        return {
          success: true,
          message: '✓ Successfully authenticated with GoHighLevel API v2!',
        }
      } else {
        return {
          success: false,
          message: `GHL API returned status ${res.status}. Please check your API Token and Location ID permissions.`,
        }
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Could not reach GHL API: ${err.message}`,
      }
    }
  }

  return { success: false, message: 'Invalid configuration' }
}

/**
 * Dispatch booking confirmation data to GoHighLevel for automated email / SMS workflows.
 */
export async function sendGHLBookingConfirmation(
  booking: BookingConfirmationPayload
): Promise<{ success: boolean; message: string }> {
  const config = getGHLConfig()

  if (!config.enabled) {
    return { success: false, message: 'GHL integration is currently disabled in Settings.' }
  }

  // The API key (if any) is on the server — the browser only knows the webhook URL (TA-18)

  const nameParts = (booking.client_name || '').trim().split(' ')
  const firstName = nameParts[0] || 'Guest'
  const lastName = nameParts.slice(1).join(' ') || ''

  const payload = {
    event: 'booking_confirmed',
    source: 'Safaeewala CRM',
    timestamp: new Date().toISOString(),
    lead_id: booking.lead_id || '',
    contact: {
      first_name: firstName,
      last_name: lastName,
      name: booking.client_name,
      phone: booking.client_phone,
      email: booking.client_email || '',
      address: booking.service_address,
      tags: ['safaeewala-booking', 'booking-confirmed', 'website-lead'],
    },
    booking: {
      service_type: booking.service_type,
      scheduled_date: booking.scheduled_date,
      scheduled_time: booking.scheduled_time,
      service_address: booking.service_address,
      total_amount_aed: booking.total_amount || 0,
      notes: booking.notes || '',
    },
    // Flattened fields for easy mapping in GHL email templates
    client_name: booking.client_name,
    first_name: firstName,
    last_name: lastName,
    phone: booking.client_phone,
    email: booking.client_email || '',
    service_type: booking.service_type,
    scheduled_date: booking.scheduled_date,
    scheduled_time: booking.scheduled_time,
    service_address: booking.service_address,
    total_amount: booking.total_amount || 0,
  }

  try {
    // Dispatch to Webhook URL if provided
    if (config.webhookUrl) {
      await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'no-cors',
      })
    }

    // Upsert contact in GHL if API key & locationId are present
    {
      try {
        // Upsert through our server, which adds the API key and location (TA-18)
        await fetch('/api/ghl/contacts/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName,
            lastName,
            name: booking.client_name,
            phone: booking.client_phone,
            email: booking.client_email || undefined,
            address1: booking.service_address,
            city: 'Dubai',
            country: 'AE',
            tags: ['safaeewala-booking', 'booking-confirmed'],
          }),
        })
      } catch (apiErr) {
        console.warn('[GHL API Upsert Notice]:', apiErr)
      }
    }

    return {
      success: true,
      message: `✓ Booking confirmation successfully sent to GoHighLevel for ${booking.client_name}!`,
    }
  } catch (err: any) {
    console.error('[GHL Dispatch Error]:', err)
    return {
      success: false,
      message: `Failed to notify GHL: ${err.message}`,
    }
  }
}
