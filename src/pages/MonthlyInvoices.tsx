import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, TrendingUp, DollarSign, CheckCircle, Clock } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { formatCurrency } from '@/lib/utils'

export function MonthlyInvoices() {
  const { invoices } = useData()
  const [selectedMonth, setSelectedMonth] = useState(new Date())

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    return d
  })

  const currentMonthKey = selectedMonth.toISOString().slice(0, 7)
  const monthInvoices = invoices.filter(inv => inv.created_at?.startsWith(currentMonthKey))

  const totalAmount = monthInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0)
  const paidAmount = monthInvoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.total || 0), 0)
  const unpaidAmount = monthInvoices.filter(inv => inv.status !== 'paid').reduce((sum, inv) => sum + (inv.total || 0), 0)
  const paidCount = monthInvoices.filter(inv => inv.status === 'paid').length
  const unpaidCount = monthInvoices.filter(inv => inv.status !== 'paid').length

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
        title="Monthly Invoices"
        subtitle={`${monthInvoices.length} invoices · ${formatCurrency(totalAmount)} total`}
        statusChip={`${paidCount} Paid`}
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
            label: 'Total Revenue',
            value: formatCurrency(totalAmount),
            icon: DollarSign,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            label: 'Paid',
            value: formatCurrency(paidAmount),
            icon: CheckCircle,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: 'Unpaid',
            value: formatCurrency(unpaidAmount),
            icon: Clock,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: 'Invoice Count',
            value: monthInvoices.length,
            icon: TrendingUp,
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

      {/* Invoices Table */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-[#f8fafc]">
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">Invoice #</th>
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">Client</th>
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">Amount</th>
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">Status</th>
                <th className="px-6 py-4 text-left text-[12px] font-semibold text-slate-600">Date</th>
              </tr>
            </thead>
            <tbody>
              {monthInvoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No invoices this month
                  </td>
                </tr>
              ) : (
                monthInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-[#E4E8EC] hover:bg-[#f8fafc]">
                    <td className="px-6 py-4 text-[13px] font-medium text-[#111827]">{inv.invoice_number}</td>
                    <td className="px-6 py-4 text-[13px] text-slate-600">{inv.client_name}</td>
                    <td className="px-6 py-4 text-[13px] font-semibold text-[#111827]">{formatCurrency(inv.total || 0)}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[11px] px-3 py-1 rounded-full font-semibold inline-flex ${
                        inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {inv.status?.charAt(0).toUpperCase()}{inv.status?.slice(1) || 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[13px] text-slate-600">{inv.created_at?.slice(0, 10)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
