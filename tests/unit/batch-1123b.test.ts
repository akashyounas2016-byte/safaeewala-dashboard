// 2026-11-23 (b): WhatsApp click location from the IP (R-MKT-08); deleted leads stay deleted (R-LEAD-13);
// Website Leads header in two rows (R-LEAD-14); Pending: no future visits, the address once (R-FIN-20)
import { readFileSync } from 'node:fs'
import { locateIp, OUTSIDE_UAE, type IpLocationData } from '@/lib/geo/ipLocation'
import { locationOf, type WhatsAppClick } from '@/lib/whatsappClicks'
import { DUBAI_AREAS } from '@/lib/excelSheet/sheetConfig'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// A small table: 10.0.0.0–10.0.0.255 Dubai (Palm Jumeirah); 10.0.1.0–10.0.1.255 Sharjah city; 2001:db8::/32 Dubai
const n = (ip: string) => ip.split('.').reduce((s, p) => s * 256 + Number(p), 0)
const data: IpLocationData = {
  source: 'test',
  locations: ['Dubai|Palm Jumeirah', 'Sharjah|Sharjah city', 'Dubai|Dubai (Hor Al Anz)', 'Dubai|Dubai'],
  v4: [n('10.0.0.0'), n('10.0.0.255'), 0, n('10.0.1.0'), n('10.0.1.255'), 1, n('10.0.2.0'), n('10.0.2.9'), 2],
  v6: [['20010db8000000000000000000000000', '20010db8ffffffffffffffffffffffff', 3]],
}
eq(locateIp('10.0.0.77', data)?.label, 'Dubai · Palm Jumeirah', 'IPv4 inside a range → emirate · community')
eq(locateIp('10.0.1.5', data)?.label, 'Sharjah', '"Sharjah city" → only the emirate')
eq(locateIp('10.0.2.3', data)?.label, 'Dubai · Hor Al Anz', '"Dubai (Hor Al Anz)" → the community in brackets')
eq(locateIp('2001:db8::1', data)?.label, 'Dubai', 'IPv6 (short form) inside a range')
eq(locateIp('10.0.3.1', data), OUTSIDE_UAE, 'not in the UAE table → Outside UAE')
eq(locateIp('', data), null, 'no IP → null')
eq(locateIp('not-an-ip', data), null, 'bad IP → null')

const real = JSON.parse(readFileSync('src/lib/geo/uaeIpLocations.json', 'utf8')) as IpLocationData
eq(locateIp('8.8.8.8', real)?.label, 'Outside UAE', 'real table: a US address is outside the UAE')
eq(real.locations.length > 100 && real.v4.length % 3 === 0, true, 'real table loaded (UAE only, DB-IP lite)')
eq(/DB-IP/.test(real.source), true, 'real table names its source (CC BY credit)')

const click = (page_url: string, visitor_ip = '') => ({ page_url, visitor_ip, page_title: '', wa_message: '' }) as WhatsAppClick
eq(locationOf(click('https://safaeewala.com/cleaning-service-areas/dubai-marina/', '10.0.1.5'), DUBAI_AREAS, data), { label: 'Dubai Marina', from: 'page' }, 'the page area wins over the IP')
eq(locationOf(click('https://safaeewala.com/', '10.0.0.9'), DUBAI_AREAS, data), { label: 'Dubai · Palm Jumeirah', from: 'ip' }, 'home page click → location from the IP')
eq(locationOf(click('https://safaeewala.com/'), DUBAI_AREAS, data), { label: 'No area', from: '' }, 'no IP and no area page → No area')

const wa = readFileSync('src/pages/WhatsAppClicks.tsx', 'utf8')
eq(/loadIpLocations\(\)/.test(wa) && /Area \/ location/.test(wa) && /db-ip\.com/.test(wa), true, 'WhatsApp Clicks: IP location column, table loaded, DB-IP credit')

// R-LEAD-13
const sync = readFileSync('src/lib/fluentFormsSync.ts', 'utf8')
const del = sync.slice(sync.indexOf('export async function deleteFluentFormLeadRemote'))
eq(del.indexOf('rememberDeletedLead(id)') < del.indexOf('vpsWrite('), true, 'delete is remembered before the server calls')
eq(/!deleted\.has\(l\.id\)/.test(sync) && /startedAt === deleteGeneration/.test(sync), true, 'a deleted lead is never copied back to Supabase')
eq(/byId\.delete\(id\)/.test(sync), true, 'a deleted lead is hidden from the merged list')
const ff = readFileSync('src/pages/FluentFormsLeads.tsx', 'utf8')
eq(/gen === leadDeleteGeneration\(\)/.test(ff), true, 'a poll that started before a delete is dropped')

// R-LEAD-14
eq(/>\s*Website Leads\s*</.test(ff) && !/Safaeewala Website Leads/.test(ff), true, 'header is "Website Leads"')
const hero = ff.slice(ff.indexOf('R-LEAD-14'), ff.indexOf('R-LEAD-14') + 1400)
eq(hero.indexOf('Total Inquiries') < hero.indexOf('Endpoint: 200 OK Listening') && /whitespace-nowrap/.test(hero), true, 'endpoint tag sits right after the inquiry count')

// R-FIN-20
const pp = readFileSync('src/pages/PendingPayments.tsx', 'utf8')
eq(/if \(job\.date && job\.date > today\) return/.test(pp), true, 'a visit after today is not an outstanding due')
eq(/clientById\.get\(job\.client_id\)\?\.full_name/.test(pp), true, "the client's name, not the address, in the Client column")
eq(/rec\.address !== rec\.clientName/.test(pp), true, 'the address is not repeated under the name')
