# SMS Notifications Setup Guide

Complete guide to enable automated SMS reminders and notifications using Twilio.

---

## Part 1: Create & Configure Twilio Account

### Step 1: Sign Up for Twilio
1. Go to **https://www.twilio.com/try-twilio**
2. Sign up with your email address
3. Verify your email
4. Create your account with:
   - Business Name: **Safaeewala Cleaning & Maintenance**
   - Product: **SMS**
   - Use Case: **Appointment Reminders**

### Step 2: Get Your Twilio Credentials
1. Log into **Twilio Console** (https://console.twilio.com)
2. Go to **Account** (left sidebar)
3. Copy your:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (keep this secret!)
4. Save these credentials securely

### Step 3: Get a Phone Number
1. In Twilio Console, click **Phone Numbers** (left sidebar)
2. Click **Buy a Number**
3. Search for UAE numbers or use any number (Twilio supports international)
4. Click **Buy** (cost: ~$1/month)
5. Note your **Twilio Phone Number** (e.g., +971-XXXXXXX)

---

## Part 2: Configure Environment Variables

### Step 1: Add Keys to VPS .env File

SSH into your VPS and edit the environment file:

```bash
ssh root@187.77.116.14
nano /root/safaeewala-dashboard/.env
```

Add these lines:

```env
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+971501234567

# SMS Settings
SMS_ENABLED=true
SMS_COST_PER_MESSAGE=0.18
SMS_SENDER_NAME=Safaeewala
```

Replace with your actual Twilio credentials.

### Step 2: Save and Restart

```bash
# Save (Ctrl+O, Enter, Ctrl+X)
cd /root/safaeewala-dashboard
npm run build
# Restart your Node process
```

---

## Part 3: Backend API Implementation

Your backend needs endpoints for SMS functionality:

### Endpoint 1: Send SMS
```typescript
// POST /api/sms/send
// Send an SMS message immediately

import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.post('/api/sms/send', async (req, res) => {
  try {
    const { to, message, templateId, variables } = req.body;

    // Validate phone number
    if (!to || !to.startsWith('+')) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Validate message length
    if (message.length > 160) {
      return res.status(400).json({ error: 'Message exceeds 160 characters' });
    }

    // Send SMS via Twilio
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
    });

    // Log to database
    await logSMSMessage({
      messageId: result.sid,
      recipient: to,
      message: message,
      status: 'sent',
      cost: 0.18,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      messageId: result.sid,
      cost: 0.18,
    });
  } catch (error) {
    console.error('SMS error:', error);
    res.status(400).json({ error: error.message });
  }
});
```

### Endpoint 2: Schedule SMS
```typescript
// POST /api/sms/schedule
// Schedule SMS to be sent at a specific time (e.g., appointment reminder)

import cron from 'node-cron';

app.post('/api/sms/schedule', async (req, res) => {
  try {
    const { to, message, scheduledTime } = req.body;

    const scheduleDate = new Date(scheduledTime);
    const now = new Date();

    if (scheduleDate <= now) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    // Create cron job for the scheduled time
    const cronExpression = `${scheduleDate.getMinutes()} ${scheduleDate.getHours()} ${scheduleDate.getDate()} ${scheduleDate.getMonth() + 1} *`;

    const task = cron.schedule(cronExpression, async () => {
      try {
        const result = await client.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: to,
        });

        // Log to database
        await logSMSMessage({
          messageId: result.sid,
          recipient: to,
          message: message,
          status: 'scheduled_sent',
          cost: 0.18,
          timestamp: new Date(),
        });

        task.stop();
      } catch (error) {
        console.error('Scheduled SMS error:', error);
      }
    });

    res.json({
      success: true,
      scheduledTime: scheduleDate,
      message: 'SMS scheduled successfully',
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

### Endpoint 3: SMS History
```typescript
// GET /api/sms/history
// Retrieve SMS message history

app.get('/api/sms/history', async (req, res) => {
  try {
    const { limit = 50, clientId } = req.query;

    let query = SMSLog.query().limit(parseInt(limit as string));

    if (clientId) {
      query = query.where('clientId', clientId);
    }

    const messages = await query
      .orderBy('timestamp', 'desc')
      .select('*');

    res.json(messages);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

### Endpoint 4: SMS Statistics
```typescript
// GET /api/sms/stats
// Get SMS campaign statistics

app.get('/api/sms/stats', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const messages = await SMSLog.query()
      .where('timestamp', '>=', thirtyDaysAgo);

    const stats = {
      totalSent: messages.length,
      delivered: messages.filter(m => m.status === 'sent').length,
      failed: messages.filter(m => m.status === 'failed').length,
      totalCost: messages.reduce((sum, m) => sum + m.cost, 0),
      deliveryRate: messages.length > 0
        ? Math.round((messages.filter(m => m.status === 'sent').length / messages.length) * 100)
        : 0,
    };

    res.json(stats);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

---

## Part 4: Auto-Send Appointment Reminders

### How It Works:
1. When a booking is created, system triggers auto-reminders
2. **24 hours before**: Client receives reminder SMS
3. **2 hours before**: Final reminder SMS
4. Reduces no-shows by ~40%

### Implementation:
```typescript
// When creating a booking, call this:

import { createAutoReminder } from '@/lib/smsService';

// After booking is saved
await createAutoReminder(
  booking.id,
  client.phone,           // +971501234567
  booking.scheduled_date, // 2026-06-15T10:00:00Z
  booking.service_type,   // "Villa Cleaning"
  client.name             // "Ahmed Al Mansoori"
);
```

---

## Part 5: SMS Templates

Pre-configured templates available in your dashboard:

### 1. 24h Appointment Reminder
```
Hi {clientName}, reminder: Your {serviceType} cleaning is scheduled for 
tomorrow at {time}. Call us at +971 55 628 2374 to reschedule.
```

### 2. 2h Appointment Reminder
```
Hi {clientName}, our team will arrive in 2 hours for your {serviceType} 
cleaning. Please ensure the property is accessible.
```

### 3. Job Completion
```
Hi {clientName}, your {serviceType} is complete! 
Rate your experience: {reviewLink}
```

### 4. Payment Reminder
```
Hi {clientName}, your invoice {invoiceId} is due on {dueDate}. 
Pay online: {paymentLink}
```

You can customize these templates in the dashboard.

---

## Part 6: Cost Structure

### Twilio Pricing (UAE):
- **Outbound SMS**: ~AED 0.18 per message
- **Inbound SMS**: ~AED 0.18 per message
- **Phone Number**: ~AED 4/month
- **No setup fees**

### Example Monthly Cost:
- 100 appointment reminders = AED 18
- 50 payment reminders = AED 9
- Phone number = AED 4
- **Total**: ~AED 31/month

---

## Part 7: Testing

### Test with Twilio Sandbox (Free)
Before going live, use Twilio's sandbox:

1. In Twilio Console → **Messaging** → **Try it out**
2. Send test SMS to verify setup
3. Use **+1 (415) 523-8886** as test number

### Test Workflow:
```
1. Create test booking for tomorrow at 10:00 AM
2. Dashboard sends 24h reminder SMS (tomorrow 10:00 AM)
3. Verify SMS received at 9:00 AM tomorrow
4. Dashboard sends 2h reminder SMS (8:00 AM)
5. Verify SMS received at 8:00 AM
```

---

## Part 8: Monitoring & Analytics

Track your SMS usage:

### Dashboard Metrics:
- **Total Sent**: All SMS messages sent
- **Delivered**: Successfully delivered
- **Failed**: Bounced or failed
- **Delivery Rate**: % successfully delivered
- **Total Cost**: Monthly SMS expenses

### Troubleshooting:
- **Message not delivered**: Check recipient phone format (+971XXXXXXXXX)
- **"Invalid account"**: Verify Twilio credentials in .env
- **High failure rate**: Check Twilio account balance and active status

---

## Part 9: Best Practices

### Phone Number Format:
- Always include country code: **+971** (UAE)
- Format: **+971XXXXXXXXX**
- Remove spaces or dashes

### Message Content:
- Keep under 160 characters (SMS limit)
- Include business contact info
- Use clear, professional language
- Time-sensitive info should include timezone

### Frequency:
- Max 2 reminders per appointment (24h, 2h)
- Don't send more than 3 SMS per customer per day
- Respect customer preferences (allow opt-out)

### Consent:
- Get customer consent before sending SMS
- Include opt-out information in messages
- Follow UAE telecommunications regulations

---

## Part 10: Going Live

### Checklist:
- [ ] Twilio account verified and active
- [ ] Phone number purchased
- [ ] API credentials added to .env
- [ ] Backend endpoints implemented
- [ ] Tested with real phone numbers
- [ ] Cost monitoring set up
- [ ] Message templates configured
- [ ] Auto-reminder cron jobs working

### Production Deployment:
```bash
# Ensure .env has live Twilio credentials
ssh root@187.77.116.14
cd /root/safaeewala-dashboard
npm run build
# Restart application
```

---

## Part 11: Compliance & Regulations

### UAE Regulations:
- SMS must include business name
- Must allow unsubscribe/opt-out
- Cannot send more than once per day without consent
- Cannot send during restricted hours (9 PM - 8 AM)

### GDPR/Privacy:
- Store SMS records securely
- Delete message logs after 90 days if not required
- Only send to opted-in numbers
- Include privacy policy link

---

## Support & Troubleshooting

### Common Issues:

| Issue | Solution |
|-------|----------|
| "Invalid phone number" | Ensure format: +971XXXXXXXXX |
| Message too long | Keep under 160 characters |
| Twilio auth error | Check Account SID and Auth Token |
| Messages not sending | Verify Twilio account balance |
| SMS cost too high | Review message frequency |

### Twilio Support:
- Docs: https://www.twilio.com/docs/sms
- Status Page: https://status.twilio.com
- Support: https://support.twilio.com

---

## Dashboard Features

Once SMS is configured, you can:
- ✅ Send SMS manually to any number
- ✅ Use pre-built templates
- ✅ Create custom templates
- ✅ Schedule SMS for specific times
- ✅ View message history
- ✅ Track delivery status
- ✅ Monitor costs
- ✅ Auto-send appointment reminders
- ✅ Payment reminders
- ✅ Job completion notifications

---

## Next Steps

1. ✅ Create Twilio account (5 min)
2. ✅ Get API credentials (2 min)
3. ✅ Purchase phone number (5 min)
4. ✅ Add credentials to VPS .env (5 min)
5. ✅ Implement backend endpoints (with your developer)
6. ✅ Test with test numbers
7. ✅ Deploy to production
8. ✅ Enable auto-reminders
9. ✅ Monitor usage and costs

---

**Dashboard Feature**: SMS Notifications  
**Status**: Ready for Twilio integration  
**Estimated Setup Time**: 15-30 minutes  
**Monthly Cost**: ~AED 30-100 depending on volume
