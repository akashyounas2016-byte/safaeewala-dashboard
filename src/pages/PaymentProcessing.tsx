import { useState } from 'react'
import { CreditCard, Plus, CheckCircle, Clock, AlertCircle, Download, Eye } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface Payment {
  id: string
  invoiceId: string
  clientName: string
  amount: number
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  method: 'card' | 'transfer' | 'cash'
  date: string
  transactionId?: string
}

const defaultPayments: Payment[] = [
  {
    id: '1',
    invoiceId: 'INV-001',
    clientName: 'Ahmed Al Mansoori',
    amount: 850,
    status: 'completed',
    method: 'card',
    date: '2026-06-07',
    transactionId: 'pi_3Q1k2xCcJTGG9G8e1k2j3l4m',
  },
  {
    id: '2',
    invoiceId: 'INV-002',
    clientName: 'Fatima Al Mazrouei',
    amount: 2500,
    status: 'pending',
    method: 'card',
    date: '2026-06-06',
  },
]

const statusConfig = {
  completed: { color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  pending: { color: 'bg-amber-50 text-amber-700', icon: Clock },
  failed: { color: 'bg-red-50 text-red-700', icon: AlertCircle },
  refunded: { color: 'bg-slate-50 text-slate-700', icon: AlertCircle },
}

export function PaymentProcessing() {
  const [payments, setPayments] = useState<Payment[]>(defaultPayments)
  const [showModal, setShowModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)

  const stats = {
    total: payments.reduce((sum, p) => sum + p.amount, 0),
    completed: payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0),
    pending: payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),
    failedCount: payments.filter(p => p.status === 'failed').length,
  }

  const handleViewDetails = (payment: Payment) => {
    setSelectedPayment(payment)
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Payment Processing"
        subtitle="Accept and manage online payments securely"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-emerald-700 uppercase">Total Collected</p>
          <p className="text-[28px] font-bold text-emerald-900 mt-1">AED {stats.total}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-blue-700 uppercase">Completed</p>
          <p className="text-[28px] font-bold text-blue-900 mt-1">AED {stats.completed}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-amber-700 uppercase">Pending</p>
          <p className="text-[28px] font-bold text-amber-900 mt-1">AED {stats.pending}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-red-700 uppercase">Failed</p>
          <p className="text-[28px] font-bold text-red-900 mt-1">{stats.failedCount}</p>
        </div>
      </div>

      {/* Setup Status */}
      <div className="bg-blue-50 border border-blue-200 rounded-[22px] p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-1">
            <CreditCard size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-blue-900 mb-2">Stripe Integration Guide</p>
            <ol className="space-y-2 text-[12px] text-blue-800">
              <li><strong>1. Create Stripe Account:</strong> Go to stripe.com → Sign up → Verify email</li>
              <li><strong>2. Get API Keys:</strong> Dashboard → Settings → API keys → Copy Publishable & Secret keys</li>
              <li><strong>3. Add to Environment:</strong> Contact your developer to add STRIPE_PUBLIC_KEY and STRIPE_SECRET_KEY to VPS .env</li>
              <li><strong>4. Create Payment Endpoint:</strong> Backend needs POST /api/payments endpoint (see below)</li>
              <li><strong>5. Test Mode:</strong> Use test card: 4242 4242 4242 4242 (any future date, any CVC)</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-slate-50">
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Invoice</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Client</th>
                <th className="px-6 py-4 text-right text-[12px] font-bold text-slate-600 uppercase">Amount</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Method</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Status</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Date</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(payment => {
                const StatusIcon = statusConfig[payment.status].icon
                return (
                  <tr key={payment.id} className="border-b border-[#E4E8EC] hover:bg-slate-50">
                    <td className="px-6 py-4 text-[13px] font-semibold text-[#111827]">{payment.invoiceId}</td>
                    <td className="px-6 py-4 text-[13px] text-slate-600">{payment.clientName}</td>
                    <td className="px-6 py-4 text-right text-[13px] font-semibold text-emerald-600">AED {payment.amount}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 capitalize">
                        {payment.method}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <StatusIcon size={14} className={statusConfig[payment.status].color.split(' ')[1]} />
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${statusConfig[payment.status].color}`}>
                          {payment.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-[12px] text-slate-600">{payment.date}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleViewDetails(payment)}
                        className="p-2 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backend Implementation Guide */}
      <div className="bg-slate-50 border border-slate-200 rounded-[22px] p-6">
        <p className="text-[14px] font-bold text-slate-800 mb-4">Backend API Endpoint (Node.js/Express)</p>
        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
          <pre className="text-[11px] font-mono text-emerald-400 whitespace-pre-wrap break-words">{`// POST /api/payments
// Create payment intent with Stripe

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/api/payments', async (req, res) => {
  try {
    const { amount, invoiceId, clientEmail } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Amount in cents
      currency: 'aed',
      metadata: {
        invoiceId: invoiceId,
        clientEmail: clientEmail,
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

// Webhook to handle payment completion
app.post('/api/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === 'payment_intent.succeeded') {
      // Update invoice status to paid
      // Log payment in database
    }
    res.json({ received: true });
  } catch (error) {
    res.status(400).send('Webhook error');
  }
});`}</pre>
        </div>
      </div>

      {/* Modal for Payment Details */}
      <Modal
        open={!!selectedPayment}
        onClose={() => setSelectedPayment(null)}
        title="Payment Details"
        size="md"
      >
        {selectedPayment && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-slate-500 font-semibold">Invoice ID</p>
                <p className="text-[14px] font-bold text-[#111827] mt-1">{selectedPayment.invoiceId}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-semibold">Amount</p>
                <p className="text-[14px] font-bold text-emerald-600 mt-1">AED {selectedPayment.amount}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-semibold">Client</p>
                <p className="text-[14px] font-bold text-[#111827] mt-1">{selectedPayment.clientName}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-semibold">Method</p>
                <p className="text-[14px] font-bold text-[#111827] mt-1 capitalize">{selectedPayment.method}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-semibold">Status</p>
                <div className="mt-1">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${statusConfig[selectedPayment.status].color}`}>
                    {selectedPayment.status}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-semibold">Date</p>
                <p className="text-[14px] font-bold text-[#111827] mt-1">{selectedPayment.date}</p>
              </div>
            </div>
            {selectedPayment.transactionId && (
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 font-semibold mb-1">Transaction ID</p>
                <p className="text-[12px] font-mono text-slate-700 break-all">{selectedPayment.transactionId}</p>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedPayment(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
