import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart,
} from 'recharts'
import {
  TrendingUp, Wallet, PiggyBank, AlertCircle, Briefcase, Download, BarChart3, PieChart, Users, CalendarDays,
  MapPin, Lightbulb, Table2, Repeat,
} from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { KpiCard, Widget } from '@/components/ui/KpiCard'
import { useData } from '@/store/DataContext'
import { todayDubai } from '@/lib/dubaiTime'
import { safeLocalStorageGet } from '@/lib/storageUtils'
import { isBogusJob, loadPendingReceipts } from '@/lib/clientDataSync'
import { lastMonths, monthlyFigures, outstandingNow, insightsFor, pctChange, type MonthlyPaymentLike } from '@/lib/businessMetrics'

const aed = (n: number) => `AED ${Math.round(n).toLocaleString()}`
const chipFor = (p: number | null, suffix = 'vs last month') => (p === null ? { chip: 'No earlier month', tone: 'plain' as const } : { chip: `${p >= 0 ? '+' : ''}${p}% ${suffix}`, tone: p >= 0 ? 'up' as const : 'down' as const })

/** UX-106 / R-FIN-07: Business Analytics — one organised grid, figures from lib/businessMetrics */
export function BusinessAnalytics() {
  const { dailyJobs, dailyExpenses, clients, invoices, bookings } = useData()
  const [timeframe, setTimeframe] = useState<'3' | '6' | '12'>('6')
  const monthlyPayments = useMemo(() => safeLocalStorageGet<MonthlyPaymentLike[]>('safaeewala_monthly_client_payments', []), [])
  const pendingReceipts = useMemo(() => loadPendingReceipts(), [])

  const months = useMemo(() => lastMonths(Number(timeframe)), [timeframe])
  const input = { dailyJobs, bookings, clients, dailyExpenses, invoices, monthlyPayments, pendingReceipts }
  const data = useMemo(() => monthlyFigures(input, months), [dailyJobs, bookings, clients, dailyExpenses, invoices, monthlyPayments, pendingReceipts, months]) // eslint-disable-line react-hooks/exhaustive-deps
  const outstanding = useMemo(() => outstandingNow({ dailyJobs, invoices, pendingReceipts }), [dailyJobs, invoices, pendingReceipts])
  const insights = useMemo(() => insightsFor({ dailyJobs }, months.map(m => m.key)), [dailyJobs, months])

  const sum = (k: 'revenue' | 'collected' | 'expenses' | 'profit' | 'jobs' | 'dutyHours' | 'contractRevenue' | 'oneOffRevenue' | 'newClients') => data.reduce((s, m) => s + m[k], 0)
  const cur = data[data.length - 1], prev = data[data.length - 2]
  const totalRevenue = sum('revenue'), totalCollected = sum('collected'), totalProfit = sum('profit')
  const collectionRate = totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0
  const margin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0
  const contractShare = totalRevenue > 0 ? Math.round((sum('contractRevenue') / totalRevenue) * 100) : 0

  // Revenue by service (one-off work in the period)
  const byService = useMemo(() => {
    const keys = new Set(months.map(m => m.key))
    const t: Record<string, number> = {}
    dailyJobs.filter(j => !isBogusJob(j) && keys.has(String(j.date).slice(0, 7))).forEach(j => {
      const s = (j.service || '').trim() || 'General Cleaning'
      t[s] = (t[s] || 0) + (Number(j.charges) || 0)
    })
    return Object.entries(t).map(([service, revenue]) => ({ service, revenue })).filter(s => s.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [dailyJobs, months])
  const serviceMax = Math.max(1, ...byService.map(s => s.revenue))

  const keyInsights = [
    cur && prev ? `Revenue this month is ${aed(cur.revenue)}${pctChange(cur.revenue, prev.revenue) !== null ? ` (${pctChange(cur.revenue, prev.revenue)! >= 0 ? 'up' : 'down'} ${Math.abs(pctChange(cur.revenue, prev.revenue)!)}% on last month)` : ''}.` : null,
    totalRevenue > 0 ? `${collectionRate}% of the period's revenue has been collected; ${aed(outstanding.total)} is still outstanding today.` : null,
    totalRevenue > 0 ? `Monthly contracts bring ${contractShare}% of revenue; one-off jobs ${100 - contractShare}%.` : null,
    insights.busiestDay ? `${insights.busiestDay.day} is the busiest day (${insights.busiestDay.jobs} jobs in the period).` : null,
    insights.revenuePerHour > 0 ? `Each duty hour earns about AED ${insights.revenuePerHour}; an average job is AED ${insights.avgJobValue}.` : null,
    insights.lastMonthClients > 0 ? `${insights.retainedClients} of last month's ${insights.lastMonthClients} sites were served again this month.` : null,
    insights.topAreas[0] ? `${insights.topAreas[0].area} is the top area (${aed(insights.topAreas[0].revenue)}).` : null,
  ].filter(Boolean) as string[]

  const handleExport = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Month', 'Revenue', 'One-off jobs', 'Monthly contracts', 'Collected', 'Expenses', 'Gross profit', 'Jobs', 'Duty hours', 'New clients'],
      ...data.map(m => [m.label, m.revenue, m.oneOffRevenue, m.contractRevenue, m.collected, m.expenses, m.profit, m.jobs, m.dutyHours, m.newClients]),
      ['Total', totalRevenue, sum('oneOffRevenue'), sum('contractRevenue'), totalCollected, sum('expenses'), totalProfit, sum('jobs'), sum('dutyHours'), sum('newClients')],
    ]), 'Monthly')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Staff', 'Jobs', 'Duty hours', 'Revenue share'], ...insights.staff.map(s => [s.name, s.jobs, s.hours, s.revenue])]), 'Staff')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Area', 'Jobs', 'Revenue'], ...insights.topAreas.map(a => [a.area, a.jobs, a.revenue])]), 'Areas')
    XLSX.writeFile(wb, `Safaeewala_Analytics_${todayDubai()}.xlsx`)
  }

  const rev = chipFor(cur && prev ? pctChange(cur.revenue, prev.revenue) : null)
  const jobsChip = chipFor(cur && prev ? pctChange(cur.jobs, prev.jobs) : null)

  return (
    <div className="space-y-6">
      <PageHero
        title="Business Analytics"
        subtitle={`Performance of the last ${timeframe} months · same figures as Reports`}
        statusChip="Live data"
        showSearch={false}
        actions={
          <div className="flex items-center gap-2.5">
            <Select value={timeframe} onChange={e => setTimeframe(e.target.value as '3' | '6' | '12')}
              className="text-[12.5px] font-bold bg-white border-slate-200 rounded-xl px-3 py-1.5 text-slate-900">
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
              <option value="12">Last 12 months</option>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport} className="bg-white text-slate-900 font-bold text-[12px]">
              <Download size={13} className="mr-1.5 text-emerald-700" /> Export Excel
            </Button>
          </div>
        }
      />

      {/* Row 1 — five KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        <KpiCard label="Revenue" value={aed(totalRevenue)} sub={`This month ${aed(cur?.revenue || 0)}`} icon={TrendingUp} labelColor="text-blue-700" iconSolid="bg-[#2563eb] shadow-blue-500/25" chip={rev.chip} chipTone={rev.tone} />
        <KpiCard label="Collected" value={aed(totalCollected)} sub="Received, recoveries, contracts" icon={Wallet} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" chip={`${collectionRate}% of revenue`} chipTone={collectionRate >= 80 ? 'up' : 'warn'} />
        <KpiCard label="Gross Profit" value={aed(totalProfit)} sub="Revenue − expenses (before salaries)" icon={PiggyBank} labelColor="text-purple-700" iconSolid="bg-[#7c3aed] shadow-purple-500/25" chip={`${margin}% margin`} chipTone={margin >= 0 ? 'up' : 'down'} />
        <KpiCard label="Outstanding Now" value={aed(outstanding.total)} sub={`Jobs ${aed(outstanding.jobs)} · invoices ${aed(outstanding.invoices)}`} icon={AlertCircle} labelColor="text-rose-700" iconSolid="bg-[#e11d48] shadow-rose-500/25" chip={outstanding.total > 0 ? 'To collect' : 'All collected'} chipTone={outstanding.total > 0 ? 'warn' : 'up'} />
        <KpiCard label="Jobs Delivered" value={sum('jobs')} sub={`${sum('dutyHours').toLocaleString()} duty hours`} icon={Briefcase} labelColor="text-sky-700" iconSolid="bg-[#0284c7] shadow-sky-500/25" chip={jobsChip.chip} chipTone={jobsChip.tone} />
      </div>

      {/* Row 2 — trend + revenue mix */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Widget title="Revenue, collections & expenses" note="Per month · gross profit as the line" icon={BarChart3} className="xl:col-span-2">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" />
                <XAxis dataKey="short" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={v => aed(Number(v) || 0)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[6, 6, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                <Line dataKey="profit" name="Gross profit" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Widget>
        <Widget title="Revenue mix" note="Contracts vs one-off · top services" icon={PieChart}>
          <div className="space-y-4">
            <div>
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                <div className="bg-teal-600" style={{ width: `${contractShare}%` }} />
                <div className="bg-blue-500" style={{ width: `${100 - contractShare}%` }} />
              </div>
              <div className="flex justify-between text-[12px] mt-2">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-teal-600" />Monthly contracts · {aed(sum('contractRevenue'))}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />One-off · {aed(sum('oneOffRevenue'))}</span>
              </div>
            </div>
            <div className="space-y-2.5 pt-1">
              {byService.length === 0 ? <p className="text-[12px] text-slate-400 text-center py-6">No jobs in this period</p> : byService.map(s => (
                <div key={s.service}>
                  <div className="flex justify-between text-[12.5px]"><span className="font-semibold text-slate-800 truncate">{s.service}</span><span className="font-bold text-slate-900">{aed(s.revenue)}</span></div>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-1"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(s.revenue / serviceMax) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </Widget>
      </div>

      {/* Row 3 — team + weekdays */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Widget title="Team performance" note="By duty hours in the period · shared jobs split equally" icon={Users} className="xl:col-span-2">
          {insights.staff.length === 0 ? <p className="text-[12px] text-slate-400 text-center py-8">No staff work in this period</p> : (
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th className="py-2">Staff</th><th className="py-2 text-right">Jobs</th><th className="py-2 text-right">Duty hours</th><th className="py-2 text-right">Revenue share</th><th className="py-2 text-right">AED / hour</th>
              </tr></thead>
              <tbody>{insights.staff.map(s => (
                <tr key={s.name} className="border-b border-slate-50">
                  <td className="py-2 font-semibold text-slate-900">{s.name}</td>
                  <td className="py-2 text-right">{s.jobs}</td>
                  <td className="py-2 text-right">{s.hours}</td>
                  <td className="py-2 text-right font-bold">{aed(s.revenue)}</td>
                  <td className="py-2 text-right text-slate-600">{s.hours > 0 ? Math.round(s.revenue / s.hours) : 0}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Widget>
        <Widget title="Busiest days" note="Jobs per weekday in the period" icon={CalendarDays}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.byWeekday.map(d => ({ ...d, day: d.day.slice(0, 3) }))} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="jobs" name="Jobs" fill="#0d9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Widget>
      </div>

      {/* Row 4 — areas, clients, insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <Widget title="Top areas" note="One-off revenue by area" icon={MapPin}>
          {insights.topAreas.length === 0 ? <p className="text-[12px] text-slate-400 text-center py-6">No jobs in this period</p> : (
            <ul className="space-y-2.5">{insights.topAreas.map(a => (
              <li key={a.area} className="flex justify-between text-[12.5px]"><span className="font-semibold text-slate-800 truncate">{a.area} <span className="text-slate-400 font-normal">· {a.jobs} jobs</span></span><span className="font-bold">{aed(a.revenue)}</span></li>
            ))}</ul>
          )}
        </Widget>
        <Widget title="Clients" note="Growth and retention" icon={Repeat}>
          <ul className="space-y-2.5 text-[12.5px]">
            <li className="flex justify-between"><span className="text-slate-600">Clients on record</span><b>{clients.length}</b></li>
            <li className="flex justify-between"><span className="text-slate-600">Monthly / Bi-Weekly contracts</span><b>{clients.filter(c => (c.service_days || []).length > 0 && c.contract_active !== false).length}</b></li>
            <li className="flex justify-between"><span className="text-slate-600">New in the period</span><b>{sum('newClients')}</b></li>
            <li className="flex justify-between"><span className="text-slate-600">Sites served again this month</span><b>{insights.retainedClients} / {insights.lastMonthClients}</b></li>
            <li className="flex justify-between"><span className="text-slate-600">Average job value</span><b>{aed(insights.avgJobValue)}</b></li>
            <li className="flex justify-between"><span className="text-slate-600">Revenue per duty hour</span><b>{aed(insights.revenuePerHour)}</b></li>
          </ul>
        </Widget>
        <Widget title="Key insights" note="Worked out from the figures above" icon={Lightbulb}>
          {keyInsights.length === 0 ? <p className="text-[12px] text-slate-400 text-center py-6">Not enough data yet</p> : (
            <ul className="space-y-2 text-[12.5px] text-slate-700 list-disc pl-4">{keyInsights.map(t => <li key={t}>{t}</li>)}</ul>
          )}
        </Widget>
      </div>

      {/* Row 5 — month by month */}
      <Widget title="Month by month" note="Revenue = one-off jobs + monthly contracts" icon={Table2}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[760px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <th className="py-2">Month</th><th className="py-2 text-right">Revenue</th><th className="py-2 text-right">Contracts</th><th className="py-2 text-right">Collected</th><th className="py-2 text-right">Expenses</th><th className="py-2 text-right">Gross profit</th><th className="py-2 text-right">Jobs</th><th className="py-2 text-right">Hours</th>
            </tr></thead>
            <tbody>{[...data].reverse().map(m => (
              <tr key={m.key} className="border-b border-slate-50">
                <td className="py-2 font-semibold">{m.label}</td>
                <td className="py-2 text-right font-bold">{aed(m.revenue)}</td>
                <td className="py-2 text-right">{aed(m.contractRevenue)}</td>
                <td className="py-2 text-right text-emerald-700">{aed(m.collected)}</td>
                <td className="py-2 text-right text-amber-700">{aed(m.expenses)}</td>
                <td className={`py-2 text-right font-bold ${m.profit >= 0 ? 'text-purple-700' : 'text-red-600'}`}>{aed(m.profit)}</td>
                <td className="py-2 text-right">{m.jobs}</td>
                <td className="py-2 text-right">{m.dutyHours}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Widget>
    </div>
  )
}
