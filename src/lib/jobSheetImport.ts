import * as XLSX from 'xlsx'
import type { DailyAdvanceItem, DailyPendingItem, DailyPendingReceivedItem, MaterialType, PaymentMode } from '@/types'
import { calcHours, cleanNum, formatTimeOnly } from '@/components/dailyJobSheet/jobSheetUtils'
import type { ImportPlan } from '@/components/dailyJobSheet/ImportPreviewModal'

/* eslint-disable @typescript-eslint/no-explicit-any -- spreadsheet cells are untyped */

/**
 * Excel day-sheet import, parsing only (UX-31 split from DailyJobSheet.tsx). Nothing is saved here:
 * the page shows the result in the import preview (UX-28) and saves it on "Import".
 */

/** FILE KA NAME HI DATE HOGI — the sheet's date comes from the file name (pure string parsing, timezone-safe) */
export function extractDateFromFilename(fileName: string, fallbackDate: string): string {
  if (!fileName) return fallbackDate

  // Clean extension
  const base = fileName.replace(/\.[^/.]+$/, '').trim()

  // 1. Check YYYY-MM-DD or YYYY.MM.DD or YYYY_MM_DD
  const ymd = base.match(/\b(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})\b/)
  if (ymd) {
    const y = ymd[1]
    const m = String(parseInt(ymd[2], 10)).padStart(2, '0')
    const d = String(parseInt(ymd[3], 10)).padStart(2, '0')
    const mNum = parseInt(m, 10)
    const dNum = parseInt(d, 10)
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${y}-${m}-${d}`
    }
  }

  // 2. Check DD-MM-YYYY or DD.MM.YYYY or DD_MM_YYYY
  const dmy = base.match(/\b(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})\b/)
  if (dmy) {
    const d = String(parseInt(dmy[1], 10)).padStart(2, '0')
    const m = String(parseInt(dmy[2], 10)).padStart(2, '0')
    const y = dmy[3]
    const mNum = parseInt(m, 10)
    const dNum = parseInt(d, 10)
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${y}-${m}-${d}`
    }
  }

  // 3. Month text: e.g. "Apr 26", "26 Apr 2026", "26 October 2026", "Oct-26-2026"
  const monthNames = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  }

  // Case 3a: Month Day Year (e.g. "Oct 23 2026" or "October 23, 2026" or "Oct-23")
  const mdyRegex = new RegExp(`\\b(${monthNames})[\\s_-]*(\\d{1,2})(?:st|nd|rd|th)?[\\s,_-]*(?:(20\\d{2}|\\d{2}))?\\b`, 'i')
  const mdyMatch = base.match(mdyRegex)
  if (mdyMatch) {
    const mKey = mdyMatch[1].toLowerCase().slice(0, 3)
    const m = monthMap[mKey]
    const d = String(parseInt(mdyMatch[2], 10)).padStart(2, '0')
    let y = mdyMatch[3] ? mdyMatch[3] : (fallbackDate.split('-')[0] || String(new Date().getFullYear()))
    if (y.length === 2) y = '20' + y
    return `${y}-${m}-${d}`
  }

  // Case 3b: Day Month Year (e.g. "23 Oct 2026" or "23rd October 2026" or "23-Oct")
  const dmyTextRegex = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s,_-]*(${monthNames})[\\s,_-]*(?:(20\\d{2}|\\d{2}))?\\b`, 'i')
  const dmyTextMatch = base.match(dmyTextRegex)
  if (dmyTextMatch) {
    const d = String(parseInt(dmyTextMatch[1], 10)).padStart(2, '0')
    const mKey = dmyTextMatch[2].toLowerCase().slice(0, 3)
    const m = monthMap[mKey]
    let y = dmyTextMatch[3] ? dmyTextMatch[3] : (fallbackDate.split('-')[0] || String(new Date().getFullYear()))
    if (y.length === 2) y = '20' + y
    return `${y}-${m}-${d}`
  }

  // 4. Compact numeric: YYYYMMDD (8 digits)
  const compactYMD = base.match(/\b(20\d{2})(\d{2})(\d{2})\b/)
  if (compactYMD) {
    const y = compactYMD[1]
    const m = compactYMD[2]
    const d = compactYMD[3]
    const mNum = parseInt(m, 10)
    const dNum = parseInt(d, 10)
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${y}-${m}-${d}`
    }
  }

  // 5. Compact numeric: DDMMYYYY (8 digits)
  const compactDMY = base.match(/\b(\d{2})(\d{2})(20\d{2})\b/)
  if (compactDMY) {
    const d = compactDMY[1]
    const m = compactDMY[2]
    const y = compactDMY[3]
    const mNum = parseInt(m, 10)
    const dNum = parseInt(d, 10)
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${y}-${m}-${d}`
    }
  }

  // 6. Isolated day number only: e.g. "23.xlsx", "Day 23", "Sheet 23"
  const dayOnlyMatch = base.match(/(?:^|\b)(?:day[\s_-]*)?([1-9]|[12]\d|3[01])(?:st|nd|rd|th)?(?:\b|$)/i)
  if (dayOnlyMatch) {
    const d = String(parseInt(dayOnlyMatch[1], 10)).padStart(2, '0')
    const parts = fallbackDate.split('-')
    const y = parts[0] || String(new Date().getFullYear())
    const m = parts[1] || '01'
    return `${y}-${m}-${d}`
  }

  return fallbackDate
}

/** Read one workbook into an import plan (jobs, expenses, pending, recoveries, advances) */
export function parseJobSheetWorkbook(wb: XLSX.WorkBook, fileName: string, fallbackDate: string): ImportPlan {
  const targetDate = extractDateFromFilename(fileName, fallbackDate)

  // UX-28: nothing is cleared or saved here — the preview's "Import" button does that
  const planJobs: ImportPlan['jobs'] = []
  const planExpenses: ImportPlan['expenses'] = []

  // Smart sheet matching with Header Scoring:
  // Real job sheets contain: Staff, Address, Charges, Received, Location, Duty Hrs, Mode, Service
  const REQUIRED_JOB_COLS = ['staff', 'address', 'charges', 'received', 'location', 'start time', 'end time', 'duty hrs', 'mode', 'service']

  const scoreSheet = (sheet: XLSX.WorkSheet | undefined): number => {
    if (!sheet || !sheet['!ref']) return 0
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })
    if (!rows || rows.length === 0) return 0
    let bestScore = 0
    for (let r = 0; r < Math.min(rows.length, 6); r++) {
      const row = rows[r]
      if (!Array.isArray(row)) continue
      let s = 0
      const texts = row.map(cell => String(cell || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
      REQUIRED_JOB_COLS.forEach(col => {
        const normalized = col.replace(/[^a-z0-9]/g, '')
        if (texts.some(t => t.includes(normalized))) s += 2
      })
      if (texts.some(t => t.includes('expense'))) s += 1
      if (texts.some(t => t.includes('pending'))) s += 1
      if (texts.some(t => t.includes('advance'))) s += 1
      if (s > bestScore) bestScore = s
    }
    return bestScore
  }

  const dayNum = parseInt(targetDate.split('-')[2] || '0', 10)
  const scoredSheets = wb.SheetNames.map(sn => ({
    name: sn,
    score: scoreSheet(wb.Sheets[sn]),
    isDayMatch: dayNum > 0 && Boolean(sn.match(/^(\d+)/) && parseInt(sn.match(/^(\d+)/)![1], 10) === dayNum),
    isJobsName: sn.toLowerCase() === 'jobs' || sn.toLowerCase().includes('job sheet') || sn.toLowerCase().includes('schedule')
  }))

  // Prefer sheets with real job columns (score >= 4)
  const validSheets = scoredSheets.filter(s => s.score >= 4)

  let sheetName = wb.SheetNames[0]
  if (validSheets.length > 0) {
    const dayMatch = validSheets.find(s => s.isDayMatch)
    if (dayMatch) {
      sheetName = dayMatch.name
    } else {
      const jobsMatch = validSheets.find(s => s.isJobsName)
      if (jobsMatch) {
        sheetName = jobsMatch.name
      } else {
        validSheets.sort((a, b) => b.score - a.score)
        sheetName = validSheets[0].name
      }
    }
  } else {
    if (wb.SheetNames.includes('Jobs')) {
      sheetName = 'Jobs'
    } else if (dayNum > 0) {
      const matchingSheet = wb.SheetNames.find(sn => {
        const m = sn.match(/^(\d+)/)
        return m && parseInt(m[1], 10) === dayNum
      })
      if (matchingSheet) sheetName = matchingSheet
    }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName])
  if (!rows || rows.length === 0) {
    throw new Error('No rows found in the Excel sheet.')
  }

  let lastStaff = ''

  rows.forEach(r => {
    // Robust column matching across case, symbols, and alternate names from Excel
    const nm = (...keys: string[]) => {
      for (const k of keys) {
        const normalized = k.toLowerCase().replace(/\s*\([^)]*\)\s*/g, '').replace(/[^a-z0-9]/g, '')
        for (const [key, val] of Object.entries(r)) {
          const keyNorm = String(key).toLowerCase().replace(/\s*\([^)]*\)\s*/g, '').replace(/[^a-z0-9]/g, '')
          if (keyNorm === normalized && val !== undefined && val !== null && val !== '') return val
        }
      }
      return ''
    }

    const rawStaff = String(nm('Staff', 'staff_name', 'Employee', 'Name') || '').trim()
    const rawAddress = String(nm('Address', 'address') || '').trim()
    const rawStart = nm('Start time', 'Start', 'start_time', 'Start Time')
    const rawEnd = nm('End time', 'End', 'end_time', 'End Time')
    const rawCharges = nm('Charges', 'charges_aed', 'charges', 'Charge')
    const rawReceived = nm('Received', 'Receive', 'received_aed', 'received', 'Recv', 'Paid')

    // Skip summary / footer rows (e.g. 'Gross', 'Total', 'Pending Rcvd cash', 'Expences', 'Net Total', or numeric totals)
    // Check ONLY in main job columns, NOT in side columns (which contain "Advance" and "Total" headers/summaries)
    const jobColText = [rawStaff, rawAddress, String(nm('Location', 'area', 'Area', 'location') || ''), String(rawCharges)].join(' ').toLowerCase()
    const isFooterWord = ['gross', 'pending rcvd', 'total', 'expences', 'net total', 'summary'].some(f => jobColText.includes(f))

    const hasNoAddressOrTimes = !rawAddress && (!rawStart || String(rawStart).trim() === '—') && (!rawEnd || String(rawEnd).trim() === '—')
    const dutyHCheck = cleanNum(nm('Duty Hrs', 'Duty H', 'Duty Hours', 'Duty', 'duty_hours', 'dutyhrs', 'Hrs'))
    const isNumericTotalRow = hasNoAddressOrTimes && (dutyHCheck > 24 || cleanNum(rawCharges) > 1500 || cleanNum(rawReceived) > 1500)

    // Absent cleaner check (e.g. Nobel where 'Start time' is 'Absent')
    const isAbsent = String(rawStart).toLowerCase().includes('absent') || String(rawAddress).toLowerCase().includes('absent') || String(rawStaff).toLowerCase().includes('absent')

    if (isFooterWord || isNumericTotalRow || isAbsent) {
      lastStaff = ''
      return
    }

    if (rawStaff) {
      lastStaff = rawStaff
    }

    // A valid job has an address OR valid start and end times OR charges > 0
    const hasJobInfo = Boolean(rawAddress) || cleanNum(rawCharges) > 0 || (Boolean(rawStart) && Boolean(rawEnd) && String(rawStart).trim() !== '—' && String(rawEnd).trim() !== '—')

    if (hasJobInfo && lastStaff) {
      const sTime = formatTimeOnly(rawStart)
      const eTime = formatTimeOnly(rawEnd)

      // Header variations: "Duty Hrs", "Duty H", "Duty Hours", "Hrs"
      let dutyH = cleanNum(nm('Duty Hrs', 'Duty H', 'Duty Hours', 'Duty', 'duty_hours', 'dutyhrs', 'Hrs'))
      if (dutyH <= 0 && sTime !== '—' && eTime !== '—') {
        dutyH = calcHours(sTime, eTime)
      }
      dutyH = Math.round(dutyH * 10) / 10

      const otVal = Math.round(cleanNum(nm('OT', 'ot_hours', 'overtime', 'OT Hours', 'OTHrs')) * 10) / 10
      const isOt = String(nm('OT', 'is_overtime')).toLowerCase() === 'yes' || otVal > 0

      let mat = String(nm('Material', 'material', 'Mat') || 'No').trim()
      if (mat.toUpperCase() === 'YES') mat = 'Yes'
      else if (mat.toUpperCase() === 'NO') mat = 'No'

      const serviceVal = String(nm('Service', 'service_type', 'service') || '').trim()
      const locationVal = String(nm('Location', 'area', 'Area', 'location') || '').trim()
      const modeVal = (String(nm('Mode', 'Mod', 'payment_mode') || 'Cash').trim()) as PaymentMode

      planJobs.push({
        date:         targetDate, // FILE KA NAME HI DATE HOGI! Strict and authoritative date source
        staff_name:   lastStaff,
        start_time:   sTime,
        end_time:     eTime,
        duty_hours:   dutyH,
        ot_hours:     otVal,
        address:      rawAddress,
        area:         locationVal,
        material:     mat as MaterialType,
        charges:      cleanNum(rawCharges),
        received:     cleanNum(rawReceived),
        payment_mode: modeVal,
        is_overtime:  isOt,
        remarks:      String(nm('Remarks', 'remarks') || '').trim(),
        service:      serviceVal,
      })
    }

    // Check if row has an expense in side columns (e.g. 'Expenses' column)
    let expName = ''
    let expAmount = 0
    for (const [k, v] of Object.entries(r)) {
      if (k.toLowerCase().includes('expense') && typeof v === 'string' && v.trim()) {
        expName = v.trim()
      }
    }
    if (expName && expName.toLowerCase() !== 'items') {
      const keys = Object.keys(r)
      const idx = keys.findIndex(k => k.toLowerCase().includes('expense'))
      if (idx !== -1 && idx + 1 < keys.length) {
        const nextVal = r[keys[idx + 1]]
        if (typeof nextVal === 'number' && nextVal > 0) expAmount = nextVal
      }
      if (expAmount > 0 && !expName.toLowerCase().includes('total')) {
        let cat = 'Other'
        const l = expName.toLowerCase()
        if (l.includes('fuel') || l.includes('petrol')) cat = 'Fuel'
        else if (l.includes('parking')) cat = 'Parking'
        else if (l.includes('toll') || l.includes('salik')) cat = 'Toll'
        else if (l.includes('oil') || l.includes('maintenance') || l.includes('labor')) cat = 'Vehicle maintenance'
        else if (l.includes('supplies') || l.includes('material')) cat = 'Supplies'

        planExpenses.push({
          date:     targetDate,
          name:     expName,
          category: cat,
          amount:   expAmount,
        })
      }
    }
  })

  // Also check if workbook has a dedicated 'Expenses' sheet
  if (wb.SheetNames.includes('Expenses')) {
    const expSheetRows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets['Expenses'])
    expSheetRows.forEach(er => {
      const nmE = (...keys: string[]) => {
        for (const k of keys) {
          const normalized = k.toLowerCase().replace(/[^a-z0-9]/g, '')
          for (const [key, val] of Object.entries(er)) {
            if (String(key).toLowerCase().replace(/[^a-z0-9]/g, '') === normalized && val !== undefined && val !== null && val !== '') return val
          }
        }
        return ''
      }
      const eName = String(nmE('name', 'description', 'expense', 'item') || '').trim()
      const eAmt = cleanNum(nmE('amount', 'cost', 'aed'))
      if (eName && eAmt > 0 && !eName.toLowerCase().includes('total')) {
        planExpenses.push({
          date:     targetDate,
          name:     eName,
          category: String(nmE('category', 'cat') || 'Other').trim(),
          amount:   eAmt,
        })
      }
    })
  }

  // Extract Pending, Pending Received, and Advance from side columns (e.g. Q through X)
  const newPendingItems: DailyPendingItem[] = []
  const newPendingRcvdItems: DailyPendingReceivedItem[] = []
  const newAdvanceItems: DailyAdvanceItem[] = []

  const currentSheet = wb.Sheets[sheetName]
  if (currentSheet) {
    const range = XLSX.utils.decode_range(currentSheet['!ref'] || 'A1:AS105')
    const getCell = (r: number, c: number) => {
      const cell = currentSheet[XLSX.utils.encode_cell({ r, c })]
      return cell ? cell.v : undefined
    }

    let pCol = -1, prCol = -1, advCol = -1
    let dataStartRow = 2

    for (let r = 0; r <= 3; r++) {
      for (let c = 10; c <= range.e.c; c++) {
        const val = String(getCell(r, c) || '').toLowerCase().trim()
        if (val === 'pending' && pCol === -1) {
          pCol = c
          dataStartRow = Math.max(dataStartRow, r + 2)
        }
        if ((val.includes('pending rcvd') || val.includes('pending received')) && prCol === -1) {
          prCol = c
          dataStartRow = Math.max(dataStartRow, r + 2)
        }
        if (val === 'advance' && advCol === -1) {
          advCol = c
          dataStartRow = Math.max(dataStartRow, r + 2)
        }
      }
    }

    if (pCol === -1 && range.e.c >= 17) pCol = 16
    if (prCol === -1 && range.e.c >= 20) prCol = 18
    if (advCol === -1 && range.e.c >= 23) advCol = 21

    for (let r = dataStartRow; r <= Math.min(range.e.r, 60); r++) {
      const vP = pCol >= 0 ? String(getCell(r, pCol) || '').trim() : ''
      const vPR = prCol >= 0 ? String(getCell(r, prCol) || '').trim() : ''
      const vAdv = advCol >= 0 ? String(getCell(r, advCol) || '').trim() : ''

      if (pCol >= 0 && vP && !vP.toLowerCase().includes('total')) {
        const amt = parseFloat(String(getCell(r, pCol + 1) || '0')) || 0
        newPendingItems.push({
          id: `${Date.now()}-p-${r}`,
          date: targetDate,
          client: vP,
          amount: amt,
        })
      }

      if (prCol >= 0 && vPR && !vPR.toLowerCase().includes('total')) {
        const cash = parseFloat(String(getCell(r, prCol + 1) || '0')) || 0
        const online = parseFloat(String(getCell(r, prCol + 2) || '0')) || 0
        newPendingRcvdItems.push({
          id: `${Date.now()}-pr-${r}`,
          date: targetDate,
          client: vPR,
          cash,
          online,
        })
      }

      if (advCol >= 0 && vAdv && !vAdv.toLowerCase().includes('total')) {
        const rcvd = parseFloat(String(getCell(r, advCol + 1) || '0')) || 0
        const adv = parseFloat(String(getCell(r, advCol + 2) || '0')) || 0
        newAdvanceItems.push({
          id: `${Date.now()}-adv-${r}`,
          date: targetDate,
          client: vAdv,
          received: rcvd,
          advance: adv,
        })
      }
    }

    // Fallback: If side table didn't have Pending Rcvd, check footer summary for 'Pending Rcvd cash'
    if (newPendingRcvdItems.length === 0) {
      for (let r = Math.max(0, range.e.r - 20); r <= range.e.r; r++) {
        for (let c = 0; c <= Math.min(range.e.c, 10); c++) {
          const val = String(getCell(r, c) || '').toLowerCase().trim()
          if (val.includes('pending rcvd') || val.includes('pending received')) {
            for (let offset = 1; offset <= 3; offset++) {
              const numVal = parseFloat(String(getCell(r, c + offset) || '0'))
              if (numVal > 0 && numVal < 100000) {
                newPendingRcvdItems.push({
                  id: `${Date.now()}-pr-footer-${r}`,
                  date: targetDate,
                  client: 'Pending Rcvd cash',
                  cash: numVal,
                  online: 0,
                })
                break
              }
            }
          }
        }
      }
    }

  }

  return {
    fileName,
    sheetName,
    sheetNames: wb.SheetNames,
    date: targetDate,
    jobs: planJobs,
    expenses: planExpenses,
    pending: newPendingItems,
    pendingRcvd: newPendingRcvdItems,
    advances: newAdvanceItems,
  }
}
