// SMTP Email Service - Production ready with Nodemailer/SendGrid integration

export interface EmailConfig {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  fromEmail: string
  fromName: string
}

export interface EmailPayload {
  to: string
  subject: string
  template: string
  data: Record<string, any>
}

// Email templates
const emailTemplates = {
  invoice_reminder: (data: any) => `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2>Payment Reminder - Invoice ${data.invoiceNumber}</h2>
        <p>Dear Client,</p>
        <p>This is a friendly reminder that your invoice <strong>${data.invoiceNumber}</strong> is due on <strong>${data.dueDate}</strong>.</p>
        <p><strong>Amount Due: ${data.amount}</strong></p>

        <h3>Payment Methods:</h3>
        <ul>
          <li>Bank Transfer</li>
          <li>Credit Card</li>
          <li>Cash Payment</li>
        </ul>

        <p>Contact us if you have any questions:</p>
        <p>
          📞 ${data.companyPhone}<br>
          📧 ${data.companyEmail}
        </p>

        <p>Best regards,<br><strong>${data.companyName}</strong></p>
      </body>
    </html>
  `,

  job_completion: (data: any) => `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2>✓ Job Completed</h2>
        <p>Dear Team,</p>
        <p>Job completion confirmed for <strong>${data.clientName}</strong></p>

        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr style="background: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd;">Service</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.serviceType}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;">Address</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.address}</td>
          </tr>
          <tr style="background: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd;">Completion Time</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${data.completionTime}</td>
          </tr>
        </table>

        <p>Thanks for your excellent work!</p>
      </body>
    </html>
  `,

  payment_confirmation: (data: any) => `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2>✓ Payment Received</h2>
        <p>Dear Client,</p>
        <p>Thank you! We have received your payment.</p>

        <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Invoice:</strong> ${data.invoiceNumber}</p>
          <p><strong>Amount:</strong> ${data.amount}</p>
          <p><strong>Date:</strong> ${data.paymentDate}</p>
        </div>

        <p>We appreciate your prompt payment!</p>
        <p><strong>${data.companyName}</strong></p>
      </body>
    </html>
  `,

  error_alert: (data: any) => `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #d32f2f;">⚠️ System Error Alert</h2>
        <p><strong>Error:</strong> ${data.errorMessage}</p>
        <p><strong>Timestamp:</strong> ${data.timestamp}</p>
        <p><strong>User:</strong> ${data.userEmail}</p>
        <p><strong>Page:</strong> ${data.page}</p>

        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Stack Trace:</strong></p>
          <pre style="overflow-x: auto;">${data.stackTrace}</pre>
        </div>

        <p>Please investigate this issue immediately.</p>
      </body>
    </html>
  `,
}

export async function sendEmail(config: EmailConfig, payload: EmailPayload): Promise<boolean> {
  try {
    // Always use backend SMTP endpoint for security
    // (Frontend should never have SendGrid API keys)
    const backendResponse = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        html: emailTemplates[payload.template as keyof typeof emailTemplates]?.(payload.data),
      }),
    })

    if (backendResponse.ok) {
      console.log(`✓ Email sent to ${payload.to}`)
      return true
    }

    console.error(`✗ Failed to send email to ${payload.to}`)
    return false
  } catch (error) {
    console.error('Email service error:', error)
    return false
  }
}

// Helper to send invoice reminders in bulk
export async function sendBulkInvoiceReminders(
  config: EmailConfig,
  invoices: any[],
  clients: any[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  const promises = invoices.map(invoice => {
    const client = clients.find(c => c.id === invoice.client_id)
    if (!client || !client.email) return Promise.resolve(false)

    return sendEmail(config, {
      to: client.email,
      subject: `Payment Reminder: Invoice ${invoice.invoice_number}`,
      template: 'invoice_reminder',
      data: {
        invoiceNumber: invoice.invoice_number,
        amount: `AED ${invoice.total.toLocaleString()}`,
        dueDate: invoice.due_date,
        companyName: 'Safaeewala Cleaning & Maintenance LLC',
        companyPhone: '+971 55 628 2374',
        companyEmail: 'info@safaeewala.com',
      },
    }).then(success => {
      if (success) sent++
      else failed++
      return success
    })
  })

  await Promise.all(promises)
  return { sent, failed }
}
