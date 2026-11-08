// R-MKT-01: client base segments (synced from the job sheet + bookings), offers and campaigns
import { supabase } from '@/lib/supabase'
import { isMissingTable } from '@/lib/whatsappModules'
import type { Client } from '@/types'

export type Audience = 'all' | 'first_time' | 'inactive' | 'active' | 'repeat' | 'never'
export const AUDIENCES: { key: Audience; label: string; note: string }[] = [
  { key: 'inactive', label: 'Inactive', note: 'Served before, nothing in the last 60 days' },
  { key: 'first_time', label: 'First-time', note: 'Exactly one visit so far' },
  { key: 'repeat', label: 'Repeat', note: 'Two or more visits' },
  { key: 'active', label: 'Active', note: 'Served in the last 60 days' },
  { key: 'never', label: 'Never booked', note: 'Registered but no visit yet' },
  { key: 'all', label: 'All clients', note: 'Everyone with a phone number' },
]
export const INACTIVE_DAYS = 60 // same as R-CLI-07

const dayMs = 86_400_000
export function daysSince(date?: string, now = Date.now()): number | null {
  if (!date) return null
  const t = new Date(String(date).slice(0, 10)).getTime()
  return isNaN(t) ? null : Math.floor((now - t) / dayMs)
}

/** Which segments a client is in */
export function segmentsOf(c: Pick<Client, 'total_bookings' | 'last_service'>, now = Date.now()): Audience[] {
  const visits = Number(c.total_bookings) || 0
  const since = daysSince(c.last_service, now)
  const out: Audience[] = ['all']
  if (visits === 0 && since === null) out.push('never')
  if (visits === 1) out.push('first_time')
  if (visits >= 2) out.push('repeat')
  if (since !== null && since <= INACTIVE_DAYS) out.push('active')
  if (since !== null && since > INACTIVE_DAYS) out.push('inactive')
  return out
}

export const hasPhone = (c: Pick<Client, 'phone' | 'whatsapp'>) => /\d{7,}/.test(String(c.whatsapp || c.phone || '').replace(/\D/g, ''))

/** Clients of one segment (only those with a phone number can be reached) */
export function audienceOf<T extends Pick<Client, 'total_bookings' | 'last_service' | 'phone' | 'whatsapp'>>(clients: T[], a: Audience, now = Date.now()): T[] {
  return clients.filter(c => hasPhone(c) && segmentsOf(c, now).includes(a))
}

export function segmentCounts(clients: Pick<Client, 'total_bookings' | 'last_service' | 'phone' | 'whatsapp'>[], now = Date.now()): Record<Audience, number> {
  const out = Object.fromEntries(AUDIENCES.map(a => [a.key, 0])) as Record<Audience, number>
  clients.forEach(c => { if (hasPhone(c)) segmentsOf(c, now).forEach(s => { out[s]++ }) })
  return out
}

// ── storage ──
export interface Offer {
  id: string; title: string; code: string | null; discount_type: 'percent' | 'amount' | 'free_hours' | 'none'; discount_value: number
  services: string | null; audience: Audience; valid_from: string | null; valid_to: string | null; terms: string | null; active: boolean
  created_by: string | null; created_at: string; updated_at: string
}
export interface Campaign {
  id: string; name: string; audience: Audience; offer_id: string | null; channel: string; message: string | null
  status: 'draft' | 'scheduled' | 'running' | 'done' | 'cancelled'; start_date: string | null; end_date: string | null
  budget: number; audience_count: number; bookings: number; revenue: number; notes: string | null
  created_by: string | null; created_at: string; updated_at: string
}

export function offerText(o: Pick<Offer, 'discount_type' | 'discount_value'>): string {
  if (o.discount_type === 'percent') return `${o.discount_value}% off`
  if (o.discount_type === 'amount') return `AED ${o.discount_value} off`
  if (o.discount_type === 'free_hours') return `${o.discount_value} free hour${o.discount_value === 1 ? '' : 's'}`
  return 'Special offer'
}
/** live = active and today inside the dates */
export function offerLive(o: Pick<Offer, 'active' | 'valid_from' | 'valid_to'>, today: string): boolean {
  return o.active && (!o.valid_from || o.valid_from <= today) && (!o.valid_to || o.valid_to >= today)
}

async function load<T>(table: string): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(1000)
  if (error) { if (isMissingTable(error)) return null; throw error }
  return (data || []) as T[]
}
async function save<T extends { id?: string }>(table: string, row: T) {
  const body = { ...row, updated_at: new Date().toISOString() }
  const q = row.id ? supabase.from(table).update(body).eq('id', row.id) : supabase.from(table).insert(body)
  const { data, error } = await q.select().single()
  if (error) throw error
  return data
}
async function remove(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}
export const loadOffers = () => load<Offer>('marketing_offers')
export const saveOffer = (o: Partial<Offer> & { title: string }) => save('marketing_offers', o) as Promise<Offer>
export const deleteOffer = (id: string) => remove('marketing_offers', id)
export const loadCampaigns = () => load<Campaign>('marketing_campaigns')
export const saveCampaign = (c: Partial<Campaign> & { name: string }) => save('marketing_campaigns', c) as Promise<Campaign>
export const deleteCampaign = (id: string) => remove('marketing_campaigns', id)

/** {name} in a campaign message = the client's first name */
export const fillMessage = (msg: string, name: string) => msg.replace(/\{name\}/g, (name || '').split(' ')[0] || 'there')
