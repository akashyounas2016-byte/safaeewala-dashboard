import { TrendingUp, PieChart, BarChart3, LineChart } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

export function BusinessAnalytics() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Business Analytics"
        subtitle="Deep insights into revenue, profitability, and customer metrics — coming soon"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-[22px] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center mx-auto mb-6">
            <BarChart3 size={40} className="text-white" />
          </div>
          <h2 className="text-[28px] font-bold text-indigo-900 mb-3">Business Analytics Coming Soon</h2>
          <p className="text-indigo-700 mb-6">
            Comprehensive analytics dashboard with revenue trends, profitability analysis, and KPIs.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full text-[12px] font-semibold">
            <TrendingUp size={14} /> Expected Q3 2026
          </div>
        </div>

        {[
          {
            icon: LineChart,
            title: 'Revenue Trends',
            description: 'Monthly revenue charts with year-over-year comparison',
          },
          {
            icon: BarChart3,
            title: 'Profitability Analysis',
            description: 'Track profit margins by service type and customer segment',
          },
          {
            icon: PieChart,
            title: 'Revenue Breakdown',
            description: 'Visualize revenue by service, customer type, and team member',
          },
          {
            icon: TrendingUp,
            title: 'KPI Dashboard',
            description: 'Track key metrics: AOV, customer lifetime value, churn rate',
          },
        ].map((feature, i) => (
          <div
            key={i}
            className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <feature.icon size={24} className="text-indigo-600" />
              </div>
              <h3 className="text-[16px] font-bold text-[#111827]">{feature.title}</h3>
            </div>
            <p className="text-[13px] text-slate-600">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-[22px] p-6">
        <p className="text-[13px] text-indigo-800 font-semibold mb-2">What You'll Track</p>
        <ul className="space-y-2 text-[12px] text-indigo-700">
          <li>✓ Monthly recurring revenue (MRR) from subscriptions</li>
          <li>✓ Average order value and customer lifetime value</li>
          <li>✓ Labor cost per job and profitability by service</li>
          <li>✓ Customer acquisition cost and retention rate</li>
          <li>✓ Team member productivity and earnings</li>
        </ul>
      </div>
    </div>
  )
}
