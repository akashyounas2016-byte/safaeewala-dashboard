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
    return Array.isArray(parsed) ? parsed : [];
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
  if (text.includes('villa') || text.includes('exterior') || text.includes('facade') || text.includes('pressure')) return 'Villa Cleaning';
  if (text.includes('deep') || text.includes('steam') || text.includes('kitchen degrease')) return 'Deep Cleaning';
  if (text.includes('office') || text.includes('commercial')) return 'Office Cleaning';
  if (text.includes('duct') || text.includes('ac')) return 'AC Duct';
  if (text.includes('window') || text.includes('glass')) return 'Window Cleaning';
  if (text.includes('maid') || text.includes('hourly') || text.includes('regular') || text.includes('general')) return 'General Cleaning';
  return (cat || service || 'Deep Cleaning').trim() || 'General Cleaning';
}

function resolvePropertyType(val) {
  if (!val) return 'Apartment';
  const str = String(val).toLowerCase();
  if (str.includes('villa') || str.includes('mansion') || str.includes('compound')) return 'Villa';
  if (str.includes('townhouse') || str.includes('town house')) return 'Townhouse';
  if (str.includes('penthouse')) return 'Penthouse';
  if (str.includes('office') || str.includes('commercial') || str.includes('shop') || str.includes('warehouse')) return 'Office';
  if (str.includes('apartment') || str.includes('apt') || str.includes('flat') || str.includes('tower') || str.includes('studio') || str.includes('bhk')) return 'Apartment';
  return String(val).trim() || 'Apartment';
}

function parsePayload(payload) {
  const data = payload.inputs || payload.data || payload;

  // 1. Client Name (supports: your_name, names, full_name, client_name, name, etc.)
  let client_name = '';
  if (data.names && typeof data.names === 'object') {
    client_name = [data.names.first_name, data.names.middle_name, data.names.last_name].filter(Boolean).join(' ').trim();
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
    ).trim();
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
  ).trim();

  // 3. Service Needed
  const rawService = String(
    data.service_needed ||
    data['service_needed'] ||
    data['Service Needed'] ||
    data.service ||
    data.service_type ||
    data.cleaning_service ||
    data.selected_service ||
    data.category ||
    data.dropdown ||
    'Deep Cleaning'
  ).trim();

  // 4. Property Type
  const rawPropertyType = String(
    data.property_type ||
    data['property_type'] ||
    data['Property Type'] ||
    data.property ||
    data.building_type ||
    data.dropdown_1 ||
    data.type ||
    'Apartment'
  ).trim();

  // 5. Area / Location
  const rawArea = String(
    data.area_location ||
    data['area_location'] ||
    data['Area / Location'] ||
    data.area ||
    data.location ||
    data.address ||
    data.community ||
    data.property_address ||
    data.city ||
    'Dubai'
  ).trim();

  // 6. Preferred Date
  const preferred_date = String(
    data.preferred_date ||
    data['preferred_date'] ||
    data['Preferred Date'] ||
    data.date ||
    data.booking_date ||
    data.datetime ||
    ''
  ).trim() || undefined;

  // 7. Extra metadata
  const source_url = String(data.source_url || data.page_url || data.embedded_url || data._wp_http_referer || payload.source_url || 'https://safaeewala.com').trim();
  let page_source = '/home';
  try {
    const parsedUrl = new URL(source_url, 'https://safaeewala.com');
    page_source = parsedUrl.pathname || '/home';
  } catch {
    page_source = source_url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0] || '/home';
  }

  const category = cleanCategory(rawService, rawService, source_url);
  const property_type = resolvePropertyType(rawPropertyType);
  const email = String(data.email || data.user_email || data['your-email'] || '').trim();
  const message = String(data.message || data.notes || data.details || data.requirements || data.comment || '').trim();
  const form_id = payload.form_id || data.form_id || 40;
  const form_title = String(payload.form_title || data.form_title || data.form_name || 'Service Booking Form');
  const entry_id = payload.entry_id || data.entry_id || undefined;

  const id = `lead-ff-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  return {
    id,
    created_at: new Date().toISOString(),
    form_id,
    form_title,
    entry_id,
    source_url,
    page_source,
    category,
    client_name,
    email,
    phone: rawPhone,
    whatsapp: rawPhone ? rawPhone.replace(/[^0-9+]/g, '') : undefined,
    address: rawArea,
    area: rawArea,
    property_type,
    preferred_date,
    service: rawService,
    message,
    estimated_value: 500,
    status: 'new',
    raw_data: payload,
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
        message: 'Lead successfully received and synced into Safaeewala CRM!',
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
