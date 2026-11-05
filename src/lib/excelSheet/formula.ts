import { cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'
import { type ColumnDef, COLUMNS } from '@/lib/excelSheet/columns'

/** CODE-A01: Excel-style formula evaluator for the grid (=SUM(G1:G9) …) (moved from pages/JobSheetSpreadsheet.tsx) */

/* ─── Excel Formula Parser & Evaluator ─── */
export function evaluateFormula(
  formulaStr: string,
  gridData: Record<string, any>[],
  currentRowIdx: number,
  activeColumns: ColumnDef[] = COLUMNS
): number | string {
  const expr = formulaStr.trim()
  if (!expr.startsWith('=')) return expr

  const body = expr.substring(1).trim().toUpperCase()

  // 1. =SUM(ColRange) e.g. =SUM(I2:I20) or =SUM(I)
  const sumMatch = body.match(/^SUM\(([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?\)$/i)
  if (sumMatch) {
    const startColLetter = sumMatch[1].toUpperCase()
    const startRow = sumMatch[2] ? parseInt(sumMatch[2], 10) - 1 : 0
    const endRow = sumMatch[4] ? parseInt(sumMatch[4], 10) - 1 : gridData.length - 1

    const colDef = activeColumns.find(c => c.col === startColLetter)
    if (!colDef) return 0

    let total = 0
    for (let r = Math.max(0, startRow); r <= Math.min(gridData.length - 1, endRow); r++) {
      const val = cleanNum(gridData[r]?.[colDef.id])
      total += val
    }
    return Math.round(total * 100) / 100
  }

  // 2. =AVERAGE(ColRange)
  const avgMatch = body.match(/^AVERAGE\(([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?\)$/i)
  if (avgMatch) {
    const colLetter = avgMatch[1].toUpperCase()
    const startRow = avgMatch[2] ? parseInt(avgMatch[2], 10) - 1 : 0
    const endRow = avgMatch[4] ? parseInt(avgMatch[4], 10) - 1 : gridData.length - 1
    const colDef = activeColumns.find(c => c.col === colLetter)
    if (!colDef) return 0

    let total = 0
    let count = 0
    for (let r = Math.max(0, startRow); r <= Math.min(gridData.length - 1, endRow); r++) {
      const val = cleanNum(gridData[r]?.[colDef.id])
      total += val
      count++
    }
    return count > 0 ? Math.round((total / count) * 100) / 100 : 0
  }

  // 3. =COUNT(ColRange)
  const countMatch = body.match(/^COUNT\(([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?\)$/i)
  if (countMatch) {
    const colLetter = countMatch[1].toUpperCase()
    const startRow = countMatch[2] ? parseInt(countMatch[2], 10) - 1 : 0
    const endRow = countMatch[4] ? parseInt(countMatch[4], 10) - 1 : gridData.length - 1
    const colDef = activeColumns.find(c => c.col === colLetter)
    if (!colDef) return 0

    let count = 0
    for (let r = Math.max(0, startRow); r <= Math.min(gridData.length - 1, endRow); r++) {
      if (gridData[r]?.[colDef.id] !== undefined && gridData[r]?.[colDef.id] !== '') count++
    }
    return count
  }

  // 4. Simple cell references like =I4 - J4 or =I - J (relative to current row)
  try {
    let parsedExpr = body.replace(/([A-Z]+)(\d+)/g, (_, colLtr, rowNum) => {
      const col = activeColumns.find(c => c.col === colLtr.toUpperCase())
      const rIdx = parseInt(rowNum, 10) - 1
      if (!col || !gridData[rIdx]) return '0'
      const v = cleanNum(gridData[rIdx][col.id])
      return String(v)
    })

    parsedExpr = parsedExpr.replace(/\b([A-Z])\b/g, (_, colLtr) => {
      const col = activeColumns.find(c => c.col === colLtr.toUpperCase())
      if (!col || !gridData[currentRowIdx]) return '0'
      const v = cleanNum(gridData[currentRowIdx][col.id])
      return String(v)
    })

    if (/^[0-9+\-*/().\s]+$/.test(parsedExpr)) {
      // eslint-disable-next-line no-eval
      const result = Function(`'use strict'; return (${parsedExpr})`)()
      return typeof result === 'number' && !isNaN(result) ? Math.round(result * 100) / 100 : 0
    }
  } catch (err) {
    return '#VALUE!'
  }

  return '#ERROR!'
}
