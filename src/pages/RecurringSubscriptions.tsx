import { RotateCw, Zap, Calendar, BarChart3 } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

export function RecurringSubscriptions() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Recurring Subscriptions"
        subtitle="Manage recurring cleaning contracts and auto-billing — coming soon"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-[22px] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-6">
            <RotateCw size={40} className="text-white" />
          </div>
          <h2 className="text-[28px] font-bold text-emerald-900 mb-3">Recurring Subscriptions Coming Soon</h2>
          <p className="text-emerald-700 mb-6">
            Set up automatic weekly, bi-weekly, or monthly cleaning contracts with auto-renewal and billing.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full text-[12px] font-semibold">
            <Zap size={14} /> Expected Q3 2026
          </div>
        </div>

        {[
          {
            icon: Calendar,
            title: 'Flexible Scheduling',
            description: 'Weekly, bi-weekly, monthly, or custom frequency contracts',
          },
          {
            icon: RotateCw,
            title: 'Auto-Renewal',
            description: 'Contracts automatically renew with customer notification',
          },
          {
            icon: BarChart3,
            title: 'Recurring Revenue',
            description: 'Track MRR and predict monthly income from subscriptions',
          },
          {
            icon: Zap,
            title: 'Smart Billing',
            description: 'Auto-generate invoices on schedule with payment reminders',
          },
        ].map((feature, i) => (
          <div
            key={i}
            className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <feature.icon size={24} className="text-emerald-600" />
              </div>
              <h3 className="text-[16px] font-bold text-[#111827]">{feature.title}</h3>
            </div>
            <p className="text-[13px] text-slate-600">{feature.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
