import type { Booking, Client, DailyJob, Invoice } from '@/types'
import { calcJobOTHours, isBogusJob, cleanClientNameFromAddress } from '@/lib/clientDataSync'

export type IssueType = 'duplicate' | 'missing_data' | 'scheduling_conflict' | 'financial_anomaly'
export type IssueSeverity = 'high' | 'medium' | 'low'

export interface DetectedIssue {
  id: string
  type: IssueType
  severity: IssueSeverity
  title: string
  description: string
  entityType: 'booking' | 'client'
  entityId: string
  clientName: string
  date?: string
  amount?: number
  canMoveToPending: boolean
  bookingId?: string
  currentStatus?: string
  recommendation: string
}

export interface AIHealthReport {
  score: number // 0 to 100
  totalScanned: number
  issues: DetectedIssue[]
  highCount: number
  mediumCount: number
  lowCount: number
  duplicateCount: number
  lastScannedAt: string
}

/**
 * Intelligent CRM Data Health and Duplication Analysis Engine
 * Scans bookings, clients, and scheduling records to detect discrepancies.
 */
export function analyzeCRMHealth(bookings: Booking[], clients: Client[]): AIHealthReport {
  const issues: DetectedIssue[] = []
  const todayStr = new Date().toISOString().split('T')[0]

  // 1. Detect Duplicate Bookings
  // Same normalized phone or same client name on the same scheduled date
  const datePhoneMap = new Map<string, Booking[]>()
  bookings.forEach(b => {
    if (b.status === 'cancelled') return
    const cleanPhone = (b.client_phone || '').replace(/\D/g, '')
    const cleanName = (b.client_name || '').toLowerCase().trim()
    const key = `${b.scheduled_date}::${cleanPhone || cleanName}`
    if (key.length > 5) {
      const arr = datePhoneMap.get(key) || []
      arr.push(b)
      datePhoneMap.set(key, arr)
    }
  })

  datePhoneMap.forEach((matchedBookings) => {
    if (matchedBookings.length > 1) {
      matchedBookings.forEach((b, idx) => {
        issues.push({
          id: `dup-booking-${b.id}-${idx}`,
          type: 'duplicate',
          severity: 'high',
          title: `Duplicate Booking Detected`,
          description: `Client "${b.client_name}" has ${matchedBookings.length} bookings scheduled on the same date (${b.scheduled_date}) for "${b.service_type}".`,
          entityType: 'booking',
          entityId: b.id,
          bookingId: b.id,
          clientName: b.client_name,
          date: b.scheduled_date,
          amount: b.total_amount,
          currentStatus: b.status,
          canMoveToPending: b.status !== 'pending',
          recommendation: `Verify with client to confirm whether this is an accidental double-entry. Move redundant job to Pending or Cancelled.`,
        })
      })
    }
  })

  // 2. Scan individual bookings for missing data, zero amounts, and unassigned crew
  bookings.forEach(b => {
    if (b.status === 'cancelled') return

    // Missing or invalid address
    const cleanAddr = (b.service_address || '').trim()
    if (!cleanAddr || cleanAddr.length < 3 || cleanAddr.toLowerCase() === 'dubai') {
      issues.push({
        id: `missing-addr-${b.id}`,
        type: 'missing_data',
        severity: 'medium',
        title: `Incomplete Service Address`,
        description: `Booking for "${b.client_name}" on ${b.scheduled_date} lacks a specific building or apartment address (Currently: "${cleanAddr || 'Blank'}").`,
        entityType: 'booking',
        entityId: b.id,
        bookingId: b.id,
        clientName: b.client_name,
        date: b.scheduled_date,
        currentStatus: b.status,
        canMoveToPending: b.status === 'confirmed',
        recommendation: `Contact client via phone or WhatsApp to retrieve apartment/villa number before cleaners depart.`,
      })
    }

    // Missing or invalid phone number
    const cleanPhone = (b.client_phone || '').replace(/\D/g, '')
    if (!cleanPhone || cleanPhone.length < 7) {
      issues.push({
        id: `invalid-phone-${b.id}`,
        type: 'missing_data',
        severity: 'high',
        title: `Invalid / Missing Contact Phone`,
        description: `Booking for "${b.client_name}" on ${b.scheduled_date} has an invalid or incomplete phone number ("${b.client_phone || 'None'}").`,
        entityType: 'booking',
        entityId: b.id,
        bookingId: b.id,
        clientName: b.client_name,
        date: b.scheduled_date,
        currentStatus: b.status,
        canMoveToPending: b.status === 'confirmed',
        recommendation: `Update the client's phone number so operational alerts and WhatsApp confirmations can reach them.`,
      })
    }

    // Zero value confirmed booking
    if (b.total_amount <= 0 && (b.status === 'confirmed' || b.status === 'completed')) {
      issues.push({
        id: `zero-amount-${b.id}`,
        type: 'financial_anomaly',
        severity: 'medium',
        title: `Zero Value Booking (AED 0)`,
        description: `Booking for "${b.client_name}" (${b.service_type}) is marked as "${b.status}" but has an amount of AED 0.`,
        entityType: 'booking',
        entityId: b.id,
        bookingId: b.id,
        clientName: b.client_name,
        date: b.scheduled_date,
        amount: b.total_amount,
        currentStatus: b.status,
        canMoveToPending: b.status === 'confirmed',
        recommendation: `Check agreed service rate and enter the correct booking fee to maintain accurate revenue reporting.`,
      })
    }

    // Unassigned crew for imminent bookings (today or tomorrow)
    if (b.status === 'confirmed') {
      const isSoon = b.scheduled_date === todayStr || (() => {
        const d = new Date(b.scheduled_date)
        const t = new Date()
        const diff = (d.getTime() - t.getTime()) / (1000 * 3600 * 24)
        return diff >= 0 && diff <= 1
      })()

      if (isSoon && (!b.assigned_crew || b.assigned_crew.length === 0)) {
        issues.push({
          id: `unassigned-crew-${b.id}`,
          type: 'scheduling_conflict',
          severity: 'high',
          title: `Upcoming Job Lacks Assigned Cleaners`,
          description: `Confirmed booking for "${b.client_name}" scheduled for ${b.scheduled_date} at ${b.scheduled_time} has no crew members assigned.`,
          entityType: 'booking',
          entityId: b.id,
          bookingId: b.id,
          clientName: b.client_name,
          date: b.scheduled_date,
          currentStatus: b.status,
          canMoveToPending: true,
          recommendation: `Assign cleaners immediately or temporarily move to Pending while checking crew availability.`,
        })
      }
    }
  })

  // 3. Scan for Duplicate Clients
  const clientPhoneMap = new Map<string, Client[]>()
  clients.forEach(c => {
    const clean = (c.phone || '').replace(/\D/g, '')
    if (clean.length >= 7) {
      const arr = clientPhoneMap.get(clean) || []
      arr.push(c)
      clientPhoneMap.set(clean, arr)
    }
  })

  clientPhoneMap.forEach((matches, phone) => {
    if (matches.length > 1) {
      matches.forEach((c, idx) => {
        issues.push({
          id: `dup-client-${c.id}-${idx}`,
          type: 'duplicate',
          severity: 'medium',
          title: `Duplicate Client Profile Detected`,
          description: `Multiple client records share phone number "${phone}" (Found: ${matches.map(m => m.full_name).join(', ')}).`,
          entityType: 'client',
          entityId: c.id,
          clientName: c.full_name,
          currentStatus: 'active',
          canMoveToPending: false,
          recommendation: `Consolidate booking history and merge duplicate client profiles into a single primary record.`,
        })
      })
    }
  })

  // Calculate overall CRM Health Score (0 - 100)
  const highCount = issues.filter(i => i.severity === 'high').length
  const mediumCount = issues.filter(i => i.severity === 'medium').length
  const lowCount = issues.filter(i => i.severity === 'low').length
  const duplicateCount = issues.filter(i => i.type === 'duplicate').length

  const penalty = highCount * 7 + mediumCount * 3 + lowCount * 1
  const score = Math.max(50, Math.min(100, 100 - penalty))

  return {
    score,
    totalScanned: bookings.length + clients.length,
    issues,
    highCount,
    mediumCount,
    lowCount,
    duplicateCount,
    lastScannedAt: new Date().toISOString(),
  }
}

export interface ChatContextData {
  bookings: Booking[]
  clients: Client[]
  dailyJobs: DailyJob[]
  invoices?: Invoice[]
  monthlyPayments?: any[]
  pendingList?: any[]
  pendingRcvdList?: any[]
}

export interface AIChatMessage {
  id: string
  sender: 'ai' | 'user'
  text: string
  timestamp: string
  actionSuggestion?: {
    type: 'view_pending' | 'view_revenue' | 'view_ot' | 'switch_tab_alerts'
    label: string
  }
}

/**
 * Intelligent AI Chat Assistant Engine for Operations, Revenue, Overtime & Duplicates
 */
export function askCRMAIBot(query: string, data: ChatContextData): AIChatMessage {
  const q = query.toLowerCase().trim()
  const now = new Date()
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const validJobs = (data.dailyJobs || []).filter(j => !isBogusJob(j))

  // 1. Overtime (OT) Analysis
  if (
    q.includes('ot') ||
    q.includes('overtime') ||
    q.includes('over time') ||
    q.includes('extra hour') ||
    q.includes('late')
  ) {
    const cleanerMap = new Map<string, { ot: number; visits: number; duty: number }>()

    validJobs.forEach(j => {
      const staff = (j.staff_name || 'Unassigned').trim()
      const ot = calcJobOTHours(j)
      const duty = Number(j.duty_hours) || 0
      const cur = cleanerMap.get(staff) || { ot: 0, visits: 0, duty: 0 }
      cur.ot += ot
      cur.duty += duty
      cur.visits += 1
      cleanerMap.set(staff, cur)
    })

    const totalOT = Math.round(Array.from(cleanerMap.values()).reduce((s, x) => s + x.ot, 0) * 10) / 10
    const topOT = Array.from(cleanerMap.entries())
      .filter(([, v]) => v.ot > 0)
      .sort((a, b) => b[1].ot - a[1].ot)

    let staffListText = ''
    if (topOT.length > 0) {
      staffListText = topOT.slice(0, 5).map(([name, stats], idx) => (
        `  ${idx + 1}. **${name}:** ${stats.ot}h OT (${stats.visits} shifts, ${stats.duty}h total duty)`
      )).join('\n')
    } else {
      staffListText = '  • Filhal kisi staff ka overtime record nahi hua.'
    }

    return {
      id: `ai-${Date.now()}`,
      sender: 'ai',
      text: `⏱️ **Safaeewala Overtime (OT) Report:**\n\n• **Total Overtime Logged:** **${totalOT} Hours** across all active cleaning shifts.\n\n• **Top Cleaners with Overtime:**\n${staffListText}\n\nℹ️ *Policy Note: Rozana 8:00 PM kay baad kay working hours auto-calculate hokar Overtime mein add hotay hain.*`,
      timestamp: timeStr,
      actionSuggestion: {
        type: 'view_ot',
        label: 'View Cleaners Performance',
      },
    }
  }

  // 2. Revenue & Financial Collections Analysis
  if (
    q.includes('revenue') ||
    q.includes('income') ||
    q.includes('earnings') ||
    q.includes('kamai') ||
    q.includes('collection') ||
    q.includes('cash') ||
    q.includes('charges') ||
    q.includes('aed') ||
    q.includes('sales') ||
    q.includes('paise') ||
    q.includes('billing')
  ) {
    const djReceived = validJobs.reduce((s, j) => s + (Number(j.received) || 0), 0)
    const djCharges = validJobs.reduce((s, j) => s + (Number(j.charges) || 0), 0)
    const monthlyPaymentsTotal = (data.monthlyPayments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const pendingRcvdTotal = (data.pendingRcvdList || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const bookingsCollected = (data.bookings || []).reduce((s, b) => s + (Number(b.total_amount) || 0), 0)

    const totalCollected = djReceived + monthlyPaymentsTotal + pendingRcvdTotal + bookingsCollected

    return {
      id: `ai-${Date.now()}`,
      sender: 'ai',
      text: `💰 **Safaeewala Revenue & Financial Summary:**\n\n• **Total Collections Recorded:** **AED ${totalCollected.toLocaleString()}**\n\n• **Collections Breakdown:**\n  - Daily Job Sheet (Cash/Card): **AED ${djReceived.toLocaleString()}**\n  - Monthly Clients Bank Transfers: **AED ${monthlyPaymentsTotal.toLocaleString()}**\n  - Recovered Pending Payments: **AED ${pendingRcvdTotal.toLocaleString()}**\n  - Direct Bookings Received: **AED ${bookingsCollected.toLocaleString()}**\n\n• **Gross Charges Billed:** AED ${djCharges.toLocaleString()} across ${validJobs.length} operational shifts.`,
      timestamp: timeStr,
      actionSuggestion: {
        type: 'view_revenue',
        label: 'View Revenue & Payments',
      },
    }
  }

  // 3. Pending Payments & Unpaid Dues
  if (
    q.includes('pending') ||
    q.includes('unpaid') ||
    q.includes('dues') ||
    q.includes('balance') ||
    q.includes('baqaya') ||
    q.includes('dena') ||
    q.includes('udhar') ||
    q.includes('overdue')
  ) {
    const djPendingShifts = validJobs.filter(j => (
      String(j.payment_mode).toLowerCase() === 'pending' || (Number(j.charges) > Number(j.received))
    ))
    const djPendingAmt = djPendingShifts.reduce((s, j) => (
      s + Math.max(0, (Number(j.charges) || 0) - (Number(j.received) || 0))
    ), 0)

    const sidePendingAmt = (data.pendingList || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const invoicePendingAmt = (data.invoices || [])
      .filter(i => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + (Number(i.total) || 0), 0)

    const totalPending = djPendingAmt + sidePendingAmt + invoicePendingAmt

    // Top pending clients
    const clientDueMap = new Map<string, number>()
    djPendingShifts.forEach(j => {
      const name = cleanClientNameFromAddress(j.address || 'Client')
      const due = Math.max(0, (Number(j.charges) || 0) - (Number(j.received) || 0))
      clientDueMap.set(name, (clientDueMap.get(name) || 0) + due)
    })
    ;(data.pendingList || []).forEach(p => {
      const name = p.client || p.clientName || 'Client'
      clientDueMap.set(name, (clientDueMap.get(name) || 0) + (Number(p.amount) || 0))
    })

    const topDueClients = Array.from(clientDueMap.entries())
      .filter(([, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)

    let topDueText = ''
    if (topDueClients.length > 0) {
      topDueText = topDueClients.map(([cname, amt], i) => (
        `  ${i + 1}. **${cname}:** AED ${amt.toLocaleString()} due`
      )).join('\n')
    } else {
      topDueText = '  • Tamam clients kay dues clear hain.'
    }

    return {
      id: `ai-${Date.now()}`,
      sender: 'ai',
      text: `⚠️ **Pending Receivables & Unpaid Accounts:**\n\n• **Total Outstanding Balance:** **AED ${totalPending.toLocaleString()}**\n\n• **Source Breakdown:**\n  - Daily Job Sheet Unpaid Shifts: **AED ${djPendingAmt.toLocaleString()}** (${djPendingShifts.length} shifts)\n  - Side-table Pending Collections: **AED ${sidePendingAmt.toLocaleString()}**\n  - Sent/Overdue Invoices: **AED ${invoicePendingAmt.toLocaleString()}**\n\n• **Highest Due Accounts:**\n${topDueText}\n\n💡 *Aap Pending Payments (/pending) screen se in clients ko direct WhatsApp reminder bhej saktay hain.*`,
      timestamp: timeStr,
      actionSuggestion: {
        type: 'view_pending',
        label: 'Open Pending Payments',
      },
    }
  }

  // 4. Duplication & CRM Health Check
  if (
    q.includes('duplicate') ||
    q.includes('dup') ||
    q.includes('error') ||
    q.includes('issue') ||
    q.includes('health') ||
    q.includes('conflict') ||
    q.includes('galti') ||
    q.includes('problem')
  ) {
    const health = analyzeCRMHealth(data.bookings || [], data.clients || [])
    const dupCount = health.duplicateCount
    const highCount = health.highCount

    const dupIssues = health.issues.filter(i => i.type === 'duplicate')
    let sampleDupText = ''
    if (dupIssues.length > 0) {
      sampleDupText = dupIssues.slice(0, 3).map((d, i) => (
        `  ${i + 1}. **${d.clientName}:** ${d.description}`
      )).join('\n')
    } else {
      sampleDupText = '  • Koi duplicate booking nahi mili. Data clean hai.'
    }

    return {
      id: `ai-${Date.now()}`,
      sender: 'ai',
      text: `🛡️ **CRM Data Integrity & Duplication Auditor:**\n\n• **Overall Health Score:** **${health.score}%**\n• **Total Records Audited:** ${health.totalScanned}\n• **Duplicate Bookings Detected:** **${dupCount}**\n• **High Priority Conflicts:** **${highCount}**\n\n• **Detected Duplicates:**\n${sampleDupText}\n\n⚡ *Action Advised: Duplicate ya doubtful bookings ko foran "Pending" status par move karen taakay dispatch team ghalti se double shift na lagaye.*`,
      timestamp: timeStr,
      actionSuggestion: {
        type: 'switch_tab_alerts',
        label: 'Review Alerts & Move to Pending',
      },
    }
  }

  // 5. Staff & Cleaners Duty Hours
  if (
    q.includes('cleaner') ||
    q.includes('cleaners') ||
    q.includes('staff') ||
    q.includes('crew') ||
    q.includes('worker') ||
    q.includes('duty')
  ) {
    const staffMap = new Map<string, { duty: number; visits: number; ot: number }>()
    validJobs.forEach(j => {
      const s = (j.staff_name || 'Staff').trim()
      const duty = Number(j.duty_hours) || 0
      const ot = calcJobOTHours(j)
      const cur = staffMap.get(s) || { duty: 0, visits: 0, ot: 0 }
      cur.duty += duty
      cur.visits += 1
      cur.ot += ot
      staffMap.set(s, cur)
    })

    const topStaff = Array.from(staffMap.entries())
      .sort((a, b) => b[1].duty - a[1].duty)
      .slice(0, 5)

    const staffText = topStaff.map(([name, st], i) => (
      `  ${i + 1}. **${name}:** ${st.duty} duty hours (${st.visits} shifts${st.ot > 0 ? `, ${st.ot}h OT` : ''})`
    )).join('\n')

    return {
      id: `ai-${Date.now()}`,
      sender: 'ai',
      text: `👥 **Active Cleaning Staff Performance:**\n\n• **Total Active Crew Members:** ${staffMap.size}\n• **Total Operational Shifts:** ${validJobs.length}\n\n• **Most Active Cleaners:**\n${staffText}\n\n💡 *Tip: Aap kisi specific cleaner ka naam pooch kar unka schedule bhi check kar saktay hain.*`,
      timestamp: timeStr,
    }
  }

  // 6. Default Fallback Response
  const djReceived = validJobs.reduce((s, j) => s + (Number(j.received) || 0), 0)
  const health = analyzeCRMHealth(data.bookings || [], data.clients || [])
  const totalOT = Math.round(validJobs.reduce((s, j) => s + calcJobOTHours(j), 0) * 10) / 10

  return {
    id: `ai-${Date.now()}`,
    sender: 'ai',
    text: `🤖 **Safaeewala AI CRM Bot — Live Snapshot:**\n\n• **Live Revenue:** **AED ${djReceived.toLocaleString()}** (Collected from shifts)\n• **Overtime (OT):** **${totalOT}h** across crew\n• **Data Health Score:** **${health.score}%** (${health.issues.length} detected discrepancies)\n\nAap mujh se mazeed pooch saktay hain:\n• *"Aaj ka total revenue kitna hai?"*\n• *"Highest overtime (OT) kis cleaner ka hai?"*\n• *"Kaun se clients ka balance pending hai?"*\n• *"Duplicate bookings check karo"*`,
    timestamp: timeStr,
  }
}

