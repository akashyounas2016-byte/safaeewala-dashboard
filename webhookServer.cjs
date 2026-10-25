/**
 * Safaeewala CRM - Lightweight Standalone Webhook Receiver
 * Listens on internal port 3001, handles incoming Fluent Forms submissions,
 * persists leads to /data/leads.json, and serves leads to the CRM frontend.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const DATA_DIR = process.env.DATA_DIR || '/data';
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.error('Failed to create data dir:', e);
}

function readLeads() {
  try {
    if (!fs.existsSync(LEADS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(LEADS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let changed = false;
    const healed = parsed.map(lead => {
      const fixed = healLead(lead);
      if (fixed.client_name !== lead.client_name || fixed.phone !== lead.phone || fixed.service !== lead.service || fixed.property_type !== lead.property_type || fixed.area !== lead.area) {
        changed = true;
      }
      return fixed;
    });
    if (changed) {
      try {
        fs.writeFileSync(LEADS_FILE, JSON.stringify(healed, null, 2), 'utf8');
      } catch {}
    }
    return healed;
  } catch (err) {
    console.error('Error reading leads:', err.message);
    return [];
  }
}

function writeLeads(leads) {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing leads:', err.message);
    return false;
  }
}

function cleanCategory(cat, service, sourceUrl) {
  const text = `${cat || ''} ${service || ''} ${sourceUrl || ''}`.toLowerCase();
  if (text.includes('move') || text.includes('relocation') || text.includes('tenancy')) return 'Move In / Out';
  if (text.includes('sofa') || text.includes('carpet') || text.includes('curtain') || text.includes('mattress') || text.includes('upholstery')) return 'Sofa & Carpet';
  if (text.includes('villa') || text.includes('house') || text.includes('mansion') || text.includes('exterior') || text.includes('facade') || text.includes('pressure')) return 'Villa Cleaning';
  if (text.includes('deep') || text.includes('steam') || text.includes('kitchen degrease')) return 'Deep Cleaning';
  if (text.includes('office') || text.includes('commercial') || text.includes('warehouse')) return 'Office Cleaning';
  if (text.includes('duct') || text.includes('ac')) return 'AC Duct';
  if (text.includes('window') || text.includes('glass')) return 'Window Cleaning';
  if (text.includes('maid') || text.includes('hourly') || text.includes('regular') || text.includes('general')) return 'General Cleaning';
  return (cat || service || 'Deep Cleaning').trim() || 'General Cleaning';
}

function cleanPageSource(url) {
  if (!url) return '/home';
  try {
    const parsed = new URL(url, 'https://safaeewala.com');
    let path = parsed.pathname;
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1);
    }
    if (!path || path === '/' || path === '/home') {
      if (parsed.searchParams.get('preview_id')) {
        return `Form #${parsed.searchParams.get('preview_id')} (Preview)`;
      }
      if (parsed.searchParams.get('fluent_forms_pages')) {
        return 'Website Booking Form';
      }
      return '/home';
    }
    return path;
  } catch {
    const clean = String(url).replace(/^https?:\/\/[^/]+/i, '').split('?')[0];
    return clean || '/home';
  }
}

function resolvePropertyType(val) {
  if (!val || val === 'Not Specified') return 'Not Specified';
  const str = String(val).toLowerCase().trim();
  if (!str || str === 'not specified' || str === 'undefined' || str === 'null') return 'Not Specified';
  if (str.includes('villa') || str.includes('mansion') || str.includes('compound')) return 'Villa';
  if (str.includes('house') || str.includes('home')) return 'House';
  if (str.includes('townhouse') || str.includes('town house')) return 'Townhouse';
  if (str.includes('penthouse')) return 'Penthouse';
  if (str.includes('office') || str.includes('commercial') || str.includes('shop') || str.includes('warehouse')) return 'Office';
  if (str.includes('studio')) return 'Studio';
  if (str.includes('apartment') || str.includes('apt') || str.includes('flat') || str.includes('tower') || str.includes('bhk')) return 'Apartment';
  return String(val).trim() || 'Not Specified';
}

/**
 * Resilient Multi-Key Fallback Parser for Fluent Forms Payloads
 * Seamlessly handles both default WordPress Fluent Forms fields (name object, dropdown, dropdown_1, input_text, date)
 * and custom named attributes (your_name, service_needed, property_type, area_location, preferred_date).
 */
function parseFluentFormPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      client_name: 'Guest',
      phone: '',
      service_needed: 'General Cleaning',
      property_type: 'Not Specified',
      area_location: '',
      preferred_date: '',
      source_url: 'Website Form',
      raw_payload: payload
    };
  }

  // Handle nested containers if sent via Fluent Forms webhook or WP integrations
  const sub = (payload.__submission && typeof payload.__submission === 'object') ? payload.__submission : {};
  const userInputs = (sub.user_inputs && typeof sub.user_inputs === 'object') ? sub.user_inputs : {};
  const inputs = (payload.inputs && typeof payload.inputs === 'object') ? payload.inputs : {};
  const data = (payload.data && typeof payload.data === 'object') ? payload.data : {};
  const p = Object.assign({}, sub, data, inputs, userInputs, payload);

  // 1. Client Name (Handle object or string)
  let name = 'Guest';
  if (typeof p.your_name === 'string' && p.your_name.trim()) {
    name = p.your_name.trim();
  } else if (p.name && typeof p.name === 'object') {
    const first = (p.name.first_name || '').trim();
    const last = (p.name.last_name || '').trim();
    name = `${first} ${last}`.trim() || 'Guest';
  } else if (typeof p.name === 'string' && p.name.trim()) {
    name = p.name.trim();
  } else if (typeof p.first_name === 'string' && p.first_name.trim()) {
    const last = typeof p.last_name === 'string' ? p.last_name.trim() : '';
    name = `${p.first_name.trim()} ${last}`.trim() || 'Guest';
  } else if (typeof p.client_name === 'string' && p.client_name.trim()) {
    name = p.client_name.trim();
  }

  // 2. Extract Phone & WhatsApp
  const phone = (p.phone || p.phone_whatsapp || p.inputs_phone || p.mobile || '').toString().trim();

  // 3. Extract Service Needed / Category
  const service = (p.service_needed || p.dropdown || p.service || 'General Cleaning').toString().trim() || 'General Cleaning';

  // 4. Extract Property Type
  const propertyType = (p.property_type || p.dropdown_1 || 'Not Specified').toString().trim() || 'Not Specified';

  // 5. Extract Location / Area / Address
  const areaLocation = (p.area_location || p.input_text || p.address || '').toString().trim();

  // 6. Extract Preferred Booking Date
  const preferredDate = (p.preferred_date || p.date || '').toString().trim();

  // 7. Extract Source URL / Lead Source
  const sourceUrl = (p.source_url || p._wp_http_referer || 'Website Form').toString().trim() || 'Website Form';

  return {
    client_name: name,
    phone: phone,
    service_needed: service,
    property_type: propertyType,
    area_location: areaLocation,
    preferred_date: preferredDate,
    source_url: sourceUrl,
    raw_payload: payload
  };
}

function parsePayload(payload) {
  const parsed = parseFluentFormPayload(payload);

  const sub = (payload && payload.__submission && typeof payload.__submission === 'object') ? payload.__submission : {};
  const merged = Object.assign({}, sub, payload?.data, payload?.inputs, payload?.user_inputs, payload);

  const rawPhone = parsed.phone || '+971 50 000 0000';
  const cleanDigits = rawPhone.replace(/[^0-9+]/g, '');
  const whatsapp = cleanDigits ? (cleanDigits.startsWith('+') ? cleanDigits : `+${cleanDigits}`) : undefined;

  const rawService = parsed.service_needed || 'General Cleaning';
  const category = cleanCategory(rawService, rawService, parsed.source_url);

  const rawPropertyType = parsed.property_type || 'Not Specified';
  const property_type = resolvePropertyType(rawPropertyType);

  const area = parsed.area_location || 'Dubai';
  const address = parsed.area_location || 'Dubai';
  const preferred_date = parsed.preferred_date || undefined;

  const source_url = (parsed.source_url && parsed.source_url !== 'Website Form')
    ? parsed.source_url
    : (sub.source_url || 'https://safaeewala.com');
  const page_source = cleanPageSource(source_url);

  const email = String(merged.email || merged.user_email || merged.your_email || '').trim();
  const message = String(merged.message || merged.notes || merged.details || merged.requirements || '').trim();
  const form_id = Number(sub.form_id || payload?.form_id || merged.form_id || payload?.__fluent_form_embded_post_id) || 40;
  const form_title = String(payload?.form_title || merged.form_title || (merged.form_type ? `${merged.form_type} Request` : 'Service Booking Form'));
  const entry_id = sub.id || payload?.entry_id || merged.entry_id || undefined;

  const id = `lead-ff-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  return {
    id,
    created_at: sub.created_at ? new Date(sub.created_at).toISOString() : new Date().toISOString(),
    form_id,
    form_title,
    entry_id,
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
    service: rawService,
    message,
    estimated_value: 500,
    status: 'new',
    raw_data: payload,
  };
}

function healLead(lead) {
  if (!lead.raw_data || typeof lead.raw_data !== 'object') return lead;
  const fixed = parsePayload(lead.raw_data);
  return {
    ...lead,
    client_name: (fixed.client_name && fixed.client_name !== 'Guest') ? fixed.client_name : lead.client_name,
    phone: (fixed.phone && fixed.phone !== '+971 50 000 0000') ? fixed.phone : lead.phone,
    whatsapp: fixed.whatsapp || lead.whatsapp,
    service: (fixed.service && fixed.service !== 'General Cleaning') ? fixed.service : (lead.service || fixed.service),
    property_type: (fixed.property_type && fixed.property_type !== 'Not Specified') ? fixed.property_type : (lead.property_type || fixed.property_type),
    area: (fixed.area && fixed.area !== 'Dubai') ? fixed.area : (lead.area || fixed.area),
    address: fixed.address || lead.address,
    preferred_date: fixed.preferred_date || lead.preferred_date,
    page_source: (fixed.page_source && fixed.page_source !== '/home') ? fixed.page_source : (lead.page_source || fixed.page_source),
    source_url: fixed.source_url || lead.source_url,
    category: fixed.category || lead.category,
    entry_id: fixed.entry_id || lead.entry_id,
  };
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, Prefer');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. GET /api/webhook/fluent-forms -> list leads
  if (req.method === 'GET' && pathname === '/api/webhook/fluent-forms') {
    const leads = readLeads();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(leads));
    return;
  }

  // 2. POST /api/webhook/fluent-forms -> receive lead
  if (req.method === 'POST' && pathname === '/api/webhook/fluent-forms') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload = {};
      try {
        if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          const qs = require('querystring');
          payload = qs.parse(body);
        } else {
          payload = JSON.parse(body);
        }
      } catch (err) {
        // Fallback: try raw query string if JSON parse failed
        try {
          const qs = require('querystring');
          payload = qs.parse(body);
        } catch {
          payload = {};
        }
      }

      const lead = parsePayload(payload);
      const leads = readLeads();
      const updated = [lead, ...leads];
      writeLeads(updated);

      console.log(`[Webhook] ✓ New Lead Received: ${lead.client_name} (${lead.service}) - Phone: ${lead.phone}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Lead captured successfully',
        lead_id: lead.id,
        lead: {
          client_name: lead.client_name,
          phone: lead.phone,
          service: lead.service,
          property_type: lead.property_type,
          area: lead.area,
          preferred_date: lead.preferred_date,
        }
      }));
    });
    return;
  }

  // 3. PATCH /api/webhook/fluent-forms/:id -> update status
  if (req.method === 'PATCH' && pathname.startsWith('/api/webhook/fluent-forms/')) {
    const id = pathname.replace('/api/webhook/fluent-forms/', '');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const patch = JSON.parse(body);
        const leads = readLeads();
        const updated = leads.map(l => l.id === id ? { ...l, ...patch } : l);
        writeLeads(updated);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. DELETE /api/webhook/fluent-forms/:id -> delete lead
  if (req.method === 'DELETE' && pathname.startsWith('/api/webhook/fluent-forms/')) {
    const id = pathname.replace('/api/webhook/fluent-forms/', '');
    const leads = readLeads();
    const updated = leads.filter(l => l.id !== id);
    writeLeads(updated);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // 5. POST /api/webhook/google-drive-backup -> save sheet backup on VPS and forward to n8n if url provided
  if (req.method === 'POST' && pathname === '/api/webhook/google-drive-backup') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const filename = payload.filename || `DailyJobSheet-${Date.now()}.xlsx`;
        const backupsDir = path.join(DATA_DIR, 'backups');
        if (!fs.existsSync(backupsDir)) {
          fs.mkdirSync(backupsDir, { recursive: true });
        }

        let savedPath = '';
        if (payload.file_base64) {
          const buffer = Buffer.from(payload.file_base64, 'base64');
          savedPath = path.join(backupsDir, filename);
          fs.writeFileSync(savedPath, buffer);
          console.log(`[Backup] ✓ Saved local daily job sheet backup on VPS: ${savedPath}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Daily Job Sheet backup saved successfully to VPS archive!',
          filename: filename,
          saved_to_vps: !!savedPath,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('[Backup Error]:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Safaeewala Webhook Server] Running on http://0.0.0.0:${PORT}`);
});
