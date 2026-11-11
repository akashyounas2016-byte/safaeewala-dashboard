import type { RecurringContract } from '@/types'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { REMOTE_CHANGE_EVENT } from '@/lib/cloudState'
import { normalizeKey } from '@/lib/clientDataSync'
import { todayDubai } from '@/lib/dubaiTime'

/**
 * R-CLI-05: the contract of a Monthly / Bi-Weekly client is filled in on the client popup (Add New Client,
 * Edit) and saved in the same list as Monthly Clients → Contracts (`safaeewala_recurring_contracts`, shared
 * by all devices through app_state). One contract per client name; the client's Contract Status sets
 * whether it is active or paused, and a paused contract stops the monthly visits (R-SCHED-05, R-SCHED-08).
 */
export const CONTRACTS_KEY = 'safaeewala_recurring_contracts'

export interface ContractDetails {
  serviceType: string
  amount: number
  frequency: RecurringContract['frequency']
  startDate: string
  notes: string
}

export const emptyContractDetails = (): ContractDetails => ({ serviceType: '', amount: 0, frequency: 'monthly', startDate: todayDubai(), notes: '' })

const FREQUENCY_DAYS: Record<RecurringContract['frequency'], number> = { weekly: 7, biweekly: 14, monthly: 30 }

const readContracts = (): RecurringContract[] => {
  const list = safeLocalStorageGet<RecurringContract[]>(CONTRACTS_KEY, [])
  return Array.isArray(list) ? list : []
}

/** Renewal = one year after the start date (same as the Contracts tab) */
export function renewalDateOf(startDate: string): string {
  const [y, m, d] = (startDate || todayDubai()).split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const addDaysIso = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)

/** The client's contract: the active one, else the newest */
export function contractOfClient(clientName: string | undefined, list: RecurringContract[] = readContracts()): RecurringContract | undefined {
  const key = normalizeKey(clientName || '')
  if (!key) return undefined
  const own = list.filter(c => normalizeKey(c.clientName || '') === key)
  return own.find(c => c.status === 'active') || own[0]
}

export function detailsOfContract(c: RecurringContract | undefined): ContractDetails {
  if (!c) return emptyContractDetails()
  return { serviceType: c.serviceType || '', amount: Number(c.amount) || 0, frequency: c.frequency || 'monthly', startDate: c.startDate || todayDubai(), notes: c.notes || '' }
}

export const hasContractDetails = (d: ContractDetails) => Boolean(d.serviceType.trim()) || d.amount > 0

/**
 * Creates or updates the client's contract. Nothing is created while the card is empty; an existing
 * contract is never deleted from here (the Contracts tab does that). `previousName` keeps the link when
 * the client is renamed.
 */
export function saveClientContract(args: {
  clientName: string
  previousName?: string
  details: ContractDetails
  active: boolean
  phone?: string
  email?: string
}): RecurringContract | null {
  const { clientName, previousName, details, active, phone, email } = args
  const list = readContracts()
  const existing = contractOfClient(previousName || clientName, list) || contractOfClient(clientName, list)
  if (!existing && !hasContractDetails(details)) return null
  const startDate = details.startDate || existing?.startDate || todayDubai()
  const next: RecurringContract = {
    id: existing?.id || `ct-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    clientName,
    clientPhone: phone || existing?.clientPhone || '',
    clientEmail: email || existing?.clientEmail || '',
    serviceType: details.serviceType.trim() || existing?.serviceType || 'Regular Cleaning',
    frequency: details.frequency,
    amount: Number(details.amount) || 0,
    startDate,
    renewalDate: renewalDateOf(startDate),
    status: active ? 'active' : 'paused',
    lastBilled: existing?.lastBilled || startDate,
    nextBillingDate: existing?.startDate === startDate && existing?.frequency === details.frequency && existing?.nextBillingDate
      ? existing.nextBillingDate
      : addDaysIso(startDate, FREQUENCY_DAYS[details.frequency]),
    notes: details.notes.trim(),
  }
  const saved = existing ? list.map(c => (c.id === existing.id ? next : c)) : [next, ...list]
  safeLocalStorageSet(CONTRACTS_KEY, saved)
  // an open Monthly Clients page reloads its Contracts list (it would otherwise save its older copy over this)
  try { window.dispatchEvent(new CustomEvent(REMOTE_CHANGE_EVENT, { detail: { key: CONTRACTS_KEY } })) } catch { /* no window */ }
  return next
}
