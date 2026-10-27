import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { FluentFormLead, LeadStatus } from '@/types'
import * as XLSX from 'xlsx'

const STORAGE_KEY = 'safaeewala_fluent_form_leads'

/* ─── Default Sample Leads from Website Fluent Forms (Empty by default: only real live data) ─── */
export const DEFAULT_FLUENT_FORM_LEADS: FluentFormLead[] = []

/* ─── Detect Dummy / Seed Leads to Ensure Only Real Live Data ─── */
export function isDummyLead(lead: Partial<FluentFormLead> | null | undefined): boolean {
  if (!lead) return false
  const dummyIds = [
    'lead-ff-101', 'lead-ff-102', 'lead-ff-103', 'lead-ff-104', 'lead-ff-105',
    'lead-ff-106', 'lead-ff-107', 'lead-ff-108', 'lead-ff-109', 'lead-ff-110'
  ]
  if (lead.id && dummyIds.includes(lead.id)) return true
  if (lead.id && /^lead-ff-10\d$/.test(lead.id)) return true
  // Demo leads are recognised by their ids only — matching by name would hide real customers
  // who happen to share a demo name (AUD-41)
  return false
}

/* ─── Normalize Page Source ─── */
export function cleanPageSource(url: string): string {
  if (!url) return '/home'
  try {
    const parsed = new URL(url, 'https://safaeewala.com')
    let path = parsed.pathname
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1)
    }
    if (!path || path === '/' || path === '/home') {
      if (parsed.searchParams.get('preview_id')) {
        return `Form #${parsed.searchParams.get('preview_id')} (Preview)`
      }
      if (parsed.searchParams.get('fluent_forms_pages')) {
        return `Website Booking Form`
      }
      return '/home'
    }
    return path
  } catch {
    const clean = url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0]
    return clean || '/home'
  }
}

/* ─── Normalize Category from Fluent Forms ─── */
export function cleanCategory(cat: string, serviceName: string = '', pageUrl: string = ''): string {
  const text = `${cat} ${serviceName} ${pageUrl}`.toLowerCase()
  if (text.includes('move') || text.includes('relocation') || text.includes('tenancy')) return 'Move In / Out'
  if (text.includes('sofa') || text.includes('carpet') || text.includes('curtain') || text.includes('mattress') || text.includes('upholstery')) return 'Sofa & Carpet'
  if (text.includes('villa') || text.includes('house') || text.includes('mansion') || text.includes('exterior') || text.includes('facade') || text.includes('pressure')) return 'Villa Cleaning'
  if (text.includes('deep') || text.includes('steam') || text.includes('kitchen degrease')) return 'Deep Cleaning'
  if (text.includes('office') || text.includes('commercial') || text.includes('warehouse')) return 'Office Cleaning'
  if (text.includes('duct') || text.includes('ac')) return 'AC Duct'
  if (text.includes('window') || text.includes('glass')) return 'Window Cleaning'
  if (text.includes('maid') || text.includes('hourly') || text.includes('regular') || text.includes('general')) return 'General Cleaning'
  return cat.trim() || 'General Cleaning'
}

/* ─── Normalize Property Type According to Form Submissions ─── */
export function resolvePropertyType(lead: {
  property_type?: string
  address?: string
  service?: string
  category?: string
  message?: string
  form_title?: string
  raw_data?: Record<string, any>
}): string {
  // 1. Check direct property_type if provided and not a placeholder
  if (lead.property_type && lead.property_type.trim()) {
    const pt = lead.property_type.trim()
    const lpt = pt.toLowerCase()
    if (lpt !== 'not specified' && lpt !== 'undefined' && pt !== 'null' && pt !== '') {
      // Standardize casing if matching known types, otherwise preserve form submission text
      if (lpt === 'villa' || lpt.includes('villa') || lpt.includes('mansion')) return 'Villa'
      if (lpt === 'house' || lpt.includes('house') || lpt.includes('home')) return 'House'
      if (lpt === 'townhouse' || lpt.includes('town house') || lpt.includes('townhouse')) return 'Townhouse'
      if (lpt === 'penthouse' || lpt.includes('penthouse')) return 'Penthouse'
      if (lpt === 'office' || lpt.includes('office') || lpt.includes('commercial')) return 'Office'
      if (lpt === 'studio' || lpt.includes('studio')) return 'Studio'
      if (lpt === 'apartment' || lpt.includes('apartment') || lpt.includes('flat') || lpt.includes('bhk')) return 'Apartment'
      return pt
    }
  }

  // 2. Check raw form submission payload for dropdown_1 or custom property keys
  if (lead.raw_data && typeof lead.raw_data === 'object') {
    const raw = lead.raw_data
    const val = raw.property_type || raw.dropdown_1 || raw.property || raw.propertyType || raw.type_of_property || raw.property_size || raw.building_type
    if (val && typeof val === 'string' && val.trim() && val.trim().toLowerCase() !== 'not specified') {
      const trimmed = val.trim()
      const lval = trimmed.toLowerCase()
      if (lval === 'villa' || lval.includes('villa')) return 'Villa'
      if (lval === 'house' || lval.includes('house')) return 'House'
      if (lval === 'townhouse' || lval.includes('town house')) return 'Townhouse'
      if (lval === 'penthouse' || lval.includes('penthouse')) return 'Penthouse'
      if (lval === 'office' || lval.includes('commercial')) return 'Office'
      if (lval === 'studio' || lval.includes('studio')) return 'Studio'
      if (lval === 'apartment' || lval.includes('flat') || lval.includes('bhk')) return 'Apartment'
      return trimmed
    }
  }

  // 3. Fallback to parsing message or address if specifically mentioned
  const combined = `${lead.address || ''} ${lead.message || ''}`.toLowerCase()
  if (combined.includes('villa') || combined.includes('mansion') || combined.includes('compound')) return 'Villa'
  if (combined.includes('townhouse') || combined.includes('town house')) return 'Townhouse'
  if (combined.includes('penthouse')) return 'Penthouse'
  if (combined.includes('office') || combined.includes('commercial') || combined.includes('shop') || combined.includes('warehouse')) return 'Office'
  if (combined.includes('studio')) return 'Studio'
  if (combined.includes('apartment') || combined.includes('flat')) return 'Apartment'

  return 'Not Specified'
}

export interface ParsedFluentFormPayload {
  client_name: string
  phone: string
  service_needed: string
  property_type: string
  area_location: string
  preferred_date: string
  source_url: string
  raw_payload: any
}

/**
 * Resilient Multi-Key Fallback Parser for Fluent Forms Payloads
 * Supports both custom field names (your_name, service_needed, etc.)
 * and default WordPress Fluent Forms field names (name object, dropdown, dropdown_1, input_text, date, _wp_http_referer).
 */
export function parseFluentFormPayload(payload: any): ParsedFluentFormPayload {
  if (!payload || typeof payload !== 'object') {
    return {
      client_name: 'Guest',
      phone: '',
      service_needed: 'General Cleaning',
      property_type: 'Not Specified',
      area_location: '',
      preferred_date: '',
      source_url: 'Website Form',
      raw_payload: payload,
    }
  }

  // Handle nested containers if sent via Fluent Forms webhook or WP integrations
  const sub = (payload.__submission && typeof payload.__submission === 'object') ? payload.__submission : {}
  const userInputs = (sub.user_inputs && typeof sub.user_inputs === 'object') ? sub.user_inputs : {}
  const inputs = (payload.inputs && typeof payload.inputs === 'object') ? payload.inputs : {}
  const data = (payload.data && typeof payload.data === 'object') ? payload.data : {}
  const p: Record<string, any> = Object.assign({}, sub, data, inputs, userInputs, payload)

  // 1. Client Name (Handle object or string)
  let name = 'Guest'
  if (typeof p.your_name === 'string' && p.your_name.trim()) {
    name = p.your_name.trim()
  } else if (p.name && typeof p.name === 'object') {
    const first = (p.name.first_name || '').trim()
    const last = (p.name.last_name || '').trim()
    name = `${first} ${last}`.trim() || 'Guest'
  } else if (typeof p.name === 'string' && p.name.trim()) {
    name = p.name.trim()
  } else if (typeof p.first_name === 'string' && p.first_name.trim()) {
    const last = typeof p.last_name === 'string' ? p.last_name.trim() : ''
    name = `${p.first_name.trim()} ${last}`.trim() || 'Guest'
  } else if (typeof p.client_name === 'string' && p.client_name.trim()) {
    name = p.client_name.trim()
  }

  // 2. Extract Phone & WhatsApp
  const phone = (p.phone || p.phone_whatsapp || p.inputs_phone || p.mobile || '').toString().trim()

  // 3. Extract Service Needed / Category
  const service = (p.service_needed || p.dropdown || p.service || 'General Cleaning').toString().trim() || 'General Cleaning'

  // 4. Extract Property Type
  const propertyType = (p.property_type || p.dropdown_1 || 'Not Specified').toString().trim() || 'Not Specified'

  // 5. Extract Location / Area / Address
  const areaLocation = (p.area_location || p.input_text || p.address || '').toString().trim()

  // 6. Extract Preferred Booking Date
  const preferredDate = (p.preferred_date || p.date || '').toString().trim()

  // 7. Extract Source URL / Lead Source
  const sourceUrl = (p.source_url || p._wp_http_referer || 'Website Form').toString().trim() || 'Website Form'

  return {
    client_name: name,
    phone,
    service_needed: service,
    property_type: propertyType,
    area_location: areaLocation,
    preferred_date: preferredDate,
    source_url: sourceUrl,
    raw_payload: payload,
  }
}

/* ─── Extract and Normalize Fluent Forms Webhook Payload ─── */
export function parseFluentFormWebhook(payload: Record<string, any>): FluentFormLead {
  const parsed = parseFluentFormPayload(payload)

  const sub = (payload && payload.__submission && typeof payload.__submission === 'object') ? payload.__submission : {}
  const merged: Record<string, any> = Object.assign({}, sub, payload?.data, payload?.inputs, payload?.user_inputs, payload)

  const rawPhone = parsed.phone || '+971 50 000 0000'
  const cleanDigits = rawPhone.replace(/[^0-9+]/g, '')
  const whatsapp = cleanDigits ? (cleanDigits.startsWith('+') ? cleanDigits : `+${cleanDigits}`) : undefined

  const rawService = parsed.service_needed || 'General Cleaning'
  const category = cleanCategory(rawService, rawService, parsed.source_url)

  const rawPropertyType = parsed.property_type || 'Not Specified'
  const address = parsed.area_location || 'Dubai'
  const area = address

  const property_type = resolvePropertyType({
    property_type: rawPropertyType !== 'Not Specified' ? rawPropertyType : undefined,
    address,
    service: rawService,
    category,
    message: String(merged.message || merged.notes || ''),
    form_title: String(payload?.form_title || merged.form_title || ''),
  })

  const preferred_date = parsed.preferred_date || undefined
  const source_url = (parsed.source_url && parsed.source_url !== 'Website Form')
    ? parsed.source_url
    : (sub.source_url || 'https://safaeewala.com')
  const page_source = cleanPageSource(source_url)

  const email = String(merged.email || merged.user_email || merged.your_email || '').trim()
  const message = String(merged.message || merged.notes || merged.details || merged.requirements || '').trim()
  const preferred_time = String(merged.preferred_time || merged.time || merged.slot || '').trim() || undefined

  const estimated_value = Number(merged.estimated_value || merged.price || merged.total || merged.calculated_price) || 500
  const id = `lead-ff-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  return {
    id,
    created_at: sub.created_at ? new Date(sub.created_at).toISOString() : new Date().toISOString(),
    form_id: Number(sub.form_id || payload?.form_id || merged.form_id || payload?.__fluent_form_embded_post_id) || 40,
    form_title: String(payload?.form_title || merged.form_title || (merged.form_type ? `${merged.form_type} Request` : 'Website Cleaning Form')),
    entry_id: sub.id || payload?.entry_id || merged.entry_id || undefined,
    source_url,
    page_source,
    category,
    client_name: parsed.client_name,
    email,
    phone: rawPhone,
    whatsapp,
    address,
    area,
    property_type,
    preferred_date,
    preferred_time,
    service: rawService,
    message,
    estimated_value,
    status: 'new',
    raw_data: payload,
  }
}

/* ─── Auto-Heal / Normalize Stored Lead using raw_data ─── */
export function normalizeLeadWithRaw(lead: FluentFormLead): FluentFormLead {
  if (!lead.raw_data || typeof lead.raw_data !== 'object') {
    return lead
  }
  const extracted = parseFluentFormWebhook(lead.raw_data)
  return {
    ...lead,
    client_name: (extracted.client_name && extracted.client_name !== 'Guest' && extracted.client_name !== 'Website Lead') ? extracted.client_name : lead.client_name,
    phone: (extracted.phone && extracted.phone !== '+971 50 000 0000') ? extracted.phone : lead.phone,
    whatsapp: extracted.whatsapp || lead.whatsapp,
    service: (extracted.service && extracted.service !== 'General Cleaning') ? extracted.service : (lead.service || extracted.service),
    property_type: (extracted.property_type && extracted.property_type !== 'Not Specified') ? extracted.property_type : (lead.property_type || extracted.property_type),
    area: (extracted.area && extracted.area !== 'Dubai') ? extracted.area : (lead.area || extracted.area),
    address: extracted.address || lead.address,
    preferred_date: extracted.preferred_date || lead.preferred_date,
    preferred_time: extracted.preferred_time || lead.preferred_time,
    page_source: (extracted.page_source && extracted.page_source !== '/home') ? extracted.page_source : (lead.page_source || extracted.page_source),
    category: extracted.category || lead.category,
    entry_id: extracted.entry_id || lead.entry_id,
  }
}

/* ─── Leads Data Manager (Self-Hosted VPS Microservice + Supabase + LocalStorage Fallback) ─── */

// VPS writes that failed (offline / server restart) are kept and replayed on the next load,
// instead of being silently lost (AUD-42)
const LEAD_OUTBOX_KEY = 'safaeewala_fluent_form_outbox'
type LeadWrite = { url: string; method: 'POST' | 'PATCH' | 'DELETE'; body?: unknown; at: string }

const readLeadOutbox = (): LeadWrite[] => {
  try { return JSON.parse(localStorage.getItem(LEAD_OUTBOX_KEY) || '[]') as LeadWrite[] } catch { return [] }
}
const writeLeadOutbox = (list: LeadWrite[]) => {
  try { localStorage.setItem(LEAD_OUTBOX_KEY, JSON.stringify(list)) } catch { /* quota */ }
}

async function sendLeadWrite(w: Omit<LeadWrite, 'at'>): Promise<boolean> {
  try {
    const res = await fetch(w.url, {
      method: w.method,
      headers: w.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: w.body !== undefined ? JSON.stringify(w.body) : undefined,
    })
    return res.ok
  } catch {
    return false
  }
}

async function vpsWrite(w: Omit<LeadWrite, 'at'>): Promise<void> {
  if (await sendLeadWrite(w)) return
  console.error(`[fluentForms] ${w.method} ${w.url} failed — queued for retry`)
  writeLeadOutbox([...readLeadOutbox(), { ...w, at: new Date().toISOString() }])
}

async function flushLeadOutbox(): Promise<void> {
  const pending = readLeadOutbox()
  if (pending.length === 0) return
  const left: LeadWrite[] = []
  for (const w of pending) if (!(await sendLeadWrite(w))) left.push(w)
  writeLeadOutbox(left)
}

/** Supabase is a secondary copy; failures are logged, not fatal */
async function supabaseLeadWrite(op: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  try {
    const { error } = await op
    if (error) console.warn('[fluentForms] Supabase copy not updated:', error.message)
  } catch (err) {
    console.warn('[fluentForms] Supabase copy not updated:', err)
  }
}

export async function fetchFluentFormLeads(): Promise<FluentFormLead[]> {
  await flushLeadOutbox()

  // Read both stores and merge by id (VPS wins) so a lead that exists in only one of them still shows
  const [vps, db] = await Promise.all([
    fetch('/api/webhook/fluent-forms')
      .then(res => (res.ok ? res.json() : null))
      .then(data => (Array.isArray(data) ? (data as FluentFormLead[]) : null))
      .catch(() => null),
    Promise.resolve(supabase.from('fluent_form_leads').select('*').order('created_at', { ascending: false }))
      .then(({ data, error }) => (!error && Array.isArray(data) ? (data as FluentFormLead[]) : null))
      .catch(() => null),
  ])

  if (vps || db) {
    const byId = new Map<string, FluentFormLead>()
    ;(db || []).forEach(l => byId.set(l.id, l))
    ;(vps || []).forEach(l => byId.set(l.id, { ...byId.get(l.id), ...l }))
    const realData = Array.from(byId.values())
      .filter(l => !isDummyLead(l))
      .map(l => normalizeLeadWithRaw(l))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(realData))
    return realData
  }

  // Both unreachable — use this browser's last copy
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        return (parsed as FluentFormLead[]).filter(l => !isDummyLead(l)).map(l => normalizeLeadWithRaw(l))
      }
    }
  } catch { /* corrupt cache */ }
  return []
}

export function saveLeadsLocally(leads: FluentFormLead[]) {
  try {
    const realOnly = leads.filter(l => !isDummyLead(l))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(realOnly))
  } catch { /* quota */ }
}

export async function insertFluentFormLead(lead: FluentFormLead): Promise<void> {
  await vpsWrite({ url: '/api/webhook/fluent-forms', method: 'POST', body: lead })
  await supabaseLeadWrite(supabase.from('fluent_form_leads').insert(lead))
}

export async function updateFluentFormLead(id: string, updates: Partial<FluentFormLead>): Promise<void> {
  await vpsWrite({ url: `/api/webhook/fluent-forms/${id}`, method: 'PATCH', body: updates })
  await supabaseLeadWrite(supabase.from('fluent_form_leads').update(updates).eq('id', id))
}

export async function updateFluentFormLeadStatus(id: string, status: LeadStatus, booking_id?: string): Promise<void> {
  const patch: Partial<FluentFormLead> = { status }
  if (booking_id) patch.booking_id = booking_id
  await updateFluentFormLead(id, patch)
}

export async function deleteFluentFormLeadRemote(id: string): Promise<void> {
  await vpsWrite({ url: `/api/webhook/fluent-forms/${id}`, method: 'DELETE' })
  await supabaseLeadWrite(supabase.from('fluent_form_leads').delete().eq('id', id))
}

/* ─── Export Leads to XLSX ─── */
export function exportLeadsToXLSX(leads: FluentFormLead[]) {
  const rows = leads.map(l => ({
    'Lead ID': l.id,
    'Date & Time': new Date(l.created_at).toLocaleString(),
    'Client Name': l.client_name,
    'Phone': l.phone,
    'Email': l.email,
    'Page Source': l.page_source,
    'Source URL': l.source_url,
    'Category': l.category,
    'Service Requested': l.service || '',
    'Area / Location': l.area || l.address || '',
    'Property Type': l.property_type || '',
    'Preferred Date': l.preferred_date || '',
    'Preferred Time': l.preferred_time || '',
    'Estimated Value (AED)': l.estimated_value || 0,
    'Status': l.status.toUpperCase(),
    'Form Title': l.form_title || '',
    'Message / Requirements': l.message || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Website Leads')
  XLSX.writeFile(wb, `fluent-forms-leads-${new Date().toISOString().split('T')[0]}.xlsx`)
}

/* ─── Webhook Configuration & cURL Helper ─── */
export function getWebhookConfig() {
  const isBrowser = typeof window !== 'undefined'
  // When viewed from VPS, origin is http://187.77.116.14:8080
  const vpsHost = (isBrowser && window.location.hostname && !['localhost', '127.0.0.1'].includes(window.location.hostname))
    ? `${window.location.protocol}//${window.location.host}`
    : 'http://187.77.116.14:8080'
  
  const restEndpoint = `${vpsHost}/api/webhook/fluent-forms`

  // Sample payload matches EXACT WordPress Fluent Form fields shown in screenshot:
  // 1. Your Name
  // 2. Phone / Whatsapp
  // 3. Service Needed
  // 4. Property Type
  // 5. Area / Location
  // 6. Preferred Date
  const sampleCurl = `curl -X POST "${restEndpoint}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "your_name": "Tariq Mehmood",
    "phone": "+971 50 123 4567",
    "service_needed": "Deep Cleaning",
    "property_type": "Apartment",
    "area_location": "Shoreline Apartments # 6",
    "preferred_date": "2026-10-25"
  }'`

  return {
    vpsHost,
    restEndpoint,
    sampleCurl,
  }
}

/* ─── Unread / New Form Dynamic Counter & Reset on Read Logic ─── */
const READ_TIMESTAMP_KEY = 'safaeewala_fluent_forms_last_read_time'
const READ_IDS_KEY = 'safaeewala_fluent_forms_read_ids'

export function getReadFluentFormLeadIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function markFluentFormsAsRead(leads?: FluentFormLead[] | string[]): void {
  try {
    const now = Date.now()
    localStorage.setItem(READ_TIMESTAMP_KEY, String(now))

    let idsToAdd: string[] = []
    if (leads && leads.length > 0) {
      if (typeof leads[0] === 'string') {
        idsToAdd = leads as string[]
      } else {
        idsToAdd = (leads as FluentFormLead[]).map(l => l.id)
      }
    }

    const existing = getReadFluentFormLeadIds()
    const merged = Array.from(new Set([...existing, ...idsToAdd]))
    localStorage.setItem(READ_IDS_KEY, JSON.stringify(merged))

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('safaeewala_fluent_forms_read'))
    }
  } catch {}
}

export function markSingleFluentFormAsRead(id: string): void {
  try {
    const existing = getReadFluentFormLeadIds()
    if (!existing.includes(id)) {
      existing.push(id)
      localStorage.setItem(READ_IDS_KEY, JSON.stringify(existing))
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('safaeewala_fluent_forms_read'))
    }
  } catch {}
}

export function countUnreadFluentForms(leads: FluentFormLead[]): number {
  if (!leads || leads.length === 0) return 0

  const readIds = getReadFluentFormLeadIds()
  const readTimestampStr = localStorage.getItem(READ_TIMESTAMP_KEY)
  const lastReadTime = readTimestampStr ? Number(readTimestampStr) : 0

  return leads.filter(lead => {
    if (isDummyLead(lead)) return false
    if (readIds.includes(lead.id)) return false
    if (lead.status && lead.status !== 'new') return false

    if (lastReadTime > 0) {
      const createdTime = new Date(lead.created_at).getTime()
      if (!isNaN(createdTime)) {
        return createdTime > lastReadTime
      }
    }
    return lead.status === 'new'
  }).length
}

export function useFluentFormsUnreadCount() {
  const [unreadCount, setUnreadCount] = useState<number>(0)

  useEffect(() => {
    let mounted = true

    const checkCount = async () => {
      try {
        const leads = await fetchFluentFormLeads()
        if (mounted) {
          const count = countUnreadFluentForms(leads)
          setUnreadCount(count)
        }
      } catch {}
    }

    checkCount()

    const handleRead = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const leads = raw ? JSON.parse(raw) : []
        setUnreadCount(countUnreadFluentForms(leads))
      } catch {
        setUnreadCount(0)
      }
    }

    window.addEventListener('safaeewala_fluent_forms_read', handleRead)
    window.addEventListener('storage', handleRead)
    const interval = setInterval(checkCount, 12000)

    return () => {
      mounted = false
      window.removeEventListener('safaeewala_fluent_forms_read', handleRead)
      window.removeEventListener('storage', handleRead)
      clearInterval(interval)
    }
  }, [])

  return unreadCount
}
