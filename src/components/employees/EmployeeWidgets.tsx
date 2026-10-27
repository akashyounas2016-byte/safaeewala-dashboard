import React from 'react'
import {
  Flame, Clock, Zap, UserCheck, Shield, AlertTriangle, CheckCircle
} from 'lucide-react'
import type { Employee } from '@/types'
import { daysUntil } from '@/lib/utils'

/* ─── Avatar Palette & Component ─── */
const avatarColors = [
  { bg: '#dcefe7', text: '#0d8a72', border: '#b2ded0' },
  { bg: '#fce4d6', text: '#c66a3a', border: '#f7c5a8' },
  { bg: '#e4dff5', text: '#6b5bb5', border: '#c9beea' },
  { bg: '#d6e7f5', text: '#2d6ea8', border: '#abd0ee' },
  { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  { bg: '#fae8ff', text: '#a21caf', border: '#f0abfc' },
]

export function EmployeeAvatar({
  name,
  size = 'md',
  idx = 0
}: {
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  idx?: number
}) {
  const parts = name.trim().split(' ')
  const init = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'EM'
  const dims = size === 'xl' ? 'w-16 h-16 text-[18px]' : size === 'lg' ? 'w-14 h-14 text-[15px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-11 h-11 text-[13px]'
  const color = avatarColors[idx % avatarColors.length]
  return (
    <div
      className={`${dims} rounded-2xl flex items-center justify-center font-black shrink-0 shadow-xs border`}
      style={{ background: color.bg, color: color.text, borderColor: color.border }}
    >
      {init}
    </div>
  )
}

/* ─── 1. Overtime Leaders Widget ─── */
export interface OvertimeWidgetProps {
  topOTStaff: Array<{ emp: Employee; stats?: { otHours: number; dutyHours: number } }>
  activeDateRangeLabel: string
  onSelectEmployee: (emp: Employee) => void
}

export function OvertimeWidget({
  topOTStaff,
  activeDateRangeLabel,
  onSelectEmployee
}: OvertimeWidgetProps) {
  return (
    <div className="bg-white rounded-[24px] border border-amber-200/90 shadow-[0_4px_20px_rgba(217,119,6,0.06)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shadow-amber-500/30">
            <Flame size={15} />
          </div>
          <div>
            <h3 className="text-[14px] font-black text-slate-900">Overtime Leaders</h3>
            <p className="text-[11px] text-slate-500 font-medium">Top extra hours logged</p>
          </div>
        </div>
        <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
          {activeDateRangeLabel}
        </span>
      </div>

      {topOTStaff.length === 0 ? (
        <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100">
          <Clock size={20} className="mx-auto text-slate-300 mb-1.5" />
          <p className="text-[12px] font-bold text-slate-600">No Overtime in this period</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Change date filter or agency to view past OT hours</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {topOTStaff.slice(0, 6).map(({ emp, stats }, idx) => {
            const ot = stats?.otHours ?? 0
            const duty = stats?.dutyHours ?? 0
            return (
              <div
                key={emp.id}
                onClick={() => onSelectEmployee(emp)}
                className="flex items-center gap-3 p-2.5 rounded-2xl bg-gradient-to-r from-amber-50/50 to-orange-50/30 border border-amber-200/60 hover:border-amber-300 transition-all cursor-pointer group"
              >
                <span className="w-5 text-[12px] font-black text-amber-700 text-center">
                  #{idx + 1}
                </span>
                <EmployeeAvatar name={emp.full_name} size="sm" idx={idx} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-bold text-slate-900 group-hover:text-amber-800 transition-colors truncate">
                    {emp.full_name}
                  </p>
                  <p className="text-[11px] text-slate-500">{duty}h Regular Duty</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-0.5 text-[12px] font-black text-amber-950 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg shadow-2xs">
                    <Zap size={10} className="fill-amber-600 text-amber-600" />
                    +{ot}h OT
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── 2. Live Crew Status Widget ─── */
export interface LiveCrewWidgetProps {
  agencyScopedEmployees: Employee[]
  getTodayStatus: (emp: Employee) => { code: string; label: string; badgeBg?: string; bg?: string; detail?: string }
  activeWorkingTodayCount: number
  onSelectEmployee: (emp: Employee) => void
  onViewWorkingStaff: () => void
}

export function LiveCrewWidget({
  agencyScopedEmployees,
  getTodayStatus,
  activeWorkingTodayCount,
  onSelectEmployee,
  onViewWorkingStaff
}: LiveCrewWidgetProps) {
  return (
    <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <UserCheck size={16} />
          </div>
          <div>
            <h3 className="text-[14px] font-black text-slate-900">Live Crew Status</h3>
            <p className="text-[11px] text-slate-500 font-medium">Daily sheet & booking roster</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      <div className="space-y-2.5">
        {agencyScopedEmployees.slice(0, 6).map((emp, idx) => {
          const todaySt = getTodayStatus(emp)
          const isWorking = todaySt.code === 'working' || todaySt.code === 'scheduled'

          return (
            <div
              key={emp.id}
              onClick={() => onSelectEmployee(emp)}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <EmployeeAvatar name={emp.full_name} size="sm" idx={idx} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-slate-900 truncate">{emp.full_name}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {emp.role === 'crew_lead' ? 'Supervisor' : 'Cleaner'}
                  {isWorking && todaySt.detail ? ` · ${todaySt.detail}` : ''}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${todaySt.badgeBg || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {todaySt.label}
              </span>
            </div>
          )
        })}

        {agencyScopedEmployees.length === 0 && (
          <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100">
            <UserCheck size={20} className="mx-auto text-slate-300 mb-1" />
            <p className="text-[12px] font-bold text-slate-600">No staff found</p>
            <p className="text-[11px] text-slate-400">No employees found for this agency</p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
        <span>{activeWorkingTodayCount} active on duty</span>
        <button
          type="button"
          onClick={onViewWorkingStaff}
          className="text-teal-700 hover:text-teal-800 font-bold cursor-pointer"
        >
          View Working Staff →
        </button>
      </div>
    </div>
  )
}

/* ─── 3. Document Health & Compliance Widget ─── */
export interface ComplianceWidgetProps {
  agencyScopedEmployees: Employee[]
  expiringCount: number
  onSelectEmployee: (emp: Employee) => void
}

export function ComplianceWidget({
  agencyScopedEmployees,
  expiringCount,
  onSelectEmployee
}: ComplianceWidgetProps) {
  return (
    <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${expiringCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <Shield size={16} />
          </div>
          <div>
            <h3 className="text-[14px] font-black text-slate-900">Document Health</h3>
            <p className="text-[11px] text-slate-500 font-medium">Visa & permit validity</p>
          </div>
        </div>
        {expiringCount > 0 ? (
          <span className="bg-rose-100 text-rose-800 border border-rose-200 text-[10.5px] font-black px-2 py-0.5 rounded-full">
            {expiringCount} Alerts
          </span>
        ) : (
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10.5px] font-bold px-2 py-0.5 rounded-full">
            All Valid
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {agencyScopedEmployees
          .filter(e => {
            const days = Math.min(daysUntil(e.visa_expiry), daysUntil(e.work_permit_expiry))
            return days < 90
          })
          .slice(0, 4)
          .map((emp, idx) => {
            const visaDays = daysUntil(emp.visa_expiry)
            const permitDays = daysUntil(emp.work_permit_expiry)
            const minDays = Math.min(visaDays, permitDays)
            const doc = visaDays <= permitDays ? 'Visa' : 'Work Permit'
            const urgent = minDays < 30
            return (
              <div
                key={emp.id}
                onClick={() => onSelectEmployee(emp)}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                  urgent ? 'bg-rose-50/70 border-rose-200' : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <EmployeeAvatar name={emp.full_name} size="sm" idx={idx} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-slate-900 truncate">{emp.full_name}</p>
                  <p className={`text-[11px] font-medium mt-0.5 ${urgent ? 'text-rose-800' : 'text-amber-800'}`}>
                    {doc}: {minDays < 0 ? 'EXPIRED' : `${minDays}d left`}
                  </p>
                </div>
                <AlertTriangle size={14} className={urgent ? 'text-rose-600' : 'text-amber-600'} />
              </div>
            )
          })}

        {expiringCount === 0 && (
          <div className="text-center py-5 bg-emerald-50/60 rounded-2xl border border-emerald-100">
            <CheckCircle size={20} className="mx-auto text-emerald-600 mb-1" />
            <p className="text-[12px] font-bold text-emerald-900">All documents up to date</p>
            <p className="text-[11px] text-emerald-700">No renewals due within 90 days</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── 4. Skills Coverage Widget ─── */
export interface SkillsWidgetProps {
  skillCounts: Record<string, number>
  totalStaffCount: number
}

export function SkillsWidget({
  skillCounts,
  totalStaffCount
}: SkillsWidgetProps) {
  return (
    <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-black text-slate-900">Skills Coverage</h3>
        <span className="text-[11px] text-slate-400 font-semibold">{totalStaffCount} Staff</span>
      </div>
      <div className="space-y-2.5">
        {Object.entries(skillCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([skill, count]) => {
            const pct = Math.round((count / (totalStaffCount || 1)) * 100)
            return (
              <div key={skill}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-slate-700 truncate">{skill}</span>
                  <span className="text-[11px] font-bold text-slate-500 ml-2">{count} staff ({pct}%)</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        {Object.keys(skillCounts).length === 0 && (
          <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[12px] font-bold text-slate-600">No skills data available</p>
            <p className="text-[11px] text-slate-400">No skills recorded for this agency's staff</p>
          </div>
        )}
      </div>
    </div>
  )
}
