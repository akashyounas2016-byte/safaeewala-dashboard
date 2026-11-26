import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Copy, Download, MessageCircle } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { supabase } from '@/lib/supabase'
import { todayDubai } from '@/lib/dubaiTime'
import { notify } from '@/lib/notify'
import { useFolded, FoldButton } from './Foldable'
import { buildPeriodReport, periodReportCsv, periodReportText, reportRange, REPORT_PERIODS, type ReportPeriod } from '@/lib/periodReport'

/**
 * R-OPS-13: Overview → Reports. Pick Daily (today), Yesterday, Last 7 or 30 days; the report shows at once and can
 * be copied, sent by WhatsApp or downloaded (CSV, opens in Excel).
 */
export function ReportsPanel() {
  const { dailyJobs, clients, dailyExpenses } = useData()
  const [period, setPeriod] = useState<ReportPeriod>('today')
  const today = todayDubai()
  const [extra, setExtra] = useState<{ leads?: number; clicks?: number }>({})
  const [folded, toggleFold] = useFolded('reports', true) // R-OPS-17; R-OPS-26: starts folded

  useEffect(() => {
    let alive = true
    const { from, to } = reportRange(period, today)
    const count = async (table: string, col: string) => {
      const { count: n, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
        .gte(col, `${from}T00:00:00+04:00`).lte(col, `${to}T23:59:59.999+04:00`)
      return error ? undefined : n ?? undefined
    }
    void Promise.all([count('fluent_form_leads', 'created_at'), count('whatsapp_clicks', 'clicked_at')])
      .then(([leads, clicks]) => { if (alive) setExtra({ leads, clicks }) })
    return () => { alive = false }
  }, [period, today])

  const r = useMemo(() => buildPeriodReport({ period, today, dailyJobs, clients, expenses: dailyExpenses, ...extra }), [period, today, dailyJobs, clients, dailyExpenses, extra])
  const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`
  const tiles = [
    { label: 'Jobs', value: r.jobs, sub: `${r.cleaners} cleaners · ${r.hours} h` },
    { label: 'Billed', value: aed(r.billed) },
    { label: 'Collected', value: aed(r.collected) },
    { label: 'Pending', value: aed(r.pending), sub: 'on these jobs' },
    { label: 'Expenses', value: aed(r.expenses) },
    { label: 'New clients', value: r.newClients },
    { label: 'Website leads', value: r.leads ?? '…' },
    { label: 'WhatsApp clicks', value: r.clicks ?? '…' },
  ]

  const copy = async () => { try { await navigator.clipboard.writeText(periodReportText(r)); notify.success('Report copied') } catch { notify.error('Could not copy') } }
  const send = () => window.open(`https://wa.me/?text=${encodeURIComponent(periodReportText(r))}`, '_blank', 'noopener')
  const download = () => {
    const blob = new Blob(['﻿' + periodReportCsv(r)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Safaeewala-report-${r.from === r.to ? r.from : `${r.from}_to_${r.to}`}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <div className={`flex items-start justify-between gap-3 flex-wrap ${folded ? '' : 'mb-4'}`}>
        <div>
          <h3 className="text-xl font-bold text-[#111827] mb-1 flex items-center gap-2"><ClipboardList size={19} className="text-emerald-600" /> Reports</h3>
          <p className="text-sm text-[#6B7280]">{r.label} · {r.from === r.to ? r.from : `${r.from} → ${r.to}`}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {REPORT_PERIODS.map(p => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)}
              className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer transition-colors ${period === p.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p.label}</button>
          ))}
          <FoldButton folded={folded} onToggle={toggleFold} />
        </div>
      </div>
      {!folded && <>
      {/* R-OPS-17: full width — the 8 figures in one row on a wide screen */}
      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="rounded-2xl border border-[#E2E5E0] px-4 py-3">
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{t.label}</span>
            <span className="block text-[20px] font-black text-slate-900 leading-tight truncate">{t.value}</span>
            {t.sub && <span className="block text-[11px] text-slate-500">{t.sub}</span>}
          </div>
        ))}
      </div>
      {r.topAreas.length > 0 && (
        <p className="mt-3 text-[12px] text-slate-500"><b className="text-slate-700">Top areas:</b> {r.topAreas.map(a => `${a.area} (${a.jobs})`).join(' · ')}</p>
      )}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={send} className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-bold flex items-center gap-2 cursor-pointer"><MessageCircle size={15} /> Send by WhatsApp</button>
        <button type="button" onClick={() => void copy()} className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12.5px] font-bold flex items-center gap-2 cursor-pointer"><Copy size={15} /> Copy</button>
        <button type="button" onClick={download} className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12.5px] font-bold flex items-center gap-2 cursor-pointer"><Download size={15} /> Download (Excel CSV)</button>
      </div>
      </>}
    </div>
  )
}
