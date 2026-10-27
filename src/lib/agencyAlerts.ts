import type { Agency, Employee } from '@/types'
import type { HeroNotification } from '@/components/layout/PageHero'
import { daysUntil, formatDate, isParentCompanyEmployee } from '@/lib/utils'

const ALERT_WINDOW_DAYS = 30       // documents / contracts expiring within this many days
const PAYOUT_GAP_DAYS = 35         // no salary payout for this long = payment alert

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const expiryText = (date: string) => {
  const days = daysUntil(date)
  if (days < 0) return `expired ${plural(-days, 'day')} ago (${formatDate(date)})`
  if (days === 0) return `expires today (${formatDate(date)})`
  return `expires in ${plural(days, 'day')} (${formatDate(date)})`
}

/** Same staff ↔ agency matching the Agency dashboard uses */
function staffOf(agency: Agency, employees: Employee[]): Employee[] {
  if (agency.company_type === 'Parent Company' || agency.id === 'agency-safaeewala') {
    return employees.filter(isParentCompanyEmployee)
  }
  return employees.filter(e =>
    e.agency_id === agency.id ||
    (e.agency_name && e.agency_name.toLowerCase().trim() === agency.name.toLowerCase().trim())
  )
}

/**
 * Alerts for the Agencies header bell, built from live agency + staff data:
 *  - Agency documents: trade license, contract, Emirates ID, passport (expired / ≤30 days)
 *  - Payments: pending / processing payouts, and third-party agencies with active staff
 *    but no salary payout in the last 35 days
 *  - Staff compliance: agency staff with Visa / Work Permit / Passport / EID expired or ≤30 days
 */
export function buildAgencyNotifications(
  agencies: Agency[],
  employees: Employee[],
  openAgency: (agency: Agency) => void,
): HeroNotification[] {
  const list: (HeroNotification & { rank: number })[] = []
  const push = (n: HeroNotification, rank: number) => list.push({ ...n, rank })

  agencies.forEach(agency => {
    if (agency.status === 'inactive') return
    const open = () => openAgency(agency)
    const isParent = agency.company_type === 'Parent Company' || agency.id === 'agency-safaeewala'

    // ── Agency documents & contract ──
    const docs: [string | undefined, string][] = [
      [agency.license_expiry_date, 'Trade license'],
      [agency.contract_end_date, 'Contract'],
      [agency.emirates_id_expiry_date, 'Emirates ID'],
      [agency.passport_expiry_date, 'Passport'],
    ]
    docs.forEach(([date, label]) => {
      if (!date) return
      const days = daysUntil(date)
      if (days > ALERT_WINDOW_DAYS) return
      push({
        id: `${agency.id}-${label}`,
        title: `${agency.name}: ${label} ${days < 0 ? 'expired' : 'expiring'}`,
        detail: `${label} ${expiryText(date)}`,
        tone: days < 0 ? 'danger' : 'warning',
        onClick: open,
      }, days)
    })

    // ── Payments ──
    const payouts = agency.payouts || []
    const unpaid = payouts.filter(p => p.status === 'pending' || p.status === 'processing')
    if (unpaid.length > 0) {
      const total = unpaid.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      push({
        id: `${agency.id}-payouts-pending`,
        title: `${agency.name}: ${plural(unpaid.length, 'payout')} not settled`,
        detail: `AED ${total.toLocaleString()} pending / processing`,
        tone: 'warning',
        onClick: open,
      }, 5)
    }

    const staff = staffOf(agency, employees)
    const activeStaff = staff.filter(e => e.status === 'active' || e.status === 'engaged_in_project')

    if (!isParent && activeStaff.length > 0) {
      const lastSalary = payouts
        .filter(p => p.status === 'paid' && p.payment_type !== 'advance' && p.payment_date)
        .map(p => p.payment_date)
        .sort()
        .pop()
      const gap = lastSalary ? -daysUntil(lastSalary) : null
      if (gap === null || gap > PAYOUT_GAP_DAYS) {
        push({
          id: `${agency.id}-payout-gap`,
          title: `${agency.name}: salary payout due`,
          detail: lastSalary
            ? `Last salary payout ${formatDate(lastSalary)} (${plural(gap!, 'day')} ago) · ${plural(activeStaff.length, 'active staff member')}`
            : `No salary payout recorded yet · ${plural(activeStaff.length, 'active staff member')}`,
          tone: 'warning',
          onClick: open,
        }, 10)
      }
    }

    // ── Staff compliance (grouped per agency) ──
    const staffDocs: [keyof Employee, string][] = [
      ['visa_expiry', 'Visa'],
      ['work_permit_expiry', 'Work Permit'],
      ['passport_expiry', 'Passport'],
      ['eid_end_date', 'EID'],
    ]
    let expired = 0
    const issues: string[] = []
    staff.forEach(e => {
      if (e.status === 'inactive') return
      staffDocs.forEach(([field, label]) => {
        const date = e[field] as string | undefined
        if (!date) return
        const days = daysUntil(date)
        if (days > ALERT_WINDOW_DAYS) return
        if (days < 0) expired++
        issues.push(`${e.full_name} (${label})`)
      })
    })
    if (issues.length > 0) {
      push({
        id: `${agency.id}-staff-docs`,
        title: `${agency.name}: ${plural(issues.length, 'staff document')} ${expired > 0 ? 'expired / expiring' : 'expiring'}`,
        detail: issues.slice(0, 3).join(', ') + (issues.length > 3 ? ` +${issues.length - 3} more` : ''),
        tone: expired > 0 ? 'danger' : 'warning',
        onClick: open,
      }, expired > 0 ? -1 : 15)
    }
  })

  // Most urgent first
  return list.sort((a, b) => a.rank - b.rank)
}
