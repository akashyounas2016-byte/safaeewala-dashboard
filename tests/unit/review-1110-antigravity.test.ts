// Review of 2026-11-09/10 work: every employee field the form saves has a database column; sign-in never hangs
import { readFileSync, readdirSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const sql = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).map(f => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
const hasColumn = (table: string, col: string) =>
  new RegExp(`alter table public\\.${table} add column if not exists ${col}\\b`, 'i').test(sql) ||
  new RegExp(`create table if not exists public\\.${table}\\s*\\([\\s\\S]*?\\n\\s*${col}\\s`, 'i').test(sql)

const NEW_FIELDS = ['short_name', 'basic_salary', 'other_documents_file', 'training_start_date', 'training_end_date', 'training_duration_days', 'notes']
eq(NEW_FIELDS.filter(c => !hasColumn('employees', c)), [], 'every new employee field has a column (they were dropped on save)')

const dc = readFileSync('src/store/DataContext.tsx', 'utf8')
eq(/'noc_file', 'other_documents_file'\] as const/.test(dc), true, 'Other Documents goes to Storage like the other files')

const uc = readFileSync('src/store/UserContext.tsx', 'utf8')
eq(/profileRetries\.current < 5/.test(uc) && /setStatus\(profError \? 'signed_out' : 'no_profile'\)/.test(uc), true, 'a failed first profile read is retried, then returns to sign-in (no endless loading)')
