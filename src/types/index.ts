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
  duration_hours: number
  assigned_crew: string[]
  notes?: string
  total_amount: number
  created_at: string
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
  pet_info?: string
  preferred_cleaner?: string
  total_bookings: number
  total_spent: number
  last_service?: string
  created_at: string
}

export interface Employee {
  id: string
  full_name: string
  phone: string
  email?: string
  role: 'crew_lead' | 'cleaner'
  nationality: string
  emirates_id: string
  visa_expiry: string
  work_permit_expiry: string
  medical_insurance_expiry: string
  passport_expiry: string
  skills: string[]
  status: 'active' | 'on_leave' | 'inactive'
  pay_rate_hourly: number
  joined_date: string
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
