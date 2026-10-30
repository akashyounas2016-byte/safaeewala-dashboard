import type { DailyJob, Employee } from '@/types'
import { cleanClientNameFromAddress, isBogusJob, splitStaffNames } from '@/lib/clientDataSync'
import { cleanNum, formatTimeOnly } from '@/components/dailyJobSheet/jobSheetUtils'
import { normalizePhone } from '@/lib/validation'

/**
 * Driver route planning (R-DRV-01…03). Built live from the Daily Job Sheet, so any change there
 * shows here at once. Driver sheets never contain OT or Material (owner request).
 */

/** One stop: all cleaners working at the same site on the date */
export interface RouteSite {
  key: string
  name: string            // client / building, cleaned from the address
  address: string
  area: string
  cleaners: string[]
  dropTime: string        // earliest start at this site
  pickupTime: string      // latest end at this site
  service: string
  payment: string         // e.g. "Cash AED 200", "Online", "Monthly"
  remarks: string
  jobIds: string[]
  color: SiteColor
}

export interface SiteColor { bg: string; border: string; text: string; dot: string; hex: string }

/** Distinct colours for sites (cycled) — tailwind classes + a hex for print / maps */
export const SITE_COLORS: SiteColor[] = [
  { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-900', dot: 'bg-emerald-500', hex: '#10b981' },
  { bg: 'bg-sky-50',     border: 'border-sky-300',     text: 'text-sky-900',     dot: 'bg-sky-500',     hex: '#0ea5e9' },
  { bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-900',   dot: 'bg-amber-500',   hex: '#f59e0b' },
  { bg: 'bg-violet-50',  border: 'border-violet-300',  text: 'text-violet-900',  dot: 'bg-violet-500',  hex: '#8b5cf6' },
  { bg: 'bg-rose-50',    border: 'border-rose-300',    text: 'text-rose-900',    dot: 'bg-rose-500',    hex: '#f43f5e' },
  { bg: 'bg-teal-50',    border: 'border-teal-300',    text: 'text-teal-900',    dot: 'bg-teal-500',    hex: '#14b8a6' },
  { bg: 'bg-orange-50',  border: 'border-orange-300',  text: 'text-orange-900',  dot: 'bg-orange-500',  hex: '#f97316' },
  { bg: 'bg-indigo-50',  border: 'border-indigo-300',  text: 'text-indigo-900',  dot: 'bg-indigo-500',  hex: '#6366f1' },
  { bg: 'bg-lime-50',    border: 'border-lime-300',    text: 'text-lime-900',    dot: 'bg-lime-500',    hex: '#84cc16' },
  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-300', text: 'text-fuchsia-900', dot: 'bg-fuchsia-500', hex: '#d946ef' },
]

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const time = (t?: string) => { const f = formatTimeOnly(t || ''); return f === '—' ? '' : f }
/** '08:00 AM' / '14:00' → minutes after midnight (null when unreadable), for ordering */
export function minutesOf(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i)
  if (!m) return null
  let h = Number(m[1]) % 24
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return h * 60 + Number(m[2])
}
const earlier = (a: string, b: string) => (minutesOf(a) ?? 1e9) < (minutesOf(b) ?? 1e9)

/** Group the day's jobs into sites (same cleaned address + area), ordered by drop time */
export function buildRouteSites(jobs: DailyJob[], date: string): RouteSite[] {
  const map = new Map<string, RouteSite & { payments: string[] }>()
  jobs.forEach(j => {
    if ((j.date || '').split('T')[0] !== date || isBogusJob(j)) return
    const address = (j.address || '').trim()
    const name = cleanClientNameFromAddress(address) || address || 'No address'
    const area = (j.area || '').trim()
    const key = `${norm(name)}|${norm(area)}`
    if (!map.has(key)) {
      map.set(key, { key, name, address, area, cleaners: [], dropTime: '', pickupTime: '', service: '', payment: '', remarks: '', jobIds: [], color: SITE_COLORS[0], payments: [] })
    }
    const s = map.get(key)!
    s.jobIds.push(j.id)
    splitStaffNames(j.staff_name || '').forEach(n => { if (!s.cleaners.includes(n)) s.cleaners.push(n) })
    const start = time(j.start_time), end = time(j.end_time)
    if (start && (!s.dropTime || earlier(start, s.dropTime))) s.dropTime = start
    if (end && (!s.pickupTime || earlier(s.pickupTime, end))) s.pickupTime = end
    if (j.service && !s.service.includes(j.service)) s.service = [s.service, j.service].filter(Boolean).join(', ')
    if (j.remarks && j.remarks !== '—' && !s.remarks.includes(j.remarks)) s.remarks = [s.remarks, j.remarks].filter(Boolean).join('; ')
    const mode = String(j.payment_mode || '')
    const due = cleanNum(j.charges) - cleanNum(j.received)
    s.payments.push(/^cash$/i.test(mode) && due > 0 ? `Cash AED ${due}` : /^pending$/i.test(mode) ? 'Pending' : mode)
  })
  return Array.from(map.values())
    .sort((a, b) => ((minutesOf(a.dropTime) ?? 1e9) - (minutesOf(b.dropTime) ?? 1e9)) || a.name.localeCompare(b.name))
    .map(({ payments, ...s }, i) => ({ ...s, payment: Array.from(new Set(payments.filter(Boolean))).join(', '), color: SITE_COLORS[i % SITE_COLORS.length] }))
}

/** Active drivers (employee role "driver") */
export function activeDrivers(employees: Employee[]): Employee[] {
  return employees.filter(e => e.role === 'driver' && e.status !== 'inactive').sort((a, b) => a.full_name.localeCompare(b.full_name))
}

/** Rows of a driver duty sheet — deliberately no OT and no Material columns (R-DRV-02) */
export const SHEET_COLUMNS = ['#', 'Drop', 'Pick-up', 'Site', 'Area', 'Cleaners', 'Service', 'Payment', 'Remarks'] as const
export function driverSheetRows(sites: RouteSite[]): string[][] {
  return sites.map((s, i) => [String(i + 1), s.dropTime || '—', s.pickupTime || '—', s.address || s.name, s.area || '—', s.cleaners.join(', '), s.service || '—', s.payment || '—', s.remarks || ''])
}

/** Plain-text sheet for WhatsApp */
export function driverSheetText(driverName: string, dateLabel: string, sites: RouteSite[], shift?: { start?: string; end?: string; vehicle?: string }): string {
  const head = [`*Safaeewala — Driver duties*`, `${driverName} · ${dateLabel}`]
  if (shift?.start || shift?.end) head.push(`Shift: ${shift.start || '—'} – ${shift.end || '—'}${shift.vehicle ? ` · ${shift.vehicle}` : ''}`)
  const body = sites.map((s, i) => [
    `*${i + 1}. ${s.name}*${s.area ? ` (${s.area})` : ''}`,
    `Drop ${s.dropTime || '—'} · Pick-up ${s.pickupTime || '—'}`,
    `Cleaners: ${s.cleaners.join(', ') || '—'}`,
    s.payment ? `Payment: ${s.payment}` : '',
    s.remarks ? `Note: ${s.remarks}` : '',
  ].filter(Boolean).join('\n'))
  const route = googleMapsRouteUrl(sites)
  return [...head, '', ...body.flatMap(b => [b, '']), route ? `Route: ${route}` : ''].join('\n').trim()
}

/** Google Maps directions through the sites in order (no API key needed) */
export function googleMapsRouteUrl(sites: RouteSite[]): string {
  const stops = sites.map(s => [s.address || s.name, s.area, 'Dubai'].filter(Boolean).join(', ')).filter(Boolean)
  if (stops.length === 0) return ''
  const enc = encodeURIComponent
  const destination = stops[stops.length - 1]
  const waypoints = stops.slice(0, -1).slice(0, 9) // Google allows up to 9 waypoints in a URL
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${enc(destination)}${waypoints.length ? `&waypoints=${waypoints.map(enc).join('%7C')}` : ''}`
}

export function whatsappUrl(phone: string | undefined, text: string): string {
  const p = normalizePhone(phone)
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`
}

/** Short fingerprint of a sheet, to show "changed since sent" */
export function sheetSignature(sites: RouteSite[]): string {
  const s = JSON.stringify(driverSheetRows(sites))
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return String(h)
}
