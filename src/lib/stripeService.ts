// Stripe Payment Service - Frontend integration
// This file handles communication with your backend payment API

export interface PaymentIntentResponse {
  clientSecret: string
  paymentIntentId: string
}

export interface PaymentResult {
  success: boolean
  paymentIntentId?: string
  error?: string
}

/**
 * Create a payment intent on your backend
 * Backend must have POST /api/payments endpoint
 */
export async function createPaymentIntent(
  invoiceId: string,
  amount: number,
  clientEmail: string
): Promise<PaymentIntentResponse> {
  try {
    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId,
        amount,
        clientEmail,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to create payment intent')
    }

    return await response.json()
  } catch (error) {
    console.error('Payment intent error:', error)
    throw error
  }
}

/**
 * Process a payment (frontend card handling would go here)
 * Note: Actual card processing requires Stripe.js library
 */
export async function processPayment(
  clientSecret: string,
  cardToken: string
): Promise<PaymentResult> {
  try {
    const response = await fetch('/api/payments/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientSecret,
        cardToken,
      }),
    })

    const result = await response.json()
    return {
      success: response.ok,
      paymentIntentId: result.paymentIntentId,
      error: result.error,
    }
  } catch (error) {
    console.error('Payment processing error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Retrieve payment history for a client
 */
export async function getPaymentHistory(clientId: string) {
  try {
    const response = await fetch(`/api/payments/client/${clientId}`)
    if (!response.ok) throw new Error('Failed to fetch payment history')
    return await response.json()
  } catch (error) {
    console.error('Payment history error:', error)
    return []
  }
}

/**
 * Refund a payment
 */
export async function refundPayment(paymentIntentId: string): Promise<PaymentResult> {
  try {
    const response = await fetch('/api/payments/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId }),
    })

    const result = await response.json()
    return {
      success: response.ok,
      error: result.error,
    }
  } catch (error) {
    console.error('Refund error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Refund failed',
    }
  }
}
