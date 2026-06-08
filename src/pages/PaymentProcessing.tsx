import { CreditCard, Zap, Lock, BarChart3 } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

export function PaymentProcessing() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Payment Processing"
        subtitle="Accept online payments with Stripe integration — coming soon"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-[22px] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center mx-auto mb-6">
            <CreditCard size={40} className="text-white" />
          </div>
          <h2 className="text-[28px] font-bold text-blue-900 mb-3">Payment Processing Coming Soon</h2>
          <p className="text-blue-700 mb-6">
            Accept credit cards, debit cards, and bank transfers securely through Stripe integration.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-[12px] font-semibold">
            <Zap size={14} /> Expected Q3 2026
          </div>
        </div>

        {[
          {
            icon: CreditCard,
            title: 'Multiple Payment Methods',
            description: 'Accept cards, bank transfers, and Apple Pay / Google Pay',
          },
          {
            icon: Lock,
            title: 'Secure Processing',
            description: 'PCI DSS compliant with 256-bit encryption',
          },
          {
            icon: BarChart3,
            title: 'Payment Analytics',
            description: 'Track revenue, payment status, and customer payment history',
          },
          {
            icon: Zap,
            title: 'Instant Payouts',
            description: 'Settle funds to your bank account automatically',
          },
        ].map((feature, i) => (
          <div
            key={i}
            className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                <feature.icon size={24} className="text-blue-600" />
              </div>
              <h3 className="text-[16px] font-bold text-[#111827]">{feature.title}</h3>
            </div>
            <p className="text-[13px] text-slate-600">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-[22px] p-6">
        <p className="text-[13px] text-amber-800 font-semibold mb-2">What You Can Do Now</p>
        <ul className="space-y-2 text-[12px] text-amber-700">
          <li>✓ Set up a Stripe account at stripe.com</li>
          <li>✓ Complete business verification</li>
          <li>✓ Generate API keys (we'll integrate them)</li>
          <li>✓ Link your bank account for payouts</li>
        </ul>
      </div>
    </div>
  )
}
