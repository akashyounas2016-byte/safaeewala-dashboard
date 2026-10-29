import type { Invoice } from '@/types'
import { getCompanyInfo } from '@/lib/companyInfo'

const escapeHtml = (v: string) => v.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string))

export function printInvoice(invoice: Invoice) {
  const win = window.open('', '_blank', 'width=820,height=700')
  if (!win) return
  const lines = invoice.line_items.map(item => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#374151">${escapeHtml(item.description)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">${item.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">AED ${item.unit_price.toLocaleString()}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#111827">AED ${item.amount.toLocaleString()}</td>
    </tr>`).join('')

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
        <div style="font-family:monospace;color:#6b7280">${escapeHtml(invoice.invoice_number)}</div>
        <div style="margin-top:4px;display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${invoice.status === 'paid' ? '#d1fae5' : '#fee2e2'};color:${invoice.status === 'paid' ? '#065f46' : '#991b1b'};text-transform:capitalize">${invoice.status}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div style="background:#f9fafb;padding:16px;border-radius:8px;border:1px solid #e5e7eb">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:8px">Bill To</div>
        <div style="font-weight:700">${escapeHtml(invoice.client_name)}</div>
        <div style="color:#6b7280;margin-top:2px">${escapeHtml(invoice.client_address || '')}</div>
        ${invoice.trn ? `<div style="color:#6b7280">TRN: ${escapeHtml(invoice.trn)}</div>` : ''}
      </div>
      <div style="background:#f9fafb;padding:16px;border-radius:8px;border:1px solid #e5e7eb">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:8px">Invoice Details</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#6b7280">Issue Date</span><span style="font-weight:600">${invoice.created_at ? invoice.created_at.split('T')[0] : ''}</span></div>
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
        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280"><span>Subtotal</span><span>AED ${((invoice.subtotal || 0) + (invoice.discount_amount || 0)).toLocaleString()}</span></div>
        ${invoice.discount_amount && invoice.discount_amount > 0 ? `
          <div style="display:flex;justify-content:space-between;padding:4px 0;color:#dc2626"><span>Discount</span><span>-AED ${invoice.discount_amount.toLocaleString()}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:600;color:#374151"><span>Net Subtotal</span><span>AED ${(invoice.subtotal || 0).toLocaleString()}</span></div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280"><span>VAT (${invoice.vat_rate || 0}%)</span><span>${invoice.vat_rate === 0 ? 'Tax-Exempt (0%)' : `AED ${(invoice.vat_amount || 0).toLocaleString()}`}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #111827;font-size:15px;font-weight:700"><span>Total Due</span><span style="color:#059669">AED ${(invoice.total || 0).toLocaleString()}</span></div>
      </div>
    </div>
    ${invoice.notes ? `<div style="margin-top:32px;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Notes</div><div style="color:#374151">${escapeHtml(invoice.notes)}</div></div>` : ''}
    <div style="margin-top:40px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px">Thank you for your business! · Safaeewala Cleaning & Maintenance Services LLC</div>
  </body></html>`)
  win.document.close()
  win.focus()
  win.print()
}
