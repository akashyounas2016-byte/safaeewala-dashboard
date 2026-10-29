import type { Booking, DailyJob, Client, Employee, DailyPendingReceivedItem } from '@/types'
import { cleanNum, calcHours, calcOTHours } from '@/components/dailyJobSheet/jobSheetUtils'
import { safeLocalStorageGet } from '@/lib/storageUtils'
import { todayDubai } from '@/lib/dubaiTime'

/** Ids of the old demo clients (seed data, removed 2026-10-27) — may still exist in old stored data */
const SEED_CLIENT_ID_PREFIX = 'c1000001-0000-0000-0000-'

/**
 * Clients that can be assigned to staff: the live client list (database + Daily Job Sheet),
 * without demo seed clients or nameless rows, de-duplicated and sorted by name.
 */
export function getAssignableClients(clients: Client[]): Client[] {
  const seen = new Set<string>()
  return clients
    .filter(c => {
      if (!c.full_name?.trim() || c.id.startsWith(SEED_CLIENT_ID_PREFIX) || seen.has(c.id)) return false
      seen.add(c.id)
      return true
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
}

/**
 * Booking.assigned_crew holds employee IDs, DailyJob.staff_name holds cleaner names.
 * Convert crew IDs to the comma-separated names the Daily Job Sheet expects
 * (values that are not a known ID are assumed to already be names).
 */
export function crewToStaffName(crew: string[] | undefined, employees: Employee[]): string {
  return (crew || [])
    .map(c => employees.find(e => e.id === c)?.full_name || c)
    .map(s => s.trim())
    .filter(Boolean)
    .join(', ')
}

/** Reverse of crewToStaffName: Daily Job Sheet names → employee IDs (unknown names kept as-is) */
export function staffNameToCrew(staffName: string | undefined, employees: Employee[]): string[] {
  if (!staffName || staffName === 'Unassigned') return []
  return staffName
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(token =>
      employees.find(e => e.id === token)?.id ||
      employees.find(e => normalizeStaffName(e.full_name) === normalizeStaffName(token))?.id ||
      token
    )
}

export function formatEmpRole(role?: string): string {
  if (!role) return 'Cleaner'
  if (role === 'driver') return 'Driver'
  if (role === 'technical' || role === 'ducting') return 'Technical'
  if (role === 'supervisor' || role === 'crew_lead') return 'Supervisor'
  if (role === 'store_cleaner') return 'Store Cleaner'
  return 'Cleaner'
}

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

  // Empty stub: no address, no money, no service (was an Overview-only rule — AUD-21)
  const isEmptyStub = noAddress && charges === 0 && received === 0 && (!j.service || j.service === '—')
  return (noAddress && noTimes) || (noAddress && (charges > 1500 || received > 1500)) || duty > 24 || isEmptyStub
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
 * Helper to calculate overtime hours for a job (R-OT-01):
 * 1. Explicit ot_hours from job record
 * 2. If is_overtime flag is set, duty_hours or elapsed time
 * 3. calcOTHours applying Scenario 1 (post-8:00 PM) + Scenario 2 (pre-8:00 PM exceeding 8h)
 * 4. Fallback if start/end times missing but duty_hours > 8
 */
export function calcJobOTHours(job: DailyJob): number {
  if (job.ot_hours && Number(job.ot_hours) > 0) {
    return Math.round(Number(job.ot_hours) * 10) / 10
  }
  if (job.is_overtime) {
    const duty = Number(job.duty_hours) || 0
    if (duty > 0) return duty
  }
  const fromTimes = calcOTHours(job.start_time, job.end_time)
  if (fromTimes > 0) return fromTimes
  // Fallback: if times are missing/invalid, check if duty_hours exceeds 8 basic hours (Scenario 2)
  const duty = Number(job.duty_hours) || 0
  if (duty > 8) {
    return Math.round((duty - 8) * 10) / 10
  }
  return 0
}

/* ══════════════════════════════════════════════════════════════════════════
   FINANCIAL CALCULATIONS — SINGLE SOURCE OF TRUTH
   Every screen (Overview, Pending Payments, Payments, Daily Job Sheet,
   Spreadsheet, Monthly Clients, Client Profile) must use these helpers so
   the same job / client always shows the same pending figure.
   ══════════════════════════════════════════════════════════════════════════ */

const CLIENT_ADJUSTMENTS_KEY = 'safaeewala_client_adjustments'
const PENDING_RECEIPTS_KEY = 'safaeewala_daily_pending_rcvd_items'

/** Minimal shape of a client adjustment record (see ClientFinancialAdjustment in ClientProfile) */
export interface JobAdjustmentRecord {
  id?: string
  client_id?: string
  client_name?: string
  type: string
  amount: number
  reference_job_id?: string
}

export interface LinkedJobAdjustment {
  amount: number
  hasAdvanceDeduction: boolean
}

/** Adjustment written inline in remarks, e.g. "ADJ 50", "discount: AED 30" */
export function extractAdjustmentFromRemarks(remarks?: string): number {
  if (!remarks) return 0
  const m = remarks.match(/(?:adj(?:ustment)?|discount|waiver|credit)[\s:]*(?:aed)?\s*([0-9]+(?:\.[0-9]+)?)/i)
  if (m && m[1]) {
    const val = parseFloat(m[1])
    return isNaN(val) ? 0 : val
  }
  return 0
}

/** True when the job's charges were settled from the client's advance balance */
export function isJobPaidFromAdvance(job: DailyJob): boolean {
  if (job.payment_mode === 'Above') return true
  return /(?:deduct|from\s*adv|above|paid\s*by\s*adv)/i.test(job.remarks || '')
}

/** Loads client adjustments, ignoring the old demo seed records */
export function loadClientAdjustments(): JobAdjustmentRecord[] {
  const list = safeLocalStorageGet<JobAdjustmentRecord[]>(CLIENT_ADJUSTMENTS_KEY, [])
  return Array.isArray(list) ? list.filter(a => !a.id?.startsWith('adj-seed-')) : []
}

export function loadPendingReceipts(): DailyPendingReceivedItem[] {
  const list = safeLocalStorageGet<DailyPendingReceivedItem[]>(PENDING_RECEIPTS_KEY, [])
  return Array.isArray(list) ? list : []
}

/** Groups job-linked adjustments (discounts, waivers, advance deductions) by job id */
export function buildJobAdjustmentMap(adjustments: JobAdjustmentRecord[]): Map<string, LinkedJobAdjustment> {
  const map = new Map<string, LinkedJobAdjustment>()
  adjustments.forEach(a => {
    if (!a.reference_job_id || a.type === 'advance') return
    const entry = map.get(a.reference_job_id) || { amount: 0, hasAdvanceDeduction: false }
    entry.amount += cleanNum(a.amount)
    if (a.type === 'advance_deduction') entry.hasAdvanceDeduction = true
    map.set(a.reference_job_id, entry)
  })
  return map
}

/**
 * Sums pending-received collections that are linked to specific jobs.
 * A collection is linked via `job_id` (Pending Payments / Payments collect)
 * or via `allocations` (Daily Job Sheet "Pending Received" modal).
 * Collections without links (legacy / side-table items) are not applied to jobs.
 */
export function buildJobReceiptMap(receipts: DailyPendingReceivedItem[]): Map<string, number> {
  const map = new Map<string, number>()
  receipts.forEach(r => {
    if (r.job_id) {
      map.set(r.job_id, (map.get(r.job_id) || 0) + cleanNum(r.cash) + cleanNum(r.online))
    }
    r.allocations?.forEach(al => {
      map.set(al.job_id, (map.get(al.job_id) || 0) + cleanNum(al.amount))
    })
  })
  return map
}

export interface PendingCalcContext {
  adjustments: Map<string, LinkedJobAdjustment>
  receipts: Map<string, number>
}

export function buildPendingCalcContext(
  adjustments: JobAdjustmentRecord[] = loadClientAdjustments(),
  receipts: DailyPendingReceivedItem[] = loadPendingReceipts()
): PendingCalcContext {
  return {
    adjustments: buildJobAdjustmentMap(adjustments),
    receipts: buildJobReceiptMap(receipts),
  }
}

/** Total adjustment for a job: linked/inline adjustment + charges settled from advance */
export function calcJobAdjustment(job: DailyJob, linked?: LinkedJobAdjustment): number {
  const charges = cleanNum(job.charges)
  const base = (linked?.amount || 0) || extractAdjustmentFromRemarks(job.remarks)
  const fromAdvance = !linked?.hasAdvanceDeduction && isJobPaidFromAdvance(job) ? charges : 0
  return base + fromAdvance
}

/** Amount collected later against this job (Pending Received), on top of `received` */
export function calcJobLaterReceipts(job: DailyJob, ctx?: PendingCalcContext): number {
  return ctx?.receipts.get(job.id) || 0
}

/**
 * Outstanding amount of a single job:
 * charges − adjustments − received on the day − collected later.
 * `payment_mode` alone never creates a due — a fully paid "Pending" row is 0.
 */
export function calcJobPending(job: DailyJob, ctx?: PendingCalcContext): number {
  const charges = cleanNum(job.charges)
  const adjustment = calcJobAdjustment(job, ctx?.adjustments.get(job.id))
  const effectiveDue = Math.max(0, charges - adjustment)
  const paid = cleanNum(job.received) + calcJobLaterReceipts(job, ctx)
  return Math.max(0, effectiveDue - paid)
}

/** Opening balance (client.pending_amount) still unpaid after Pending Received collections */
export function calcClientOpeningPending(client: Client, receipts: DailyPendingReceivedItem[] = loadPendingReceipts()): number {
  const opening = cleanNum(client.pending_amount)
  if (opening <= 0) return 0
  const applied = receipts
    .filter(r => r.client_id === client.id)
    .reduce((s, r) => s + cleanNum(r.opening_applied), 0)
  return Math.max(0, opening - applied)
}

/**
 * Money collected for a job-sheet row (AUD-01, R-FIN-03): the received amount, else the charges for
 * paid-on-site rows. Monthly rows are collected through monthly client payments and Pending rows
 * through recoveries, so counting their charges here would count them twice.
 */
export function jobCollected(j: DailyJob): number {
  const rec = cleanNum(j.received)
  if (rec > 0) return rec
  const mode = String(j.payment_mode).toLowerCase()
  if (mode === 'pending' || mode === 'monthly') return 0
  return cleanNum(j.charges)
}

/**
 * Amount to chase on the receivables screens (Pending, Payments, Overview). Monthly-contract
 * visits are settled through monthly client payments on Monthly Clients, so they are not
 * job-level receivables (AUD-24).
 */
export function calcJobCollectable(job: DailyJob, ctx?: PendingCalcContext, invoiced?: ReadonlySet<string>): number {
  if (String(job.payment_mode).toLowerCase() === 'monthly') return 0
  // Billed through a sent invoice — collected on the invoice instead (UX-18)
  if (invoiced?.has(job.id)) return 0
  return calcJobPending(job, ctx)
}

/** Lifetime balance of a client: unpaid jobs + unpaid opening balance */
export function calcClientPendingBalance(
  client: Client,
  dailyJobs: DailyJob[],
  receipts: DailyPendingReceivedItem[] = loadPendingReceipts(),
  adjustments: JobAdjustmentRecord[] = loadClientAdjustments()
): number {
  const ctx = buildPendingCalcContext(adjustments, receipts)
  const jobsPending = getClientDailyJobsHistory(client, dailyJobs).reduce((s, j) => s + calcJobPending(j, ctx), 0)
  return jobsPending + calcClientOpeningPending(client, receipts)
}

/**
 * Splits a collection over the client's opening balance first, then oldest unpaid jobs.
 * Jobs themselves are never modified, so each day's cash book stays unchanged.
 */
export function allocateClientCollection(
  client: Client,
  amount: number,
  dailyJobs: DailyJob[],
  receipts: DailyPendingReceivedItem[] = loadPendingReceipts(),
  adjustments: JobAdjustmentRecord[] = loadClientAdjustments()
): { opening_applied: number; allocations: { job_id: string; amount: number }[]; unallocated: number } {
  let remaining = Math.max(0, amount)
  const opening_applied = Math.min(remaining, calcClientOpeningPending(client, receipts))
  remaining -= opening_applied

  const ctx = buildPendingCalcContext(adjustments, receipts)
  const oldestFirst = [...getClientDailyJobsHistory(client, dailyJobs)].reverse()
  const allocations: { job_id: string; amount: number }[] = []
  for (const job of oldestFirst) {
    if (remaining <= 0) break
    const due = calcJobPending(job, ctx)
    if (due <= 0) continue
    const pay = Math.min(due, remaining)
    allocations.push({ job_id: job.id, amount: pay })
    remaining -= pay
  }
  return { opening_applied, allocations, unallocated: remaining }
}

/* ══════════════════════════════════════════════════════════════════════════
   EMPLOYEE PAY — SINGLE SOURCE OF TRUTH
   ══════════════════════════════════════════════════════════════════════════ */

/** Standard working hours per month used to convert hourly ↔ monthly pay */
export const MONTHLY_WORK_HOURS = 200

/** Monthly salary from the record, or derived from the hourly rate. 0 = not set. */
export function getEmployeeMonthlySalary(emp: Pick<Employee, 'monthly_salary' | 'pay_rate_hourly'>): number {
  if (emp.monthly_salary && emp.monthly_salary > 0) return emp.monthly_salary
  if (emp.pay_rate_hourly && emp.pay_rate_hourly > 0) return Math.round(emp.pay_rate_hourly * MONTHLY_WORK_HOURS)
  return 0
}

/** Salary cost of one shift, from the monthly salary (0 when no salary is set) — AUD-06 */
export function shiftSalaryCost(emp: Pick<Employee, 'monthly_salary' | 'pay_rate_hourly'>, dutyHours: number): number {
  return Math.round((getEmployeeMonthlySalary(emp) / MONTHLY_WORK_HOURS) * (Number(dutyHours) || 0))
}

export function formatMonthlySalary(emp: Pick<Employee, 'monthly_salary' | 'pay_rate_hourly'>): string {
  const salary = getEmployeeMonthlySalary(emp)
  return salary > 0 ? `AED ${salary.toLocaleString()}/mo` : 'Not set'
}

/* ══════════════════════════════════════════════════════════════════════════
   NAME MATCHING
   ══════════════════════════════════════════════════════════════════════════ */

/** Lowercase words separated by single spaces ("Flat 309, Bldg-31A" → "flat 309 bldg 31a") */
export function toWords(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * True when one text contains the other as whole consecutive words.
 * "Villa 3" does NOT match "Villa 31"; "Mrs Khan" matches "Flat 309 - Mrs Khan".
 * The shorter side must be at least `minLength` characters to avoid accidental hits.
 */
export function containsWords(a: string, b: string, minLength = 4): boolean {
  const wa = toWords(a)
  const wb = toWords(b)
  if (!wa || !wb) return false
  if (wa === wb) return true
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
  if (shorter.replace(/ /g, '').length < minLength) return false
  return ` ${longer} `.includes(` ${shorter} `)
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

  // Whole-word match for substantial names ("Villa 3" must not match "Villa 31")
  if (containsWords(cleanClientNameFromAddress(rawAddr), client.full_name)) return true
  if (client.building_name && containsWords(rawAddr, client.building_name)) return true

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
      (cNorm && (normalizeKey(s.name) === cNorm || containsWords(s.name, client.full_name))) ||
      (bNorm && (normalizeKey(s.rawAddress) === bNorm || containsWords(s.rawAddress, client.building_name || '')))
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
  const pendingCtx = buildPendingCalcContext()

  groups.forEach((jobs, key) => {
    // Sort chronologically (newest first)
    jobs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    const primaryJob = jobs[0]
    const cleanName = cleanClientNameFromAddress(primaryJob.address || primaryJob.area || 'Monthly Client')
    const rawAddress = primaryJob.address || primaryJob.area || '—'
    const area = primaryJob.area || 'Dubai'

    const totalCharges = jobs.reduce((s, j) => s + (Number(j.charges) || 0), 0)
    const totalReceived = jobs.reduce((s, j) => s + (Number(j.received) || 0), 0)
    // Per-job dues (an overpaid job must not hide another job's due)
    const balanceDue = jobs.reduce((s, j) => s + calcJobPending(j, pendingCtx), 0)
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
          balanceDue: calcClientOpeningPending(c),
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
  registeredClients: Client[],
  bookings: Pick<Booking, 'id' | 'client_id'>[] = [],
  deletedKeys: ReadonlySet<string> = new Set()   // clients the user deleted — not re-created from history (AUD-17)
): Client[] {
  const result: Client[] = []
  const validJobs = dailyJobs.filter(j => !isBogusJob(j))

  // Rows created from a booking belong to the booking's client — linked by id, not by
  // address text, so a service address that doesn't contain the client's name still counts (AUD-15)
  const registeredIds = new Set(registeredClients.map(c => c.id))
  const clientIdByBooking = new Map(bookings.filter(b => b.client_id && registeredIds.has(b.client_id)).map(b => [b.id, b.client_id]))
  const linkedJobsByClient = new Map<string, DailyJob[]>()

  // Map of normalized key to all daily jobs for that client
  const jobsByClientKey = new Map<string, DailyJob[]>()
  // Readable address per key, used for whole-word partial matching
  const addressByKey = new Map<string, string>()

  validJobs.forEach(job => {
    const linkedClientId = job.booking_id ? clientIdByBooking.get(job.booking_id) : undefined
    if (linkedClientId) {
      if (!linkedJobsByClient.has(linkedClientId)) linkedJobsByClient.set(linkedClientId, [])
      linkedJobsByClient.get(linkedClientId)!.push(job)
      return
    }
    const rawAddr = (job.address || job.area || '').trim()
    if (!rawAddr || rawAddr === '—' || rawAddr === '-') return
    const key = normalizeKey(cleanClientNameFromAddress(rawAddr)) || normalizeKey(rawAddr)
    if (!jobsByClientKey.has(key)) jobsByClientKey.set(key, [])
    jobsByClientKey.get(key)!.push(job)
    if (!addressByKey.has(key)) addressByKey.set(key, rawAddr)
  })

  // 1. Process registered clients first (updating their stats with job sheet data if any)
  const matchedJobKeys = new Set<string>()

  registeredClients.forEach(c => {
    const cNorm = normalizeKey(c.full_name)
    const bNorm = normalizeKey(c.building_name || '')

    // Find any jobs associated with this client (booking-linked rows first)
    let associatedJobs: DailyJob[] = [...(linkedJobsByClient.get(c.id) || [])]
    if (jobsByClientKey.has(cNorm)) {
      associatedJobs = [...associatedJobs, ...(jobsByClientKey.get(cNorm) || [])]
      matchedJobKeys.add(cNorm)
    }
    if (bNorm && jobsByClientKey.has(bNorm) && bNorm !== cNorm) {
      associatedJobs = [...associatedJobs, ...(jobsByClientKey.get(bNorm) || [])]
      matchedJobKeys.add(bNorm)
    }

    // Also check partial (whole-word) matches — only for names specific enough to be safe:
    // a one-word name like "Ahmed" would swallow every address that mentions it (AUD-16)
    const nameIsSpecific = c.full_name.trim().split(/\s+/).filter(w => w.length > 1).length >= 2
    const buildingIsSpecific = (c.building_name || '').trim().length >= 4
    jobsByClientKey.forEach((jobs, key) => {
      if (!matchedJobKeys.has(key)) {
        const addr = addressByKey.get(key) || ''
        if ((nameIsSpecific && containsWords(cleanClientNameFromAddress(addr), c.full_name)) ||
            (bNorm && buildingIsSpecific && containsWords(addr, c.building_name || ''))) {
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
        // Derived from the job sheet; the stored counters were incremented separately and
        // could double-count, so they are only a fallback for clients with no rows (AUD-22)
        total_bookings: associatedJobs.length,
        total_spent: djCharges,
        last_service: latestDate || c.last_service,
      })
    } else {
      result.push(c)
    }
  })

  // 2. Add remaining auto-discovered clients from Daily Job Sheet
  jobsByClientKey.forEach((jobs, key) => {
    if (matchedJobKeys.has(key) || deletedKeys.has(key)) return

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
      // Only real data from the job sheet — no invented schedule
      service_days: inferredDays && inferredDays.length > 0 ? inferredDays : undefined,
      scheduled_time: primaryJob.start_time || undefined,
      end_time: primaryJob.end_time || undefined,
      duration_hours: Number(primaryJob.duty_hours) || undefined,
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
    const existingIdx = result.findIndex(c =>
      c.id === s.id ||
      c.id === s.matchedClientId ||
      normalizeKey(c.full_name) === normalizeKey(s.name) ||
      (s.rawAddress && s.rawAddress !== '—' && normalizeKey(c.building_name || '') === normalizeKey(s.rawAddress))
    )
    if (existingIdx >= 0) {
      // Work on a copy — `result` may hold the original registered client from React state
      const existing = { ...result[existingIdx] }
      if ((!existing.service_days || existing.service_days.length === 0) && s.service_days && s.service_days.length > 0) {
        existing.service_days = s.service_days
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
      result[existingIdx] = existing
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
        service_days: s.service_days,
        scheduled_time: s.scheduled_time,
        end_time: s.end_time,
        duration_hours: s.duration_hours,
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
/** Splits a shared shift entry ("Sharada, Ambika" / "Sita & Rupa") into individual names */
/** One cleaner's share of a shift's charges — a shared shift ("Sita, Rupa") is split equally (AUD-07) */
export function jobChargeShare(job: DailyJob): number {
  return (Number(job.charges) || 0) / Math.max(1, splitStaffNames(job.staff_name).length)
}

export function splitStaffNames(staffName: string): string[] {
  return (staffName || '')
    .split(/[,/&+]|\band\b/i)
    .map(s => s.trim())
    .filter(s => s && !isBogusStaffName(s))
}

export function employeeMatchesStaff(emp: Employee, staffName: string): boolean {
  if (!emp || !staffName) return false
  const eNorm = normalizeStaffName(emp.full_name)
  if (!eNorm) return false
  if (eNorm === normalizeStaffName(staffName)) return true
  return splitStaffNames(staffName).some(name => {
    const sNorm = normalizeStaffName(name)
    if (!sNorm) return false
    if (eNorm === sNorm || emp.id === `emp-dj-${sNorm}`) return true
    // Whole-word match only ("Rupa" must not match "Rupak")
    return containsWords(emp.full_name, name)
  })
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
/** Staff found only on the job sheet stay "active" for this many days after their last shift (AUD-08) */
export const SYNTHETIC_STAFF_ACTIVE_DAYS = 60

export function extractAllEmployeesFromDailyJobs(
  dailyJobs: DailyJob[],
  registeredEmployees: Employee[],
  deletedKeys: ReadonlySet<string> = new Set()   // staff the user deleted — not re-created from history (AUD-17)
): Employee[] {
  const result: Employee[] = []
  const validJobs = dailyJobs.filter(j => !isBogusJob(j) && !isBogusStaffName(j.staff_name))

  // Map of normalized staff name to their daily jobs
  const jobsByStaff = new Map<string, DailyJob[]>()
  const displayNameByKey = new Map<string, string>()
  validJobs.forEach(j => {
    // A shared shift belongs to each cleaner individually
    splitStaffNames(j.staff_name).forEach(name => {
      const key = normalizeStaffName(name)
      if (!key) return
      if (!jobsByStaff.has(key)) jobsByStaff.set(key, [])
      jobsByStaff.get(key)!.push(j)
      if (!displayNameByKey.has(key)) displayNameByKey.set(key, name)
    })
  })

  // 1. Process registered employees
  const matchedStaffKeys = new Set<string>()

  registeredEmployees.forEach(e => {
    const eNorm = normalizeStaffName(e.full_name)
    if (jobsByStaff.has(eNorm)) matchedStaffKeys.add(eNorm)
    // Every whole-word match belongs to this employee ("Laxmi" entries → "Laxmi Rani")
    displayNameByKey.forEach((name, key) => {
      if (!matchedStaffKeys.has(key) && containsWords(e.full_name, name)) matchedStaffKeys.add(key)
    })
    result.push(e)
  })

  // 2. Add auto-discovered staff members from Daily Job Sheet
  jobsByStaff.forEach((jobs, key) => {
    if (matchedStaffKeys.has(key) || deletedKeys.has(key)) return

    // Display name as written in the job sheet
    const displayName = (displayNameByKey.get(key) || key).trim()
    const byDate = [...jobs].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    const earliestDate = byDate[0]?.date || todayDubai()
    // Job-sheet-only staff count as active only while they keep appearing on the sheet (AUD-08)
    const lastDate = byDate[byDate.length - 1]?.date || ''
    const activeSince = new Date(Date.now() - SYNTHETIC_STAFF_ACTIVE_DAYS * 86_400_000).toISOString().split('T')[0]

    // Only facts known from the job sheet — unknown HR fields stay empty ("Not recorded")
    const newEmp: Employee = {
      id: `emp-dj-${key}`,
      full_name: displayName,
      phone: '',
      email: '',
      role: 'cleaner', // unknown until someone registers the employee
      nationality: '',
      emirates_id: '',
      visa_expiry: '',
      work_permit_expiry: '',
      medical_insurance_expiry: '',
      passport_expiry: '',
      skills: [],
      status: lastDate >= activeSince ? 'active' : 'inactive',
      pay_rate_hourly: 0,
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

/**
 * Normalizes and checks if a stored day string (e.g. 'Mon', 'monday', 'Monday')
 * matches the target day of week.
 */
export function matchesDayName(storedDay: string, targetDay: DayOfWeekName): boolean {
  if (!storedDay || !targetDay) return false
  const s = storedDay.toLowerCase().trim()
  const t = targetDay.toLowerCase().trim()
  if (s === t) return true
  // Check standard 3-letter abbreviation (e.g. 'mon' vs 'monday')
  if (s.length >= 3 && t.length >= 3) {
    if (s.slice(0, 3) === t.slice(0, 3)) return true
  }
  return false
}

/**
 * Checks whether a client has a recurring schedule on targetDay
 */
export function isClientScheduledForDay(client: Client, targetDay: DayOfWeekName): boolean {
  // Sunday is off-day by default unless explicitly enabled in day_schedules
  if (targetDay === 'Sunday') {
    if (client.day_schedules) {
      for (const [key, sched] of Object.entries(client.day_schedules)) {
        if (matchesDayName(key, 'Sunday') && (sched as any).enabled === true) {
          return true
        }
      }
    }
    return false
  }

  // 1. Check day_schedules map (takes precedence)
  if (client.day_schedules) {
    for (const [key, sched] of Object.entries(client.day_schedules)) {
      if (matchesDayName(key, targetDay)) {
        if ((sched as any).enabled !== false) return true
        if ((sched as any).enabled === false) return false
      }
    }
  }

  // 2. Check day_cleaner_assignments map
  if (client.day_cleaner_assignments) {
    for (const [key, cln] of Object.entries(client.day_cleaner_assignments)) {
      if (cln && cln.trim() && matchesDayName(key, targetDay)) return true
    }
  }

  // 3. Check service_days (array or comma-separated string)
  if (client.service_days) {
    let rawList: string[] = []
    if (Array.isArray(client.service_days)) {
      rawList = client.service_days.flatMap(d => String(d).split(',').map(x => x.trim()))
    } else if (typeof client.service_days === 'string') {
      rawList = String(client.service_days).split(',').map(x => x.trim())
    }
    if (rawList.some(d => matchesDayName(d, targetDay))) return true
  }

  // 4. Notes or remarks containing 'daily' or 'everyday'
  const notesAndRemarks = `${client.remarks || ''} ${client.notes || ''}`.toLowerCase()
  if (notesAndRemarks.includes('daily') || notesAndRemarks.includes('everyday')) {
    return true
  }

  return false
}

/**
 * Extracts cleaner, start time, end time, and duration for a client on targetDay
 */
export function getClientShiftDetailsForDay(client: Client, targetDay: DayOfWeekName): {
  cleanerName: string
  startTime: string
  endTime: string
  durationHours: number
} {
  let cleaner = ''
  let startTime = client.scheduled_time || ''
  let endTime = client.end_time || ''
  let duration = client.duration_hours || 0

  // 1. Day schedules
  if (client.day_schedules) {
    for (const [key, sched] of Object.entries(client.day_schedules)) {
      if (matchesDayName(key, targetDay) && (sched as any).enabled !== false) {
        if (sched.cleaner?.trim()) cleaner = sched.cleaner.trim()
        if (sched.startTime?.trim()) startTime = sched.startTime.trim()
        if (sched.endTime?.trim()) endTime = sched.endTime.trim()
        if (sched.duration && Number(sched.duration) > 0) duration = Number(sched.duration)
        break
      }
    }
  }

  // 2. Day cleaner assignments
  if (!cleaner && client.day_cleaner_assignments) {
    for (const [key, cln] of Object.entries(client.day_cleaner_assignments)) {
      if (matchesDayName(key, targetDay) && cln?.trim()) {
        cleaner = cln.trim()
        break
      }
    }
  }

  // 3. Preferred cleaner fallback
  if (!cleaner && client.preferred_cleaner?.trim()) {
    cleaner = client.preferred_cleaner.trim()
  }

  if (!cleaner) {
    cleaner = 'Unassigned'
  }

  // Compute duration if missing but start and end time exist
  if ((!duration || duration <= 0) && startTime && endTime) {
    const calc = calcHours(startTime, endTime)
    if (calc > 0) duration = calc
  }

  return { cleanerName: cleaner, startTime, endTime, durationHours: duration }
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
        service_days: s.service_days,
        scheduled_time: s.scheduled_time,
        end_time: s.end_time,
        duration_hours: s.duration_hours,
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
    // Check if client is scheduled on this day
    if (!isClientScheduledForDay(client, dayName)) {
      return
    }

    const { cleanerName, startTime, endTime, durationHours } = getClientShiftDetailsForDay(client, dayName)

    // Format address with building and client name
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

    const area = client.area || 'Dubai'

    const remarks = client.remarks
      ? (client.remarks.includes('Monthly') ? client.remarks : `${client.remarks} (Monthly Schedule)`)
      : '(Monthly Schedule)'

    // Check if this client already has a job on dateStr in dailyJobs
    const matchedJob = jobsOnDate.find(j => {
      if (jobMatchesClient(j, client)) return true

      // Synced rows are written as "<building> - <client name> (Monthly)"
      const cleanAddr = cleanClientNameFromAddress((j.address || '').trim())
      return containsWords(cleanAddr, client.full_name) ||
        Boolean(client.building_name && containsWords(cleanAddr, client.building_name))
    })

    shifts.push({
      client,
      dayName,
      cleanerName,
      startTime,
      endTime,
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

/**
 * Multi-day automated generation for a list of dates (e.g. Next 7 Days).
 * Ensures sequential deduplication as jobs are created.
 */
export function syncMonthlySchedulesForDateRange(
  dateList: string[],
  clients: Client[],
  dailyJobs: DailyJob[],
  addDailyJob: (job: Omit<DailyJob, 'id' | 'created_at'>) => void
): {
  totalInserted: number
  byDate: Record<string, number>
  insertedClients: string[]
} {
  let totalInserted = 0
  const byDate: Record<string, number> = {}
  const allInsertedClients: string[] = []
  const currentJobs: DailyJob[] = [...dailyJobs]

  dateList.forEach(d => {
    const res = syncMonthlySchedulesToDailyJobs(d, clients, currentJobs, (newJob) => {
      addDailyJob(newJob)
      currentJobs.push({
        ...newJob,
        id: `gen-${d}-${Math.random()}`,
        created_at: new Date().toISOString()
      } as DailyJob)
    })
    byDate[d] = res.insertedCount
    totalInserted += res.insertedCount
    allInsertedClients.push(...res.insertedClients)
  })

  return {
    totalInserted,
    byDate,
    insertedClients: allInsertedClients,
  }
}
