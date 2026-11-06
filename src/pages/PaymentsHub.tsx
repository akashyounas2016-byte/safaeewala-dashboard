import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock, Users, CheckCircle2, Repeat, PiggyBank, BookOpen, UserCheck, History, Wallet, AlertCircle, TrendingUp } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { KpiCard, Widget } from '@/components/ui/KpiCard'
import { useData } from '@/store/DataContext'
import { safeLocalStorageGet } from '@/lib/storageUtils'
import { loadPendingReceipts } from '@/lib/clientDataSync'
import { lastMonths, monthlyFigures, outstandingNow, type MonthlyPaymentLike } from '@/lib/businessMetrics'
import { formatDate } from '@/lib/utils'
import { PendingPayments } from '@/pages/PendingPayments'
import { PaymentProcessing } from '@/pages/PaymentProcessing'
import type { DailyAdvanceItem, DailyPendingItem } from '@/types'

/**
 * R-FIN-08: Payments is the one money screen. The old Pending screen lives inside it (Outstanding,
 * By Client, Recovered, Cash Book, Staff), next to monthly-contract payments, advances and the full
 * payment history. /pending opens this screen.
 */
export type HubTab = 'outstanding' | 'by_client' | 'recovered' | 'monthly' | 'advances' | 'cash_book' | 'staff_summary' | 'history'
export const HUB_TABS: { key: HubTab; label: string; icon: typeof Clock }[] = [
  { key: 'outstanding', label: 'Outstanding', icon: Clock },
  { key: 'by_client', label: 'By Client', icon: Users },
  { key: 'recovered', label: 'Recovered', icon: CheckCircle2 },
  { key: 'monthly', label: 'Monthly Contracts', icon: Repeat },
  { key: 'advances', label: 'Advances', icon: PiggyBank },
  { key: 'cash_book', label: 'Cash Book', icon: BookOpen },
  { key: 'staff_summary', label: 'Staff Collections', icon: UserCheck },
  { key: 'history', label: 'All Payments', icon: History },
]
const PENDING_TABS: HubTab[] = ['outstanding', 'by_client', 'recovered', 'cash_book', 'staff_summary']
/** Old links: /payments?tab=pending was the short pending list */
export const hubTabOf = (t: string | null): HubTab => (t === 'pending' ? 'outstanding' : HUB_TABS.some(x => x.key === t) ? (t as HubTab) : 'outstanding')

const aed = (n: number) => `AED ${Math.round(n).toLocaleString()}`

function AdvancesPanel() {
  const { clients } = useData()
  const items = safeLocalStorageGet<DailyAdvanceItem[]>('safaeewala_daily_advance_items', [])
  const withCredit = clients.filter(c => (Number(c.advance_amount) || 0) > 0).sort((a, b) => (b.advance_amount || 0) - (a.advance_amount || 0))
  const recent = [...items].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30)
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Widget title="Client credit balances" note="Advance still held for each client" icon={PiggyBank}>
        {withCredit.length === 0 ? <p className="text-[12px] text-slate-400 text-center py-8">No client holds an advance</p> : (
          <ul className="divide-y divide-slate-100">{withCredit.map(c => (
            <li key={c.id} className="py-2.5 flex justify-between text-[13px]">
              <Link to={`/clients/${c.id}`} className="font-semibold text-slate-900 hover:text-emerald-700 truncate">{c.full_name}</Link>
              <span className="font-bold text-emerald-700">{aed(Number(c.advance_amount) || 0)}</span>
            </li>
          ))}</ul>
        )}
      </Widget>
      <Widget title="Advances received" note="Recorded on the Daily Job Sheet (Advance widget)" icon={Wallet}>
        {recent.length === 0 ? <p className="text-[12px] text-slate-400 text-center py-8">No advance recorded</p> : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100"><th className="py-2">Date</th><th className="py-2">Client</th><th className="py-2 text-right">Received</th><th className="py-2 text-right">Advance</th></tr></thead>
            <tbody>{recent.map(a => (
              <tr key={a.id} className="border-b border-slate-50">
                <td className="py-2">{formatDate(a.date)}</td>
                <td className="py-2 font-semibold truncate max-w-[220px]">{a.client}</td>
                <td className="py-2 text-right">{aed(Number(a.received) || 0)}</td>
                <td className="py-2 text-right font-bold text-emerald-700">{aed(Number(a.advance) || 0)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Widget>
    </div>
  )
}

export function PaymentsHub() {
  const { dailyJobs, bookings, clients, dailyExpenses, invoices } = useData()
  const [params, setParams] = useSearchParams()
  const tab = hubTabOf(params.get('tab'))

  const figures = useMemo(() => {
    const monthlyPayments = safeLocalStorageGet<MonthlyPaymentLike[]>('safaeewala_monthly_client_payments', [])
    const pendingReceipts = loadPendingReceipts()
    const manual = safeLocalStorageGet<DailyPendingItem[]>('safaeewala_daily_pending_items', []).reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const out = outstandingNow({ dailyJobs, invoices, pendingReceipts })
    const [m] = monthlyFigures({ dailyJobs, bookings, clients, dailyExpenses, invoices, monthlyPayments, pendingReceipts }, lastMonths(1))
    const thisMonth = m.key
    const recovered = pendingReceipts.filter(p => String(p.date).startsWith(thisMonth)).reduce((s, p) => s + (Number(p.cash) || 0) + (Number(p.online) || 0), 0)
    const advance = clients.reduce((s, c) => s + (Number(c.advance_amount) || 0), 0)
    return { outstanding: out.total + manual, out, manual, collected: m.collected, recovered, contracts: m.contractRevenue, advance, monthLabel: m.label }
  }, [dailyJobs, bookings, clients, dailyExpenses, invoices])

  const go = (t: HubTab) => setParams(p => { const n = new URLSearchParams(p); n.set('tab', t); return n })

  return (
    <div className="space-y-6">
      <PageHero
        title="Payments"
        subtitle={`Pending dues, collections, contracts and advances in one place · ${figures.monthLabel}`}
        statusChip={figures.outstanding > 0 ? `${aed(figures.outstanding)} outstanding` : 'All settled'}
        showSearch={false}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        <KpiCard label="Outstanding" value={aed(figures.outstanding)} sub={`Jobs ${aed(figures.out.jobs)} · invoices ${aed(figures.out.invoices)} · manual ${aed(figures.manual)}`} icon={AlertCircle} labelColor="text-rose-700" iconSolid="bg-[#e11d48] shadow-rose-500/25" chip={figures.outstanding > 0 ? 'To collect' : 'All clear'} chipTone={figures.outstanding > 0 ? 'warn' : 'up'} active={tab === 'outstanding'} onClick={() => go('outstanding')} />
        <KpiCard label="Collected This Month" value={aed(figures.collected)} sub="Received, recoveries, contracts" icon={TrendingUp} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" chip="All payments" chipTone="up" active={tab === 'history'} onClick={() => go('history')} />
        <KpiCard label="Pending Recovered" value={aed(figures.recovered)} sub="Old dues collected this month" icon={CheckCircle2} labelColor="text-teal-700" iconSolid="bg-[#0d9488] shadow-teal-500/25" chip="Recovered" chipTone="up" active={tab === 'recovered'} onClick={() => go('recovered')} />
        <KpiCard label="Monthly Contracts" value={aed(figures.contracts)} sub="Contract payments this month" icon={Repeat} labelColor="text-indigo-700" iconSolid="bg-[#4f46e5] shadow-indigo-500/25" chip="Contracts" active={tab === 'monthly'} onClick={() => go('monthly')} />
        <KpiCard label="Advance Balance" value={aed(figures.advance)} sub="Client credits held" icon={PiggyBank} labelColor="text-amber-700" iconSolid="bg-[#d97706] shadow-amber-500/25" chip="Advances" active={tab === 'advances'} onClick={() => go('advances')} />
      </div>

      <nav className="flex items-center gap-1.5 flex-wrap bg-white p-1.5 rounded-2xl border border-[#E4E8EC] shadow-xs" aria-label="Payments">
        {HUB_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => go(t.key)} aria-current={tab === t.key ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold transition-colors cursor-pointer ${tab === t.key ? 'bg-[#0F1F19] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </nav>

      {PENDING_TABS.includes(tab) && <PendingPayments embedded />}
      {tab === 'monthly' && <PaymentProcessing embedded tab="monthly" />}
      {tab === 'history' && <PaymentProcessing embedded tab="history" />}
      {tab === 'advances' && <AdvancesPanel />}
    </div>
  )
}
