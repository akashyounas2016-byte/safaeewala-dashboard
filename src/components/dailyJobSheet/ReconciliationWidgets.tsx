import React from 'react'
import { Clock, Plus, CheckCircle, Pencil, Trash2, Wallet } from 'lucide-react'
import { cleanNum, fmtDate } from './jobSheetUtils'
import type {
  DailyJob,
  DailyPendingReceivedItem,
  DailyAdvanceItem,
} from '@/types'

export interface TodayPendingEntry {
  id: string
  date: string
  client: string
  amount: number
  staff: string
  address: string
  area: string
  remarks: string
  job?: DailyJob
  isJob: boolean
}

export interface ReconciliationWidgetsProps {
  selectedDate: string
  // Today Pending
  todayPendingEntries: TodayPendingEntry[]
  todayPendingTotalAmt: number
  onAddPending: () => void
  onSelectPendingDetails: (item: TodayPendingEntry) => void

  // Pending Received
  todayPendingRcvdItems: DailyPendingReceivedItem[]
  pendingRcvdGrandTotal: number
  pendingRcvdTotalCash: number
  pendingRcvdTotalOnline: number
  onAddPendingRcvd: () => void
  onEditPendingRcvd: (item: DailyPendingReceivedItem) => void
  onDeletePendingRcvd: (id: string) => void

  // Advance
  todayAdvanceItems: DailyAdvanceItem[]
  advanceTotalAmt: number
  advanceTotalRcvd: number
  onAddAdvance: () => void
  onEditAdvance: (item: DailyAdvanceItem) => void
  onDeleteAdvance: (id: string) => void
}

export const ReconciliationWidgets: React.FC<ReconciliationWidgetsProps> = ({
  selectedDate,
  todayPendingEntries,
  todayPendingTotalAmt,
  onAddPending,
  onSelectPendingDetails,
  todayPendingRcvdItems,
  pendingRcvdGrandTotal,
  pendingRcvdTotalCash,
  pendingRcvdTotalOnline,
  onAddPendingRcvd,
  onEditPendingRcvd,
  onDeletePendingRcvd,
  todayAdvanceItems,
  advanceTotalAmt,
  advanceTotalRcvd,
  onAddAdvance,
  onEditAdvance,
  onDeleteAdvance,
}) => {
  return (
    <div id="reconciliation-widgets-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6 scroll-mt-6">
      {/* 1. Today Pending (Light Red) */}
      <div id="today-pending-widget" className="bg-red-50/80 border border-red-200 rounded-[22px] shadow-[0_4px_20px_rgba(239,68,68,0.06)] overflow-hidden flex flex-col justify-between scroll-mt-6">
        <div>
          <div className="px-5 py-4 bg-red-100/70 border-b border-red-200/90 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-red-200/90 text-red-700 flex items-center justify-center">
                <Clock size={15} />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-red-950">Today Pending</h3>
                <p className="text-[10.5px] text-red-700/80">{todayPendingEntries.length} records</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-black text-red-800 bg-red-200/80 border border-red-300 px-2.5 py-0.5 rounded-full">
                AED {todayPendingTotalAmt.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={onAddPending}
                className="w-6 h-6 rounded-lg bg-white/90 hover:bg-white text-red-700 flex items-center justify-center shadow-xs transition-colors cursor-pointer border border-red-200"
                title="Add Pending item"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-red-100/50 border-b border-red-200/80 text-red-900 font-bold text-[10.5px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5">Client Name</th>
                  <th className="text-right px-3 py-2.5">Amount Pending</th>
                  <th className="text-right px-4 py-2.5">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-200/60">
                {todayPendingEntries.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-red-600/70 text-[12px]">
                      No pending items for {fmtDate(selectedDate)}
                    </td>
                  </tr>
                ) : (
                  todayPendingEntries.map(item => (
                    <tr
                      key={item.id}
                      onClick={() => onSelectPendingDetails(item)}
                      className="hover:bg-red-100/60 transition-colors group cursor-pointer"
                      title="Click to view details & mark as collected"
                    >
                      <td className="px-4 py-2.5 font-semibold text-slate-800 break-words group-hover:text-red-950">
                        {item.client}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-red-700 whitespace-nowrap">
                        AED {cleanNum(item.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap group-hover:text-slate-900">
                        {item.staff}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-5 py-3 bg-red-100/70 border-t border-red-200/90 flex items-center justify-between text-red-950 font-bold">
          <span className="text-[12px]">Total</span>
          <span className="text-[14px] font-black text-red-800">AED {todayPendingTotalAmt.toLocaleString()}</span>
        </div>
      </div>

      {/* 2. Pending Received (Light Green) */}
      <div id="pending-received-widget" className="bg-emerald-50/80 border border-emerald-200 rounded-[22px] shadow-[0_4px_20px_rgba(16,185,129,0.06)] overflow-hidden flex flex-col justify-between scroll-mt-6">
        <div>
          <div className="px-5 py-4 bg-emerald-100/70 border-b border-emerald-200/90 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-200/90 text-emerald-700 flex items-center justify-center">
                <CheckCircle size={15} />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-emerald-950">Pending Received</h3>
                <p className="text-[10.5px] text-emerald-700/80">{todayPendingRcvdItems.length} records</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-black text-emerald-800 bg-emerald-200/80 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                AED {pendingRcvdGrandTotal.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={onAddPendingRcvd}
                className="w-6 h-6 rounded-lg bg-white/90 hover:bg-white text-emerald-700 flex items-center justify-center shadow-xs transition-colors cursor-pointer border border-emerald-200"
                title="Add Pending Received item"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-emerald-100/50 border-b border-emerald-200/80 text-emerald-900 font-bold text-[10.5px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-right px-3 py-2.5">Cash</th>
                  <th className="text-right px-3 py-2.5">Online</th>
                  <th className="w-14"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-200/60">
                {todayPendingRcvdItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-emerald-600/70 text-[12px]">
                      No pending received items for {fmtDate(selectedDate)}
                    </td>
                  </tr>
                ) : (
                  todayPendingRcvdItems.map(item => (
                    <tr key={item.id} className="hover:bg-emerald-100/40 transition-colors group">
                      <td className="px-4 py-2.5 font-semibold text-slate-800 break-words">
                        <p className="text-[12.5px] font-bold text-slate-800 leading-snug">{item.client}</p>
                        {(item.remarks || item.notes) && (
                          <p className="text-[11px] text-slate-500 font-normal italic mt-0.5 line-clamp-1" title={item.remarks || item.notes}>
                            {item.remarks || item.notes}
                          </p>
                        )}
                        {item.previous_pending !== undefined && (
                          <span className="inline-block mt-0.5 text-[9.5px] font-bold text-emerald-800 bg-emerald-200/70 border border-emerald-300 px-1.5 py-0.2 rounded">
                            Pending: AED {cleanNum(item.previous_pending).toLocaleString()} → AED {cleanNum(item.remaining_pending).toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-800 whitespace-nowrap">
                        {cleanNum(item.cash) > 0 ? `AED ${cleanNum(item.cash).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-blue-700 whitespace-nowrap">
                        {cleanNum(item.online) > 0 ? `AED ${cleanNum(item.online).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => onEditPendingRcvd(item)}
                            className="text-slate-400 hover:text-emerald-700 transition-colors p-1 rounded hover:bg-emerald-50 cursor-pointer"
                            title="Edit Pending Received"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeletePendingRcvd(item.id)}
                            className="text-emerald-500 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-5 py-3 bg-emerald-100/70 border-t border-emerald-200/90 flex items-center justify-between text-[11.5px] text-emerald-950 font-bold">
          <div className="flex items-center gap-3">
            <span>Cash: <strong className="text-emerald-800">AED {pendingRcvdTotalCash.toLocaleString()}</strong></span>
            <span>Online: <strong className="text-blue-800">AED {pendingRcvdTotalOnline.toLocaleString()}</strong></span>
          </div>
          <span className="text-[13.5px] font-black text-emerald-900">AED {pendingRcvdGrandTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* 3. Advance (Yellow / Amber) */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-[22px] shadow-[0_4px_20px_rgba(245,158,11,0.06)] overflow-hidden flex flex-col justify-between">
        <div>
          <div className="px-5 py-4 bg-amber-100/70 border-b border-amber-200/90 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-200/90 text-amber-700 flex items-center justify-center">
                <Wallet size={15} />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-amber-950">Advance</h3>
                <p className="text-[10.5px] text-amber-700/80">{todayAdvanceItems.length} records</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-black text-amber-800 bg-amber-200/80 border border-amber-300 px-2.5 py-0.5 rounded-full">
                AED {advanceTotalAmt.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={onAddAdvance}
                className="w-6 h-6 rounded-lg bg-white/90 hover:bg-white text-amber-700 flex items-center justify-center shadow-xs transition-colors cursor-pointer border border-amber-200"
                title="Add Advance item"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-amber-100/50 border-b border-amber-200/80 text-amber-900 font-bold text-[10.5px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-right px-3 py-2.5">Rcvd</th>
                  <th className="text-right px-3 py-2.5">Advance</th>
                  <th className="w-14"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/60">
                {todayAdvanceItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-amber-600/70 text-[12px]">
                      No advance items for {fmtDate(selectedDate)}
                    </td>
                  </tr>
                ) : (
                  todayAdvanceItems.map(item => (
                    <tr key={item.id} className="hover:bg-amber-100/40 transition-colors group">
                      <td className="px-4 py-2.5 font-semibold text-slate-800 break-words">
                        {item.client}
                        {item.notes && <span className="block text-[10.5px] font-normal text-slate-500 mt-0.5">{item.notes}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-amber-800 whitespace-nowrap">
                        {cleanNum(item.received) > 0 ? `AED ${cleanNum(item.received).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-black text-amber-900 whitespace-nowrap">
                        {cleanNum(item.advance) > 0 ? `AED ${cleanNum(item.advance).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => onEditAdvance(item)}
                            className="text-slate-400 hover:text-amber-700 transition-colors p-1 rounded hover:bg-amber-50 cursor-pointer"
                            title="Edit Advance"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAdvance(item.id)}
                            className="text-amber-500 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-5 py-3 bg-amber-100/70 border-t border-amber-200/90 flex items-center justify-between text-[11.5px] text-amber-950 font-bold">
          <span>Rcvd: <strong className="text-amber-800">AED {advanceTotalRcvd.toLocaleString()}</strong></span>
          <span>Advance: <strong className="text-[13.5px] font-black text-amber-900">AED {advanceTotalAmt.toLocaleString()}</strong></span>
        </div>
      </div>
    </div>
  )
}
