// E2E-17 / R-SYNC-09: a change from another user merges into the list
import { applyRowChange } from '@/lib/realtime'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

const list = [{ id: 'a', name: 'TEST One', extra: 'kept' }, { id: 'b', name: 'TEST Two' }]
eq(applyRowChange(list, 'INSERT', { id: 'c', name: 'TEST Three' }).map(r => r.id), ['c', 'a', 'b'], 'new row from another user is added')
eq(applyRowChange(list, 'UPDATE', { id: 'a', name: 'TEST Renamed' })[0], { id: 'a', name: 'TEST Renamed', extra: 'kept' }, 'update keeps fields only this browser has')
eq(applyRowChange(list, 'DELETE', { id: 'b' }).map(r => r.id), ['a'], 'deleted row disappears')
eq(applyRowChange(list, 'UPDATE', { id: 'a', name: 'TEST One' }) === list, true, 'an echo of the same data changes nothing')
eq(applyRowChange(list, 'DELETE', { id: 'zz' }) === list, true, 'unknown delete changes nothing')
