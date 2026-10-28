/** Days closed on the Daily Job Sheet (UX-26) — cloud-synced key: { [YYYY-MM-DD]: ClosedDay } */
export const CLOSED_DAYS_KEY = 'safaeewala_closed_days'

export interface ClosedDay {
  closedAt: string
  summary: string
}
