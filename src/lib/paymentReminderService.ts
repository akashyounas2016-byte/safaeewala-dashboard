// Automated payment reminder service
import { sendInvoiceReminder } from './emailService'

export async function checkAndSendPaymentReminders(invoices: any[], clients: any[]) {
  const today = new Date()
  const remindersToSend = []

  for (const invoice of invoices) {
    // Skip if already paid
    if (invoice.status === 'paid') continue

    const dueDate = new Date(invoice.due_date)
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    // Send reminder 3 days before due, 1 day after due, and weekly after that
    const shouldRemind =
      daysUntilDue === 3 || // 3 days before
      daysUntilDue === 1 || // 1 day before
      (daysUntilDue <= -1 && daysUntilDue % 7 === 0) // Weekly after due

    if (shouldRemind) {
      const client = clients.find(c => c.id === invoice.client_id)
      if (client && client.email) {
        remindersToSend.push({
          clientEmail: client.email,
          invoiceNumber: invoice.invoice_number,
          amount: invoice.total,
          dueDate: invoice.due_date,
          status: daysUntilDue < 0 ? 'overdue' : 'upcoming',
        })
      }
    }
  }

  // Send reminders in parallel
  const results = await Promise.all(
    remindersToSend.map(r =>
      sendInvoiceReminder(r.clientEmail, r.invoiceNumber, r.amount, r.dueDate)
    )
  )

  return {
    sent: results.filter(r => r).length,
    total: remindersToSend.length,
  }
}

export async function generatePaymentReminder(invoice: any): Promise<string> {
  const dueDate = new Date(invoice.due_date)
  const today = new Date()
  const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

  if (daysOverdue > 0) {
    return `⚠️ OVERDUE ${daysOverdue} days - Please pay immediately`
  } else {
    const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return `📅 Due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`
  }
}
