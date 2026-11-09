// R-MKT-02: lead lists — one pool of contacts from website leads, WhatsApp / Facebook / Instagram chats, clients and
// pasted text (e.g. emails), filtered and saved as a contact list that Broadcasts can send to.

export type ContactSource = 'website' | 'whatsapp' | 'facebook' | 'instagram' | 'client' | 'pasted'
export const SOURCE_LABEL: Record<ContactSource, string> = {
  website: 'Website leads', whatsapp: 'WhatsApp chats', facebook: 'Facebook', instagram: 'Instagram', client: 'Clients', pasted: 'Pasted / extracted',
}

export interface PoolContact {
  key: string
  name: string
  phone: string      // 971XXXXXXXXX ('' when none)
  email: string
  source: ContactSource
  date: string       // YYYY-MM-DD of the lead / last message / last service
  service?: string
  area?: string
  status?: string    // lead status (new · contacted · quoted · converted · lost)
  isClient?: boolean
}

/** A UAE number as 971XXXXXXXXX: 050…, +971 50…, 00971 50…, 50… → 97150…; other countries kept as digits */
export function normalizePhone(raw?: string | null): string {
  let d = String(raw || '').replace(/[^\d+]/g, '')
  if (!d) return ''
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  if (/^0(5\d{8}|[2-9]\d{7})$/.test(d)) d = '971' + d.slice(1)
  else if (/^5\d{8}$/.test(d)) d = '971' + d
  return d.length >= 9 && d.length <= 15 ? d : ''
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE = /(?:\+|00)?\d[\d\s().-]{7,16}\d/g
const EMAIL_ONE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE_ONE = /(?:\+|00)?\d[\d\s().-]{7,16}\d/
const NAME_LABEL = /(?:^|\b)(?:name|full name|naam|client|customer|from)\s*[:-]\s*([A-Za-z][A-Za-z .'-]{1,40})/i

/**
 * Names, numbers and emails from any pasted text (emails, WhatsApp exports, notes). One contact per line that has a
 * number or an email; the name comes from "Name: …" / "From: Name <mail>" or from the words before the number.
 */
export function extractContacts(text: string, date = ''): PoolContact[] {
  const out: PoolContact[] = []
  const seen = new Set<string>()
  let lastName = ''
  for (const line of String(text || '').split(/\r?\n/)) {
    const labelled = NAME_LABEL.exec(line)?.[1]?.replace(/\s*<.*$/, '').trim()
    if (labelled && !/@|\d/.test(labelled)) lastName = labelled
    const emails = line.match(EMAIL) || []
    const phones = (line.replace(EMAIL, ' ').match(PHONE) || []).map(normalizePhone).filter(Boolean)
    if (!emails.length && !phones.length) continue
    // the words before the first number / email on the line, without labels like "Phone:" or "Email:"
    const firstAt = Math.min(...[line.search(EMAIL_ONE), line.search(PHONE_ONE)].filter(i => i >= 0))
    const before = line.slice(0, firstAt).replace(/<[^>]*$/, '')
      .replace(/\b(name|full name|naam|from|client|customer|phone|mobile|mob|tel|cell|whatsapp|wa|contact|number|no|email|e-mail|mail)\b\s*[:\-#.]*/gi, ' ')
      .replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim()
    const name = (labelled && !/@|\d/.test(labelled) ? labelled : before.length >= 2 && before.split(' ').length <= 4 ? before : lastName) || ''
    const n = Math.max(emails.length, phones.length)
    for (let i = 0; i < n; i++) {
      const phone = phones[i] || (n === 1 ? phones[0] || '' : '')
      const email = (emails[i] || (n === 1 ? emails[0] || '' : '')).toLowerCase()
      const key = phone || email
      if (!key || seen.has(key)) continue
      seen.add(key)
      // "From: Sara <mail>" then "Phone: 050…": the number joins Sara's contact instead of making a nameless one
      const prev = out[out.length - 1]
      if (prev && name && prev.name === name && ((phone && !prev.phone && !email) || (email && !prev.email && !phone))) {
        if (phone) prev.phone = phone
        if (email) prev.email = email
        continue
      }
      out.push({ key: `pasted:${key}`, name, phone, email, source: 'pasted', date })
    }
    if (!labelled) lastName = ''
  }
  return out
}

/** One contact per phone (else email); the newest record wins, sources are joined in `source` of the first seen */
export function dedupeContacts(list: PoolContact[]): PoolContact[] {
  const by = new Map<string, PoolContact>()
  for (const c of [...list].sort((a, b) => b.date.localeCompare(a.date))) {
    const k = c.phone || c.email.toLowerCase() || c.key
    const had = by.get(k)
    if (!had) by.set(k, c)
    else by.set(k, { ...had, name: had.name || c.name, email: had.email || c.email, phone: had.phone || c.phone, isClient: had.isClient || c.isClient })
  }
  return [...by.values()]
}

export interface PoolFilter {
  sources: ContactSource[]
  from?: string
  to?: string
  status?: string
  text?: string
  need: 'any' | 'phone' | 'email'
  excludeClients: boolean
}

export function filterPool(pool: PoolContact[], f: PoolFilter): PoolContact[] {
  const q = (f.text || '').trim().toLowerCase()
  return pool.filter(c =>
    f.sources.includes(c.source) &&
    (!f.from || !c.date || c.date >= f.from) && (!f.to || !c.date || c.date <= f.to) &&
    (!f.status || f.status === 'all' || c.status === f.status) &&
    (f.need === 'any' || (f.need === 'phone' ? !!c.phone : !!c.email)) &&
    (!f.excludeClients || !c.isClient) &&
    (!q || [c.name, c.phone, c.email, c.service, c.area].some(v => String(v || '').toLowerCase().includes(q))))
}
