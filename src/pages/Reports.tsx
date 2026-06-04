import { useState } from 'react'
import * as XLSX from 'xlsx'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'
import { TrendingUp, Target, Award, Users, Download, DollarSign, CheckCircle, Percent, Calendar, FileSpreadsheet } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'

function exportCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

/* ─── Avatar for top clients ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72' },
  { bg: '#fce4d6', text: '#c66a3a' },
  { bg: '#e4dff5', text: '#6b5bb5' },
  { bg: '#d6e7f5', text: '#3a7ab8' },
  { bg: '#fcecc8', text: '#a8842a' },
]

export function Reports() {
  const { bookings, clients, employees, invoices, dailyJobs } = useData()
  const [dateRange, setDateRange] = useState('6m')

  // Payroll period — default to current month
  const [payPeriod, setPayPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  // Build last 6 months as options
  const payPeriodOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    return { key, label }
  })

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  /* ── Monthly revenue data ── */
  const sliceCount = dateRange === '3m' ? 3 : dateRange === '6m' ? 6 : dateRange === '1y' ? 12 : 24
  const months = Array.from({ length: sliceCount }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - (sliceCount - 1 - i))
    return {
      month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      revenue: 0,
      target: 0,
      jobs: 0,
    }
  })
  bookings
    .filter(b => b.status === 'completed' || b.status === 'in_progress')
    .forEach(b => {
      const key = b.scheduled_date.slice(0, 7)
      const m = months.find(m => m.key === key)
      if (m) { m.revenue += b.total_amount; m.jobs++ }
    })

  // Dynamic target: 110% of average monthly revenue (min AED 5,000)
  const nonZeroRevs = months.map(m => m.revenue).filter(r => r > 0)
  const monthlyTarget = nonZeroRevs.length > 0
    ? Math.max(5000, Math.round((nonZeroRevs.reduce((s, r) => s + r, 0) / nonZeroRevs.length) * 1.1 / 500) * 500)
    : 10000
  months.forEach(m => { m.target = monthlyTarget })

  /* ── KPI computations (all real) ── */
  const completedBookings  = bookings.filter(b => b.status === 'completed')
  const cancelledBookings  = bookings.filter(b => b.status === 'cancelled')
  const activeBookings     = bookings.filter(b => b.status !== 'cancelled')
  const thisMonthBookings  = bookings.filter(b => b.scheduled_date.startsWith(thisMonth))
  const thisMonthRevenue   = thisMonthBookings
    .filter(b => b.status === 'completed' || b.status === 'in_progress')
    .reduce((s, b) => s + b.total_amount, 0)
  const totalRevenue       = bookings
    .filter(b => b.status === 'completed' || b.status === 'in_progress')
    .reduce((s, b) => s + b.total_amount, 0)
  const completionRate     = activeBookings.length > 0
    ? Math.round((completedBookings.length / activeBookings.length) * 100) : 0
  const avgJobValue        = completedBookings.length > 0
    ? Math.round(completedBookings.reduce((s, b) => s + b.total_amount, 0) / completedBookings.length) : 0
  const thisMonthNewClients = clients.filter(c => c.created_at.startsWith(thisMonth)).length
  const repeatClients      = clients.filter(c => c.total_bookings > 1).length
  const repeatRate         = clients.length > 0 ? Math.round((repeatClients / clients.length) * 100) : 0
  const pendingCollection  = invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + i.total, 0)
  const paidInvoices       = invoices.filter(i => i.status === 'paid').length
  const collectionRate     = invoices.length > 0 ? Math.round((paidInvoices / invoices.length) * 100) : 0
  const cancellationRate   = bookings.length > 0
    ? ((cancelledBookings.length / bookings.length) * 100).toFixed(1) : '0'

  /* ── Service mix (real) ── */
  const serviceCounts: Record<string, number> = {}
  bookings.forEach(b => { serviceCounts[b.service_type] = (serviceCounts[b.service_type] || 0) + 1 })
  const serviceColors = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b']
  const serviceBreakdown = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count], i) => ({
      name,
      value: bookings.length > 0 ? Math.round((count / bookings.length) * 100) : 0,
      color: serviceColors[i % serviceColors.length],
      revenue: bookings
        .filter(b => b.service_type === name && (b.status === 'completed' || b.status === 'in_progress'))
        .reduce((s, b) => s + b.total_amount, 0),
    }))

  /* ── Staff performance (real — jobs per employee from assigned_crew) ── */
  const empPerf = employees
    .filter(e => e.status === 'active' || e.status === 'engaged_in_project')
    .map(emp => ({
      name:     emp.full_name.split(' ')[0],
      fullName: emp.full_name,
      jobs:     bookings.filter(b => b.assigned_crew.includes(emp.id) && b.status === 'completed').length,
      role:     emp.role,
    }))
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 8)

  /* ── Monthly jobs trend (for line chart) ── */
  const monthlyTrend = months.map(m => ({
    month: m.month,
    revenue: m.revenue,
    jobs: m.jobs,
    avgValue: m.jobs > 0 ? Math.round(m.revenue / m.jobs) : 0,
  }))

  /* ── Top clients (real) ── */
  const topClients = [...clients].sort((a, b) => b.total_spent - a.total_spent).slice(0, 5)

  /* ── Ops metrics (real) ── */
  const thisMonthJobs     = thisMonthBookings.length
  const thisMonthCompleted = thisMonthBookings.filter(b => b.status === 'completed').length
  const activeEmployees   = employees.filter(e => e.status === 'active' || e.status === 'engaged_in_project').length
  const crewUtilization   = activeEmployees > 0
    ? Math.min(100, Math.round((thisMonthJobs / (activeEmployees * 20)) * 100)) : 0

  /* ── Export (real data) ── */
  function handleExport() {
    exportCSV('safaeewala-revenue-report.csv', [
      ['Month', 'Revenue (AED)', `Target (AED ${monthlyTarget.toLocaleString()})`, 'Jobs Completed'],
      ...months.map(d => [d.month, String(d.revenue), String(d.target), String(d.jobs)]),
    ])
  }

  /* ── Payroll calculations ── */
  const payrollRows = employees
    .filter(e => e.status !== 'inactive')
    .map(emp => {
      const empJobs = dailyJobs.filter(j =>
        j.date.startsWith(payPeriod) &&
        j.staff_name.toLowerCase().trim() === emp.full_name.toLowerCase().trim()
      )
      const hours  = empJobs.reduce((s, j) => s + (j.duty_hours || 0), 0)
      const salary = Math.round(hours * emp.pay_rate_hourly)
      return { emp, hours: Math.round(hours * 10) / 10, salary, jobCount: empJobs.length }
    })
    .sort((a, b) => b.salary - a.salary)
  const totalPayroll = payrollRows.reduce((s, r) => s + r.salary, 0)

  function exportPayroll() {
    const ws = XLSX.utils.json_to_sheet(payrollRows.map(r => ({
      'Employee':        r.emp.full_name,
      'Role':            r.emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner',
      'Jobs Logged':     r.jobCount,
      'Hours Worked':    r.hours,
      'Rate (AED/hr)':   r.emp.pay_rate_hourly,
      'Salary (AED)':    r.salary,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll')
    XLSX.writeFile(wb, `payroll-${payPeriod}.xlsx`)
  }

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Reports"
        subtitle={`${bookings.length} total bookings · AED ${totalRevenue.toLocaleString()} revenue · ${clients.length} clients`}
        statusChip={completionRate >= 80 ? 'On Track' : 'Needs Attention'}
        actionLabel="Export CSV"
        onAction={handleExport}
        searchPlaceholder="Search reports…"
      />

      {/* ── Date Range bar ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-3.5 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500 font-semibold shrink-0">Revenue Window</span>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {[{ label: '3M', value: '3m' }, { label: '6M', value: '6m' }, { label: '1Y', value: '1y' }, { label: '2Y', value: 'all' }].map(r => (
            <button key={r.value} onClick={() => setDateRange(r.value)}
              className={`text-[12px] px-3 py-1.5 rounded-lg font-semibold transition-all ${dateRange === r.value ? 'bg-white text-[#111827] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button onClick={handleExport}
            className="flex items-center gap-2 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-colors">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI Cards (all real) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'This Month Revenue',  actual: `AED ${thisMonthRevenue.toLocaleString()}`,      sub: 'Completed + live jobs',  good: thisMonthRevenue > 0,  icon: DollarSign,  iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', badge: thisMonthJobs > 0 ? `${thisMonthJobs} jobs` : 'No jobs yet' },
          { label: 'Completion Rate',     actual: `${completionRate}%`,                             sub: 'Completed / not cancelled', good: completionRate >= 80, icon: CheckCircle, iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    badge: `${completedBookings.length} done` },
          { label: 'Avg Job Value',       actual: avgJobValue > 0 ? `AED ${avgJobValue.toLocaleString()}` : '—', sub: 'Per completed booking', good: avgJobValue > 0, icon: Target, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', badge: `${completedBookings.length} bookings` },
          { label: 'Repeat Client Rate',  actual: `${repeatRate}%`,                                sub: 'Clients with 2+ bookings', good: repeatRate >= 50,    icon: Users,       iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  badge: `${repeatClients} clients` },
          { label: 'Invoice Collection',  actual: `${collectionRate}%`,                            sub: 'Paid / total invoices',    good: collectionRate >= 90, icon: Percent,     iconBg: 'bg-teal-50',    iconColor: 'text-teal-600',    badge: `${paidInvoices} paid` },
          { label: 'Pending Collection',  actual: `AED ${pendingCollection.toLocaleString()}`,     sub: 'Sent + overdue invoices',  good: pendingCollection === 0, icon: Award,  iconBg: 'bg-rose-50',    iconColor: 'text-rose-600',    badge: pendingCollection > 0 ? 'Outstanding' : 'All clear' },
          { label: 'New Clients (MTD)',   actual: thisMonthNewClients,                              sub: 'Joined this month',        good: thisMonthNewClients > 0, icon: TrendingUp, iconBg: 'bg-orange-50', iconColor: 'text-orange-600', badge: `${clients.length} total` },
          { label: 'Cancellation Rate',   actual: `${cancellationRate}%`,                          sub: 'Of all bookings',          good: Number(cancellationRate) < 5, icon: Calendar, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', badge: `${cancelledBookings.length} cancelled` },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-9 h-9 rounded-2xl ${k.iconBg} flex items-center justify-center`}>
                <k.icon size={16} className={k.iconColor} />
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${k.good ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>
                {k.badge}
              </span>
            </div>
            <p className="text-2xl font-bold text-[#111827] tracking-tight">{k.actual}</p>
            <p className="text-[12px] font-semibold text-[#111827] mt-1">{k.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Charts + sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left: Charts */}
        <div className="xl:col-span-2 space-y-6">

          {/* Revenue vs Target */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-[#111827]">Revenue vs Target</h3>
              <div className="flex items-center gap-4 text-[12px]">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" />Revenue
                </span>
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-3 h-0.5 bg-slate-300 inline-block rounded" />Target (AED {(monthlyTarget / 1000).toFixed(0)}k)
                </span>
              </div>
            </div>
            <div className="px-6 py-5">
              {months.every(m => m.revenue === 0) ? (
                <div className="flex items-center justify-center h-[240px] text-slate-400 text-sm">
                  Complete bookings to see revenue chart
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={months} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip formatter={v => `AED ${Number(v).toLocaleString()}`} contentStyle={{ borderRadius: 12, border: '1px solid #E4E8EC', fontSize: 12 }} />
                    <Area type="monotone" dataKey="target"  stroke="#cbd5e1" strokeWidth={1.5} fill="none" strokeDasharray="5 5" name="Target" />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revGrad2)" name="Revenue"
                      dot={{ r: 3, fill: '#fff', stroke: '#10b981', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Monthly Jobs + Staff Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Monthly jobs trend */}
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Monthly Job Volume</h3>
              </div>
              <div className="px-6 py-5">
                {monthlyTrend.every(m => m.jobs === 0) ? (
                  <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">No completed jobs yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={monthlyTrend} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E4E8EC', fontSize: 12 }} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="jobs" stroke="#10b981" strokeWidth={2} dot={false} name="Jobs completed" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Staff Performance */}
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Staff Performance</h3>
              </div>
              <div className="px-6 py-5">
                {empPerf.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">No employees yet</div>
                ) : empPerf.every(e => e.jobs === 0) ? (
                  <div className="space-y-2.5">
                    {empPerf.map(e => (
                      <div key={e.fullName} className="flex items-center justify-between py-1">
                        <span className="text-[12px] text-slate-700 truncate flex-1">{e.fullName}</span>
                        <span className="text-[11px] text-slate-400 ml-2">0 jobs assigned</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={empPerf} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} barSize={22}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E4E8EC', fontSize: 12 }} />
                      <Bar dataKey="jobs" fill="#10b981" radius={[6, 6, 0, 0]} name="Jobs completed" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Bookings breakdown table */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E4E8EC]">
              <h3 className="text-[15px] font-bold text-[#111827]">Business Metrics</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#E4E8EC] bg-slate-50">
                    {['Metric', 'Value', 'Status'].map(h => (
                      <th key={h} className="text-left py-3 px-5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.07em]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {[
                    { metric: 'Total bookings',     value: `${bookings.length}`,                           good: bookings.length > 0 },
                    { metric: 'Completed jobs',     value: `${completedBookings.length}`,                  good: completedBookings.length > 0 },
                    { metric: 'Cancelled jobs',     value: `${cancelledBookings.length}`,                  good: cancelledBookings.length === 0 },
                    { metric: 'Completion rate',    value: `${completionRate}%`,                            good: completionRate >= 80 },
                    { metric: 'Total clients',      value: `${clients.length}`,                            good: clients.length > 0 },
                    { metric: 'Repeat clients',     value: `${repeatClients} (${repeatRate}%)`,            good: repeatRate >= 50 },
                    { metric: 'Invoice collection', value: `${collectionRate}% (${paidInvoices} paid)`,   good: collectionRate >= 90 },
                    { metric: 'Pending collection', value: `AED ${pendingCollection.toLocaleString()}`,    good: pendingCollection === 0 },
                  ].map(row => (
                    <tr key={row.metric} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-5 text-[#111827] font-semibold">{row.metric}</td>
                      <td className="py-3.5 px-5">
                        <span className={`text-[13px] font-bold ${row.good ? 'text-emerald-600' : 'text-amber-600'}`}>{row.value}</span>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${row.good ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {row.good ? 'Good' : 'Attention'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right sidebar */}
        <div className="space-y-5">

          {/* Service Mix (real) */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Service Mix</h3>
              <span className="text-[11px] text-slate-400">By booking %</span>
            </div>
            {serviceBreakdown.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-4">No bookings yet</p>
            ) : (
              <div className="space-y-3">
                {serviceBreakdown.map(s => (
                  <div key={s.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-semibold text-slate-700 truncate">{s.name}</span>
                      <span className="text-[12px] font-bold text-[#111827] ml-2 shrink-0">{s.value}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${s.value}%`, backgroundColor: s.color }} />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">AED {s.revenue.toLocaleString()} revenue</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Clients (real) */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Top Clients</h3>
              <span className="text-[11px] text-slate-400">By revenue</span>
            </div>
            {topClients.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-4">No clients yet</p>
            ) : (
              <div className="space-y-3">
                {topClients.map((c, idx) => {
                  const pct = Math.round((c.total_spent / (topClients[0].total_spent || 1)) * 100)
                  const color = avatarColors[idx % avatarColors.length]
                  const parts = c.full_name.trim().split(' ')
                  const init = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className={`text-[12px] font-bold w-4 shrink-0 ${idx === 0 ? 'text-amber-500' : 'text-slate-400'}`}>{idx + 1}</span>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: color.bg, color: color.text }}>{init}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-[#111827] truncate">{c.full_name}</p>
                        <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-[#111827] shrink-0">AED {c.total_spent.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Ops Analytics (real) */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Ops Analytics</h3>
              <span className="text-[11px] text-slate-400">Live data</span>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Jobs this month',   value: thisMonthJobs,                        badge: `${thisMonthCompleted} done` },
                { label: 'Avg job value',     value: avgJobValue > 0 ? `AED ${avgJobValue.toLocaleString()}` : '—', badge: 'Per booking' },
                { label: 'Crew utilization',  value: `${crewUtilization}%`,                badge: `${activeEmployees} staff` },
                { label: 'Repeat booking rate', value: `${repeatRate}%`,                  badge: `${repeatClients} clients` },
                { label: 'Cancellation rate', value: `${cancellationRate}%`,               badge: `${cancelledBookings.length} cancelled` },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-[#E4E8EC] last:border-0">
                  <span className="text-[12px] text-slate-600">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-[#111827]">{item.value}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{item.badge}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Payroll Report ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-[#111827]">Staff Payroll</h3>
            <p className="text-[12px] text-slate-500 mt-0.5">Based on daily job sheet hours × employee hourly rate</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={payPeriod}
              onChange={e => setPayPeriod(e.target.value)}
              className="text-[13px] px-3.5 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
            >
              {payPeriodOptions.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={exportPayroll}
              className="flex items-center gap-2 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-colors"
            >
              <FileSpreadsheet size={13} /> Export Excel
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-slate-50">
                {['Employee', 'Role', 'Jobs Logged', 'Hours Worked', 'Rate (AED/hr)', 'Salary (AED)'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.07em] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E8EC]">
              {payrollRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-slate-400">No employees found</td>
                </tr>
              ) : payrollRows.map(({ emp, hours, salary, jobCount }) => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-[#111827]">{emp.full_name}</p>
                    <p className="text-[11px] text-slate-400">{emp.nationality}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${emp.role === 'crew_lead' ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                      {emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{jobCount}</td>
                  <td className="px-5 py-3.5">
                    <span className={`font-semibold ${hours > 0 ? 'text-[#111827]' : 'text-slate-400'}`}>{hours}h</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">AED {emp.pay_rate_hourly}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[14px] font-bold ${salary > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      AED {salary.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-[#E4E8EC] bg-slate-50">
              <tr>
                <td colSpan={5} className="px-5 py-3.5 text-[13px] font-bold text-[#111827]">Total Payroll</td>
                <td className="px-5 py-3.5 text-[15px] font-bold text-emerald-600">AED {totalPayroll.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {payrollRows.every(r => r.hours === 0) && dailyJobs.length > 0 && (
          <div className="px-6 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-[12px] text-amber-700">
              ⚠ Hours are pulled from Daily Job Sheet entries. Make sure employee names in the Daily Job Sheet match exactly with employee full names.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
