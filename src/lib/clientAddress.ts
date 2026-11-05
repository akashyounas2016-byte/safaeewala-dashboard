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

type AddressParts = Partial<Pick<Client, 'apartment' | 'building_name' | 'area' | 'city'>>

/** R-CLI-03: a client needs an address: an apartment / villa number or a building / villa name */
export function hasClientAddress(c: AddressParts): boolean {
  return Boolean(String(c.apartment || '').trim() || String(c.building_name || '').trim())
}

/**
 * R-CLI-03: the client's name is optional; the address identifies the client. Without a name, the
 * address ("302, Al Khair Building") is stored as the name, so every screen and match still works.
 */
export function clientNameOrAddress(name: unknown, c: AddressParts): string {
  const n = String(name ?? '').trim()
  if (n) return n
  const short = [c.apartment, c.building_name].map(p => String(p || '').trim()).filter(Boolean).join(', ')
  return short || formatClientAddress(c)
}
