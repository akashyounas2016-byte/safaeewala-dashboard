import React from 'react'
import {
  Receipt, Wallet, CheckCircle, TrendingUp, DollarSign,
  AlertCircle, CreditCard, Clock, Users, Briefcase,
} from 'lucide-react'

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
}) => {
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
      valueColor: 'text-white drop-shadow-xs',
      labelColor: 'text-white/95',
      sublabelColor: 'text-emerald-100',
      bg: netTotal >= 0
        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30'
        : 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30',
      border: netTotal >= 0 ? 'border-2 border-emerald-400/90' : 'border-2 border-rose-400/90',
      icon: DollarSign,
      iconBg: 'bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-xs shadow-xs',
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
      sublabel: isDateRange ? 'Cleaners deployed' : 'Present on shift',
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

  return (
    <div className="space-y-3 sm:space-y-3.5">
      {/* Row 1: Primary Financial & Net Revenue Flow (Charges card first!) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
        {row1Cards.map(c => {
          const Icon = c.icon
          return (
            <button
              key={c.id}
              type="button"
              onClick={c.onClick}
              title={c.tooltip}
              className={`group relative rounded-[22px] ${c.border} ${c.bg} p-4 sm:p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] cursor-pointer flex flex-col justify-between text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1`}
            >
              <div className="flex items-start justify-between gap-2 mb-2 w-full">
                <span className={`text-[11px] font-bold tracking-wider uppercase truncate ${c.labelColor}`}>
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

      {/* Row 2: Breakdowns & Operational Workload (5 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
        {row2Cards.map(c => {
          const Icon = c.icon
          return (
            <button
              key={c.id}
              type="button"
              onClick={c.onClick}
              title={c.tooltip}
              className={`group relative rounded-[22px] ${c.border} ${c.bg} p-4 sm:p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] cursor-pointer flex flex-col justify-between text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1`}
            >
              <div className="flex items-start justify-between gap-2 mb-2 w-full">
                <span className={`text-[11px] font-bold tracking-wider uppercase truncate ${c.labelColor}`}>
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
