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

export function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatTime(date: string | Date | null | undefined) {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-AE', {
    hour: '2-digit',
    minute: '2-digit',
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
  const parts = timeStr.split(':')
  const h = parseInt(parts[0] || '9', 10)
  const m = parseInt(parts[1] || '0', 10)
  const totalM = h * 60 + m + Math.round(durationHours * 60)
  const newH = Math.floor(totalM / 60) % 24
  const newM = totalM % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

/**
 * Calculates duration in hours between Start Time and End Time (HH:MM).
 */
export function calcDurationFromTimes(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0
  const [sh, sm] = startStr.split(':').map(Number)
  const [eh, em] = endStr.split(':').map(Number)
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0

  let startM = sh * 60 + sm
  let endM = eh * 60 + em
  if (endM < startM) {
    endM += 24 * 60 // cross midnight
  }
  const diffMinutes = endM - startM
  return Math.round((diffMinutes / 60) * 10) / 10
}

/**
 * Calculates Start Time given End Time (HH:MM) and duration in hours.
 */
export function subtractHoursFromTime(timeStr: string, durationHours: number): string {
  if (!timeStr) return ''
  const parts = timeStr.split(':')
  const h = parseInt(parts[0] || '13', 10)
  const m = parseInt(parts[1] || '0', 10)
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
