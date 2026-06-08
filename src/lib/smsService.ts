// SMS Notification Service - Twilio integration
// This file handles communication with your backend SMS API

export interface SMSPayload {
  to: string
  message: string
  templateId?: string
  variables?: Record<string, string>
}

export interface SMSResult {
  success: boolean
  messageId?: string
  cost?: number
  error?: string
}

/**
 * Send SMS to a recipient
 * Backend must have POST /api/sms/send endpoint
 */
export async function sendSMS(payload: SMSPayload): Promise<SMSResult> {
  try {
    const response = await fetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: error.message || 'Failed to send SMS',
      }
    }

    const result = await response.json()
    return {
      success: true,
      messageId: result.messageId,
      cost: result.cost,
    }
  } catch (error) {
    console.error('SMS error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Send scheduled SMS
 * Sends SMS at a specific time (appointment reminder)
 */
export async function scheduleSMS(
  payload: SMSPayload,
  scheduledTime: string
): Promise<SMSResult> {
  try {
    const response = await fetch('/api/sms/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        scheduledTime,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: error.message || 'Failed to schedule SMS',
      }
    }

    const result = await response.json()
    return {
      success: true,
      messageId: result.messageId,
    }
  } catch (error) {
    console.error('Schedule SMS error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get SMS message history
 */
export async function getSMSHistory(clientId?: string, limit: number = 50) {
  try {
    const query = new URLSearchParams({ limit: limit.toString() })
    if (clientId) query.append('clientId', clientId)

    const response = await fetch(`/api/sms/history?${query}`)
    if (!response.ok) throw new Error('Failed to fetch SMS history')

    return await response.json()
  } catch (error) {
    console.error('SMS history error:', error)
    return []
  }
}

/**
 * Get SMS campaign statistics
 */
export async function getSMSStats() {
  try {
    const response = await fetch('/api/sms/stats')
    if (!response.ok) throw new Error('Failed to fetch SMS stats')

    return await response.json()
  } catch (error) {
    console.error('SMS stats error:', error)
    return {
      totalSent: 0,
      delivered: 0,
      failed: 0,
      totalCost: 0,
    }
  }
}

/**
 * Auto-send appointment reminders
 * Triggered by booking creation
 */
export async function createAutoReminder(
  bookingId: string,
  clientPhone: string,
  appointmentTime: string,
  serviceType: string,
  clientName: string
): Promise<SMSResult> {
  const hoursUntilAppointment = calculateHoursUntil(appointmentTime)

  // 24h before
  if (hoursUntilAppointment >= 24) {
    const reminderTime24h = new Date(new Date(appointmentTime).getTime() - 24 * 60 * 60 * 1000)
    await scheduleSMS(
      {
        to: clientPhone,
        message: `Hi ${clientName}, reminder: Your ${serviceType} cleaning is scheduled for tomorrow at ${new Date(appointmentTime).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}. Call us at +971 55 628 2374 to reschedule.`,
      },
      reminderTime24h.toISOString()
    )
  }

  // 2h before
  const reminderTime2h = new Date(new Date(appointmentTime).getTime() - 2 * 60 * 60 * 1000)
  return scheduleSMS(
    {
      to: clientPhone,
      message: `Hi ${clientName}, our team will arrive in 2 hours for your ${serviceType} cleaning. Please ensure the property is accessible.`,
    },
    reminderTime2h.toISOString()
  )
}

/**
 * Helper function
 */
function calculateHoursUntil(appointmentTime: string): number {
  const now = new Date().getTime()
  const appointment = new Date(appointmentTime).getTime()
  return (appointment - now) / (1000 * 60 * 60)
}
