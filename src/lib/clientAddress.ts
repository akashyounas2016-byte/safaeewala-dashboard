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

/** R-CLI-09: one more address of the same client (another property / location), chosen when booking */
export interface ClientAddress { id: string; label: string; address: string; area?: string }

/**
 * R-CLI-09: the one Address field of the client form = the old Building + Apartment, written the way monthly
 * visits write it ("Al Khair Building Apt 302"), so visits saved before keep matching the client.
 */
export function singleAddressOf(c: Partial<Pick<Client, 'apartment' | 'building_name'>> | null | undefined): string {
  const b = String(c?.building_name || '').trim()
  const a = String(c?.apartment || '').trim()
  if (!a) return b
  if (!b) return a
  return b.toLowerCase().includes(a.toLowerCase()) ? b : `${b} Apt ${a}`
}

/** R-CLI-09: the extra addresses of a client, cleaned (empty rows dropped) */
export function cleanAddresses(list: unknown): ClientAddress[] {
  if (!Array.isArray(list)) return []
  return list
    .map((x, i) => ({
      id: String((x as ClientAddress)?.id || `addr-${i}`),
      label: String((x as ClientAddress)?.label || '').trim(),
      address: String((x as ClientAddress)?.address || '').trim(),
      area: String((x as ClientAddress)?.area || '').trim(),
    }))
    .filter(x => x.address)
}
