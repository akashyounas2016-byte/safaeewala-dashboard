// Time tracking service for crew payroll accuracy

export interface TimeEntry {
  crewId: string
  jobId: string
  checkInTime: string
  checkOutTime?: string
  actualDurationMinutes: number
  scheduledDurationMinutes: number
  notes?: string
  date: string
}

export function calculateActualJobDuration(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60))
}

export function calculatePayrollHours(timeEntries: TimeEntry[], hourlyRate: number): {
  totalHours: number
  totalPay: number
  overtimeHours: number
  overtimePay: number
  regularPay: number
} {
  const totalMinutes = timeEntries.reduce((sum, e) => sum + e.actualDurationMinutes, 0)
  const totalHours = totalMinutes / 60

  const STANDARD_HOURS = 48 // Weekly standard in UAE
  const OVERTIME_MULTIPLIER = 1.5 // 150% for overtime

  const regularHours = Math.min(totalHours, STANDARD_HOURS)
  const overtimeHours = Math.max(0, totalHours - STANDARD_HOURS)

  const regularPay = regularHours * hourlyRate
  const overtimePay = overtimeHours * hourlyRate * OVERTIME_MULTIPLIER

  return {
    totalHours: parseFloat(totalHours.toFixed(2)),
    totalPay: regularPay + overtimePay,
    overtimeHours: parseFloat(overtimeHours.toFixed(2)),
    overtimePay,
    regularPay,
  }
}

export function getJobAccuracyMetrics(scheduled: number, actual: number): {
  variance: number
  variancePercent: number
  status: 'early' | 'ontime' | 'late'
  message: string
} {
  const variance = actual - scheduled
  const variancePercent = Math.round((variance / scheduled) * 100)

  let status: 'early' | 'ontime' | 'late' = 'ontime'
  if (variance < -5) status = 'early' // 5+ min early
  if (variance > 5) status = 'late' // 5+ min late

  const messages: Record<typeof status, string> = {
    early: `✓ Completed ${Math.abs(variance)} min early`,
    ontime: `✓ Completed on time (+/- 5 min)`,
    late: `⚠️ Completed ${variance} min late`,
  }

  return {
    variance,
    variancePercent,
    status,
    message: messages[status],
  }
}

export function generatePayrollReport(employees: any[], timeEntries: TimeEntry[], period: string) {
  const report: Record<string, any> = {}

  for (const emp of employees) {
    const empEntries = timeEntries.filter(e => e.crewId === emp.id)
    if (empEntries.length === 0) continue

    const payroll = calculatePayrollHours(empEntries, emp.hourly_rate || 0)

    report[emp.id] = {
      name: emp.full_name,
      period,
      jobsCompleted: empEntries.length,
      totalHours: payroll.totalHours,
      regularHours: Math.round((payroll.regularPay / (emp.hourly_rate || 1)) * 10) / 10,
      overtimeHours: payroll.overtimeHours,
      regularPay: Math.round(payroll.regularPay),
      overtimePay: Math.round(payroll.overtimePay),
      totalPay: Math.round(payroll.totalPay),
      avgJobDuration: Math.round(empEntries.reduce((s, e) => s + e.actualDurationMinutes, 0) / empEntries.length),
      onTimeRate: Math.round(
        (empEntries.filter(e => {
          const metrics = getJobAccuracyMetrics(e.scheduledDurationMinutes, e.actualDurationMinutes)
          return metrics.status === 'ontime'
        }).length / empEntries.length) * 100
      ),
    }
  }

  return report
}
