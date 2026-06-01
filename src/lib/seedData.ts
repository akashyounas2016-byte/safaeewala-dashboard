import { supabase } from './supabase'

const uid = () => crypto.randomUUID()
const today = new Date()
const d = (offsetDays: number) => {
  const dt = new Date(today)
  dt.setDate(dt.getDate() + offsetDays)
  return dt.toISOString().split('T')[0]
}
const ts = (offsetDays: number) => new Date(today.getTime() + offsetDays * 86400000).toISOString()

/* ── Fixed IDs so we can cross-reference ── */
const E = {
  ahmed:  'e1000001-0000-0000-0000-000000000001',
  raju:   'e1000001-0000-0000-0000-000000000002',
  tariq:  'e1000001-0000-0000-0000-000000000003',
  suresh: 'e1000001-0000-0000-0000-000000000004',
  bilal:  'e1000001-0000-0000-0000-000000000005',
  arjun:  'e1000001-0000-0000-0000-000000000006',
  nasser: 'e1000001-0000-0000-0000-000000000007',
  priya:  'e1000001-0000-0000-0000-000000000008',
}

const C = {
  sarah:    'c1000001-0000-0000-0000-000000000001',
  mohammed: 'c1000001-0000-0000-0000-000000000002',
  jennifer: 'c1000001-0000-0000-0000-000000000003',
  khalid:   'c1000001-0000-0000-0000-000000000004',
  emma:     'c1000001-0000-0000-0000-000000000005',
  fatima:   'c1000001-0000-0000-0000-000000000006',
  david:    'c1000001-0000-0000-0000-000000000007',
  aisha:    'c1000001-0000-0000-0000-000000000008',
  robert:   'c1000001-0000-0000-0000-000000000009',
  layla:    'c1000001-0000-0000-0000-000000000010',
  michael:  'c1000001-0000-0000-0000-000000000011',
  nora:     'c1000001-0000-0000-0000-000000000012',
}

const employees = [
  { id: E.ahmed,  full_name: 'Ahmed Al Rashidi',  phone: '+971501234001', email: 'ahmed@safaeewala.com',  role: 'crew_lead', nationality: 'Pakistani', emirates_id: '784-1988-1234001-1', visa_expiry: d(210), work_permit_expiry: d(210), medical_insurance_expiry: d(60), passport_expiry: d(400), skills: ['Deep Clean','Carpet','Post-construction'], status: 'active',   pay_rate_hourly: 18, joined_date: '2022-03-01', created_at: ts(-500) },
  { id: E.raju,   full_name: 'Raju Kumar',         phone: '+971501234002', email: null,                   role: 'cleaner',   nationality: 'Indian',    emirates_id: '784-1992-1234002-1', visa_expiry: d(120), work_permit_expiry: d(120), medical_insurance_expiry: d(60), passport_expiry: d(450), skills: ['Standard Clean','Deep Clean'],                    status: 'active',   pay_rate_hourly: 12, joined_date: '2022-06-15', created_at: ts(-480) },
  { id: E.tariq,  full_name: 'Mohammad Tariq',     phone: '+971501234003', email: null,                   role: 'cleaner',   nationality: 'Pakistani', emirates_id: '784-1990-1234003-1', visa_expiry: d(75),  work_permit_expiry: d(75),  medical_insurance_expiry: d(60), passport_expiry: d(40),  skills: ['Standard Clean','Window','Office'],              status: 'active',   pay_rate_hourly: 12, joined_date: '2023-01-10', created_at: ts(-360) },
  { id: E.suresh, full_name: 'Suresh Patel',       phone: '+971501234004', email: null,                   role: 'cleaner',   nationality: 'Indian',    emirates_id: '784-1995-1234004-1', visa_expiry: d(170), work_permit_expiry: d(170), medical_insurance_expiry: d(60), passport_expiry: d(340), skills: ['Deep Clean','Move-in','Move-out'],                status: 'active',   pay_rate_hourly: 12, joined_date: '2023-04-20', created_at: ts(-320) },
  { id: E.bilal,  full_name: 'Bilal Hassan',       phone: '+971501234005', email: 'bilal@safaeewala.com', role: 'crew_lead', nationality: 'Pakistani', emirates_id: '784-1987-1234005-1', visa_expiry: d(30),  work_permit_expiry: d(30),  medical_insurance_expiry: d(120), passport_expiry: d(240), skills: ['Commercial','Post-construction','Deep Clean'],   status: 'active',   pay_rate_hourly: 18, joined_date: '2021-11-05', created_at: ts(-600) },
  { id: E.arjun,  full_name: 'Arjun Singh',        phone: '+971501234006', email: null,                   role: 'cleaner',   nationality: 'Indian',    emirates_id: '784-1993-1234006-1', visa_expiry: d(140), work_permit_expiry: d(140), medical_insurance_expiry: d(60), passport_expiry: d(470), skills: ['Standard Clean','Carpet','Sofa'],                 status: 'active',   pay_rate_hourly: 12, joined_date: '2023-07-01', created_at: ts(-280) },
  { id: E.nasser, full_name: 'Nasser Al Mansoori', phone: '+971501234007', email: null,                   role: 'crew_lead', nationality: 'Emirati',   emirates_id: '784-1985-1234007-1', visa_expiry: d(300), work_permit_expiry: d(300), medical_insurance_expiry: d(180), passport_expiry: d(600), skills: ['All services'],                                  status: 'on_leave', pay_rate_hourly: 20, joined_date: '2021-05-15', created_at: ts(-700) },
  { id: E.priya,  full_name: 'Priya Nair',         phone: '+971501234008', email: null,                   role: 'cleaner',   nationality: 'Indian',    emirates_id: '784-1996-1234008-1', visa_expiry: d(91),  work_permit_expiry: d(91),  medical_insurance_expiry: d(60), passport_expiry: d(400), skills: ['Standard Clean','Deep Clean','Move-in'],          status: 'active',   pay_rate_hourly: 12, joined_date: '2024-01-15', created_at: ts(-140) },
]

const clients = [
  { id: C.sarah,    full_name: 'Sarah Johnson',       phone: '+971501111001', whatsapp: '+971501111001', email: 'sarah.j@email.com',   building_name: 'Marina Pinnacle',      area: 'Dubai Marina',    city: 'Dubai',     access_notes: 'Key with concierge desk',               pet_info: null,                              preferred_cleaner: 'Ahmed Al Rashidi', total_bookings: 8,  total_spent: 3200, last_service: d(-3),  created_at: ts(-480) },
  { id: C.mohammed, full_name: 'Mohammed Al Hamdan',  phone: '+971501111002', whatsapp: '+971501111002', email: null,                   building_name: 'Palm Tower',           area: 'Palm Jumeirah',   city: 'Dubai',     access_notes: 'Call 30 min before arrival',            pet_info: null,                              preferred_cleaner: null,               total_bookings: 12, total_spent: 5800, last_service: d(-1),  created_at: ts(-700) },
  { id: C.jennifer, full_name: 'Jennifer Chen',       phone: '+971501111003', whatsapp: '+971501111003', email: 'jennifer.c@email.com', building_name: 'JBR Residences',       area: 'JBR',             city: 'Dubai',     access_notes: 'Doorbell code: 4521',                   pet_info: 'One cat — use pet-safe products only',     preferred_cleaner: null,               total_bookings: 5,  total_spent: 1850, last_service: d(-7),  created_at: ts(-320) },
  { id: C.khalid,   full_name: 'Khalid Al Rashid',    phone: '+971501111004', whatsapp: '+971501111004', email: null,                   building_name: 'Al Barsha Heights',    area: 'Al Barsha',       city: 'Dubai',     access_notes: null,                                    pet_info: null,                              preferred_cleaner: null,               total_bookings: 6,  total_spent: 2100, last_service: d(-11), created_at: ts(-420) },
  { id: C.emma,     full_name: 'Emma Williams',       phone: '+971501111005', whatsapp: '+971501111005', email: 'emma.w@email.com',     building_name: 'Jumeirah Bay Villa',   area: 'Jumeirah',        city: 'Dubai',     access_notes: 'Garden gate on the left side',          pet_info: 'Two dogs — note on crew brief',            preferred_cleaner: null,               total_bookings: 4,  total_spent: 2400, last_service: d(-10), created_at: ts(-390) },
  { id: C.fatima,   full_name: 'Fatima Al Zaabi',     phone: '+971501111006', whatsapp: '+971501111006', email: null,                   building_name: 'Mirdif Hills',         area: 'Mirdif',          city: 'Dubai',     access_notes: null,                                    pet_info: null,                              preferred_cleaner: null,               total_bookings: 9,  total_spent: 3600, last_service: d(-1),  created_at: ts(-550) },
  { id: C.david,    full_name: 'David Thompson',      phone: '+971501111007', whatsapp: '+971501111007', email: 'david.t@email.com',    building_name: 'Burj Vista',           area: 'Downtown Dubai',  city: 'Dubai',     access_notes: 'Parking pass — collect from concierge', pet_info: null,                              preferred_cleaner: null,               total_bookings: 3,  total_spent: 1500, last_service: d(-16), created_at: ts(-170) },
  { id: C.aisha,    full_name: 'Aisha Al Nuaimi',     phone: '+971501111008', whatsapp: '+971501111008', email: null,                   building_name: 'Deira Tower',          area: 'Deira',           city: 'Dubai',     access_notes: null,                                    pet_info: null,                              preferred_cleaner: null,               total_bookings: 7,  total_spent: 2450, last_service: d(-13), created_at: ts(-440) },
  { id: C.robert,   full_name: 'Robert Brown',        phone: '+971501111009', whatsapp: '+971501111009', email: 'robert.b@email.com',   building_name: 'Bay Square',           area: 'Business Bay',    city: 'Dubai',     access_notes: null,                                    pet_info: null,                              preferred_cleaner: null,               total_bookings: 2,  total_spent: 900,  last_service: d(-32), created_at: ts(-110) },
  { id: C.layla,    full_name: 'Layla Hassan',        phone: '+971501111010', whatsapp: '+971501111010', email: null,                   building_name: 'Arabian Ranches Villa',area: 'Arabian Ranches', city: 'Dubai',     access_notes: 'Please bring vacuum — no equipment',    pet_info: null,                              preferred_cleaner: null,               total_bookings: 11, total_spent: 4800, last_service: d(-2),  created_at: ts(-620) },
  { id: C.michael,  full_name: 'Michael Scott',       phone: '+971501111011', whatsapp: '+971501111011', email: 'michael.s@email.com',  building_name: 'Cluster J Tower',      area: 'JLT',             city: 'Dubai',     access_notes: null,                                    pet_info: null,                              preferred_cleaner: null,               total_bookings: 4,  total_spent: 1600, last_service: d(-21), created_at: ts(-300) },
  { id: C.nora,     full_name: 'Nora Al Kaabi',       phone: '+971501111012', whatsapp: '+971501111012', email: null,                   building_name: 'Yas Acres Villa',      area: 'Yas Island',      city: 'Abu Dhabi', access_notes: null,                                    pet_info: null,                              preferred_cleaner: null,               total_bookings: 3,  total_spent: 1350, last_service: d(-26), created_at: ts(-160) },
]

const bookings = [
  // Completed - past
  { id: uid(), client_id: C.sarah,    client_name: 'Sarah Johnson',      client_phone: '+971501111001', service_address: 'Marina Pinnacle, Dubai Marina',          service_type: 'Deep Clean',         status: 'completed', frequency: 'monthly',   scheduled_date: d(-27), scheduled_time: '09:00', duration_hours: 4, assigned_crew: [E.ahmed, E.raju],            notes: 'Monthly deep clean', total_amount: 400, created_at: ts(-30) },
  { id: uid(), client_id: C.mohammed, client_name: 'Mohammed Al Hamdan', client_phone: '+971501111002', service_address: 'Palm Tower, Palm Jumeirah',               service_type: 'Standard Clean',     status: 'completed', frequency: 'weekly',    scheduled_date: d(-22), scheduled_time: '10:00', duration_hours: 3, assigned_crew: [E.tariq, E.suresh],          notes: null, total_amount: 350, created_at: ts(-25) },
  { id: uid(), client_id: C.fatima,   client_name: 'Fatima Al Zaabi',    client_phone: '+971501111006', service_address: 'Mirdif Hills, Mirdif',                   service_type: 'Standard Clean',     status: 'completed', frequency: 'biweekly',  scheduled_date: d(-20), scheduled_time: '08:00', duration_hours: 3, assigned_crew: [E.bilal, E.arjun],           notes: null, total_amount: 300, created_at: ts(-22) },
  { id: uid(), client_id: C.emma,     client_name: 'Emma Williams',      client_phone: '+971501111005', service_address: 'Jumeirah Bay Villa 12, Jumeirah',         service_type: 'Deep Clean',         status: 'completed', frequency: 'once',      scheduled_date: d(-17), scheduled_time: '09:00', duration_hours: 5, assigned_crew: [E.ahmed, E.raju, E.suresh],  notes: 'Deep clean + garden area', total_amount: 600, created_at: ts(-20) },
  { id: uid(), client_id: C.layla,    client_name: 'Layla Hassan',       client_phone: '+971501111010', service_address: 'Arabian Ranches Villa 45',               service_type: 'Move-out',           status: 'completed', frequency: 'once',      scheduled_date: d(-14), scheduled_time: '08:00', duration_hours: 6, assigned_crew: [E.bilal, E.priya],           notes: 'Full move-out, tenancy ending', total_amount: 750, created_at: ts(-17) },
  { id: uid(), client_id: C.mohammed, client_name: 'Mohammed Al Hamdan', client_phone: '+971501111002', service_address: 'Palm Tower, Palm Jumeirah',               service_type: 'Standard Clean',     status: 'completed', frequency: 'weekly',    scheduled_date: d(-15), scheduled_time: '10:00', duration_hours: 3, assigned_crew: [E.tariq],                    notes: null, total_amount: 350, created_at: ts(-17) },
  { id: uid(), client_id: C.khalid,   client_name: 'Khalid Al Rashid',   client_phone: '+971501111004', service_address: 'Al Barsha Heights, Al Barsha',           service_type: 'Office',             status: 'completed', frequency: 'monthly',   scheduled_date: d(-12), scheduled_time: '07:00', duration_hours: 4, assigned_crew: [E.ahmed, E.arjun],           notes: 'Office — 3 rooms', total_amount: 450, created_at: ts(-14) },
  { id: uid(), client_id: C.jennifer, client_name: 'Jennifer Chen',      client_phone: '+971501111003', service_address: 'JBR Residences Apt 1204, JBR',           service_type: 'Carpet',             status: 'completed', frequency: 'once',      scheduled_date: d(-7),  scheduled_time: '11:00', duration_hours: 3, assigned_crew: [E.arjun],                    notes: 'Carpet cleaning — living room + 2 bedrooms', total_amount: 350, created_at: ts(-10) },
  { id: uid(), client_id: C.sarah,    client_name: 'Sarah Johnson',      client_phone: '+971501111001', service_address: 'Marina Pinnacle, Dubai Marina',          service_type: 'Standard Clean',     status: 'completed', frequency: 'monthly',   scheduled_date: d(-3),  scheduled_time: '09:00', duration_hours: 3, assigned_crew: [E.raju],                     notes: null, total_amount: 300, created_at: ts(-5) },
  { id: uid(), client_id: C.fatima,   client_name: 'Fatima Al Zaabi',    client_phone: '+971501111006', service_address: 'Mirdif Hills, Mirdif',                   service_type: 'Deep Clean',         status: 'completed', frequency: 'biweekly',  scheduled_date: d(-1),  scheduled_time: '08:00', duration_hours: 4, assigned_crew: [E.bilal, E.suresh],          notes: null, total_amount: 400, created_at: ts(-3) },
  { id: uid(), client_id: C.aisha,    client_name: 'Aisha Al Nuaimi',    client_phone: '+971501111008', service_address: 'Deira Tower, Deira',                     service_type: 'Standard Clean',     status: 'completed', frequency: 'once',      scheduled_date: d(-13), scheduled_time: '10:00', duration_hours: 3, assigned_crew: [E.priya],                    notes: null, total_amount: 300, created_at: ts(-15) },
  { id: uid(), client_id: C.michael,  client_name: 'Michael Scott',      client_phone: '+971501111011', service_address: 'Cluster J Tower Apt 1502, JLT',          service_type: 'Deep Clean',         status: 'completed', frequency: 'once',      scheduled_date: d(-21), scheduled_time: '11:00', duration_hours: 4, assigned_crew: [E.bilal, E.arjun],           notes: null, total_amount: 450, created_at: ts(-24) },
  // Today
  { id: uid(), client_id: C.mohammed, client_name: 'Mohammed Al Hamdan', client_phone: '+971501111002', service_address: 'Palm Tower, Palm Jumeirah',               service_type: 'Standard Clean',     status: 'in_progress', frequency: 'weekly',  scheduled_date: d(0),   scheduled_time: '09:00', duration_hours: 3, assigned_crew: [E.tariq, E.suresh],          notes: null, total_amount: 350, created_at: ts(-2) },
  { id: uid(), client_id: C.aisha,    client_name: 'Aisha Al Nuaimi',    client_phone: '+971501111008', service_address: 'Deira Tower, Deira',                     service_type: 'Deep Clean',         status: 'confirmed',   frequency: 'once',    scheduled_date: d(0),   scheduled_time: '14:00', duration_hours: 4, assigned_crew: [E.ahmed, E.raju],            notes: null, total_amount: 450, created_at: ts(-2) },
  // Upcoming
  { id: uid(), client_id: C.david,    client_name: 'David Thompson',     client_phone: '+971501111007', service_address: 'Burj Vista Apt 3201, Downtown Dubai',     service_type: 'Standard Clean',     status: 'confirmed',   frequency: 'monthly', scheduled_date: d(2),   scheduled_time: '10:00', duration_hours: 3, assigned_crew: [E.priya],                    notes: null, total_amount: 300, created_at: ts(-1) },
  { id: uid(), client_id: C.layla,    client_name: 'Layla Hassan',       client_phone: '+971501111010', service_address: 'Arabian Ranches Villa 45',               service_type: 'Move-in',            status: 'confirmed',   frequency: 'once',    scheduled_date: d(4),   scheduled_time: '08:00', duration_hours: 6, assigned_crew: [E.bilal, E.arjun, E.priya],  notes: 'New tenancy move-in clean', total_amount: 750, created_at: ts(-1) },
  { id: uid(), client_id: C.michael,  client_name: 'Michael Scott',      client_phone: '+971501111011', service_address: 'Cluster J Tower Apt 1502, JLT',          service_type: 'Standard Clean',     status: 'pending',     frequency: 'biweekly',scheduled_date: d(6),   scheduled_time: '11:00', duration_hours: 3, assigned_crew: [E.raju],                     notes: null, total_amount: 300, created_at: ts(0) },
  { id: uid(), client_id: C.sarah,    client_name: 'Sarah Johnson',      client_phone: '+971501111001', service_address: 'Marina Pinnacle, Dubai Marina',          service_type: 'Deep Clean',         status: 'confirmed',   frequency: 'monthly', scheduled_date: d(7),   scheduled_time: '09:00', duration_hours: 4, assigned_crew: [E.ahmed, E.raju],            notes: 'Monthly deep clean', total_amount: 400, created_at: ts(0) },
  { id: uid(), client_id: C.khalid,   client_name: 'Khalid Al Rashid',   client_phone: '+971501111004', service_address: 'Al Barsha Heights, Al Barsha',           service_type: 'Post-construction',  status: 'pending',     frequency: 'once',    scheduled_date: d(9),   scheduled_time: '07:00', duration_hours: 8, assigned_crew: [E.ahmed, E.tariq, E.suresh], notes: 'Post-construction after renovation', total_amount: 1200, created_at: ts(0) },
  { id: uid(), client_id: C.nora,     client_name: 'Nora Al Kaabi',      client_phone: '+971501111012', service_address: 'Yas Acres Villa 8, Yas Island',          service_type: 'Standard Clean',     status: 'confirmed',   frequency: 'monthly', scheduled_date: d(11),  scheduled_time: '10:00', duration_hours: 3, assigned_crew: [E.arjun],                    notes: null, total_amount: 350, created_at: ts(0) },
  // Cancelled
  { id: uid(), client_id: C.robert,   client_name: 'Robert Brown',       client_phone: '+971501111009', service_address: 'Bay Square Apt 805, Business Bay',       service_type: 'Standard Clean',     status: 'cancelled',   frequency: 'once',    scheduled_date: d(-9),  scheduled_time: '12:00', duration_hours: 3, assigned_crew: [E.priya],                    notes: 'Client cancelled last minute', total_amount: 300, created_at: ts(-11) },
  { id: uid(), client_id: C.jennifer, client_name: 'Jennifer Chen',      client_phone: '+971501111003', service_address: 'JBR Residences Apt 1204, JBR',           service_type: 'Window',             status: 'cancelled',   frequency: 'once',    scheduled_date: d(-18), scheduled_time: '13:00', duration_hours: 2, assigned_crew: [E.raju],                     notes: null, total_amount: 200, created_at: ts(-20) },
]

const li = (desc: string, qty: number, price: number) => ({
  description: desc, quantity: qty, unit_price: price, amount: qty * price,
})

const makeInvoice = (num: string, cId: string, cName: string, cAddr: string, desc: string, amt: number, status: string, daysAgo: number, paid = false) => {
  const sub = amt; const vat = Math.round(sub * 0.05 * 100) / 100; const total = sub + vat
  return {
    id: uid(), invoice_number: num, client_id: cId, client_name: cName,
    client_address: cAddr, trn: '', company_trn: '100234567890003',
    line_items: [li(desc, 1, amt)],
    subtotal: sub, vat_rate: 5, vat_amount: vat, total,
    status, due_date: d(-daysAgo + 10),
    paid_date: paid ? d(-daysAgo + 5) : null,
    notes: 'Payment due within 10 days. Bank transfer or cash accepted.',
    created_at: ts(-daysAgo),
  }
}

const invoices = [
  makeInvoice('INV-2026-001', C.sarah,    'Sarah Johnson',      'Marina Pinnacle, Dubai Marina',    'Deep Clean Service',          400,  'paid',    27, true),
  makeInvoice('INV-2026-002', C.mohammed, 'Mohammed Al Hamdan', 'Palm Tower, Palm Jumeirah',        'Standard Cleaning Service',   350,  'paid',    22, true),
  makeInvoice('INV-2026-003', C.emma,     'Emma Williams',      'Jumeirah Bay Villa 12, Jumeirah',  'Deep Clean + Garden',         600,  'paid',    17, true),
  makeInvoice('INV-2026-004', C.layla,    'Layla Hassan',       'Arabian Ranches Villa 45',         'Move-out Cleaning',           750,  'paid',    14, true),
  makeInvoice('INV-2026-005', C.khalid,   'Khalid Al Rashid',   'Al Barsha Heights, Al Barsha',     'Office Cleaning Service',     450,  'paid',    12, true),
  makeInvoice('INV-2026-006', C.jennifer, 'Jennifer Chen',      'JBR Residences Apt 1204, JBR',     'Carpet Cleaning',             350,  'paid',     7, true),
  makeInvoice('INV-2026-007', C.fatima,   'Fatima Al Zaabi',    'Mirdif Hills, Mirdif',             'Deep Clean Service',          400,  'paid',     1, true),
  makeInvoice('INV-2026-008', C.aisha,    'Aisha Al Nuaimi',    'Deira Tower, Deira',               'Deep Clean Service',          450,  'sent',     0),
  makeInvoice('INV-2026-009', C.david,    'David Thompson',     'Burj Vista Apt 3201, Downtown',    'Standard Cleaning',           300,  'sent',     0),
  makeInvoice('INV-2026-010', C.michael,  'Michael Scott',      'Cluster J Tower Apt 1502, JLT',    'Deep Clean Service',          450,  'overdue', 18),
  makeInvoice('INV-2026-011', C.nora,     'Nora Al Kaabi',      'Yas Acres Villa 8, Yas Island',    'Standard Cleaning',           350,  'overdue', 26),
  makeInvoice('INV-2026-012', C.layla,    'Layla Hassan',       'Arabian Ranches Villa 45',         'Move-in Cleaning',            750,  'draft',    0),
]

const inventory = [
  { id: uid(), name: 'All-Purpose Cleaner 5L',   category: 'Chemicals',   unit: 'Bottle', current_stock: 12, min_stock: 5,  reorder_quantity: 10, unit_cost: 35,  supplier: 'Gulf Chem Supplies',   location: 'Main Store', last_restocked: d(-8),  created_at: ts(-180) },
  { id: uid(), name: 'Microfibre Cloths (Pack 10)', category: 'Equipment', unit: 'Pack',   current_stock: 8,  min_stock: 4,  reorder_quantity: 10, unit_cost: 25,  supplier: 'CleanPro UAE',          location: 'Main Store', last_restocked: d(-15), created_at: ts(-180) },
  { id: uid(), name: 'Floor Mop Set',             category: 'Equipment',   unit: 'Set',    current_stock: 6,  min_stock: 3,  reorder_quantity: 5,  unit_cost: 55,  supplier: 'CleanPro UAE',          location: 'Main Store', last_restocked: d(-30), created_at: ts(-180) },
  { id: uid(), name: 'Vacuum Cleaner Bags',       category: 'Equipment',   unit: 'Pack',   current_stock: 3,  min_stock: 5,  reorder_quantity: 10, unit_cost: 20,  supplier: 'Gulf Chem Supplies',   location: 'Van Storage', last_restocked: d(-45), created_at: ts(-180) },
  { id: uid(), name: 'Bleach 2L',                 category: 'Chemicals',   unit: 'Bottle', current_stock: 20, min_stock: 8,  reorder_quantity: 12, unit_cost: 12,  supplier: 'Gulf Chem Supplies',   location: 'Main Store', last_restocked: d(-5),  created_at: ts(-180) },
  { id: uid(), name: 'Glass Cleaner 1L',          category: 'Chemicals',   unit: 'Bottle', current_stock: 2,  min_stock: 4,  reorder_quantity: 8,  unit_cost: 18,  supplier: 'CleanPro UAE',          location: 'Main Store', last_restocked: d(-20), created_at: ts(-180) },
  { id: uid(), name: 'Rubber Gloves (M)',         category: 'PPE',         unit: 'Pair',   current_stock: 30, min_stock: 10, reorder_quantity: 20, unit_cost: 5,   supplier: 'Safety First LLC',      location: 'Main Store', last_restocked: d(-3),  created_at: ts(-180) },
  { id: uid(), name: 'Carpet Shampoo 5L',         category: 'Chemicals',   unit: 'Bottle', current_stock: 4,  min_stock: 2,  reorder_quantity: 6,  unit_cost: 80,  supplier: 'Gulf Chem Supplies',   location: 'Van Storage', last_restocked: d(-12), created_at: ts(-180) },
  { id: uid(), name: 'Scrubbing Pads Pack',       category: 'Equipment',   unit: 'Pack',   current_stock: 15, min_stock: 5,  reorder_quantity: 10, unit_cost: 15,  supplier: 'CleanPro UAE',          location: 'Main Store', last_restocked: d(-7),  created_at: ts(-180) },
  { id: uid(), name: 'Disinfectant Spray 750ml',  category: 'Chemicals',   unit: 'Bottle', current_stock: 18, min_stock: 6,  reorder_quantity: 12, unit_cost: 22,  supplier: 'Gulf Chem Supplies',   location: 'Main Store', last_restocked: d(-4),  created_at: ts(-180) },
]

const staffNames = ['Ahmed Al Rashidi', 'Bilal Hassan', 'Raju Kumar', 'Mohammad Tariq', 'Suresh Patel', 'Arjun Singh', 'Priya Nair']
const areas      = ['Dubai Marina', 'Palm Jumeirah', 'JBR', 'Al Barsha', 'Mirdif', 'Downtown Dubai', 'Deira', 'Business Bay', 'JLT', 'Arabian Ranches']
const modes: Array<'Cash' | 'Online' | 'Pending' | 'Monthly'> = ['Cash', 'Cash', 'Online', 'Online', 'Pending', 'Monthly']
const materials: Array<'No' | 'Yes' | 'Sofa'> = ['No', 'No', 'Yes', 'Sofa']

function makeDayJobs(date: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const startH = 8 + i
    const endH   = startH + 2 + (i % 2)
    const charges = [250, 300, 350, 400, 450, 500][i % 6]
    const mode    = modes[i % modes.length]
    const received = mode === 'Pending' || mode === 'Monthly' ? 0 : charges
    return {
      id: uid(), created_at: `${date}T06:00:00Z`, date,
      staff_name:   staffNames[i % staffNames.length],
      start_time:   `${String(startH).padStart(2, '0')}:00`,
      end_time:     `${String(endH).padStart(2, '0')}:00`,
      duty_hours:   endH - startH,
      address:      `Flat ${100 + i * 3}, ${areas[i % areas.length]}`,
      area:         areas[i % areas.length],
      material:     materials[i % materials.length],
      charges, received, payment_mode: mode,
      is_overtime:  i === count - 1 && count > 5,
      remarks:      i === 0 ? 'Deep clean requested' : i === 2 ? 'Sofa machine' : '',
    }
  })
}

function makeDayExpenses(date: string) {
  return [
    { id: uid(), created_at: `${date}T06:00:00Z`, date, name: 'Ahmed Al Rashidi', category: 'Fuel',    amount: 80  },
    { id: uid(), created_at: `${date}T06:00:00Z`, date, name: 'Bilal Hassan',     category: 'Parking', amount: 30  },
  ]
}

const dailyJobs: any[]     = []
const dailyExpenses: any[] = []
for (let i = 6; i >= 0; i--) {
  const date = d(-i)
  const count = 4 + (i % 4)
  dailyJobs.push(...makeDayJobs(date, count))
  dailyExpenses.push(...makeDayExpenses(date))
}

/* ── Seed function ── */
export async function seedDemoData(onProgress: (msg: string) => void) {
  async function insert(table: string, rows: any[]) {
    onProgress(`Inserting ${rows.length} ${table}…`)
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) console.error(`${table} error:`, error.message)
  }

  await insert('employees',      employees)
  await insert('clients',        clients)
  await insert('bookings',       bookings)
  await insert('invoices',       invoices)
  await insert('inventory',      inventory)
  await insert('daily_jobs',     dailyJobs)
  await insert('daily_expenses', dailyExpenses)
  onProgress('Done! Refresh the page to see demo data.')
}
