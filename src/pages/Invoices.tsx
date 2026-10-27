import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Download, Send, AlertCircle, TrendingUp, CheckCircle, Clock,
  FileText, Percent, Trash2, DollarSign, User, MapPin, Sparkles,
  CalendarCheck, ArrowRight, Calendar, CalendarDays, Tag, X, RotateCcw,
  ChevronDown, Check
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatDate } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { Invoice, Client } from '@/types'
import { extractAllClientsFromDailyJobs } from '@/lib/clientDataSync'
import { getCompanyInfo, useCompanyInfo } from '@/lib/companyInfo'
import { nextInvoiceNumber } from '@/lib/invoiceNumber'
import { invoiceBalance, isPartlyPaid } from '@/lib/receivables'
import { notify } from '@/lib/notify'

const escapeHtml = (v: string) => v.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string))

export type InvoiceDatePreset = 'all' | 'today' | 'this_week' | 'this_month' | '7days' | '30days' | 'custom'


/* ─── Status pill ─── */
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    'partly paid': { bg: 'bg-amber-50', text: 'text-amber-800' },
    paid:    { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
    sent:    { bg: 'bg-blue-50',     text: 'text-blue-700' },
    overdue: { bg: 'bg-red-50',      text: 'text-red-700' },
    draft:   { bg: 'bg-slate-100',   text: 'text-slate-600' },
  }
  const c = cfg[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600' }
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${c.bg} ${c.text}`}>
      {status}
    </span>
  )
}

function printInvoice(invoice: Invoice) {
  const win = window.open('', '_blank', 'width=820,height=700')
  if (!win) return
  const lines = invoice.line_items.map(item => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#374151">${item.description}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">${item.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">AED ${item.unit_price.toLocaleString()}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#111827">AED ${item.amount.toLocaleString()}</td>
    </tr>`).join('')

  const grossSubtotal = (invoice.subtotal || 0) + (invoice.discount_amount || 0)
  // Company details from Settings, never hard-coded (AUD-34)
  const company = getCompanyInfo()
  const companyTrn = invoice.company_trn || company.trn

  win.document.write(`<!DOCTYPE html><html><head>
    <title>Invoice ${invoice.invoice_number}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:48px;color:#111827;font-size:13px;max-width:760px;margin:0 auto}
      @media print{body{padding:24px}}
    </style>
  </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <div style="width:32px;height:32px;border-radius:8px;background:#10b981;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px">S</div>
          <span style="font-size:15px;font-weight:700">${escapeHtml(company.company_name)}</span>
        </div>
        <div style="color:#6b7280">${escapeHtml(company.address)}</div>
        ${companyTrn ? `<div style="color:#6b7280">TRN: ${escapeHtml(companyTrn)}</div>` : ''}
        <div style="color:#6b7280">${escapeHtml([company.phone, company.email].filter(Boolean).join(' · '))}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:900">TAX INVOICE</div>
        <div style="font-family:monospace;color:#6b7280">${invoice.invoice_number}</div>
        <div style="margin-top:4px;display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${invoice.status === 'paid' ? '#d1fae5' : '#fee2e2'};color:${invoice.status === 'paid' ? '#065f46' : '#991b1b'};text-transform:capitalize">${invoice.status}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div style="background:#f9fafb;padding:16px;border-radius:8px;border:1px solid #e5e7eb">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:8px">Bill To</div>
        <div style="font-weight:700">${invoice.client_name}</div>
        <div style="color:#6b7280;margin-top:2px">${invoice.client_address || ''}</div>
        ${invoice.trn ? `<div style="color:#6b7280">TRN: ${invoice.trn}</div>` : ''}
      </div>
      <div style="background:#f9fafb;padding:16px;border-radius:8px;border:1px solid #e5e7eb">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:8px">Invoice Details</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#6b7280">Issue Date</span><span style="font-weight:600">${invoice.created_at.split('T')[0]}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#6b7280">Due Date</span><span style="font-weight:600">${invoice.due_date}</span></div>
        ${invoice.paid_date ? `<div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Paid Date</span><span style="font-weight:600;color:#059669">${invoice.paid_date}</span></div>` : ''}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead><tr style="border-bottom:2px solid #111827">
        <th style="text-align:left;padding:8px 0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280">Description</th>
        <th style="text-align:right;padding:8px 0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280">Qty</th>
        <th style="text-align:right;padding:8px 0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280">Unit Price</th>
        <th style="text-align:right;padding:8px 0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280">Amount</th>
      </tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end">
      <div style="width:280px">
        <div style="display:flex;justify-content:space-between;padding:5px 0"><span style="color:#6b7280">Subtotal</span><span>AED ${grossSubtotal.toLocaleString()}</span></div>
        ${invoice.discount_amount && invoice.discount_amount > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:5px 0;color:#dc2626"><span>Discount ${invoice.discount_type === 'percentage' && invoice.discount_value ? `(${invoice.discount_value}%)` : ''}</span><span>- AED ${invoice.discount_amount.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-weight:600"><span style="color:#4b5563">Net Subtotal</span><span>AED ${(invoice.subtotal || 0).toLocaleString()}</span></div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;padding:5px 0"><span style="color:#6b7280">VAT (${invoice.vat_rate || 0}%)</span><span>${invoice.vat_rate === 0 ? 'Tax-Exempt (0%)' : `AED ${(invoice.vat_amount || 0).toLocaleString()}`}</span></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #111827;font-size:15px;font-weight:700"><span>Total</span><span>AED ${(invoice.total || 0).toLocaleString()}</span></div>
        ${(Number(invoice.amount_paid) || 0) > 0 && invoice.status !== 'paid' ? `
        <div style="display:flex;justify-content:space-between;padding:5px 0;color:#059669"><span>Paid so far</span><span>AED ${(Number(invoice.amount_paid) || 0).toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-weight:700;color:#b91c1c"><span>Balance Due</span><span>AED ${invoiceBalance(invoice).toLocaleString()}</span></div>` : ''}
      </div>
    </div>
    ${invoice.notes ? `<div style="margin-top:24px;padding:12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;color:#92400e;font-size:12px">${invoice.notes}</div>` : ''}
    <script>window.onload=()=>{window.print()}<\/script>
  </body></html>`)
  win.document.close()
}

export function Invoices() {
  const { invoices, addInvoice, updateInvoice, deleteInvoice } = useData()
  const company = useCompanyInfo()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Dynamic Date Filter state
  const [datePreset, setDatePreset] = useState<InvoiceDatePreset>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Calculate active date range
  const activeDateRange = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    if (datePreset === 'today') {
      return { start: todayStr, end: todayStr, label: 'Today' }
    }
    if (datePreset === 'this_week') {
      const d = new Date(now)
      const day = d.getDay() // 0 is Sun, 1 is Mon
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d.setDate(diff))
      const startStr = monday.toISOString().split('T')[0]
      return { start: startStr, end: todayStr, label: 'This Week' }
    }
    if (datePreset === 'this_month') {
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const startStr = `${year}-${month}-01`
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()
      const endStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
      return { start: startStr, end: endStr, label: 'This Month' }
    }
    if (datePreset === '7days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 7 Days' }
    }
    if (datePreset === '30days') {
      const d = new Date(now)
      d.setDate(d.getDate() - 29)
      return { start: d.toISOString().split('T')[0], end: todayStr, label: 'Last 30 Days' }
    }
    if (datePreset === 'custom') {
      const label = customStartDate && customEndDate ? `${customStartDate} to ${customEndDate}` : 'Custom Range'
      return { start: customStartDate, end: customEndDate, label }
    }
    return { start: '', end: '', label: 'All Time' }
  }, [datePreset, customStartDate, customEndDate])

  // Helper: check if invoice date is in selected range
  const isDateInRange = useMemo(() => {
    return (dateStr?: string) => {
      if (!activeDateRange.start && !activeDateRange.end) return true
      if (!dateStr) return false
      const d = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
      if (activeDateRange.start && d < activeDateRange.start) return false
      if (activeDateRange.end && d > activeDateRange.end) return false
      return true
    }
  }, [activeDateRange])

  // Auto-mark overdue: sent invoices past their due date
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    invoices
      .filter(i => i.status === 'sent' && i.due_date < today)
      .forEach(i => updateInvoice(i.id, { status: 'overdue' }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dateFilteredInvoices = useMemo(() => {
    return invoices.filter(i => isDateInRange(i.created_at))
  }, [invoices, isDateInRange])

  const paidOf = (list: Invoice[]) => list.reduce((s, i) => s + (i.status === 'paid' ? i.total : (Number(i.amount_paid) || 0)), 0)
  const totalPaid    = paidOf(dateFilteredInvoices)
  const totalPending = dateFilteredInvoices.filter(i => i.status === 'sent').reduce((s, i) => s + invoiceBalance(i), 0)
  const paidTrend = useMemo(() => {
    const { start, end } = activeDateRange as { start?: string; end?: string }
    if (!start || !end) return { delta: '', up: true }
    const s0 = new Date(start), e0 = new Date(end)
    const len = Math.round((e0.getTime() - s0.getTime()) / 86_400_000) + 1
    const prevEnd = new Date(s0.getTime() - 86_400_000).toISOString().split('T')[0]
    const prevStart = new Date(s0.getTime() - len * 86_400_000).toISOString().split('T')[0]
    const prev = paidOf(invoices.filter(i => { const d = (i.created_at || '').split('T')[0]; return d >= prevStart && d <= prevEnd }))
    if (prev <= 0) return { delta: '', up: true }
    const pct = Math.round(((totalPaid - prev) / prev) * 100)
    return { delta: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 }
  }, [activeDateRange, invoices, totalPaid]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalOverdue = dateFilteredInvoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const totalVat     = dateFilteredInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.vat_amount, 0)
  const paidCount    = dateFilteredInvoices.filter(i => i.status === 'paid').length
  const collectionRate = dateFilteredInvoices.length > 0 ? Math.round((paidCount / dateFilteredInvoices.length) * 100) : 0

  const filtered = useMemo(() => {
    return dateFilteredInvoices.filter(i => {
      const matchSearch = i.client_name.toLowerCase().includes(search.toLowerCase()) ||
        i.invoice_number.toLowerCase().includes(search.toLowerCase())
      const matchStatus = statusFilter === 'all' || i.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [dateFilteredInvoices, search, statusFilter])

  const overdueInvoices = dateFilteredInvoices.filter(i => i.status === 'overdue')

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Invoices"
        subtitle={`${dateFilteredInvoices.length} invoices ${activeDateRange.label !== 'All Time' ? `(${activeDateRange.label})` : ''} · AED ${totalPaid.toLocaleString()} collected · AED ${totalOverdue.toLocaleString()} overdue`}
        statusChip={overdueInvoices.length > 0 ? `${overdueInvoices.length} Overdue` : 'All Clear'}
        actions={
          <button
            type="button"
            onClick={() => navigate('/monthly-invoices')}
            className="h-11 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-[13px] backdrop-blur-sm transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer"
            title="Switch to Monthly Invoices & Statements"
          >
            <CalendarCheck size={14} />
            <span>Monthly Invoices</span>
          </button>
        }
        actionLabel="New Invoice"
        onAction={() => setShowModal(true)}
        searchPlaceholder="Search invoices…"
      />

      {/* ── Invoice Modules Navigation Tabs ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-white rounded-[22px] border border-[#E4E8EC] p-3 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-xl">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold bg-white text-slate-900 shadow-xs border border-slate-200/60 cursor-default"
          >
            <FileText size={15} className="text-emerald-600" />
            <span>Standard Invoices</span>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              {invoices.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/monthly-invoices')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors cursor-pointer"
          >
            <CalendarCheck size={15} className="text-slate-400" />
            <span>Monthly Invoices</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600 uppercase tracking-wide">
              Statements
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 pr-2">
          <span className="text-[12px] text-slate-500 hidden sm:inline">Need contract monthly statements?</span>
          <button
            type="button"
            onClick={() => navigate('/monthly-invoices')}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-1.5 rounded-xl border border-emerald-200/70 transition-colors cursor-pointer"
          >
            <span>Open Monthly Invoices</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Invoices', value: dateFilteredInvoices.length,                   sub: activeDateRange.label, icon: FileText,    iconBg: 'bg-slate-100',  iconColor: 'text-slate-600',   delta: `${dateFilteredInvoices.length}`, deltaUp: true  },
          { label: 'Paid',           value: `AED ${(totalPaid/1000).toFixed(1)}k`,         sub: `${paidCount} invoices · vs previous period`, icon: CheckCircle, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: paidTrend.delta, deltaUp: paidTrend.up  },
          { label: 'Pending',        value: `AED ${(totalPending/1000).toFixed(1)}k`,      sub: 'Awaiting payment', icon: Clock,       iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    delta: '', deltaUp: true },
          { label: 'Overdue',        value: `AED ${(totalOverdue/1000).toFixed(1)}k`,      sub: `${overdueInvoices.length} overdue`, icon: AlertCircle, iconBg: 'bg-red-50', iconColor: 'text-red-600', delta: overdueInvoices.length > 0 ? '!' : '', deltaUp: false },
          { label: 'VAT Collected',  value: `AED ${(totalVat/1000).toFixed(1)}k`,          sub: 'From paid invoices', icon: Percent,   iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  delta: '5%',   deltaUp: true  },
          { label: 'Collection',     value: `${collectionRate}%`,                          sub: 'Payment rate',   icon: TrendingUp,  iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   delta: '',  deltaUp: true  },
        ].map(card => {
          let action: (() => void) | null = null
          if (card.label === 'Total Invoices') action = () => setStatusFilter('all')
          else if (card.label === 'Paid') action = () => setStatusFilter('paid')
          else if (card.label === 'Pending') action = () => setStatusFilter('sent')
          else if (card.label === 'Overdue') action = () => setStatusFilter('overdue')
          return (
          <div key={card.label} onClick={action ?? undefined} className={`bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all ${action ? 'cursor-pointer' : ''}`}>
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon size={18} className={card.iconColor} />
              </div>
              {/* Only real, data-backed chips — no invented trends (AUD-32, AUD-35) */}
              {card.delta && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${card.deltaUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {card.delta}
                </span>
              )}
            </div>
            <p className="text-xl font-bold text-[#111827] tracking-tight">{card.value}</p>
            <p className="text-[12px] font-semibold text-[#111827] mt-1">{card.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
          </div>
          )
        })}
      </div>

      {/* ── Main: Table + Sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Filters + Table ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 space-y-3">
            {/* Top Row: Search & Status Filter */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by client or invoice number…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-8 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 focus:bg-white placeholder-slate-400 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-[13px] font-medium px-3.5 py-2 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="sent">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            {/* Bottom Row: Dynamic Date Filters */}
            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                  <Calendar size={12} className="text-emerald-600" /> Date:
                </span>
                {[
                  { id: 'all',        label: 'All Time' },
                  { id: 'today',      label: 'Today' },
                  { id: 'this_week',  label: 'This Week' },
                  { id: 'this_month', label: 'This Month' },
                  { id: '7days',      label: '7 Days' },
                  { id: '30days',     label: '30 Days' },
                  { id: 'custom',     label: 'Custom Range' },
                ].map(preset => {
                  const active = datePreset === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setDatePreset(preset.id as InvoiceDatePreset)}
                      className={`px-3 py-1 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                        active
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>

              {/* Custom Date Inputs & Reset button */}
              <div className="flex items-center gap-2 shrink-0">
                {datePreset === 'custom' && (
                  <div className="flex items-center gap-1.5 bg-[#f8fafc] border border-emerald-300 rounded-xl px-2.5 py-1 animate-in fade-in duration-150">
                    <span className="text-[11px] font-bold text-emerald-700">From:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={e => setCustomStartDate(e.target.value)}
                      className="text-[12px] px-1.5 py-0.5 bg-white border border-[#E4E8EC] rounded-lg focus:outline-none focus:border-emerald-500 font-medium"
                    />
                    <span className="text-[11px] font-bold text-emerald-700">To:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={e => setCustomEndDate(e.target.value)}
                      className="text-[12px] px-1.5 py-0.5 bg-white border border-[#E4E8EC] rounded-lg focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>
                )}

                {datePreset !== 'all' && (
                  <button
                    type="button"
                    onClick={() => {
                      setDatePreset('all')
                      setCustomStartDate('')
                      setCustomEndDate('')
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-bold text-slate-500 hover:text-emerald-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                    title="Reset date filter to All Time"
                  >
                    <RotateCcw size={11} />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E4E8EC] bg-slate-50">
                    {['Invoice #', 'Client', 'Date', 'Due Date', 'Amount', 'VAT', 'Total', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.07em] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-[13px]">
                        No invoices found for the selected filters ({activeDateRange.label})
                      </td>
                    </tr>
                  ) : filtered.map(inv => (
                    <tr
                      key={inv.id}
                      onClick={() => setSelected(inv)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-[12px] text-slate-500">{inv.invoice_number}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-[13px] font-semibold text-[#111827]">{inv.client_name}</span>
                      </td>
                      <td className="px-4 py-3.5 text-[12px] text-slate-500">{formatDate(inv.created_at)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[12px] ${inv.status === 'overdue' ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                          {formatDate(inv.due_date)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[12px] text-slate-600">
                        <div>
                          <span>AED {inv.subtotal.toLocaleString()}</span>
                          {inv.discount_amount && inv.discount_amount > 0 ? (
                            <span className="block text-[10px] font-medium text-red-600">
                              -AED {inv.discount_amount.toLocaleString()} ({inv.discount_type === 'percentage' && inv.discount_value ? `${inv.discount_value}%` : 'disc.'})
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[12px]">
                        {inv.vat_rate === 0 || inv.apply_vat === false ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600">
                            0% Exempt
                          </span>
                        ) : (
                          <span className="text-slate-500 font-medium">AED {inv.vat_amount.toLocaleString()}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-[13px] font-bold text-[#111827]">AED {inv.total.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3.5"><StatusPill status={isPartlyPaid(inv) ? 'partly paid' : inv.status} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => printInvoice(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Print / Download PDF">
                            <Download size={14} />
                          </button>
                          {inv.status !== 'paid' && inv.status !== 'sent' && (
                            <button
                              onClick={() => updateInvoice(inv.id, { status: 'sent' })}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="Mark as sent">
                              <Send size={14} />
                            </button>
                          )}
                          {inv.status !== 'paid' && (
                            <button
                              onClick={() => updateInvoice(inv.id, { status: 'paid', paid_date: new Date().toISOString().split('T')[0] })}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Mark as paid">
                              <DollarSign size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmDeleteId(inv.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Delete invoice">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-5">

          {/* Overdue Alert */}
          {overdueInvoices.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-[22px] p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={16} className="text-red-500" />
                <h3 className="text-[14px] font-bold text-red-800">Overdue Invoices</h3>
              </div>
              <div className="space-y-3">
                {overdueInvoices.map(inv => (
                  <div
                    key={inv.id}
                    onClick={() => setSelected(inv)}
                    className="bg-white rounded-xl p-3 border border-red-200 cursor-pointer hover:border-red-400 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-bold text-[#111827]">{inv.client_name}</p>
                      <span className="text-[12px] font-bold text-red-600">AED {inv.total.toLocaleString()}</span>
                    </div>
                    <p className="text-[11px] text-red-600 mt-0.5">Due: {formatDate(inv.due_date)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Health */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Payment Health</h3>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{activeDateRange.label}</span>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Paid',    value: totalPaid,    color: '#10b981', pct: (totalPaid + totalPending + totalOverdue) > 0 ? Math.round(totalPaid / (totalPaid + totalPending + totalOverdue) * 100) : 0 },
                { label: 'Pending', value: totalPending, color: '#3b82f6', pct: (totalPaid + totalPending + totalOverdue) > 0 ? Math.round(totalPending / (totalPaid + totalPending + totalOverdue) * 100) : 0 },
                { label: 'Overdue', value: totalOverdue, color: '#ef4444', pct: (totalPaid + totalPending + totalOverdue) > 0 ? Math.round(totalOverdue / (totalPaid + totalPending + totalOverdue) * 100) : 0 },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold text-slate-700">{item.label}</span>
                    <span className="text-[12px] font-bold text-[#111827]">AED {item.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${item.pct}%`, background: item.color }} />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{item.pct}% of total</p>
                </div>
              ))}
            </div>
          </div>

          {/* UAE VAT Summary */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">UAE VAT Summary</h3>
              <span className="bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-full">5%</span>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Taxable Revenue',  value: `AED ${dateFilteredInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.subtotal, 0).toLocaleString()}` },
                { label: 'VAT Collected',    value: `AED ${totalVat.toLocaleString()}` },
                { label: 'TRN',             value: company.trn || 'Not set — add it in Settings' },
                { label: 'Next Filing',      value: 'Q2 2026 — Jun 30' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-[#E4E8EC] last:border-0">
                  <span className="text-[12px] text-slate-500">{label}</span>
                  <span className="text-[12px] font-bold text-[#111827]">{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Invoice Detail Modal ── */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Invoice" size="lg">
        {selected && (
          <InvoiceView
            invoice={selected}
            onMarkPaid={() => {
              updateInvoice(selected.id, { status: 'paid', paid_date: new Date().toISOString().split('T')[0] })
              setSelected(null)
            }}
            onSend={() => {
              updateInvoice(selected.id, { status: 'sent' })
              setSelected(null)
            }}
            onPrint={() => printInvoice(selected)}
            onRecordPayment={(amount) => {
              const paid = (Number(selected.amount_paid) || 0) + amount
              const today = new Date().toISOString().split('T')[0]
              const patch: Partial<Invoice> = paid >= selected.total - 0.01
                ? { amount_paid: selected.total, status: 'paid', paid_date: today }
                : { amount_paid: Math.round(paid * 100) / 100 }
              updateInvoice(selected.id, patch)
              setSelected({ ...selected, ...patch })
              notify.success(`AED ${amount.toLocaleString()} recorded on ${selected.invoice_number}`)
            }}
            onDelete={() => setConfirmDeleteId(selected.id)}
          />
        )}
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="Delete Invoice" size="sm">
        <div className="space-y-4">
          <p className="text-[13px] text-slate-600">This will permanently delete the invoice from Supabase. This cannot be undone.</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold py-2 rounded-xl transition-colors"
              onClick={() => {
                if (confirmDeleteId) {
                  deleteInvoice(confirmDeleteId)
                  if (selected?.id === confirmDeleteId) setSelected(null)
                  setConfirmDeleteId(null)
                }
              }}
            >
              Yes, Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* ── New Invoice Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Invoice" size="lg">
        <NewInvoiceForm
          onClose={() => setShowModal(false)}
          onAdd={(draft) => { addInvoice(draft); setShowModal(false) }}
        />
      </Modal>
    </div>
  )
}

const DUMMY_CLIENT_NAMES = new Set([
  'sarah johnson', 'mohammed al hamdan', 'jennifer chen', 'khalid al rashid',
  'emma williams', 'fatima al zaabi', 'david thompson', 'aisha al nuaimi',
  'robert brown', 'layla hassan', 'michael scott', 'nora al kaabi'
])

export function isDummySeedClient(c: Partial<Client>): boolean {
  if (!c) return true
  if (c.id && c.id.startsWith('c1000001-')) return true
  const name = (c.full_name || '').toLowerCase().trim()
  if (DUMMY_CLIENT_NAMES.has(name)) return true
  return false
}

function formatClientAddress(c: Client | any): string {
  if (!c) return ''
  const cleanStr = (s?: string) => s ? s.replace(/\s*\([^)]*(monthly|cash|pending|online|above)[^)]*\)/gi, '').trim() : ''

  if (typeof c.address === 'string' && c.address.trim()) {
    return cleanStr(c.address)
  }

  const apt = cleanStr(c.apartment)
  const bldg = cleanStr(c.building_name)
  const area = cleanStr(c.area)
  const city = cleanStr(c.city)

  const parts: string[] = []
  if (apt) parts.push(apt)
  if (bldg && (!apt || !apt.toLowerCase().includes(bldg.toLowerCase()))) {
    parts.push(bldg)
  }
  if (area && (!bldg || !bldg.toLowerCase().includes(area.toLowerCase())) && (!apt || !apt.toLowerCase().includes(area.toLowerCase()))) {
    parts.push(area)
  }
  if (city && city.toLowerCase() !== 'dubai' && !parts.some(p => p.toLowerCase().includes(city.toLowerCase()))) {
    parts.push(city)
  }
  return parts.filter(Boolean).join(', ') || bldg || area || city || 'Dubai, UAE'
}

function NewInvoiceForm({ onClose, onAdd }: { onClose: () => void; onAdd: (i: Omit<Invoice, 'id' | 'created_at'>) => void }) {
  const { clients, dailyJobs, invoices } = useData()
  const [qty, setQty] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)

  // ── VAT Tax Status & Custom Tax Percentage State ──
  // Options: 'standard' (5% UAE VAT), 'exempt' (0% Tax-Exempt), 'custom' (user-defined %)
  const [taxMode, setTaxMode] = useState<'standard' | 'exempt' | 'custom'>('standard')
  const [customTaxRate, setCustomTaxRate] = useState<number | ''>(5)

  // ── Discount state ──
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('percentage')
  const [discountValue, setDiscountValue] = useState<number | ''>('')

  // ── Financial Calculations ──
  const grossSubtotal = qty * (Number(unitPrice) || 0)

  const discountAmount = useMemo(() => {
    if (!discountValue || Number(discountValue) <= 0 || grossSubtotal <= 0) return 0
    const val = Number(discountValue)
    if (discountType === 'percentage') {
      const pct = Math.min(100, Math.max(0, val))
      return Math.round((grossSubtotal * (pct / 100)) * 100) / 100
    } else {
      return Math.min(grossSubtotal, Math.max(0, val))
    }
  }, [grossSubtotal, discountType, discountValue])

  const netSubtotal = Math.max(0, grossSubtotal - discountAmount)

  // Computed tax rate based on active Tax Status
  const vatRate = useMemo(() => {
    if (taxMode === 'exempt') return 0
    if (taxMode === 'standard') return 5
    if (typeof customTaxRate === 'number' && !isNaN(customTaxRate)) {
      return Math.max(0, Math.min(100, customTaxRate))
    }
    return 0
  }, [taxMode, customTaxRate])

  const vatAmount = vatRate > 0 ? Math.round(netSubtotal * (vatRate / 100) * 100) / 100 : 0
  const total = Math.round((netSubtotal + vatAmount) * 100) / 100

  // ── Client Fields Connected to Real Database ──
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientId, setClientId] = useState('')
  const [trn, setTrn] = useState('')
  const defaultDueDate = useMemo(() => new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0], [])
  const [dueDate, setDueDate] = useState(defaultDueDate)

  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false)

  const nameBoxRef = useRef<HTMLDivElement>(null)
  const addressBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (nameBoxRef.current && !nameBoxRef.current.contains(e.target as Node)) {
        setShowNameSuggestions(false)
      }
      if (addressBoxRef.current && !addressBoxRef.current.contains(e.target as Node)) {
        setShowAddressSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Real Clients from Database & Daily Jobs (Dummy Seed Clients Filtered Out) ──
  const realClients = useMemo(() => {
    // 1. Registered database clients (filtering out seed dummy records)
    const dbClients = clients.filter(c => !isDummySeedClient(c) && Boolean(c.full_name?.trim()))

    // 2. Clients auto-discovered from Daily Job Sheet
    const djClients = extractAllClientsFromDailyJobs(dailyJobs, [])
      .filter(c => !isDummySeedClient(c) && Boolean(c.full_name?.trim()))

    // 3. Deduplicate by normalized name
    const seen = new Set<string>()
    const list: Client[] = []

    for (const c of [...dbClients, ...djClients]) {
      const key = (c.full_name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (key && !seen.has(key)) {
        seen.add(key)
        list.push(c)
      }
    }

    // Fallback if workspace has no real clients yet
    if (list.length === 0) {
      return clients.filter(c => Boolean(c.full_name?.trim()))
    }

    // Sort alphabetically by client name
    return list.sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [clients, dailyJobs])

  // Filter clients for Name input
  const filteredNameClients = useMemo(() => {
    const list = realClients.length > 0 ? realClients : clients.filter(c => Boolean(c.full_name?.trim()))
    const q = clientName.toLowerCase().trim()
    if (!q) return list.slice(0, 50)

    return list.filter(c => {
      const addr = formatClientAddress(c)
      return (
        c.full_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.building_name && c.building_name.toLowerCase().includes(q)) ||
        (c.area && c.area.toLowerCase().includes(q)) ||
        (addr && addr.toLowerCase().includes(q))
      )
    }).slice(0, 50)
  }, [realClients, clients, clientName])

  // Filter clients for Address input
  const filteredAddressClients = useMemo(() => {
    const list = realClients.length > 0 ? realClients : clients.filter(c => Boolean(c.full_name?.trim()))
    const q = clientAddress.toLowerCase().trim()
    const validList = list.filter(c => {
      const addr = formatClientAddress(c)
      return Boolean(addr || c.building_name || c.area)
    })

    if (!q) return validList.slice(0, 50)

    return validList.filter(c => {
      const addr = formatClientAddress(c)
      return (
        (addr && addr.toLowerCase().includes(q)) ||
        (c.building_name && c.building_name.toLowerCase().includes(q)) ||
        (c.area && c.area.toLowerCase().includes(q)) ||
        (c.full_name && c.full_name.toLowerCase().includes(q))
      )
    }).slice(0, 50)
  }, [realClients, clients, clientAddress])

  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault()
      const fd = new FormData(e.currentTarget)
      const desc = fd.get('description') as string
      const invoiceNum = nextInvoiceNumber(invoices)
      onAdd({
        invoice_number: invoiceNum,
        client_id: clientId || '',
        client_name: clientName.trim(),
        client_address: clientAddress.trim(),
        trn: trn.trim(),
        company_trn: getCompanyInfo().trn,
        due_date: dueDate,
        status: 'sent',
        subtotal: netSubtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        apply_vat: vatRate > 0,
        discount_type: discountAmount > 0 ? discountType : undefined,
        discount_value: discountAmount > 0 && typeof discountValue === 'number' ? discountValue : undefined,
        discount_amount: discountAmount > 0 ? discountAmount : undefined,
        line_items: [{ description: desc, quantity: qty, unit_price: unitPrice, amount: grossSubtotal }],
        notes: (fd.get('notes') as string) || '',
      })
    }}>
      <div className="grid grid-cols-2 gap-4">
        {/* Client Name with Database Connection & Auto-Suggest */}
        <div className="relative" ref={nameBoxRef}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">Client Name</label>
            {clientId ? (
              <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle size={10} /> Database Linked
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                <Sparkles size={10} className="text-emerald-500" /> Database Connected ({realClients.length})
              </span>
            )}
          </div>
          <div className="relative">
            <Input
              name="client_name"
              placeholder="Search or select real client…"
              value={clientName}
              icon={<User size={14} className="text-slate-400" />}
              onChange={e => {
                setClientName(e.target.value)
                setClientId('')
                setShowNameSuggestions(true)
              }}
              onFocus={() => setShowNameSuggestions(true)}
              onKeyDown={e => { if (e.key === 'Escape') setShowNameSuggestions(false) }}
              required
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowNameSuggestions(p => !p)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Browse clients database"
            >
              <ChevronDown size={14} className={`transition-transform duration-200 ${showNameSuggestions ? 'rotate-180 text-emerald-600' : ''}`} />
            </button>
          </div>

          {/* Real Clients Suggestions Dropdown */}
          {showNameSuggestions && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2 bg-gradient-to-r from-slate-50 via-emerald-50/30 to-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-bold">
                <span className="flex items-center gap-1.5 text-emerald-800">
                  <User size={13} className="text-emerald-600" />
                  <span>Real Clients Database ({filteredNameClients.length})</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Click client to auto-fill</span>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                {filteredNameClients.length > 0 ? (
                  filteredNameClients.map(c => {
                    const addr = formatClientAddress(c)
                    const isSelected = clientId === c.id || clientName.toLowerCase().trim() === c.full_name.toLowerCase().trim()
                    const isMonthly = (c.service_days && c.service_days.length > 0) || Boolean(c.preferred_cleaner) || c.id?.startsWith('dj-')

                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full text-left px-3.5 py-2.5 hover:bg-emerald-50/80 transition-colors flex items-start gap-3 group cursor-pointer ${
                          isSelected ? 'bg-emerald-50/60' : ''
                        }`}
                        onClick={() => {
                          setClientName(c.full_name)
                          if (addr) setClientAddress(addr)
                          setClientId(c.id)
                          if ((c as any).trn) setTrn((c as any).trn)
                          setShowNameSuggestions(false)
                        }}
                      >
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                          {c.full_name.charAt(0).toUpperCase() || 'C'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-[13px] font-bold text-slate-900 group-hover:text-emerald-700 truncate">
                              {c.full_name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {isMonthly && (
                                <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">
                                  Monthly
                                </span>
                              )}
                              {c.area && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {c.area}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-2">
                            <MapPin size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate">{addr || 'Dubai, UAE'}</span>
                            {c.phone && <span className="shrink-0 text-slate-400 font-mono">· {c.phone}</span>}
                          </div>
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="px-4 py-4 text-center text-[12px] text-slate-500">
                    <p className="font-semibold text-slate-700">No matching clients found in database</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">You can enter a custom client name and address directly</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Client Address with Real Database Auto-Suggest */}
        <div className="relative" ref={addressBoxRef}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">Client Address</label>
            <span className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
              <MapPin size={10} className="text-blue-500" /> Real Address Auto-fill
            </span>
          </div>
          <div className="relative">
            <Input
              name="client_address"
              placeholder="Search or enter exact location…"
              value={clientAddress}
              icon={<MapPin size={14} className="text-slate-400" />}
              onChange={e => {
                setClientAddress(e.target.value)
                setShowAddressSuggestions(true)
              }}
              onFocus={() => setShowAddressSuggestions(true)}
              onKeyDown={e => { if (e.key === 'Escape') setShowAddressSuggestions(false) }}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowAddressSuggestions(p => !p)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Browse client addresses"
            >
              <ChevronDown size={14} className={`transition-transform duration-200 ${showAddressSuggestions ? 'rotate-180 text-blue-600' : ''}`} />
            </button>
          </div>

          {/* Real Addresses Suggestions Dropdown */}
          {showAddressSuggestions && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2 bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-bold">
                <span className="flex items-center gap-1.5 text-blue-800">
                  <MapPin size={13} className="text-blue-600" />
                  <span>Matching Client Addresses ({filteredAddressClients.length})</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Click to auto-fill address</span>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                {filteredAddressClients.length > 0 ? (
                  filteredAddressClients.map(c => {
                    const addr = formatClientAddress(c)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50/80 transition-colors flex items-start gap-3 group cursor-pointer"
                        onClick={() => {
                          setClientAddress(addr || c.building_name || c.area || '')
                          if (!clientName.trim() || clientName === c.full_name) {
                            setClientName(c.full_name)
                          }
                          setClientId(c.id)
                          if ((c as any).trn) setTrn((c as any).trn)
                          setShowAddressSuggestions(false)
                        }}
                      >
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          <MapPin size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold text-slate-900 group-hover:text-blue-700 truncate">
                            {addr || c.building_name || c.area}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                            <span className="font-semibold text-slate-700">{c.full_name}</span>
                            {c.phone && <span className="text-slate-400 font-mono">· {c.phone}</span>}
                          </div>
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="px-4 py-4 text-center text-[12px] text-slate-500">
                    <p className="font-semibold text-slate-700">No matching addresses found in database</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">You can enter a custom address directly above</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          name="trn"
          label="Client TRN (optional)"
          placeholder="Tax Registration Number"
          value={trn}
          onChange={e => setTrn(e.target.value)}
        />
        <Input
          name="due_date"
          label="Due Date"
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          required
        />
      </div>

      <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-[#E4E8EC]">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.1em]">Line Item</p>
        <div className="grid grid-cols-12 gap-2 text-[11px] text-slate-500 font-medium px-1">
          <span className="col-span-6">Description</span>
          <span className="col-span-2 text-right">Qty</span>
          <span className="col-span-2 text-right">Unit Price</span>
          <span className="col-span-2 text-right">Amount</span>
        </div>
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-6"><Input name="description" placeholder="Service description" required /></div>
          <div className="col-span-2"><Input type="number" value={qty} min={1} onChange={e => setQty(Number(e.target.value))} /></div>
          <div className="col-span-2"><Input type="number" value={unitPrice} min={0} step="0.01" onChange={e => setUnitPrice(Number(e.target.value))} /></div>
          <div className="col-span-2"><Input type="number" value={grossSubtotal.toFixed(2)} readOnly /></div>
        </div>
      </div>

      {/* ── Tax Status & Discount Options ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* VAT / Tax Status with Custom Percentage Option */}
        <div className="bg-slate-50 rounded-xl p-3.5 border border-[#E4E8EC] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent size={14} className={vatRate > 0 ? "text-purple-600" : "text-slate-400"} />
              <label className="text-xs font-bold text-slate-700">VAT / Tax Status</label>
            </div>
            <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
              vatRate === 5 && taxMode === 'standard'
                ? 'bg-purple-100 text-purple-700'
                : vatRate === 0
                ? 'bg-slate-200 text-slate-700'
                : 'bg-emerald-100 text-emerald-800'
            }`}>
              {taxMode === 'standard'
                ? 'Standard 5% VAT'
                : taxMode === 'exempt'
                ? 'Tax-Exempt (0%)'
                : `Custom: ${vatRate}%`}
            </span>
          </div>

          {/* Tax Status Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-white rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setTaxMode('standard')
                setCustomTaxRate(5)
              }}
              className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-all text-center cursor-pointer ${
                taxMode === 'standard'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Standard (5%)
            </button>

            <button
              type="button"
              onClick={() => {
                setTaxMode('exempt')
                setCustomTaxRate(0)
              }}
              className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-all text-center cursor-pointer ${
                taxMode === 'exempt'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Exempt (0%)
            </button>

            <button
              type="button"
              onClick={() => {
                setTaxMode('custom')
                if (typeof customTaxRate !== 'number' || customTaxRate === 0 || customTaxRate === 5) {
                  setCustomTaxRate(10)
                }
              }}
              className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-all text-center cursor-pointer ${
                taxMode === 'custom'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Custom Rate %
            </button>
          </div>

          {/* Custom Tax Percentage Input Section */}
          {taxMode === 'custom' && (
            <div className="p-2.5 bg-purple-50/50 rounded-lg border border-purple-200/80 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-purple-900">Define Custom Tax Rate:</span>
                <span className="text-[10px] text-purple-700">Enter custom % for client</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="Enter tax %"
                    value={customTaxRate}
                    onChange={e => {
                      const v = e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value)))
                      setCustomTaxRate(v)
                    }}
                    className="w-full text-[12.5px] px-3 py-1.5 bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold text-purple-900 placeholder-purple-300"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-600 font-extrabold text-xs">%</span>
                </div>
                {/* Common Presets */}
                <div className="flex items-center gap-1">
                  {[2.5, 7, 10, 15].map(rate => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setCustomTaxRate(rate)}
                      className={`text-[10px] font-bold px-2 py-1.5 rounded-md border transition-all cursor-pointer ${
                        customTaxRate === rate
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-100'
                      }`}
                    >
                      {rate}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Discount Field */}
        <div className="bg-slate-50 rounded-xl p-3.5 border border-[#E4E8EC] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag size={14} className={discountAmount > 0 ? "text-emerald-600" : "text-slate-400"} />
              <label className="text-xs font-bold text-slate-700">Discount (Optional)</label>
            </div>
            {discountAmount > 0 && (
              <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                -AED {discountAmount.toFixed(2)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Flat AED vs Percentage % */}
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setDiscountType('percentage')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                  discountType === 'percentage'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                % Pct
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('flat')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                  discountType === 'flat'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                AED Flat
              </button>
            </div>

            <div className="flex-1 relative">
              <input
                type="number"
                min="0"
                step={discountType === 'percentage' ? '1' : '0.5'}
                max={discountType === 'percentage' ? '100' : undefined}
                placeholder={discountType === 'percentage' ? 'e.g. 10 for 10%' : 'e.g. 50 AED'}
                value={discountValue}
                onChange={e => {
                  const val = e.target.value === '' ? '' : Number(e.target.value)
                  setDiscountValue(val)
                }}
                className="w-full text-[12px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 font-medium placeholder-slate-400"
              />
              {discountValue !== '' && Number(discountValue) > 0 && (
                <button
                  type="button"
                  onClick={() => setDiscountValue('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 border border-[#E4E8EC]">
        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-slate-500">Gross Subtotal</span>
            <span className="text-[#111827]">AED {grossSubtotal.toFixed(2)}</span>
          </div>

          {discountAmount > 0 && (
            <div className="flex justify-between text-red-600 font-medium">
              <span className="flex items-center gap-1.5">
                <Tag size={12} /> Discount {discountType === 'percentage' ? `(${discountValue}%)` : '(Flat)'}
              </span>
              <span>- AED {discountAmount.toFixed(2)}</span>
            </div>
          )}

          {discountAmount > 0 && (
            <div className="flex justify-between font-semibold text-slate-700 pt-1 border-t border-slate-200/60">
              <span>Net Taxable Subtotal</span>
              <span>AED {netSubtotal.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between">
            <span className="text-slate-500 flex items-center gap-1.5">
              <span>VAT ({vatRate}%)</span>
              {taxMode === 'exempt' && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                  Tax-Exempt
                </span>
              )}
              {taxMode === 'custom' && vatRate > 0 && (
                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                  Custom Rate
                </span>
              )}
            </span>
            <span className={vatRate > 0 ? 'text-[#111827] font-semibold' : 'text-slate-500 font-medium'}>
              {vatRate > 0 ? `AED ${vatAmount.toFixed(2)}` : 'AED 0.00'}
            </span>
          </div>

          <div className="flex justify-between font-bold text-[#111827] text-[15px] pt-2 border-t border-[#E4E8EC]">
            <span>Total Due</span>
            <span className="text-emerald-700 font-black">AED {total.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <Textarea name="notes" label="Notes" placeholder="Payment terms, bank details, thank you message..." rows={2} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1 font-bold">Send Invoice</Button>
      </div>
    </form>
  )
}

function InvoiceView({ invoice, onMarkPaid, onSend, onPrint, onDelete, onRecordPayment }: {
  invoice: Invoice; onMarkPaid: () => void; onSend: () => void; onPrint: () => void; onDelete: () => void
  onRecordPayment: (amount: number) => void
}) {
  const company = useCompanyInfo()
  const [payAmount, setPayAmount] = useState('')
  const paidSoFar = Number(invoice.amount_paid) || 0
  const balance = invoiceBalance(invoice)
  const statusCfg: Record<string, { bg: string; text: string }> = {
    paid:    { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    sent:    { bg: 'bg-blue-50',    text: 'text-blue-700' },
    overdue: { bg: 'bg-red-50',     text: 'text-red-700' },
    draft:   { bg: 'bg-slate-100',  text: 'text-slate-600' },
  }
  const sc = statusCfg[invoice.status] ?? { bg: 'bg-slate-100', text: 'text-slate-600' }

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">S</div>
            <p className="text-[15px] font-bold text-[#111827]">{company.company_name}</p>
          </div>
          <p className="text-[12px] text-slate-500">{company.address}</p>
          {(invoice.company_trn || company.trn) && <p className="text-[12px] text-slate-500">TRN: {invoice.company_trn || company.trn}</p>}
          <p className="text-[12px] text-slate-500">{[company.phone, company.email].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-black text-[#111827]">TAX INVOICE</p>
          <p className="text-[12px] font-mono text-slate-500">{invoice.invoice_number}</p>
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full capitalize ${sc.bg} ${sc.text}`}>
            {invoice.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-xl p-4 border border-[#E4E8EC]">
          <p className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-2">Bill To</p>
          <p className="text-[13px] font-bold text-[#111827]">{invoice.client_name}</p>
          <p className="text-[12px] text-slate-500 mt-0.5">{invoice.client_address}</p>
          {invoice.trn && <p className="text-[12px] text-slate-500 mt-0.5">TRN: {invoice.trn}</p>}
        </div>
        <div className="bg-slate-50 rounded-xl p-4 border border-[#E4E8EC]">
          <p className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-2">Invoice Details</p>
          <div className="space-y-1.5 text-[12px]">
            <div className="flex justify-between"><span className="text-slate-500">Issue Date</span><span className="font-semibold text-[#111827]">{formatDate(invoice.created_at)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Due Date</span><span className={`font-semibold ${invoice.status === 'overdue' ? 'text-red-600' : 'text-[#111827]'}`}>{formatDate(invoice.due_date)}</span></div>
            {invoice.paid_date && <div className="flex justify-between"><span className="text-slate-500">Paid Date</span><span className="font-semibold text-emerald-600">{formatDate(invoice.paid_date)}</span></div>}
          </div>
        </div>
      </div>

      <div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-2 border-[#111827]">
              <th className="text-left py-2 text-[10.5px] font-bold text-slate-500 uppercase tracking-[0.07em]">Description</th>
              <th className="text-right py-2 text-[10.5px] font-bold text-slate-500 uppercase tracking-[0.07em]">Qty</th>
              <th className="text-right py-2 text-[10.5px] font-bold text-slate-500 uppercase tracking-[0.07em]">Unit Price</th>
              <th className="text-right py-2 text-[10.5px] font-bold text-slate-500 uppercase tracking-[0.07em]">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E8EC]">
            {invoice.line_items.map((item, i) => (
              <tr key={i}>
                <td className="py-2.5 text-slate-700">{item.description}</td>
                <td className="py-2.5 text-right text-slate-500">{item.quantity}</td>
                <td className="py-2.5 text-right text-slate-500">AED {item.unit_price.toLocaleString()}</td>
                <td className="py-2.5 text-right font-semibold text-[#111827]">AED {item.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-72 space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span className="text-[#111827]">AED {((invoice.subtotal || 0) + (invoice.discount_amount || 0)).toLocaleString()}</span>
          </div>
          {invoice.discount_amount && invoice.discount_amount > 0 ? (
            <div className="flex justify-between text-red-600 font-medium">
              <span>Discount {invoice.discount_type === 'percentage' && invoice.discount_value ? `(${invoice.discount_value}%)` : ''}</span>
              <span>- AED {invoice.discount_amount.toLocaleString()}</span>
            </div>
          ) : null}
          {invoice.discount_amount && invoice.discount_amount > 0 ? (
            <div className="flex justify-between font-semibold text-slate-700">
              <span>Net Subtotal</span>
              <span>AED {(invoice.subtotal || 0).toLocaleString()}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-slate-500">VAT ({invoice.vat_rate || 0}%)</span>
            <span className="text-[#111827]">
              {invoice.vat_rate === 0 ? 'Tax-Exempt (0%)' : `AED ${(invoice.vat_amount || 0).toLocaleString()}`}
            </span>
          </div>
          <div className="flex justify-between font-bold text-[15px] text-[#111827] pt-2 border-t-2 border-[#111827]">
            <span>Total</span><span className="text-emerald-700">AED {(invoice.total || 0).toLocaleString()}</span>
          </div>
          {paidSoFar > 0 && invoice.status !== 'paid' && (
            <>
              <div className="flex justify-between text-emerald-700"><span>Paid so far</span><span>AED {paidSoFar.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold text-red-700"><span>Balance due</span><span>AED {balance.toLocaleString()}</span></div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={onPrint} title="Opens the print dialog — choose 'Save as PDF' to download">
          <Download size={14} className="mr-1.5" /> Print / Save PDF
        </Button>
        {invoice.status !== 'paid' && invoice.status !== 'draft' && (
          <form
            className="flex items-center gap-1.5"
            onSubmit={e => {
              e.preventDefault()
              const amt = Number(payAmount)
              if (!(amt > 0)) { notify.error('Enter the amount received.'); return }
              onRecordPayment(amt)
              setPayAmount('')
            }}
          >
            <input
              type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
              placeholder={`Part payment (max ${balance})`}
              className="w-[170px] px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500"
            />
            <Button type="submit" variant="outline" size="sm">Record payment</Button>
          </form>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-[12px] font-semibold hover:bg-red-50 transition-colors"
        >
          <Trash2 size={13} /> Delete
        </button>
        {invoice.status !== 'paid' && (
          <>
            {invoice.status !== 'sent' && (
              <Button variant="secondary" className="flex-1" size="sm" onClick={onSend}>
                <Send size={14} className="mr-1.5" /> Send
              </Button>
            )}
            <Button className="flex-1" size="sm" onClick={onMarkPaid}>
              Mark Paid
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
