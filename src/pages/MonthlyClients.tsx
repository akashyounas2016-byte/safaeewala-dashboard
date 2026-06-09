import { useState } from 'react'
import { ChevronLeft, ChevronRight, Users, TrendingUp, DollarSign, RefreshCw } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { formatCurrency } from '@/lib/utils'

export function MonthlyClients() {
  const { clients, bookings } = useData()
  const [selectedMonth, setSelectedMonth] = useState(new Date())

  const currentMonthKey = selectedMonth.toISOString().slice(0, 7)
  const monthBookings = bookings.filter(b => b.created_at?.startsWith(currentMonthKey))

  const uniqueClientsThisMonth = new Set(monthBookings.map(b => b.client_id)).size
  const monthlyRevenue = monthBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + b.total_amount, 0)

  const avgOrderValue = monthBookings.length > 0 ? monthlyRevenue / monthBookings.length : 0

  const monthClientIds = new Set(monthBookings.map(b => b.client_id))
  const monthClients = clients.filter(c => monthClientIds.has(c.id))

  const monthName = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    const d = new Date(selectedMonth)
    d.setMonth(d.getMonth() - 1)
    setSelectedMonth(d)
  }

  const nextMonth = () => {
    const d = new Date(selectedMonth)
    d.setMonth(d.getMonth() + 1)
    setSelectedMonth(d)
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Monthly Clients"
        subtitle={`${uniqueClientsThisMonth} new clients · ${formatCurrency(monthlyRevenue)} revenue`}
        statusChip={`${monthBookings.length} Orders`}
      />

      {/* Month Selector */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-[20px] font-bold text-[#111827]">{monthName}</p>
        </div>
        <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'New Clients',
            value: uniqueClientsThisMonth,
            icon: Users,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            label: 'Total Orders',
            value: monthBookings.length,
            icon: TrendingUp,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: 'Revenue',
            value: formatCurrency(monthlyRevenue),
            icon: DollarSign,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: 'Avg Order Value',
            value: formatCurrency(avgOrderValue),
            icon: RefreshCw,
            color: 'text-slate-600',
            bg: 'bg-slate-100',
          },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                <card.icon size={18} className={card.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#111827]">{card.value}</p>
            <p className="text-[12px] text-slate-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Clients Table */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-[#f8fafc]">
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">Client Name</th>
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">Phone</th>
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">Orders</th>
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">Total Spent</th>
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">City</th>
              </tr>
            </thead>
            <tbody>
              {monthClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No new clients this month
                  </td>
                </tr>
              ) : (
                monthClients.map((client) => {
                  const clientOrders = monthBookings.filter(b => b.client_id === client.id)
                  return (
                    <tr key={client.id} className="border-b border-[#E4E8EC] hover:bg-[#f8fafc]">
                      <td className="px-6 py-4 text-[13px] font-medium text-[#111827]">{client.full_name}</td>
                      <td className="px-6 py-4 text-[13px] text-slate-600">{client.phone || '—'}</td>
                      <td className="px-6 py-4 text-[13px] font-semibold text-[#111827]">{clientOrders.length}</td>
                      <td className="px-6 py-4 text-[13px] font-semibold text-emerald-600">{formatCurrency(clientOrders.reduce((sum, b) => sum + b.total_amount, 0))}</td>
                      <td className="px-6 py-4 text-[13px] text-slate-600">{client.city || '—'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
