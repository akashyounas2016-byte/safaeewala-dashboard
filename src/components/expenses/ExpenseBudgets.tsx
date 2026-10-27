import { useEffect, useMemo, useState } from 'react'
import { Target, Pencil, Check } from 'lucide-react'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import type { DailyExpense } from '@/types'

const BUDGET_KEY = 'safaeewala_expense_budgets' // cloud-synced: { [category]: monthly AED }

/**
 * Monthly budget per expense category with a progress bar for the current month (UX-13).
 */
export function ExpenseBudgets({ expenses, categories }: { expenses: DailyExpense[]; categories: string[] }) {
  const [budgets, setBudgets] = useState<Record<string, number>>(() => safeLocalStorageGet(BUDGET_KEY, {}))
  const [editing, setEditing] = useState(false)
  useEffect(() => { safeLocalStorageSet(BUDGET_KEY, budgets) }, [budgets])

  const month = new Date().toISOString().slice(0, 7)
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const spent = useMemo(() => {
    const m = new Map<string, number>()
    expenses.forEach(e => {
      if (!(e.date || '').startsWith(month)) return
      const c = e.category || 'Other Operational'
      m.set(c, (m.get(c) || 0) + (Number(e.amount) || 0))
    })
    return m
  }, [expenses, month])

  const rows = useMemo(() => {
    const cats = Array.from(new Set([...categories, ...spent.keys(), ...Object.keys(budgets)]))
    return cats
      .map(c => ({ category: c, spent: spent.get(c) || 0, budget: budgets[c] || 0 }))
      .filter(r => editing || r.budget > 0 || r.spent > 0)
      .sort((a, b) => (b.budget ? b.spent / b.budget : 0) - (a.budget ? a.spent / a.budget : 0) || b.spent - a.spent)
  }, [categories, spent, budgets, editing])

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2">
          <Target size={16} className="text-teal-600" /> Budgets · {monthLabel}
        </h3>
        <button
          type="button"
          onClick={() => setEditing(v => !v)}
          className="flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          {editing ? <><Check size={12} /> Done</> : <><Pencil size={12} /> Set budgets</>}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-slate-400 text-center py-6">No budgets yet — click "Set budgets".</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const pct = r.budget > 0 ? Math.round((r.spent / r.budget) * 100) : 0
            const bar = pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-500'
            return (
              <div key={r.category}>
                <div className="flex items-center justify-between text-[12px] gap-2">
                  <span className="font-semibold text-slate-700 truncate">{r.category}</span>
                  {editing ? (
                    <input
                      type="number" min="0" step="50"
                      value={r.budget || ''}
                      placeholder="Monthly AED"
                      onChange={e => setBudgets(b => ({ ...b, [r.category]: Number(e.target.value) || 0 }))}
                      className="w-[110px] px-2 py-1 text-[12px] border border-slate-200 rounded-lg text-right focus:outline-none focus:border-teal-500"
                    />
                  ) : (
                    <span className={`font-bold ${pct >= 100 ? 'text-rose-700' : 'text-slate-800'}`}>
                      AED {Math.round(r.spent).toLocaleString()}{r.budget > 0 ? ` / ${r.budget.toLocaleString()}` : ''}
                    </span>
                  )}
                </div>
                {r.budget > 0 && (
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1" title={`${pct}% of budget used`}>
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
