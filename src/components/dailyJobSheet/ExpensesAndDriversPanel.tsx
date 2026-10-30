import React from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { DailyExpense } from '@/types'

export interface ExpensesAndDriversPanelProps {
  todayExpenses: DailyExpense[]
  displayedExpenses: DailyExpense[]
  viewAllExpenses: boolean
  onToggleViewAllExpenses: () => void
  onAddExpense: () => void
  onEditExpense: (exp: DailyExpense) => void
  onDeleteExpense: (id: string) => void
  totalExpenses: number
  driverSummary: Record<string, number>
  sortedDrivers: [string, number][]
  displayedDrivers: [string, number][]
  viewAllDrivers: boolean
  onToggleViewAllDrivers: () => void
  onEditDriverStaff: (staff: { name: string; currentAmount: number }) => void
  onOpenDriverModal?: () => void
  grossCollected: number
}

export const ExpensesAndDriversPanel: React.FC<ExpensesAndDriversPanelProps> = ({
  todayExpenses,
  displayedExpenses,
  viewAllExpenses,
  onToggleViewAllExpenses,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  totalExpenses,
  driverSummary,
  sortedDrivers,
  displayedDrivers,
  viewAllDrivers,
  onToggleViewAllDrivers,
  onEditDriverStaff,
  onOpenDriverModal,
  grossCollected,
}) => {
  return (
    <div id="bottom-panels-section" className="grid grid-cols-1 xl:grid-cols-2 gap-6 scroll-mt-6">
      {/* Expenses Log */}
      <div id="expenses-log-widget" className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col justify-between scroll-mt-6">
        <div>
          <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold text-[#111827]">Expenses Log</h3>
              {todayExpenses.length > 3 && (
                <span className="text-[10.5px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  {viewAllExpenses ? `Showing all ${todayExpenses.length}` : `Showing 3 of ${todayExpenses.length}`}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onAddExpense}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
            >
              <Plus size={13} /> Add Expense
            </button>
          </div>
          <div className="divide-y divide-[#E4E8EC]">
            {displayedExpenses.map(exp => (
              <div key={exp.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors group">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#111827]">{exp.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{exp.category}</p>
                </div>
                <span className="text-[13px] font-bold text-amber-700 shrink-0">AED {exp.amount.toLocaleString()}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEditExpense(exp)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-emerald-700 transition-colors cursor-pointer"
                    title="Edit Expense"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteExpense(exp.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                    title="Delete Expense"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {todayExpenses.length === 0 && (
              <p className="text-[12px] text-slate-400 text-center py-8">No expenses for this day</p>
            )}
          </div>

          {/* View All toggle */}
          {todayExpenses.length > 3 && (
            <div className="px-5 py-2.5 bg-slate-50/80 border-t border-[#E4E8EC] text-center">
              <button
                type="button"
                onClick={onToggleViewAllExpenses}
                className="text-[12px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center justify-center gap-1.5 py-1 px-3 rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors"
              >
                {viewAllExpenses ? (
                  <>Show Less (3 only) ↑</>
                ) : (
                  <>View All ({todayExpenses.length} Expenses) ↓</>
                )}
              </button>
            </div>
          )}
        </div>

        {todayExpenses.length > 0 && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-amber-800">Total Expenses</span>
            <span className="text-[14px] font-black text-amber-700">AED {totalExpenses.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Driver Summary */}
      <div id="driver-summary-widget" className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col justify-between scroll-mt-6">
        <div>
          <div className="px-5 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold text-[#111827]">Driver Payment Received</h3>
              {sortedDrivers.length > 3 && (
                <span className="text-[10.5px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  {viewAllDrivers ? `Showing all ${sortedDrivers.length}` : `Showing 3 of ${sortedDrivers.length}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 hidden sm:inline">Cash + Online</span>
              {onOpenDriverModal && (
                <button
                  type="button"
                  onClick={onOpenDriverModal}
                  className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-xs transition-colors cursor-pointer"
                  title="Select Driver to View Payments"
                  aria-label="Select Driver to View Payments"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-[#E4E8EC]">
            {sortedDrivers.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-8">No collections yet</p>
            ) : (
              displayedDrivers.map(([name, amount]) => {
                const max = Math.max(...Object.values(driverSummary))
                const pct = max > 0 ? Math.round((amount / max) * 100) : 0
                return (
                  <div key={name} className="px-5 py-3.5 hover:bg-slate-50/50 transition-colors group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-[13px] font-semibold text-[#111827] truncate">{name}</p>
                        <button
                          type="button"
                          onClick={() => onEditDriverStaff({ name, currentAmount: amount })}
                          className="p-1 rounded-md text-slate-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                          title={`Edit ${name}'s Jobs & Collections`}
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                      <span className="text-[13px] font-bold text-emerald-700">AED {amount.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* View All toggle */}
          {sortedDrivers.length > 3 && (
            <div className="px-5 py-2.5 bg-slate-50/80 border-t border-[#E4E8EC] text-center">
              <button
                type="button"
                onClick={onToggleViewAllDrivers}
                className="text-[12px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center justify-center gap-1.5 py-1 px-3 rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors"
              >
                {viewAllDrivers ? (
                  <>Show Less (3 only) ↑</>
                ) : (
                  <>View All ({sortedDrivers.length} Drivers) ↓</>
                )}
              </button>
            </div>
          )}
        </div>

        {Object.keys(driverSummary).length > 0 && (
          <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-emerald-800">Total Collected</span>
            <span className="text-[14px] font-black text-emerald-700">AED {grossCollected.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
