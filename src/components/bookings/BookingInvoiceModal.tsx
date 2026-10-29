import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Download, Send, CheckCircle2, DollarSign,
  Percent, Sparkles, Clock, User, MapPin, ExternalLink,
  Tag, AlertCircle, Calendar, Receipt, Check
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import type { Booking, Invoice } from '@/types'
import { formatDate } from '@/lib/utils'
import { nextInvoiceNumber } from '@/lib/invoiceNumber'
import { printInvoice } from '@/lib/invoicePrint'
import { notify } from '@/lib/notify'
import { todayDubai } from '@/lib/dubaiTime'
import { useCompanyInfo } from '@/lib/companyInfo'

export interface BookingInvoiceModalProps {
  booking: Booking | null
  open: boolean
  onClose: () => void
}

export function BookingInvoiceModal({ booking, open, onClose }: BookingInvoiceModalProps) {
  const navigate = useNavigate()
  const company = useCompanyInfo()
  const { invoices, addInvoice, updateInvoice, clients, updateBooking, updateDailyJob } = useData()

  // Find existing invoice linked to this booking
  const existingInvoice = useMemo(() => {
    if (!booking) return null
    return (invoices || []).find(inv =>
      inv.booking_id === booking.id ||
      (inv.client_id && booking.client_id && inv.client_id === booking.client_id && inv.created_at?.startsWith(booking.scheduled_date)) ||
      (inv.client_name && booking.client_name &&
        inv.client_name.toLowerCase().trim() === booking.client_name.toLowerCase().trim() &&
        inv.created_at?.startsWith(booking.scheduled_date))
    ) || null
  }, [booking, invoices])

  // Matched client for quick profile link
  const matchedClient = useMemo(() => {
    if (!booking) return null
    return (clients || []).find(c =>
      (booking.client_id && c.id === booking.client_id) ||
      (c.full_name && booking.client_name && c.full_name.toLowerCase().trim() === booking.client_name.toLowerCase().trim())
    ) || null
  }, [booking, clients])

  const clientProfileId = matchedClient?.id || booking?.client_id || (booking ? encodeURIComponent(booking.client_name) : '')

  // ── Draft Invoice Generation Form States ──
  const [taxMode, setTaxMode] = useState<'standard' | 'exempt'>('standard')
  const [isGenerating, setIsGenerating] = useState(false)
  const [dueDate, setDueDate] = useState(() => {
    if (!booking?.scheduled_date) return todayDubai()
    return booking.scheduled_date
  })
  const [notes, setNotes] = useState('')

  if (!booking) return null

  // Financial calculations for drafting
  const bookingAmt = Number(booking.total_amount) || 0
  const vatRate = taxMode === 'standard' ? 5 : 0
  const vatAmount = vatRate > 0 ? Math.round(bookingAmt * (vatRate / 100) * 100) / 100 : 0
  const totalAmount = Math.round((bookingAmt + vatAmount) * 100) / 100

  // Quick generation handler
  const handleCreateInvoice = async () => {
    setIsGenerating(true)
    try {
      const invNum = nextInvoiceNumber(invoices)
      const newInvDraft: Omit<Invoice, 'id' | 'created_at'> = {
        invoice_number: invNum,
        client_id: matchedClient?.id || booking.client_id || undefined,
        client_name: booking.client_name,
        client_address: booking.service_address || 'Dubai, UAE',
        booking_id: booking.id,
        subtotal: bookingAmt,
        vat_rate: vatRate,
        apply_vat: vatRate > 0,
        vat_amount: vatAmount,
        total: totalAmount,
        status: booking.status === 'completed' || (booking.received_amount && booking.received_amount >= booking.total_amount) ? 'paid' : 'sent',
        paid_date: (booking.status === 'completed' || (booking.received_amount && booking.received_amount >= booking.total_amount)) ? todayDubai() : undefined,
        amount_paid: booking.received_amount || (booking.status === 'completed' ? totalAmount : 0),
        due_date: dueDate || booking.scheduled_date,
        line_items: [
          {
            description: `${booking.service_type} (${booking.duration_hours || 3} Hours on ${booking.scheduled_date})`,
            quantity: 1,
            unit_price: bookingAmt,
            amount: bookingAmt,
          }
        ],
        notes: notes.trim() || `Tax Invoice for booking #${booking.id.slice(0, 8)}`,
      }

      await addInvoice(newInvDraft)
      notify.success(`Tax Invoice ${invNum} generated and linked to booking!`)
    } catch (err: any) {
      notify.error(`Failed to create invoice: ${err.message || 'Unknown error'}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // Mark invoice as paid
  const handleMarkPaid = (inv: Invoice) => {
    const today = todayDubai()
    updateInvoice(inv.id, {
      status: 'paid',
      paid_date: today,
      amount_paid: inv.total,
    })

    // Sync to booking & daily job
    if (booking.id.startsWith('dj-')) {
      const jobId = booking.id.replace('dj-', '')
      updateDailyJob(jobId, { received: inv.total })
    } else {
      updateBooking(booking.id, {
        received_amount: inv.total,
        status: 'completed',
      })
    }
    notify.success(`Invoice ${inv.invoice_number} marked as Paid!`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      className="max-w-3xl"
      title={
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="p-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
            <Receipt size={16} />
          </div>
          <span className="font-extrabold text-[16px] text-slate-900">
            {existingInvoice ? `Tax Invoice ${existingInvoice.invoice_number}` : 'Generate Booking Invoice'}
          </span>
          <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
            Booking #{booking.id.slice(0, 8)}
          </span>
          {existingInvoice && (
            <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full capitalize ${
              existingInvoice.status === 'paid'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : existingInvoice.status === 'sent'
                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                : existingInvoice.status === 'partly paid'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-slate-100 text-slate-700'
            }`}>
              {existingInvoice.status}
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── Client & Booking Snapshot Banner ── */}
        <div className="bg-gradient-to-r from-[#021f24] via-[#062c32] to-[#02181b] text-white rounded-2xl p-4 shadow-md border border-teal-800/40 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/clients/${clientProfileId}`}
                onClick={onClose}
                className="text-[15px] font-black text-white hover:text-teal-300 transition-colors flex items-center gap-1.5 group"
                title="Open Client Profile"
              >
                <span className="group-hover:underline">{booking.client_name}</span>
                <ExternalLink size={13} className="text-teal-400 group-hover:text-teal-200" />
              </Link>
              <span className="text-[11px] font-mono text-teal-300 bg-teal-900/80 px-2 py-0.5 rounded border border-teal-700/60">
                #{booking.id.slice(0, 8)}
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-[12px] text-slate-300 mt-1 flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar size={12} className="text-emerald-400" />
                <span>{formatDate(booking.scheduled_date)}</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-teal-400" />
                <span>{booking.scheduled_time || '09:00'} ({booking.duration_hours || 3}h)</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <MapPin size={12} className="text-sky-400" />
                <span className="truncate max-w-[220px]">{booking.service_address || 'Dubai'}</span>
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Booking Charges</span>
            <span className="text-[18px] font-black text-emerald-400">
              AED {booking.total_amount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── CASE 1: EXISTING INVOICE VIEW ── */}
        {existingInvoice ? (
          <div className="space-y-4">
            {/* Invoice Meta Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200 space-y-1">
                <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Bill To</p>
                <p className="text-[13.5px] font-black text-slate-900">{existingInvoice.client_name}</p>
                <p className="text-[11.5px] text-slate-600">{existingInvoice.client_address || 'Dubai, UAE'}</p>
                {existingInvoice.trn && (
                  <p className="text-[11px] font-mono text-slate-500">TRN: {existingInvoice.trn}</p>
                )}
              </div>

              <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200 space-y-1 text-[12px]">
                <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Invoice Details</p>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Invoice Number:</span>
                  <span className="font-mono font-bold text-slate-900">{existingInvoice.invoice_number}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Issue Date:</span>
                  <span className="font-semibold text-slate-800">{formatDate(existingInvoice.created_at)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Due Date:</span>
                  <span className="font-semibold text-slate-800">{formatDate(existingInvoice.due_date)}</span>
                </div>
                {existingInvoice.paid_date && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-emerald-700 font-bold">Paid Date:</span>
                    <span className="font-bold text-emerald-700">{formatDate(existingInvoice.paid_date)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-bold uppercase tracking-wider text-[10.5px]">Description</th>
                    <th className="text-center py-2 px-2 font-bold uppercase tracking-wider text-[10.5px]">Qty</th>
                    <th className="text-right py-2 px-3 font-bold uppercase tracking-wider text-[10.5px]">Unit Price</th>
                    <th className="text-right py-2 px-3 font-bold uppercase tracking-wider text-[10.5px]">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {existingInvoice.line_items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-medium text-slate-800">{item.description}</td>
                      <td className="py-2.5 px-2 text-center text-slate-600">{item.quantity}</td>
                      <td className="py-2.5 px-3 text-right text-slate-600">AED {item.unit_price.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">AED {item.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="bg-purple-50/50 rounded-2xl p-3.5 border border-purple-200/80 flex items-center justify-between flex-wrap gap-3">
              <div className="space-y-1 text-[11.5px] text-slate-600">
                <p>Subtotal: <strong className="text-slate-800 font-mono">AED {(existingInvoice.subtotal || 0).toLocaleString()}</strong></p>
                <p>VAT ({existingInvoice.vat_rate || 0}%): <strong className="text-slate-800 font-mono">AED {(existingInvoice.vat_amount || 0).toLocaleString()}</strong></p>
                {(existingInvoice.amount_paid || 0) > 0 && (
                  <p className="text-emerald-700 font-bold">
                    Paid so far: AED {Number(existingInvoice.amount_paid).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="text-right">
                <span className="text-[10.5px] font-bold text-purple-900 uppercase tracking-wider block">Total Amount Due</span>
                <span className="text-[20px] font-black text-purple-950 font-mono">
                  AED {existingInvoice.total.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printInvoice(existingInvoice)}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-[12px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Print or Download Official PDF"
                >
                  <Download size={13} className="text-slate-500" />
                  <span>Print / PDF</span>
                </button>

                {existingInvoice.status !== 'sent' && existingInvoice.status !== 'paid' && (
                  <button
                    type="button"
                    onClick={() => {
                      updateInvoice(existingInvoice.id, { status: 'sent' })
                      notify.success(`Invoice marked as Sent!`)
                    }}
                    className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[12px] flex items-center gap-1.5 transition-colors cursor-pointer border border-blue-200"
                  >
                    <Send size={13} />
                    <span>Mark as Sent</span>
                  </button>
                )}

                {existingInvoice.status !== 'paid' && (
                  <button
                    type="button"
                    onClick={() => handleMarkPaid(existingInvoice)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 size={13} />
                    <span>Mark as Paid</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose()
                  navigate('/invoices')
                }}
                className="px-3 py-2 rounded-xl text-teal-800 hover:text-teal-950 hover:bg-teal-50 font-bold text-[12px] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>All Invoices Screen</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        ) : (
          /* ── CASE 2: GENERATE NEW TAX INVOICE DRAFT ── */
          <div className="space-y-4">
            <div className="bg-purple-50/60 rounded-2xl p-3.5 border border-purple-200/80 flex items-center justify-between">
              <div>
                <p className="text-[13px] font-black text-purple-950 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-purple-600" />
                  <span>Ready to Generate Tax Invoice</span>
                </p>
                <p className="text-[11.5px] text-purple-800/80 mt-0.5">
                  This booking has not been invoiced yet. Review details and generate with 1 click.
                </p>
              </div>
              <span className="text-[11px] font-mono font-bold bg-white text-purple-900 px-2.5 py-1 rounded-lg border border-purple-200 shadow-2xs">
                Suggested #{nextInvoiceNumber(invoices)}
              </span>
            </div>

            {/* Pre-filled Service Item Preview */}
            <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200 space-y-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Line Item Summary</p>
              <div className="flex items-center justify-between text-[12.5px] font-medium text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200/80">
                <div>
                  <p className="font-bold text-slate-900">{booking.service_type}</p>
                  <p className="text-[11px] text-slate-500">
                    {booking.duration_hours || 3} Hours on {formatDate(booking.scheduled_date)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Qty: 1</span>
                  <span className="font-mono font-bold text-slate-900">AED {bookingAmt.toLocaleString()}</span>
                </div>
              </div>

              {/* Tax Selection Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    VAT / Tax Status
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setTaxMode('standard')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all text-center cursor-pointer ${
                        taxMode === 'standard'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      5% Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaxMode('exempt')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all text-center cursor-pointer ${
                        taxMode === 'exempt'
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      0% Exempt
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Invoice Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full text-[12px] px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 font-medium"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Invoice Notes / Payment Instructions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Payment due within 7 days via Bank Transfer or Cash"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full text-[12px] px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 font-medium placeholder-slate-400"
                />
              </div>
            </div>

            {/* Total Price Breakdown */}
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 space-y-1.5 text-[12.5px]">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Net)</span>
                <span className="font-mono font-bold text-slate-800">AED {bookingAmt.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>UAE VAT ({vatRate}%)</span>
                <span className="font-mono font-bold text-slate-800">AED {vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-[14px] pt-1.5 border-t border-slate-100">
                <span>Total Invoice Amount</span>
                <span className="font-mono font-extrabold text-purple-700">AED {totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Create Action Button */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-[12px] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleCreateInvoice}
                className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-extrabold text-[12.5px] shadow-sm flex items-center gap-2 transition-all cursor-pointer"
              >
                <Sparkles size={14} />
                <span>{isGenerating ? 'Generating...' : 'Generate & Save Invoice'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

