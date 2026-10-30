import { useCallback, useEffect, useState } from 'react'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

/**
 * Per-day driver planning (R-DRV-01): which driver serves which site, the driver's shift, and
 * when the duty sheet was sent. Cloud-synced key (src/lib/cloudState.ts), so every office
 * device and the driver's phone see the same plan.
 */
export const DRIVER_PLANS_KEY = 'safaeewala_driver_plans'
const CHANGED = 'safaeewala:driver-plans-changed'

export interface DriverShift { start?: string; end?: string; vehicle?: string; notes?: string }
export interface DayPlan {
  assignments: Record<string, string>              // siteKey → driver employee id
  shifts: Record<string, DriverShift>              // driver id → shift
  sent: Record<string, { at: string; signature: string }> // driver id → last sent sheet
}
type AllPlans = Record<string, DayPlan>             // date → plan

const empty = (): DayPlan => ({ assignments: {}, shifts: {}, sent: {} })
const readAll = () => safeLocalStorageGet<AllPlans>(DRIVER_PLANS_KEY, {})

export function readDayPlan(date: string): DayPlan {
  const p = readAll()[date]
  return { ...empty(), ...(p || {}) }
}

export function updateDayPlan(date: string, fn: (p: DayPlan) => DayPlan): void {
  const all = readAll()
  all[date] = fn(readDayPlan(date))
  // keep ~120 days so the key stays small
  const dates = Object.keys(all).sort()
  dates.slice(0, Math.max(0, dates.length - 120)).forEach(d => { delete all[d] })
  safeLocalStorageSet(DRIVER_PLANS_KEY, all)
  window.dispatchEvent(new Event(CHANGED))
}

/** The plan of one day, re-read when it changes on this or another tab */
export function useDayPlan(date: string): [DayPlan, (fn: (p: DayPlan) => DayPlan) => void] {
  const [plan, setPlan] = useState<DayPlan>(() => readDayPlan(date))
  const [shownDate, setShownDate] = useState(date)
  if (shownDate !== date) { setShownDate(date); setPlan(readDayPlan(date)) }
  useEffect(() => {
    const refresh = () => setPlan(readDayPlan(date))
    window.addEventListener(CHANGED, refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener(CHANGED, refresh); window.removeEventListener('storage', refresh) }
  }, [date])
  const update = useCallback((fn: (p: DayPlan) => DayPlan) => updateDayPlan(date, fn), [date])
  return [plan, update]
}
