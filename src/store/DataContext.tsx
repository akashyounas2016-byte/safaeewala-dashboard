import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Booking, Client, Employee, Invoice, InventoryItem, DailyJob, DailyExpense } from '../types'
import { supabase } from '@/lib/supabase'

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
  deleteDailyExpense: (id: string) => void
}

const DataContext = createContext<DataStore | null>(null)

function uid() { return crypto.randomUUID() }
function now() { return new Date().toISOString() }

export function DataProvider({ children }: { children: ReactNode }) {
  const [bookings,      setBookings]      = useState<Booking[]>([])
  const [clients,       setClients]       = useState<Client[]>([])
  const [employees,     setEmployees]     = useState<Employee[]>([])
  const [invoices,      setInvoices]      = useState<Invoice[]>([])
  const [inventory,     setInventory]     = useState<InventoryItem[]>([])
  const [dailyJobs,     setDailyJobs]     = useState<DailyJob[]>([])
  const [dailyExpenses, setDailyExpenses] = useState<DailyExpense[]>([])
  const [loading,       setLoading]       = useState(true)

  /* ── Load all data on mount — each table is fetched independently so a
       missing table (e.g. daily_jobs not created yet) never blocks the others ── */
  useEffect(() => {
    const q = async (table: string, order = 'created_at'): Promise<any[]> => {
      try {
        const { data } = await supabase.from(table).select('*').order(order, { ascending: false })
        return data ?? []
      } catch { return [] }
    }

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
      setDailyJobs(dj   as DailyJob[])
      setDailyExpenses(de as DailyExpense[])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const store: DataStore = {
    bookings, clients, employees, invoices, inventory, loading,
    dailyJobs, dailyExpenses,

    /* ── Bookings ── */
    addBooking: (b) => {
      const row = { ...b, id: uid(), created_at: now() }
      setBookings(p => [row, ...p])
      supabase.from('bookings').insert(row).then(({ error }) => { if (error) console.error(error) })

      // Auto-create client if they don't already exist
      setClients(prev => {
        const exists = prev.some(c => c.full_name.toLowerCase().trim() === b.client_name.toLowerCase().trim())
        if (exists) return prev
        const newClient: Client = {
          id: uid(), created_at: now(),
          full_name: b.client_name,
          phone: b.client_phone,
          area: '', city: 'Dubai',
          total_bookings: 1,
          total_spent: b.total_amount,
          last_service: b.scheduled_date,
        }
        supabase.from('clients').insert(newClient).then(({ error }) => { if (error) console.error(error) })
        return [newClient, ...prev]
      })
    },
    updateBooking: (id, patch) => {
      const booking = bookings.find(b => b.id === id)
      setBookings(p => p.map(b => b.id === id ? { ...b, ...patch } : b))
      supabase.from('bookings').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })

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
          trn: '', company_trn: '100234567890003',
          line_items: [{ description: `${booking.service_type} — ${booking.scheduled_date}`, quantity: 1, unit_price: sub, amount: sub }],
          subtotal: sub, vat_rate: 5, vat_amount: vat, total: sub + vat,
          status: 'draft' as const,
          due_date: due.toISOString().split('T')[0],
          notes: 'Payment due within 10 days. Bank transfer or cash accepted.',
        }
        setInvoices(p => [invoice, ...p])
        supabase.from('invoices').insert(invoice).then(({ error }) => { if (error) console.error(error) })
      }
    },
    deleteBooking: (id) => {
      setBookings(p => p.filter(b => b.id !== id))
      supabase.from('bookings').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },

    /* ── Clients ── */
    addClient: (c) => {
      const row = { ...c, id: uid(), created_at: now() }
      setClients(p => [row, ...p])
      supabase.from('clients').insert(row).then(({ error }) => { if (error) console.error(error) })
    },
    updateClient: (id, patch) => {
      setClients(p => p.map(c => c.id === id ? { ...c, ...patch } : c))
      supabase.from('clients').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    deleteClient: (id) => {
      setClients(p => p.filter(c => c.id !== id))
      supabase.from('clients').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },

    /* ── Employees ── */
    addEmployee: (e) => {
      const row = { ...e, id: uid(), created_at: now() }
      setEmployees(p => [row, ...p])
      supabase.from('employees').insert(row).then(({ error }) => { if (error) console.error(error) })
    },
    updateEmployee: (id, patch) => {
      setEmployees(p => p.map(e => e.id === id ? { ...e, ...patch } : e))
      supabase.from('employees').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    deleteEmployee: (id) => {
      setEmployees(p => p.filter(e => e.id !== id))
      supabase.from('employees').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },

    /* ── Invoices ── */
    addInvoice: (i) => {
      const row = { ...i, id: uid(), created_at: now() }
      setInvoices(p => [row, ...p])
      supabase.from('invoices').insert(row).then(({ error }) => { if (error) console.error(error) })
    },
    updateInvoice: (id, patch) => {
      setInvoices(p => p.map(i => i.id === id ? { ...i, ...patch } : i))
      supabase.from('invoices').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    deleteInvoice: (id) => {
      setInvoices(p => p.filter(i => i.id !== id))
      supabase.from('invoices').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
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
      const row = { ...j, id: uid(), created_at: now() }
      setDailyJobs(p => [row, ...p])
      supabase.from('daily_jobs').insert(row).then(({ error }) => { if (error) console.error(error) })
    },
    updateDailyJob: (id, patch) => {
      setDailyJobs(p => p.map(j => j.id === id ? { ...j, ...patch } : j))
      supabase.from('daily_jobs').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    deleteDailyJob: (id) => {
      setDailyJobs(p => p.filter(j => j.id !== id))
      supabase.from('daily_jobs').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
    },
    addDailyExpense: (e) => {
      const row = { ...e, id: uid(), created_at: now() }
      setDailyExpenses(p => [row, ...p])
      supabase.from('daily_expenses').insert(row).then(({ error }) => { if (error) console.error(error) })
    },
    deleteDailyExpense: (id) => {
      setDailyExpenses(p => p.filter(e => e.id !== id))
      supabase.from('daily_expenses').delete().eq('id', id).then(({ error }) => { if (error) console.error(error) })
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
