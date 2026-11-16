import type { Booking, Client, DailyJob, Invoice } from '@/types'
import { cleanClientNameFromAddress, contractOffJobs, getClientDailyJobsHistory, normalizeKey, scheduledAddressOf } from '@/lib/clientDataSync'

const key = (t?: string | null) => normalizeKey(cleanClientNameFromAddress(String(t || '')))

/**
 * R-CLI-10: the address a sheet row gets when its client is renamed or moves ("def" → "def1"). The row's text is
 * replaced only when it is one of the client's old names: the monthly visit address, the building, the name, or
 * the address the client was built from (dj- id). Anything else typed on the row stays. null = leave the row.
 */
export function renamedRowAddress(address: string, before: Partial<Client> & { id?: string }, after: Partial<Client>): string | null {
  const k = key(address)
  if (!k) return null
  const newName = (after.full_name || '').trim()
  const newBuilding = (after.building_name || '').trim()
  const pairs: [string, string][] = [
    [key(scheduledAddressOf(before as Client)), scheduledAddressOf(after as Client)],
    [key(before.building_name), newBuilding || newName],
    [key(before.full_name), newName || newBuilding],
  ]
  if (before.id?.startsWith('dj-')) pairs.push([before.id.slice(3), newBuilding || newName])
  const hit = pairs.find(([from, to]) => from && from === k && to && key(to) !== k)
  return hit ? hit[1] : null
}

/** R-CLI-11: what deleting a client removes and what stays — shown before the delete */
export interface DeletionImpact { upcoming: number; past: number; contracts: number; bookings: number; invoices: number }

export function clientDeletionImpact(
  c: Client, jobs: DailyJob[], today: string,
  extra: { bookings?: Pick<Booking, 'client_id' | 'client_name'>[]; invoices?: Pick<Invoice, 'client_id' | 'client_name'>[]; contractNames?: string[] } = {},
): DeletionImpact {
  const upcoming = contractOffJobs(c, jobs, today).length
  const all = getClientDailyJobsHistory(c, jobs).length
  const name = normalizeKey(c.full_name || '')
  const mine = (x: { client_id?: string; client_name?: string }) => x.client_id === c.id || (!!name && normalizeKey(x.client_name || '') === name)
  return {
    upcoming,
    past: Math.max(0, all - upcoming),
    contracts: (extra.contractNames || []).filter(n => normalizeKey(n) === name).length,
    bookings: (extra.bookings || []).filter(mine).length,
    invoices: (extra.invoices || []).filter(mine).length,
  }
}

/** The text of the delete popup: what goes, what stays, where the copy is */
export function deletionMessage(c: Client, i: DeletionImpact): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  return [
    `Delete "${c.full_name}"?`,
    '',
    'Deleted now:',
    '• the client record',
    `• ${plural(i.upcoming, 'upcoming unpaid visit')} on the Job Sheet (from today on)`,
    `• ${plural(i.contracts, 'contract')}`,
    '',
    'Kept as history (not deleted):',
    `• ${plural(i.past, 'past or paid job row')} — work done and money received`,
    `• ${plural(i.bookings, 'booking')} and ${plural(i.invoices, 'invoice')}`,
    '• payments, advances and adjustments',
    '',
    'A copy (client, visits, contract) is kept in Settings → Backup → Before-delete copies and can be restored there.',
  ].join('\n')
}
