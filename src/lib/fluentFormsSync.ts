import { supabase } from '@/lib/supabase'
import type { FluentFormLead, LeadStatus } from '@/types'
import * as XLSX from 'xlsx'

const STORAGE_KEY = 'safaeewala_fluent_form_leads'

/* ─── Default Sample Leads from Website Fluent Forms ─── */
export const DEFAULT_FLUENT_FORM_LEADS: FluentFormLead[] = [
  {
    id: 'lead-ff-101',
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(), // 35 mins ago
    form_id: 3,
    form_title: 'Deep Cleaning Quick Quote Form',
    entry_id: 1042,
    source_url: 'https://safaeewala.com/services/deep-cleaning',
    page_source: '/services/deep-cleaning',
    category: 'Deep Cleaning',
    client_name: 'Dr. Tariq Al-Mansoor',
    email: 'tariq.mansoor@gmail.com',
    phone: '+971 50 847 2910',
    whatsapp: '+971508472910',
    address: 'Villa 14, Saheel 2, Arabian Ranches',
    area: 'Arabian Ranches',
    preferred_date: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString().split('T')[0],
    preferred_time: '09:00 AM',
    service: 'Villa Deep Cleaning (4 Bedroom)',
    message: 'Need complete deep cleaning with kitchen degreasing and tile scrubbing before family arrives.',
    estimated_value: 1200,
    status: 'new',
  },
  {
    id: 'lead-ff-102',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(), // 2 hours ago
    form_id: 5,
    form_title: 'Move In / Move Out Cleaning Booking',
    entry_id: 1041,
    source_url: 'https://safaeewala.com/services/move-in-out-cleaning',
    page_source: '/services/move-in-out-cleaning',
    category: 'Move In / Out',
    client_name: 'Elena Rostova',
    email: 'elena.rostova@outlook.com',
    phone: '+971 52 931 4452',
    whatsapp: '+971529314452',
    address: 'Apartment 1804, Marina Gate 1, Dubai Marina',
    area: 'Dubai Marina',
    preferred_date: new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString().split('T')[0],
    preferred_time: '10:00 AM',
    service: 'Move-In Deep Cleaning (2 BHK)',
    message: 'Tenants moving out tomorrow. Landlord inspection scheduled for Saturday. Need steam cleaning.',
    estimated_value: 750,
    status: 'contacted',
  },
  {
    id: 'lead-ff-103',
    created_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(), // 6 hours ago
    form_id: 2,
    form_title: 'Sofa & Carpet Steam Shampooing',
    entry_id: 1040,
    source_url: 'https://safaeewala.com/services/sofa-carpet-shampooing',
    page_source: '/services/sofa-carpet-shampooing',
    category: 'Sofa & Carpet',
    client_name: 'Khurram Shehzad',
    email: 'khurram.s@yahoo.com',
    phone: '+971 55 412 8890',
    whatsapp: '+971554128890',
    address: 'Townhouse 89, Mira Oasis 3',
    area: 'Reem',
    preferred_date: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().split('T')[0],
    preferred_time: '02:00 PM',
    service: '7-Seater L-Shape Sofa & 2 Area Rugs',
    message: 'Got stain marks on beige fabric sofa. Need injection extraction and deep shampoo.',
    estimated_value: 380,
    status: 'quoted',
  },
  {
    id: 'lead-ff-104',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // Yesterday
    form_id: 3,
    form_title: 'Deep Cleaning Quick Quote Form',
    entry_id: 1039,
    source_url: 'https://safaeewala.com/services/deep-cleaning',
    page_source: '/services/deep-cleaning',
    category: 'Deep Cleaning',
    client_name: 'Jessica Miller',
    email: 'jessica.m@ae.pwc.com',
    phone: '+971 56 120 7733',
    whatsapp: '+971561207733',
    address: 'Villa 22, Whispering Pines, Jumeirah Golf Estates',
    area: 'JGE',
    preferred_date: new Date().toISOString().split('T')[0],
    preferred_time: '08:30 AM',
    service: 'Luxury Villa Deep Cleaning',
    message: 'Booking confirmed for Friday crew of 4 cleaners with supervisor.',
    estimated_value: 1600,
    status: 'converted',
  },
  {
    id: 'lead-ff-105',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    form_id: 1,
    form_title: 'Regular Maid & Cleaning Service',
    entry_id: 1038,
    source_url: 'https://safaeewala.com/services/regular-maid-service',
    page_source: '/services/regular-maid-service',
    category: 'General Cleaning',
    client_name: 'Mohammed Al-Hashmi',
    email: 'm.hashmi@dubaiholdings.ae',
    phone: '+971 50 339 1284',
    whatsapp: '+971503391284',
    address: 'Flat 402, Building 4, City Walk',
    area: 'City Walk',
    preferred_date: new Date(Date.now() + 1000 * 60 * 60 * 96).toISOString().split('T')[0],
    preferred_time: '09:00 AM',
    service: 'Weekly Recurring Maid (4 Hours twice a week)',
    message: 'Looking for a reliable cleaner on Sundays and Thursdays.',
    estimated_value: 480,
    status: 'contacted',
  },
  {
    id: 'lead-ff-106',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    form_id: 5,
    form_title: 'Move In / Move Out Cleaning Booking',
    entry_id: 1037,
    source_url: 'https://safaeewala.com/services/move-in-out-cleaning',
    page_source: '/services/move-in-out-cleaning',
    category: 'Move In / Out',
    client_name: 'Amir Reza',
    email: 'amir.reza@gmail.com',
    phone: '+971 54 882 1902',
    whatsapp: '+971548821902',
    address: 'Villa 310, Al Furjan West',
    area: 'Al Furjan',
    preferred_date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().split('T')[0],
    preferred_time: '09:00 AM',
    service: 'Move-Out Cleaning 3-Bed Villa',
    message: 'Full cleaning completed by Safaeewala team with certificate for security deposit refund.',
    estimated_value: 950,
    status: 'converted',
  },
  {
    id: 'lead-ff-107',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    form_id: 4,
    form_title: 'Villa Exterior & Window Cleaning',
    entry_id: 1036,
    source_url: 'https://safaeewala.com/services/villa-cleaning',
    page_source: '/services/villa-cleaning',
    category: 'Villa Cleaning',
    client_name: 'Suresh Patel',
    email: 'suresh.patel@emiratesnbd.com',
    phone: '+971 52 771 9043',
    whatsapp: '+971527719043',
    address: 'Villa 55, Meadows 6',
    area: 'Meadows',
    preferred_date: new Date(Date.now() + 1000 * 60 * 60 * 120).toISOString().split('T')[0],
    preferred_time: '08:00 AM',
    service: 'Villa Glass & Facade Pressure Washing',
    message: 'Double story villa exterior window cleaning and interlock pressure wash.',
    estimated_value: 850,
    status: 'quoted',
  },
  {
    id: 'lead-ff-108',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    form_id: 6,
    form_title: 'Contact Us & General Inquiry',
    entry_id: 1035,
    source_url: 'https://safaeewala.com/contact-us',
    page_source: '/contact-us',
    category: 'General Cleaning',
    client_name: 'Fatima Zahra',
    email: 'fatima.z@gmail.com',
    phone: '+971 55 902 4311',
    whatsapp: '+971559024311',
    address: 'Burj Crown, Downtown Dubai',
    area: 'Downtown Dubai',
    service: 'General Sanitization',
    message: 'Do you offer steam sanitization for baby rooms?',
    estimated_value: 250,
    status: 'lost',
  },
  {
    id: 'lead-ff-109',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
    form_id: 3,
    form_title: 'Deep Cleaning Quick Quote Form',
    entry_id: 1034,
    source_url: 'https://safaeewala.com/services/deep-cleaning',
    page_source: '/services/deep-cleaning',
    category: 'Deep Cleaning',
    client_name: 'Zaid Al-Khateeb',
    email: 'zaid.k@khateeb.net',
    phone: '+971 50 671 2289',
    whatsapp: '+971506712289',
    address: 'Penthouse 45, Bluewaters Residences',
    area: 'Bluewaters',
    service: 'Penthouse Deep Cleaning',
    message: 'High floor penthouse deep cleaning including balcony glass.',
    estimated_value: 2200,
    status: 'converted',
  },
  {
    id: 'lead-ff-110',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 140).toISOString(),
    form_id: 7,
    form_title: 'Online Price Calculator Inquiry',
    entry_id: 1033,
    source_url: 'https://safaeewala.com/pricing',
    page_source: '/pricing',
    category: 'Deep Cleaning',
    client_name: 'Rahul Khanna',
    email: 'rahul.khanna@dubaimedia.ae',
    phone: '+971 52 334 9180',
    whatsapp: '+971523349180',
    address: 'Apt 1102, Executive Towers, Business Bay',
    area: 'Business Bay',
    service: '3 Bedroom Deep Cleaning',
    message: 'Calculated 650 AED on website calculator, please confirm availability for Saturday.',
    estimated_value: 650,
    status: 'new',
  },
]

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

    if (!error && data && data.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      return data as FluentFormLead[]
    }
  } catch {}

  // Fallback to localStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {}

  // Default seed
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_FLUENT_FORM_LEADS))
  } catch {}
  return DEFAULT_FLUENT_FORM_LEADS
}

export function saveLeadsLocally(leads: FluentFormLead[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads))
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
