export type UserRole = 'owner' | 'office_staff' | 'crew_lead' | 'cleaner'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  avatar_url?: string
  phone?: string
  created_at: string
}

export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
export type BookingFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly'

export interface Booking {
  id: string
  client_id: string
  client_name: string
  client_phone: string
  service_address: string
  service_type: string
  status: BookingStatus
  frequency: BookingFrequency
  scheduled_date: string
  scheduled_time: string
  end_time?: string
  duration_hours: number
  assigned_crew: string[]
  notes?: string
  total_amount: number
  created_at: string
  source?: 'fluent_forms' | 'whatsapp' | 'manual' | 'daily_job_sheet' | string
}

export interface Client {
  id: string
  full_name: string
  email?: string
  phone: string
  whatsapp?: string
  nationality?: string
  building_name?: string
  apartment?: string
  area: string
  city: string
  access_notes?: string
  remarks?: string
  notes?: string
  source?: 'fluent_forms' | 'whatsapp' | 'manual' | 'daily_job_sheet' | string
  pet_info?: string
  preferred_cleaner?: string
  advance_amount?: number
  adjustment_amount?: number
  pending_amount?: number
  service_days?: string[]
  scheduled_time?: string
  end_time?: string
  duration_hours?: number
  day_cleaner_assignments?: Record<string, string>
  day_schedules?: Record<string, { startTime: string; endTime: string; cleaner: string; duration?: number }>
  total_bookings: number
  total_spent: number
  last_service?: string
  created_at: string
}

export type EmployeeRole = 'cleaner' | 'supervisor' | 'crew_lead' | 'ducting' | 'technical' | 'store_cleaner' | 'driver'

export interface EmployeeDocument {
  id: string
  name: string
  category: 'eid' | 'passport' | 'visa' | 'work_permit' | 'driving_license' | 'medical_insurance' | 'noc' | 'other'
  file_data?: string // data URL or base64 string
  file_type?: string
  file_size?: number
  uploaded_at: string
  start_date?: string
  end_date?: string
  document_number?: string
  notes?: string
}

export interface AgencyCommissionPayout {
  id: string
  agency_id: string
  amount: number
  payment_date: string
  period_start?: string
  period_end?: string
  payment_method: 'bank_transfer' | 'cheque' | 'cash' | 'credit'
  reference_no?: string
  status: 'paid' | 'pending' | 'processing'
  payment_type?: 'salary' | 'advance'
  cleaner_id?: string
  cleaner_name?: string
  notes?: string
  created_at: string
}

export type AgencySalaryPayout = AgencyCommissionPayout

export interface AgencyContactPerson {
  id: string
  name: string
  phone?: string
  email?: string
  role?: string
}

export type AgencyDocumentCategory =
  | 'trade_license'
  | 'tax_registration'
  | 'agreement'
  | 'noc'
  | 'emirates_id'
  | 'passport'
  | 'workmen_compensation'

export interface AgencyDocument {
  id: string
  name: string
  category: AgencyDocumentCategory | 'other'
  file_data?: string // data URL or base64 string
  file_type?: string
  file_size?: number
  uploaded_at: string
  is_active?: boolean
  archived_at?: string
  version?: number
  notes?: string
}

export interface Agency {
  id: string
  name: string
  company_type?: 'Parent Company' | 'Third Party'
  contact_person?: string
  contact_persons?: AgencyContactPerson[]
  phone: string
  email?: string
  address?: string
  commission_rate?: number
  commission_type?: 'percentage' | 'fixed_hourly' | 'fixed_monthly'
  fixed_commission_amount?: number
  payment_terms?: string
  termination_notice?: string
  notes?: string
  status: 'active' | 'inactive'
  created_at: string

  // Contract & Agreement Details
  contract_ref?: string
  contract_start_date?: string
  contract_end_date?: string
  trade_license_no?: string
  license_issue_date?: string
  license_expiry_date?: string
  price?: number
  contracted_amount?: number
  trn_no?: string
  noc_no?: string
  sla_terms?: string
  replacement_guarantee?: string
  replacement_guarantee_enabled?: boolean
  quota_cleaners?: number
  documents?: AgencyDocument[]

  // Owner / signatory identity documents
  emirates_id_no?: string
  emirates_id_issue_date?: string
  emirates_id_expiry_date?: string
  passport_no?: string
  passport_issue_date?: string
  passport_expiry_date?: string
  emergency_contact?: string
  workmen_comp_policy_no?: string
  bank_details?: {
    bank_name?: string
    iban?: string
    account_title?: string
  }
  payouts?: AgencyCommissionPayout[]
}

export interface Employee {
  id: string
  full_name: string
  phone: string
  email?: string
  role: EmployeeRole
  designation?: string
  photo_url?: string // profile picture as a resized data URL
  gender?: 'male' | 'female' | 'other' | string
  nationality: string

  // Emirates ID (EID)
  emirates_id: string
  eid_start_date?: string
  eid_end_date?: string
  eid_file?: string

  // Passport
  passport_number?: string
  passport_start_date?: string
  passport_expiry: string
  passport_end_date?: string
  passport_file?: string

  // Visa
  visa_number?: string
  visa_start_date?: string
  visa_expiry: string
  visa_end_date?: string
  visa_file?: string

  // Work Permit
  work_permit_number?: string
  work_permit_start_date?: string
  work_permit_expiry: string
  work_permit_end_date?: string
  work_permit_file?: string

  // Driving License (for Drivers)
  driving_license_no?: string
  driving_license_place_of_issue?: string
  driving_license_issue_date?: string
  driving_license_expiry_date?: string
  driving_license_type?: string
  driving_license_file?: string
  assigned_vehicle?: string

  // Financial & Insurance / NOC Terms
  pay_rate_hourly: number
  monthly_salary?: number
  medical_insurance?: string
  medical_insurance_expiry?: string
  medical_insurance_file?: string
  joined_date: string
  end_date?: string
  noc?: string
  noc_file?: string

  status: 'active' | 'on_leave' | 'inactive' | 'engaged_in_project'

  // Cleaners & Technical
  skills: string[]
  assigned_client_ids?: string[]

  // Sourcing Agency
  agency_id?: string
  agency_name?: string

  // Attached Documents History
  documents?: EmployeeDocument[]

  created_at: string
}

export interface Invoice {
  id: string
  invoice_number: string
  booking_id?: string
  client_id: string
  client_name: string
  client_address: string
  trn?: string
  company_trn: string
  line_items: InvoiceLineItem[]
  subtotal: number
  vat_amount: number
  vat_rate: number
  total: number
  status: 'draft' | 'sent' | 'paid' | 'overdue'
  due_date: string
  paid_date?: string
  notes?: string
  created_at: string
  apply_vat?: boolean
  discount_type?: 'flat' | 'percentage'
  discount_value?: number
  discount_amount?: number
}

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

export interface InventoryItem {
  id: string
  name: string
  category: string
  unit: string
  current_stock: number
  min_stock: number
  reorder_quantity: number
  unit_cost: number
  supplier?: string
  location: string
  last_restocked?: string
  created_at: string
}

export type PaymentMode = 'Cash' | 'Online' | 'Pending' | 'Monthly' | 'Above'
export type MaterialType = 'No' | 'Yes' | 'Sofa' | 'Ladder' | 'Sofa Seat'

export interface DailyJob {
  id: string
  created_at: string
  date: string
  staff_name: string
  start_time: string
  end_time: string
  duty_hours: number
  ot_hours?: number
  address: string
  area: string
  material: MaterialType
  charges: number
  received: number
  payment_mode: PaymentMode
  is_overtime: boolean
  remarks: string
  service?: string
  booking_id?: string
  status?: string
}

export interface DailyExpense {
  id: string
  created_at: string
  date: string
  name: string
  category: string
  amount: number
  source?: 'Daily Job Sheet' | 'Direct Expense' | string
  payment_method?: 'Cash' | 'Credit Card' | 'Bank Transfer' | 'Petty Cash' | 'Online' | string
  reference_number?: string
  vendor?: string
  notes?: string
}

export interface DashboardStats {
  total_bookings_today: number
  revenue_today: number
  revenue_month: number
  active_clients: number
  active_employees: number
  pending_invoices: number
  low_stock_items: number
  avg_rating: number
}

export interface DailyPendingItem {
  id: string
  date: string
  client: string
  amount: number
}

export interface DailyPendingReceivedItem {
  id: string
  date: string
  client: string
  cash: number
  online: number
  client_id?: string
  previous_pending?: number
  remaining_pending?: number
  notes?: string
  remarks?: string
  /** Collection made against one specific job (Pending Payments / Payments collect) */
  job_id?: string
  /** Part of this collection that cleared the client's opening balance (pending_amount) */
  opening_applied?: number
  /** How this collection was split over the client's unpaid jobs */
  allocations?: { job_id: string; amount: number }[]
}

export interface DailyAdvanceItem {
  id: string
  date: string
  client: string
  received: number
  advance: number
}

export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'converted' | 'lost'

export interface FluentFormLead {
  id: string
  created_at: string
  form_id?: string | number
  form_title: string
  entry_id?: string | number
  source_url: string
  page_source: string
  category: string
  client_name: string
  email: string
  phone: string
  whatsapp?: string
  address?: string
  area?: string
  property_type?: string
  preferred_date?: string
  preferred_time?: string
  service?: string
  message?: string
  estimated_value?: number
  status: LeadStatus
  booking_id?: string
  raw_data?: Record<string, any>
}

export interface RecurringContract {
  id: string
  clientName: string
  clientEmail?: string
  clientPhone?: string
  serviceType: string
  frequency: 'weekly' | 'biweekly' | 'monthly'
  amount: number
  startDate: string
  renewalDate: string
  status: 'active' | 'paused' | 'cancelled'
  lastBilled: string
  nextBillingDate: string
  notes?: string
}
