// Email notification service
// This integrates with a backend email service

export async function sendInvoiceReminder(clientEmail: string, invoiceNumber: string, amount: number, dueDate: string) {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: clientEmail,
        subject: `Invoice ${invoiceNumber} Payment Reminder - Safaeewala`,
        template: 'invoice_reminder',
        data: {
          invoiceNumber,
          amount: `AED ${amount.toLocaleString()}`,
          dueDate,
          companyName: 'Safaeewala Cleaning & Maintenance LLC',
          companyPhone: '+971 55 628 2374',
          companyEmail: 'info@safaeewala.com',
        },
      }),
    })
    return response.ok
  } catch (error) {
    console.error('Email send failed:', error)
    return false
  }
}

export async function sendJobCompletionNotification(crewEmail: string, jobDetails: {
  clientName: string
  serviceType: string
  address: string
  completionTime: string
}) {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: crewEmail,
        subject: `✓ Job Complete - ${jobDetails.clientName}`,
        template: 'job_completion',
        data: jobDetails,
      }),
    })
    return response.ok
  } catch (error) {
    console.error('Email send failed:', error)
    return false
  }
}

export async function sendPaymentConfirmation(clientEmail: string, invoiceNumber: string, amount: number, paymentDate: string) {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: clientEmail,
        subject: `✓ Payment Received - Invoice ${invoiceNumber}`,
        template: 'payment_confirmation',
        data: {
          invoiceNumber,
          amount: `AED ${amount.toLocaleString()}`,
          paymentDate,
          companyName: 'Safaeewala Cleaning & Maintenance LLC',
        },
      }),
    })
    return response.ok
  } catch (error) {
    console.error('Email send failed:', error)
    return false
  }
}
