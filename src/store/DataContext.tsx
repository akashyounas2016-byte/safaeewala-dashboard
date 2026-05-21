import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Booking, Client, Employee, Invoice, InventoryItem } from '../types'
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

  addEmployee:     (e: Omit<Employee, 'id' | 'created_at'>) => void
  updateEmployee:  (id: string, patch: Partial<Employee>) => void

  addInvoice:      (i: Omit<Invoice, 'id' | 'created_at'>) => void
  updateInvoice:   (id: string, patch: Partial<Invoice>) => void

  addInventory:    (i: Omit<InventoryItem, 'id' | 'created_at'>) => void
  updateInventory: (id: string, patch: Partial<InventoryItem>) => void
  reorderItem:     (id: string) => void
}

const DataContext = createContext<DataStore | null>(null)

function uid() { return crypto.randomUUID() }
function now() { return new Date().toISOString() }

export function DataProvider({ children }: { children: ReactNode }) {
  const [bookings,  setBookings]  = useState<Booking[]>([])
  const [clients,   setClients]   = useState<Client[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [invoices,  setInvoices]  = useState<Invoice[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading,   setLoading]   = useState(true)

  /* ── Load all data on mount ── */
  useEffect(() => {
    Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('inventory').select('*').order('created_at', { ascending: false }),
    ]).then(([b, c, e, i, inv]) => {
      if (b.data)   setBookings(b.data   as Booking[])
      if (c.data)   setClients(c.data    as Client[])
      if (e.data)   setEmployees(e.data  as Employee[])
      if (i.data)   setInvoices(i.data   as Invoice[])
      if (inv.data) setInventory(inv.data as InventoryItem[])
      setLoading(false)
    })
  }, [])

  const store: DataStore = {
    bookings, clients, employees, invoices, inventory, loading,

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
      setBookings(p => p.map(b => b.id === id ? { ...b, ...patch } : b))
      supabase.from('bookings').update(patch).eq('id', id).then(({ error }) => { if (error) console.error(error) })
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
