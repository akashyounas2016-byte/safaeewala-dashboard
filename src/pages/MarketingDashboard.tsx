import { Mail, Users, TrendingUp, Target } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

export function MarketingDashboard() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Marketing Dashboard"
        subtitle="Email campaigns, referrals, and customer retention — coming soon"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-pink-50 to-pink-100 border border-pink-200 rounded-[22px] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-pink-500 flex items-center justify-center mx-auto mb-6">
            <Target size={40} className="text-white" />
          </div>
          <h2 className="text-[28px] font-bold text-pink-900 mb-3">Marketing Dashboard Coming Soon</h2>
          <p className="text-pink-700 mb-6">
            Run email campaigns, track referrals, and manage customer retention strategies.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-full text-[12px] font-semibold">
            <Mail size={14} /> Expected Q4 2026
          </div>
        </div>

        {[
          {
            icon: Mail,
            title: 'Email Campaigns',
            description: 'Send bulk emails to customers, promotions, and newsletters',
          },
          {
            icon: Target,
            title: 'Referral Tracking',
            description: 'Track customer referrals and reward programs',
          },
          {
            icon: Users,
            title: 'Retention Strategies',
            description: 'Re-engage inactive customers with targeted campaigns',
          },
          {
            icon: TrendingUp,
            title: 'Campaign Analytics',
            description: 'Track open rates, click rates, and conversion metrics',
          },
        ].map((feature, i) => (
          <div
            key={i}
            className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-pink-50 flex items-center justify-center">
                <feature.icon size={24} className="text-pink-600" />
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
