import { useState } from 'react'
import { TrendingUp, DollarSign, Users, BarChart3, PieChart, Download, Calendar } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'

interface MonthlyMetric {
  month: string
  revenue: number
  expenses: number
  profit: number
  jobsCompleted: number
  newClients: number
}

interface KPI {
  label: string
  value: string | number
  change: number
  trend: 'up' | 'down' | 'neutral'
  icon: React.ReactNode
}

const monthlyData: MonthlyMetric[] = [
  { month: 'Jan', revenue: 8500, expenses: 2100, profit: 6400, jobsCompleted: 12, newClients: 3 },
  { month: 'Feb', revenue: 9200, expenses: 2300, profit: 6900, jobsCompleted: 14, newClients: 4 },
  { month: 'Mar', revenue: 10500, expenses: 2500, profit: 8000, jobsCompleted: 16, newClients: 5 },
  { month: 'Apr', revenue: 11200, expenses: 2600, profit: 8600, jobsCompleted: 17, newClients: 6 },
  { month: 'May', revenue: 13000, expenses: 2900, profit: 10100, jobsCompleted: 20, newClients: 8 },
  { month: 'Jun', revenue: 14800, expenses: 3200, profit: 11600, jobsCompleted: 23, newClients: 9 },
]

const revenueByService = [
  { service: 'Villa Cleaning', revenue: 52000, percentage: 35 },
  { service: 'Office Cleaning', revenue: 38000, percentage: 25 },
  { service: 'Apartment Cleaning', revenue: 34000, percentage: 23 },
  { service: 'Deep Clean', revenue: 22000, percentage: 15 },
  { service: 'Carpet Cleaning', revenue: 3500, percentage: 2 },
]

const teamPerformance = [
  { name: 'Ahmed Al Mansoori', jobsCompleted: 45, rating: 4.9, earnings: 8500 },
  { name: 'Fatima Al Mazrouei', jobsCompleted: 38, rating: 4.8, earnings: 7200 },
  { name: 'Mohammed Al Ketbi', jobsCompleted: 32, rating: 4.7, earnings: 6100 },
  { name: 'Layla Ahmed', jobsCompleted: 28, rating: 4.6, earnings: 5300 },
  { name: 'Omar Hassan', jobsCompleted: 22, rating: 4.5, earnings: 4200 },
]

const currentMonth = monthlyData[monthlyData.length - 1]
const previousMonth = monthlyData[monthlyData.length - 2]

export function BusinessAnalytics() {
  const [timeframe, setTimeframe] = useState('6months')

  // Calculate KPIs
  const revenueChange = ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100
  const profitChange = ((currentMonth.profit - previousMonth.profit) / previousMonth.profit) * 100
  const totalRevenue = monthlyData.reduce((sum, m) => sum + m.revenue, 0)
  const totalProfit = monthlyData.reduce((sum, m) => sum + m.profit, 0)
  const avgProfit = Math.round(totalProfit / monthlyData.length)
  const profitMargin = Math.round((totalProfit / totalRevenue) * 100)

  const kpis: KPI[] = [
    {
      label: 'Revenue (This Month)',
      value: `AED ${currentMonth.revenue.toLocaleString()}`,
      change: revenueChange,
      trend: revenueChange >= 0 ? 'up' : 'down',
      icon: <DollarSign size={20} className="text-blue-600" />,
    },
    {
      label: 'Profit (This Month)',
      value: `AED ${currentMonth.profit.toLocaleString()}`,
      change: profitChange,
      trend: profitChange >= 0 ? 'up' : 'down',
      icon: <TrendingUp size={20} className="text-emerald-600" />,
    },
    {
      label: 'Profit Margin',
      value: `${profitMargin}%`,
      change: 2.5,
      trend: 'up',
      icon: <BarChart3 size={20} className="text-purple-600" />,
    },
    {
      label: 'Jobs Completed',
      value: currentMonth.jobsCompleted,
      change: 7,
      trend: 'up',
      icon: <Users size={20} className="text-amber-600" />,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHero
        title="Business Analytics"
        subtitle="Deep insights into revenue, profitability, and growth metrics"
      />

      {/* Timeframe Selector */}
      <div className="flex items-center gap-4">
        <Select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
          <option value="3months">Last 3 Months</option>
          <option value="6months">Last 6 Months</option>
          <option value="1year">Last Year</option>
        </Select>
        <Button variant="secondary" size="sm">
          <Download size={14} className="mr-1.5" /> Export Report
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[12px] font-semibold text-slate-600 uppercase">{kpi.label}</p>
              {kpi.icon}
            </div>
            <p className="text-[28px] font-bold text-[#111827] mb-3">{kpi.value}</p>
            <div className="flex items-center gap-1">
              <span
                className={`text-[12px] font-bold ${
                  kpi.trend === 'up'
                    ? 'text-emerald-600'
                    : kpi.trend === 'down'
                      ? 'text-red-600'
                      : 'text-slate-600'
                }`}
              >
                {kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→'} {Math.abs(kpi.change).toFixed(1)}%
              </span>
              <span className="text-[11px] text-slate-500">vs last month</span>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue & Profit Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
          <h3 className="text-[16px] font-bold text-[#111827] mb-6">Revenue & Profit Trend</h3>
          <div className="space-y-4">
            {monthlyData.map(month => (
              <div key={month.month}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-semibold text-slate-600">{month.month}</p>
                  <div className="text-right">
                    <p className="text-[12px] font-bold text-[#111827]">AED {month.revenue.toLocaleString()}</p>
                    <p className="text-[11px] text-slate-500">Revenue</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 h-6 bg-blue-100 rounded-full relative overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${(month.revenue / 15000) * 100}%` }}
                    />
                  </div>
                  <div className="w-20 h-6 bg-emerald-100 rounded-full relative overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${(month.profit / 12000) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-6 text-[11px]">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-600" />
              <span className="text-slate-600">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-600" />
              <span className="text-slate-600">Profit</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
          <h3 className="text-[16px] font-bold text-[#111827] mb-6">Revenue by Service</h3>
          <div className="space-y-4">
            {revenueByService.map(service => (
              <div key={service.service}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-semibold text-slate-700">{service.service}</p>
                  <div className="text-right">
                    <p className="text-[12px] font-bold text-[#111827]">AED {service.revenue.toLocaleString()}</p>
                    <p className="text-[11px] text-slate-500">{service.percentage}%</p>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                    style={{ width: `${service.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-[22px] p-6">
          <p className="text-[12px] font-semibold text-blue-700 uppercase mb-2">Total Revenue (6 months)</p>
          <p className="text-[32px] font-bold text-blue-900 mb-3">AED {totalRevenue.toLocaleString()}</p>
          <p className="text-[12px] text-blue-800">Average per month: AED {Math.round(totalRevenue / monthlyData.length).toLocaleString()}</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-[22px] p-6">
          <p className="text-[12px] font-semibold text-emerald-700 uppercase mb-2">Total Profit (6 months)</p>
          <p className="text-[32px] font-bold text-emerald-900 mb-3">AED {totalProfit.toLocaleString()}</p>
          <p className="text-[12px] text-emerald-800">Profit margin: {profitMargin}%</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-[22px] p-6">
          <p className="text-[12px] font-semibold text-purple-700 uppercase mb-2">Total Jobs</p>
          <p className="text-[32px] font-bold text-purple-900 mb-3">
            {monthlyData.reduce((sum, m) => sum + m.jobsCompleted, 0)}
          </p>
          <p className="text-[12px] text-purple-800">
            Average: {Math.round(monthlyData.reduce((sum, m) => sum + m.jobsCompleted, 0) / monthlyData.length)} per month
          </p>
        </div>
      </div>

      {/* Team Performance */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
        <h3 className="text-[16px] font-bold text-[#111827] mb-6">Top Team Members</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC]">
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Name</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Jobs Completed</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Rating</th>
                <th className="px-6 py-4 text-right text-[12px] font-bold text-slate-600 uppercase">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {teamPerformance.map(member => (
                <tr key={member.name} className="border-b border-[#E4E8EC] hover:bg-slate-50">
                  <td className="px-6 py-4 text-[13px] font-semibold text-[#111827]">{member.name}</td>
                  <td className="px-6 py-4 text-center text-[13px] font-semibold text-[#111827]">{member.jobsCompleted}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[13px] font-bold text-amber-600">{member.rating}</span>
                      <span className="text-amber-500">★</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-[13px] font-bold text-emerald-600">
                    AED {member.earnings.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Growth Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-bold text-[#111827]">Customer Growth</h4>
            <TrendingUp className="text-emerald-600" size={20} />
          </div>
          <p className="text-[24px] font-bold text-[#111827] mb-2">
            +{monthlyData.reduce((sum, m) => sum + m.newClients, 0)} new clients
          </p>
          <p className="text-[12px] text-slate-600">
            Average: {Math.round(monthlyData.reduce((sum, m) => sum + m.newClients, 0) / monthlyData.length)} per month
          </p>
          <div className="mt-4 pt-4 border-t border-[#E4E8EC]">
            <p className="text-[11px] text-slate-500">Acquisition Cost: AED {Math.round(totalProfit / monthlyData.reduce((sum, m) => sum + m.newClients, 0))}</p>
          </div>
        </div>

        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-bold text-[#111827]">Customer Lifetime Value</h4>
            <DollarSign className="text-blue-600" size={20} />
          </div>
          <p className="text-[24px] font-bold text-[#111827] mb-2">AED 8,500</p>
          <p className="text-[12px] text-slate-600">Average per customer (12 months)</p>
          <div className="mt-4 pt-4 border-t border-[#E4E8EC]">
            <p className="text-[11px] text-slate-500">Repeat rate: 78%</p>
          </div>
        </div>

        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-bold text-[#111827]">Monthly Recurring Revenue</h4>
            <BarChart3 className="text-purple-600" size={20} />
          </div>
          <p className="text-[24px] font-bold text-[#111827] mb-2">AED 5,800</p>
          <p className="text-[12px] text-slate-600">From subscription contracts</p>
          <div className="mt-4 pt-4 border-t border-[#E4E8EC]">
            <p className="text-[11px] text-slate-500">Growth: +12% vs last month</p>
          </div>
        </div>
      </div>

      {/* Insights Box */}
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-[22px] p-6">
        <p className="text-[14px] font-bold text-emerald-900 mb-4">📊 Key Insights</p>
        <ul className="space-y-2 text-[12px] text-emerald-800">
          <li>✓ Revenue up {revenueChange.toFixed(1)}% vs last month - strong growth trajectory</li>
          <li>✓ Profit margin at {profitMargin}% - excellent operational efficiency</li>
          <li>✓ Villa Cleaning is top revenue driver (35%) - focus on this service</li>
          <li>✓ New clients up {monthlyData[monthlyData.length - 1].newClients} this month - marketing working well</li>
          <li>✓ Team efficiency improving - jobs/employee up 8% YoY</li>
          <li>✓ MRR growing - subscription contracts provide stable income base</li>
        </ul>
      </div>
    </div>
  )
}
