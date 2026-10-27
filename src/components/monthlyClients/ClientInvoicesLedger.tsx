import { FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useData } from '@/store/DataContext'
import { normalizeKey } from '@/lib/clientDataSync'
import { invoiceBalance, isPartlyPaid } from '@/lib/receivables'

/**
 * Invoices of one client inside the Monthly Client ledger (UX-21): number, date, total, paid,
 * balance and status — next to the visits and payments already shown there.
 */
export function ClientInvoicesLedger({ clientName }: { clientName: string }) {
  const { invoices } = useData()
  const key = normalizeKey(clientName)
  const list = invoices
    .filter(i => normalizeKey(i.client_name) === key)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  return (
    <div className="pt-2">
      <h4 className="text-[14px] font-bold text-slate-800 flex items-center gap-1.5 mb-2.5">
        <FileText size={15} className="text-indigo-600" /> Invoices ({list.length})
      </h4>
      {list.length === 0 ? (
        <p className="text-[12px] text-slate-400 bg-slate-50 rounded-xl p-3">
          No invoices yet — create one from <Link to="/monthly-invoices" className="text-teal-700 font-semibold underline">Monthly Invoices</Link>.
        </p>
      ) : (
        <div className="border border-[#E4E8EC] rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[12px]">
            <thead className="bg-[#f8fafc] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-2 px-3">Invoice</th>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-right">Paid</th>
                <th className="py-2 px-3 text-right">Balance</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map(inv => {
                const paid = inv.status === 'paid' ? inv.total : Number(inv.amount_paid) || 0
                const bal = invoiceBalance(inv)
                const status = isPartlyPaid(inv) ? 'partly paid' : inv.status
                return (
                  <tr key={inv.id}>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-800">{inv.invoice_number}</td>
                    <td className="py-2 px-3 text-slate-500">{(inv.created_at || '').split('T')[0]}</td>
                    <td className="py-2 px-3 text-right">AED {inv.total.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-emerald-700">AED {paid.toLocaleString()}</td>
                    <td className={`py-2 px-3 text-right font-bold ${bal > 0 ? 'text-red-700' : 'text-slate-400'}`}>AED {bal.toLocaleString()}</td>
                    <td className="py-2 px-3 capitalize">{status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
