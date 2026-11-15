// R-EMP-14: an employee's new name is carried to the rows that store the name as text — job-sheet rows
// (staff_name, team members, Split Mode) and the cleaner of monthly clients' schedules. Bookings keep
// employee ids and need nothing. Only exact names are replaced ("Rupa" never touches "Rupak").
import type { Client, DailyJob } from '@/types'
import { normalizeStaffName, splitStaffNames } from '@/lib/clientDataSync'

const same = (a: string, b: string) => Boolean(a) && normalizeStaffName(a) === normalizeStaffName(b)

/** "Old, Asmita" → "New, Asmita"; unchanged text when the old name is not one of the names */
export function renameInStaffText(text: string | null | undefined, oldName: string, newName: string): string {
  const raw = String(text || '')
  if (!raw.trim() || !oldName.trim() || !newName.trim()) return raw
  const names = splitStaffNames(raw)
  if (!names.some(n => same(n, oldName))) return raw
  if (names.length === 1) return newName.trim()
  return names.map(n => (same(n, oldName) ? newName.trim() : n)).join(', ')
}

/** Job rows to change: id → patch */
export function jobRenamePatches(jobs: DailyJob[], oldName: string, newName: string): Map<string, Partial<DailyJob>> {
  const out = new Map<string, Partial<DailyJob>>()
  jobs.forEach(j => {
    const patch: Partial<DailyJob> = {}
    const staff = renameInStaffText(j.staff_name, oldName, newName)
    if (staff !== (j.staff_name || '')) patch.staff_name = staff
    if (Array.isArray(j.charge_split) && j.charge_split.some(s => same(s.cleaner, oldName))) {
      patch.charge_split = j.charge_split.map(s => (same(s.cleaner, oldName) ? { ...s, cleaner: newName.trim() } : s))
    }
    if (Object.keys(patch).length) out.set(j.id, patch)
  })
  return out
}

/** Clients to change: id → patch (preferred cleaner, per-day cleaner, per-day schedule) */
export function clientRenamePatches(clients: Client[], oldName: string, newName: string): Map<string, Partial<Client>> {
  const out = new Map<string, Partial<Client>>()
  clients.forEach(c => {
    const patch: Partial<Client> = {}
    const pc = renameInStaffText(c.preferred_cleaner, oldName, newName)
    if (pc !== (c.preferred_cleaner || '')) patch.preferred_cleaner = pc
    const dca = c.day_cleaner_assignments as Record<string, string> | null | undefined
    if (dca && Object.values(dca).some(v => renameInStaffText(v, oldName, newName) !== (v || ''))) {
      patch.day_cleaner_assignments = Object.fromEntries(Object.entries(dca).map(([d, v]) => [d, renameInStaffText(v, oldName, newName)])) as Client['day_cleaner_assignments']
    }
    const ds = c.day_schedules as Record<string, { cleaner?: string }> | null | undefined
    if (ds && Object.values(ds).some(v => v && renameInStaffText(v.cleaner, oldName, newName) !== (v.cleaner || ''))) {
      patch.day_schedules = Object.fromEntries(Object.entries(ds).map(([d, v]) => [d, v ? { ...v, cleaner: renameInStaffText(v.cleaner, oldName, newName) } : v])) as Client['day_schedules']
    }
    if (Object.keys(patch).length) out.set(c.id, patch)
  })
  return out
}
