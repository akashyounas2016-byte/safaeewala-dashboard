import { Mail, Gift, Repeat, BarChart3 } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

/**
 * R-DATA-03 (delivery check 2026-11-06): this screen showed made-up campaign, referral and retention
 * numbers — the CRM sends no email campaigns. Until a real email / referral service is connected it says
 * so instead of showing invented figures. Real client retention is on Analytics → Clients.
 */
export function MarketingDashboard() {
  const planned = [
    { icon: Mail, title: 'Email campaigns', description: 'Newsletters and offers to clients, with open and click rates' },
    { icon: Gift, title: 'Referral rewards', description: 'Track referrals and the rewards owed for them' },
    { icon: Repeat, title: 'Win-back reminders', description: 'Reach clients who have not booked for a while' },
    { icon: BarChart3, title: 'Campaign results', description: 'Bookings and revenue that came from each campaign' },
  ]
  return (
    <div className="space-y-6">
      <PageHero title="Marketing" subtitle="Email campaigns and referrals — coming soon" statusChip="Coming Soon" showSearch={false} />

      <div className="bg-white border border-[#E2E5E0] rounded-[22px] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-5 text-white">
          <Mail size={30} />
        </div>
        <h2 className="text-[24px] font-bold text-[#111827] mb-2">Marketing is not connected yet</h2>
        <p className="text-slate-600 max-w-xl mx-auto">
          No email or referral service is linked to the CRM, so there are no campaign figures to show.
          Client retention, repeat visits and revenue are on <b>Analytics</b>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {planned.map(p => (
          <div key={p.title} className="bg-white border border-[#E2E5E0] rounded-[18px] p-5 flex items-start gap-3.5">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0"><p.icon size={18} /></span>
            <div>
              <p className="text-[14px] font-bold text-[#111827]">{p.title}</p>
              <p className="text-[12.5px] text-slate-500 mt-0.5">{p.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
