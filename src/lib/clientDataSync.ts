import type { DailyJob, Client, Employee } from '@/types'

/**
 * Normalizes text for fuzzy/clean comparison (lowercased, alphanumeric only)
 */
export function normalizeKey(text: string): string {
  if (!text) return ''
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Extracts a clean, readable client/address name by stripping monthly tags and extra notes
 * Example: "Flat 309 Bldg 31 A(Feb Monthly)" -> "Flat 309 Bldg 31 A"
 * Example: "807 Nilofer(Monthly)" -> "807 Nilofer"
 */
export function cleanClientNameFromAddress(rawAddress: string): string {
  if (!rawAddress) return 'Client'
  let cleaned = rawAddress
    .replace(/\s*\([^)]*monthly[^)]*\)/gi, '')
    .replace(/\s*\([^)]*cash[^)]*\)/gi, '')
    .replace(/\s*\([^)]*pending[^)]*\)/gi, '')
    .replace(/\s*\([^)]*online[^)]*\)/gi, '')
    .replace(/\s*\([^)]*above[^)]*\)/gi, '')
    .trim()

  // Clean trailing punctuation or hyphens
  cleaned = cleaned.replace(/^[-–—,:\s]+|[-–—,:\s]+$/g, '').trim()
  return cleaned || rawAddress.trim() || 'Client'
}

/**
 * Deterministic client ID generation for clients originating from Daily Job Sheet
 */
export function generateClientIdFromAddress(rawAddress: string): string {
  const norm = normalizeKey(cleanClientNameFromAddress(rawAddress))
  return `dj-${norm || 'unknown'}`
}

/**
 * Check if a job is an accidental Excel footer/summary row
 */
export function isBogusJob(j: DailyJob): boolean {
  if (!j) return true
  const address = (j.address || '').trim()
  const noAddress = !address || address === '—' || address === '-'
  const noTimes = (!j.start_time || j.start_time === '—') && (!j.end_time || j.end_time === '—')
  const duty = Number(j.duty_hours) || 0
  const charges = Number(j.charges) || 0
  const received = Number(j.received) || 0

  const summaryWords = ['gross', 'pending rcvd', 'total', 'expences', 'net total', 'summary']
  const combined = `${j.staff_name || ''} ${address} ${j.area || ''} ${j.remarks || ''}`.toLowerCase()
  if (summaryWords.some(w => combined.includes(w))) return true

  return (noAddress && noTimes) || (noAddress && (charges > 1500 || received > 1500)) || duty > 24
}

/**
 * Check if a job belongs to a Monthly Client
 */
export function isMonthlyJob(job: DailyJob): boolean {
  if (isBogusJob(job)) return false
  if (String(job.payment_mode).toLowerCase() === 'monthly') return true
  if (job.remarks && job.remarks.toLowerCase().includes('monthly')) return true
  if (job.address && job.address.toLowerCase().includes('monthly')) return true
  return false
}

/**
 * Helper to calculate overtime hours for a job:
 * 1. Explicit ot_hours from job record
 * 2. If is_overtime flag is set, duty_hours or elapsed time
 * 3. Hours extending past 20:00 (8:00 PM)
 */
export function calcJobOTHours(job: DailyJob): number {
  if (job.ot_hours && Number(job.ot_hours) > 0) {
    return Math.round(Number(job.ot_hours) * 10) / 10
  }
  if (job.is_overtime) {
    const duty = Number(job.duty_hours) || 0
    if (duty > 0) return duty
  }
  const s = (job.start_time || '').trim()
  const e = (job.end_time || '').trim()
  if (!s || !e || s === '—' || e === '—' || !s.includes(':') || !e.includes(':')) return 0

  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0

  const endMins = eh * 60 + em
  const OT_CUTOFF = 20 * 60 // 8:00 PM
  if (endMins <= OT_CUTOFF) return 0
  const otStartMins = Math.max(sh * 60 + sm, OT_CUTOFF)
  const otMins = endMins - otStartMins
  return otMins > 0 ? Math.round((otMins / 60) * 10) / 10 : 0
}

/**
 * Check if a DailyJob matches a specific Client profile
 */
export function jobMatchesClient(job: DailyJob, client: Client): boolean {
  if (!job || !client) return false
  const rawAddr = (job.address || job.area || '').trim()
  const jobNorm = normalizeKey(rawAddr)
  const cleanJobNorm = normalizeKey(cleanClientNameFromAddress(rawAddr))
  const clientNameNorm = normalizeKey(client.full_name)
  const clientBldgNorm = normalizeKey(client.building_name || '')
  const clientId = client.id

  // Match by synthetic ID
  if (clientId && (clientId === generateClientIdFromAddress(rawAddr) || clientId === `dj-${cleanJobNorm}` || clientId === `dj-${jobNorm}`)) return true

  // Match by full name or building
  if (jobNorm && clientNameNorm && (jobNorm === clientNameNorm || cleanJobNorm === clientNameNorm)) return true
  if (clientBldgNorm && (jobNorm === clientBldgNorm || cleanJobNorm === clientBldgNorm)) return true

  // Substring match for substantial names (>= 4 chars)
  if (clientNameNorm.length >= 4) {
    if (cleanJobNorm.includes(clientNameNorm) || clientNameNorm.includes(cleanJobNorm)) return true
  }
  if (clientBldgNorm.length >= 4) {
    if (jobNorm.includes(clientBldgNorm) || clientBldgNorm.includes(jobNorm)) return true
  }

  return false
}

/**
 * Single source of truth to check if a client is a Monthly Client.
 * Synchronized across Clients screen, Monthly Clients screen, and Client Profiles.
 */
export function isMonthlyClient(
  client: Client | null | undefined,
  dailyJobs: DailyJob[] = [],
  monthlySummaries?: MonthlyClientSummary[]
): boolean {
  if (!client) return false

  // 1. Explicit recurring service days scheduled (e.g. ['Monday', 'Wednesday'])
  if (Array.isArray(client.service_days) && client.service_days.length > 0) return true

  // 2. Explicit day schedules map
  if (client.day_schedules && Object.keys(client.day_schedules).length > 0) return true

  // 3. Explicit day cleaner assignments map
  if (client.day_cleaner_assignments && Object.keys(client.day_cleaner_assignments).length > 0) return true

  // 4. Notes, remarks, or access notes explicitly mentioning 'monthly' or 'recurring'
  const combinedNotes = `${client.remarks || ''} ${client.notes || ''} ${client.access_notes || ''}`.toLowerCase()
  if (combinedNotes.includes('monthly') || combinedNotes.includes('recurring')) return true

  // 5. Source explicitly set to monthly
  if (client.source === 'monthly' || client.source === 'monthly_contract') return true

  // 6. Direct match with monthlySummaries list if available
  if (monthlySummaries && monthlySummaries.length > 0) {
    const cId = client.id
    const cNorm = normalizeKey(client.full_name)
    const bNorm = normalizeKey(client.building_name || '')
    const inSummaries = monthlySummaries.some(s => 
      s.id === cId ||
      s.matchedClientId === cId ||
      (cNorm && (normalizeKey(s.name) === cNorm || (cNorm.length >= 4 && (normalizeKey(s.name).includes(cNorm) || cNorm.includes(normalizeKey(s.name)))))) ||
      (bNorm && (normalizeKey(s.rawAddress) === bNorm || (bNorm.length >= 4 && (normalizeKey(s.rawAddress).includes(bNorm) || bNorm.includes(normalizeKey(s.rawAddress))))))
    )
    if (inSummaries) return true
  }

  // 7. Check if any Daily Job for this client is a monthly job
  if (dailyJobs && dailyJobs.length > 0) {
    const clientNameNorm = normalizeKey(client.full_name)
    const clientBldgNorm = normalizeKey(client.building_name || '')
    const clientId = client.id

    const hasMonthlyJob = dailyJobs.some(j => {
      if (!isMonthlyJob(j)) return false
      if (jobMatchesClient(j, client)) return true
      const raw = (j.address || j.area || '').trim()
      const jobNorm = normalizeKey(raw)
      const cleanNorm = normalizeKey(cleanClientNameFromAddress(raw))
      if (clientId && (clientId === `dj-${cleanNorm}` || clientId === `dj-${jobNorm}`)) return true
      if (clientNameNorm && (clientNameNorm === cleanNorm || clientNameNorm === jobNorm)) return true
      if (clientBldgNorm && (clientBldgNorm === cleanNorm || clientBldgNorm === jobNorm)) return true
      if (clientNameNorm.length >= 4 && (cleanNorm.includes(clientNameNorm) || clientNameNorm.includes(cleanNorm))) return true
      return false
    })
    if (hasMonthlyJob) return true
  }

  return false
}

export interface MonthlyClientSummary {
  id: string
  name: string
  rawAddress: string
  area: string
  totalCharges: number
  totalReceived: number
  balanceDue: number
  totalOTHours: number
  totalDutyHours: number
  visitsCount: number
  cleaners: string[]
  lastService: string
  services: string[]
  jobs: DailyJob[]
  isRegisteredClient: boolean
  matchedClientId?: string
  service_days?: string[]
  scheduled_time?: string
  end_time?: string
  duration_hours?: number
  preferred_cleaner?: string
  day_cleaner_assignments?: Record<string, string>
  day_schedules?: Record<string, { startTime: string; endTime: string; cleaner: string; duration?: number }>
}

export type DateRangeFilter =
  | string // 'all', '2026-10', '2026-10-23'
  | { start?: string; end?: string }
  | ((date: string) => boolean)

/**
 * Extracts and aggregates all Monthly Clients directly from DailyJobSheet
 */
export function extractMonthlyClientsFromDailyJobs(
  dailyJobs: DailyJob[],
  dateFilter: DateRangeFilter = 'all',
  registeredClients: Client[] = []
): MonthlyClientSummary[] {
  // 1. Filter for monthly jobs only, excluding bogus rows
  const monthlyJobs = dailyJobs.filter(j => {
    if (!isMonthlyJob(j)) return false
    if (!dateFilter || dateFilter === 'all') return true

    const jobDate = (j.date || '').trim()
    if (!jobDate) return false

    if (typeof dateFilter === 'function') {
      return dateFilter(jobDate)
    }
    if (typeof dateFilter === 'object') {
      if (dateFilter.start && jobDate < dateFilter.start) return false
      if (dateFilter.end && jobDate > dateFilter.end) return false
      return true
    }
    if (typeof dateFilter === 'string') {
      if (dateFilter === 'all') return true
      if (dateFilter.length === 7) return jobDate.startsWith(dateFilter)
      if (dateFilter.length === 10) return jobDate === dateFilter
      return jobDate.startsWith(dateFilter)
    }
    return true
  })

  // 2. Group by client (normalized cleaned address)
  const groups = new Map<string, DailyJob[]>()

  monthlyJobs.forEach(job => {
    const rawAddr = (job.address || job.area || 'Client').trim()
    const key = normalizeKey(cleanClientNameFromAddress(rawAddr)) || normalizeKey(rawAddr) || 'client'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(job)
  })

  // 3. Transform groups into MonthlyClientSummary objects
  const summaries: MonthlyClientSummary[] = []

  groups.forEach((jobs, key) => {
    // Sort chronologically (newest first)
    jobs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    const primaryJob = jobs[0]
    const cleanName = cleanClientNameFromAddress(primaryJob.address || primaryJob.area || 'Monthly Client')
    const rawAddress = primaryJob.address || primaryJob.area || '—'
    const area = primaryJob.area || 'Dubai'

    const totalCharges = jobs.reduce((s, j) => s + (Number(j.charges) || 0), 0)
    const totalReceived = jobs.reduce((s, j) => s + (Number(j.received) || 0), 0)
    const balanceDue = Math.max(0, totalCharges - totalReceived)
    const totalOTHours = Math.round(jobs.reduce((s, j) => s + calcJobOTHours(j), 0) * 10) / 10
    const totalDutyHours = Math.round(jobs.reduce((s, j) => s + (Number(j.duty_hours) || 0), 0) * 10) / 10

    const cleaners = Array.from(new Set(jobs.map(j => j.staff_name).filter(Boolean)))
    const services = Array.from(new Set(jobs.map(j => j.service).filter(Boolean))) as string[]
    const lastService = primaryJob.date || '—'

    // Look for matching registered client in clients state
    const matched = registeredClients.find(c => {
      const cNorm = normalizeKey(c.full_name)
      const bNorm = normalizeKey(c.building_name || '')
      return cNorm === key || bNorm === key || c.id === `dj-${key}`
    })

    const id = matched ? matched.id : `dj-${key}`

    summaries.push({
      id,
      name: matched ? matched.full_name : cleanName,
      rawAddress: matched?.building_name || rawAddress,
      area: matched?.area || area,
      totalCharges,
      totalReceived,
      balanceDue,
      totalOTHours,
      totalDutyHours,
      visitsCount: jobs.length,
      cleaners,
      lastService,
      services,
      jobs,
      isRegisteredClient: Boolean(matched),
      matchedClientId: matched?.id,
      service_days: matched?.service_days,
      scheduled_time: matched?.scheduled_time,
      end_time: matched?.end_time,
      duration_hours: matched?.duration_hours,
      preferred_cleaner: matched?.preferred_cleaner,
      day_cleaner_assignments: matched?.day_cleaner_assignments,
      day_schedules: matched?.day_schedules,
    })
  })

  // Also include registered monthly clients who may not have logged daily jobs yet
  registeredClients.forEach(c => {
    const already = summaries.some(s => s.id === c.id || (c.full_name && normalizeKey(s.name) === normalizeKey(c.full_name)))
    if (!already) {
      const isMonthly = (Array.isArray(c.service_days) && c.service_days.length > 0) ||
        Boolean(c.day_schedules && Object.keys(c.day_schedules).length > 0) ||
        Boolean(c.day_cleaner_assignments && Object.keys(c.day_cleaner_assignments).length > 0) ||
        Boolean(c.notes && (c.notes.toLowerCase().includes('monthly') || c.notes.toLowerCase().includes('recurring'))) ||
        Boolean(c.remarks && (c.remarks.toLowerCase().includes('monthly') || c.remarks.toLowerCase().includes('recurring'))) ||
        (c.source === 'monthly' || c.source === 'monthly_contract')

      if (isMonthly) {
        summaries.push({
          id: c.id,
          name: c.full_name,
          rawAddress: c.building_name || c.area || 'Dubai',
          area: c.area || 'Dubai',
          totalCharges: 0,
          totalReceived: 0,
          balanceDue: c.pending_amount || 0,
          totalOTHours: 0,
          totalDutyHours: 0,
          visitsCount: 0,
          cleaners: c.preferred_cleaner ? [c.preferred_cleaner] : [],
          lastService: '—',
          services: ['Monthly Cleaning'],
          jobs: [],
          isRegisteredClient: true,
          matchedClientId: c.id,
          service_days: c.service_days,
          scheduled_time: c.scheduled_time,
          end_time: c.end_time,
          duration_hours: c.duration_hours,
          preferred_cleaner: c.preferred_cleaner,
          day_cleaner_assignments: c.day_cleaner_assignments,
          day_schedules: c.day_schedules,
        })
      }
    }
  })

  // Sort by charges descending by default
  return summaries.sort((a, b) => b.totalCharges - a.totalCharges)
}

/**
 * Extracts all unique clients from Daily Job Sheet and merges them with registered clients.
 * Guarantees every single client from Daily Job Sheet is represented with lifetime stats.
 */
export function extractAllClientsFromDailyJobs(
  dailyJobs: DailyJob[],
  registeredClients: Client[]
): Client[] {
  const result: Client[] = []
  const validJobs = dailyJobs.filter(j => !isBogusJob(j))

  // Map of normalized key to all daily jobs for that client
  const jobsByClientKey = new Map<string, DailyJob[]>()

  validJobs.forEach(job => {
    const rawAddr = (job.address || job.area || '').trim()
    if (!rawAddr || rawAddr === '—' || rawAddr === '-') return
    const key = normalizeKey(cleanClientNameFromAddress(rawAddr)) || normalizeKey(rawAddr)
    if (!jobsByClientKey.has(key)) jobsByClientKey.set(key, [])
    jobsByClientKey.get(key)!.push(job)
  })

  // 1. Process registered clients first (updating their stats with job sheet data if any)
  const matchedJobKeys = new Set<string>()

  registeredClients.forEach(c => {
    const cNorm = normalizeKey(c.full_name)
    const bNorm = normalizeKey(c.building_name || '')

    // Find any jobs associated with this client
    let associatedJobs: DailyJob[] = []
    if (jobsByClientKey.has(cNorm)) {
      associatedJobs = [...associatedJobs, ...(jobsByClientKey.get(cNorm) || [])]
      matchedJobKeys.add(cNorm)
    }
    if (bNorm && jobsByClientKey.has(bNorm) && bNorm !== cNorm) {
      associatedJobs = [...associatedJobs, ...(jobsByClientKey.get(bNorm) || [])]
      matchedJobKeys.add(bNorm)
    }

    // Also check partial matches
    jobsByClientKey.forEach((jobs, key) => {
      if (!matchedJobKeys.has(key)) {
        if ((cNorm.length >= 4 && key.includes(cNorm)) || (bNorm.length >= 4 && key.includes(bNorm))) {
          associatedJobs = [...associatedJobs, ...jobs]
          matchedJobKeys.add(key)
        }
      }
    })

    const hasMonthlyJob = associatedJobs.some(j => isMonthlyJob(j))
    const isMonthly = (Array.isArray(c.service_days) && c.service_days.length > 0) ||
      Boolean(c.day_schedules && Object.keys(c.day_schedules).length > 0) ||
      Boolean(c.day_cleaner_assignments && Object.keys(c.day_cleaner_assignments).length > 0) ||
      Boolean(c.notes && (c.notes.toLowerCase().includes('monthly') || c.notes.toLowerCase().includes('recurring'))) ||
      Boolean(c.remarks && (c.remarks.toLowerCase().includes('monthly') || c.remarks.toLowerCase().includes('recurring'))) ||
      c.source === 'monthly' ||
      hasMonthlyJob

    if (associatedJobs.length > 0) {
      // Calculate updated stats
      const djCharges = associatedJobs.reduce((s, j) => s + (Number(j.charges) || 0), 0)
      const sortedJobs = [...associatedJobs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      const latestDate = sortedJobs[0]?.date || c.last_service

      result.push({
        ...c,
        remarks: isMonthly ? (c.remarks || 'Monthly Contract') : c.remarks,
        source: isMonthly ? (c.source || 'monthly') : c.source,
        total_bookings: Math.max(c.total_bookings, associatedJobs.length),
        total_spent: Math.max(c.total_spent, djCharges),
        last_service: latestDate || c.last_service,
      })
    } else {
      result.push(c)
    }
  })

  // 2. Add remaining auto-discovered clients from Daily Job Sheet
  jobsByClientKey.forEach((jobs, key) => {
    if (matchedJobKeys.has(key)) return

    jobs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    const primaryJob = jobs[0]
    const cleanName = cleanClientNameFromAddress(primaryJob.address || primaryJob.area || 'Client')
    const totalCharges = jobs.reduce((s, j) => s + (Number(j.charges) || 0), 0)
    const latestDate = primaryJob.date || ''
    const earliestDate = jobs[jobs.length - 1]?.date || latestDate || new Date().toISOString()
    const hasMonthly = jobs.some(j => isMonthlyJob(j))

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const inferredDays = hasMonthly ? Array.from(new Set(
      jobs.map(j => {
        try {
          const d = new Date(j.date)
          return isNaN(d.getTime()) ? null : daysOfWeek[d.getDay()]
        } catch { return null }
      }).filter(Boolean) as string[]
    )) : undefined

    const newClient: Client = {
      id: `dj-${key}`,
      full_name: cleanName,
      phone: '',
      whatsapp: '',
      email: '',
      nationality: '',
      building_name: primaryJob.address || '',
      apartment: '',
      area: primaryJob.area || 'Dubai',
      city: 'Dubai',
      access_notes: '',
      pet_info: '',
      remarks: hasMonthly ? 'Monthly Contract' : '',
      notes: hasMonthly ? 'Monthly Client (from Daily Job Sheet)' : '',
      source: hasMonthly ? 'monthly' : 'daily_job_sheet',
      preferred_cleaner: primaryJob.staff_name || '',
      service_days: inferredDays && inferredDays.length > 0 ? inferredDays : (hasMonthly ? ['Monday', 'Wednesday'] : undefined),
      scheduled_time: primaryJob.start_time || '09:00',
      end_time: primaryJob.end_time || '13:00',
      duration_hours: Number(primaryJob.duty_hours) || 4,
      total_bookings: jobs.length,
      total_spent: totalCharges,
      last_service: latestDate,
      created_at: earliestDate.includes('T') ? earliestDate : `${earliestDate}T08:00:00.000Z`,
    }

    result.push(newClient)
  })

  // 3. Complete Bidirectional Sync: Guarantee ALL monthly clients from extractMonthlyClientsFromDailyJobs are present in result
  const monthlySummaries = extractMonthlyClientsFromDailyJobs(dailyJobs, 'all', registeredClients)
  monthlySummaries.forEach(s => {
    const existing = result.find(c =>
      c.id === s.id ||
      c.id === s.matchedClientId ||
      normalizeKey(c.full_name) === normalizeKey(s.name) ||
      (s.rawAddress && s.rawAddress !== '—' && normalizeKey(c.building_name || '') === normalizeKey(s.rawAddress))
    )
    if (existing) {
      if (!existing.service_days || existing.service_days.length === 0) {
        existing.service_days = s.service_days || ['Monday', 'Wednesday']
      }
      if (!existing.preferred_cleaner && s.cleaners[0]) {
        existing.preferred_cleaner = s.cleaners[0]
      }
      if (!existing.remarks || !existing.remarks.toLowerCase().includes('monthly')) {
        existing.remarks = existing.remarks ? `${existing.remarks} · Monthly Contract` : 'Monthly Contract'
      }
      if (!existing.source) existing.source = 'monthly'
      if (s.scheduled_time && !existing.scheduled_time) existing.scheduled_time = s.scheduled_time
      if (s.end_time && !existing.end_time) existing.end_time = s.end_time
      if (s.duration_hours && !existing.duration_hours) existing.duration_hours = s.duration_hours
      if (s.day_cleaner_assignments && !existing.day_cleaner_assignments) existing.day_cleaner_assignments = s.day_cleaner_assignments
      if (s.day_schedules && !existing.day_schedules) existing.day_schedules = s.day_schedules
    } else {
      result.push({
        id: s.id,
        full_name: s.name,
        phone: '',
        whatsapp: '',
        email: '',
        nationality: '',
        building_name: s.rawAddress !== '—' ? s.rawAddress : '',
        apartment: '',
        area: s.area || 'Dubai',
        city: 'Dubai',
        access_notes: '',
        pet_info: '',
        remarks: 'Monthly Contract',
        notes: 'Monthly Client (from Job Sheet)',
        source: 'monthly',
        preferred_cleaner: s.cleaners[0] || s.preferred_cleaner || '',
        service_days: s.service_days || ['Monday', 'Wednesday'],
        scheduled_time: s.scheduled_time || '09:00',
        end_time: s.end_time || '13:00',
        duration_hours: s.duration_hours || 4,
        day_cleaner_assignments: s.day_cleaner_assignments,
        day_schedules: s.day_schedules,
        total_bookings: s.visitsCount,
        total_spent: s.totalCharges,
        last_service: s.lastService !== '—' ? s.lastService : '',
        created_at: new Date().toISOString(),
      })
    }
  })

  return result
}

/**
 * Returns all past service history records from DailyJobSheet for a specific client
 */
export function getClientDailyJobsHistory(client: Client, dailyJobs: DailyJob[]): DailyJob[] {
  const validJobs = dailyJobs.filter(j => !isBogusJob(j))
  const matched = validJobs.filter(j => jobMatchesClient(j, client))
  // Sort descending by date, then start_time
  return matched.sort((a, b) => {
    const dComp = (b.date || '').localeCompare(a.date || '')
    if (dComp !== 0) return dComp
    return (b.start_time || '').localeCompare(a.start_time || '')
  })
}

/**
 * Normalizes staff name for consistent comparisons
 */
export function normalizeStaffName(name: string): string {
  if (!name) return ''
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

/**
 * Checks if a staff name is invalid or a footer/summary word
 */
export function isBogusStaffName(name: string): boolean {
  if (!name) return true
  const s = name.trim().toLowerCase()
  if (!s || s === '—' || s === '-' || s === 'nil' || s === 'none') return true
  const bogusWords = ['gross', 'pending rcvd', 'total', 'expences', 'net total', 'summary', 'expense']
  return bogusWords.some(w => s.includes(w))
}

/**
 * Checks if an Employee matches a staff name from DailyJobSheet
 */
export function employeeMatchesStaff(emp: Employee, staffName: string): boolean {
  if (!emp || !staffName) return false
  const eNorm = normalizeStaffName(emp.full_name)
  const sNorm = normalizeStaffName(staffName)
  if (!eNorm || !sNorm) return false
  if (eNorm === sNorm) return true
  if (emp.id === `emp-dj-${sNorm}`) return true
  if (eNorm.length >= 4 && sNorm.length >= 4) {
    if (eNorm.includes(sNorm) || sNorm.includes(eNorm)) return true
  }
  return false
}

/**
 * Returns all past service history records from DailyJobSheet for an employee
 */
export function getEmployeeDailyJobsHistory(emp: Employee, dailyJobs: DailyJob[]): DailyJob[] {
  const validJobs = dailyJobs.filter(j => !isBogusJob(j) && !isBogusStaffName(j.staff_name))
  const matched = validJobs.filter(j => employeeMatchesStaff(emp, j.staff_name))
  return matched.sort((a, b) => {
    const dComp = (b.date || '').localeCompare(a.date || '')
    if (dComp !== 0) return dComp
    return (b.start_time || '').localeCompare(a.start_time || '')
  })
}

/**
 * Extracts and synthesizes all employees from Daily Job Sheet into the global Employee directory
 */
export function extractAllEmployeesFromDailyJobs(
  dailyJobs: DailyJob[],
  registeredEmployees: Employee[]
): Employee[] {
  const result: Employee[] = []
  const validJobs = dailyJobs.filter(j => !isBogusJob(j) && !isBogusStaffName(j.staff_name))

  // Map of normalized staff name to their daily jobs
  const jobsByStaff = new Map<string, DailyJob[]>()
  validJobs.forEach(j => {
    const rawStaff = (j.staff_name || '').trim()
    if (!rawStaff || isBogusStaffName(rawStaff)) return
    const key = normalizeStaffName(rawStaff)
    if (!jobsByStaff.has(key)) jobsByStaff.set(key, [])
    jobsByStaff.get(key)!.push(j)
  })

  // Known roster names from Daily Job Sheet
  const standardRoster = [
    'Sharmila', 'Sharada', 'Uma Kumari', 'Ambika', 'Asmita', 'Bimala',
    'Gau Maya', 'Khima', 'Laxmi Rani', 'Rupa', 'Nim Kumari', 'Uma Sunar',
    'Parmila', 'Sita', 'Shanti', 'Sabirti', 'Kamala', 'Krishna',
    'Nobel', 'Ishwor', 'Sushanta', 'Sandesh', 'Ibrahim', 'Dinesh',
    'Adnan', 'Qasim'
  ]
  standardRoster.forEach(name => {
    const key = normalizeStaffName(name)
    if (!jobsByStaff.has(key)) {
      jobsByStaff.set(key, [])
    }
  })

  // 1. Process registered employees
  const matchedStaffKeys = new Set<string>()

  registeredEmployees.forEach(e => {
    const eNorm = normalizeStaffName(e.full_name)
    let foundKey = ''
    if (jobsByStaff.has(eNorm)) {
      foundKey = eNorm
    } else {
      for (const key of jobsByStaff.keys()) {
        if ((eNorm.length >= 4 && key.includes(eNorm)) || (key.length >= 4 && eNorm.includes(key))) {
          foundKey = key
          break
        }
      }
    }
    if (foundKey) {
      matchedStaffKeys.add(foundKey)
    }
    result.push(e)
  })

  // 2. Add auto-discovered staff members from Daily Job Sheet
  jobsByStaff.forEach((jobs, key) => {
    if (matchedStaffKeys.has(key)) return

    // Find display name from jobs or roster
    const sampleJob = jobs[0]
    const rosterMatch = standardRoster.find(r => normalizeStaffName(r) === key)
    const displayName = (sampleJob?.staff_name || rosterMatch || key).trim()
    const earliestDate = jobs[jobs.length - 1]?.date || sampleJob?.date || new Date().toISOString().split('T')[0]

    const newEmp: Employee = {
      id: `emp-dj-${key}`,
      full_name: displayName,
      phone: '',
      email: '',
      role: ['qasim', 'dinesh', 'adnan', 'supervisor'].some(s => key.includes(s)) ? 'crew_lead' : 'cleaner',
      nationality: 'Nepal',
      emirates_id: '',
      visa_expiry: '',
      work_permit_expiry: '',
      medical_insurance_expiry: '',
      passport_expiry: '',
      skills: ['Residential Cleaning', 'Deep Clean'],
      status: 'active',
      pay_rate_hourly: 14,
      joined_date: earliestDate,
      created_at: earliestDate.includes('T') ? earliestDate : `${earliestDate}T08:00:00.000Z`,
    }

    result.push(newEmp)
  })

  return result
}

/* ══════════════════════════════════════════════════════════════════════════
   WEEKLY SCHEDULE ↔ DAILY JOB SHEET SYNCHRONIZATION ENGINE
   Fetches repeating monthly schedules with assigned cleaners to DailyJobSheet.
   Guarantees Rule 1 Compliance: Date-specific DailyJob entries are created;
   permanent master client contracts are NEVER mutated.
   ══════════════════════════════════════════════════════════════════════════ */

export const DAYS_OF_WEEK_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
] as const

export type DayOfWeekName = (typeof DAYS_OF_WEEK_NAMES)[number]

/**
 * Derives Day of Week from a YYYY-MM-DD date string
 */
export function getDayNameFromDate(dateStr: string): DayOfWeekName {
  if (!dateStr || !dateStr.includes('-')) return 'Monday'
  const parts = dateStr.split('-').map(Number)
  const dt = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1)
  return DAYS_OF_WEEK_NAMES[dt.getDay()]
}

export interface ScheduledShiftPlan {
  client: Client
  dayName: DayOfWeekName
  cleanerName: string
  startTime: string
  endTime: string
  durationHours: number
  address: string
  area: string
  remarks: string
  service: string
  paymentMode: 'Monthly'
  charges: number
  alreadySynced: boolean
  existingJobId?: string
}

/**
 * Returns all monthly clients scheduled for dateStr with their assigned cleaners.
 * Compares against dailyJobs for that date to see which shifts are already synced.
 */
export function getScheduledMonthlyShiftsForDate(
  dateStr: string,
  clients: Client[],
  dailyJobs: DailyJob[] = []
): {
  dayName: DayOfWeekName
  totalScheduled: number
  alreadySyncedCount: number
  pendingSyncCount: number
  shifts: ScheduledShiftPlan[]
} {
  const dayName = getDayNameFromDate(dateStr)
  // Sunday is an off day — no regular monthly shifts are scheduled
  if (dayName === 'Sunday') {
    return {
      dayName: 'Sunday',
      totalScheduled: 0,
      alreadySyncedCount: 0,
      pendingSyncCount: 0,
      shifts: []
    }
  }
  const jobsOnDate = dailyJobs.filter(j => j.date === dateStr && !isBogusJob(j))

  // Combine registered clients with monthly summaries from daily job history
  const allMonthlySummaries = extractMonthlyClientsFromDailyJobs(dailyJobs, 'all', clients)
  
  // Merge into a comprehensive list of monthly client profiles
  const clientMap = new Map<string, Client>()
  
  // 1. Registered clients
  clients.forEach(c => {
    if (isMonthlyClient(c, dailyJobs, allMonthlySummaries)) {
      clientMap.set(c.id, c)
    }
  })

  // 2. Add monthly summaries that might not have a formal client ID yet
  allMonthlySummaries.forEach(s => {
    const existing = Array.from(clientMap.values()).find(c => 
      c.id === s.id || 
      c.id === s.matchedClientId || 
      normalizeKey(c.full_name) === normalizeKey(s.name)
    )
    if (!existing) {
      clientMap.set(s.id, {
        id: s.id,
        full_name: s.name,
        phone: '',
        whatsapp: '',
        email: '',
        nationality: '',
        building_name: s.rawAddress !== '—' ? s.rawAddress : '',
        apartment: '',
        area: s.area || 'Dubai',
        city: 'Dubai',
        access_notes: '',
        pet_info: '',
        remarks: 'Monthly Contract',
        notes: 'Monthly Client',
        source: 'monthly',
        preferred_cleaner: s.cleaners[0] || s.preferred_cleaner || '',
        service_days: s.service_days || ['Monday', 'Wednesday'],
        scheduled_time: s.scheduled_time || '08:00',
        end_time: s.end_time || '12:00',
        duration_hours: s.duration_hours || 4,
        day_cleaner_assignments: s.day_cleaner_assignments,
        day_schedules: s.day_schedules,
        total_bookings: s.visitsCount,
        total_spent: s.totalCharges,
        last_service: s.lastService,
        created_at: new Date().toISOString(),
      })
    }
  })

  const shifts: ScheduledShiftPlan[] = []

  clientMap.forEach(client => {
    // Check if client is scheduled on this dayName
    const daySchedule = client.day_schedules?.[dayName]
    const serviceDays = Array.isArray(client.service_days) ? client.service_days : []
    const hasDayInServiceDays = serviceDays.some(d => d.toLowerCase() === dayName.toLowerCase())
    const hasDayAssignment = Boolean(client.day_cleaner_assignments?.[dayName])
    const isDayExplicitlyEnabled = daySchedule ? (daySchedule as any).enabled !== false : false

    // If day is not scheduled for this client, skip
    if (!hasDayInServiceDays && !hasDayAssignment && !isDayExplicitlyEnabled) {
      return
    }

    // 1. Cleaner assignment for this day
    const assignedCleaner =
      daySchedule?.cleaner?.trim() ||
      client.day_cleaner_assignments?.[dayName]?.trim() ||
      client.preferred_cleaner?.trim() ||
      'Unassigned'

    // 2. Start time, end time, and duration
    const startTimeRaw = daySchedule?.startTime || client.scheduled_time || '08:00'
    const endTimeRaw = daySchedule?.endTime || client.end_time || '12:00'
    const durationHours = daySchedule?.duration || client.duration_hours || 4

    // 3. Format address with building and client name
    const bldg = (client.building_name || '').trim()
    const apt = (client.apartment || '').trim()
    const bldgApt = [bldg, apt ? `Apt ${apt}` : ''].filter(Boolean).join(' ')
    const clientName = (client.full_name || 'Monthly Client').trim()

    let formattedAddr = ''
    if (bldgApt && clientName && !bldgApt.toLowerCase().includes(clientName.toLowerCase())) {
      formattedAddr = `${bldgApt} - ${clientName} (Monthly)`
    } else if (bldgApt) {
      formattedAddr = `${bldgApt} (Monthly)`
    } else if ((client as any).address) {
      formattedAddr = `${(client as any).address} - ${clientName} (Monthly)`
    } else {
      formattedAddr = `${clientName} (Monthly)`
    }

    // 4. Area
    const area = client.area || 'Dubai'

    // 5. Remarks
    const remarks = client.remarks
      ? (client.remarks.includes('Monthly') ? client.remarks : `${client.remarks} (Monthly Schedule)`)
      : '(Monthly Schedule)'

    // 6. Check if this client already has a job on dateStr in dailyJobs
    const matchedJob = jobsOnDate.find(j => {
      if (jobMatchesClient(j, client)) return true

      const rawAddr = (j.address || '').trim()
      const cleanJobNorm = normalizeKey(cleanClientNameFromAddress(rawAddr))
      const cNorm = normalizeKey(client.full_name)
      const bNorm = normalizeKey(client.building_name || '')

      if (cleanJobNorm && cNorm && (cleanJobNorm === cNorm || cleanJobNorm.includes(cNorm) || cNorm.includes(cleanJobNorm))) return true
      if (cleanJobNorm && bNorm && (cleanJobNorm === bNorm || cleanJobNorm.includes(bNorm) || bNorm.includes(cleanJobNorm))) return true

      return false
    })

    shifts.push({
      client,
      dayName,
      cleanerName: assignedCleaner,
      startTime: startTimeRaw,
      endTime: endTimeRaw,
      durationHours,
      address: formattedAddr,
      area,
      remarks,
      service: 'Regular Cleaning',
      paymentMode: 'Monthly',
      charges: 0,
      alreadySynced: Boolean(matchedJob),
      existingJobId: matchedJob?.id,
    })
  })

  // Sort shifts: pending first, then by earliest start time, then cleaner
  shifts.sort((a, b) => {
    if (a.alreadySynced !== b.alreadySynced) {
      return a.alreadySynced ? 1 : -1
    }
    return (a.startTime || '').localeCompare(b.startTime || '') || a.cleanerName.localeCompare(b.cleanerName)
  })

  const alreadySyncedCount = shifts.filter(s => s.alreadySynced).length
  const pendingSyncCount = shifts.filter(s => !s.alreadySynced).length

  return {
    dayName,
    totalScheduled: shifts.length,
    alreadySyncedCount,
    pendingSyncCount,
    shifts,
  }
}

/**
 * Automatically fetches and inserts all pending monthly shifts for dateStr into dailyJobs.
 * Returns the count of newly inserted jobs.
 * Strictly complies with Rule 1: Master client contracts are NEVER mutated.
 */
export function syncMonthlySchedulesToDailyJobs(
  dateStr: string,
  clients: Client[],
  dailyJobs: DailyJob[],
  addDailyJob: (job: Omit<DailyJob, 'id' | 'created_at'>) => void
): {
  insertedCount: number
  alreadySyncedCount: number
  dayName: DayOfWeekName
  insertedClients: string[]
} {
  const result = getScheduledMonthlyShiftsForDate(dateStr, clients, dailyJobs)
  const pendingShifts = result.shifts.filter(s => !s.alreadySynced)
  const insertedClients: string[] = []

  pendingShifts.forEach(shift => {
    addDailyJob({
      date: dateStr,
      staff_name: shift.cleanerName,
      start_time: shift.startTime,
      end_time: shift.endTime,
      duty_hours: shift.durationHours,
      ot_hours: 0,
      address: shift.address,
      area: shift.area,
      material: 'No',
      charges: shift.charges,
      received: 0,
      payment_mode: 'Monthly',
      is_overtime: false,
      remarks: shift.remarks,
      service: shift.service,
    })
    insertedClients.push(shift.client.full_name || shift.address)
  })

  return {
    insertedCount: pendingShifts.length,
    alreadySyncedCount: result.alreadySyncedCount,
    dayName: result.dayName,
    insertedClients,
  }
}

