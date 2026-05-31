import { useState } from 'react'
import { Search, Download, Send, AlertCircle, TrendingUp, CheckCircle, Clock, FileText, Percent, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { formatDate } from '@/lib/utils'
import { useData } from '@/store/DataContext'
import type { Invoice } from '@/types'

const COMPANY = {
  name: 'Safaeewala Cleaning & Maintenance LLC',
  trn: '100234567890003',
  address: 'Dubai, United Arab Emirates',
  phone: '+971 55 628 2374',
  email: 'info@safaeewala.com',
}

/* ─── Status pill ─── */
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string }> = {
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
          <span style="font-size:15px;font-weight:700">Safaeewala Cleaning &amp; Maintenance LLC</span>
        </div>
        <div style="color:#6b7280">Dubai, United Arab Emirates</div>
        <div style="color:#6b7280">TRN: 100234567890003</div>
        <div style="color:#6b7280">+971 55 628 2374 · info@safaeewala.com</div>
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
      <div style="width:260px">
        <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:#6b7280">Subtotal</span><span>AED ${invoice.subtotal.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:#6b7280">VAT (${invoice.vat_rate}%)</span><span>AED ${invoice.vat_amount.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #111827;font-size:15px;font-weight:700"><span>Total Due</span><span>AED ${invoice.total.toLocaleString()}</span></div>
      </div>
    </div>
    ${invoice.notes ? `<div style="margin-top:24px;padding:12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;color:#92400e;font-size:12px">${invoice.notes}</div>` : ''}
    <script>window.onload=()=>{window.print()}<\/script>
  </body></html>`)
  win.document.close()
}

export function Invoices() {
  const { invoices, addInvoice, updateInvoice, deleteInvoice } = useData()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const totalPaid    = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const totalPending = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total, 0)
  const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const totalVat     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.vat_amount, 0)
  const paidCount    = invoices.filter(i => i.status === 'paid').length
  const collectionRate = invoices.length > 0 ? Math.round((paidCount / invoices.length) * 100) : 0

  const filtered = invoices.filter(i => {
    const matchSearch = i.client_name.toLowerCase().includes(search.toLowerCase()) ||
      i.invoice_number.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || i.status === statusFilter
    return matchSearch && matchStatus
  })

  const overdueInvoices = invoices.filter(i => i.status === 'overdue')

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Invoices"
        subtitle={`${invoices.length} invoices · AED ${totalPaid.toLocaleString()} collected · AED ${totalOverdue.toLocaleString()} overdue`}
        statusChip={overdueInvoices.length > 0 ? `${overdueInvoices.length} Overdue` : 'All Clear'}
        actionLabel="New Invoice"
        onAction={() => setShowModal(true)}
        searchPlaceholder="Search invoices…"
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Invoices', value: invoices.length,                           sub: 'All time',        icon: FileText,    iconBg: 'bg-slate-100',  iconColor: 'text-slate-600',   delta: '+5',   deltaUp: true  },
          { label: 'Paid',           value: `AED ${(totalPaid/1000).toFixed(1)}k`,         sub: `${paidCount} invoices`, icon: CheckCircle, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: '+12%', deltaUp: true  },
          { label: 'Pending',        value: `AED ${(totalPending/1000).toFixed(1)}k`,      sub: 'Awaiting payment', icon: Clock,       iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    delta: 'Active', deltaUp: true },
          { label: 'Overdue',        value: `AED ${(totalOverdue/1000).toFixed(1)}k`,      sub: `${overdueInvoices.length} overdue`, icon: AlertCircle, iconBg: 'bg-red-50', iconColor: 'text-red-600', delta: '!', deltaUp: false },
          { label: 'VAT Collected',  value: `AED ${(totalVat/1000).toFixed(1)}k`,          sub: 'From paid invoices', icon: Percent,   iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  delta: '5%',   deltaUp: true  },
          { label: 'Collection',     value: `${collectionRate}%`,                          sub: 'Payment rate',   icon: TrendingUp,  iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   delta: '+3%',  deltaUp: true  },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon size={18} className={card.iconColor} />
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${card.deltaUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {card.delta}
              </span>
            </div>
            <p className="text-xl font-bold text-[#111827] tracking-tight">{card.value}</p>
            <p className="text-[12px] font-semibold text-[#111827] mt-1">{card.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main: Table + Sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Filters + Table ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by client or invoice number…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 focus:bg-white placeholder-slate-400 transition-colors"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="sent">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="draft">Draft</option>
              </select>
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
                  {filtered.map(inv => (
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
                      <td className="px-4 py-3.5 text-[12px] text-slate-600">AED {inv.subtotal.toLocaleString()}</td>
                      <td className="px-4 py-3.5 text-[12px] text-slate-400">AED {inv.vat_amount.toLocaleString()}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-[13px] font-bold text-[#111827]">AED {inv.total.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3.5"><StatusPill status={inv.status} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => printInvoice(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Print / Download PDF">
                            <Download size={14} />
                          </button>
                          {inv.status !== 'paid' && (
                            <button
                              onClick={() => updateInvoice(inv.id, { status: 'sent' })}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Mark as sent">
                              <Send size={14} />
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
              <span className="text-[11px] text-slate-400">This month</span>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Paid',    value: totalPaid,    color: '#10b981', pct: Math.round(totalPaid / (totalPaid + totalPending + totalOverdue) * 100) },
                { label: 'Pending', value: totalPending, color: '#3b82f6', pct: Math.round(totalPending / (totalPaid + totalPending + totalOverdue) * 100) },
                { label: 'Overdue', value: totalOverdue, color: '#ef4444', pct: Math.round(totalOverdue / (totalPaid + totalPending + totalOverdue) * 100) },
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
                { label: 'Taxable Revenue',  value: `AED ${invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.subtotal, 0).toLocaleString()}` },
                { label: 'VAT Collected',    value: `AED ${totalVat.toLocaleString()}` },
                { label: 'TRN',             value: COMPANY.trn },
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

function NewInvoiceForm({ onClose, onAdd }: { onClose: () => void; onAdd: (i: Omit<Invoice, 'id' | 'created_at'>) => void }) {
  const [qty, setQty] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const subtotal = qty * unitPrice
  const vatAmount = Math.round(subtotal * 0.05 * 100) / 100
  const total = subtotal + vatAmount

  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault()
      const fd = new FormData(e.currentTarget)
      const desc = fd.get('description') as string
      const invoiceNum = `INV-${Date.now().toString().slice(-6)}`
      onAdd({
        invoice_number: invoiceNum,
        client_id: '',
        client_name: fd.get('client_name') as string,
        client_address: fd.get('client_address') as string,
        trn: fd.get('trn') as string,
        company_trn: '100234567890003',
        due_date: fd.get('due_date') as string,
        status: 'sent',
        subtotal,
        vat_rate: 5,
        vat_amount: vatAmount,
        total,
        line_items: [{ description: desc, quantity: qty, unit_price: unitPrice, amount: subtotal }],
        notes: fd.get('notes') as string,
      })
    }}>
      <div className="grid grid-cols-2 gap-4">
        <Input name="client_name" label="Client Name" placeholder="Full name" required />
        <Input name="client_address" label="Client Address" placeholder="Full address" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input name="trn" label="Client TRN (optional)" placeholder="Tax Registration Number" />
        <Input name="due_date" label="Due Date" type="date" required />
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
          <div className="col-span-2"><Input type="number" value={subtotal.toFixed(2)} readOnly /></div>
        </div>
      </div>
      <div className="bg-slate-50 rounded-xl p-4 border border-[#E4E8EC]">
        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="text-[#111827]">AED {subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">VAT (5%)</span><span className="text-[#111827]">AED {vatAmount.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-[#111827] pt-2 border-t border-[#E4E8EC]">
            <span>Total</span><span>AED {total.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <Textarea name="notes" label="Notes" placeholder="Payment terms, bank details, thank you message..." rows={2} />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Send Invoice</Button>
      </div>
    </form>
  )
}

function InvoiceView({ invoice, onMarkPaid, onSend, onPrint, onDelete }: {
  invoice: Invoice; onMarkPaid: () => void; onSend: () => void; onPrint: () => void; onDelete: () => void
}) {
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
            <p className="text-[15px] font-bold text-[#111827]">{COMPANY.name}</p>
          </div>
          <p className="text-[12px] text-slate-500">{COMPANY.address}</p>
          <p className="text-[12px] text-slate-500">TRN: {COMPANY.trn}</p>
          <p className="text-[12px] text-slate-500">{COMPANY.phone} · {COMPANY.email}</p>
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
        <div className="w-64 space-y-2 text-[13px]">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="text-[#111827]">AED {invoice.subtotal.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">VAT ({invoice.vat_rate}%)</span><span className="text-[#111827]">AED {invoice.vat_amount.toLocaleString()}</span></div>
          <div className="flex justify-between font-bold text-[15px] text-[#111827] pt-2 border-t-2 border-[#111827]">
            <span>Total Due</span><span>AED {invoice.total.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={onPrint}>
          <Download size={14} className="mr-1.5" /> Print / PDF
        </Button>
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
