import * as XLSX from 'xlsx'
import { FileSpreadsheet, MessageCircle, Printer } from 'lucide-react'
import type { Employee } from '@/types'
import { escapeHtml } from '@/lib/html'
import { notify } from '@/lib/notify'
import { SHEET_COLUMNS, driverSheetRows, driverSheetText, sheetSignature, whatsappUrl, type RouteSite } from '@/lib/driverRoutes'
import type { DriverShift } from '@/lib/driverPlans'

/** Send / print / export one driver's duty sheet — no OT, no Material (R-DRV-02) */
export function DriverSheetActions({ driver, sites, dateLabel, date, shift, onSent }: {
  driver: Employee
  sites: RouteSite[]
  date: string
  dateLabel: string
  shift?: DriverShift
  onSent?: (signature: string) => void
}) {
  const disabled = sites.length === 0

  const sendWhatsApp = () => {
    if (!driver.phone) { notify.error(`${driver.full_name} has no phone number — add it on the Employees screen.`); return }
    window.open(whatsappUrl(driver.phone, driverSheetText(driver.full_name, dateLabel, sites, shift)), '_blank', 'noopener,noreferrer')
    onSent?.(sheetSignature(sites))
  }

  const print = () => {
    const win = window.open('', '_blank', 'width=1000,height=760')
    if (!win) { notify.error('Allow pop-ups to print.'); return }
    const rows = driverSheetRows(sites).map((r, i) =>
      `<tr><td><span class="dot" style="background:${sites[i].color.hex}"></span>${r.map(escapeHtml).join('</td><td>')}</td></tr>`).join('')
    win.document.write(`<!DOCTYPE html><html><head><title>Driver duties — ${escapeHtml(driver.full_name)} — ${escapeHtml(date)}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0}p{margin:4px 0 14px;color:#555;font-size:12px}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#f1f5f9}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}</style></head><body>
      <h1>Driver duties — ${escapeHtml(driver.full_name)}</h1>
      <p>${escapeHtml(dateLabel)}${shift?.start || shift?.end ? ` · Shift ${escapeHtml(shift?.start || '—')} – ${escapeHtml(shift?.end || '—')}` : ''}${shift?.vehicle ? ` · ${escapeHtml(shift.vehicle)}` : ''}</p>
      <table><thead><tr>${SHEET_COLUMNS.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`)
    win.document.close()
  }

  const excel = () => {
    const ws = XLSX.utils.aoa_to_sheet([[...SHEET_COLUMNS], ...driverSheetRows(sites)])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Duties')
    XLSX.writeFile(wb, `driver-duties-${driver.full_name.replace(/\s+/g, '-')}-${date}.xlsx`)
  }

  const btn = 'px-2.5 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
  return (
    <div className="flex gap-1.5 flex-wrap">
      <button type="button" disabled={disabled} onClick={sendWhatsApp} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}><MessageCircle size={13} /> Send on WhatsApp</button>
      <button type="button" disabled={disabled} onClick={print} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}><Printer size={13} /> Print</button>
      <button type="button" disabled={disabled} onClick={excel} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}><FileSpreadsheet size={13} /> Excel</button>
    </div>
  )
}
