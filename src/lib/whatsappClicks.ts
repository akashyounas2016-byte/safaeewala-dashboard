import { toDubaiDate } from '@/lib/dubaiTime'

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
