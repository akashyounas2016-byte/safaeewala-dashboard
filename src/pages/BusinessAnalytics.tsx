import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  TrendingUp, TrendingDown, DollarSign, Users, BarChart3, PieChart,
  Download, Calendar, Award, Sparkles, Briefcase, RefreshCw, Layers,
  ChevronRight, ArrowUpRight, ArrowDownRight, CheckCircle2, ShieldCheck
} from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { useData } from '@/store/DataContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import { todayDubai, monthDubai } from '@/lib/dubaiTime'
import { isBogusJob, cleanClientNameFromAddress, jobCollected } from '@/lib/clientDataSync'

function cleanNum(v: any): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  if (!v) return 0
  const parsed = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
  return isNaN(parsed) ? 0 : parsed
}

export function BusinessAnalytics() {
  const { dailyJobs, dailyExpenses, clients, employees, invoices, bookings } = useData()
  const [timeframe, setTimeframe] = useState<'3months' | '6months' | '1year'>('6months')

  // Generate date ranges for the chosen timeframe in Dubai time
  const monthCount = timeframe === '3months' ? 3 : timeframe === '6months' ? 6 : 12

  const recentMonths = useMemo(() => {
    const list: { key: string; label: string; short: string }[] = []
    const nowDubai = todayDubai()
    const [currY, currM] = nowDubai.split('-').map(Number)

    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(currY, currM - 1 - i, 1)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const key = `${y}-${m}`
      const short = d.toLocaleDateString('en-US', { month: 'short' })
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      list.push({ key, label, short })
    }
    return list
  }, [monthCount])

  // Compute live monthly financials from dailyJobs and dailyExpenses
  const monthlyData = useMemo(() => {
    return recentMonths.map(m => {
      const jobsInMonth = dailyJobs.filter(j => !isBogusJob(j) && j.date && j.date.startsWith(m.key))
      const expensesInMonth = dailyExpenses.filter(e => e.date && e.date.startsWith(m.key))

      const revenue = jobsInMonth.reduce((sum, j) => sum + (cleanNum(j.charges) || cleanNum(j.received)), 0)
      // Collected = same rule as Overview (R-FIN-03)
      const received = jobsInMonth.reduce((sum, j) => sum + jobCollected(j), 0)
      const expenses = expensesInMonth.reduce((sum, e) => sum + cleanNum(e.amount), 0)
      const profit = revenue - expenses
      const jobsCompleted = jobsInMonth.filter(j => cleanNum(j.received) > 0 || j.date < todayDubai()).length

      // Count new clients introduced in this month
      const newClients = clients.filter(c => {
        const cDate = c.created_at ? c.created_at.split('T')[0] : (c.last_service || '')
        return cDate && cDate.startsWith(m.key)
      }).length

      return {
        key: m.key,
        month: m.short,
        fullLabel: m.label,
        revenue,
        received,
        expenses,
        profit,
        jobsCompleted: jobsCompleted || jobsInMonth.length,
        newClients,
      }
    })
  }, [recentMonths, dailyJobs, dailyExpenses, clients])

  // Current vs Previous Month metrics
  const currentMonth = monthlyData[monthlyData.length - 1] || {
    revenue: 0, received: 0, expenses: 0, profit: 0, jobsCompleted: 0, newClients: 0
  }
  const previousMonth = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null

  const revenueChange = previousMonth && previousMonth.revenue > 0
    ? ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100
    : 0

  const profitChange = previousMonth && Math.abs(previousMonth.profit) > 0
    ? ((currentMonth.profit - previousMonth.profit) / Math.abs(previousMonth.profit)) * 100
    : 0

  const jobsChange = previousMonth
    ? currentMonth.jobsCompleted - previousMonth.jobsCompleted
    : 0

  const totalRevenue = useMemo(() => monthlyData.reduce((sum, m) => sum + m.revenue, 0), [monthlyData])
  const totalExpenses = useMemo(() => monthlyData.reduce((sum, m) => sum + m.expenses, 0), [monthlyData])
  const totalProfit = useMemo(() => monthlyData.reduce((sum, m) => sum + m.profit, 0), [monthlyData])
  const totalJobsCompleted = useMemo(() => monthlyData.reduce((sum, m) => sum + m.jobsCompleted, 0), [monthlyData])
  const avgMonthlyProfit = monthlyData.length > 0 ? Math.round(totalProfit / monthlyData.length) : 0
  const profitMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0
  const currentMonthMargin = currentMonth.revenue > 0 ? Math.round((currentMonth.profit / currentMonth.revenue) * 100) : 0

  const maxMonthRevenue = useMemo(() => {
    return Math.max(...monthlyData.map(m => m.revenue), 1000)
  }, [monthlyData])

  // Live Revenue by Service Type
  const revenueByService = useMemo(() => {
    const timeframeKeys = new Set(recentMonths.map(m => m.key))
    const jobsInTimeframe = dailyJobs.filter(j => !isBogusJob(j) && j.date && timeframeKeys.has(j.date.slice(0, 7)))

    const serviceTotals: Record<string, number> = {}
    jobsInTimeframe.forEach(j => {
      const rawService = (j.service || (j.material && j.material !== 'No' ? `${j.material} Cleaning` : 'General Cleaning')).trim()
      const s = rawService || 'General Cleaning'
      const amount = cleanNum(j.charges) || cleanNum(j.received)
      serviceTotals[s] = (serviceTotals[s] || 0) + amount
    })

    const entries = Object.entries(serviceTotals).map(([service, rev]) => ({
      service,
      revenue: rev,
      percentage: totalRevenue > 0 ? Math.round((rev / totalRevenue) * 100) : 0,
    }))

    // Sort descending by revenue
    entries.sort((a, b) => b.revenue - a.revenue)
    return entries.slice(0, 6)
  }, [recentMonths, dailyJobs, totalRevenue])

  // Live Team Performance Breakdown
  const teamPerformance = useMemo(() => {
    const timeframeKeys = new Set(recentMonths.map(m => m.key))
    const jobsInTimeframe = dailyJobs.filter(j => !isBogusJob(j) && j.date && timeframeKeys.has(j.date.slice(0, 7)))

    const staffMap: Record<string, { jobsCount: number; hoursCount: number; revenueCount: number }> = {}

    jobsInTimeframe.forEach(j => {
      const staffRaw = (j.staff_name || '').trim()
      if (!staffRaw || staffRaw.toLowerCase() === 'unassigned' || staffRaw === '—' || staffRaw === '-') return

      const names = staffRaw.split(/[,&+/]+/).map(n => n.trim()).filter(Boolean)
      const splitRevenue = names.length > 0 ? (cleanNum(j.charges) || cleanNum(j.received)) / names.length : 0
      const splitHours = names.length > 0 ? cleanNum(j.duty_hours) / names.length : 0

      names.forEach(name => {
        if (!staffMap[name]) {
          staffMap[name] = { jobsCount: 0, hoursCount: 0, revenueCount: 0 }
        }
        staffMap[name].jobsCount += 1
        staffMap[name].hoursCount += splitHours
        staffMap[name].revenueCount += splitRevenue
      })
    })

    const list = Object.entries(staffMap).map(([name, data]) => {
      const matchedEmp = employees.find(e => e.full_name?.toLowerCase().trim() === name.toLowerCase().trim())
      return {
        name,
        role: matchedEmp?.role || 'Cleaner',
        jobsCompleted: data.jobsCount,
        hours: Math.round(data.hoursCount * 10) / 10,
        earnings: Math.round(data.revenueCount),
      }
    })

    list.sort((a, b) => b.earnings - a.earnings)
    return list.slice(0, 8)
  }, [recentMonths, dailyJobs, employees])

  // Live Monthly Recurring Revenue (MRR) & Client Metrics
  const clientMetrics = useMemo(() => {
    const activeClientsCount = clients.length
    // Monthly contracts = clients with a weekly schedule (AUD-64: an empty list is not a contract)
    const monthlyClients = clients.filter(c => (c.service_days?.length ?? 0) > 0 || c.source === 'monthly')
    // Recurring revenue = what monthly-contract visits were actually charged in the latest month
    // (lifetime spend is not a monthly figure)
    const latestKey = recentMonths[recentMonths.length - 1]?.key || ''
    const mrr = dailyJobs
      .filter(j => !isBogusJob(j) && String(j.payment_mode).toLowerCase() === 'monthly' && (j.date || '').startsWith(latestKey))
      .reduce((sum, j) => sum + cleanNum(j.charges), 0)
    const avgRevPerClient = activeClientsCount > 0 ? Math.round(totalRevenue / activeClientsCount) : 0

    return {
      activeClientsCount,
      monthlyClientsCount: monthlyClients.length,
      mrr,
      avgRevPerClient,
    }
  }, [clients, totalRevenue, dailyJobs, recentMonths])

  // Export Analytics to Excel
  const handleExport = () => {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Monthly Financials
    const financialRows = [
      ['Month', 'Revenue (AED)', 'Collected (AED)', 'Expenses (AED)', 'Net Profit (AED)', 'Jobs Count', 'Profit Margin'],
      ...monthlyData.map(m => [
        m.fullLabel,
        m.revenue,
        m.received,
        m.expenses,
        m.profit,
        m.jobsCompleted,
        `${m.revenue > 0 ? Math.round((m.profit / m.revenue) * 100) : 0}%`,
      ]),
      ['Total', totalRevenue, monthlyData.reduce((s, m) => s + m.received, 0), totalExpenses, totalProfit, totalJobsCompleted, `${profitMargin}%`],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(financialRows)
    XLSX.utils.book_append_sheet(wb, ws1, 'Monthly Financials')

    // Sheet 2: Service Performance
    const serviceRows = [
      ['Service Type', 'Revenue (AED)', 'Share (%)'],
      ...revenueByService.map(s => [s.service, s.revenue, `${s.percentage}%`]),
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(serviceRows)
    XLSX.utils.book_append_sheet(wb, ws2, 'Services Breakdown')

    // Sheet 3: Staff Performance
    const staffRows = [
      ['Staff Member', 'Role', 'Jobs Completed', 'Duty Hours', 'Revenue Generated (AED)'],
      ...teamPerformance.map(t => [t.name, t.role, t.jobsCompleted, t.hours, t.earnings]),
    ]
    const ws3 = XLSX.utils.aoa_to_sheet(staffRows)
    XLSX.utils.book_append_sheet(wb, ws3, 'Staff Performance')

    XLSX.writeFile(wb, `Safaeewala_Business_Analytics_${todayDubai()}.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* ── Signature Executive Header ── */}
      <PageHero
        title="Business Analytics"
        subtitle={`Live operational performance & financial metrics · ${todayDubai()}`}
        statusChip="Live data"
        actions={
          <div className="flex items-center gap-2.5">
            <Select
              value={timeframe}
              onChange={e => setTimeframe(e.target.value as any)}
              className="text-[12.5px] font-bold bg-teal-50/40 border-teal-200/80 rounded-xl px-3 py-1.5 text-teal-950 shadow-2xs"
            >
              <option value="3months">Last 3 Months</option>
              <option value="6months">Last 6 Months</option>
              <option value="1year">Last 12 Months</option>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="bg-white hover:bg-teal-50 text-teal-900 border-teal-200/80 font-bold text-[12px] shadow-2xs"
            >
              <Download size={13} className="mr-1.5 text-teal-700" /> Export Excel
            </Button>
          </div>
        }
      />

      {/* ── 4 Executive KPI Cards (Live Real-Time Data) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Revenue */}
        <div className="bg-white rounded-[22px] border border-teal-100/90 shadow-[0_4px_20px_rgba(13,148,136,0.04)] hover:shadow-md transition-all p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider">
              Revenue ({currentMonth.month || 'This Month'})
            </span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100">
              <DollarSign size={18} />
            </div>
          </div>
          <div>
            <p className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
              AED {currentMonth.revenue.toLocaleString()}
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-[11.5px]">
              <span className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded-md ${
                revenueChange >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {revenueChange >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                <span>{Math.abs(revenueChange).toFixed(1)}%</span>
              </span>
              <span className="text-slate-400">vs last month</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Net Profit */}
        <div className="bg-white rounded-[22px] border border-teal-100/90 shadow-[0_4px_20px_rgba(13,148,136,0.04)] hover:shadow-md transition-all p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider">
              Net Profit ({currentMonth.month || 'This Month'})
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
              <TrendingUp size={18} />
            </div>
          </div>
          <div>
            <p className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
              AED {currentMonth.profit.toLocaleString()}
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-[11.5px]">
              <span className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded-md ${
                profitChange >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {profitChange >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                <span>{Math.abs(profitChange).toFixed(1)}%</span>
              </span>
              <span className="text-slate-400">vs last month</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Profit Margin */}
        <div className="bg-white rounded-[22px] border border-teal-100/90 shadow-[0_4px_20px_rgba(13,148,136,0.04)] hover:shadow-md transition-all p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider">
              Profit Margin
            </span>
            <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center border border-cyan-100">
              <BarChart3 size={18} />
            </div>
          </div>
          <div>
            <p className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
              {currentMonthMargin}%
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-[11.5px]">
              <span className="text-teal-800 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-md font-bold">
                {profitMargin}% Overall ({monthCount}m)
              </span>
            </div>
          </div>
        </div>

        {/* KPI 4: Jobs Delivered */}
        <div className="bg-white rounded-[22px] border border-teal-100/90 shadow-[0_4px_20px_rgba(13,148,136,0.04)] hover:shadow-md transition-all p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider">
              Jobs Delivered
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100">
              <Users size={18} />
            </div>
          </div>
          <div>
            <p className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
              {currentMonth.jobsCompleted}
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-[11.5px]">
              <span className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded-md ${
                jobsChange >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {jobsChange >= 0 ? `+${jobsChange}` : jobsChange} shifts
              </span>
              <span className="text-slate-400">vs last month</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Revenue vs Profit Trend + Revenue By Service Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Visualizer */}
        <div className="bg-white rounded-[22px] border border-teal-100/90 shadow-[0_4px_20px_rgba(13,148,136,0.04)] p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[15.5px] font-extrabold text-slate-900">Revenue & Profit Trend</h3>
              <p className="text-[11.5px] text-slate-500 mt-0.5">Monthly financial progression from live job logs</p>
            </div>
            <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-1 rounded-lg">
              {monthCount} Months Horizon
            </span>
          </div>

          <div className="space-y-4">
            {monthlyData.map(m => {
              const revPercent = Math.min(100, Math.round((m.revenue / maxMonthRevenue) * 100))
              const profitPercent = m.revenue > 0 ? Math.min(100, Math.round((Math.max(0, m.profit) / maxMonthRevenue) * 100)) : 0

              return (
                <div key={m.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">{m.fullLabel}</span>
                    <div className="text-right">
                      <span className="font-black text-slate-900">AED {m.revenue.toLocaleString()}</span>
                      <span className="text-[11px] font-semibold text-emerald-700 ml-2">
                        (Net: AED {m.profit.toLocaleString()})
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 h-4.5 bg-slate-100 rounded-lg p-0.5 overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-md transition-all duration-300"
                      style={{ width: `${revPercent}%` }}
                      title={`Revenue: AED ${m.revenue.toLocaleString()}`}
                    />
                    <div
                      className="h-full bg-emerald-500 rounded-md transition-all duration-300"
                      style={{ width: `${profitPercent}%` }}
                      title={`Profit: AED ${m.profit.toLocaleString()}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-5 mt-6 pt-4 border-t border-slate-100 text-[11.5px] font-semibold text-slate-600">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-md bg-teal-600" />
              <span>Revenue (Charges)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-md bg-emerald-500" />
              <span>Net Profit (After Expenses)</span>
            </div>
          </div>
        </div>

        {/* Revenue by Service Breakdown */}
        <div className="bg-white rounded-[22px] border border-teal-100/90 shadow-[0_4px_20px_rgba(13,148,136,0.04)] p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[15.5px] font-extrabold text-slate-900">Revenue by Cleaning Service</h3>
              <p className="text-[11.5px] text-slate-500 mt-0.5">Contribution to gross earnings across {monthCount} months</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg">
              Live Category Share
            </span>
          </div>

          {revenueByService.length > 0 ? (
            <div className="space-y-4">
              {revenueByService.map(service => (
                <div key={service.service} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles size={12} className="text-teal-600 shrink-0" />
                      <span>{service.service}</span>
                    </span>
                    <div className="text-right">
                      <span className="font-black text-slate-900">AED {service.revenue.toLocaleString()}</span>
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md ml-2">
                        {service.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${service.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">
              <p className="text-xs">No service records found for this period</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Financial Summary Trio ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-teal-50 via-teal-50/50 to-white border border-teal-200/80 rounded-[22px] p-5 shadow-2xs">
          <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wider mb-1">
            Total Revenue ({monthCount} Months)
          </p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mb-1">
            AED {totalRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 font-medium">
            Monthly Average: <strong>AED {monthlyData.length > 0 ? Math.round(totalRevenue / monthlyData.length).toLocaleString() : 0}</strong>
          </p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 via-emerald-50/50 to-white border border-emerald-200/80 rounded-[22px] p-5 shadow-2xs">
          <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
            Total Net Profit ({monthCount} Months)
          </p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mb-1">
            AED {totalProfit.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 font-medium">
            Overall Profit Margin: <strong className="text-emerald-700">{profitMargin}%</strong>
          </p>
        </div>

        <div className="bg-gradient-to-br from-sky-50 via-sky-50/50 to-white border border-sky-200/80 rounded-[22px] p-5 shadow-2xs">
          <p className="text-[11px] font-bold text-sky-800 uppercase tracking-wider mb-1">
            Total Cleaning Shifts
          </p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mb-1">
            {totalJobsCompleted}
          </p>
          <p className="text-xs text-slate-500 font-medium">
            Average: <strong>{monthlyData.length > 0 ? Math.round(totalJobsCompleted / monthlyData.length) : 0} jobs / month</strong>
          </p>
        </div>
      </div>

      {/* ── Top Team Cleaners (Live Operational Shift Breakdown) ── */}
      <div className="bg-white rounded-[22px] border border-teal-100/90 shadow-[0_4px_20px_rgba(13,148,136,0.04)] p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-[15.5px] font-extrabold text-slate-900">Top Team Cleaners & Performance</h3>
            <p className="text-[11.5px] text-slate-500 mt-0.5">Real-time duty hours, jobs delivered, and workload value</p>
          </div>
          <span className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
            {teamPerformance.length} Active Cleaners
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <th className="py-3 px-4">Cleaner Name</th>
                <th className="py-3 px-4 text-center">Role</th>
                <th className="py-3 px-4 text-center">Jobs Delivered</th>
                <th className="py-3 px-4 text-center">Duty Hours</th>
                <th className="py-3 px-4 text-right">Workload Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamPerformance.map((member, idx) => (
                <tr key={member.name} className="hover:bg-teal-50/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-900 text-[11px] font-black flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span>{member.name}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="capitalize text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                      {member.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-extrabold text-slate-900">
                    {member.jobsCompleted}
                  </td>
                  <td className="py-3 px-4 text-center font-semibold text-slate-600">
                    {member.hours} hrs
                  </td>
                  <td className="py-3 px-4 text-right font-black text-emerald-700">
                    AED {member.earnings.toLocaleString()}
                  </td>
                </tr>
              ))}
              {teamPerformance.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No cleaner records logged in this timeframe
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Client Economics & Dynamic Key Insights ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-[22px] border border-teal-100/90 p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-slate-700">Total Active Clients</span>
            <Users size={16} className="text-teal-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{clientMetrics.activeClientsCount}</p>
          <p className="text-[11.5px] text-slate-500">Registered across CRM and Daily Job Sheet</p>
        </div>

        <div className="bg-white rounded-[22px] border border-teal-100/90 p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-slate-700">Monthly Recurring Revenue</span>
            <RefreshCw size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-800">AED {clientMetrics.mrr.toLocaleString()}</p>
          <p className="text-[11.5px] text-slate-500">Monthly-contract visits charged this month · {clientMetrics.monthlyClientsCount} contracts</p>
        </div>

        <div className="bg-white rounded-[22px] border border-teal-100/90 p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-slate-700">Avg Value Per Client</span>
            <DollarSign size={16} className="text-cyan-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">AED {clientMetrics.avgRevPerClient.toLocaleString()}</p>
          <p className="text-[11.5px] text-slate-500">Gross billing average over {monthCount} months</p>
        </div>
      </div>

      {/* Dynamic Key Insights (Real computed business bullets) */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white rounded-[22px] p-6 shadow-md">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-teal-400" />
          <h4 className="text-[14px] font-black uppercase tracking-wider text-teal-300">
            Real-Time Operational Insights
          </h4>
        </div>
        <ul className="space-y-2 text-xs text-slate-200">
          <li className="flex items-start gap-2">
            <span className="text-teal-400 font-bold">✓</span>
            <span>
              Total gross revenue generated in this {monthCount}-month window is <strong>AED {totalRevenue.toLocaleString()}</strong> across <strong>{totalJobsCompleted}</strong> cleaning shifts.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-400 font-bold">✓</span>
            <span>
              Overall operating profit margin stands at <strong>{profitMargin}%</strong> after accounting for AED {totalExpenses.toLocaleString()} in logged expenses.
            </span>
          </li>
          {revenueByService.length > 0 && (
            <li className="flex items-start gap-2">
              <span className="text-teal-400 font-bold">✓</span>
              <span>
                Top revenue generating service category is <strong>{revenueByService[0].service}</strong> contributing <strong>{revenueByService[0].percentage}%</strong> of gross billing.
              </span>
            </li>
          )}
          {teamPerformance.length > 0 && (
            <li className="flex items-start gap-2">
              <span className="text-teal-400 font-bold">✓</span>
              <span>
                Lead staff performer is <strong>{teamPerformance[0].name}</strong> with <strong>{teamPerformance[0].jobsCompleted} completed shifts</strong> ({teamPerformance[0].hours} duty hours).
              </span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <span className="text-teal-400 font-bold">✓</span>
            <span>
              Monthly contract stability: <strong>{clientMetrics.monthlyClientsCount} clients</strong> contribute an estimated <strong>AED {clientMetrics.mrr.toLocaleString()}</strong> in recurring monthly revenue.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
