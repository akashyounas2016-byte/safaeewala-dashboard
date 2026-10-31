import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null | undefined, currency = 'AED') {
  const safe = typeof amount === 'number' && !isNaN(amount) ? amount : (Number(amount) || 0)
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(safe)
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function formatTime12h(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '—'
    let hh = val.getHours()
    const mm = String(val.getMinutes()).padStart(2, '0')
    const mer = hh >= 12 ? 'PM' : 'AM'
    hh = hh % 12 || 12
    return `${String(hh).padStart(2, '0')}:${mm} ${mer}`
  }
  const str = String(val).trim()
  if (!str || str === '—' || str === '-') return '—'

  // Already 12h format e.g. "09:00 AM" or "2:30 pm"
  const ampmMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)\b/i)
  if (ampmMatch) {
    let hh = parseInt(ampmMatch[1], 10)
    const mm = ampmMatch[2]
    const mer = ampmMatch[3].toUpperCase()
    hh = hh % 12 || 12
    return `${String(hh).padStart(2, '0')}:${mm} ${mer}`
  }

  // 24h format e.g. "09:00", "14:30", "20:00:00"
  const timeMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/)
  if (timeMatch) {
    let hh = parseInt(timeMatch[1], 10)
    const mm = timeMatch[2]
    const mer = hh >= 12 ? 'PM' : 'AM'
    hh = hh % 12 || 12
    return `${String(hh).padStart(2, '0')}:${mm} ${mer}`
  }

  const d = new Date(str.includes('T') ? str : '2000-01-01T' + str)
  if (!isNaN(d.getTime())) {
    let hh = d.getHours()
    const mm = String(d.getMinutes()).padStart(2, '0')
    const mer = hh >= 12 ? 'PM' : 'AM'
    hh = hh % 12 || 12
    return `${String(hh).padStart(2, '0')}:${mm} ${mer}`
  }

  return str
}

export function formatTime(date: string | Date | null | undefined): string {
  return formatTime12h(date)
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function daysUntil(date: string | Date | null | undefined) {
  if (!date) return 0
  const now = new Date()
  const target = new Date(date)
  if (isNaN(target.getTime())) return 0
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}

/**
 * Calculates End Time given Start Time (HH:MM) and duration in hours.
 */
export function addHoursToTime(timeStr: string, durationHours: number): string {
  if (!timeStr) return ''
  const str = String(timeStr).trim()
  let h = 9, m = 0
  const ampmMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)\b/i)
  if (ampmMatch) {
    h = parseInt(ampmMatch[1], 10)
    m = parseInt(ampmMatch[2], 10)
    const mer = ampmMatch[3].toUpperCase()
    if (mer === 'PM' && h < 12) h += 12
    if (mer === 'AM' && h === 12) h = 0
  } else {
    const parts = str.split(':')
    h = parseInt(parts[0] || '9', 10)
    m = parseInt(parts[1] || '0', 10)
  }
  const totalM = h * 60 + m + Math.round(durationHours * 60)
  const newH = Math.floor(totalM / 60) % 24
  const newM = totalM % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

/**
 * Calculates duration in hours between Start Time and End Time (supports 12h and 24h).
 */
export function calcDurationFromTimes(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0
  const parseMins = (s: string) => {
    const str = String(s).trim()
    const ampmMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)\b/i)
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10)
      const m = parseInt(ampmMatch[2], 10)
      if (ampmMatch[3].toUpperCase() === 'PM' && h < 12) h += 12
      if (ampmMatch[3].toUpperCase() === 'AM' && h === 12) h = 0
      return h * 60 + m
    }
    const [sh, sm] = str.split(':').map(Number)
    if (isNaN(sh) || isNaN(sm)) return null
    return sh * 60 + sm
  }
  const startM = parseMins(startStr)
  let endM = parseMins(endStr)
  if (startM === null || endM === null) return 0
  if (endM < startM) endM += 24 * 60 // cross midnight
  const diffMinutes = endM - startM
  return Math.round((diffMinutes / 60) * 10) / 10
}

/**
 * Calculates Start Time given End Time and duration in hours.
 */
export function subtractHoursFromTime(timeStr: string, durationHours: number): string {
  if (!timeStr) return ''
  const str = String(timeStr).trim()
  let h = 13, m = 0
  const ampmMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)\b/i)
  if (ampmMatch) {
    h = parseInt(ampmMatch[1], 10)
    m = parseInt(ampmMatch[2], 10)
    const mer = ampmMatch[3].toUpperCase()
    if (mer === 'PM' && h < 12) h += 12
    if (mer === 'AM' && h === 12) h = 0
  } else {
    const parts = str.split(':')
    h = parseInt(parts[0] || '13', 10)
    m = parseInt(parts[1] || '0', 10)
  }
  let totalM = h * 60 + m - Math.round(durationHours * 60)
  while (totalM < 0) totalM += 24 * 60
  const newH = Math.floor(totalM / 60) % 24
  const newM = totalM % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

/**
 * Determines if an employee belongs to the Parent Company (Safaeewala in-house fleet).
 */
export function isParentCompanyEmployee(e: { agency_id?: string; agency_name?: string; email?: string | null }): boolean {
  if (e.agency_id === 'agency-safaeewala') return true
  const name = (e.agency_name || '').toLowerCase()
  if (name.includes('safaeewala') || name.includes('parent company') || name.includes('in-house') || name.includes('direct hire')) return true
  if (e.email && e.email.toLowerCase().includes('safaeewala.com')) return true
  // If no agency is attached, they are in-house direct Safaeewala staff
  if (!e.agency_id && !e.agency_name) return true
  return false
}

/**
 * Determines if an employee is supplied by an external third-party manpower agency.
 */
export function isThirdPartyEmployee(e: { agency_id?: string; agency_name?: string; email?: string | null }): boolean {
  return !isParentCompanyEmployee(e)
}

type AgencyRef = { id: string; name: string; company_type?: string }
type StaffRef = { agency_id?: string; agency_name?: string; email?: string | null }

/** The one definition of "this employee belongs to this agency" (R-AGN-02, AUD-14) */
export function employeeBelongsToAgency(e: StaffRef, agency: AgencyRef): boolean {
  if (agency.id === 'agency-safaeewala' || agency.company_type === 'Parent Company') return isParentCompanyEmployee(e)
  return e.agency_id === agency.id ||
    Boolean(e.agency_name && e.agency_name.toLowerCase().trim() === agency.name.toLowerCase().trim())
}

export function staffOfAgency<E extends StaffRef>(agency: AgencyRef, employees: E[]): E[] {
  return employees.filter(e => employeeBelongsToAgency(e, agency))
}

/** Employees agency filter value (agency id, name or slug) → does the employee match? */
export function matchesAgencyFilter(e: StaffRef, filter: string, agencies: AgencyRef[]): boolean {
  const f = filter.toLowerCase().trim()
  const agency = agencies.find(a => a.id === filter || a.name.toLowerCase().trim() === f || slugifyAgencyName(a.name) === f)
  if (agency) return employeeBelongsToAgency(e, agency)
  return e.agency_id === filter || (e.agency_name || '').toLowerCase().trim() === f
}

/**
 * Normalizes agency company name into a URL-friendly slug.
 */
export function slugifyAgencyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Strips '(Monthly)' markers from address display and provides clean text */
export function cleanAddressDisplay(val: unknown): string {
  if (!val) return '—'
  const str = String(val).trim()
  if (!str) return '—'
  return str
    .replace(/\s*\(Monthly\)/gi, '')
    .replace(/\s*\[Monthly\]/gi, '')
    .replace(/\s+Monthly\s*$/i, '')
}

/** Normalizes an address string for comparison by removing punctuation, extra spaces, and monthly client markers */
export function normalizeJobAddress(addr: unknown): string {
  if (!addr) return ''
  return String(addr)
    .toLowerCase()
    .replace(/\s*\(monthly\)/gi, '')
    .replace(/\s*\[monthly\]/gi, '')
    .replace(/\s+monthly\s*$/i, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const GENERIC_ADDRESS_TOKENS = new Set([
  '', '—', '-', 'dubai', 'uae', 'villa', 'apartment', 'flat', 'office', 'custom', 'unknown',
  'n/a', 'na', 'pending', 'tbd', 'none', 'null', 'home', 'house', 'room', 'studio'
])

/** Returns true if an address is empty, too short, or only a generic placeholder (not a specific site) */
export function isGenericAddress(addr: unknown): boolean {
  const norm = normalizeJobAddress(addr)
  if (!norm || norm.length < 3) return true
  return GENERIC_ADDRESS_TOKENS.has(norm)
}

