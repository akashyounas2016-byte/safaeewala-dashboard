import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Bell, BellOff, Bot, CheckCircle2, Info, RotateCcw, X } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useLayout } from '@/components/layout/Layout'
import { useAlerts } from '@/store/useAlerts'
import { useFieldStaff } from '@/store/useFieldStaff'
import { SOURCE_LABEL, type AlertSeverity, type AlertSource, type CrmAlert } from '@/lib/alerts'

const SEVERITY_STYLE: Record<AlertSeverity, { card: string; icon: string; chip: string; label: string }> = {
  high:   { card: 'border-rose-200 bg-rose-50/50',   icon: 'bg-rose-600 text-white',  chip: 'bg-rose-100 text-rose-800 border-rose-200',   label: 'High' },
  medium: { card: 'border-amber-200 bg-amber-50/40', icon: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Medium' },
  low:    { card: 'border-slate-200 bg-white',       icon: 'bg-sky-500 text-white',   chip: 'bg-sky-50 text-sky-800 border-sky-200',       label: 'Info' },
}

type Tab = 'all' | 'high' | AlertSource

/** R-ALERT-01: every CRM alert in one place (Sidebar → Alerts) */
export function Alerts() {
  const { isField } = useFieldStaff()
  const { alerts, dismissed, dismiss, restoreAll } = useAlerts(!isField)
  const { openAIBot } = useLayout()
  const [tab, setTab] = useState<Tab>('all')
  const [showDismissed, setShowDismissed] = useState(false)

  const sources = (Object.keys(SOURCE_LABEL) as AlertSource[]).filter(s => alerts.some(a => a.source === s))
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: alerts.length },
    { key: 'high', label: 'High priority', count: alerts.filter(a => a.severity === 'high').length },
    ...sources.map(s => ({ key: s as Tab, label: SOURCE_LABEL[s], count: alerts.filter(a => a.source === s).length })),
  ]
  const list = (showDismissed ? dismissed : alerts).filter(a => tab === 'all' || (tab === 'high' ? a.severity === 'high' : a.source === tab))

  const renderAlert = (a: CrmAlert) => {
    const st = SEVERITY_STYLE[a.severity]
    const Icon = a.source === 'ai' ? Bot : a.severity === 'low' ? Info : AlertTriangle
    return (
      <li key={a.id} className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${st.card}`}>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${st.icon}`}><Icon size={17} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13.5px] font-bold text-[#111827]">{a.title}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.chip}`}>{st.label}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{SOURCE_LABEL[a.source]}</span>
          </div>
          {a.message && <p className="text-[12.5px] text-slate-600 mt-1">{a.message}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {/* R-ALERT-03: straight to the booking / job / client to fix it there */}
          {(a.links || []).map(l => (
            <Link key={l.url} to={l.url} className="inline-flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
              {l.label} <ArrowRight size={12} />
            </Link>
          ))}
          {a.opensAIBot ? (
            <button type="button" onClick={openAIBot}
              className="inline-flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white cursor-pointer">
              {a.actionLabel || 'Review'} <ArrowRight size={12} />
            </button>
          ) : a.actionUrl ? (
            <Link to={a.actionUrl} className="inline-flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800">
              {a.actionLabel || 'Open'} <ArrowRight size={12} />
            </Link>
          ) : null}
          {!showDismissed && (
            <button type="button" onClick={() => dismiss(a.id)} aria-label={`Dismiss: ${a.title}`} title="Dismiss"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white cursor-pointer">
              <X size={15} />
            </button>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Alerts"
        subtitle={`${alerts.length} open alert${alerts.length === 1 ? '' : 's'} · ${alerts.filter(a => a.severity === 'high').length} high priority`}
        showSearch={false}
        actions={<span />}
      />

      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 flex items-center justify-between gap-3 flex-wrap">
        <div role="tablist" aria-label="Alert groups" className="flex gap-1.5 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-xl text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5 border ${tab === t.key ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'}`}>
              {t.label}
              <span className={`text-[10.5px] px-1.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowDismissed(v => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">
            {showDismissed ? <><Bell size={13} /> Open alerts</> : <><BellOff size={13} /> Dismissed ({dismissed.length})</>}
          </button>
          {showDismissed && dismissed.length > 0 && (
            <button type="button" onClick={restoreAll}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">
              <RotateCcw size={13} /> Restore all
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] py-16 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={36} />
          <p className="text-[14px] font-bold text-slate-800">{showDismissed ? 'Nothing dismissed' : 'All clear'}</p>
          <p className="text-[12.5px] text-slate-500 mt-1">{showDismissed ? 'Dismissed alerts show here.' : 'No open alerts in this group.'}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">{list.map(renderAlert)}</ul>
      )}
    </div>
  )
}
