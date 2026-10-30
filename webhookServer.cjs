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
const AGENCIES_FILE = path.join(DATA_DIR, 'agencies.json');

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

function readAgencies() {
  try {
    if (!fs.existsSync(AGENCIES_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(AGENCIES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.error('Error reading agencies:', err.message);
    return null;
  }
}

function writeAgencies(agencies) {
  try {
    fs.writeFileSync(AGENCIES_FILE, JSON.stringify(agencies, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing agencies:', err.message);
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


// ═══════════════════════════════════════════════════════════════════════════
// User management (SEC-01): only an admin creates users — there is no sign-up.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment; the
// service key never reaches the browser.
// ═══════════════════════════════════════════════════════════════════════════
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const LOGIN_EMAIL_DOMAIN = 'safaeewala.com'; // real mail domain — Supabase rejects domains without mail
const LOGIN_EMAIL_PREFIX = 'crm-';
const ROLES = ['admin', 'manager', 'employee'];
const MAX_BODY = 1024 * 1024; // 1 MB for JSON requests

/** "SW-0007" → "crm-sw-0007@safaeewala.com"; a real email is used as it is */
function loginIdToEmail(loginId) {
  const id = String(loginId || '').trim().toLowerCase();
  return id.includes('@') ? id : `${LOGIN_EMAIL_PREFIX}${id}@${LOGIN_EMAIL_DOMAIN}`;
}
/** At least 10 characters with upper case, lower case and a number */
function passwordProblem(pw) {
  const p = String(pw || '');
  if (p.length < 10) return 'Password must be at least 10 characters.';
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) return 'Password needs upper case, lower case and a number.';
  return null;
}

function readJson(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > max) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function serviceHeaders(extra = {}) {
  const h = { apikey: SERVICE_KEY, 'Content-Type': 'application/json', ...extra };
  if (SERVICE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SERVICE_KEY}`; // legacy service_role JWT
  return h;
}
async function supa(pathname, { method = 'GET', body, headers } = {}) {
  const r = await fetch(`${SUPABASE_URL}${pathname}`, { method, headers: serviceHeaders(headers), body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || `Supabase error ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status >= 500 ? 502 : 400 });
  }
  return data;
}

/** The caller must be a signed-in, active admin */
async function requireAdmin(req) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw Object.assign(new Error('User management is not set up on the server (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'), { status: 503 });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Sign in first.'), { status: 401 });
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!ur.ok) throw Object.assign(new Error('Session expired — sign in again.'), { status: 401 });
  const user = await ur.json();
  const rows = await supa(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,status`);
  const me = rows && rows[0];
  if (!me || me.role !== 'admin' || me.status !== 'active') throw Object.assign(new Error('Only an admin can manage users.'), { status: 403 });
  return user;
}

async function activeAdminCount() {
  const rows = await supa('/rest/v1/profiles?role=eq.admin&status=eq.active&select=id');
  return Array.isArray(rows) ? rows.length : 0;
}

async function handleAdminUsers(req, res, pathname) {
  try {
    const admin = await requireAdmin(req);

    // List users
    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const rows = await supa('/rest/v1/profiles?select=*&order=created_at.asc');
      return sendJson(res, 200, rows || []);
    }

    // Create a user
    if (req.method === 'POST' && pathname === '/api/admin/users') {
      const b = await readJson(req);
      const loginId = String(b.login_id || '').trim();
      if (!/^[A-Za-z0-9._@-]{3,60}$/.test(loginId)) return sendJson(res, 400, { error: 'Login ID: 3–60 letters, numbers, dot, dash or underscore.' });
      if (!ROLES.includes(b.role)) return sendJson(res, 400, { error: 'Choose a role.' });
      const pwErr = passwordProblem(b.password);
      if (pwErr) return sendJson(res, 400, { error: pwErr });
      const taken = await supa(`/rest/v1/profiles?login_id=ilike.${encodeURIComponent(loginId)}&select=id`);
      if (taken && taken.length) return sendJson(res, 409, { error: `Login ID "${loginId}" is already used.` });
      if (b.employee_id) {
        const linked = await supa(`/rest/v1/profiles?employee_id=eq.${encodeURIComponent(b.employee_id)}&select=login_id`);
        if (linked && linked.length) return sendJson(res, 409, { error: `This employee already has the login "${linked[0].login_id}".` });
      }
      const email = loginIdToEmail(loginId);
      const created = await supa('/auth/v1/admin/users', {
        method: 'POST',
        body: { email, password: b.password, email_confirm: true, user_metadata: { login_id: loginId, full_name: b.full_name || '' } },
      });
      const userId = created.id || (created.user && created.user.id);
      try {
        const rows = await supa('/rest/v1/profiles', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: { id: userId, login_id: loginId, email, full_name: String(b.full_name || '').trim(), role: b.role, employee_id: b.employee_id || null, status: 'active' },
        });
        console.log(`[Users] ${admin.email} created ${loginId} (${b.role})`);
        return sendJson(res, 201, rows && rows[0]);
      } catch (err) {
        await supa(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }).catch(() => {});
        throw err;
      }
    }

    // Update a user: name, role, employee link, status, password
    const m = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/);
    if (req.method === 'PATCH' && m) {
      const id = m[1];
      const b = await readJson(req);
      const rows = await supa(`/rest/v1/profiles?id=eq.${id}&select=*`);
      const target = rows && rows[0];
      if (!target) return sendJson(res, 404, { error: 'User not found.' });
      const patch = {};
      if (typeof b.full_name === 'string') patch.full_name = b.full_name.trim();
      if (b.employee_id !== undefined) patch.employee_id = b.employee_id || null;
      if (b.role !== undefined) {
        if (!ROLES.includes(b.role)) return sendJson(res, 400, { error: 'Unknown role.' });
        patch.role = b.role;
      }
      if (b.status !== undefined) {
        if (!['active', 'disabled'].includes(b.status)) return sendJson(res, 400, { error: 'Unknown status.' });
        patch.status = b.status;
      }
      // Never lock the company out: the last active admin cannot be disabled or demoted
      const losesAdmin = target.role === 'admin' && target.status === 'active' &&
        ((patch.role && patch.role !== 'admin') || patch.status === 'disabled');
      if (losesAdmin && (await activeAdminCount()) <= 1) return sendJson(res, 400, { error: 'Keep at least one active admin.' });
      if (id === admin.id && (patch.status === 'disabled' || (patch.role && patch.role !== 'admin'))) {
        return sendJson(res, 400, { error: 'You cannot disable or demote your own account.' });
      }
      if (b.password !== undefined) {
        const pwErr = passwordProblem(b.password);
        if (pwErr) return sendJson(res, 400, { error: pwErr });
        await supa(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: { password: b.password } });
      }
      if (patch.status) {
        // A disabled user is also blocked at the sign-in level
        await supa(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: { ban_duration: patch.status === 'disabled' ? '876000h' : 'none' } });
      }
      let updated = target;
      if (Object.keys(patch).length) {
        const out = await supa(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: patch });
        updated = out && out[0];
      }
      console.log(`[Users] ${admin.email} updated ${target.login_id}: ${Object.keys(patch).concat(b.password !== undefined ? ['password'] : []).join(', ')}`);
      return sendJson(res, 200, updated);
    }

    return sendJson(res, 404, { error: 'Endpoint not found' });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message || 'Server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API protection (SEC-04)
// - Browser calls come only from the dashboard's own addresses (CORS allow-list).
// - Dashboard endpoints need a signed-in, active user once user management is configured
//   (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Until then they stay open so nothing breaks.
// - The Fluent Forms webhook needs FLUENT_WEBHOOK_SECRET (header X-Webhook-Secret or ?secret=)
//   once that variable is set on the server.
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = new Set([
  'https://crm.srv1646539.hstgr.cloud',
  'https://safaeewala.srv1646539.hstgr.cloud',
  'http://localhost:5058',
  'http://localhost:5059',
  ...String(process.env.EXTRA_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean),
]);
const WEBHOOK_SECRET = process.env.FLUENT_WEBHOOK_SECRET || '';
const authConfigured = () => Boolean(SUPABASE_URL && SERVICE_KEY);
let warnedOpen = false;

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && require('crypto').timingSafeEqual(x, y);
}

/** Signed-in, active user from the Authorization header, or null */
async function activeUserFrom(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!ur.ok) return null;
  const user = await ur.json();
  const rows = await supa(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,status`);
  const me = rows && rows[0];
  return me && me.status === 'active' ? { ...user, role: me.role } : null;
}

/** { ok } or { ok:false, status, error } for every /api request except /api/admin (own checks) */
async function authorizeApi(req, pathname, parsedUrl) {
  const isLeadWebhook = req.method === 'POST' && pathname === '/api/webhook/fluent-forms';
  if (isLeadWebhook && WEBHOOK_SECRET) {
    const given = req.headers['x-webhook-secret'] || parsedUrl.searchParams.get('secret') || '';
    if (given && safeEqual(given, WEBHOOK_SECRET)) return { ok: true };
  }
  if (!authConfigured()) {
    if (isLeadWebhook && WEBHOOK_SECRET) return { ok: false, status: 401, error: 'Webhook secret required' };
    if (!warnedOpen) { console.warn('[Security] User management is not configured — /api endpoints are open (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).'); warnedOpen = true; }
    return { ok: true };
  }
  try {
    const user = await activeUserFrom(req);
    if (user) return { ok: true };
  } catch (err) {
    return { ok: false, status: 502, error: 'Could not verify the session' };
  }
  return { ok: false, status: 401, error: isLeadWebhook ? 'Webhook secret or sign-in required' : 'Sign in first.' };
}

const server = http.createServer((req, res) => {
  // CORS Headers
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, Prefer, X-Webhook-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // User management (admin only)
  if (pathname === '/api/admin/users' || pathname.startsWith('/api/admin/users/')) {
    handleAdminUsers(req, res, pathname);
    return;
  }

  authorizeApi(req, pathname, parsedUrl).then(result => {
    if (!result.ok) return sendJson(res, result.status, { error: result.error });
    routeApi(req, res, parsedUrl, pathname);
  }, () => sendJson(res, 500, { error: 'Server error' }));
});

// App error log (TA-24): one JSON line per report in /data/logs/errors.jsonl, file kept under 2 MB
const ERROR_LOG = path.join(DATA_DIR, 'logs', 'errors.jsonl');
function appendErrorLog(entry) {
  fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
  try {
    if (fs.existsSync(ERROR_LOG) && fs.statSync(ERROR_LOG).size > 2 * 1024 * 1024) {
      const keep = fs.readFileSync(ERROR_LOG, 'utf8').trim().split('\n').slice(-2000).join('\n');
      fs.writeFileSync(ERROR_LOG, keep + '\n', 'utf8');
    }
  } catch { /* rotation is best effort */ }
  fs.appendFileSync(ERROR_LOG, JSON.stringify(entry) + '\n', 'utf8');
}
function readErrorLog(limit = 100) {
  if (!fs.existsSync(ERROR_LOG)) return [];
  return fs.readFileSync(ERROR_LOG, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).reverse()
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// GoHighLevel proxy (TA-18): the API key stays on the server
const GHL_API_KEY = process.env.GHL_API_KEY || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || '';
async function ghlFetch(pathname, init = {}) {
  const r = await fetch(`https://services.leadconnectorhq.com${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28', 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

function routeApi(req, res, parsedUrl, pathname) {
  if (pathname === '/api/ghl/status' && req.method === 'GET') {
    return sendJson(res, 200, { configured: Boolean(GHL_API_KEY), locationId: Boolean(GHL_LOCATION_ID) });
  }
  if (pathname === '/api/ghl/test' && req.method === 'POST') {
    if (!GHL_API_KEY) return sendJson(res, 503, { success: false, message: 'GHL_API_KEY is not set on the server.' });
    ghlFetch('/contacts/?limit=1').then(
      r => sendJson(res, 200, r.ok ? { success: true, message: '✓ Connected to GoHighLevel API v2 (key on the server).' } : { success: false, message: `GHL API returned status ${r.status}. Check the token and Location ID.` }),
      err => sendJson(res, 502, { success: false, message: err.message }));
    return;
  }
  if (pathname === '/api/ghl/contacts/upsert' && req.method === 'POST') {
    if (!GHL_API_KEY || !GHL_LOCATION_ID) return sendJson(res, 503, { success: false, message: 'GHL_API_KEY / GHL_LOCATION_ID are not set on the server.' });
    readJson(req, 64 * 1024).then(b => {
      const allowed = ['firstName', 'lastName', 'name', 'phone', 'email', 'address1', 'city', 'country', 'tags'];
      const body = { locationId: GHL_LOCATION_ID };
      allowed.forEach(k => { if (b[k] !== undefined) body[k] = b[k]; });
      return ghlFetch('/contacts/upsert', { method: 'POST', body: JSON.stringify(body) })
        .then(r => sendJson(res, r.ok ? 200 : 502, { success: r.ok, status: r.status }));
    }).catch(err => sendJson(res, err.status || 502, { success: false, message: err.message }));
    return;
  }

  // App error reports (TA-24)
  if (pathname === '/api/logs/errors') {
    if (req.method === 'GET') return sendJson(res, 200, readErrorLog(100));
    if (req.method === 'POST') {
      readJson(req, 64 * 1024).then(b => {
        const s = (v, n) => String(v == null ? '' : v).slice(0, n);
        appendErrorLog({ at: new Date().toISOString(), message: s(b.message, 500), stack: s(b.stack, 2000), where: s(b.where, 100), url: s(b.url, 300), userAgent: s(b.userAgent, 200) });
        sendJson(res, 201, { ok: true });
      }, err => sendJson(res, err.status || 400, { error: err.message }));
      return;
    }
  }

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
        // SEC-05: keep only a plain .xlsx file name — no folders, no '..'
        const rawName = path.basename(String(payload.filename || '')).replace(/[^A-Za-z0-9._ -]/g, '_');
        const filename = /^[^.][^/\\]*\.xlsx$/i.test(rawName) ? rawName : `DailyJobSheet-${Date.now()}.xlsx`;
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

  // 6. GET /api/agencies -> return persisted agencies
  if (req.method === 'GET' && pathname === '/api/agencies') {
    const list = readAgencies();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list || []));
    return;
  }

  // 7. POST /api/agencies -> save/sync agencies
  if (req.method === 'POST' && pathname === '/api/agencies') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        let current = readAgencies() || [];
        if (payload && payload.remove) {
          // Delete one agency by id (sent together with a full list for older servers)
          current = current.filter(a => a.id !== payload.remove);
        } else if (Array.isArray(payload)) {
          current = payload;
        } else if (payload && Array.isArray(payload.all)) {
          current = payload.all;
        } else if (payload && payload.id && payload.patch) {
          const idx = current.findIndex(a => a.id === payload.id);
          if (idx >= 0) {
            current[idx] = { ...current[idx], ...payload.patch };
          } else {
            current.push({ id: payload.id, ...payload.patch });
          }
        }
        writeAgencies(current);
        console.log(`[Agencies] Saved and synchronized ${current.length} agencies to persistent store`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: current.length }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Safaeewala Webhook Server] Running on http://0.0.0.0:${PORT}`);
});
