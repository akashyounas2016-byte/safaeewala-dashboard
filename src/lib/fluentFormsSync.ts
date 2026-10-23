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
  const dummyNames = [
    'Dr. Tariq Al-Mansoor', 'Elena Rostova', 'Rashid Al-Nuaimi', 'Sarah Jenkins',
    'Mohammad Al-Qasimi', 'Vikram Patel', 'Fatima Al-Zahra', 'Marcus Dupont',
    'Sheikha Maryam', 'Rahul Khanna'
  ]
  if (lead.client_name && dummyNames.includes(lead.client_name.trim())) return true
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
    return path || '/home'
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
  if (text.includes('villa') || text.includes('exterior') || text.includes('facade') || text.includes('pressure')) return 'Villa Cleaning'
  if (text.includes('deep') || text.includes('steam') || text.includes('kitchen degrease')) return 'Deep Cleaning'
  if (text.includes('office') || text.includes('commercial')) return 'Office Cleaning'
  if (text.includes('duct') || text.includes('ac')) return 'AC Duct'
  if (text.includes('window') || text.includes('glass')) return 'Window Cleaning'
  if (text.includes('maid') || text.includes('hourly') || text.includes('regular') || text.includes('general')) return 'General Cleaning'
  return cat.trim() || 'General Cleaning'
}

/* ─── Normalize Property Type ─── */
export function resolvePropertyType(lead: {
  property_type?: string
  address?: string
  service?: string
  category?: string
  message?: string
  form_title?: string
}): string {
  if (lead.property_type && lead.property_type.trim()) return lead.property_type.trim()
  const combined = `${lead.address || ''} ${lead.service || ''} ${lead.category || ''} ${lead.message || ''} ${lead.form_title || ''}`.toLowerCase()
  if (combined.includes('villa') || combined.includes('mansion') || combined.includes('compound')) return 'Villa'
  if (combined.includes('townhouse') || combined.includes('town house')) return 'Townhouse'
  if (combined.includes('penthouse')) return 'Penthouse'
  if (combined.includes('office') || combined.includes('commercial') || combined.includes('shop') || combined.includes('warehouse')) return 'Office'
  if (combined.includes('apartment') || combined.includes('apt') || combined.includes('flat') || combined.includes('tower') || combined.includes('studio') || combined.includes('bhk') || combined.includes('1 bedroom') || combined.includes('2 bedroom') || combined.includes('3 bedroom')) return 'Apartment'
  return 'Apartment'
}

/* ─── Extract and Normalize Fluent Forms Webhook Payload ─── */
export function parseFluentFormWebhook(payload: Record<string, any>): FluentFormLead {
  // Support nested inputs (e.g. payload.inputs || payload.data || payload)
  const data = payload.inputs || payload.data || payload

  // 1. Client Name (supports: your_name, names, full_name, client_name, name, etc.)
  let client_name = ''
  if (data.names && typeof data.names === 'object') {
    client_name = [data.names.first_name, data.names.middle_name, data.names.last_name].filter(Boolean).join(' ').trim()
  }
  if (!client_name) {
    client_name = String(
      data.your_name ||
      data['your-name'] ||
      data['Your Name'] ||
      data.full_name ||
      data.client_name ||
      data.name ||
      data.first_name ||
      data.customer_name ||
      data.input_text ||
      'Website Lead'
    ).trim()
  }

  // 2. Phone / WhatsApp
  const rawPhone = String(
    data.phone_whatsapp ||
    data['phone_whatsapp'] ||
    data['Phone / Whatsapp'] ||
    data['phone / whatsapp'] ||
    data.phone ||
    data.whatsapp ||
    data.mobile ||
    data.phone_number ||
    data.contact_number ||
    data['your-phone'] ||
    data.numeric_field ||
    '+971 50 000 0000'
  ).trim()
  const phone = rawPhone
  const whatsapp = rawPhone ? rawPhone.replace(/[^0-9+]/g, '') : undefined

  // 3. Service Needed
  const rawService = String(
    data.service_needed ||
    data['service_needed'] ||
    data['Service Needed'] ||
    data.service ||
    data.service_type ||
    data.cleaning_service ||
    data.selected_service ||
    data.dropdown ||
    data.category ||
    'Deep Cleaning'
  ).trim()

  // 4. Property Type
  const rawPropType = String(
    data.property_type ||
    data['property_type'] ||
    data['Property Type'] ||
    data.property ||
    data.building_type ||
    data.dropdown_1 ||
    data.type ||
    'Apartment'
  ).trim()

  // 5. Area / Location
  const address = String(
    data.area_location ||
    data['area_location'] ||
    data['Area / Location'] ||
    data.address ||
    data.property_address ||
    data.location ||
    data.villa_apt ||
    data.area ||
    data.community ||
    'Dubai'
  ).trim()
  const area = address

  // 6. Preferred Date
  const preferred_date = String(
    data.preferred_date ||
    data['preferred_date'] ||
    data['Preferred Date'] ||
    data.date ||
    data.booking_date ||
    data.datetime ||
    ''
  ).trim() || undefined

  // 7. Page source & URL
  const source_url = String(data.source_url || data.page_url || data.embedded_url || data._wp_http_referer || payload.source_url || 'https://safaeewala.com').trim()
  const page_source = cleanPageSource(source_url)
  const rawCat = String(data.category || data.form_category || rawService).trim()
  const category = cleanCategory(rawCat, rawService, source_url)

  const property_type = resolvePropertyType({
    property_type: rawPropType,
    address,
    service: rawService,
    category,
    message: String(data.message || ''),
    form_title: String(payload.form_title || data.form_title || ''),
  })

  // Value & Timing
  const estimated_value = Number(data.estimated_value || data.price || data.total || data.calculated_price) || 500
  const preferred_time = String(data.preferred_time || data.time || data.slot || '').trim() || undefined
  const email = String(data.email || data.user_email || data['your-email'] || '').trim()
  const message = String(data.message || data.notes || data.details || data.requirements || data.comment || '').trim()

  const id = `lead-ff-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  return {
    id,
    created_at: new Date().toISOString(),
    form_id: payload.form_id || data.form_id || 40,
    form_title: String(payload.form_title || data.form_title || data.form_name || 'Website Cleaning Form'),
    entry_id: payload.entry_id || data.entry_id,
    source_url,
    page_source,
    category,
    client_name,
    email,
    phone,
    whatsapp,
    address,
    area,
    property_type,
    preferred_date,
    preferred_time,
    service: rawService || `${category} Service`,
    message,
    estimated_value,
    status: 'new',
    raw_data: payload,
  }
}

/* ─── Leads Data Manager (Self-Hosted VPS Microservice + Supabase + LocalStorage Fallback) ─── */
export async function fetchFluentFormLeads(): Promise<FluentFormLead[]> {
  // 1. Try our direct self-hosted VPS Webhook API
  try {
    const res = await fetch('/api/webhook/fluent-forms')
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) {
        const realData = (data as FluentFormLead[]).filter(l => !isDummyLead(l))
        localStorage.setItem(STORAGE_KEY, JSON.stringify(realData))
        return realData
      }
    }
  } catch {}

  // 2. Try Supabase if configured (optional fallback)
  try {
    const { data, error } = await supabase
      .from('fluent_form_leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data && Array.isArray(data) && data.length > 0) {
      const realData = (data as FluentFormLead[]).filter(l => !isDummyLead(l))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(realData))
      return realData
    }
  } catch {}

  // 3. Fallback to localStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        const realSaved = (parsed as FluentFormLead[]).filter(l => !isDummyLead(l))
        return realSaved
      }
    }
  } catch {}

  // Empty state by default — only real live webhook data
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
  } catch {}
  return []
}

export function saveLeadsLocally(leads: FluentFormLead[]) {
  try {
    const realOnly = leads.filter(l => !isDummyLead(l))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(realOnly))
  } catch {}
}

export async function insertFluentFormLead(lead: FluentFormLead): Promise<void> {
  // 1. Post to self-hosted webhook server
  try {
    await fetch('/api/webhook/fluent-forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    })
  } catch {}

  // 2. Post to Supabase if available
  try {
    await supabase.from('fluent_form_leads').insert(lead)
  } catch {}
}

export async function updateFluentFormLeadStatus(id: string, status: LeadStatus, booking_id?: string): Promise<void> {
  const patch: any = { status }
  if (booking_id) patch.booking_id = booking_id

  // 1. Update on self-hosted VPS endpoint
  try {
    await fetch(`/api/webhook/fluent-forms/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  } catch {}

  // 2. Update on Supabase if available
  try {
    await supabase.from('fluent_form_leads').update(patch).eq('id', id)
  } catch {}
}

export async function deleteFluentFormLeadRemote(id: string): Promise<void> {
  // 1. Delete on self-hosted VPS endpoint
  try {
    await fetch(`/api/webhook/fluent-forms/${id}`, { method: 'DELETE' })
  } catch {}

  // 2. Delete on Supabase if available
  try {
    await supabase.from('fluent_form_leads').delete().eq('id', id)
  } catch {}
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
