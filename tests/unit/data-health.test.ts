import { runDataHealth } from '@/lib/dataHealth'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m) }
const job = (o: any) => ({ id: o.id, date: '2026-10-20', staff_name: 'TEST Rupa', start_time: '08:00', end_time: '12:00', address: 'A', area: '', charges: 100, received: 100, payment_mode: 'Cash', duty_hours: 4, ot_hours: 0, is_overtime: false, material: 'No', service: '', remarks: '', created_at: '', ...o })
const r = runDataHealth({
  clients: [{ id: 'c1', full_name: 'TEST A', phone: '0501112222' }, { id: 'c2', full_name: 'TEST B', phone: '+971 50 111 2222' }, { id: 'c3', full_name: 'TEST C', phone: '' }] as any,
  employees: [{ id: 'e1', full_name: 'TEST Rupa', emirates_id: '784-1990-1234567-1', phone: '' }, { id: 'e2', full_name: 'TEST Rupa 2', emirates_id: '784199012345671', phone: '' }] as any,
  dailyJobs: [job({ id: 'j1' }), job({ id: 'j2', staff_name: 'Nobody', address: 'B' }), job({ id: 'j3', received: 500, address: 'C' }), job({ id: 'old', date: '2026-01-01', staff_name: 'Ghost' })] as any,
  invoices: [{ id: 'i1', invoice_number: 'SAF-2026-0001', client_name: 'TEST A', job_ids: ['j1', 'gone'] }] as any,
  today: '2026-10-30',
  unsyncedChanges: 3,
})
const n = (id: string) => r.find(c => c.id === id)!.items.length
eq(n('sync'), 1, 'unsynced changes listed')
eq(n('dup-emp'), 1, 'duplicate employee by EID (dashes ignored)')
eq(n('dup-client'), 1, 'duplicate client by phone (formats ignored)')
eq(r.find(c => c.id === 'unregistered')!.items.map(i => i.label), ['Nobody'], 'only recent unregistered staff')
eq(n('rows'), 1, 'received > charges row flagged')
eq(n('invoices'), 1, 'invoice with deleted visit')
eq(n('no-phone'), 1, 'client without phone')
