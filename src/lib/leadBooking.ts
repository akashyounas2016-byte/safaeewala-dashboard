// R-LEAD-02: a website lead becomes a booking through the same Add Job form as the job sheets
import type { DailyJob, FluentFormLead } from '@/types'
import { todayDubai } from '@/lib/dubaiTime'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)

/** The form's preferred date as YYYY-MM-DD ("30-Oct-26", "30/10/2026", "2026-10-30"); '' when it cannot be read */
export function leadDateIso(raw?: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = s.match(/^(\d{1,2})[\s\-/.]([A-Za-z]{3,})[\s\-/.,]+(\d{2,4})$/)
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mon >= 0) return `${fullYear(+m[3])}-${pad(mon + 1)}-${pad(+m[1])}`
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/) // UAE writes day first
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${fullYear(+m[3])}-${pad(+m[2])}-${pad(+m[1])}`
  return ''
}

/** "02:30 PM" style time from the form, or the default 09:00 AM */
export function leadTime(raw?: string): string {
  const m = String(raw || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) return '09:00 AM'
  let h = +m[1]
  const min = +(m[2] || 0)
  const ap = m[3]?.toUpperCase()
  if (!ap) { if (h > 23) return '09:00 AM'; const a = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${pad(h)}:${pad(min)} ${a}` }
  if (h < 1 || h > 12) return '09:00 AM'
  return `${pad(h)}:${pad(min)} ${ap}`
}

function plusHours(t: string, hours: number): string {
  const m = t.match(/^(\d{2}):(\d{2}) (AM|PM)$/)
  if (!m) return '01:00 PM'
  const start = ((+m[1] % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + +m[2]
  const end = Math.min(start + hours * 60, 23 * 60 + 59)
  const h24 = Math.floor(end / 60)
  return `${pad(h24 % 12 || 12)}:${pad(end % 60)} ${h24 >= 12 ? 'PM' : 'AM'}`
}

const digits = (p?: string) => String(p || '').replace(/\D/g, '')

/**
 * R-INBOX-06: "Book Job" in a chat — today, 09:00–01:00, the client's building when the chat is linked to a
 * client (or the number matches one); otherwise the remarks name the chat and saving registers the client.
 */
export function chatToJob(
  chat: { clientId?: string | null; name?: string; phone?: string; channel: string },
  clients: { id: string; full_name: string; phone?: string; whatsapp?: string; building_name?: string; area?: string }[],
): Partial<DailyJob> {
  const tail = digits(chat.phone).slice(-8)
  const c = (chat.clientId ? clients.find(x => x.id === chat.clientId) : undefined)
    || (tail.length >= 7 ? clients.find(x => [x.phone, x.whatsapp].some(p => digits(p).endsWith(tail))) : undefined)
  const who = [String(chat.name || '').replace(/^DEMO · /, ''), chat.phone].filter(Boolean).join(' ')
  return {
    date: todayDubai(), start_time: '09:00 AM', end_time: '01:00 PM',
    address: c?.building_name || '', area: c?.area || '',
    remarks: `${chat.channel} enquiry${who ? ` — ${who}` : ''}`,
  }
}

/**
 * The Add Job form filled from a lead: a known client (same phone / name) brings their building; anyone else
 * gets the form's location as the address, so saving opens "Add New Client" with name, number and area filled.
 * The amount stays empty — no invented price.
 */
export function leadToJob(
  lead: Pick<FluentFormLead, 'client_name' | 'phone' | 'address' | 'area' | 'preferred_date' | 'preferred_time' | 'service' | 'property_type' | 'message' | 'entry_id' | 'id'>,
  clients: { id: string; full_name: string; phone?: string; whatsapp?: string; building_name?: string; area?: string }[],
): { initial: Partial<DailyJob>; hint: { name: string; phone: string } } {
  const tail = digits(lead.phone).slice(-8)
  const name = String(lead.client_name || '').trim()
  const known = clients.find(c =>
    (tail.length >= 7 && [c.phone, c.whatsapp].some(p => digits(p).endsWith(tail))) ||
    (name && name.toLowerCase() !== 'guest' && (c.full_name || '').toLowerCase().trim() === name.toLowerCase()))
  const start = leadTime(lead.preferred_time)
  const area = String(lead.area || '').trim()
  const location = String(lead.address || '').trim() || area
  const note = [
    `Website lead #${lead.entry_id || lead.id}`,
    [name, lead.phone].filter(Boolean).join(' '),
    lead.service, lead.property_type && lead.property_type !== 'Not Specified' ? lead.property_type : '',
    lead.message,
  ].filter(Boolean).join(' — ')
  return {
    initial: {
      date: leadDateIso(lead.preferred_date) || todayDubai(),
      start_time: start,
      end_time: plusHours(start, 4),
      address: known?.building_name || location,
      area: known ? (known.area || area) : area,
      remarks: note,
    },
    hint: { name, phone: String(lead.phone || '').trim() },
  }
}
