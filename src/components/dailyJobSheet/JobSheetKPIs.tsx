import React from 'react'
import {
  Receipt, Wallet, CheckCircle, TrendingUp, DollarSign,
  AlertCircle, CreditCard, Clock, Users, Briefcase,
  CalendarClock, Radio, CheckCircle2, Repeat, BadgeDollarSign, Timer,
} from 'lucide-react'
import type { DailyJob } from '@/types'
import { jobProgressByTime, dubaiMinutes } from '@/lib/overviewStats'
import { todayDubai } from '@/lib/dubaiTime'
import { cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'
import { CardsCustomizer, useCardPrefs } from '@/components/overview/CardsCustomizer'

/** R-SHEET-06: the Bookings cards brought here (hidden at first; shown from "Cards") */
export const JOB_SHEET_EXTRA_CARDS = ['scheduled', 'live', 'completed', 'monthly_jobs', 'billed', 'duty_hours']

export interface JobSheetKPIsProps {
  isDateRange: boolean
  totalCharges: number
  grossCollected: number
  pendingCashRcvdForNet: number
  totalExpenses: number
  netTotal: number
  pendingTotal: number
  onlineTotal: number
  totalOTHours: number
  staffOnDuty: number
  jobsCount: number
  onPaymentFilter: (filter: 'ALL' | 'Cash' | 'Online' | 'Pending' | 'Monthly') => void
  onScrollTo: (id: string) => void
  onEnableOTColumn: () => void
  /** R-SHEET-06: the jobs of the open date(s), for the Bookings cards */
  jobs?: DailyJob[]
}

export const JobSheetKPIs: React.FC<JobSheetKPIsProps> = ({
  isDateRange,
  totalCharges,
  grossCollected,
  pendingCashRcvdForNet,
  totalExpenses,
  netTotal,
  pendingTotal,
  onlineTotal,
  totalOTHours,
  staffOnDuty,
  jobsCount,
  onPaymentFilter,
  onScrollTo,
  onEnableOTColumn,
  jobs = [],
}) => {
  // R-SHEET-06: Scheduled / Live / Completed by the jobs' times (same as Bookings and the Overview)
  const today = todayDubai(), nowMin = dubaiMinutes()
  const progress = jobs.map(j => ({ j, st: jobProgressByTime(j, today, nowMin) }))
  const nScheduled = progress.filter(x => x.st === 'confirmed').length
  const nLive = progress.filter(x => x.st === 'in_progress').length
  const done = progress.filter(x => x.st === 'completed')
  const nMonthly = jobs.filter(j => /monthly/i.test(String(j.payment_mode || ''))).length
  const billed = done.reduce((s, x) => s + cleanNum(x.j.charges), 0)
  const dutyHours = Math.round(jobs.reduce((s, j) => s + cleanNum(j.duty_hours), 0) * 10) / 10
  const toJobs = () => { onPaymentFilter('ALL'); onScrollTo('jobs-table-section') }
  const row1Cards = [
    {
      id: 'charges',
      label: 'CHARGES',
      sublabel: 'Total billed amount',
      value: `AED ${totalCharges.toLocaleString()}`,
      valueColor: 'text-indigo-950',
      labelColor: 'text-indigo-700',
      sublabelColor: 'text-slate-500',
      bg: 'bg-gradient-to-br from-indigo-50/95 via-indigo-50/40 to-white hover:from-indigo-100/90 hover:to-indigo-50/70',
      border: 'border-2 border-indigo-200 hover:border-indigo-400',
      icon: Receipt,
      iconBg: 'bg-[#4f46e5] text-white shadow-md shadow-indigo-500/25',
      tooltip: 'Click to view Jobs Table & Charges column',
      onClick: () => {
        onPaymentFilter('ALL')
        onScrollTo('jobs-table-section')
      },
    },
    {
      id: 'collection',
      label: isDateRange ? 'GROSS COLLECTED' : 'TODAY COLLECTION',
      sublabel: isDateRange ? 'Direct collections' : 'Cash & direct today',
      value: `AED ${grossCollected.toLocaleString()}`,
      valueColor: 'text-emerald-950',
      labelColor: 'text-emerald-700',
      sublabelColor: 'text-slate-500',
      bg: 'bg-gradient-to-br from-emerald-50/95 via-emerald-50/40 to-white hover:from-emerald-100/90 hover:to-emerald-50/70',
      border: 'border-2 border-emerald-300 hover:border-emerald-400',
      icon: Wallet,
      iconBg: 'bg-[#059669] text-white shadow-md shadow-emerald-500/25',
      tooltip: 'Click to view Driver & Staff Collections Summary',
      onClick: () => {
        onScrollTo('driver-summary-widget')
      },
    },
    {
      id: 'pending-rcvd',
      label: 'PENDING CASH RECEIVED',
      sublabel: 'Recovered cash dues',
      value: `AED ${pendingCashRcvdForNet.toLocaleString()}`,
      valueColor: 'text-[#0f766e]',
      labelColor: 'text-teal-700',
      sublabelColor: 'text-slate-500',
      bg: 'bg-gradient-to-br from-teal-50/95 via-teal-50/40 to-white hover:from-teal-100/90 hover:to-teal-50/70',
      border: 'border-2 border-teal-300 hover:border-teal-400',
      icon: CheckCircle,
      iconBg: 'bg-[#008f7a] text-white shadow-md shadow-teal-500/25',
      tooltip: 'Click to view Pending Received Reconciliation widget',
      onClick: () => {
        onScrollTo('pending-received-widget')
      },
    },
    {
      id: 'expenses',
      label: 'EXPENSES',
      sublabel: 'Fuel, supplies & others',
      value: `AED ${totalExpenses.toLocaleString()}`,
      valueColor: 'text-[#b45309]',
      labelColor: 'text-amber-800',
      sublabelColor: 'text-slate-500',
      bg: 'bg-gradient-to-br from-amber-50/95 via-amber-50/40 to-white hover:from-amber-100/90 hover:to-amber-50/70',
      border: 'border-2 border-amber-300 hover:border-amber-400',
      icon: TrendingUp,
      iconBg: 'bg-[#ea580c] text-white shadow-md shadow-amber-500/25',
      tooltip: 'Click to view Expenses Log widget',
      onClick: () => {
        onScrollTo('expenses-log-widget')
      },
    },
    {
      id: 'net-total',
      label: 'NET TOTAL',
      sublabel: 'Net bottom line in hand',
      value: `AED ${netTotal.toLocaleString()}`,
      valueColor: netTotal >= 0 ? 'text-[#0B6B4F]' : 'text-rose-700',
      labelColor: netTotal >= 0 ? 'text-emerald-800' : 'text-rose-700',
      sublabelColor: 'text-slate-500',
      bg: '',
      border: '',
      icon: DollarSign,
      iconBg: netTotal >= 0 ? 'bg-[#0E5A47] text-white shadow-md shadow-emerald-700/25' : 'bg-rose-600 text-white shadow-md shadow-rose-500/25',
      tooltip: 'Click to view Financial Breakdown & Summary',
      onClick: () => {
        onScrollTo('bottom-panels-section')
      },
    },
  ]

  const row2Cards = [
    {
      id: 'pending',
      label: 'PENDING',
      sublabel: 'Uncollected balances',
      value: `AED ${pendingTotal.toLocaleString()}`,
      valueColor: 'text-rose-900',
      labelColor: 'text-rose-700',
      sublabelColor: 'text-slate-500',
      bg: 'bg-gradient-to-br from-rose-50/95 via-rose-50/40 to-white hover:from-rose-100/90 hover:to-rose-50/70',
      border: 'border-2 border-rose-300 hover:border-rose-400',
      icon: AlertCircle,
      iconBg: 'bg-[#e11d48] text-white shadow-md shadow-rose-500/25',
      tooltip: 'Click to view Today Pending Records widget',
      onClick: () => {
        onScrollTo('today-pending-widget')
      },
    },
    {
      id: 'online',
      label: 'ONLINE',
      sublabel: 'Card & bank transfers',
      value: `AED ${onlineTotal.toLocaleString()}`,
      valueColor: 'text-sky-900',
      labelColor: 'text-sky-700',
      sublabelColor: 'text-slate-500',
      bg: 'bg-gradient-to-br from-sky-50/95 via-sky-50/40 to-white hover:from-sky-100/90 hover:to-sky-50/70',
      border: 'border-2 border-sky-300 hover:border-sky-400',
      icon: CreditCard,
      iconBg: 'bg-[#0284c7] text-white shadow-md shadow-sky-500/25',
      tooltip: 'Click to filter Jobs Table by Online Mode',
      onClick: () => {
        onPaymentFilter('Online')
        onScrollTo('jobs-table-section')
      },
    },
    {
      id: 'ot',
      label: 'OT (OVERTIME)',
      sublabel: 'Total approved OT',
      value: `${totalOTHours}h`,
      valueColor: 'text-[#c2410c]',
      labelColor: 'text-orange-800',
      sublabelColor: 'text-slate-500',
      bg: 'bg-gradient-to-br from-orange-50/95 via-orange-50/40 to-white hover:from-orange-100/90 hover:to-orange-50/70',
      border: 'border-2 border-orange-300 hover:border-orange-400',
      icon: Clock,
      iconBg: 'bg-[#ea580c] text-white shadow-md shadow-orange-500/25',
      tooltip: 'Click to view Overtime in Jobs Table',
      onClick: () => {
        onEnableOTColumn()
        onScrollTo('jobs-table-section')
      },
    },
    {
      id: 'staff',
      label: isDateRange ? 'ACTIVE STAFF' : 'STAFF ON DUTY',
      // R-EMP-19: cleaners with at least one job, each once (one with 2 jobs counts once) — not the idle ones
      sublabel: isDateRange ? 'Cleaners with jobs · each once' : 'Cleaners with a job · each once',
      value: String(staffOnDuty),
      valueColor: 'text-[#065f46]',
      labelColor: 'text-emerald-800',
      sublabelColor: 'text-slate-500',
      bg: 'bg-gradient-to-br from-emerald-50/95 via-emerald-50/40 to-white hover:from-emerald-100/90 hover:to-emerald-50/70',
      border: 'border-2 border-emerald-300 hover:border-emerald-400',
      icon: Users,
      iconBg: 'bg-[#047857] text-white shadow-md shadow-emerald-500/25',
      tooltip: 'Click to view Driver / Staff Summary widget',
      onClick: () => {
        onScrollTo('driver-summary-widget')
      },
    },
    {
      id: 'jobs',
      label: isDateRange ? 'TOTAL JOBS' : 'JOBS TODAY',
      sublabel: isDateRange ? 'Total assignments' : 'Bookings scheduled',
      value: String(jobsCount),
      valueColor: 'text-blue-950',
      labelColor: 'text-blue-700',
      sublabelColor: 'text-slate-500',
      bg: 'bg-gradient-to-br from-blue-50/95 via-blue-50/40 to-white hover:from-blue-100/90 hover:to-blue-50/70',
      border: 'border-2 border-blue-300 hover:border-blue-400',
      icon: Briefcase,
      iconBg: 'bg-[#2563eb] text-white shadow-md shadow-blue-500/25',
      tooltip: 'Click to view All Jobs in Table',
      onClick: () => {
        onPaymentFilter('ALL')
        onScrollTo('jobs-table-section')
      },
    },
  ]

  const extraCards = [
    { id: 'scheduled', label: 'SCHEDULED', sublabel: 'Jobs still to start', value: String(nScheduled), valueColor: 'text-teal-950', labelColor: 'text-teal-700', sublabelColor: 'text-slate-500', icon: CalendarClock, iconBg: 'bg-[#0d9488] text-white shadow-md shadow-teal-500/25', tooltip: 'Jobs whose time has not started yet', onClick: toJobs },
    { id: 'live', label: 'LIVE NOW', sublabel: 'Cleaners on site now', value: String(nLive), valueColor: 'text-cyan-950', labelColor: 'text-cyan-700', sublabelColor: 'text-slate-500', icon: Radio, iconBg: 'bg-[#0891b2] text-white shadow-md shadow-cyan-500/25', tooltip: 'Jobs going on right now', onClick: toJobs },
    { id: 'completed', label: 'COMPLETED', sublabel: 'Jobs finished', value: String(done.length), valueColor: 'text-emerald-950', labelColor: 'text-emerald-700', sublabelColor: 'text-slate-500', icon: CheckCircle2, iconBg: 'bg-[#059669] text-white shadow-md shadow-emerald-500/25', tooltip: 'Jobs whose time has ended', onClick: toJobs },
    { id: 'monthly_jobs', label: 'MONTHLY JOBS', sublabel: 'Monthly contract visits', value: String(nMonthly), valueColor: 'text-teal-950', labelColor: 'text-teal-700', sublabelColor: 'text-slate-500', icon: Repeat, iconBg: 'bg-[#0f766e] text-white shadow-md shadow-teal-500/25', tooltip: 'Click to show the Monthly jobs', onClick: () => { onPaymentFilter('Monthly'); onScrollTo('jobs-table-section') } },
    { id: 'billed', label: 'BILLED REVENUE', sublabel: 'Charges of finished jobs', value: `AED ${billed.toLocaleString()}`, valueColor: 'text-purple-950', labelColor: 'text-purple-700', sublabelColor: 'text-slate-500', icon: BadgeDollarSign, iconBg: 'bg-[#7c3aed] text-white shadow-md shadow-purple-500/25', tooltip: 'Charges of the jobs whose time has ended', onClick: toJobs },
    { id: 'duty_hours', label: 'DUTY HOURS', sublabel: 'Total booked hours', value: `${dutyHours}h`, valueColor: 'text-sky-950', labelColor: 'text-sky-700', sublabelColor: 'text-slate-500', icon: Timer, iconBg: 'bg-[#0284c7] text-white shadow-md shadow-sky-500/25', tooltip: 'Duty hours of the open date(s)', onClick: toJobs },
  ]
  // R-SHEET-06: one list — shown, hidden and ordered from "Cards" (saved on this computer)
  const allCards = [...row1Cards, ...row2Cards, ...extraCards]
  const [prefs, setPrefs] = useCardPrefs(allCards.map(c => c.id), JOB_SHEET_EXTRA_CARDS, 'safaeewala_job_sheet_cards')
  const byId = new Map(allCards.map(c => [c.id, c]))
  const shown = prefs.order.filter(id => !prefs.hidden.includes(id)).map(id => byId.get(id)!).filter(Boolean)

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CardsCustomizer title="Daily Job Sheet cards" cards={allCards.map(c => ({ id: c.id, label: c.label.charAt(0) + c.label.slice(1).toLowerCase() }))} prefs={prefs} onChange={setPrefs} defaultHidden={JOB_SHEET_EXTRA_CARDS} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
        {shown.map(c => {
          const Icon = c.icon
          return (
            <button
              key={c.id}
              type="button"
              onClick={c.onClick}
              title={c.tooltip}
              className={`group relative rounded-[16px] bg-white hover:bg-[#FAFBF9] border border-[#E2E5E0] hover:border-[#C9D2CC] shadow-[0_1px_2px_rgba(20,32,27,0.04)] p-4 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] cursor-pointer flex flex-col justify-between text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1`}
            >
              <div className="flex items-start justify-between gap-2 mb-2 w-full">
                <span className={`text-[11px] font-bold tracking-wider uppercase leading-[1.3] line-clamp-2 break-words min-w-0 ${c.labelColor}`}>{/* UX-101 */}
                  {c.label}
                </span>
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${c.iconBg}`}
                >
                  <Icon size={18} strokeWidth={2.2} />
                </div>
              </div>

              <div className="w-full">
                <p className={`text-[23px] sm:text-[26px] font-black tracking-tight leading-tight truncate ${c.valueColor}`}>
                  {c.value}
                </p>
                <p className={`text-[11px] sm:text-[11.5px] font-medium mt-1 truncate ${c.sublabelColor}`}>
                  {c.sublabel}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
