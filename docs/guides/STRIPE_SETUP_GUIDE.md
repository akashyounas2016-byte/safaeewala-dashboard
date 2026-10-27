# Stripe Payment Processing Setup Guide

Complete guide to enable online payment processing for your Safaeewala dashboard.

---

## Part 1: Create & Configure Stripe Account

### Step 1: Sign Up for Stripe
1. Go to **https://stripe.com/ae** (UAE-specific site)
2. Click **"Start Now"** or **"Sign Up"**
3. Enter your email and create a password
4. Verify your email address
5. Complete the account setup with your business details:
   - Business Name: **Safaeewala Cleaning & Maintenance LLC**
   - Business Type: **Service Provider**
   - Industry: **Other Services**
   - Country: **United Arab Emirates**
   - Currency: **AED (Arab Emirates Dirham)**

### Step 2: Complete Business Verification
Stripe requires UAE business verification:
1. Log into your Stripe Dashboard
2. Go to **Settings** → **Business Profile**
3. Upload these documents:
   - DED License (from your company registration)
   - Trade License
   - Passport copy (business owner)
4. Provide Bank Account Details for payouts (where payments will be deposited)
5. Wait for verification (usually 1-2 days)

### Step 3: Get Your API Keys
1. In Stripe Dashboard, go to **Developers** (top left menu)
2. Click **API Keys**
3. You'll see two sets of keys:
   - **Publishable Key** (starts with `pk_`)
   - **Secret Key** (starts with `sk_`)
4. **IMPORTANT**: Keep the Secret Key private! Never share it or commit to Git.

⚠️ **Test Mode vs Live Mode:**
- Toggle **"View test data"** at top right to switch between Test and Live
- Always test with Test keys first
- Test Card: `4242 4242 4242 4242` (any future date, any CVC)

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
# Stripe Payment Processing
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# Payment Settings
PAYMENT_CURRENCY=AED
PAYMENT_SUCCESS_URL=https://your-domain.com/payment-success
PAYMENT_CANCEL_URL=https://your-domain.com/payment-cancel
```

Replace with your actual keys from Step 3 above.

### Step 2: Save and Restart Application

```bash
# Save the file (Ctrl+O, Enter, Ctrl+X)
# Then restart your application
cd /root/safaeewala-dashboard
npm run build
# Restart your Node process
```

---

## Part 3: Backend API Implementation

Your backend needs three endpoints for payment processing:

### Endpoint 1: Create Payment Intent
```typescript
// POST /api/payments
// Creates a Stripe payment intent for an invoice

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post('/api/payments', async (req, res) => {
  try {
    const { invoiceId, amount, clientEmail } = req.body;

    // Validate inputs
    if (!invoiceId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount or invoice' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'aed',
      receipt_email: clientEmail,
      metadata: {
        invoiceId: invoiceId,
        clientEmail: clientEmail,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

### Endpoint 2: Webhook Handler
```typescript
// POST /api/webhooks/stripe
// Handles Stripe webhook events (payment completion, failure, etc.)

app.post('/api/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'payment_intent.succeeded':
        // Payment successful
        const paymentIntent = event.data.object;
        
        // Update invoice as paid in your database
        await updateInvoiceStatus(
          paymentIntent.metadata.invoiceId,
          'paid',
          paymentIntent.id
        );

        // Send confirmation email
        await sendPaymentConfirmationEmail(paymentIntent.metadata.clientEmail);
        break;

      case 'payment_intent.payment_failed':
        // Payment failed
        const failedPayment = event.data.object;
        
        // Log failure and notify customer
        console.error('Payment failed:', failedPayment.id);
        await sendPaymentFailureEmail(failedPayment.metadata.clientEmail);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    res.status(400).send(`Webhook error: ${error.message}`);
  }
});
```

### Endpoint 3: Refund Handler
```typescript
// POST /api/payments/refund
// Process refunds for completed payments

app.post('/api/payments/refund', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
    });

    // Update invoice status back to unpaid
    // Log refund transaction

    res.json({ success: true, refundId: refund.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

---

## Part 4: Set Up Webhook (Critical for Production)

Webhooks allow Stripe to notify your server about payment events.

### Step 1: Get Webhook Signing Secret
1. In Stripe Dashboard → **Developers** → **Webhooks**
2. Click **"Add an endpoint"**
3. Enter your endpoint URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Copy the **Signing Secret** and add to .env as `STRIPE_WEBHOOK_SECRET`

### Step 2: Test Webhook
```bash
# In Stripe Dashboard Webhooks section, click the endpoint
# Click "Send test webhook" → select event type
# Check your server logs for successful receipt
```

---

## Part 5: Frontend Integration

The frontend is ready to accept payments! Here's how it works:

### When Customer Pays an Invoice:
1. Customer clicks **"Pay Now"** button on invoice
2. Payment modal opens
3. Form sends amount to backend (`POST /api/payments`)
4. Backend returns `clientSecret`
5. Frontend uses Stripe.js to process card
6. Payment is confirmed
7. Invoice status updates to "Paid"

### Payment Flow Diagram:
```
Dashboard → Invoice Page
    ↓
Customer clicks "Pay Now"
    ↓
Frontend creates payment intent
    ↓
Backend (POST /api/payments)
    ↓
Stripe returns clientSecret
    ↓
Frontend collects card info
    ↓
Stripe processes payment
    ↓
Webhook notifies backend
    ↓
Invoice marked as paid ✓
```

---

## Part 6: Testing Payments

### Test Mode (before going live):

**Test Card Numbers:**
- ✅ **Successful Payment**: `4242 4242 4242 4242`
- ❌ **Failed Payment**: `4000 0000 0000 0002`
- ⚠️ **3D Secure**: `4000 0025 0000 3155`

**Expiry & CVC:** Any future date, any 3-digit number (e.g., 12/25, 123)

### Test Steps:
1. Make sure API keys in .env are **Test keys** (start with `pk_test_`, `sk_test_`)
2. Create an invoice in your dashboard
3. Click "Pay Now" on the invoice
4. Enter a test card number
5. Verify payment completes
6. Check Stripe Dashboard → **Payments** to see test transaction
7. Verify invoice status changed to "Paid"

---

## Part 7: Go Live

Once testing is successful:

### Step 1: Switch to Live Keys
1. In Stripe Dashboard → **Developers** → **API Keys**
2. Toggle to **Live Data**
3. Copy your Live Publishable Key (`pk_live_...`)
4. Copy your Live Secret Key (`sk_live_...`)

### Step 2: Update Environment Variables
```bash
ssh root@187.77.116.14
nano /root/safaeewala-dashboard/.env

# Replace test keys with live keys
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_KEY
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_KEY
```

### Step 3: Rebuild and Deploy
```bash
cd /root/safaeewala-dashboard
npm run build
# Restart application
```

### Step 4: Enable Live Webhook
1. In Stripe Dashboard → **Developers** → **Webhooks**
2. Add new endpoint with your live domain
3. Select same events as test
4. Update `STRIPE_WEBHOOK_SECRET` in .env

---

## Part 8: Security Checklist

Before going live, verify:

- [ ] Secret API key is NEVER committed to Git
- [ ] Secret key is only in server .env (not frontend)
- [ ] Webhook secret is configured and tested
- [ ] HTTPS is enabled on your domain
- [ ] Payment success/cancel URLs are configured
- [ ] Email confirmations are being sent
- [ ] Refund logic is implemented
- [ ] PCI compliance is enabled in Stripe Dashboard

---

## Part 9: Available Payment Methods (UAE)

Once live, customers can pay with:
- ✅ Credit Cards (Visa, Mastercard, AmEx)
- ✅ Debit Cards
- ✅ Apple Pay
- ✅ Google Pay

---

## Troubleshooting

### Payment Intent Not Created
- Check API keys in .env are correct
- Verify backend endpoint is running
- Check logs for errors

### Webhook Not Firing
- Verify webhook URL is publicly accessible
- Check signing secret in .env
- Test webhook manually from Stripe Dashboard

### Customer Not Charged
- Verify `amount` in cents (multiply by 100)
- Check currency is AED
- Verify paymentIntent.status is `succeeded`

### Payment Shows as Pending
- Check Stripe Dashboard → Payments for status
- Verify webhook processed successfully
- Check database for invoice status update

---

## Support

For issues or questions:
- **Stripe Docs**: https://stripe.com/docs/payments
- **Stripe Support**: https://support.stripe.com
- **Your Developer**: Contact your tech team with error messages from logs

---

## Next Steps After Setup

1. ✅ Configure Stripe account and get API keys
2. ✅ Implement backend payment endpoints (Sections 3-4)
3. ✅ Test with test cards
4. ✅ Switch to live keys
5. ✅ Monitor payments in Stripe Dashboard
6. ✅ Set up automatic payouts to your bank account

---

**Dashboard Feature**: Payment Processing  
**Status**: Ready for integration  
**Estimated Setup Time**: 30-60 minutes  
**Support**: Your development team
