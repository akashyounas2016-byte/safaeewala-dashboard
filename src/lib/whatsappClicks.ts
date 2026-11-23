import { toDubaiDate } from '@/lib/dubaiTime'
import { locateIp, type IpLocationData } from '@/lib/geo/ipLocation'

/** R-MKT-03: one click on a WhatsApp button of the website (table whatsapp_clicks, written by the server) */
export interface WhatsAppClick {
  id: string
  clicked_at: string
  page_url?: string | null
  page_title?: string | null
  button_text?: string | null
  button_location?: string | null
  wa_message?: string | null
  device?: string | null
  referrer?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  site_name?: string | null
  /** the visitor's IP, sent by the plugin (R-MKT-08 reads the location from it) */
  visitor_ip?: string | null
}

export type ClickRange = '7' | '30' | '90' | 'all'

/** Clicks inside the last N days (Dubai dates), newest first */
export function clicksInRange(list: WhatsAppClick[], range: ClickRange, today: string): WhatsAppClick[] {
  const from = range === 'all' ? '' : toDubaiDate(new Date(Date.parse(`${today}T12:00:00+04:00`) - (Number(range) - 1) * 86400000))
  return list
    .filter(c => !from || toDubaiDate(new Date(c.clicked_at)) >= from)
    .sort((a, b) => b.clicked_at.localeCompare(a.clicked_at))
}

/** Where the click came from: the campaign, else the source, else the site that referred the visitor, else Direct */
export function sourceOf(c: WhatsAppClick): string {
  if (c.utm_campaign) return `${c.utm_source || 'campaign'} · ${c.utm_campaign}`
  if (c.utm_source) return c.utm_source
  if (c.referrer) {
    try { return new URL(c.referrer).hostname.replace(/^www\./, '') } catch { return c.referrer }
  }
  return 'Direct'
}

/** Counts per key, biggest first */
export function countBy<T>(list: T[], key: (x: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>()
  list.forEach(x => { const k = key(x) || '—'; m.set(k, (m.get(k) || 0) + 1) })
  return Array.from(m, ([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

export const pageOf = (c: WhatsAppClick) => c.page_title || c.page_url || '—'

/** R-MKT-06: date filters of the WhatsApp Clicks screen */
export type ClickPreset = 'today' | 'yesterday' | '7' | '30' | 'all' | 'custom'
const dayBefore = (today: string, n: number) => toDubaiDate(new Date(Date.parse(`${today}T12:00:00+04:00`) - n * 86400000))

/** First and last Dubai date of a preset ('' = open) */
export function presetDates(preset: ClickPreset, today: string, custom: { from?: string; to?: string } = {}): { from: string; to: string } {
  switch (preset) {
    case 'today': return { from: today, to: today }
    case 'yesterday': { const y = dayBefore(today, 1); return { from: y, to: y } }
    case '7': return { from: dayBefore(today, 6), to: today }
    case '30': return { from: dayBefore(today, 29), to: today }
    case 'custom': return { from: custom.from || '', to: custom.to || '' }
    default: return { from: '', to: '' }
  }
}

/** Clicks between two Dubai dates (inclusive; '' = open), newest first */
export function clicksBetween(list: WhatsAppClick[], from: string, to: string): WhatsAppClick[] {
  return list
    .filter(c => { const d = toDubaiDate(new Date(c.clicked_at)); return (!from || d >= from) && (!to || d <= to) })
    .sort((a, b) => b.clicked_at.localeCompare(a.clicked_at))
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/**
 * R-MKT-06: the Dubai area a click is about, read from the page link / title / message (e.g. "/maid-service-jlt/" →
 * Jumeirah Lake Towers (JLT)). A click has no address of its own, so pages without an area name give "No area".
 * The plugin sends no area field — only the page link, title and WhatsApp message (checked 2026-11-23).
 */
export function areaOf(c: WhatsAppClick, areas: readonly string[]): string {
  let path = c.page_url || ''
  try { path = new URL(path).pathname } catch { /* keep the text */ }
  const hay = ` ${norm(`${path} ${c.page_title || ''} ${c.wa_message || ''}`)} `
  for (const area of areas) {
    const short = /\(([^)]+)\)/.exec(area)?.[1]
    const names = [area.replace(/\s*\([^)]*\)/, ''), short].filter(Boolean) as string[]
    if (names.some(n => { const k = norm(n); return k.length >= 3 && hay.includes(` ${k} `) })) return area
  }
  // R-MKT-07: the website's area pages ("/cleaning-service-areas/dubai-investment-park-dubai/") name the area in the
  // link even when it is not in the CRM's list — those clicks showed as "No area"
  const slug = /\/cleaning-service-areas\/([^/?#]+)/i.exec(path)?.[1]
  if (slug) {
    const words = slug.toLowerCase().split('-').filter(Boolean)
    if (words.length > 1 && words[words.length - 1] === 'dubai') words.pop()
    const name = words.map(w => (w.length <= 3 && /^(jlt|jvc|jbr|jvt|dip|dso)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ')
    if (name) return name
  }
  return 'No area'
}

/**
 * R-MKT-08: the location shown for a click, without asking the visitor (no popup):
 * 1. the area of the page or message (R-MKT-06/07) — the area the customer asked about;
 * 2. else where the visitor was, from their IP (offline UAE table, approximate) — "Dubai · Palm Jumeirah", "Outside UAE";
 * 3. else "No area" (clicks from before the plugin stored the IP).
 */
export function locationOf(c: WhatsAppClick, areas: readonly string[], ipData?: IpLocationData | null): { label: string; from: 'page' | 'ip' | '' } {
  const page = areaOf(c, areas)
  if (page !== 'No area') return { label: page, from: 'page' }
  const ip = ipData ? locateIp(c.visitor_ip, ipData) : null
  if (ip) return { label: ip.label, from: 'ip' }
  return { label: 'No area', from: '' }
}
