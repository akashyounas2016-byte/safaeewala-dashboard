import { useState } from 'react'
import { Plus, Trash2, TrendingDown, DollarSign, PieChart, Filter, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import * as XLSX from 'xlsx'

const EXPENSE_CATEGORIES = [
  'Supplies & Materials',
  'Equipment & Tools',
  'Vehicle & Fuel',
  'Salaries & Wages',
  'Utilities',
  'Rent & Facilities',
  'Marketing & Advertising',
  'Insurance',
  'Professional Services',
  'Maintenance & Repairs',
  'Travel & Transport',
  'Other',
]

export function Expenses() {
  const { bookings, dailyExpenses, addDailyExpense, deleteDailyExpense } = useData()
  const [showModal, setShowModal] = useState(false)
  const [dateFilter, setDateFilter] = useState('month') // 'month', 'quarter', 'year'
  const [categoryFilter, setCategoryFilter] = useState('all')

  const now = new Date()
  const getDateRange = () => {
    if (dateFilter === 'month') {
      return {
        start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      }
    } else if (dateFilter === 'quarter') {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), q * 3, 1)
      return {
        start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`,
        label: `Q${q + 1} ${now.getFullYear()}`,
      }
    } else {
      return {
        start: `${now.getFullYear()}-01-01`,
        label: `${now.getFullYear()}`,
      }
    }
  }

  const { start, label } = getDateRange()
  const filtered = dailyExpenses.filter(e => {
    const matchDate = e.date >= start
    const matchCat = categoryFilter === 'all' || e.category === categoryFilter
    return matchDate && matchCat
  })

  const totalExpenses = filtered.reduce((s, e) => s + e.amount, 0)

  // Revenue for same period
  const periodRevenue = bookings
    .filter(b => (b.status === 'completed' || b.status === 'in_progress') && b.scheduled_date >= start)
    .reduce((s, b) => s + b.total_amount, 0)

  const profit = periodRevenue - totalExpenses
  const profitMargin = periodRevenue > 0 ? Math.round((profit / periodRevenue) * 100) : 0
  const expenseRatio = periodRevenue > 0 ? Math.round((totalExpenses / periodRevenue) * 100) : 0

  // By category
  const byCategory = EXPENSE_CATEGORIES.map(cat => {
    const amount = filtered.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)
    return { category: cat, amount }
  }).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount)

  const categoryColors: Record<string, string> = {
    'Supplies & Materials': 'bg-blue-100 text-blue-800',
    'Equipment & Tools': 'bg-purple-100 text-purple-800',
    'Vehicle & Fuel': 'bg-orange-100 text-orange-800',
    'Salaries & Wages': 'bg-red-100 text-red-800',
    'Utilities': 'bg-yellow-100 text-yellow-800',
    'Rent & Facilities': 'bg-indigo-100 text-indigo-800',
    'Marketing & Advertising': 'bg-pink-100 text-pink-800',
    'Insurance': 'bg-green-100 text-green-800',
    'Professional Services': 'bg-cyan-100 text-cyan-800',
    'Maintenance & Repairs': 'bg-slate-100 text-slate-800',
    'Travel & Transport': 'bg-lime-100 text-lime-800',
    'Other': 'bg-gray-100 text-gray-800',
  }

  return (
    <div className="space-y-6">

      <PageHero
        title="Expenses"
        subtitle={`${label} · AED ${totalExpenses.toLocaleString()} total`}
        statusChip={profit > 0 ? `+AED ${profit.toLocaleString()}` : `-AED ${Math.abs(profit).toLocaleString()}`}
        actionLabel="Add Expense"
        onAction={() => setShowModal(true)}
        searchPlaceholder="Search expenses…"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Expenses', value: `AED ${totalExpenses.toLocaleString()}`, sub: label, icon: TrendingDown, iconBg: 'bg-red-50', iconColor: 'text-red-600' },
          { label: 'Period Revenue', value: `AED ${periodRevenue.toLocaleString()}`, sub: 'Completed + Active', icon: DollarSign, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
          { label: 'Net Profit', value: `AED ${profit.toLocaleString()}`, sub: `${profitMargin}% margin`, icon: TrendingDown, iconBg: profit > 0 ? 'bg-emerald-50' : 'bg-red-50', iconColor: profit > 0 ? 'text-emerald-600' : 'text-red-600' },
          { label: 'Expense Ratio', value: `${expenseRatio}%`, sub: 'Of revenue', icon: PieChart, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center mb-3`}>
              <card.icon size={18} className={card.iconColor} />
            </div>
            <p className="text-2xl font-bold text-[#111827] tracking-tight">{card.value}</p>
            <p className="text-[12px] font-semibold text-[#111827] mt-1">{card.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Expenses Table */}
        <div className="lg:col-span-2 bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-[16px] font-bold text-[#111827]">Recent Expenses</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="text-[12px]">
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </Select>
              <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="text-[12px]">
                <option value="all">All Categories</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-[13px] text-slate-400 text-center py-8">No expenses recorded</p>
          ) : (
            <div className="divide-y divide-[#E4E8EC]">
              {filtered
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(exp => (
                  <div key={exp.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-[#111827]">{exp.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${categoryColors[exp.category] || categoryColors['Other']}`}>
                          {exp.category}
                        </span>
                        <span className="text-[11px] text-slate-500">{new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <p className="text-[13px] font-bold text-[#111827] tabular-nums">AED {exp.amount.toLocaleString()}</p>
                      <button
                        onClick={() => deleteDailyExpense(exp.id)}
                        className="w-8 h-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Category Breakdown */}
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
          <h3 className="text-[15px] font-bold text-[#111827] mb-4 flex items-center gap-2">
            <PieChart size={16} />
            By Category
          </h3>
          {byCategory.length === 0 ? (
            <p className="text-[12px] text-slate-400 text-center py-8">No expenses</p>
          ) : (
            <div className="space-y-3">
              {byCategory.map(({ category, amount }) => {
                const pct = totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[12px] font-semibold text-slate-600 truncate">{category}</p>
                      <p className="text-[12px] font-bold text-[#111827] ml-2 shrink-0">AED {amount.toLocaleString()}</p>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{pct}% of total</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* Add Expense Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Expense" size="md">
        <form
          onSubmit={e => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            addDailyExpense({
              date: (f.get('date') as string) || new Date().toISOString().split('T')[0],
              name: f.get('name') as string,
              category: f.get('category') as string,
              amount: Number(f.get('amount')) || 0,
            })
            setShowModal(false)
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Input name="date" label="Date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
            <Input name="amount" label="Amount (AED)" type="number" placeholder="0.00" required />
          </div>
          <Input name="name" label="Description" placeholder="Supplies, fuel, etc." required />
          <Select name="category" label="Category" required>
            <option value="">Select category…</option>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Add Expense</Button>
          </div>
        </form>
      </Modal>

    </div>
  )
}
