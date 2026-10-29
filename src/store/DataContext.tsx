import { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Booking, Client, Employee, Invoice, InventoryItem, DailyJob, DailyExpense, Agency } from '../types'
import { supabase } from '@/lib/supabase'
import { extractAllClientsFromDailyJobs, extractAllEmployeesFromDailyJobs, crewToStaffName, staffNameToCrew, normalizeStaffName, normalizeKey, splitStaffNames, employeeMatchesStaff, cleanClientNameFromAddress, getDayNameFromDate, getScheduledMonthlyShiftsForDate, syncMonthlySchedulesToDailyJobs } from '@/lib/clientDataSync'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'
import { dbInsert, dbUpdate, dbDelete, applyOutbox, startOutboxRetry } from '@/lib/syncQueue'
import { getCompanyInfo, loadCompanyInfo, updateCompanySettings } from '@/lib/companyInfo'
import { nextInvoiceNumber, ensureInvoiceNumber } from '@/lib/invoiceNumber'
import { addHoursToTime, staffOfAgency } from '@/lib/utils'
import { defaultAgencies } from '@/lib/defaultAgencies'
import { todayDubai } from '@/lib/dubaiTime'
import { describeJobChange } from '@/lib/auditLog'
export { defaultAgencies }

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
  pushBookingToDailyJob: (bookingId: string) => void

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
  deleteInventory: (id: string) => void
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

function safeNum(val: unknown): number {
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
    return saved
  })
  const [clients,       setClients]       = useState<Client[]>(() => {
    const saved = safeLocalStorageGet<Client[]>('safaeewala_clients', [])
    return saved
  })
  const [employees,     setEmployees]     = useState<Employee[]>(() => {
    const saved = safeLocalStorageGet<Employee[]>('safaeewala_employees', [])
    return saved
  })
  const [invoices,      setInvoices]      = useState<Invoice[]>(() => {
    const saved = safeLocalStorageGet<Invoice[]>('safaeewala_invoices', [])
    return saved
  })
  const [inventory,     setInventory]     = useState<InventoryItem[]>(() => {
    const saved = safeLocalStorageGet<InventoryItem[]>('safaeewala_inventory', [])
    return saved
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
  const [companyTRN,    setCompanyTRN]    = useState(() => getCompanyInfo().trn)

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
    // Supabase returns at most 1000 rows per request — page through the table so large
    // ledgers (daily_jobs) are loaded completely. Each page has the 2 s timeout guard.
    const PAGE = 1000
    const q = async <T = unknown>(table: string, order = 'created_at'): Promise<T[]> => {
      const all: T[] = []
      try {
        for (let from = 0; ; from += PAGE) {
          const timeoutPromise = new Promise<T[]>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 2000)
          )
          const fetchPromise = supabase.from(table).select('*').order(order, { ascending: false })
            .range(from, from + PAGE - 1).then(r => (r.data ?? []) as unknown as T[])
          const page = await Promise.race([fetchPromise, timeoutPromise])
          all.push(...(page ?? []))
          if (!page || page.length < PAGE) break
        }
        return all
      } catch {
        // A partial read would look like deleted rows — treat it as "no server data" and use the cache
        return []
      }
    }
    // Server rows + local changes still waiting in the outbox (AUD-03)
    const withPending = <T extends { id: string }>(table: string, rows: T[]) =>
      rows.length > 0 ? applyOutbox(table, rows) : rows

    // Load company settings for TRN used in auto-invoices
    supabase.from('company_settings').select('data').eq('id', 1).single()
      .then(({ data }) => { if (data?.data?.company?.trn) setCompanyTRN(data.data.company.trn) })
    void loadCompanyInfo()

    // Agencies live in two stores: the VPS JSON file (/api/agencies, keeps every field) and
    // Supabase. Read both, merge by id (JSON fields win), never drop the parent company (AUD-04).
    Promise.all([
      fetch('/api/agencies').then(r => (r.ok ? r.json() : [])).catch(() => []),
      q('agencies'),
    ]).then(([apiList, dbList]) => {
      const api = Array.isArray(apiList) ? (apiList as Agency[]) : []
      const db = withPending('agencies', (dbList || []) as Agency[])
      if (api.length === 0 && db.length === 0) return
      setAgencies(prev => {
        const byId = new Map<string, Agency>()
        db.forEach(a => byId.set(a.id, a))
        api.forEach(a => byId.set(a.id, { ...byId.get(a.id), ...a }))
        const next = Array.from(byId.values()).map(a => {
          const local = prev.find(p => p.id === a.id)
          return local ? { ...local, ...a } : a
        })
        if (!next.some(a => a.id === 'agency-safaeewala' || a.company_type === 'Parent Company')) {
          const parent = prev.find(a => a.id === 'agency-safaeewala') || defaultAgencies[0]
          if (parent) next.unshift(parent)
        }
        safeLocalStorageSet('safaeewala_agencies', next)
        return next
      })
    })

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
        setBookings(withPending('bookings', b as Booking[]))
      } else {
        const saved = safeLocalStorageGet<Booking[]>('safaeewala_bookings', [])
        if (saved.length > 0) setBookings(saved)
      }

      if (c && c.length > 0) {
        setClients(withPending('clients', c as Client[]))
      } else {
        const saved = safeLocalStorageGet<Client[]>('safaeewala_clients', [])
        if (saved.length > 0) setClients(saved)
      }

      if (e && e.length > 0) {
        setEmployees(withPending('employees', e as Employee[]))
      } else {
        const saved = safeLocalStorageGet<Employee[]>('safaeewala_employees', [])
        if (saved.length > 0) setEmployees(saved)
      }

      if (i && i.length > 0) {
        setInvoices(withPending('invoices', i as Invoice[]))
      } else {
        const saved = safeLocalStorageGet<Invoice[]>('safaeewala_invoices', [])
        if (saved.length > 0) setInvoices(saved)
      }

      if (inv && inv.length > 0) {
        setInventory(withPending('inventory', inv as InventoryItem[]))
      } else {
        const saved = safeLocalStorageGet<InventoryItem[]>('safaeewala_inventory', [])
        if (saved.length > 0) setInventory(saved)
      }

      const initialJobs = ((dj || []) as DailyJob[]).map(j => ({
        ...j,
        charges: safeNum(j.charges),
        received: safeNum(j.received),
        duty_hours: safeNum(j.duty_hours),
        ot_hours: safeNum(j.ot_hours),
        service: j.service || '',
      }))
      if (initialJobs.length > 0) {
        setDailyJobs(withPending('daily_jobs', initialJobs))
      } else {
        const savedJobs = safeLocalStorageGet<DailyJob[]>('safaeewala_daily_jobs', [])
        if (savedJobs.length > 0) setDailyJobs(savedJobs)
      }

      const initialExp = ((de || []) as DailyExpense[]).map(x => ({
        ...x,
        amount: safeNum(x.amount),
      }))
      if (initialExp.length > 0) {
        setDailyExpenses(withPending('daily_expenses', initialExp))
      } else {
        const savedExp = safeLocalStorageGet<DailyExpense[]>('safaeewala_daily_expenses', [])
        if (savedExp.length > 0) setDailyExpenses(savedExp)
      }
      setLoading(false)
    }).catch(() => setLoading(false))

    // Retry unsaved changes now, on reconnect and every minute
    return startOutboxRetry()
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

  // Names the user deleted — job-sheet history must not bring them back (AUD-17). Cloud-synced.
  const [deletedStaffKeys, setDeletedStaffKeys] = useState<string[]>(() => safeLocalStorageGet<string[]>('safaeewala_deleted_staff', []))
  const [deletedClientKeys, setDeletedClientKeys] = useState<string[]>(() => safeLocalStorageGet<string[]>('safaeewala_deleted_clients', []))
  const deletedStaffSet = useMemo(() => new Set(deletedStaffKeys), [deletedStaffKeys])
  const deletedClientSet = useMemo(() => new Set(deletedClientKeys), [deletedClientKeys])
  const forgetStaffNames = (keys: string[]) => {
    if (keys.length === 0) return
    setDeletedStaffKeys(prev => {
      const next = Array.from(new Set([...prev, ...keys]))
      safeLocalStorageSet('safaeewala_deleted_staff', next)
      return next
    })
  }

  const allClients = useMemo(() => {
    return extractAllClientsFromDailyJobs(viewDailyJobs, clients, bookings, deletedClientSet)
  }, [viewDailyJobs, clients, bookings, deletedClientSet])

  const allEmployees = useMemo(() => {
    return extractAllEmployeesFromDailyJobs(viewDailyJobs, employees, deletedStaffSet)
  }, [viewDailyJobs, employees, deletedStaffSet])

  /** Job-sheet name keys that belong to an employee (e.g. "Laxmi" rows for "Laxmi Rani") */
  const staffKeysOf = (emp: Employee): string[] => {
    const keys = new Set([normalizeStaffName(emp.full_name)])
    viewDailyJobs.forEach(j => splitStaffNames(j.staff_name).forEach(n => {
      if (employeeMatchesStaff(emp, n)) keys.add(normalizeStaffName(n))
    }))
    return Array.from(keys).filter(Boolean)
  }

  // ── Automated Daily Background Sync for Today's Monthly Clients (R-SCHED-01..03, R-SYNC-03) ──
  // Automatically populates Daily Job Sheet with today's scheduled monthly clients on app startup / load
  const hasAutoSyncedTodayRef = useRef(false)
  useEffect(() => {
    if (loading || allClients.length === 0) return
    if (hasAutoSyncedTodayRef.current) return

    const autoSyncEnabled = safeLocalStorageGet<boolean>('safaeewala_auto_sync_monthly_schedules', true)
    if (!autoSyncEnabled) return

    const today = todayDubai()
    const scheduledInfo = getScheduledMonthlyShiftsForDate(today, allClients, viewDailyJobs)
    if (scheduledInfo.pendingSyncCount > 0) {
      hasAutoSyncedTodayRef.current = true
      const newJobs: DailyJob[] = []
      syncMonthlySchedulesToDailyJobs(today, allClients, viewDailyJobs, (job) => {
        const row: DailyJob = {
          ...job,
          charges: safeNum(job.charges),
          received: safeNum(job.received),
          duty_hours: safeNum(job.duty_hours),
          ot_hours: safeNum(job.ot_hours),
          service: job.service || 'Regular Cleaning',
          id: uid(),
          created_at: now()
        }
        newJobs.push(row)
        dbInsert('daily_jobs', row)
      })

      if (newJobs.length > 0) {
        setDailyJobs(prev => {
          const next = [...newJobs, ...prev]
          safeLocalStorageSet('safaeewala_daily_jobs', next)
          return next
        })
      }
    } else {
      hasAutoSyncedTodayRef.current = true
    }
  }, [loading, allClients, viewDailyJobs])

  const store: DataStore = {
    bookings, clients: allClients, employees: allEmployees, agencies, invoices, inventory, loading,
    dailyJobs: viewDailyJobs, dailyExpenses,

    /* ── Bookings ── */
    addBooking: (b) => {
      // Resolve client_id: link to existing client by name or create a new one
      const matchedClient = clients.find(
        c => c.full_name.toLowerCase().trim() === b.client_name.toLowerCase().trim()
      )
      const isMonthly = b.frequency === 'monthly'
      const bookingDay = b.scheduled_date ? getDayNameFromDate(b.scheduled_date) : 'Monday'
      const recurringDays: string[] = (b as any).recurring_days && (b as any).recurring_days.length > 0
        ? (b as any).recurring_days
        : [bookingDay]

      let resolvedClientId = b.client_id || ''
      if (matchedClient) {
        resolvedClientId = matchedClient.id
        if (isMonthly) {
          const existingDays = Array.isArray(matchedClient.service_days) ? matchedClient.service_days : []
          const combinedDays = Array.from(new Set([...existingDays, ...recurringDays]))
          const patch: Partial<Client> = {
            source: matchedClient.source || 'monthly',
            service_days: combinedDays,
            scheduled_time: matchedClient.scheduled_time || b.scheduled_time,
            end_time: matchedClient.end_time || b.end_time,
            duration_hours: matchedClient.duration_hours || b.duration_hours,
            preferred_cleaner: matchedClient.preferred_cleaner || (crewToStaffName(b.assigned_crew, allEmployees) || undefined),
          }
          const updated = { ...matchedClient, ...patch }
          setClients(p => p.map(c => c.id === matchedClient.id ? updated : c))
          dbUpdate('clients', matchedClient.id, patch)
        } else if (!matchedClient.source && b.source) {
          const updated = { ...matchedClient, source: b.source }
          setClients(p => p.map(c => c.id === matchedClient.id ? updated : c))
          dbUpdate('clients', matchedClient.id, { source: b.source })
        }
      } else if (!resolvedClientId) {
        const newClient: Client = {
          id: uid(), created_at: now(),
          full_name: b.client_name, phone: b.client_phone,
          area: '', city: 'Dubai',
          total_bookings: 0, total_spent: 0,
          last_service: b.scheduled_date,
          source: isMonthly ? 'monthly' : (b.source || undefined),
          service_days: isMonthly ? recurringDays : undefined,
          scheduled_time: isMonthly ? b.scheduled_time : undefined,
          end_time: isMonthly ? b.end_time : undefined,
          duration_hours: isMonthly ? b.duration_hours : undefined,
          preferred_cleaner: isMonthly ? (crewToStaffName(b.assigned_crew, allEmployees) || undefined) : undefined,
        }
        resolvedClientId = newClient.id
        setClients(p => [newClient, ...p])
        dbInsert('clients', newClient)
      }

      const row = { ...b, id: uid(), created_at: now(), client_id: resolvedClientId }
      setBookings(p => [row, ...p])
      dbInsert('bookings', row)
      logAudit('created', 'booking', row.id, b.client_name, `${b.service_type} · ${b.scheduled_date}`)

      // Automatically synchronize with Daily Job Sheet
      const jobRow: DailyJob = {
        id: uid(),
        created_at: now(),
        date: b.scheduled_date || todayDubai(),
        staff_name: crewToStaffName(b.assigned_crew, allEmployees) || 'Unassigned',
        start_time: b.scheduled_time || '09:00',
        end_time: b.end_time || addHoursToTime(b.scheduled_time || '09:00', b.duration_hours || 3),
        duty_hours: safeNum(b.duration_hours || 3),
        ot_hours: 0,
        address: b.service_address || `${b.client_name} - Dubai`,
        area: 'Dubai',
        material: ((b as any).material as any) || 'No',
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
      dbInsert('daily_jobs', jobRow)
    },
    updateBooking: (id, patch) => {
      const booking = bookings.find(b => b.id === id)
      setBookings(p => p.map(b => b.id === id ? { ...b, ...patch } : b))
      dbUpdate('bookings', id, patch)
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
        // 1. Client totals (spent / visits / last service) are derived from the booking's
        //    job-sheet row, so nothing is added here — adding it too double-counted (AUD-22)

        // 2. Auto-create a draft invoice
        const sub = booking.total_amount
        const vat = Math.round(sub * 0.05 * 100) / 100
        const due = new Date(); due.setDate(due.getDate() + 10)
        const invoice = {
          id: uid(), created_at: now(),
          invoice_number: nextInvoiceNumber(invoices),
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
        dbInsert('invoices', invoice)

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
          dbInsert('bookings', nextRow)
        }
      }
    },
    deleteBooking: (id) => {
      const b = bookings.find(b => b.id === id)
      setBookings(p => p.filter(b => b.id !== id))
      dbDelete('bookings', id)
      setDailyJobs(p => {
        const next = p.filter(j => j.booking_id !== id)
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      supabase.from('daily_jobs').delete().eq('booking_id', id).then(({ error }) => { if (error) console.error(error) })
      if (b) logAudit('deleted', 'booking', id, b.client_name)
    },
    pushBookingToDailyJob: (bookingId) => {
      const b = bookings.find(x => x.id === bookingId)
      if (!b) return
      // Prevent duplicate push if already linked
      const existing = dailyJobs.find(j => j.booking_id === bookingId)
      if (existing) return

      const jobRow: DailyJob = {
        id: uid(),
        created_at: now(),
        date: b.scheduled_date || todayDubai(),
        staff_name: crewToStaffName(b.assigned_crew, allEmployees) || 'Unassigned',
        start_time: b.scheduled_time || '09:00',
        end_time: b.end_time || addHoursToTime(b.scheduled_time || '09:00', b.duration_hours || 3),
        duty_hours: safeNum(b.duration_hours || 3),
        ot_hours: 0,
        address: b.service_address || `${b.client_name} - Dubai`,
        area: 'Dubai',
        material: ((b as any).material as any) || 'No',
        charges: safeNum(b.total_amount || 0),
        received: b.status === 'completed' ? safeNum(b.total_amount || 0) : 0,
        payment_mode: b.frequency === 'monthly' ? 'Monthly' : 'Cash',
        is_overtime: false,
        remarks: b.notes ? `[Booking] ${b.notes}` : `Booking: ${b.service_type || 'Standard Clean'}`,
        service: b.service_type || 'Standard Clean',
        booking_id: b.id,
      }
      setDailyJobs(p => {
        const next = [jobRow, ...p]
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      dbInsert('daily_jobs', jobRow)
      logAudit('created', 'daily_job', jobRow.id, jobRow.staff_name, `Synced from Booking #${b.id.slice(0, 6)}`)
    },

    /* ── Clients ── */
    addClient: (c) => {
      const row = { ...c, id: uid(), created_at: now() }
      setClients(p => [row, ...p])
      dbInsert('clients', row)
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
          dbInsert('clients', newSaved)
          return [newSaved, ...p]
        }
        return p
      })
      dbUpdate('clients', id, patch)
    },
    deleteClient: (id) => {
      const c = allClients.find(c => c.id === id)
      setClients(p => p.filter(c => c.id !== id))
      if (!id.startsWith('dj-')) dbDelete('clients', id)
      // Keep a deleted client from re-appearing from job-sheet addresses (AUD-17)
      if (c) {
        const keys = [normalizeKey(c.full_name), normalizeKey(cleanClientNameFromAddress(c.full_name))]
        if (id.startsWith('dj-')) keys.push(id.slice(3))
        setDeletedClientKeys(prev => {
          const next = Array.from(new Set([...prev, ...keys.filter(Boolean)]))
          safeLocalStorageSet('safaeewala_deleted_clients', next)
          return next
        })
      }
      if (c) logAudit('deleted', 'client', id, c.full_name)
    },

    /* ── Employees ── */
    addEmployee: (e) => {
      const row = { ...e, id: uid(), created_at: now() }
      setEmployees(p => [row, ...p])
      dbInsert('employees', row)
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
          dbInsert('employees', newSaved)
          return [newSaved, ...p]
        }
        return p
      })
      dbUpdate('employees', id, patch)
    },
    deleteEmployee: (id) => {
      const e = allEmployees.find(e => e.id === id)
      setEmployees(p => p.filter(e => e.id !== id))
      if (!id.startsWith('emp-dj-')) dbDelete('employees', id)
      // Keep the deleted person from re-appearing as a job-sheet-only employee (AUD-17)
      if (e) forgetStaffNames(staffKeysOf(e))
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
          body: JSON.stringify({ id: row.id, patch: row }) // only this agency (K-03)
        }).catch(() => {})
        return next
      })
      dbInsert('agencies', row)
      logAudit('created', 'agency', row.id, a.name)
    },
    updateAgency: (id, patch) => {
      setAgencies(p => {
        const next = p.map(a => a.id === id ? { ...a, ...patch } : a)
        safeLocalStorageSet('safaeewala_agencies', next)
        fetch('/api/agencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, patch }) // only this agency — a stale tab can no longer overwrite the list (K-03)
        }).catch(() => {})
        return next
      })
      dbUpdate('agencies', id, patch)
      // Renaming an agency keeps staff that were linked by name (AUD-13)
      const before = agencies.find(a => a.id === id)
      if (before && patch.name && patch.name.trim() !== before.name.trim() && id !== 'agency-safaeewala') {
        const oldName = before.name.toLowerCase().trim()
        const linked = new Set(employees
          .filter(e => e.agency_id === id || (e.agency_name || '').toLowerCase().trim() === oldName)
          .map(e => e.id))
        if (linked.size > 0) {
          const relink = { agency_id: id, agency_name: patch.name }
          setEmployees(p => p.map(e => linked.has(e.id) ? { ...e, ...relink } : e))
          linked.forEach(empId => dbUpdate('employees', empId, relink))
        }
      }
      if (id === 'agency-safaeewala' && patch.name) {
        // Merge into company settings — never replace the whole record (AUD-43)
        void updateCompanySettings({ trading_name: patch.name })
      }
      logAudit('updated', 'agency', id, patch.name || id)
    },
    deleteAgency: (id) => {
      const a = agencies.find(a => a.id === id)
      // Deleting a third-party agency deletes its staff too (owner decision, 2026-10-27).
      // The parent company is never deleted together with its staff.
      if (a && id !== 'agency-safaeewala' && a.company_type !== 'Parent Company') {
        const staff = staffOfAgency(a, employees)
        if (staff.length > 0) {
          const ids = new Set(staff.map(s => s.id))
          setEmployees(p => p.filter(e => !ids.has(e.id)))
          staff.forEach(s => {
            dbDelete('employees', s.id)
            logAudit('deleted', 'employee', s.id, s.full_name, `with agency ${a.name}`)
          })
          forgetStaffNames(staff.flatMap(staffKeysOf))
        }
      }
      setAgencies(p => {
        const next = p.filter(a => a.id !== id)
        safeLocalStorageSet('safaeewala_agencies', next)
        fetch('/api/agencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remove: id, all: next }) // new server: remove by id; old server: full list
        }).catch(() => {})
        return next
      })
      dbDelete('agencies', id)
      if (a) logAudit('deleted', 'agency', id, a.name)
    },

    /* ── Invoices ── */
    addInvoice: (i) => {
      // Sequential, unique number whatever the caller proposed (AUD-36)
      const row = { ...i, invoice_number: ensureInvoiceNumber(i.invoice_number, invoices), id: uid(), created_at: now() }
      setInvoices(p => [row, ...p])
      dbInsert('invoices', row)
      logAudit('created', 'invoice', row.id, i.client_name, `AED ${i.total} · ${row.invoice_number}`)
    },
    updateInvoice: (id, patch) => {
      const inv = invoices.find(i => i.id === id)
      setInvoices(p => p.map(i => i.id === id ? { ...i, ...patch } : i))
      dbUpdate('invoices', id, patch)
      if (patch.status && inv) logAudit('status_changed', 'invoice', id, inv.client_name, `${inv.status} → ${patch.status}`)
    },
    deleteInvoice: (id) => {
      const inv = invoices.find(i => i.id === id)
      setInvoices(p => p.filter(i => i.id !== id))
      dbDelete('invoices', id)
      if (inv) logAudit('deleted', 'invoice', id, inv.client_name)
    },

    /* ── Inventory ── */
    addInventory: (i) => {
      const row = { ...i, id: uid(), created_at: now() }
      setInventory(p => [row, ...p])
      dbInsert('inventory', row)
    },
    updateInventory: (id, patch) => {
      setInventory(p => p.map(i => i.id === id ? { ...i, ...patch } : i))
      dbUpdate('inventory', id, patch)
    },
    deleteInventory: (id) => {
      const item = inventory.find(i => i.id === id)
      setInventory(p => p.filter(i => i.id !== id))
      dbDelete('inventory', id)
      if (item) logAudit('deleted', 'inventory', id, item.name)
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
      dbInsert('daily_jobs', row)
    },
    updateDailyJob: (id, patch) => {
      const sanitizedPatch = { ...patch }
      if ('charges' in patch) sanitizedPatch.charges = safeNum(patch.charges)
      if ('received' in patch) sanitizedPatch.received = safeNum(patch.received)
      if ('duty_hours' in patch) sanitizedPatch.duty_hours = safeNum(patch.duty_hours)
      if ('ot_hours' in patch) sanitizedPatch.ot_hours = safeNum(patch.ot_hours)
      if ('service' in patch) sanitizedPatch.service = patch.service || ''
      // Row history (UX-40): who changed which fields
      const before = dailyJobs.find(j => j.id === id)
      const change = before ? describeJobChange(before as unknown as Record<string, unknown>, sanitizedPatch as Record<string, unknown>) : ''
      if (before && change) logAudit('updated', 'daily_job', id, `${before.staff_name} · ${before.date}`, change)
      setDailyJobs(p => {
        const next = p.map(j => j.id === id ? { ...j, ...sanitizedPatch } : j)
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      dbUpdate('daily_jobs', id, sanitizedPatch)

      // Bidirectional sync for regular / one-time bookings (R-SYNC-03):
      // When a shift linked to a regular booking is edited on Daily Job Sheet,
      // keep the booking record in step with date, timing, duty, staff, address, charges & completion.
      // (Strictly adheres to R-SCHED-01..03: Permanent monthly recurring client contracts are NEVER mutated!).
      if (before?.booking_id) {
        const linkedBooking = bookings.find(b => b.id === before.booking_id)
        if (linkedBooking && linkedBooking.frequency !== 'monthly') {
          const bookingPatch: Partial<Booking> = {}
          if ('date' in sanitizedPatch && sanitizedPatch.date && sanitizedPatch.date !== linkedBooking.scheduled_date) {
            bookingPatch.scheduled_date = sanitizedPatch.date
          }
          if ('start_time' in sanitizedPatch && sanitizedPatch.start_time && sanitizedPatch.start_time !== linkedBooking.scheduled_time) {
            bookingPatch.scheduled_time = sanitizedPatch.start_time
          }
          if ('end_time' in sanitizedPatch && sanitizedPatch.end_time && sanitizedPatch.end_time !== linkedBooking.end_time) {
            bookingPatch.end_time = sanitizedPatch.end_time
          }
          if ('duty_hours' in sanitizedPatch && sanitizedPatch.duty_hours !== undefined && sanitizedPatch.duty_hours !== linkedBooking.duration_hours) {
            bookingPatch.duration_hours = sanitizedPatch.duty_hours
          }
          if ('charges' in sanitizedPatch && sanitizedPatch.charges !== undefined && sanitizedPatch.charges !== linkedBooking.total_amount) {
            bookingPatch.total_amount = sanitizedPatch.charges
          }
          if ('address' in sanitizedPatch && sanitizedPatch.address && sanitizedPatch.address !== linkedBooking.service_address) {
            bookingPatch.service_address = sanitizedPatch.address
          }
          if ('service' in sanitizedPatch && sanitizedPatch.service && sanitizedPatch.service !== linkedBooking.service_type) {
            bookingPatch.service_type = sanitizedPatch.service
          }
          if ('staff_name' in sanitizedPatch && sanitizedPatch.staff_name) {
            const crewIds = staffNameToCrew(sanitizedPatch.staff_name, allEmployees)
            if (crewIds.length > 0 && JSON.stringify(crewIds) !== JSON.stringify(linkedBooking.assigned_crew)) {
              bookingPatch.assigned_crew = crewIds
            }
          }
          if ('received' in sanitizedPatch && sanitizedPatch.received !== undefined) {
            const finalCharges = sanitizedPatch.charges !== undefined ? sanitizedPatch.charges : (before.charges || linkedBooking.total_amount || 0)
            if (sanitizedPatch.received >= finalCharges && finalCharges > 0 && linkedBooking.status !== 'completed') {
              bookingPatch.status = 'completed'
            }
          }

          if (Object.keys(bookingPatch).length > 0) {
            setBookings(prev => {
              const next = prev.map(b => b.id === before.booking_id ? { ...b, ...bookingPatch } : b)
              safeLocalStorageSet('safaeewala_bookings', next)
              return next
            })
            dbUpdate('bookings', before.booking_id, bookingPatch)
          }
        }
      }
    },
    deleteDailyJob: (id) => {
      const gone = dailyJobs.find(j => j.id === id)
      if (gone) logAudit('deleted', 'daily_job', id, `${gone.staff_name} · ${gone.date}`, `${gone.address || ''} · AED ${gone.charges ?? 0}`)
      setDailyJobs(p => {
        const next = p.filter(j => j.id !== id)
        safeLocalStorageSet('safaeewala_daily_jobs', next)
        return next
      })
      dbDelete('daily_jobs', id)
    },
    addDailyExpense: (e) => {
      const row = { ...e, amount: safeNum(e.amount), id: uid(), created_at: now() }
      setDailyExpenses(p => {
        const next = [row, ...p]
        safeLocalStorageSet('safaeewala_daily_expenses', next)
        return next
      })
      dbInsert('daily_expenses', row)
    },
    updateDailyExpense: (id, patch) => {
      const sanitizedPatch = { ...patch }
      if ('amount' in sanitizedPatch) sanitizedPatch.amount = safeNum(sanitizedPatch.amount)
      setDailyExpenses(p => {
        const next = p.map(e => e.id === id ? { ...e, ...sanitizedPatch } : e)
        safeLocalStorageSet('safaeewala_daily_expenses', next)
        return next
      })
      dbUpdate('daily_expenses', id, sanitizedPatch)
    },
    deleteDailyExpense: (id) => {
      setDailyExpenses(p => {
        const next = p.filter(e => e.id !== id)
        safeLocalStorageSet('safaeewala_daily_expenses', next)
        return next
      })
      dbDelete('daily_expenses', id)
    },
    clearDailyData: (date) => {
      // AUD-55: delete the day's rows one by one through the outbox — a failed delete is retried, and
      // rows imported right after (new ids) can never be caught by a late "delete where date = …"
      const jobIds = dailyJobs.filter(j => j.date === date).map(j => j.id)
      const expenseIds = dailyExpenses.filter(e => e.date === date).map(e => e.id)
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
      jobIds.forEach(id => dbDelete('daily_jobs', id))
      expenseIds.forEach(id => dbDelete('daily_expenses', id))
    },
    clearAllDailyData: async () => {
      const jobIds = dailyJobs.map(j => j.id)
      const expenseIds = dailyExpenses.map(e => e.id)
      setDailyJobs([])
      setDailyExpenses([])
      safeLocalStorageSet('safaeewala_daily_jobs', [])
      safeLocalStorageSet('safaeewala_daily_expenses', [])
      // One bulk delete per table; if it fails, fall back to per-row deletes through the outbox so
      // the failure is shown and retried instead of only logged (AUD-55)
      const bulk = async (table: string, ids: string[]) => {
        try {
          const { error } = await supabase.from(table).delete().not('id', 'is', null)
          if (!error) return
        } catch { /* fall through */ }
        ids.forEach(id => dbDelete(table, id))
      }
      await Promise.all([bulk('daily_jobs', jobIds), bulk('daily_expenses', expenseIds)])
    },

    reorderItem: (id) => {
      const item = inventory.find(i => i.id === id)
      if (!item) return
      const newStock = item.current_stock + item.reorder_quantity
      const lastRestocked = todayDubai()
      setInventory(p => p.map(i => i.id === id ? { ...i, current_stock: newStock, last_restocked: lastRestocked } : i))
      dbUpdate('inventory', id, { current_stock: newStock, last_restocked: lastRestocked })
    },
  }

  return <DataContext.Provider value={store}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
