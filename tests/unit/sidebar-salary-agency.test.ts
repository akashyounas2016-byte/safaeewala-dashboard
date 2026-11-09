// UX-117 merged sidebar, R-SEC-08 salary permission, UX-118 agency documents, Leads (Website)
import { readFileSync } from 'node:fs'
import { MODULE_GROUPS, MERGED_PATHS, groupOf, groupPaths } from '@/lib/moduleGroups'
import { canAccessModule, DEFAULT_ROLE_PERMS, normalizeRolePerms } from '@/lib/permissions'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
eq(MERGED_PATHS.sort(), ['/analytics', '/complaints', '/inventory', '/monthly-clients'], 'Monthly Clients, Inventory, Analytics, Complaints are tabs')
eq([groupOf('/monthly-clients'), groupOf('/clients/c1'), groupOf('/inventory'), groupOf('/analytics'), groupOf('/complaints'), groupOf('/bookings')], ['/clients', '/clients', '/expenses', '/reports', '/alerts', null], 'each tab belongs to its parent')
eq(groupPaths('/alerts'), ['/alerts', '/complaints'], 'Alerts item covers Complaints')
eq(Object.keys(MODULE_GROUPS), ['/clients', '/expenses', '/reports', '/alerts'], 'four parent screens')

const side = readFileSync('src/components/layout/Sidebar.tsx', 'utf8')
eq(['/monthly-clients', '/inventory', '/analytics', '/complaints'].some(p => new RegExp(`\\{ to: '${p.replace('/', '\\/')}',`).test(side)), false, 'merged screens have no sidebar item')
eq(/label: 'Leads \(Website\)'/.test(side) && !/label: 'Fluent Forms'/.test(side), true, 'Fluent Forms is called Leads (Website)')
eq(/groupPaths\(item\.to\)\.some/.test(side), true, 'an item shows when any of its tabs is allowed')
eq(/<ModuleTabs \/>/.test(readFileSync('src/components/layout/Layout.tsx', 'utf8')), true, 'tabs shown above the merged screens')

// R-SEC-08
eq([canAccessModule('admin', DEFAULT_ROLE_PERMS, 'Salary'), canAccessModule('manager', DEFAULT_ROLE_PERMS, 'Salary'), canAccessModule('employee', DEFAULT_ROLE_PERMS, 'Salary')], [true, false, false], 'salary: Admin only by default')
const saved = normalizeRolePerms({ manager: ['Overview', 'Employees'], _modules: ['Overview', 'Employees'] })
eq(saved.manager.includes('Salary'), false, 'a saved role setting does not get Salary by itself')
eq(canAccessModule('manager', { ...DEFAULT_ROLE_PERMS, manager: [...DEFAULT_ROLE_PERMS.manager, 'Salary'] }, 'Salary'), true, 'Admin can give Salary to Manager')
for (const f of ['src/pages/Employees.tsx', 'src/pages/EmployeeProfile.tsx', 'src/components/agencies/AgencyDashboard.tsx']) {
  const s = readFileSync(f, 'utf8')
  eq(/useSalaryAccess\(\)/.test(s) && !/[^?] formatMonthlySalary\(emp\)\}/.test(s.replace(/seeSalary \? formatMonthlySalary\(emp\)/g, '')), true, `${f.split('/').pop()}: salary hidden without access`)
}
eq(/\{seeSalary && <div/.test(readFileSync('src/pages/Reports.tsx', 'utf8')), true, 'Reports: payroll only with salary access')
eq(/type="hidden" name="monthly_salary"/.test(readFileSync('src/components/employees/EmployeeFormModal.tsx', 'utf8')), true, 'employee form keeps the salary unseen')

// UX-118
const ag = readFileSync('src/components/agencies/AgencyDashboard.tsx', 'utf8')
eq(/License & Compliance Documents/.test(ag) || /Quick 4 Compliance Overview Metric Cards/.test(ag), false, 'old banner and its four cards removed')
eq(/const deleteDoc = async/.test(ag) && /title="Delete from this list"/.test(ag), true, 'version history has Delete (asks first)')
