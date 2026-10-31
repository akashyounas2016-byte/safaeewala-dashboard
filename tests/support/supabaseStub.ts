// In-memory Supabase stand-in for tests
type Row = Record<string, any>
export const db: Record<string, Row[]> = {}
export const failing = new Set<string>()          // tables whose writes fail
export const tsFormat = { pg: false }              // return timestamps in Postgres text format
export const missingColumns: Record<string, string[]> = {} // columns the fake database does not have

const table = (t: string) => (db[t] ||= [])
const pk = (t: string) => (t === 'app_state' ? 'key' : 'id')
const out = (t: string, r: Row) =>
  t === 'app_state' && tsFormat.pg && r.updated_at ? { ...r, updated_at: r.updated_at.replace('Z', '+00:00') } : r

class Q implements PromiseLike<any> {
  private filters: [string, string, any][] = []
  private action: { kind: string; payload?: any } = { kind: 'select' }
  private single = false
  constructor(private t: string) {}
  select() { return this }
  order() { return this }
  range() { return this }
  in(col: string, vals: any[]) { this.filters.push(['in', col, vals]); return this }
  eq(col: string, val: any) { this.filters.push(['eq', col, val]); return this }
  maybeSingle() { this.single = true; return this }
  upsert(p: any) { this.action = { kind: 'upsert', payload: p }; return this }
  update(p: any) { this.action = { kind: 'update', payload: p }; return this }
  delete() { this.action = { kind: 'delete' }; return this }
  private match(r: Row) {
    return this.filters.every(([op, c, v]) => (op === 'eq' ? r[c] === v : v.includes(r[c])))
  }
  private exec() {
    const t = this.t, rows = table(t)
    if (this.action.kind !== 'select' && failing.has(t)) return { data: null, error: { message: `stub failure on ${t}` } }
    const bad = (missingColumns[t] || []).find(c => this.action.payload && c in this.action.payload)
    if (bad) return { data: null, error: { message: `Could not find the '${bad}' column of '${t}' in the schema cache` } }
    if (this.action.kind === 'select') {
      const data = rows.filter(r => this.match(r)).map(r => out(t, r))
      return { data: this.single ? data[0] ?? null : data, error: null }
    }
    if (this.action.kind === 'upsert') {
      const p = this.action.payload, k = pk(t)
      const i = rows.findIndex(r => r[k] === p[k])
      if (i >= 0) rows[i] = { ...rows[i], ...p }; else rows.push({ ...p })
      return { data: null, error: null }
    }
    if (this.action.kind === 'update') {
      rows.forEach((r, i) => { if (this.match(r)) rows[i] = { ...r, ...this.action.payload } })
      return { data: null, error: null }
    }
    db[t] = rows.filter(r => !this.match(r))
    return { data: null, error: null }
  }
  then<A, B>(ok?: (v: any) => A, bad?: (e: any) => B) {
    return Promise.resolve(this.exec()).then(ok, bad)
  }
}

export const supabase = { from: (t: string) => new Q(t) }
