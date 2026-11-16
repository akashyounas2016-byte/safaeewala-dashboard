// R-MKT-03 (2026-11-16): WhatsApp button clicks from the WordPress plugin → CRM screen
import { readFileSync } from 'node:fs'
import { clicksInRange, sourceOf, countBy, pageOf, type WhatsAppClick } from '@/lib/whatsappClicks'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const c = (id: string, at: string, extra: Partial<WhatsAppClick> = {}) => ({ id, clicked_at: at, ...extra }) as WhatsAppClick
const list = [
  c('a', '2026-11-16T05:00:00Z', { page_title: 'Sofa Cleaning Dubai', utm_source: 'google', utm_campaign: 'sofa', device: 'mobile' }),
  c('b', '2026-11-10T05:00:00Z', { page_title: 'Sofa Cleaning Dubai', referrer: 'https://www.facebook.com/x' }),
  c('c', '2026-09-01T05:00:00Z', { page_url: 'https://example.com/deep/' }),
]
eq(clicksInRange(list, '7', '2026-11-16').map(x => x.id), ['a', 'b'], 'last 7 days (Dubai dates), newest first')
eq(clicksInRange(list, 'all', '2026-11-16').length, 3, 'all time')
eq([sourceOf(list[0]), sourceOf(list[1]), sourceOf(list[2])], ['google · sofa', 'facebook.com', 'Direct'], 'source = campaign, else referring site, else Direct')
eq(countBy(list, pageOf), [{ key: 'Sofa Cleaning Dubai', count: 2 }, { key: 'https://example.com/deep/', count: 1 }], 'clicks per page')

const app = readFileSync('src/App.tsx', 'utf8')
eq(/path="whatsapp-clicks" element=\{<WhatsAppClicks \/>\}/.test(app) && /'\/whatsapp-clicks'/.test(readFileSync('src/components/layout/Sidebar.tsx', 'utf8')), true, 'screen in the menu')
eq(/paths: \['\/marketing', '\/whatsapp-clicks'\]/.test(readFileSync('src/lib/permissions.ts', 'utf8')), true, 'same access as Marketing')
const sql = readFileSync('supabase/migrations/2026-11-16_whatsapp_clicks.sql', 'utf8')
eq(/create table if not exists public\.whatsapp_clicks/.test(sql) && /enable row level security/.test(sql) && !/for insert/.test(sql), true, 'table with read rules; only the server writes')
const server = readFileSync('webhookServer.cjs', 'utf8')
eq(/createHmac\('sha256', secret\)\.update\(raw\)/.test(server) && /safeEqual\(given, want\)/.test(server), true, 'signature checked on the raw body (X-WACT-Signature)')
eq(/R-MKT-03/.test(readFileSync('rules.md', 'utf8')), true, 'rule written')
