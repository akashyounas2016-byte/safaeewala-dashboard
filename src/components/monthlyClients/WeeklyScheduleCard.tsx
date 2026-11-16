import { useMemo, useState } from 'react'
import { Calendar, Clock, Users, Sparkles, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'
import type { Client, Employee } from '@/types'
import { realCleanerName } from '@/lib/clientDataSync'
import { addHoursToTime, subtractHoursFromTime, calcDurationFromTimes, formatTime12h } from '@/lib/utils'

/**
 * R-SCHED-20: the weekly schedule of a Monthly client (day, start, end, duration, cleaner) — one card used by
 * the one client popup for every Mode (was only inside the separate monthly form).
 */
export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
}

export interface DayRow { enabled: boolean; startTime: string; endTime: string; duration: number; cleaner: string }
export type WeekSchedule = Record<string, DayRow>

/** The week of a saved client (or the default Mon / Wed / Fri, 9–1) */
export function initialWeekSchedule(initialClient?: Partial<Client> | null): WeekSchedule {
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
          cleaner: realCleanerName(cln),
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
}

export const activeDaysOf = (w: WeekSchedule) => DAYS_OF_WEEK.filter(day => w[day]?.enabled)

/**
 * The client fields of a week. Days with a picked cleaner are listed in `day_cleaner_assignments` (R-SCHED-10);
 * with no day ticked the client's times and cleaner stay as they were (R-SCHED-16).
 */
export function monthlyFieldsOf(w: WeekSchedule, initialClient?: Partial<Client> | null) {
  const activeDays = activeDaysOf(w)
  const firstRow = w[activeDays[0]]
  const firstDuration = firstRow?.duration || (firstRow ? calcDurationFromTimes(firstRow.startTime, firstRow.endTime) : 4) || 4
  const day_cleaner_assignments: Record<string, string> = {}
  const day_schedules: Record<string, { startTime: string; endTime: string; cleaner: string; duration: number }> = {}
  activeDays.forEach(day => {
    const row = w[day]
    const cleaner = realCleanerName(row.cleaner)
    if (cleaner) day_cleaner_assignments[day] = cleaner
    day_schedules[day] = { startTime: row.startTime, endTime: row.endTime, cleaner, duration: row.duration || calcDurationFromTimes(row.startTime, row.endTime) || 4 }
  })
  return {
    service_days: activeDays,
    scheduled_time: firstRow?.startTime ?? initialClient?.scheduled_time ?? '09:00',
    end_time: firstRow?.endTime ?? initialClient?.end_time ?? '13:00',
    duration_hours: firstDuration,
    day_cleaner_assignments,
    day_schedules,
    preferred_cleaner: Object.values(day_cleaner_assignments)[0] || (activeDays.length === 0 ? (initialClient?.preferred_cleaner || '') : ''),
  }
}

export function WeeklyScheduleCard({ value: daySchedules, onChange, employees }: { value: WeekSchedule; onChange: (w: WeekSchedule) => void; employees: Employee[] }) {
  const setDaySchedules = (u: (p: WeekSchedule) => WeekSchedule) => onChange(u(daySchedules))
  // UX-161: the Weekly Schedule section can be hidden (choice kept per browser)
  const [scheduleOpen, setScheduleOpen] = useState<boolean>(() => { try { return localStorage.getItem('safaeewala_monthly_schedule_open') !== '0' } catch { return true } })
  const toggleSchedule = () => setScheduleOpen(o => { const n = !o; try { localStorage.setItem('safaeewala_monthly_schedule_open', n ? '1' : '0') } catch { /* ignore */ } return n })

  // Distinct sorted list of employees
  const cleanerList = useMemo(() => {
    const map = new Map<string, Employee>()
    employees.forEach(e => {
      const name = (e.full_name || '').trim()
      if (name && !map.has(name) && e.status !== 'inactive' && e.role !== 'csr') { // R-EMP-12
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

  const activeDays = useMemo(() => {
    return DAYS_OF_WEEK.filter(day => daySchedules[day]?.enabled)
  }, [daySchedules])

  const totalWeeklyHours = useMemo(() => {
    return activeDays.reduce((acc, day) => {
      const row = daySchedules[day]
      return acc + (row.duration || calcDurationFromTimes(row.startTime, row.endTime) || 0)
    }, 0)
  }, [activeDays, daySchedules])

  return (
    <>
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
                Set the time, duration and cleaner for each day (6 days Mon–Sat, Sunday off)
              </p>
            </div>
          </div>

          {/* Quick day presets (UX-161: the copy-Monday buttons are replaced by Hide / Show) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {scheduleOpen && <>
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
            </>}
            <button
              type="button"
              onClick={toggleSchedule}
              aria-expanded={scheduleOpen}
              className="ml-1 inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title={scheduleOpen ? 'Hide the weekly schedule' : 'Show the weekly schedule'}
            >
              {scheduleOpen ? <><ChevronUp size={12} /> Hide</> : <><ChevronDown size={12} /> Show</>}
            </button>
          </div>
        </div>

        {/* 5 Columns × 7 Rows Table */}
        <div className={scheduleOpen || activeDays.length === 0 ? 'overflow-x-auto' : 'hidden'} data-field="schedule_days" /* UX-161: shown while no day is ticked */>
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
    </>
  )
}
