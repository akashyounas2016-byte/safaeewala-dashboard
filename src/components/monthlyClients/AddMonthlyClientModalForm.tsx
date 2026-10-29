import React, { useState, useMemo } from 'react'
import { Calendar, Clock, Users, Sparkles, Check } from 'lucide-react'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'
import type { Client, Employee } from '@/types'
import { addHoursToTime, subtractHoursFromTime, calcDurationFromTimes, formatTime12h } from '@/lib/utils'

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
}

export interface AddMonthlyClientModalFormProps {
  onClose: () => void
  onAdd: (client: Omit<Client, 'id' | 'created_at'>) => void
  employees: Employee[]
  initialClient?: Client | null
  isEdit?: boolean
}

export function AddMonthlyClientModalForm({
  onClose,
  onAdd,
  employees,
  initialClient,
  isEdit = false,
}: AddMonthlyClientModalFormProps) {
  // ── 7-Day Specific Schedule State ──
  const [daySchedules, setDaySchedules] = useState<Record<string, {
    enabled: boolean
    startTime: string
    endTime: string
    duration: number
    cleaner: string
  }>>(() => {
    if (initialClient) {
      const activeDaysList = initialClient.service_days || []
      const daySchedMap = initialClient.day_schedules || {}
      const cleanerMap = initialClient.day_cleaner_assignments || {}
      const baseStart = initialClient.scheduled_time || '09:00'
      const baseEnd = initialClient.end_time || '13:00'
      const baseDur = initialClient.duration_hours || calcDurationFromTimes(baseStart, baseEnd) || 4
      const baseCleaner = initialClient.preferred_cleaner || ''

      const res: Record<string, { enabled: boolean; startTime: string; endTime: string; duration: number; cleaner: string }> = {}
      DAYS_OF_WEEK.forEach(day => {
        const spec = daySchedMap[day]
        const isEnabled = activeDaysList.includes(day) || !!spec
        const sTime = spec?.startTime || baseStart
        const eTime = spec?.endTime || baseEnd
        const dur = spec?.duration || calcDurationFromTimes(sTime, eTime) || baseDur
        const cln = spec?.cleaner || cleanerMap[day] || baseCleaner

        res[day] = {
          enabled: isEnabled,
          startTime: sTime,
          endTime: eTime,
          duration: dur,
          cleaner: cln && cln !== 'Unassigned' ? cln : '',
        }
      })
      return res
    }
    return {
      Monday:    { enabled: true,  startTime: '09:00', endTime: '13:00', duration: 4, cleaner: '' },
      Tuesday:   { enabled: false, startTime: '09:00', endTime: '13:00', duration: 4, cleaner: '' },
      Wednesday: { enabled: true,  startTime: '09:00', endTime: '13:00', duration: 4, cleaner: '' },
      Thursday:  { enabled: false, startTime: '09:00', endTime: '13:00', duration: 4, cleaner: '' },
      Friday:    { enabled: true,  startTime: '09:00', endTime: '13:00', duration: 4, cleaner: '' },
      Saturday:  { enabled: false, startTime: '09:00', endTime: '13:00', duration: 4, cleaner: '' },
    }
  })

  // Distinct sorted list of employees
  const cleanerList = useMemo(() => {
    const map = new Map<string, Employee>()
    employees.forEach(e => {
      const name = (e.full_name || '').trim()
      if (name && !map.has(name)) {
        map.set(name, e)
      }
    })
    return Array.from(map.values()).sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [employees])

  // Toggle day active state
  const toggleDay = (day: string) => {
    setDaySchedules(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled: !prev[day].enabled,
      },
    }))
  }

  // Update a day's specific schedule field with reactive auto-calculations
  const updateDaySchedule = (
    day: string,
    field: 'startTime' | 'endTime' | 'duration' | 'cleaner' | 'calcStart' | 'calcEnd',
    value?: string | number
  ) => {
    setDaySchedules(prev => {
      const current = prev[day]
      if (field === 'duration') {
        const dur = Number(value) || 4
        let newEnd = current.endTime
        let newStart = current.startTime
        if (current.startTime) {
          newEnd = addHoursToTime(current.startTime, dur)
        } else if (current.endTime) {
          newStart = subtractHoursFromTime(current.endTime, dur)
        }
        return {
          ...prev,
          [day]: { ...current, duration: dur, startTime: newStart, endTime: newEnd },
        }
      }
      if (field === 'startTime') {
        const valStr = String(value || '')
        const curDur = current.duration || calcDurationFromTimes(current.startTime, current.endTime) || 4
        const newEnd = valStr ? addHoursToTime(valStr, curDur) : current.endTime
        return {
          ...prev,
          [day]: { ...current, startTime: valStr, endTime: newEnd, duration: curDur },
        }
      }
      if (field === 'endTime') {
        const valStr = String(value || '')
        const calcDur = current.startTime && valStr ? calcDurationFromTimes(current.startTime, valStr) : current.duration
        return {
          ...prev,
          [day]: { ...current, endTime: valStr, duration: calcDur > 0 ? calcDur : current.duration },
        }
      }
      if (field === 'calcStart') {
        const dur = current.duration || 4
        const newStart = current.endTime ? subtractHoursFromTime(current.endTime, dur) : current.startTime
        return {
          ...prev,
          [day]: { ...current, startTime: newStart },
        }
      }
      if (field === 'calcEnd') {
        const dur = current.duration || 4
        const newEnd = current.startTime ? addHoursToTime(current.startTime, dur) : current.endTime
        return {
          ...prev,
          [day]: { ...current, endTime: newEnd },
        }
      }
      if (field === 'cleaner') {
        return {
          ...prev,
          [day]: { ...current, cleaner: String(value || '') },
        }
      }
      return prev
    })
  }

  // Quick day presets
  const applyPreset = (preset: 'weekdays' | 'mwf' | 'tts' | 'all' | 'clear') => {
    const targetDays: string[] =
      preset === 'weekdays' ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] :
      preset === 'mwf' ? ['Monday', 'Wednesday', 'Friday'] :
      preset === 'tts' ? ['Tuesday', 'Thursday', 'Saturday'] :
      preset === 'all' ? [...DAYS_OF_WEEK] : []

    setDaySchedules(prev => {
      const next: Record<string, { enabled: boolean; startTime: string; endTime: string; duration: number; cleaner: string }> = {}
      DAYS_OF_WEEK.forEach(day => {
        next[day] = {
          ...prev[day],
          enabled: targetDays.includes(day),
        }
      })
      return next
    })
  }

  // Quick bulk copy helpers
  const copyTimesToAllActive = (sourceDay = 'Monday') => {
    const src = daySchedules[sourceDay]
    if (!src) return
    const srcDur = src.duration || calcDurationFromTimes(src.startTime, src.endTime) || 4
    setDaySchedules(prev => {
      const next = { ...prev }
      DAYS_OF_WEEK.forEach(day => {
        if (next[day].enabled) {
          next[day] = {
            ...next[day],
            startTime: src.startTime,
            endTime: src.endTime,
            duration: srcDur,
          }
        }
      })
      return next
    })
  }

  const copyCleanerToAllActive = (sourceDay = 'Monday') => {
    const src = daySchedules[sourceDay]
    if (!src || !src.cleaner) return
    setDaySchedules(prev => {
      const next = { ...prev }
      DAYS_OF_WEEK.forEach(day => {
        if (next[day].enabled) {
          next[day] = { ...next[day], cleaner: src.cleaner }
        }
      })
      return next
    })
  }

  const activeDays = useMemo(() => {
    return DAYS_OF_WEEK.filter(day => daySchedules[day]?.enabled)
  }, [daySchedules])

  const totalWeeklyHours = useMemo(() => {
    return activeDays.reduce((acc, day) => {
      const row = daySchedules[day]
      return acc + (row.duration || calcDurationFromTimes(row.startTime, row.endTime) || 0)
    }, 0)
  }, [activeDays, daySchedules])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const clientName = String(f.get('full_name') || '').trim()
    if (!clientName) {
      alert('Please enter a valid client name.')
      return
    }

    if (activeDays.length === 0) {
      alert('Please select at least one day in the schedule table.')
      return
    }

    const remarks = String(f.get('remarks') || '').trim()
    const advance = parseFloat(String(f.get('advance_amount') || '0')) || 0
    const adjustment = parseFloat(String(f.get('adjustment_amount') || '0')) || 0
    const pending = parseFloat(String(f.get('pending_amount') || '0')) || 0

    const firstDay = activeDays[0]
    const firstRow = daySchedules[firstDay]
    const firstDuration = firstRow?.duration || (firstRow ? calcDurationFromTimes(firstRow.startTime, firstRow.endTime) : 4) || 4

    // Construct final day cleaner assignments mapping
    const finalAssignments: Record<string, string> = {}
    activeDays.forEach(day => {
      finalAssignments[day] = daySchedules[day]?.cleaner || 'Unassigned'
    })

    // Construct day_schedules map
    const finalDaySchedules: Record<string, { startTime: string; endTime: string; cleaner: string; duration: number }> = {}
    activeDays.forEach(day => {
      const row = daySchedules[day]
      const dur = row.duration || calcDurationFromTimes(row.startTime, row.endTime) || 4
      finalDaySchedules[day] = {
        startTime: row.startTime,
        endTime: row.endTime,
        cleaner: row.cleaner || 'Unassigned',
        duration: dur,
      }
    })

    const primaryCleaner = Object.values(finalAssignments).find(c => c && c !== 'Unassigned') || ''

    onAdd({
      full_name: clientName,
      phone: String(f.get('phone') || '').trim(),
      whatsapp: String(f.get('whatsapp') || '').trim(),
      email: String(f.get('email') || '').trim(),
      nationality: initialClient?.nationality || '',
      city: String(f.get('city') || 'Dubai'),
      building_name: String(f.get('building') || '').trim(),
      apartment: String(f.get('apartment') || '').trim(),
      area: String(f.get('area') || 'Dubai').trim(),
      remarks: remarks,
      notes: remarks,
      access_notes: remarks,
      advance_amount: advance,
      adjustment_amount: adjustment,
      pending_amount: pending,
      total_bookings: initialClient?.total_bookings || 0,
      total_spent: initialClient?.total_spent || 0,
      preferred_cleaner: primaryCleaner,
      service_days: activeDays,
      scheduled_time: firstRow.startTime,
      end_time: firstRow.endTime,
      duration_hours: firstDuration,
      day_cleaner_assignments: finalAssignments,
      day_schedules: finalDaySchedules,
    })
  }

  return (
    <form id="add-monthly-client-form" className="space-y-4" onSubmit={handleSubmit}>

      {/* ── Client Basic Details (Compact 2 rows) ── */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Input name="full_name" label="Full Name *" placeholder="e.g. Sarah Al-Rashidi" defaultValue={initialClient?.full_name} required />
          <Input name="phone" label="Phone Number *" placeholder="+971 50 000 0000" defaultValue={initialClient?.phone} required />
          <Input name="whatsapp" label="WhatsApp (Optional)" placeholder="+971 50 000 0000" defaultValue={initialClient?.whatsapp ?? ''} />
          <Input name="email" label="Email (Optional)" type="email" placeholder="client@example.com" defaultValue={initialClient?.email ?? ''} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Input name="building" label="Building / Villa" placeholder="Marina Heights / Villa 42" defaultValue={initialClient?.building_name ?? ''} />
          <Input name="apartment" label="Apartment / Flat" placeholder="Apt 1204" defaultValue={initialClient?.apartment ?? ''} />
          <Input name="area" label="Area / Community" placeholder="Dubai Marina, JBR..." defaultValue={initialClient?.area ?? ''} />
          <Select name="city" label="Emirate" defaultValue={initialClient?.city || 'Dubai'}>
            <option>Dubai</option>
            <option>Abu Dhabi</option>
            <option>Sharjah</option>
            <option>Ajman</option>
          </Select>
        </div>
      </div>

      {/* ── Section: 5-Column × 7-Row Day-by-Day Schedule Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-slate-50 p-3 border-b border-slate-200/80 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Calendar size={14} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-extrabold text-slate-800">
                  Weekly Schedule & Staff Assignment
                </span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {activeDays.length} Active Days
                </span>
              </div>
              <p className="text-[10.5px] text-slate-500">
                Har din ke liye specific timing, duration aur cleaner assign karen (6 Days Mon–Sat, Sunday Off)
              </p>
            </div>
          </div>

          {/* Quick Presets & Bulk Actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold mr-0.5">Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset('weekdays')}
              className="text-[10px] font-bold px-2 py-1 rounded-md bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title="Monday to Friday"
            >
              M–F
            </button>
            <button
              type="button"
              onClick={() => applyPreset('mwf')}
              className="text-[10px] font-bold px-2 py-1 rounded-md bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title="Monday, Wednesday, Friday"
            >
              MWF
            </button>
            <button
              type="button"
              onClick={() => applyPreset('tts')}
              className="text-[10px] font-bold px-2 py-1 rounded-md bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title="Tuesday, Thursday, Saturday"
            >
              TTS
            </button>
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="text-[10px] font-bold px-2 py-1 rounded-md bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title="All 7 Days"
            >
              All 7
            </button>
            <button
              type="button"
              onClick={() => applyPreset('clear')}
              className="text-[10px] font-bold px-2 py-1 rounded-md bg-white hover:bg-rose-50 hover:text-rose-700 text-slate-500 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title="Clear all days"
            >
              Clear
            </button>
            <div className="h-4 w-px bg-slate-300 mx-1" />
            <button
              type="button"
              onClick={() => copyTimesToAllActive('Monday')}
              className="text-[10px] font-bold px-2 py-1 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors cursor-pointer shadow-2xs"
              title="Copy Monday's start & end times and duration to all active days"
            >
              Apply Mon Times
            </button>
            <button
              type="button"
              onClick={() => copyCleanerToAllActive('Monday')}
              className="text-[10px] font-bold px-2 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
              title="Copy Monday's assigned cleaner to all active days"
            >
              Apply Mon Staff
            </button>
          </div>
        </div>

        {/* 5 Columns × 7 Rows Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                <th className="py-2.5 px-3 w-[14%]">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-slate-400" />
                    <span>1. Day</span>
                  </div>
                </th>
                <th className="py-2.5 px-3 w-[20%]">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-slate-400" />
                    <span>2. Start Time</span>
                  </div>
                </th>
                <th className="py-2.5 px-3 w-[20%]">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-slate-400" />
                    <span>3. End Time</span>
                  </div>
                </th>
                <th className="py-2.5 px-3 w-[18%]">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-slate-400" />
                    <span>4. Duration</span>
                  </div>
                </th>
                <th className="py-2.5 px-3 w-[28%]">
                  <div className="flex items-center gap-1.5">
                    <Users size={12} className="text-slate-400" />
                    <span>5. Cleaner (Staff)</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[12px]">
              {DAYS_OF_WEEK.map(day => {
                const row = daySchedules[day]
                const isEnabled = row.enabled
                const currentDur = row.duration || calcDurationFromTimes(row.startTime, row.endTime) || 4

                return (
                  <tr
                    key={day}
                    className={`transition-colors ${
                      isEnabled ? 'bg-white hover:bg-emerald-50/20' : 'bg-slate-50/40 opacity-60'
                    }`}
                  >
                    {/* Col 1: Day with Toggle (Short-form only, complete names removed) */}
                    <td className="py-2 px-3 align-middle">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => toggleDay(day)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className={`text-[12.5px] font-extrabold ${isEnabled ? 'text-slate-900' : 'text-slate-400'}`}>
                          {DAY_SHORT[day]}
                        </span>
                      </label>
                    </td>

                    {/* Col 2: Start Time (HH:MM) */}
                    <td className="py-2 px-3 align-middle">
                      <div>
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={row.startTime}
                            disabled={!isEnabled}
                            onChange={e => updateDaySchedule(day, 'startTime', e.target.value)}
                            className={`w-full h-8 px-2 text-[12px] font-mono border rounded-lg focus:outline-none transition-all ${
                              isEnabled
                                ? 'bg-white border-slate-200 focus:border-emerald-500 text-slate-800 shadow-2xs'
                                : 'bg-slate-100/60 border-slate-200/60 text-slate-400 cursor-not-allowed'
                            }`}
                          />
                        {isEnabled && row.endTime && (
                          <button
                            type="button"
                            title="Auto-calculate Start Time from End Time - Duration"
                            onClick={() => updateDaySchedule(day, 'calcStart')}
                            className="shrink-0 p-1 rounded-md text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-colors cursor-pointer"
                          >
                            <Sparkles size={12} />
                          </button>
                        )}
                      </div>
                      {isEnabled && <span className="text-[9.5px] font-bold text-emerald-700 block mt-0.5">{formatTime12h(row.startTime)}</span>}
                    </div>
                    </td>

                    {/* Col 3: End Time (HH:MM) */}
                    <td className="py-2 px-3 align-middle">
                      <div>
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={row.endTime}
                            disabled={!isEnabled}
                            onChange={e => updateDaySchedule(day, 'endTime', e.target.value)}
                            className={`w-full h-8 px-2 text-[12px] font-mono border rounded-lg focus:outline-none transition-all ${
                              isEnabled
                                ? 'bg-white border-slate-200 focus:border-teal-500 text-slate-800 shadow-2xs'
                                : 'bg-slate-100/60 border-slate-200/60 text-slate-400 cursor-not-allowed'
                            }`}
                          />
                        {isEnabled && row.startTime && (
                          <button
                            type="button"
                            title="Auto-calculate End Time from Start Time + Duration"
                            onClick={() => updateDaySchedule(day, 'calcEnd')}
                            className="shrink-0 p-1 rounded-md text-slate-400 hover:text-teal-700 hover:bg-teal-50 border border-transparent hover:border-teal-200 transition-colors cursor-pointer"
                          >
                            <Sparkles size={12} />
                          </button>
                        )}
                      </div>
                      {isEnabled && <span className="text-[9.5px] font-bold text-teal-700 block mt-0.5">{formatTime12h(row.endTime)}</span>}
                    </div>
                    </td>

                    {/* Col 4: Duration (2, 3, 4, 5 Hours) */}
                    <td className="py-2 px-3 align-middle">
                      <select
                        value={currentDur}
                        disabled={!isEnabled}
                        onChange={e => updateDaySchedule(day, 'duration', Number(e.target.value))}
                        className={`w-full h-8 px-2 text-[12px] font-extrabold border rounded-lg focus:outline-none transition-all cursor-pointer ${
                          isEnabled
                            ? 'bg-white border-slate-200 focus:border-amber-500 text-amber-800 shadow-2xs'
                            : 'bg-slate-100/60 border-slate-200/60 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <option value={2}>2 Hours</option>
                        <option value={3}>3 Hours</option>
                        <option value={4}>4 Hours</option>
                        <option value={5}>5 Hours</option>
                        {![2, 3, 4, 5].includes(currentDur) && currentDur > 0 && (
                          <option value={currentDur}>{currentDur} Hours</option>
                        )}
                      </select>
                    </td>

                    {/* Col 5: Cleaner Selection (Multi-select with checkboxes) */}
                    <td className="py-2 px-3 align-middle">
                      <CleanerMultiSelect
                        compact
                        cleaners={cleanerList}
                        selected={row.cleaner ? row.cleaner.split(/[,+/&]/).map(s => s.trim()).filter(Boolean) : []}
                        onChange={sel => updateDaySchedule(day, 'cleaner', sel.join(', '))}
                        disabled={!isEnabled}
                        placeholder="Pick cleaner(s)..."
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer: Summary Strip */}
        <div className="bg-slate-50/90 px-3.5 py-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-700">Selected Days:</span>
            <span className="font-bold text-emerald-800">
              {activeDays.length > 0 ? activeDays.map(d => DAY_SHORT[d]).join(', ') : <span className="text-rose-600">No active days</span>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              Total Shifts: <strong className="text-slate-800 font-extrabold">{activeDays.length} / week</strong>
            </span>
            <span>
              Total Duty: <strong className="text-teal-700 font-extrabold">{totalWeeklyHours} hrs / week</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── Remarks / Notes (replaces Access Notes) ── */}
      <div>
        <label className="block text-[11.5px] font-bold text-slate-700 mb-1">
          Remarks / Notes (Gate codes, keys, or client instructions)
        </label>
        <Textarea
          name="remarks"
          defaultValue={initialClient?.remarks ?? initialClient?.notes ?? initialClient?.access_notes ?? ''}
          placeholder="Special instructions, gate codes, key locations, or client preferences..."
          rows={2}
        />
      </div>

      {/* ── Initial Financial Amounts (Advance, Adjustment ADJ, Pending) ── */}
      <div className="bg-slate-50/90 rounded-2xl p-4 border border-[#E4E8EC] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12.5px] font-bold text-[#111827]">Initial Financial Amounts</p>
            <p className="text-[11px] text-slate-500">Mention advance, adjustment (ADJ), and pending amounts on onboarding</p>
          </div>
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            Optional
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11.5px] font-bold text-emerald-800 mb-1">
              Advance Amount (AED)
            </label>
            <Input
              name="advance_amount"
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              defaultValue={initialClient?.advance_amount ? String(initialClient.advance_amount) : ''}
              className="font-bold text-emerald-700 bg-white"
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-bold text-indigo-800 mb-1 flex items-center gap-1.5">
              <span>Adjustment Amount</span>
              <span className="bg-indigo-700 text-white text-[8.5px] font-black px-1.5 py-0.2 rounded uppercase">
                ADJ
              </span>
            </label>
            <Input
              name="adjustment_amount"
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              defaultValue={initialClient?.adjustment_amount ? String(initialClient.adjustment_amount) : ''}
              className="font-bold text-indigo-700 bg-white"
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-bold text-rose-800 mb-1">
              Pending Amount (AED)
            </label>
            <Input
              name="pending_amount"
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              defaultValue={initialClient?.pending_amount ? String(initialClient.pending_amount) : ''}
              className="font-bold text-rose-700 bg-white"
            />
          </div>
        </div>
      </div>
    </form>
  )
}
