/**
 * Business dates follow Dubai time (Asia/Dubai, UTC+4) — the company works in Dubai, whatever the
 * timezone of the computer running the browser (AUD-46, AUD-47, owner decision 2026-10-29).
 *
 * Never use `new Date().toISOString().split('T')[0]` for "today": that is the UTC date, which is the
 * previous day between 00:00 and 04:00 in Dubai.
 */
export const BUSINESS_TZ = 'Asia/Dubai'

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** The Dubai calendar date (YYYY-MM-DD) of an instant */
export function toDubaiDate(instant: Date = new Date()): string {
  return ymd.format(instant)
}

/** Today in Dubai, YYYY-MM-DD */
export const todayDubai = () => toDubaiDate(new Date())

/** This month in Dubai, YYYY-MM */
export const monthDubai = () => todayDubai().slice(0, 7)

/**
 * A calendar date that was built in local time (e.g. an Excel cell read with `cellDates`, or
 * `new Date(y, m, d)`) → YYYY-MM-DD using the same local fields, so it never shifts a day.
 */
export function calendarDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Shift a YYYY-MM-DD date by whole days (pure calendar arithmetic, timezone-free) */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return calendarDate(new Date(y, m - 1, d + days))
}
