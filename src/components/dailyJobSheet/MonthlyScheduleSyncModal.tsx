import React, { useState, useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  CheckCircle2, Clock, ArrowDownToLine,
  Search, RefreshCw, Check, ShieldCheck,
  Calendar, Sparkles, CalendarDays
} from 'lucide-react'
import type { Client, DailyJob } from '@/types'
import {
  getScheduledMonthlyShiftsForDate,
  type ScheduledShiftPlan
} from '@/lib/clientDataSync'
import { fmtDate } from './jobSheetUtils'
import { todayDubai, addDays } from '@/lib/dubaiTime'

interface MonthlyScheduleSyncModalProps {
  open: boolean
  onClose: () => void
  dateStr: string
  clients: Client[]
  dailyJobs: DailyJob[]
  onSyncAll: () => void
  onSyncShift?: (shift: ScheduledShiftPlan) => void
  onSyncDateRange?: (dates: string[]) => void
  autoSyncEnabled: boolean
  onToggleAutoSync: (enabled: boolean) => void
}

export function MonthlyScheduleSyncModal({
  open,
  onClose,
  dateStr,
  clients,
  dailyJobs,
  onSyncAll,
  onSyncShift,
  onSyncDateRange,
  autoSyncEnabled,
  onToggleAutoSync,
}: MonthlyScheduleSyncModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [batchNotice, setBatchNotice] = useState<string | null>(null)

  const syncData = useMemo(() => {
    return getScheduledMonthlyShiftsForDate(dateStr, clients, dailyJobs)
  }, [dateStr, clients, dailyJobs])

  const filteredShifts = useMemo(() => {
    if (!searchQuery.trim()) return syncData.shifts
    const q = searchQuery.toLowerCase().trim()
    return syncData.shifts.filter(s =>
      s.cleanerName.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q) ||
      (s.client.full_name || '').toLowerCase().includes(q) ||
      (s.client.building_name || '').toLowerCase().includes(q) ||
      s.area.toLowerCase().includes(q)
    )
  }, [syncData.shifts, searchQuery])

  const handleQuickBatch = (daysAhead: number) => {
    if (!onSyncDateRange) return
    const today = todayDubai()
    if (daysAhead === 0) {
      onSyncDateRange([today])
    } else if (daysAhead === 1) {
      onSyncDateRange([addDays(today, 1)])
    } else {
      const dates = Array.from({ length: daysAhead }, (_, i) => addDays(today, i))
      onSyncDateRange(dates)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Weekly Schedule ↔ Daily Job Sheet Synchronization"
      size="xl"
      className="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Date & Day Banner */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-2xl p-4.5 shadow-md border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-400 text-emerald-950">
                {syncData.dayName} Schedule
              </span>
              <span className="text-[13px] font-semibold text-emerald-200">
                {fmtDate(dateStr)} ({dateStr})
              </span>
            </div>
            <p className="text-[12px] text-slate-300 mt-1 leading-relaxed">
              Monthly clients kay repeating contracts unkay assigned cleaners aur fixed timings kay sath Daily Job Sheet mein automatically generate aur sync kiye jatay hain.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {syncData.pendingSyncCount > 0 ? (
              <Button
                type="button"
                onClick={() => {
                  onSyncAll()
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black text-[12.5px] px-4 py-2 rounded-xl shadow-lg cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <ArrowDownToLine size={15} className="stroke-[2.5]" />
                <span>Fetch All ({syncData.pendingSyncCount})</span>
              </Button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[12px] font-bold flex items-center gap-1.5">
                <CheckCircle2 size={15} />
                <span>All Synced</span>
              </span>
            )}
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
            <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wide">Total Scheduled</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{syncData.totalScheduled}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{syncData.dayName} contracts</p>
          </div>

          <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/80">
            <p className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wide">Already on Sheet</p>
            <p className="text-xl font-black text-emerald-900 mt-0.5">{syncData.alreadySyncedCount}</p>
            <p className="text-[10px] text-emerald-700 mt-0.5">Active on this date</p>
          </div>

          <div className={`p-3 rounded-xl border ${
            syncData.pendingSyncCount > 0
              ? 'bg-amber-50/80 border-amber-200 text-amber-900'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <p className="text-[10.5px] font-bold uppercase tracking-wide opacity-80">Pending to Fetch</p>
            <p className="text-xl font-black mt-0.5">{syncData.pendingSyncCount}</p>
            <p className="text-[10px] opacity-80 mt-0.5">Ready to auto-populate</p>
          </div>
        </div>

        {/* Multi-Day Auto-Generation Toolbar */}
        {onSyncDateRange && (
          <div className="p-3.5 bg-gradient-to-r from-emerald-50/60 via-teal-50/40 to-slate-50 rounded-xl border border-emerald-200/70">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-[12.5px] font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-emerald-600" />
                  <span>Batch Generate Upcoming Schedules</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Aany walay dino kay monthly shifts aik click mein pehlay say generate kar lein:
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={() => handleQuickBatch(0)}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Calendar size={12} className="text-emerald-600" />
                  <span>Today</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickBatch(1)}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Calendar size={12} className="text-teal-600" />
                  <span>Tomorrow</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickBatch(7)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <CalendarDays size={13} />
                  <span>Next 7 Days (Week)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Sync Toggle Banner */}
        <div className="flex items-center justify-between p-3.5 bg-slate-50/90 rounded-xl border border-slate-200/90 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <RefreshCw size={15} className={autoSyncEnabled ? 'animate-spin-slow text-emerald-700' : ''} />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-[12.5px]">
                Auto-Generate Repeating Schedules on Date Load
              </p>
              <p className="text-[11px] text-slate-500">
                Jab bhi aap koi date open karenge ya dashboard start ho ga, us din scheduled monthly clients automatically unkay assigned cleaners kay sath generate ho jayein gay.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={e => onToggleAutoSync(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client, cleaner, building, or area..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-[12.5px] rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          />
        </div>

        {/* Scheduled Shifts List */}
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[38vh] overflow-y-auto bg-white">
          {filteredShifts.length > 0 ? (
            filteredShifts.map(shift => {
              const isSynced = shift.alreadySynced
              const cleanerName = shift.cleanerName || 'Unassigned'
              const isUnassigned = cleanerName === 'Unassigned'

              return (
                <div
                  key={shift.client.id}
                  className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                    isSynced ? 'bg-slate-50/60' : 'bg-white hover:bg-emerald-50/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Cleaner Avatar */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                      isUnassigned
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : isSynced
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-indigo-100 text-indigo-800 border-indigo-300'
                    }`}>
                      {cleanerName.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-bold text-slate-900 truncate">
                          {shift.client.full_name || shift.address}
                        </p>
                        <span className="text-[11px] font-semibold px-2 py-0.2 rounded-md bg-slate-100 text-slate-600 border border-slate-200/60">
                          {cleanerName}
                        </span>
                        <span className="text-[10.5px] text-slate-500 font-medium">
                          {shift.area}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1 font-mono text-slate-600 font-medium">
                          <Clock size={11} className="text-slate-400" />
                          <span>{shift.startTime || '09:00'} – {shift.endTime || '13:00'}</span>
                          <span className="text-slate-400">({shift.durationHours || 4}h)</span>
                        </span>
                        <span>·</span>
                        <span className="truncate max-w-[280px]" title={shift.address}>
                          {shift.address}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Status / Action */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isSynced ? (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-200">
                        <Check size={12} className="stroke-[3]" />
                        <span>Synced to Sheet</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (onSyncShift) {
                            onSyncShift(shift)
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                        title="Fetch this client's shift to sheet"
                      >
                        <ArrowDownToLine size={13} />
                        <span>Fetch Shift</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              {searchQuery
                ? `No monthly schedules match "${searchQuery}".`
                : `No repeating monthly client schedules found for ${syncData.dayName}.`}
            </div>
          )}
        </div>

        {/* Rule 1 Compliance Notice */}
        <div className="flex items-start gap-2 p-3 bg-slate-100/80 rounded-xl text-[11px] text-slate-600 border border-slate-200/60">
          <ShieldCheck size={15} className="text-emerald-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Schedule Isolation Rule:</strong> Daily Job Sheet par ki janay wali kisi bhi shift ki tabdeeli (cleaner ya time change) temporary samjhi jaye gi aur Monthly Client kay permanent master contract ko kabhi tabdeel nahi karay gi.
          </p>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <span className="text-xs text-slate-500 font-medium">
            {syncData.pendingSyncCount > 0 ? (
              <span className="text-amber-700 font-bold">
                {syncData.pendingSyncCount} shift{syncData.pendingSyncCount > 1 ? 's' : ''} pending to fetch for {syncData.dayName}
              </span>
            ) : (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <Check size={13} className="stroke-[3]" />
                All {syncData.totalScheduled} repeating shifts are synced to Daily Job Sheet
              </span>
            )}
          </span>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-slate-600 border-slate-300 cursor-pointer"
            >
              Close
            </Button>
            {syncData.pendingSyncCount > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onSyncAll()
                }}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <ArrowDownToLine size={13} />
                <span>Fetch All Missing ({syncData.pendingSyncCount})</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
