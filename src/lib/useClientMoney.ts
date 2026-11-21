import { useEffect, useState } from 'react'
import type { Client, DailyJob } from '@/types'
import { calcClientPendingBalance, loadClientAdjustments, loadPendingReceipts } from '@/lib/clientDataSync'
import { calcClientAdvanceBalance } from '@/lib/clientAdvance'

export interface ClientMoney { pending: number; advance: number }

const EMPTY = new Map<string, ClientMoney>()

/**
 * UX-196: Pending / Advance of the clients shown in an address dropdown, without making it slow to open.
 * Before, every open (and every key typed) worked out 60–all clients at once, each reading the adjustments and
 * receipts from storage again — the list opened late. Now the list opens at once; the balances follow in small
 * steps (a few clients per frame), each client once while the job data stays the same.
 */
export function useClientMoney(clients: Client[], dailyJobs: DailyJob[], enabled: boolean, limit = 60): Map<string, ClientMoney> {
  const [state, setState] = useState<{ jobs: DailyJob[]; map: Map<string, ClientMoney> }>(() => ({ jobs: dailyJobs, map: new Map() }))
  const current = state.jobs === dailyJobs ? state.map : EMPTY
  const shown = clients.slice(0, limit).filter(c => c?.id)
  const ids = shown.map(c => c.id).join('|')

  useEffect(() => {
    if (!enabled) return
    const work = new Map(current)
    const todo = shown.filter(c => !work.has(c.id))
    if (!todo.length) return
    let cancelled = false
    let frame = 0
    const adjustments = loadClientAdjustments()
    const receipts = loadPendingReceipts()
    const step = () => {
      if (cancelled) return
      const t0 = performance.now()
      while (todo.length && performance.now() - t0 < 12) {
        const c = todo.shift()!
        work.set(c.id, {
          pending: calcClientPendingBalance(c, dailyJobs, receipts, adjustments),
          advance: calcClientAdvanceBalance(c, dailyJobs, adjustments),
        })
      }
      setState({ jobs: dailyJobs, map: new Map(work) })
      if (todo.length) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [enabled, ids, dailyJobs]) // eslint-disable-line react-hooks/exhaustive-deps

  return current
}
