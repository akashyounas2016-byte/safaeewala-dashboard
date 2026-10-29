import type { Client, Employee } from '@/types'

/**
 * Validation rules for people records (VAL-01…VAL-04). Used by the client and employee forms;
 * pure functions so the Data health page and imports can reuse them.
 */

/** Digits only, UAE numbers in one form: "050 123 4567", "+971 50…", "00971 50…" → "971501234567" */
export function normalizePhone(raw: string | undefined | null): string {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0') && d.length === 10) d = `971${d.slice(1)}`
  if (d.length === 9 && d.startsWith('5')) d = `971${d}`
  return d
}

/** UAE mobile: 971 5X XXX XXXX */
export function isUaeMobile(raw: string | undefined | null): boolean {
  return /^9715[0-9]{8}$/.test(normalizePhone(raw))
}

/** Emirates ID: 15 digits starting with 784 (dashes optional) */
export function normalizeEmiratesId(raw: string | undefined | null): string {
  return String(raw || '').replace(/\D/g, '')
}
export function isValidEmiratesId(raw: string | undefined | null): boolean {
  return /^784\d{12}$/.test(normalizeEmiratesId(raw))
}
/** "784198012345671" → "784-1980-1234567-1" */
export function formatEmiratesId(raw: string): string {
  const d = normalizeEmiratesId(raw)
  return d.length === 15 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 14)}-${d.slice(14)}` : raw
}

const norm = (s: string | undefined | null) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** An existing client that looks like the same person: same phone, or same name + building (VAL-02) */
export function findDuplicateClient(
  clients: Client[],
  draft: Pick<Client, 'full_name' | 'phone' | 'building_name'>,
  excludeId?: string,
): { client: Client; reason: string } | null {
  const phone = normalizePhone(draft.phone)
  for (const c of clients) {
    if (c.id === excludeId) continue
    if (phone.length >= 9 && (normalizePhone(c.phone) === phone || normalizePhone(c.whatsapp) === phone)) {
      return { client: c, reason: 'same phone number' }
    }
  }
  const name = norm(draft.full_name)
  const building = norm(draft.building_name)
  if (name && building) {
    const hit = clients.find(c => c.id !== excludeId && norm(c.full_name) === name && norm(c.building_name) === building)
    if (hit) return { client: hit, reason: 'same name and building' }
  }
  return null
}

/** An existing employee with the same Emirates ID, passport or phone (VAL-01) */
export function findDuplicateEmployee(
  employees: Employee[],
  draft: Pick<Employee, 'emirates_id' | 'passport_number' | 'phone'>,
  excludeId?: string,
): { employee: Employee; reason: string } | null {
  const eid = normalizeEmiratesId(draft.emirates_id)
  const passport = norm(draft.passport_number).replace(/\s/g, '')
  const phone = normalizePhone(draft.phone)
  for (const e of employees) {
    if (e.id === excludeId) continue
    if (eid.length >= 10 && normalizeEmiratesId(e.emirates_id) === eid) return { employee: e, reason: 'same Emirates ID' }
    if (passport.length >= 5 && norm(e.passport_number).replace(/\s/g, '') === passport) return { employee: e, reason: 'same passport number' }
    if (phone.length >= 9 && normalizePhone(e.phone) === phone) return { employee: e, reason: 'same phone number' }
  }
  return null
}
