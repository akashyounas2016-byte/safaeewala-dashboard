import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'
import { TrendingUp, Target, Award, Users, Download } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { formatCurrency } from '@/lib/utils'
import { revenueData, serviceBreakdown, mockEmployees, mockClients } from '@/data/mock'

function exportCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const kpiTrend = [
  { month: 'Dec', churn: 5.2, admin_min: 20, margin: 42 },
  { month: 'Jan', churn: 4.9, admin_min: 18, margin: 43 },
  { month: 'Feb', churn: 4.8, admin_min: 17, margin: 44 },
  { month: 'Mar', churn: 4.5, admin_min: 15, margin: 45 },
  { month: 'Apr', churn: 4.2, admin_min: 13, margin: 46 },
  { month: 'May', churn: 4.1, admin_min: 12, margin: 47 },
]

const employeePerf = mockEmployees.filter(e => e.status === 'active').slice(0, 5).map((e, i) => ({
  name: e.full_name.split(' ')[0],
  jobs: [22, 18, 15, 20, 17][i] ?? 15,
  rating: [4.9, 4.7, 4.8, 4.6, 4.9][i] ?? 4.7,
}))

const topClients = [...mockClients].sort((a, b) => b.total_spent - a.total_spent).slice(0, 5)

export function Reports() {
  const [dateRange, setDateRange] = useState('6m')

  function handleExport() {
    exportCSV('safaeewala-revenue-report.csv', [
      ['Month', 'Revenue (AED)', 'Target (AED)', 'vs Target'],
      ...revenueData.map(d => [
        d.month,
        String(d.revenue),
        String(d.target),
        `${d.revenue >= d.target ? '+' : ''}${(((d.revenue - d.target) / d.target) * 100).toFixed(1)}%`,
      ]),
    ])
  }

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Reports"
        subtitle="Year 1 KPI targets · Revenue analytics · Staff performance · Service breakdown"
        statusChip="On Track"
        actionLabel="Export CSV"
        onAction={handleExport}
        searchPlaceholder="Search reports…"
      />

      {/* ── Date Range + Export bar ── */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-3.5 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500 font-semibold shrink-0">Date Range</span>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {[{ label: '3M', value: '3m' }, { label: '6M', value: '6m' }, { label: '1Y', value: '1y' }, { label: 'All', value: 'all' }].map(r => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={`text-[12px] px-3 py-1.5 rounded-lg font-semibold transition-all ${dateRange === r.value ? 'bg-white text-[#111827] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Monthly Revenue',    actual: 'AED 128,400', target: 'AED 120k target', good: true,  icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: '+7%'  },
          { label: 'Gross Margin',       actual: '47%',         target: '48% target',      good: false, icon: Target,     iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    delta: '-1%'  },
          { label: 'Avg Client Rating',  actual: '4.8★',        target: '4.8★ target',    good: true,  icon: Award,      iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   delta: 'Met'  },
          { label: 'Client Churn',       actual: '4.1%',        target: '3.4% target',    good: false, icon: Users,      iconBg: 'bg-rose-50',    iconColor: 'text-rose-600',    delta: '+0.7%' },
          { label: 'Admin Min/Booking',  actual: '12 min',      target: '10 min target',  good: false, icon: Target,     iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  delta: '+2 min' },
          { label: 'Invoice Collection', actual: '98.6%',       target: '99% target',     good: false, icon: TrendingUp, iconBg: 'bg-teal-50',    iconColor: 'text-teal-600',    delta: '-0.4%' },
          { label: 'No-Show Rate',       actual: '3.2%',        target: '3.0% target',    good: false, icon: Target,     iconBg: 'bg-slate-100',  iconColor: 'text-slate-600',   delta: '+0.2%' },
          { label: 'Self-Service',       actual: '0%',          target: '35% target',      good: false, icon: Users,      iconBg: 'bg-orange-50',  iconColor: 'text-orange-600',  delta: 'Not set' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-9 h-9 rounded-2xl ${k.iconBg} flex items-center justify-center`}>
                <k.icon size={16} className={k.iconColor} />
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${k.good ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>
                {k.delta}
              </span>
            </div>
            <p className="text-2xl font-bold text-[#111827] tracking-tight">{k.actual}</p>
            <p className="text-[12px] font-semibold text-[#111827] mt-1">{k.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{k.target}</p>
          </div>
        ))}
      </div>

      {/* ── Growth Alert ── */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-[22px] px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
          <TrendingUp size={16} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-[13px] font-bold text-emerald-800">Strong Growth Signal</p>
          <p className="text-[12px] text-emerald-700 mt-0.5">
            MRR exceeded Year 1 target by 208% — AED 128,400 vs AED 42,000 target. 3 KPIs on track.
          </p>
        </div>
      </div>

      {/* ── Charts + Service Mix sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Charts ── */}
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
                  <span className="w-3 h-0.5 bg-slate-300 inline-block rounded" />Target
                </span>
              </div>
            </div>
            <div className="px-6 py-5">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => `AED ${Number(v).toLocaleString()}`} contentStyle={{ borderRadius: 12, border: '1px solid #E4E8EC', fontSize: 12 }} />
                  <Area type="monotone" dataKey="target"  stroke="#cbd5e1" strokeWidth={1.5} fill="none" strokeDasharray="5 5" name="Target" />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revGrad)" name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* KPI Trends + Staff Performance side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">KPI Trends (6 months)</h3>
              </div>
              <div className="px-6 py-5">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={kpiTrend} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E4E8EC', fontSize: 12 }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="churn"     stroke="#f59e0b" strokeWidth={2} dot={false} name="Churn %" />
                    <Line type="monotone" dataKey="margin"    stroke="#10b981" strokeWidth={2} dot={false} name="Margin %" />
                    <Line type="monotone" dataKey="admin_min" stroke="#6366f1" strokeWidth={2} dot={false} name="Admin min" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Staff Performance (May)</h3>
              </div>
              <div className="px-6 py-5">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={employeePerf} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E4E8EC', fontSize: 12 }} />
                    <Bar dataKey="jobs" fill="#10b981" radius={[6, 6, 0, 0]} name="Jobs completed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Year 1 KPI table */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E4E8EC]">
              <h3 className="text-[15px] font-bold text-[#111827]">Year 1 KPI Targets</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#E4E8EC] bg-slate-50">
                    {['Metric', 'Baseline', 'Year 1 Target', 'Current', 'Progress'].map(h => (
                      <th key={h} className="text-left py-3 px-5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.07em]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {[
                    { metric: 'Admin min / booking',    baseline: '22 min',      target: '10 min',      current: '12 min',       pct: 83  },
                    { metric: 'Monthly client churn',   baseline: '4.8%',        target: '3.4%',        current: '4.1%',         pct: 50  },
                    { metric: 'Gross margin',           baseline: '44%',         target: '48%',         current: '47%',          pct: 75  },
                    { metric: 'Invoice collection',     baseline: '97.6%',       target: '99.0%',       current: '98.6%',        pct: 71  },
                    { metric: 'Avg client rating',      baseline: '4.6★',        target: '4.8★',        current: '4.8★',         pct: 100 },
                    { metric: 'MRR',                    baseline: 'AED 28,200',  target: 'AED 42,000',  current: 'AED 128,400',  pct: 100 },
                  ].map(row => (
                    <tr key={row.metric} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-5 text-[#111827] font-semibold">{row.metric}</td>
                      <td className="py-3.5 px-5 text-slate-400 text-[12px]">{row.baseline}</td>
                      <td className="py-3.5 px-5 text-slate-600 font-semibold text-[12px]">{row.target}</td>
                      <td className="py-3.5 px-5">
                        <span className={`text-[13px] font-bold ${row.pct >= 100 ? 'text-emerald-600' : row.pct >= 75 ? 'text-blue-600' : 'text-amber-600'}`}>
                          {row.current}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                            <div
                              className={`h-full rounded-full transition-all ${row.pct >= 100 ? 'bg-emerald-500' : row.pct >= 75 ? 'bg-blue-500' : 'bg-amber-400'}`}
                              style={{ width: `${Math.min(100, row.pct)}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500 font-medium w-8 text-right shrink-0">{row.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-5">

          {/* Service Mix */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Service Mix</h3>
              <span className="text-[11px] text-slate-400">By revenue %</span>
            </div>
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
                  <p className="text-[11px] text-slate-400 mt-0.5">{formatCurrency(128400 * s.value / 100)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top Clients */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Top Clients</h3>
              <span className="text-[11px] text-slate-400">By revenue</span>
            </div>
            <div className="space-y-3">
              {topClients.map((c, idx) => {
                const pct = Math.round((c.total_spent / topClients[0].total_spent) * 100)
                const avatarColors = [
                  { bg: '#dcefe7', text: '#0d8a72' },
                  { bg: '#fce4d6', text: '#c66a3a' },
                  { bg: '#e4dff5', text: '#6b5bb5' },
                  { bg: '#d6e7f5', text: '#3a7ab8' },
                  { bg: '#fcecc8', text: '#a8842a' },
                ]
                const color = avatarColors[idx % avatarColors.length]
                const parts = c.full_name.trim().split(' ')
                const init = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className={`text-[12px] font-bold w-4 shrink-0 ${idx === 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                      {idx + 1}
                    </span>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: color.bg, color: color.text }}>
                      {init}
                    </div>
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
          </div>

          {/* Operations Analytics */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Ops Analytics</h3>
              <span className="text-[11px] text-slate-400">May 2026</span>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Jobs this month',  value: '94',       change: '+12%',  up: true  },
                { label: 'Avg job value',    value: 'AED 1,365', change: '+5%',  up: true  },
                { label: 'Crew utilization', value: '87%',      change: '+4%',   up: true  },
                { label: 'Repeat bookings',  value: '68%',      change: '+8%',   up: true  },
                { label: 'Cancellation rate',value: '3.2%',     change: '-0.8%', up: true  },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-[#E4E8EC] last:border-0">
                  <span className="text-[12px] text-slate-600">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-[#111827]">{item.value}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${item.up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {item.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
