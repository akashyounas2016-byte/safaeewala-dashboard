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

  // Client Name extraction
  let client_name = ''
  if (data.names && typeof data.names === 'object') {
    client_name = [data.names.first_name, data.names.middle_name, data.names.last_name].filter(Boolean).join(' ').trim()
  }
  if (!client_name) {
    client_name = String(
      data.full_name || data.client_name || data.name || data['your-name'] || data.first_name || data.customer_name || 'Website Visitor'
    ).trim()
  }

  // Contact info
  const email = String(data.email || data.user_email || data['your-email'] || '').trim()
  const rawPhone = String(data.phone || data.mobile || data.phone_number || data.contact_number || data['your-phone'] || '').trim()
  const phone = rawPhone || '+971 50 000 0000'
  const whatsapp = rawPhone ? rawPhone.replace(/[^0-9+]/g, '') : undefined

  // Page source & URL
  const source_url = String(data.source_url || data.page_url || data.embedded_url || data._wp_http_referer || payload.source_url || 'https://safaeewala.com').trim()
  const page_source = cleanPageSource(source_url)

  // Service & Category
  const rawService = String(data.service || data.service_type || data.cleaning_service || data.selected_service || data.subject || '').trim()
  const rawCat = String(data.category || data.form_category || '').trim()
  const category = cleanCategory(rawCat, rawService, source_url)

  // Address & Area
  const address = String(data.address || data.property_address || data.location || data.villa_apt || '').trim()
  const area = String(data.area || data.community || data.city || 'Dubai').trim()

  // Property Type
  const rawPropType = String(data.property_type || data.property || data.building_type || data.type || '').trim()
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
  const preferred_date = String(data.preferred_date || data.date || data.booking_date || '').trim() || undefined
  const preferred_time = String(data.preferred_time || data.time || data.slot || '').trim() || undefined
  const message = String(data.message || data.notes || data.details || data.requirements || data.comment || '').trim()

  const id = `lead-ff-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  return {
    id,
    created_at: new Date().toISOString(),
    form_id: payload.form_id || data.form_id,
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

/* ─── Leads Data Manager (Supabase + LocalStorage Fallback) ─── */
export async function fetchFluentFormLeads(): Promise<FluentFormLead[]> {
  try {
    const { data, error } = await supabase
      .from('fluent_form_leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data && Array.isArray(data)) {
      const realData = (data as FluentFormLead[]).filter(l => !isDummyLead(l))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(realData))
      return realData
    }
  } catch {}

  // Fallback to localStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        const realSaved = (parsed as FluentFormLead[]).filter(l => !isDummyLead(l))
        localStorage.setItem(STORAGE_KEY, JSON.stringify(realSaved))
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
  try {
    await supabase.from('fluent_form_leads').insert(lead)
  } catch {}
}

export async function updateFluentFormLeadStatus(id: string, status: LeadStatus, booking_id?: string): Promise<void> {
  try {
    const patch: any = { status }
    if (booking_id) patch.booking_id = booking_id
    await supabase.from('fluent_form_leads').update(patch).eq('id', id)
  } catch {}
}

export async function deleteFluentFormLeadRemote(id: string): Promise<void> {
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
    'Area': l.area || '',
    'Address': l.address || '',
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

/* ─── Webhook URL Generator Helper ─── */
export function getWebhookConfig() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'
  const restEndpoint = `${supabaseUrl}/rest/v1/fluent_form_leads`

  return {
    supabaseUrl,
    supabaseAnon,
    restEndpoint,
    sampleCurl: `curl -X POST "${restEndpoint}" \\
  -H "apikey: ${supabaseAnon}" \\
  -H "Authorization: Bearer ${supabaseAnon}" \\
  -H "Content-Type: application/json" \\
  -H "Prefer: return=representation" \\
  -d '{
    "form_title": "Deep Cleaning Booking Form",
    "client_name": "Tariq Mehmood",
    "phone": "+971501234567",
    "email": "tariq@example.com",
    "category": "Deep Cleaning",
    "page_source": "/services/deep-cleaning",
    "source_url": "https://safaeewala.com/services/deep-cleaning",
    "estimated_value": 850,
    "address": "Villa 24, Springs 7, Dubai",
    "message": "Villa deep cleaning requested"
  }'`,
  }
}
