import { STAFF_COLOR_PALETTES, type StaffPalette } from '@/components/dailyJobSheet/jobSheetUtils'

/** UX-63: a cleaner keeps the same colour on every card (Bookings, Clients, Monthly Clients) — same palettes as the Daily Job Sheet */
export function cleanerPalette(name: string): StaffPalette {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return STAFF_COLOR_PALETTES[h % STAFF_COLOR_PALETTES.length]
}

export const cleanerInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'
