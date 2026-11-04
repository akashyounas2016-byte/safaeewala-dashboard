import type { Client } from '@/types'

/**
 * R-CLI-01: a client's address is written number first, then the building / villa name, then the area —
 * "302, Al Khair Building, Mirdif" or "Villa 25, Mirdif". Empty parts are left out.
 */
export function formatClientAddress(c: Partial<Pick<Client, 'apartment' | 'building_name' | 'area' | 'city'>>, withCity = false): string {
  return [c.apartment, c.building_name, c.area, withCity ? c.city : '']
    .map(p => String(p || '').trim())
    .filter(Boolean)
    .join(', ')
}
