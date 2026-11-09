// R-MKT-02: contacts extracted from pasted text, deduped, filtered into lists
import { readFileSync } from 'node:fs'
import { extractContacts, normalizePhone, dedupeContacts, filterPool, type PoolContact } from '@/lib/leadLists'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
eq([normalizePhone('503285219'), normalizePhone('+971 50 328 5219'), normalizePhone('00971503285219'), normalizePhone('050-328-5219'), normalizePhone('12')],
  ['971503285219', '971503285219', '971503285219', '971503285219', ''], 'UAE numbers in every common form → 971…')

const text = [
  'From: Sara Khan <sara.k@gmail.com>',
  'Phone: 050 123 4567',
  'Ali Raza 0551234567',
  'hello@test.ae',
  'Name: Fatima',
  'mobile +971 52 987 6543',
  'Ali Raza 0551234567',
].join('\n')
const got = extractContacts(text).map(c => [c.name, c.phone, c.email])
eq(got, [
  ['Sara Khan', '971501234567', 'sara.k@gmail.com'],
  ['Ali Raza', '971551234567', ''],
  ['', '', 'hello@test.ae'],
  ['Fatima', '971529876543', ''],
], 'names, numbers and emails pulled out; Sara\'s mail + phone joined; the repeated line dropped')

const c = (p: Partial<PoolContact>): PoolContact => ({ key: p.key || Math.random().toString(), name: '', phone: '', email: '', source: 'website', date: '2026-11-01', ...p })
const pool = dedupeContacts([
  c({ key: 'a', name: 'Sara', phone: '971501111111', date: '2026-11-05', status: 'new' }),
  c({ key: 'b', name: '', phone: '971501111111', email: 's@x.ae', source: 'whatsapp', date: '2026-10-01' }),
  c({ key: 'c', name: 'Old client', phone: '971502222222', source: 'client', isClient: true }),
  c({ key: 'd', name: 'Mail only', email: 'm@x.ae', source: 'pasted' }),
])
eq(pool.length, 3, 'same number from two sources = one contact')
eq(pool.find(p => p.phone === '971501111111')?.email, 's@x.ae', 'merged contact keeps the email it had elsewhere')
const base = { sources: ['website', 'whatsapp', 'client', 'pasted'] as const, need: 'any' as const, excludeClients: false }
eq(filterPool(pool, { ...base, sources: [...base.sources], need: 'phone', excludeClients: true }).map(p => p.name), ['Sara'], 'with a phone, not yet a client')
eq(filterPool(pool, { ...base, sources: ['pasted'] }).map(p => p.name), ['Mail only'], 'by source')
eq(filterPool(pool, { ...base, sources: [...base.sources], from: '2026-11-03' }).map(p => p.name), ['Sara'], 'by date')

const mk = readFileSync('src/pages/MarketingDashboard.tsx', 'utf8')
const ll = readFileSync('src/components/marketing/LeadLists.tsx', 'utf8')
eq(/key: 'lists', label: 'Lead lists'/.test(mk) && /extractContacts\(/.test(ll) && /createList\(/.test(ll), true, 'Marketing → Lead lists: extract, filter, save as a contact list')
