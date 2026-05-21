import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Booking, Client, Employee, Invoice, InventoryItem } from '../types'
import {
  mockBookings, mockClients, mockEmployees, mockInvoices, mockInventory,
} from '../data/mock'

interface DataStore {
  bookings:  Booking[]
  clients:   Client[]
  employees: Employee[]
  invoices:  Invoice[]
  inventory: InventoryItem[]

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

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

export function DataProvider({ children }: { children: ReactNode }) {
  const [bookings,  setBookings]  = useState<Booking[]>       (mockBookings)
  const [clients,   setClients]   = useState<Client[]>        (mockClients)
  const [employees, setEmployees] = useState<Employee[]>      (mockEmployees)
  const [invoices,  setInvoices]  = useState<Invoice[]>       (mockInvoices)
  const [inventory, setInventory] = useState<InventoryItem[]> (mockInventory)

  const store: DataStore = {
    bookings, clients, employees, invoices, inventory,

    addBooking:  (b) => setBookings(p  => [{ ...b, id: `b${uid()}`,    created_at: new Date().toISOString() }, ...p]),
    updateBooking: (id, patch) => setBookings(p  => p.map(b  => b.id  === id ? { ...b,  ...patch } : b)),
    deleteBooking: (id)        => setBookings(p  => p.filter(b => b.id !== id)),

    addClient:    (c) => setClients(p   => [{ ...c, id: `c${uid()}`,    created_at: new Date().toISOString() }, ...p]),
    updateClient: (id, patch) => setClients(p   => p.map(c  => c.id  === id ? { ...c,  ...patch } : c)),

    addEmployee:    (e) => setEmployees(p => [{ ...e, id: `emp${uid()}`, created_at: new Date().toISOString() }, ...p]),
    updateEmployee: (id, patch) => setEmployees(p => p.map(e  => e.id  === id ? { ...e,  ...patch } : e)),

    addInvoice:    (i) => setInvoices(p  => [{ ...i, id: `inv${uid()}`, created_at: new Date().toISOString() }, ...p]),
    updateInvoice: (id, patch) => setInvoices(p  => p.map(i  => i.id  === id ? { ...i,  ...patch } : i)),

    addInventory:    (i) => setInventory(p => [{ ...i, id: `item${uid()}`, created_at: new Date().toISOString() }, ...p]),
    updateInventory: (id, patch) => setInventory(p => p.map(i  => i.id  === id ? { ...i,  ...patch } : i)),
    reorderItem: (id) => setInventory(p => p.map(i =>
      i.id === id
        ? { ...i, current_stock: i.current_stock + i.reorder_quantity, last_restocked: new Date().toISOString().split('T')[0] }
        : i
    )),
  }

  return <DataContext.Provider value={store}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
