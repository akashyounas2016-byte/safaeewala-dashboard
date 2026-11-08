// E2E-07 / R-SEC-03: the database rule and the app must agree on default screens and screen names
import fs from 'node:fs'
import { DEFAULT_ROLE_PERMS, ALL_MODULE_KEYS } from '@/lib/permissions'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const sql = fs.readFileSync('supabase/migrations/2026-11-02_role_based_writes.sql', 'utf8')
const manager = JSON.parse(/when me\.role = 'manager' then '(\[[^']+\])'/.exec(sql)![1])
const employee = JSON.parse(/else '(\[[^']+\])'::jsonb/.exec(sql)![1])
// Screens that write no table (Alerts, R-ALERT-01) are not in the database rule
const NO_TABLE = ['Alerts', 'WhatsApp', 'Inbox', 'AI Bot', 'Marketing', 'Complaints'] // WhatsApp has its own read policy (R-WA-01), not role_can's default list // Marketing / Complaints: own policies let admin + manager in (R-MKT-01, R-CMP-01)
eq(manager, DEFAULT_ROLE_PERMS.manager.filter(k => !NO_TABLE.includes(k)), 'manager default screens match the app')
eq(employee, DEFAULT_ROLE_PERMS.employee, 'employee default screens match the app')
const used = Array.from(sql.matchAll(/array\[([^\]]+)\]/g)).flatMap(m => m[1].split(',').map(s => s.trim().replace(/'/g, '')))
eq(used.filter(m => !(ALL_MODULE_KEYS as string[]).includes(m)), [], 'every screen named in the SQL exists in the app')
