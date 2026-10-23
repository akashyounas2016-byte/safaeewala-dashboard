import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react'
import type { Booking, Client, Employee, Invoice, InventoryItem, DailyJob, DailyExpense } from '../types'
import { supabase } from '@/lib/supabase'
import { extractAllClientsFromDailyJobs, extractAllEmployeesFromDailyJobs } from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'

interface DataStore {
  bookings:  Booking[]
  clients:   Client[]
  employees: Employee[]
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
  const [bookings,      setBookings]      = useState<Booking[]>([])
  const [clients,       setClients]       = useState<Client[]>([])
  const [employees,     setEmployees]     = useState<Employee[]>([])
  const [invoices,      setInvoices]      = useState<Invoice[]>([])
  const [inventory,     setInventory]     = useState<InventoryItem[]>([])
  const [dailyJobs,     setDailyJobs]     = useState<DailyJob[]>(() =>
    safeLocalStorageGet<DailyJob[]>('safaeewala_daily_jobs', [])
  )
  const [dailyExpenses, setDailyExpenses] = useState<DailyExpense[]>(() =>
    safeLocalStorageGet<DailyExpense[]>('safaeewala_daily_expenses', [])
  )
  const [loading,       setLoading]       = useState(true)
  const [companyTRN,    setCompanyTRN]    = useState('100234567890003')

  // Auto-persist dailyJobs and dailyExpenses to localStorage for instant 0ms loads (safe quota handling)
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

    Promise.all([
      q('bookings'),
      q('clients'),
      q('employees'),
      q('invoices'),
      q('inventory'),
      q('daily_jobs',     'date'),
      q('daily_expenses', 'date'),
    ]).then(([b, c, e, i, inv, dj, de]) => {
      setBookings(b     as Booking[])
      setClients(c      as Client[])
      setEmployees(e    as Employee[])
      setInvoices(i     as Invoice[])
      setInventory(inv  as InventoryItem[])
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

  const allClients = useMemo(() => {
    return extractAllClientsFromDailyJobs(dailyJobs, clients)
  }, [dailyJobs, clients])

  const allEmployees = useMemo(() => {
    return extractAllEmployeesFromDailyJobs(dailyJobs, employees)
  }, [dailyJobs, employees])

  const store: DataStore = {
    bookings, clients: allClients, employees: allEmployees, invoices, inventory, loading,
    dailyJobs, dailyExpenses,

    /* ── Bookings ── */
    addBooking: (b) => {
      // Resolve client_id: link to existing client by name or create a new one
      const matchedClient = clients.find(
        c => c.full_name.toLowerCase().trim() === b.client_name.toLowerCase().trim()
      )
      let resolvedClientId = b.client_id || ''
      if (matchedClient) {
        resolvedClientId = matchedClient.id
      } else if (!resolvedClientId) {
        const newClient: Client = {
          id: uid(), created_at: now(),
          full_name: b.client_name, phone: b.client_phone,
          area: '', city: 'Dubai',
          total_bookings: 0, total_spent: 0,
          last_service: b.scheduled_date,
        }
        resolvedClientId = newClient.id
        setClients(p => [newClient, ...p])
        supabase.from('clients').insert(newClient).then(({ error }) => { if (error) console.error(error) })
      }

      const row = { ...b, id: uid(), created_at: now(), client_id: resolvedClientId }
      setBookings(p => [row, ...p])
      supabase.from('bookings').insert(row).then(({ error }) => { if (error) console.error(error) })
      logAudit('created', 'booking', row.id, b.client_name, `${b.service_type} · ${b.scheduled_date}`)
    },
    updateBooking: (id, patch) => {
      const booking = bookings.find(b => b.id === id)
      setBookings(p => p.map(b => b.id === id ? { ...b, ...patch } : b))
      supabase.from('bookings').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
      if (patch.status && booking) logAudit('status_changed', 'booking', id, booking.client_name, `${booking.status} → ${patch.status}`)

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
