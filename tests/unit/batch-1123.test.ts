// 2026-11-23: WhatsApp Clicks area from area-page links (R-MKT-07); Leads tabs under the header, Last 7 Days card (R-LEAD-12)
import { readFileSync } from 'node:fs'
import { areaOf, type WhatsAppClick } from '@/lib/whatsappClicks'
import { DUBAI_AREAS } from '@/lib/excelSheet/sheetConfig'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const c = (page_url: string, wa_message = '', page_title = '') => ({ page_url, wa_message, page_title }) as WhatsAppClick
eq(areaOf(c('https://safaeewala.com/cleaning-service-areas/dubai-investment-park-dubai/'), DUBAI_AREAS), 'Dubai Investment Park', 'area page not in the list → name from the link (R-MKT-07)')
eq(areaOf(c('https://safaeewala.com/cleaning-service-areas/dubai-marina/'), DUBAI_AREAS), 'Dubai Marina', 'area in the list still matches it')
eq(areaOf(c('https://safaeewala.com/service/deep-cleaning/', 'Hi, I want deep cleaning in JLT'), DUBAI_AREAS), 'Jumeirah Lake Towers (JLT)', 'area named in the message')
eq(areaOf(c('https://safaeewala.com/'), DUBAI_AREAS), 'No area', 'home page click has no area')

const ff = readFileSync('src/pages/FluentFormsLeads.tsx', 'utf8')
eq(/label: 'Conversion Rate'/.test(ff), false, 'Conversion Rate card removed (R-LEAD-12)')
eq(/label: 'Last 7 Days'/.test(ff), true, 'Last 7 Days card added (R-LEAD-12)')
eq(ff.indexOf('<LeadsTabs />') > ff.indexOf('Single Merged Hero Header'), true, 'Fluent Forms: tabs under the header')
const wa = readFileSync('src/pages/WhatsAppClicks.tsx', 'utf8')
eq(wa.indexOf('<LeadsTabs />') > wa.indexOf('<PageHero'), true, 'WhatsApp Clicks: tabs under the header')
