import { supabase } from '@/lib/supabase'
import { call, type WaTemplate } from '@/lib/whatsapp'
import { isMissingTable, type WaTemplateFull } from '@/lib/whatsappModules'

/**
 * R-WA-05: the template builder (like the WhatsApp CRM prototype) — 8 template types, saved as drafts in the CRM
 * without Meta, submitted for Meta's review when WhatsApp is connected. Meta's component format is built here.
 */
export type TemplateType = 'custom_message' | 'flows' | 'appointment_reminder' | 'limited_time_offer' | 'carousel' | 'catalog' | 'multi_product' | 'call_permission'
export type Category = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'
export type HeaderKind = 'none' | 'text' | 'image' | 'video' | 'document' | 'location'
export type ButtonKind = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'
export interface TButton { type: ButtonKind; text: string; url?: string; urlExample?: string; phone?: string; code?: string }
export interface TCard { body: string; handle?: string; fileName?: string; buttons: TButton[] }
export interface TemplateForm {
  header: { kind: HeaderKind; text?: string; handle?: string; fileName?: string }
  body: string
  examples: Record<string, string>
  footer: string
  buttons: TButton[]
  offerText?: string
  flowId?: string
  flowButton?: string
  catalogButton?: string
  cards?: TCard[]
}
export interface WaTemplateRow {
  id: string; name: string; language: string; category: Category; type: TemplateType; form: TemplateForm
  status: string; meta_id: string | null; rejected_reason: string | null; favorite: boolean; created_by: string | null; created_at: string; updated_at: string
}

export const TEMPLATE_TYPES: { id: TemplateType; label: string; description: string; tint: string; category: Category; needs?: string }[] = [
  { id: 'custom_message', label: 'Custom Message', description: 'Standard template with header, body, footer & buttons', tint: 'bg-blue-50 text-blue-600', category: 'UTILITY' },
  { id: 'flows', label: 'Flows', description: 'WhatsApp flow button template', tint: 'bg-violet-50 text-violet-600', category: 'UTILITY', needs: 'A Flow made in Meta WhatsApp Manager (its Flow ID)' },
  { id: 'appointment_reminder', label: 'Appointment Reminder', description: 'Schedule & confirm cleaning visits', tint: 'bg-emerald-50 text-emerald-600', category: 'UTILITY' },
  { id: 'limited_time_offer', label: 'Limited Time Offer', description: 'Template with expiring offer text', tint: 'bg-rose-50 text-rose-600', category: 'MARKETING' },
  { id: 'carousel', label: 'Carousel', description: 'Multiple cards with images & buttons', tint: 'bg-amber-50 text-amber-600', category: 'MARKETING', needs: 'A sample image for every card' },
  { id: 'catalog', label: 'Catalog', description: 'Product catalog template', tint: 'bg-cyan-50 text-cyan-600', category: 'MARKETING', needs: 'A product catalog connected to the WhatsApp account' },
  { id: 'multi_product', label: 'Multi-product', description: 'Multiple product message', tint: 'bg-indigo-50 text-indigo-600', category: 'MARKETING', needs: 'A product catalog connected to the WhatsApp account' },
  { id: 'call_permission', label: 'Call Permission', description: 'Request call permission template', tint: 'bg-pink-50 text-pink-600', category: 'UTILITY', needs: 'WhatsApp calling switched on for the number' },
]
export const typeMeta = (t: string) => TEMPLATE_TYPES.find(x => x.id === t) || TEMPLATE_TYPES[0]
export const STATUS_TABS = [
  { id: 'all', label: 'All Templates' }, { id: 'favorites', label: 'Favorites' }, { id: 'APPROVED', label: 'Approved' }, { id: 'REJECTED', label: 'Rejected' },
  { id: 'PENDING', label: 'Pending' }, { id: 'PAUSED', label: 'Paused' }, { id: 'DRAFT', label: 'Draft' }, { id: 'DISABLED', label: 'Disabled' }, { id: 'PENDING_DELETION', label: 'Pending Deletion' },
] as const
export const LANGUAGES = [['en', 'English'], ['en_US', 'English (US)'], ['en_GB', 'English (UK)'], ['ar', 'Arabic'], ['ur', 'Urdu'], ['hi', 'Hindi'], ['fr', 'French'], ['ru', 'Russian']] as const

/** A fresh form for a type — cleaning-business wording ready to edit */
export function presetFor(type: TemplateType): { name: string; category: Category; form: TemplateForm } {
  const base: TemplateForm = { header: { kind: 'none' }, body: '', examples: {}, footer: 'Safaeewala Cleaning — Dubai', buttons: [] }
  switch (type) {
    case 'appointment_reminder':
      return { name: 'cleaning_reminder', category: 'UTILITY', form: { ...base, header: { kind: 'text', text: 'Cleaning reminder' }, body: 'Hi {{1}}, this is a reminder of your cleaning on {{2}} at {{3}}. Reply to confirm or reschedule.', examples: { 1: 'Sara', 2: 'Sat 08 Nov', 3: '10:00 AM' }, buttons: [{ type: 'QUICK_REPLY', text: 'Confirm' }, { type: 'QUICK_REPLY', text: 'Reschedule' }] } }
    case 'limited_time_offer':
      return { name: 'deep_clean_offer', category: 'MARKETING', form: { ...base, header: { kind: 'none' }, offerText: 'Deep clean offer', body: 'Hi {{1}}, get 20% off your next deep clean this week only. Use the code below when you book.', examples: { 1: 'Sara' }, buttons: [{ type: 'COPY_CODE', text: 'Copy code', code: 'CLEAN20' }, { type: 'URL', text: 'Book now', url: 'https://safaeewala.com' }] } }
    case 'flows':
      return { name: 'book_a_cleaning', category: 'UTILITY', form: { ...base, body: 'Hi {{1}}, book your next cleaning in a few taps.', examples: { 1: 'Sara' }, flowButton: 'Book now', flowId: '' } }
    case 'carousel':
      return { name: 'our_services', category: 'MARKETING', form: { ...base, footer: '', body: 'Hi {{1}}, here are our most booked services this month:', examples: { 1: 'Sara' }, cards: [
        { body: 'Deep cleaning — the whole home, top to bottom.', buttons: [{ type: 'QUICK_REPLY', text: 'Book deep clean' }] },
        { body: 'Sofa & carpet shampoo — like new in 3 hours.', buttons: [{ type: 'QUICK_REPLY', text: 'Book sofa clean' }] },
      ] } }
    case 'catalog':
      return { name: 'service_catalog', category: 'MARKETING', form: { ...base, body: 'Hi {{1}}, see all our cleaning services and prices in our catalog.', examples: { 1: 'Sara' }, catalogButton: 'View catalog' } }
    case 'multi_product':
      return { name: 'service_bundles', category: 'MARKETING', form: { ...base, header: { kind: 'text', text: 'Popular bundles' }, body: 'Hi {{1}}, pick a bundle that suits your home.', examples: { 1: 'Sara' }, catalogButton: 'View items' } }
    case 'call_permission':
      return { name: 'call_permission', category: 'UTILITY', form: { ...base, body: 'Hi {{1}}, may our team call you on WhatsApp to confirm the details of your cleaning?', examples: { 1: 'Sara' } } }
    default:
      return { name: '', category: 'UTILITY', form: base }
  }
}

/** {{1}}, {{2}} … used in a text, in order */
export const extractVars = (text: string) => [...new Set((text.match(/\{\{(\d+)\}\}/g) || []).map(m => m.slice(2, -2)))].sort((a, b) => Number(a) - Number(b))
export const fillPreview = (text: string, ex: Record<string, string>) => text.replace(/\{\{(\d+)\}\}/g, (m, n) => ex[n] || m)
/** Meta's name rule: small letters, numbers and _ */
export const cleanName = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 512)

function buttonJson(b: TButton) {
  if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url || '', ...(/\{\{1\}\}/.test(b.url || '') ? { example: [b.urlExample || ''] } : {}) }
  if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone || '' }
  if (b.type === 'COPY_CODE') return { type: 'COPY_CODE', example: b.code || '' }
  return { type: 'QUICK_REPLY', text: b.text }
}
function bodyJson(body: string, ex: Record<string, string>) {
  const vars = extractVars(body)
  return { type: 'BODY', text: body, ...(vars.length ? { example: { body_text: [vars.map(v => ex[v] || '')] } } : {}) }
}

/** The builder's fields → Meta's template components */
export function buildComponents(type: TemplateType, f: TemplateForm): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const h = f.header
  if (type !== 'carousel' && type !== 'call_permission') {
    if (h.kind === 'text' && h.text?.trim()) {
      const hv = extractVars(h.text)
      out.push({ type: 'HEADER', format: 'TEXT', text: h.text.trim(), ...(hv.length ? { example: { header_text: hv.map(v => f.examples[v] || '') } } : {}) })
    } else if (h.kind === 'location') out.push({ type: 'HEADER', format: 'LOCATION' })
    else if (h.kind === 'image' || h.kind === 'video' || h.kind === 'document') out.push({ type: 'HEADER', format: h.kind.toUpperCase(), example: { header_handle: [h.handle || ''] } })
  }
  if (type === 'limited_time_offer') out.push({ type: 'limited_time_offer', limited_time_offer: { text: (f.offerText || '').trim(), has_expiration: true } })
  out.push(bodyJson(f.body, f.examples))
  if (f.footer.trim() && type !== 'limited_time_offer' && type !== 'carousel') out.push({ type: 'FOOTER', text: f.footer.trim() })
  if (type === 'carousel') {
    out.push({ type: 'CAROUSEL', cards: (f.cards || []).map(c => ({ components: [
      { type: 'HEADER', format: 'IMAGE', example: { header_handle: [c.handle || ''] } },
      { type: 'BODY', text: c.body },
      ...(c.buttons.length ? [{ type: 'BUTTONS', buttons: c.buttons.map(buttonJson) }] : []),
    ] })) })
    return out
  }
  const special = type === 'flows' ? [{ type: 'FLOW', text: f.flowButton || 'Open', flow_id: f.flowId || '', flow_action: 'navigate' }]
    : type === 'catalog' ? [{ type: 'CATALOG', text: f.catalogButton || 'View catalog' }]
    : type === 'multi_product' ? [{ type: 'MPM', text: f.catalogButton || 'View items' }] : []
  const buttons = [...f.buttons.filter(b => b.type === 'COPY_CODE' || b.text.trim()).map(buttonJson), ...special]
  if (buttons.length) out.push({ type: 'BUTTONS', buttons })
  if (type === 'call_permission') out.push({ type: 'call_permission_request' })
  return out
}

/** What still stops Meta from accepting the template */
export function validateTemplate(type: TemplateType, name: string, category: Category, f: TemplateForm): string[] {
  const e: string[] = []
  if (!/^[a-z0-9_]{1,512}$/.test(name)) e.push('Name: small letters, numbers and _ only')
  if (!f.body.trim()) e.push('Body is required')
  if (f.body.length > 1024) e.push('Body: at most 1024 characters')
  const vars = extractVars(`${f.header.kind === 'text' ? f.header.text || '' : ''} ${f.body}`)
  vars.forEach((v, i) => { if (Number(v) !== i + 1) e.push('Variables must be {{1}}, {{2}} … in order') })
  if (vars.some(v => !String(f.examples[v] || '').trim())) e.push('Give an example for every {{n}} (Meta needs them for review)')
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(f.body)) e.push('The body cannot start or end with a {{n}}')
  if (f.header.kind === 'text' && (f.header.text || '').length > 60) e.push('Header: at most 60 characters')
  if (['image', 'video', 'document'].includes(f.header.kind) && !f.header.handle) e.push('Upload a sample file for the header')
  if (f.footer.length > 60) e.push('Footer: at most 60 characters')
  if (f.buttons.length > 10) e.push('At most 10 buttons')
  f.buttons.forEach(b => {
    if (b.type !== 'COPY_CODE' && (!b.text.trim() || b.text.length > 25)) e.push('Every button needs a text of up to 25 characters')
    if (b.type === 'URL' && !/^https?:\/\//.test(b.url || '')) e.push('A URL button needs a link starting with https://')
    if (b.type === 'PHONE_NUMBER' && !/^\+?\d{8,15}$/.test((b.phone || '').replace(/\s/g, ''))) e.push('A call button needs a phone number with country code')
    if (b.type === 'COPY_CODE' && !(b.code || '').trim()) e.push('A copy-code button needs the code')
  })
  if (type === 'limited_time_offer' && category !== 'MARKETING') e.push('A limited-time offer must be Marketing')
  if (type === 'limited_time_offer' && !(f.offerText || '').trim()) e.push('Offer text is required')
  if (type === 'flows' && !(f.flowId || '').trim()) e.push('Flow ID is required (Meta → WhatsApp Manager → Flows)')
  if (type === 'carousel') {
    const cards = f.cards || []
    if (cards.length < 2 || cards.length > 10) e.push('A carousel has 2 to 10 cards')
    if (cards.some(c => !c.body.trim() || !c.handle)) e.push('Every card needs text and a sample image')
  }
  return [...new Set(e)]
}

// ── storage (Supabase) ──
export async function loadTemplates(): Promise<WaTemplateRow[] | null> {
  const { data, error } = await supabase.from('wa_templates').select('*').order('updated_at', { ascending: false }).limit(1000)
  if (error) { if (isMissingTable(error)) return null; throw error }
  return (data || []) as WaTemplateRow[]
}
export async function saveTemplate(row: Partial<WaTemplateRow> & { name: string; language: string; category: Category; type: TemplateType; form: TemplateForm }) {
  const body = { ...row, updated_at: new Date().toISOString() }
  const q = row.id ? supabase.from('wa_templates').update(body).eq('id', row.id) : supabase.from('wa_templates').insert(body)
  const { data, error } = await q.select().single()
  if (error) throw new Error(/duplicate key|unique/i.test(error.message) ? 'A template with this name and language already exists' : error.message)
  return data as WaTemplateRow
}
export async function deleteTemplateRow(id: string) {
  const { error } = await supabase.from('wa_templates').delete().eq('id', id)
  if (error) throw error
}

/** Meta's templates → builder form (for importing templates made in Meta) */
export function formFromMeta(t: WaTemplate): TemplateForm {
  const c = (type: string) => t.components.find(x => x.type === type) as { text?: string; format?: string; buttons?: { type: string; text: string; url?: string; phone_number?: string }[] } | undefined
  const head = c('HEADER')
  const kind: HeaderKind = !head ? 'none' : head.format === 'TEXT' ? 'text' : (String(head.format || '').toLowerCase() as HeaderKind)
  return {
    header: { kind, text: head?.text },
    body: c('BODY')?.text || '', examples: {}, footer: c('FOOTER')?.text || '',
    buttons: (c('BUTTONS')?.buttons || []).filter(b => ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'].includes(b.type)).map(b => ({ type: b.type as ButtonKind, text: b.text, url: b.url, phone: b.phone_number })),
  }
}

// ── server (Meta) ──
export const waSubmitTemplate = (t: { name: string; language: string; category: Category; components: Record<string, unknown>[] }) =>
  call<{ id: string; status: string }>('/api/whatsapp/templates/submit', { method: 'POST', body: JSON.stringify(t) })
export const waTemplateMedia = (file: { base64: string; mime: string; name: string }) =>
  call<{ handle: string }>('/api/whatsapp/template-media', { method: 'POST', body: JSON.stringify(file) })
export type MetaTemplate = WaTemplateFull
