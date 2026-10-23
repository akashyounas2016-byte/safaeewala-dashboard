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
  const jobNorm = normalizeKey(job.address)
  const cleanJobNorm = normalizeKey(cleanClientNameFromAddress(job.address))
  const clientNameNorm = normalizeKey(client.full_name)
  const clientBldgNorm = normalizeKey(client.building_name || '')
  const clientId = client.id

  // Match by synthetic ID
  if (clientId && clientId === generateClientIdFromAddress(job.address)) return true

  // Match by full name or building
  if (jobNorm && clientNameNorm && (jobNorm === clientNameNorm || cleanJobNorm === clientNameNorm)) return true
  if (clientBldgNorm && (jobNorm === clientBldgNorm || cleanJobNorm === clientBldgNorm)) return true

  // Substring match for substantial names (>= 5 chars)
  if (clientNameNorm.length >= 5) {
    if (cleanJobNorm.includes(clientNameNorm) || clientNameNorm.includes(cleanJobNorm)) return true
  }
  if (clientBldgNorm.length >= 5) {
    if (jobNorm.includes(clientBldgNorm) || clientBldgNorm.includes(jobNorm)) return true
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
    })
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
        if ((cNorm.length >= 5 && key.includes(cNorm)) || (bNorm.length >= 5 && key.includes(bNorm))) {
          associatedJobs = [...associatedJobs, ...jobs]
          matchedJobKeys.add(key)
        }
      }
    })

    if (associatedJobs.length > 0) {
      // Calculate updated stats
      const djCharges = associatedJobs.reduce((s, j) => s + (Number(j.charges) || 0), 0)
      const sortedJobs = [...associatedJobs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      const latestDate = sortedJobs[0]?.date || c.last_service

      result.push({
        ...c,
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
      preferred_cleaner: primaryJob.staff_name || '',
      total_bookings: jobs.length,
      total_spent: totalCharges,
      last_service: latestDate,
      created_at: earliestDate.includes('T') ? earliestDate : `${earliestDate}T08:00:00.000Z`,
    }

    result.push(newClient)
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
