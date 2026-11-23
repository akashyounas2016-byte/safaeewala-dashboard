/**
 * R-MKT-08: where a website visitor was, from the IP address the plugin already sends with every WhatsApp click —
 * no location popup, and the IP never leaves the CRM (an offline UAE-only table, no outside service).
 * Data: IP Geolocation by DB-IP (https://db-ip.com), CC BY 4.0 — `uaeIpLocations.json`, built from the free
 * "IP to City Lite" file (2026-11). IP location is approximate: home / office internet often gives the community
 * (Palm Jumeirah, Motor City …); mobile data mostly gives only the emirate.
 */

export interface IpLocationData {
  source: string
  /** "Emirate|City" */
  locations: string[]
  /** flat [start, end, locationIndex, …] of IPv4 ranges as numbers, sorted */
  v4: number[]
  /** [startHex, endHex, locationIndex] of IPv6 ranges (hex without leading zeros), sorted */
  v6: [string, string, number][]
}

export interface IpLocation {
  /** Emirate, e.g. "Dubai" */
  emirate: string
  /** Community or city inside the emirate when known, e.g. "Palm Jumeirah" ('' = only the emirate) */
  place: string
  /** "Dubai · Palm Jumeirah", "Sharjah", "Outside UAE" */
  label: string
}

export const OUTSIDE_UAE: IpLocation = { emirate: '', place: '', label: 'Outside UAE' }

function v4Number(ip: string): number | null {
  const p = ip.split('.')
  if (p.length !== 4) return null
  let n = 0
  for (const s of p) {
    if (!/^\d{1,3}$/.test(s) || Number(s) > 255) return null
    n = n * 256 + Number(s)
  }
  return n
}

/** IPv6 as 32 hex digits ('' = not IPv6) */
function v6Hex(ip: string): string {
  let s = ip.toLowerCase().split('%')[0]
  if (!s.includes(':')) return ''
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (tail) {
    const n = v4Number(tail[1])
    if (n == null) return ''
    s = s.slice(0, -tail[1].length) + (n >>> 16).toString(16) + ':' + (n & 0xffff).toString(16)
  }
  const halves = s.split('::')
  if (halves.length > 2) return ''
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return ''
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest]
  if (groups.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return ''
  return groups.map(g => g.padStart(4, '0')).join('')
}

const cmpHex = (a: string, b: string) => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0)
const strip = (h: string) => h.replace(/^0+/, '') || '0'

function toLocation(key: string): IpLocation {
  const [emirate = '', city = ''] = key.split('|')
  // "Dubai (Hor Al Anz)" → "Hor Al Anz"; "Sharjah city" / "Ras al-Khaimah" → only the emirate
  let place = (/\(([^)]+)\)/.exec(city)?.[1] || city).trim()
  const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z]/g, '').replace(/city$/, '') === b.toLowerCase().replace(/[^a-z]/g, '')
  if (!place || same(place, emirate)) place = ''
  return { emirate, place, label: place ? `${emirate} · ${place}` : emirate }
}

/** The UAE location of an IP; OUTSIDE_UAE when the IP is not a UAE address; null when there is no valid IP */
export function locateIp(ip: string | null | undefined, data: IpLocationData): IpLocation | null {
  const s = String(ip || '').trim()
  if (!s) return null
  const n = v4Number(s)
  if (n != null) {
    let lo = 0, hi = data.v4.length / 3 - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const a = data.v4[mid * 3], b = data.v4[mid * 3 + 1]
      if (n < a) hi = mid - 1
      else if (n > b) lo = mid + 1
      else return toLocation(data.locations[data.v4[mid * 3 + 2]])
    }
    return OUTSIDE_UAE
  }
  const hex = v6Hex(s)
  if (!hex) return null
  const h = strip(hex)
  let lo = 0, hi = data.v6.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const [a, b, i] = data.v6[mid]
    if (cmpHex(h, a) < 0) hi = mid - 1
    else if (cmpHex(h, b) > 0) lo = mid + 1
    else return toLocation(data.locations[i])
  }
  return OUTSIDE_UAE
}

let loading: Promise<IpLocationData> | null = null
/** The table is ~340 KB, so it is loaded only by the screens that show locations */
export function loadIpLocations(): Promise<IpLocationData> {
  loading ??= import('./uaeIpLocations.json').then(m => (m.default ?? m) as unknown as IpLocationData)
  return loading
}
