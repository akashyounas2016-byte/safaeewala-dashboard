import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react'
import type { Booking, Client, Employee, Invoice, InventoryItem, DailyJob, DailyExpense, Agency } from '../types'
import { supabase } from '@/lib/supabase'
import { extractAllClientsFromDailyJobs, extractAllEmployeesFromDailyJobs, crewToStaffName } from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'
import { seedBookings, seedClients, seedInvoices, seedInventory, seedEmployees } from '@/lib/seedData'
import { addHoursToTime } from '@/lib/utils'

export const defaultAgencies: Agency[] = [
  {
    id: 'agency-safaeewala',
    name: 'Safaeewala',
    company_type: 'Parent Company',
    contact_person: 'Corporate Operations Desk',
    contact_persons: [
      { id: 'cp-saf-1', name: 'Corporate Operations Desk', phone: '+971 4 800 7232', email: 'operations@safaeewala.com', role: 'Head of Operations' },
      { id: 'cp-saf-2', name: 'Compliance & Fleet Director', phone: '+971 50 123 4567', email: 'compliance@safaeewala.com', role: 'Compliance Officer' }
    ],
    phone: '+971 4 800 7232',
    email: 'info@safaeewala.com',
    address: 'Al Barsha 1, Sheikh Zayed Road, Dubai, UAE',
    commission_rate: 0,
    commission_type: 'percentage',
    payment_terms: 'Internal Corporate / Parent HQ',
    termination_notice: 'Not Applicable (Parent Company)',
    notes: 'Parent Company Headquarters & Corporate Master Fleet for Safaeewala Group',
    status: 'active',
    contract_ref: 'PARENT-HQ-SAFAEEWALA',
    contract_start_date: '2023-01-01',
    contract_end_date: '2030-12-31',
    trade_license_no: 'TL-DXB-982103',
    trn_no: '100452391000003',
    noc_no: 'NOC-DXB-2023-001',
    quota_cleaners: 12,
    contracted_amount: 0,
    replacement_guarantee: 'Safaeewala Corporate Fleet Pool',
    replacement_guarantee_enabled: true,
    bank_details: {
      bank_name: 'Emirates NBD',
      iban: 'AE990260001009876543210',
      account_title: 'Safaeewala'
    },
    created_at: new Date('2023-01-01').toISOString(),
  },
]

interface DataStore {
  bookings:  Booking[]
  clients:   Client[]
  employees: Employee[]
  agencies:  Agency[]
  invoices:  Invoice[]
  inventory: InventoryItem[]
  loading:   boolean

  addBooking:      (b: Omit<Booking, 'id' | 'created_at'>) => void
  updateBooking:   (id: string, patch: Partial<Booking>) => void
  deleteBooking:   (id: string) => void

  addClient:       (c: Omit<Client, 'id' | 'created_at'>) => void
  updateClient:    (id: string, patch: Partial<Client>) => void
  deleteClient:    (id: string) => void

  addEmployee:     (e: Omit<Employee, 'id' | 'created_at'>) => void
  updateEmployee:  (id: string, patch: Partial<Employee>) => void
  deleteEmployee:  (id: string) => void

  addAgency:       (a: Omit<Agency, 'id' | 'created_at'>) => void
  updateAgency:    (id: string, patch: Partial<Agency>) => void
  deleteAgency:    (id: string) => void

  addInvoice:      (i: Omit<Invoice, 'id' | 'created_at'>) => void
  updateInvoice:   (id: string, patch: Partial<Invoice>) => void
  deleteInvoice:   (id: string) => void

  addInventory:    (i: Omit<InventoryItem, 'id' | 'created_at'>) => void
  updateInventory: (id: string, patch: Partial<InventoryItem>) => void
  reorderItem:     (id: string) => void

  dailyJobs:          DailyJob[]
  dailyExpenses:      DailyExpense[]
  addDailyJob:        (j: Omit<DailyJob, 'id' | 'created_at'>) => void
  updateDailyJob:     (id: string, patch: Partial<DailyJob>) => void
  deleteDailyJob:     (id: string) => void
  addDailyExpense:    (e: Omit<DailyExpense, 'id' | 'created_at'>) => void
  updateDailyExpense: (id: string, patch: Partial<DailyExpense>) => void
  deleteDailyExpense: (id: string) => void
  clearDailyData:     (date: string) => void
  clearAllDailyData:  () => Promise<void>
}

const DataContext = createContext<DataStore | null>(null)

/* ── Fire-and-forget audit logger — silently skips if table doesn't exist ── */
function logAudit(action: string, entity: string, entityId: string, entityName: string, details?: string) {
  supabase.auth.getUser()
    .then(({ data: { user } }) =>
      supabase.from('audit_log').insert({
        user_name:   user?.email ?? 'System',
        action,
        entity,
        entity_id:   entityId,
        entity_name: entityName,
        details:     details ?? null,
      })
    )
    .catch(() => {})
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
function now() { return new Date().toISOString() }

function safeNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const str = String(val).trim()
  if (!str || str === '—' || str === '-' || str.toLowerCase() === 'nil' || str.toLowerCase() === 'pending' || str.toLowerCase() === 'monthly') return 0
  const cleaned = str.replace(/[^0-9.-]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [bookings,      setBookings]      = useState<Booking[]>(() => {
    const saved = safeLocalStorageGet<Booking[]>('safaeewala_bookings', [])
    return saved.length > 0 ? saved : (seedBookings as Booking[])
  })
  const [clients,       setClients]       = useState<Client[]>(() => {
    const saved = safeLocalStorageGet<Client[]>('safaeewala_clients', [])
    return saved.length > 0 ? saved : (seedClients as unknown as Client[])
  })
  const [employees,     setEmployees]     = useState<Employee[]>(() => {
    const saved = safeLocalStorageGet<Employee[]>('safaeewala_employees', [])
    return saved.length > 0 ? saved : (seedEmployees as Employee[])
  })
  const [invoices,      setInvoices]      = useState<Invoice[]>(() => {
    const saved = safeLocalStorageGet<Invoice[]>('safaeewala_invoices', [])
    return saved.length > 0 ? saved : (seedInvoices as Invoice[])
  })
  const [inventory,     setInventory]     = useState<InventoryItem[]>(() => {
    const saved = safeLocalStorageGet<InventoryItem[]>('safaeewala_inventory', [])
    return saved.length > 0 ? saved : (seedInventory as InventoryItem[])
  })
  const [dailyJobs,     setDailyJobs]     = useState<DailyJob[]>(() =>
    safeLocalStorageGet<DailyJob[]>('safaeewala_daily_jobs', [])
  )
  const [dailyExpenses, setDailyExpenses] = useState<DailyExpense[]>(() =>
    safeLocalStorageGet<DailyExpense[]>('safaeewala_daily_expenses', [])
  )
  const [agencies, setAgencies] = useState<Agency[]>(() => {
    const saved = safeLocalStorageGet<Agency[]>('safaeewala_agencies', [])
    if (saved.length > 0) {
      const merged = saved.map(a => {
        const d = defaultAgencies.find(x => x.id === a.id)
        // Normalize any old hardcoded long name from previous sessions back to user clean name or 'Safaeewala'
        const rawName = (a.name === 'Safaeewala Cleaning & Technical Services LLC' || a.name === 'Safaeewala Cleaning & Maintenance LLC')
          ? 'Safaeewala'
          : a.name
        return d ? {
          ...d,
          ...a,
          name: rawName || d.name,
          noc_no: a.noc_no || d.noc_no,
          trade_license_no: a.trade_license_no || d.trade_license_no,
          license_issue_date: a.license_issue_date || d.license_issue_date,
          license_expiry_date: a.license_expiry_date || d.license_expiry_date,
          payouts: a.payouts || d.payouts
        } : a
      })
      const hasSafaeewala = merged.some(a => a.id === 'agency-safaeewala' || a.name.toLowerCase().includes('safaeewala'))
      if (!hasSafaeewala) {
        const saf = defaultAgencies.find(d => d.id === 'agency-safaeewala')
        if (saf) merged.unshift(saf)
      }
      return merged
    }
    return defaultAgencies
  })
  const [loading,       setLoading]       = useState(true)
  const [companyTRN,    setCompanyTRN]    = useState('100234567890003')

  // Auto-persist agencies to localStorage
  useEffect(() => {
    if (agencies.length > 0) {
      safeLocalStorageSet('safaeewala_agencies', agencies)
    }
  }, [agencies])

  // Auto-persist employees to localStorage
  useEffect(() => {
    if (employees.length > 0) {
      safeLocalStorageSet('safaeewala_employees', employees)
    }
  }, [employees])

  // Auto-persist bookings, clients, invoices, inventory, dailyJobs, dailyExpenses to localStorage
  useEffect(() => {
    if (bookings.length > 0) {
      safeLocalStorageSet('safaeewala_bookings', bookings)
    }
  }, [bookings])

  useEffect(() => {
    if (clients.length > 0) {
      safeLocalStorageSet('safaeewala_clients', clients)
    }
  }, [clients])

  useEffect(() => {
    if (invoices.length > 0) {
      safeLocalStorageSet('safaeewala_invoices', invoices)
    }
  }, [invoices])

  useEffect(() => {
    if (inventory.length > 0) {
      safeLocalStorageSet('safaeewala_inventory', inventory)
    }
  }, [inventory])

  useEffect(() => {
    if (dailyJobs.length > 0) {
      safeLocalStorageSet('safaeewala_daily_jobs', dailyJobs)
    }
  }, [dailyJobs])

  useEffect(() => {
    if (dailyExpenses.length > 0) {
      safeLocalStorageSet('safaeewala_daily_expenses', dailyExpenses)
    }
  }, [dailyExpenses])

  /* ── Load all data on mount with fast timeout guard so offline database never hangs ── */
  useEffect(() => {
    const q = async (table: string, order = 'created_at'): Promise<any[]> => {
      try {
        const timeoutPromise = new Promise<any[]>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 2000)
        )
        const fetchPromise = supabase.from(table).select('*').order(order, { ascending: false }).then(r => r.data ?? [])
        const data = await Promise.race([fetchPromise, timeoutPromise])
        return data ?? []
      } catch { return [] }
    }

    // Load company settings for TRN used in auto-invoices
    supabase.from('company_settings').select('data').eq('id', 1).single()
      .then(({ data }) => { if (data?.data?.company?.trn) setCompanyTRN(data.data.company.trn) })

    // Load persisted agencies from backend microservice to guarantee synchronization across local and VPS
    fetch('/api/agencies')
      .then(r => r.ok ? r.json() : null)
      .then(serverAgencies => {
        if (serverAgencies && Array.isArray(serverAgencies) && serverAgencies.length > 0) {
          setAgencies(prev => {
            const next = serverAgencies.map((sa: Agency) => {
              const current = prev.find(p => p.id === sa.id)
              return current ? { ...current, ...sa } : sa
            })
            safeLocalStorageSet('safaeewala_agencies', next)
            return next
          })
        }
      })
      .catch(() => {})

    q('agencies').then(dbAgencies => {
      if (dbAgencies && dbAgencies.length > 0) {
        setAgencies(dbAgencies as Agency[])
        safeLocalStorageSet('safaeewala_agencies', dbAgencies as Agency[])
      }
    }).catch(() => {})

    Promise.all([
      q('bookings'),
      q('clients'),
      q('employees'),
      q('invoices'),
      q('inventory'),
      q('daily_jobs',     'date'),
      q('daily_expenses', 'date'),
    ]).then(([b, c, e, i, inv, dj, de]) => {
      if (b && b.length > 0) {
        setBookings(b as Booking[])
      } else {
        const saved = safeLocalStorageGet<Booking[]>('safaeewala_bookings', [])
        if (saved.length > 0) setBookings(saved)
        else setBookings(seedBookings as Booking[])
      }

      if (c && c.length > 0) {
        setClients(c as Client[])
      } else {
        const saved = safeLocalStorageGet<Client[]>('safaeewala_clients', [])
        if (saved.length > 0) setClients(saved)
        else setClients(seedClients as unknown as Client[])
      }

      if (e && e.length > 0) {
        setEmployees(e as Employee[])
      } else {
        const saved = safeLocalStorageGet<Employee[]>('safaeewala_employees', [])
        if (saved.length > 0) setEmployees(saved)
        else setEmployees(seedEmployees as Employee[])
      }

      if (i && i.length > 0) {
        setInvoices(i as Invoice[])
      } else {
        const saved = safeLocalStorageGet<Invoice[]>('safaeewala_invoices', [])
        if (saved.length > 0) setInvoices(saved)
        else setInvoices(seedInvoices as Invoice[])
      }

      if (inv && inv.length > 0) {
        setInventory(inv as InventoryItem[])
      } else {
        const saved = safeLocalStorageGet<InventoryItem[]>('safaeewala_inventory', [])
        if (saved.length > 0) setInventory(saved)
        else setInventory(seedInventory as InventoryItem[])
      }

      let initialJobs = ((dj || []) as any[]).map(j => ({
        ...j,
        charges: safeNum(j.charges),
        received: safeNum(j.received),
        duty_hours: safeNum(j.duty_hours),
        ot_hours: safeNum(j.ot_hours),
        service: j.service || '',
      }))
      if (initialJobs.length > 0) {
        setDailyJobs(initialJobs)
      } else {
        const savedJobs = safeLocalStorageGet<DailyJob[]>('safaeewala_daily_jobs', [])
        if (savedJobs.length > 0) setDailyJobs(savedJobs)
      }

      let initialExp = ((de || []) as any[]).map(x => ({
        ...x,
        amount: safeNum(x.amount),
      }))
      if (initialExp.length > 0) {
        setDailyExpenses(initialExp)
      } else {
        const savedExp = safeLocalStorageGet<DailyExpense[]>('safaeewala_daily_expenses', [])
        if (savedExp.length > 0) setDailyExpenses(savedExp)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Older booking-synced rows stored employee IDs in staff_name; show them as cleaner names
  // everywhere (read-only — the row is rewritten with names the next time it is saved)
  const viewDailyJobs = useMemo(() => {
    const byId = new Map(employees.map(e => [e.id, e.full_name]))
    return dailyJobs.map(j => {
      if (!j.staff_name || !j.staff_name.split(",").some(t => byId.has(t.trim()))) return j
      return { ...j, staff_name: j.staff_name.split(",").map(t => byId.get(t.trim()) || t.trim()).join(", ") }
    })
  }, [dailyJobs, employees])

  const allClients = useMemo(() => {
    return extractAllClientsFromDailyJobs(viewDailyJobs, clients)
  }, [viewDailyJobs, clients])

  const allEmployees = useMemo(() => {
    return extractAllEmployeesFromDailyJobs(viewDailyJobs, employees)
  }, [viewDailyJobs, employees])

  const store: DataStore = {
    bookings, clients: allClients, employees: allEmployees, agencies, invoices, inventory, loading,
    dailyJobs: viewDailyJobs, dailyExpenses,

    /* ── Bookings ── */
    addBooking: (b) => {
      // Resolve client_id: link to existing client by name or create a new one
      const matchedClient = clients.find(
        c => c.full_name.toLowerCase().trim() === b.client_name.toLowerCase().trim()
      )
      let resolvedClientId = b.client_id || ''
      if (matchedClient) {
        resolvedClientId = matchedClient.id
        if (!matchedClient.source && b.source) {
          const updated = { ...matchedClient, source: b.source }
          setClients(p => p.map(c => c.id === matchedClient.id ? updated : c))
          supabase.from('clients').update({ source: b.source }).eq('id', matchedClient.id).then(() => {})
        }
      } else if (!resolvedClientId) {
        const newClient: Client = {
          id: uid(), created_at: now(),
          full_name: b.client_name, phone: b.client_phone,
          area: '', city: 'Dubai',
          total_bookings: 0, total_spent: 0,
          last_service: b.scheduled_date,
          source: b.source || undefined,
        }
        resolvedClientId = newClient.id
        setClients(p => [newClient, ...p])
        supabase.from('clients').insert(newClient).then(({ error }) => { if (error) console.error(error) })
      }

      const row = { ...b, id: uid(), created_at: now(), client_id: resolvedClientId }
      setBookings(p => [row, ...p])
      supabase.from('bookings').insert(row).then(({ error }) => { if (error) console.error(error) })
      logAudit('created', 'booking', row.id, b.client_name, `${b.service_type} · ${b.scheduled_date}`)

      // Automatically synchronize with Daily Job Sheet
      const jobRow: DailyJob = {
        id: uid(),
        created_at: now(),
        date: b.scheduled_date || new Date().toISOString().split('T')[0],
        staff_name: crewToStaffName(b.assigned_crew, allEmployees) || 'Unassigned',
        start_time: b.scheduled_time || '09:00',
        end_time: b.end_time || addHoursToTime(b.scheduled_time || '09:00', b.duration_hours || 3),
        duty_hours: safeNum(b.duration_hours || 3),
        ot_hours: 0,
        address: b.service_address || `${b.client_name} - Dubai`,
        area: 'Dubai',
        material: 'No',
        charges: safeNum(b.total_amount || 0),
        received: b.status === 'completed' ? safeNum(b.total_amount || 0) : 0,
        payment_mode: b.frequency === 'monthly' ? 'Monthly' : 'Cash',
        is_overtime: false,
        remarks: b.notes ? `[Booking] ${b.notes}` : `Booking: ${b.service_type || 'Standard Clean'}`,
        service: b.service_type || 'Standard Clean',
        booking_id: row.id,
      }
      setDailyJobs(p => {
        const next = [jobRow, ...p]
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      supabase.from('daily_jobs').insert(jobRow).then(({ error }) => { if (error) console.error(error) })
    },
    updateBooking: (id, patch) => {
      const booking = bookings.find(b => b.id === id)
      setBookings(p => p.map(b => b.id === id ? { ...b, ...patch } : b))
      supabase.from('bookings').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
      if (patch.status && booking) logAudit('status_changed', 'booking', id, booking.client_name, `${booking.status} → ${patch.status}`)

      // Update synchronized DailyJob row if exists
      setDailyJobs(p => {
        const hasLinked = p.some(j => j.booking_id === id)
        if (!hasLinked) return p
        const next = p.map(j => {
          if (j.booking_id !== id) return j
          return {
            ...j,
            date: patch.scheduled_date ?? j.date,
            start_time: patch.scheduled_time ?? j.start_time,
            end_time: patch.end_time ?? j.end_time,
            duty_hours: patch.duration_hours ? safeNum(patch.duration_hours) : j.duty_hours,
            staff_name: crewToStaffName(patch.assigned_crew, allEmployees) || j.staff_name,
            address: patch.service_address ?? j.address,
            charges: patch.total_amount !== undefined ? safeNum(patch.total_amount) : j.charges,
            service: patch.service_type ?? j.service,
            received: patch.status === 'completed' ? (patch.total_amount !== undefined ? safeNum(patch.total_amount) : j.charges) : j.received,
          }
        })
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })

      // When a booking is marked completed for the first time:
      if (patch.status === 'completed' && booking && booking.status !== 'completed') {
        // 1. Update client total_spent + total_bookings + last_service
        const client = clients.find(c =>
          c.full_name.toLowerCase().trim() === booking.client_name.toLowerCase().trim()
        )
        if (client) {
          const clientPatch = {
            total_spent:    client.total_spent + booking.total_amount,
            total_bookings: client.total_bookings + 1,
            last_service:   booking.scheduled_date,
          }
          setClients(p => p.map(c => c.id === client.id ? { ...c, ...clientPatch } : c))
          supabase.from('clients').update(clientPatch).eq('id', client.id)
            .then(({ error }) => { if (error) console.error(error) })
        }

        // 2. Auto-create a draft invoice
        const sub = booking.total_amount
        const vat = Math.round(sub * 0.05 * 100) / 100
        const due = new Date(); due.setDate(due.getDate() + 10)
        const invoice = {
          id: uid(), created_at: now(),
          invoice_number: `INV-${Date.now().toString().slice(-6)}`,
          client_id: booking.client_id,
          client_name: booking.client_name,
          client_address: booking.service_address,
          trn: '', company_trn: companyTRN,
          line_items: [{ description: `${booking.service_type} — ${booking.scheduled_date}`, quantity: 1, unit_price: sub, amount: sub }],
          subtotal: sub, vat_rate: 5, vat_amount: vat, total: sub + vat,
          status: 'draft' as const,
          due_date: due.toISOString().split('T')[0],
          notes: 'Payment due within 10 days. Bank transfer or cash accepted.',
        }
        setInvoices(p => [invoice, ...p])
        supabase.from('invoices').insert(invoice).then(({ error }) => { if (error) console.error(error) })

        // Auto-schedule next occurrence for recurring bookings
        if (booking.frequency !== 'once') {
          const d = new Date(booking.scheduled_date)
          if (booking.frequency === 'weekly')   d.setDate(d.getDate() + 7)
          else if (booking.frequency === 'biweekly') d.setDate(d.getDate() + 14)
          else if (booking.frequency === 'monthly')  d.setMonth(d.getMonth() + 1)
          const nextRow = {
            ...booking,
            id: uid(), created_at: now(),
            status: 'confirmed' as const,
            scheduled_date: d.toISOString().split('T')[0],
          }
          setBookings(p => [nextRow, ...p])
          supabase.from('bookings').insert(nextRow).then(({ error }) => { if (error) console.error(error) })
        }
      }
    },
    deleteBooking: (id) => {
      const b = bookings.find(b => b.id === id)
      setBookings(p => p.filter(b => b.id !== id))
      supabase.from('bookings').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
      setDailyJobs(p => {
        const next = p.filter(j => j.booking_id !== id)
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      supabase.from('daily_jobs').delete().eq('booking_id', id).then(({ error }) => { if (error) console.error(error) })
      if (b) logAudit('deleted', 'booking', id, b.client_name)
    },

    /* ── Clients ── */
    addClient: (c) => {
      const row = { ...c, id: uid(), created_at: now() }
      setClients(p => [row, ...p])
      supabase.from('clients').insert(row).then(({ error }) => { if (error) console.error(error) })
      logAudit('created', 'client', row.id, c.full_name)
    },
    updateClient: (id, patch) => {
      setClients(p => {
        const exists = p.some(c => c.id === id)
        if (exists) {
          return p.map(c => c.id === id ? { ...c, ...patch } : c)
        }
        const discovered = allClients.find(c => c.id === id)
        if (discovered) {
          const newSaved = { ...discovered, ...patch }
          supabase.from('clients').insert(newSaved).then(({ error }) => { if (error) console.error(error) })
          return [newSaved, ...p]
        }
        return p
      })
      supabase.from('clients').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    deleteClient: (id) => {
      const c = clients.find(c => c.id === id)
      setClients(p => p.filter(c => c.id !== id))
      supabase.from('clients').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
      if (c) logAudit('deleted', 'client', id, c.full_name)
    },

    /* ── Employees ── */
    addEmployee: (e) => {
      const row = { ...e, id: uid(), created_at: now() }
      setEmployees(p => [row, ...p])
      supabase.from('employees').insert(row).then(({ error }) => { if (error) console.error(error) })
      logAudit('created', 'employee', row.id, e.full_name, e.role)
    },
    updateEmployee: (id, patch) => {
      setEmployees(p => {
        const exists = p.some(e => e.id === id)
        if (exists) {
          return p.map(e => e.id === id ? { ...e, ...patch } : e)
        }
        const discovered = allEmployees.find(e => e.id === id)
        if (discovered) {
          const newSaved = { ...discovered, ...patch }
          supabase.from('employees').insert(newSaved).then(({ error }) => { if (error) console.error(error) })
          return [newSaved, ...p]
        }
        return p
      })
      supabase.from('employees').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    deleteEmployee: (id) => {
      const e = employees.find(e => e.id === id)
      setEmployees(p => p.filter(e => e.id !== id))
      supabase.from('employees').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
      if (e) logAudit('deleted', 'employee', id, e.full_name)
    },

    /* ── Agencies ── */
    addAgency: (a) => {
      const row: Agency = { ...a, id: uid(), created_at: now() }
      setAgencies(p => {
        const next = [row, ...p]
        safeLocalStorageSet('safaeewala_agencies', next)
        fetch('/api/agencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: next })
        }).catch(() => {})
        return next
      })
      supabase.from('agencies').insert(row).then(({ error }) => { if (error) console.error(error) })
      logAudit('created', 'agency', row.id, a.name)
    },
    updateAgency: (id, patch) => {
      setAgencies(p => {
        const next = p.map(a => a.id === id ? { ...a, ...patch } : a)
        safeLocalStorageSet('safaeewala_agencies', next)
        fetch('/api/agencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, patch, all: next })
        }).catch(() => {})
        return next
      })
      supabase.from('agencies').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
      if (id === 'agency-safaeewala' && patch.name) {
        supabase.from('company_settings').upsert({
          id: 1,
          data: { company: { company_name: patch.name, trading_name: patch.name } }
        }).then(({ error }) => { if (error) console.error(error) })
      }
      logAudit('updated', 'agency', id, patch.name || id)
    },
    deleteAgency: (id) => {
      const a = agencies.find(a => a.id === id)
      setAgencies(p => {
        const next = p.filter(a => a.id !== id)
        safeLocalStorageSet('safaeewala_agencies', next)
        fetch('/api/agencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: next })
        }).catch(() => {})
        return next
      })
      supabase.from('agencies').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
      if (a) logAudit('deleted', 'agency', id, a.name)
    },

    /* ── Invoices ── */
    addInvoice: (i) => {
      const row = { ...i, id: uid(), created_at: now() }
      setInvoices(p => [row, ...p])
      supabase.from('invoices').insert(row).then(({ error }) => { if (error) console.error(error) })
      logAudit('created', 'invoice', row.id, i.client_name, `AED ${i.total} · ${i.invoice_number}`)
    },
    updateInvoice: (id, patch) => {
      const inv = invoices.find(i => i.id === id)
      setInvoices(p => p.map(i => i.id === id ? { ...i, ...patch } : i))
      supabase.from('invoices').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
      if (patch.status && inv) logAudit('status_changed', 'invoice', id, inv.client_name, `${inv.status} → ${patch.status}`)
    },
    deleteInvoice: (id) => {
      const inv = invoices.find(i => i.id === id)
      setInvoices(p => p.filter(i => i.id !== id))
      supabase.from('invoices').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
      if (inv) logAudit('deleted', 'invoice', id, inv.client_name)
    },

    /* ── Inventory ── */
    addInventory: (i) => {
      const row = { ...i, id: uid(), created_at: now() }
      setInventory(p => [row, ...p])
      supabase.from('inventory').insert(row).then(({ error }) => { if (error) console.error(error) })
    },
    updateInventory: (id, patch) => {
      setInventory(p => p.map(i => i.id === id ? { ...i, ...patch } : i))
      supabase.from('inventory').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    /* ── Daily Job Sheet ── */
    addDailyJob: (j) => {
      const row = {
        ...j,
        charges: safeNum(j.charges),
        received: safeNum(j.received),
        duty_hours: safeNum(j.duty_hours),
        ot_hours: safeNum(j.ot_hours),
        service: j.service || '',
        id: uid(),
        created_at: now()
      }
      setDailyJobs(p => {
        const next = [row, ...p]
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      supabase.from('daily_jobs').insert(row).then(({ error }) => { if (error) console.error(error) })
    },
    updateDailyJob: (id, patch) => {
      const sanitizedPatch = { ...patch }
      if ('charges' in patch) sanitizedPatch.charges = safeNum(patch.charges)
      if ('received' in patch) sanitizedPatch.received = safeNum(patch.received)
      if ('duty_hours' in patch) sanitizedPatch.duty_hours = safeNum(patch.duty_hours)
      if ('ot_hours' in patch) sanitizedPatch.ot_hours = safeNum(patch.ot_hours)
      if ('service' in patch) sanitizedPatch.service = patch.service || ''
      setDailyJobs(p => {
        const next = p.map(j => j.id === id ? { ...j, ...sanitizedPatch } : j)
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      supabase.from('daily_jobs').update(sanitizedPatch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    deleteDailyJob: (id) => {
      setDailyJobs(p => {
        const next = p.filter(j => j.id !== id)
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      supabase.from('daily_jobs').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    addDailyExpense: (e) => {
      const row = { ...e, amount: safeNum(e.amount), id: uid(), created_at: now() }
      setDailyExpenses(p => {
        const next = [row, ...p]
        safeLocalStorageSet('safaeewala_daily_expenses', next)
        return next
      })
      supabase.from('daily_expenses').insert(row).then(({ error }) => { if (error) console.error(error) })
    },
    updateDailyExpense: (id, patch) => {
      const sanitizedPatch = { ...patch }
      if ('amount' in sanitizedPatch) sanitizedPatch.amount = safeNum(sanitizedPatch.amount)
      setDailyExpenses(p => {
        const next = p.map(e => e.id === id ? { ...e, ...sanitizedPatch } : e)
        safeLocalStorageSet('safaeewala_daily_expenses', next)
        return next
      })
      supabase.from('daily_expenses').update(sanitizedPatch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    deleteDailyExpense: (id) => {
      setDailyExpenses(p => {
        const next = p.filter(e => e.id !== id)
        safeLocalStorageSet('safaeewala_daily_expenses', next)
        return next
      })
      supabase.from('daily_expenses').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    clearDailyData: (date) => {
      setDailyJobs(p => {
        const next = p.filter(j => j.date !== date)
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      setDailyExpenses(p => {
        const next = p.filter(e => e.date !== date)
        safeLocalStorageSet('safaeewala_daily_expenses', next)
        return next
      })
      supabase.from('daily_jobs').delete().eq('date', date).then(({ error }) => { if (error) console.error(error) })
      supabase.from('daily_expenses').delete().eq('date', date).then(({ error }) => { if (error) console.error(error) })
    },
    clearAllDailyData: async () => {
      setDailyJobs([])
      setDailyExpenses([])
      safeLocalStorageSet('safaeewala_daily_jobs', [])
      safeLocalStorageSet('safaeewala_daily_expenses', [])
      try {
        await Promise.allSettled([
          supabase.from('daily_jobs').delete().not('id', 'is', null),
          supabase.from('daily_expenses').delete().not('id', 'is', null),
        ])
      } catch (err) {
        console.error('Error clearing all daily data from Supabase:', err)
      }
    },

    reorderItem: (id) => {
      const item = inventory.find(i => i.id === id)
      if (!item) return
      const newStock = item.current_stock + item.reorder_quantity
      const lastRestocked = new Date().toISOString().split('T')[0]
      setInventory(p => p.map(i => i.id === id ? { ...i, current_stock: newStock, last_restocked: lastRestocked } : i))
      supabase.from('inventory').update({ current_stock: newStock, last_restocked: lastRestocked }).eq('id', id)
        .then(({ error }) => { if (error) console.error(error) })
    },
  }

  return <DataContext.Provider value={store}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
