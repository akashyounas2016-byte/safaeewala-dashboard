import type { DailyJob } from '@/types'

/**
 * UX-184: Undo / Redo on the Excel Job Sheet work as patches. A step keeps the rows before and after one change;
 * undo puts back only the rows that change touched, on top of what the grid shows now. So a step still undoes
 * after the sheet auto-saved (3 s later) and never overwrites rows another user changed meanwhile. A new row that
 * was saved under a new id is found through `resolve` (temporary id → saved id).
 */
export interface UndoStep {
  before: DailyJob[]
  after: DailyJob[]
  /** cell colours (UX-184), when the step changed them */
  cells?: { before: Record<string, string>; after: Record<string, string> }
}

const same = (a: DailyJob | undefined, b: DailyJob | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Ids whose row differs between two states */
export function changedIds(from: DailyJob[], to: DailyJob[]): string[] {
  const a = new Map(from.map(r => [r.id, r]))
  const b = new Map(to.map(r => [r.id, r]))
  const ids = new Set<string>([...a.keys(), ...b.keys()])
  return Array.from(ids).filter(id => !same(a.get(id), b.get(id)))
}

/**
 * Move the rows that differ between `from` and `to` to their `to` version inside `current`:
 * changed → replaced, missing in `to` → removed, missing in `current` → put back after the row before it in `to`.
 */
export function applyRowPatch(current: DailyJob[], from: DailyJob[], to: DailyJob[], resolve: (id: string) => string = id => id): DailyJob[] {
  const ids = changedIds(from, to)
  if (!ids.length) return current
  const target = new Map(to.map(r => [r.id, r]))
  let out = [...current]
  // removals first
  const drop = new Set(ids.filter(id => !target.has(id)).map(resolve))
  out = out.filter(r => !drop.has(r.id))
  for (const id of ids) {
    const want = target.get(id)
    if (!want) continue
    const cur = resolve(id)
    const row = { ...want, id: cur }
    const at = out.findIndex(r => r.id === cur)
    if (at >= 0) { out[at] = row; continue }
    // put it back after its neighbour in the target state
    const pos = to.findIndex(r => r.id === id)
    let insertAt = 0
    for (let p = pos - 1; p >= 0; p--) {
      const n = out.findIndex(r => r.id === resolve(to[p].id))
      if (n >= 0) { insertAt = n + 1; break }
    }
    out.splice(insertAt, 0, row)
  }
  return out
}

/** Cell colours: only the keys the step changed go back */
export function applyCellPatch(current: Record<string, string>, from: Record<string, string>, to: Record<string, string>, resolveKey: (k: string) => string = k => k): Record<string, string> {
  const out = { ...current }
  const keys = new Set([...Object.keys(from), ...Object.keys(to)])
  keys.forEach(k => {
    if (from[k] === to[k]) return
    const key = resolveKey(k)
    if (to[k] === undefined) delete out[key]
    else out[key] = to[k]
  })
  return out
}
