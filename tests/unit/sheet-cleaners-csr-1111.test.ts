// 2026-11-11: Excel Job Sheet lists cleaners only, Staff shows Short Name, CSR role (R-SHEET-02); Charges (hrs) typed (UX-138)
import { readFileSync, readdirSync } from 'node:fs'
import { isSheetCleaner, isJobStaff, shortStaffLabel } from '@/lib/staffRoles'
import { SAVED_FIELDS, NUMERIC_FIELDS } from '@/lib/excelSheet/rows'
import { DEFAULT_COLUMN_DEFS } from '@/lib/excelSheet/columns'
import { sanitizeOutboxPayload } from '@/lib/syncQueue'
import { formatEmpRole } from '@/lib/clientDataSync'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// ── cleaners only ──
eq(['cleaner', 'supervisor', 'store_cleaner', 'crew_lead', undefined].map(r => isSheetCleaner({ role: r as never })), [true, true, true, true, true], 'cleaners (incl. supervisor / store cleaner) are on the sheet')
eq(['csr', 'driver', 'technical', 'ducting'].map(r => isSheetCleaner({ role: r as never })), [false, false, false, false], 'CSR, driver and technical staff are not')
eq([isJobStaff({ role: 'csr' }), isJobStaff({ role: 'technical' })], [false, true], 'a CSR is never offered for a job')
const page = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq((page.match(/isSheetCleaner\(e\)/g) || []).length >= 2, true, 'staff suggestions and empty cleaner rows both use the rule')
eq(/csr\.has\(k\)/.test(readFileSync('src/components/dailyJobSheet/AddJobModal.tsx', 'utf8')), true, 'Add Job does not offer a CSR')
eq(/e\.role !== 'csr'/.test(readFileSync('src/pages/MyDuties.tsx', 'utf8')), true, 'a CSR has no duties')

// ── Short Name in the Staff column ──
const emps = [{ full_name: 'Uma Devi Rai', short_name: 'Uma' }, { full_name: 'Misbah Khan', short_name: '' }]
eq(shortStaffLabel('Uma Devi Rai', emps), 'Uma', 'short name shown')
eq(shortStaffLabel('Uma Devi Rai, Misbah Khan', emps), 'Uma, Misbah Khan', 'team: each short name; full name when none')
eq(shortStaffLabel('', emps), '', 'empty stays empty')
eq((page.match(/shortStaffLabel\(/g) || []).length >= 2, true, 'grid and block mode show short names')

// ── CSR role ──
const form = readFileSync('src/components/employees/EmployeeFormModal.tsx', 'utf8')
eq(/\{ value: 'csr', label: 'CSR' \}/.test(form), true, 'CSR in the Add Employee role list')
eq(formatEmpRole('csr'), 'CSR', 'shown as CSR')
eq(/<option value="csr">/.test(readFileSync('src/pages/Employees.tsx', 'utf8')), true, 'Employees role filter has CSR')

// ── Charges (hrs) typed and saved ──
eq(DEFAULT_COLUMN_DEFS.find(c => c.id === 'charges_per_hour')?.type, 'number', 'Charges (hrs) is a number you type')
eq([(SAVED_FIELDS as readonly string[]).includes('charges_per_hour'), NUMERIC_FIELDS.has('charges_per_hour')], [true, true], 'a change to it counts as a change to save')
eq(sanitizeOutboxPayload('daily_jobs', { charges_per_hour: 40, junk: 1 }), { charges_per_hour: 40 }, 'sent to Supabase')
eq((page.match(/charges_per_hour: \(cleanNum\((row|lead)\.charges_per_hour\) \|\| null\)/g) || []).length, 2, 'saved for single and team rows; empty clears it')
const sql = readdirSync('supabase/migrations').map(f => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
eq(/alter table public\.daily_jobs add column if not exists charges_per_hour numeric/.test(sql), true, 'column for the typed value')
