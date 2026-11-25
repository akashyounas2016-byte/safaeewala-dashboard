import { weeklyReportText } from '@/lib/weeklyReport'
import { supabase } from '@/lib/supabase'
import { todayDubai, addDays } from '@/lib/dubaiTime'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock, Users, CheckCircle2, Repeat, PiggyBank, BookOpen, UserCheck, History, Wallet, AlertCircle, TrendingUp, MoreVertical, Send, Download, Plus, EyeOff, Eye, Filter, Percent, ChevronDown, ChevronUp, FileText, Scale, Hourglass, Landmark } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { KpiCard, Widget } from '@/components/ui/KpiCard'
import { useData } from '@/store/DataContext'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { loadPendingReceipts, loadClientAdjustments, calcClientOpeningPending, calcClientPendingBalance } from '@/lib/clientDataSync'
import { calcClientAdvanceBalance } from '@/lib/clientAdvance'
import { outstandingNow, rangeFigures, type MonthlyPaymentLike } from '@/lib/businessMetrics'
import { inPaymentsRange, presetFromParams, resolvePaymentsRange, type PaymentsRangePreset } from '@/lib/paymentsRange'
import { PaymentsDateBar } from '@/components/payments/PaymentsDateBar'
import { formatDate } from '@/lib/utils'
import { PendingPayments, type PendingRequest, type PendingStats } from '@/pages/PendingPayments'
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

/** R-FIN-21: cards the user hid on this computer */
const HIDDEN_CARDS_KEY = 'safaeewala_payments_hidden_cards'
function useHiddenCards() {
  const [hidden, setHidden] = useState<string[]>(() => safeLocalStorageGet<string[]>(HIDDEN_CARDS_KEY, []))
  const save = (next: string[]) => { setHidden(next); safeLocalStorageSet(HIDDEN_CARDS_KEY, next) }
  return { hidden, hide: (id: string) => save([...new Set([...hidden, id])]), showAll: () => save([]) }
}
const daysSince = (date: string) => Math.max(0, Math.round((Date.parse(`${todayDubai()}T00:00:00Z`) - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) / 86_400_000))

function AdvancesPanel() {
  const { clients, dailyJobs } = useData()
  const items = safeLocalStorageGet<DailyAdvanceItem[]>('safaeewala_daily_advance_items', [])
  // R-FIN-15: the advance each client really holds (same formula as the Client Profile) — it read the opening advance only
  const withCredit = useMemo(() => {
    const adj = loadClientAdjustments()
    return clients.map(c => ({ c, held: calcClientAdvanceBalance(c, dailyJobs, adj) })).filter(x => x.held > 0).sort((a, b) => b.held - a.held)
  }, [clients, dailyJobs])
  const recent = [...items].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30)
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Widget title="Client credit balances" note="Advance still held for each client" icon={PiggyBank}>
        {withCredit.length === 0 ? <p className="text-[12px] text-slate-400 text-center py-8">No client holds an advance</p> : (
          <ul className="divide-y divide-slate-100">{withCredit.map(({ c, held }) => (
            <li key={c.id} className="py-2.5 flex justify-between text-[13px]">
              <Link to={`/clients/${c.id}`} className="font-semibold text-slate-900 hover:text-emerald-700 truncate">{c.full_name}</Link>
              <span className="font-bold text-emerald-700">{aed(held)}</span>
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
  // R-FIN-21: one date filter for the whole screen (cards + the Outstanding / Recovered / Cash Book lists); old ?period= links still work
  const preset = presetFromParams(params.get('range'), params.get('period'))
  const from = params.get('from') || '', to = params.get('to') || ''
  const range = useMemo(() => resolvePaymentsRange(preset, from, to), [preset, from, to])
  const setPreset = (p: PaymentsRangePreset) => setParams(prev => { const n = new URLSearchParams(prev); n.set('range', p); n.delete('period'); return n })
  const setCustom = (f: string, t: string) => setParams(prev => { const n = new URLSearchParams(prev); n.set('range', 'custom'); n.delete('period'); if (f) n.set('from', f); else n.delete('from'); if (t) n.set('to', t); else n.delete('to'); return n })
  const [menuOpen, setMenuOpen] = useState(false)
  const [request, setRequest] = useState<PendingRequest | null>(null)
  const [stats, setStats] = useState<PendingStats | null>(null)
  const onStats = useCallback((x: PendingStats) => setStats(x), [])
  const clearRequest = useCallback(() => setRequest(null), [])
  const { hidden, hide, showAll } = useHiddenCards()
  const [cardRows, setCardRows] = useState(1) // R-FIN-22

  const figures = useMemo(() => {
    const monthlyPayments = safeLocalStorageGet<MonthlyPaymentLike[]>('safaeewala_monthly_client_payments', [])
    const pendingReceipts = loadPendingReceipts()
    const manual = safeLocalStorageGet<DailyPendingItem[]>('safaeewala_daily_pending_items', []).reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const out = outstandingNow({ dailyJobs, invoices, pendingReceipts })
    const rf = rangeFigures({ dailyJobs, bookings, clients, dailyExpenses, invoices, monthlyPayments, pendingReceipts }, d => inPaymentsRange(range, d))
    const m = { label: range.label, collected: rf.collected, contractRevenue: rf.contractRevenue }
    const recovered = rf.recovered
    // R-FIN-15: advance held, adjustments and opening balances — the same figures as the Client Profile
    const adjustments = loadClientAdjustments()
    const advance = clients.reduce((s, c) => s + calcClientAdvanceBalance(c, dailyJobs, adjustments), 0)
    const advanceClients = clients.filter(c => calcClientAdvanceBalance(c, dailyJobs, adjustments) > 0).length
    const adjusted = adjustments.filter(a => a.type !== 'advance' && a.type !== 'advance_deduction').reduce((s, a) => s + (Number(a.amount) || 0), 0) + clients.reduce((s, c) => s + (Number(c.adjustment_amount) || 0), 0)
    const opening = clients.reduce((s, c) => s + calcClientOpeningPending(c, pendingReceipts), 0)
    const activeContracts = clients.filter(c => c.contract_active !== false && (c.service_mode === 'biweekly' || (c.service_days || []).length > 0)).length
    const owing = clients.filter(c => calcClientPendingBalance(c, dailyJobs, pendingReceipts, adjustments) > 0).length
    const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length
    const recoveryRate = recovered + out.total + manual > 0 ? Math.round((recovered / (recovered + out.total + manual)) * 100) : 0
    return { outstanding: out.total + manual, out, manual, collected: m.collected, recovered, contracts: m.contractRevenue, advance, advanceClients, adjusted, opening, activeContracts, owing, unpaidInvoices, recoveryRate, monthLabel: m.label }
  }, [dailyJobs, bookings, clients, dailyExpenses, invoices, range])

  const sendWeeklyReport = async () => {
    const today = todayDubai(), from = addDays(today, -6)
    const count = async (table: string, col: string) => {
      try { const { count: n } = await supabase.from(table).select('id', { count: 'exact', head: true }).gte(col, `${from}T00:00:00+04:00`); return n ?? undefined } catch { return undefined }
    }
    const [leads, clicks] = await Promise.all([count('fluent_form_leads', 'created_at'), count('whatsapp_clicks', 'clicked_at')])
    const text = weeklyReportText({ dailyJobs, clients, today, leads, clicks })
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }
  const go = (t: HubTab) => setParams(p => { const n = new URLSearchParams(p); n.set('tab', t); return n })

  return (
    <div className="space-y-6">
      <PageHero
        title="Payments"
        subtitle={`Pending dues, collections, contracts and advances in one place · ${figures.monthLabel}`}
        statusChip={figures.outstanding > 0 ? `${aed(figures.outstanding)} outstanding` : 'All settled'}
        showSearch={false}
        actions={
          // R-FIN-21: Weekly report (R-OPS-12), Export Report and Record Manual Pending in one menu
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen(v => !v)} aria-label="More actions" aria-expanded={menuOpen} title="Weekly report, Export Report, Record Manual Pending"
              className={`h-11 w-11 rounded-2xl border transition-all cursor-pointer flex items-center justify-center backdrop-blur-md shadow-sm ${menuOpen ? 'bg-white text-emerald-800 border-white shadow-md' : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'}`}>
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div role="menu" className="absolute right-0 top-full mt-2 w-60 bg-white rounded-2xl border border-[#E4E8EC] shadow-[0_16px_48px_rgba(15,23,42,0.22)] py-2 z-50 text-slate-800">
                  {([
                    { label: 'Weekly report', note: 'Send on WhatsApp', icon: Send, run: () => void sendWeeklyReport() },
                    { label: 'Export Report', note: 'Outstanding + recovered (Excel)', icon: Download, run: () => { if (!PENDING_TABS.includes(tab)) go('outstanding'); setRequest(r => ({ kind: 'export', n: (r?.n ?? 0) + 1 })) } },
                    { label: 'Record Manual Pending', note: 'A due not on the job sheet', icon: Plus, run: () => { if (!PENDING_TABS.includes(tab)) go('outstanding'); setRequest(r => ({ kind: 'add', n: (r?.n ?? 0) + 1 })) } },
                  ] as const).map(a => (
                    <button key={a.label} type="button" role="menuitem" onClick={() => { setMenuOpen(false); a.run() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50 cursor-pointer">
                      <a.icon size={15} className="text-emerald-700 shrink-0" />
                      <span className="min-w-0"><span className="block text-[12.5px] font-semibold text-slate-800">{a.label}</span><span className="block text-[11px] text-slate-500">{a.note}</span></span>
                    </button>
                  ))}
                  {hidden.length > 0 && (
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); showAll() }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50 cursor-pointer border-t border-slate-100 mt-1">
                      <Eye size={15} className="text-slate-500 shrink-0" /><span className="text-[12.5px] font-semibold text-slate-700">Show hidden cards ({hidden.length})</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        }
      />

      {/* R-FIN-21: the one date filter (it was here and again above the Outstanding list) */}
      <PaymentsDateBar range={range} from={from} to={to} onPreset={setPreset} onCustom={setCustom}
        note={PENDING_TABS.includes(tab) ? 'cards, Outstanding, Recovered and Cash Book' : 'cards'} />

      {/* R-FIN-21: the money cards — each can be hidden (⋮ → Show hidden cards brings them back) */}
      {(() => {
        const onPending = PENDING_TABS.includes(tab)
        const cards: { id: string; label: string; value: string; sub: string; icon: typeof Clock; color: string; solid: string; chip?: string; tone?: 'up' | 'warn' | 'plain'; active?: boolean; onClick?: () => void }[] = [
          // R-FIN-23: no "To collect" tag (the card was taller than the others); a short line that fits
          { id: 'outstanding', label: 'Outstanding', value: aed(figures.outstanding), sub: [figures.out.jobs ? `Jobs ${aed(figures.out.jobs)}` : '', figures.out.invoices ? `Invoices ${aed(figures.out.invoices)}` : '', figures.manual ? `Manual ${aed(figures.manual)}` : ''].filter(Boolean).join(' · ') || 'All settled', icon: AlertCircle, color: 'text-rose-700', solid: 'bg-[#e11d48] shadow-rose-500/25', active: tab === 'outstanding', onClick: () => go('outstanding') },
          { id: 'collected', label: 'Collected', value: aed(figures.collected), sub: `Received, recoveries, contracts · ${range.label}`, icon: TrendingUp, color: 'text-emerald-700', solid: 'bg-[#059669] shadow-emerald-500/25', active: tab === 'history', onClick: () => go('history') },
          { id: 'recovered', label: 'Pending Recovered', value: aed(figures.recovered), sub: `Old dues collected · ${range.label}`, icon: CheckCircle2, color: 'text-teal-700', solid: 'bg-[#0d9488] shadow-teal-500/25', active: tab === 'recovered', onClick: () => go('recovered') },
          { id: 'contracts', label: 'Monthly Contracts', value: aed(figures.contracts), sub: `Contract payments · ${range.label}`, icon: Repeat, color: 'text-indigo-700', solid: 'bg-[#4f46e5] shadow-indigo-500/25', active: tab === 'monthly', onClick: () => go('monthly') },
          { id: 'advance', label: 'Advance Balance', value: aed(figures.advance), sub: `${figures.advanceClients} client${figures.advanceClients === 1 ? '' : 's'} paid ahead`, icon: PiggyBank, color: 'text-amber-700', solid: 'bg-[#b45309] shadow-amber-500/25', active: tab === 'advances', onClick: () => go('advances') },
          { id: 'filtered_due', label: 'Filtered Due Total', value: onPending && stats ? aed(stats.total) : '—', sub: onPending && stats ? `${stats.count} due${stats.count === 1 ? '' : 's'} · ${range.label} + list filters` : 'Open Outstanding to see', icon: Filter, color: 'text-amber-700', solid: 'bg-[#d97706] shadow-amber-500/25', onClick: () => go('outstanding') },
          { id: 'recovery_rate', label: 'Recovery Rate', value: `${figures.recoveryRate}%`, sub: 'Recovered ÷ (recovered + outstanding)', icon: Percent, color: 'text-teal-700', solid: 'bg-[#0f766e] shadow-teal-500/25' },
          { id: 'owing', label: 'Clients Owing', value: String(figures.owing), sub: 'Clients with a balance due', icon: Users, color: 'text-rose-700', solid: 'bg-[#be123c] shadow-rose-500/25', active: tab === 'by_client', onClick: () => go('by_client') },
          { id: 'oldest', label: 'Oldest Due', value: onPending && stats?.oldest ? `${daysSince(stats.oldest)} days` : '—', sub: onPending && stats?.oldest ? `Since ${formatDate(stats.oldest)}` : onPending ? 'No open due' : 'Open Outstanding to see', icon: Hourglass, color: 'text-slate-700', solid: 'bg-[#475569] shadow-slate-500/25', onClick: () => go('outstanding') },
          { id: 'invoices', label: 'Unpaid Invoices', value: aed(figures.out.invoices), sub: `${figures.unpaidInvoices} invoice${figures.unpaidInvoices === 1 ? '' : 's'} sent or overdue`, icon: FileText, color: 'text-sky-700', solid: 'bg-[#0284c7] shadow-sky-500/25' },
          { id: 'adjustments', label: 'Adjustments', value: aed(figures.adjusted), sub: 'Discounts, waivers, corrections given', icon: Scale, color: 'text-indigo-700', solid: 'bg-[#6366f1] shadow-indigo-500/25' },
          { id: 'opening', label: 'Opening Balances', value: aed(figures.opening), sub: 'Old dues brought in, still open', icon: Landmark, color: 'text-rose-700', solid: 'bg-[#9f1239] shadow-rose-500/25' },
        ]
        const visible = cards.filter(c => !hidden.includes(c.id))
        // R-FIN-22: 5 cards a row, one row at first (the five cards of before R-FIN-21); the arrow opens one more row
        const shown = visible.slice(0, cardRows * 5)
        const moreRows = Math.ceil(visible.length / 5)
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 auto-rows-fr gap-3">
              {shown.map(c => (
                <div key={c.id} className="relative group/card h-full min-w-0 [&>*:first-child]:h-full">
                  <KpiCard label={c.label} value={c.value} sub={c.sub} icon={c.icon} labelColor={c.color} iconSolid={c.solid} chip={c.chip} chipTone={c.tone} active={c.active} onClick={c.onClick} />
                  <button type="button" onClick={() => hide(c.id)} aria-label={`Hide ${c.label}`} title="Hide this card"
                    className="absolute bottom-2 right-2 w-6 h-6 rounded-lg bg-white/90 border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 flex items-center justify-center opacity-0 group-hover/card:opacity-100 focus:opacity-100 transition-opacity cursor-pointer">
                    <EyeOff size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {hidden.length > 0 ? (
                <button type="button" onClick={showAll} className="text-[11.5px] font-bold text-slate-500 hover:text-emerald-700 cursor-pointer flex items-center gap-1">
                  <Eye size={12} /> {hidden.length} hidden card{hidden.length === 1 ? '' : 's'} · Show all
                </button>
              ) : <span />}
              {moreRows > 1 && (
                <div className="flex items-center gap-1.5">
                  {cardRows > 1 && (
                    <button type="button" onClick={() => setCardRows(1)} aria-label="Show fewer cards" title="Show fewer cards"
                      className="h-8 px-3 rounded-xl border border-[#E4E8EC] bg-white text-[12px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"><ChevronUp size={14} /> Less</button>
                  )}
                  {cardRows < moreRows && (
                    <button type="button" onClick={() => setCardRows(r => r + 1)} aria-label="Show more cards" title="Show the next row of cards"
                      className="h-8 px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 cursor-pointer">View more <ChevronDown size={14} /> <span className="text-emerald-600/70">({visible.length - shown.length})</span></button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}
      <nav className="flex items-center gap-1.5 flex-wrap bg-white p-1.5 rounded-2xl border border-[#E4E8EC] shadow-xs" aria-label="Payments">
        {HUB_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => go(t.key)} aria-current={tab === t.key ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold transition-colors cursor-pointer ${tab === t.key ? 'bg-[#0F1F19] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </nav>

      {PENDING_TABS.includes(tab) && <PendingPayments embedded range={range} request={request} onRequestDone={clearRequest} onStats={onStats} />}
      {tab === 'monthly' && <PaymentProcessing embedded tab="monthly" />}
      {tab === 'history' && <PaymentProcessing embedded tab="history" />}
      {tab === 'advances' && <AdvancesPanel />}
    </div>
  )
}
