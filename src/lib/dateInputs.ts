/**
 * UX-143: a date box (dd/mm/yyyy) took a 6-digit year — "123123", "275760" — because the browser allows
 * years up to 275760 when the field has no `max`. Every date / date-time / month field without its own
 * `max` gets the year-9999 limit the moment it is focused (before anything is typed), so the year stops at
 * 4 digits. Installed once for the whole app (main.tsx), so new forms are covered too.
 */
const MAX_BY_TYPE: Record<string, string> = {
  date: '9999-12-31',
  'datetime-local': '9999-12-31T23:59',
  month: '9999-12',
  week: '9999-W52',
}

export function limitDateYear(el: EventTarget | null): void {
  if (!(el instanceof HTMLInputElement)) return
  const max = MAX_BY_TYPE[el.type]
  if (max && !el.max) el.max = max
}

/** True when the date has a 4-digit year from 1900 to 2100 (a typo year is stopped before saving) */
export function isSaneDate(value: string | undefined | null): boolean {
  if (!value) return true
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(value)
  if (!m) return false
  const y = Number(m[1])
  return y >= 1900 && y <= 2100
}

export function installDateYearLimit(): void {
  if (typeof document === 'undefined') return
  // focus (keyboard / click) and pointerdown (the calendar button) both come before any typing
  document.addEventListener('focusin', e => limitDateYear(e.target), true)
  document.addEventListener('pointerdown', e => limitDateYear(e.target), true)
}
