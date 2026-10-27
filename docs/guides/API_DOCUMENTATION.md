# Safaeewala Dashboard - API Documentation

## Production Setup Guides

### 1. Email Service Setup (SendGrid)

**Step 1: Get SendGrid API Key**
```bash
# Sign up at https://sendgrid.com
# Create API key in Settings > API Keys
# Copy the key
```

**Step 2: Configure Environment Variables**
```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
SMTP_FROM_EMAIL=noreply@safaeewala.com
SMTP_FROM_NAME=Safaeewala Cleaning
```

**Step 3: Use Email Service**
```typescript
import { sendEmail } from '@/lib/smtpEmailService'

const config = {
  smtpHost: process.env.SMTP_HOST!,
  smtpPort: 587,
  smtpUser: process.env.SMTP_USER!,
  smtpPassword: process.env.SMTP_PASSWORD!,
  fromEmail: process.env.SMTP_FROM_EMAIL!,
  fromName: process.env.SMTP_FROM_NAME!,
}

// Send invoice reminder
await sendEmail(config, {
  to: 'client@example.com',
  subject: 'Payment Reminder',
  template: 'invoice_reminder',
  data: {
    invoiceNumber: 'INV-001',
    amount: 'AED 500',
    dueDate: '2026-06-15',
    companyName: 'Safaeewala',
    companyPhone: '+971 55 628 2374',
    companyEmail: 'info@safaeewala.com',
  },
})
```

---

### 2. Payment Reminders with Cron Jobs

**Option A: Node.js Backend (Recommended)**

```typescript
// backend/jobs/paymentReminders.ts
import cron from 'node-cron'
import { checkAndSendPaymentReminders } from '@/lib/paymentReminderService'

// Run every day at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('Running payment reminders...')
  const invoices = await fetchInvoices()
  const clients = await fetchClients()
  const result = await checkAndSendPaymentReminders(
    { /* smtp config */ },
    invoices,
    clients
  )
  console.log(`Sent ${result.sent} reminders, ${result.failed} failed`)
})
```

**Option B: Supabase Functions**

```typescript
// Create Supabase Edge Function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: invoices } = await supabase.from('invoices').select('*')
  const { data: clients } = await supabase.from('clients').select('*')

  // Send reminders...
  return new Response(JSON.stringify({ ok: true }))
})

// Deploy: supabase functions deploy payment-reminders
// Schedule: supabase functions schedule payment-reminders --cron "0 9 * * *"
```

**Option C: External Cron Service (Easiest)**

```bash
# Use EasyCron.com or similar
# Create webhook to: https://your-api.com/api/cron/payment-reminders
# Schedule: Daily at 9 AM

# Backend endpoint:
POST /api/cron/payment-reminders
Authorization: Bearer CRON_SECRET_KEY
```

---

### 3. Error Logging Setup

**Initialize in Main App**
```typescript
// src/main.tsx
import { setupGlobalErrorHandler } from '@/lib/errorLogger'

setupGlobalErrorHandler()
```

**Create Backend Endpoint for Logs**
```typescript
// backend/routes/logs.ts
app.post('/api/logs/errors', (req, res) => {
  const errorLog = req.body
  
  // Store in database
  db.insert('error_logs', errorLog)
  
  // Send alert if critical
  if (errorLog.severity === 'critical') {
    sendEmailAlert(errorLog)
  }
  
  res.json({ ok: true })
})
```

**Monitor Errors**
```typescript
import { ErrorLogger } from '@/lib/errorLogger'

const logger = ErrorLogger.getInstance()
const stats = await logger.getErrorStats(7) // Last 7 days
console.log(`${stats.totalErrors} errors, ${stats.criticalCount} critical`)
```

---

### 4. Photo Upload to Cloud Storage

**Option A: AWS S3**

```typescript
import AWS from 'aws-sdk'

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
})

async function uploadJobPhoto(file: File, jobId: string) {
  const buffer = await file.arrayBuffer()
  const params = {
    Bucket: 'safaeewala-photos',
    Key: `jobs/${jobId}/${Date.now()}.jpg`,
    Body: buffer,
    ContentType: file.type,
  }
  
  const result = await s3.upload(params).promise()
  return result.Location // Photo URL
}
```

**Option B: Firebase Storage**

```typescript
import { storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

async function uploadJobPhoto(file: File, jobId: string) {
  const storageRef = ref(storage, `jobs/${jobId}/${Date.now()}`)
  const snapshot = await uploadBytes(storageRef, file)
  return await getDownloadURL(snapshot.ref)
}
```

---

### 5. Time Tracking Payroll Reports

**Generate Monthly Payroll**

```typescript
import { generatePayrollReport } from '@/lib/timeTrackingService'

const employees = await fetchEmployees()
const timeEntries = await fetchTimeEntries('2026-06')

const report = generatePayrollReport(
  employees,
  timeEntries,
  'June 2026'
)

// Export to CSV
exportToCSV(report, 'payroll-june-2026.csv')
```

**Payroll Report Includes:**
- Regular hours at standard rate
- Overtime hours at 1.5x rate
- Total pay per employee
- On-time completion rate
- Job accuracy metrics

---

## Error Handling

### Global Error Handler

All unhandled errors are automatically logged with:
- Error type and message
- Stack trace
- User email
- Page/URL
- Timestamp
- User agent

**Example: Tracking API errors**
```typescript
import { apiCall } from '@/lib/errorLogger'

try {
  const data = await apiCall('/api/invoices', 
    { method: 'GET' },
    { action: 'fetch-invoices', data: { month: '2026-06' } }
  )
} catch (error) {
  // Automatically logged with context
}
```

### Error Severity Levels

- **Critical**: System down, data loss risk → Alert admins immediately
- **Error**: Feature broken, user can't proceed → Log and monitor
- **Warning**: Degraded experience, user can retry → Log only
- **Info**: For debugging, no user impact → Dev only

---

## Monitoring Dashboard

**View Error Stats**
```typescript
const logger = ErrorLogger.getInstance()
const stats = await logger.getErrorStats(7)

console.log({
  totalErrors: stats.totalErrors,      // 12
  criticalErrors: stats.criticalCount,  // 2
  topIssues: stats.errorsByType,        // { "APIError": 5, "NetworkError": 3 }
})
```

**Export Logs**
```typescript
const allErrors = await errorDb.getAllErrors()
saveAsJSON(allErrors, 'error-logs.json')
```

---

## Testing

### Test Email Service
```typescript
// Send test email
await sendEmail(config, {
  to: 'you@example.com',
  subject: 'Test Email',
  template: 'invoice_reminder',
  data: { /* ... */ }
})
```

### Test Error Logger
```typescript
const logger = ErrorLogger.getInstance()
logger.logError(new Error('Test error'), {
  severity: 'warning',
  type: 'TestError',
  action: 'testing-error-logger',
})
```

### Test Time Tracking
```typescript
const hours = calculatePayrollHours(timeEntries, 60)
console.log(`Total pay: AED ${hours.totalPay}`)
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Emails not sending | Check SendGrid API key in .env |
| Errors not logged | Verify /api/logs/errors endpoint exists |
| Photos not uploading | Check S3/Firebase credentials |
| Cron job not running | Verify CRON_SECRET_KEY header |
| Dark mode not working | Check localStorage permissions |

---

## Environment Variables Template

```env
# Email Service
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
SMTP_FROM_EMAIL=noreply@safaeewala.com
SMTP_FROM_NAME=Safaeewala Cleaning

# Cloud Storage
AWS_ACCESS_KEY_ID=xxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxx
AWS_REGION=me-south-1
AWS_BUCKET=safaeewala-photos

# Cron Security
CRON_SECRET_KEY=your-secret-key-here

# Error Logging
ERROR_LOG_ENDPOINT=https://your-api.com/api/logs/errors

# Firebase (if using Firebase)
FIREBASE_PROJECT_ID=safaeewala-db
FIREBASE_API_KEY=xxxxxxxxxxxxx
```

---

## Support

For questions or issues:
- 📧 tech@safaeewala.com
- 📞 +971 55 628 2374
- 🔗 GitHub Issues: https://github.com/safaeewala/dashboard
