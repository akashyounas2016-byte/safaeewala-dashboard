/**
 * UX-117: a cleaner sidebar — some screens are tabs of a parent screen instead of their own sidebar item:
 * Clients ⊃ Monthly Clients · Employees ⊃ Attendance · Expenses ⊃ Inventory · Reports ⊃ Analytics · Alerts ⊃ Complaints.
 * Each screen keeps its own route and its own permission in Roles & Access.
 */
export interface GroupTab { to: string; label: string }

export const MODULE_GROUPS: Record<string, GroupTab[]> = {
  '/clients': [{ to: '/clients', label: 'Clients' }, { to: '/monthly-clients', label: 'Monthly Clients' }],
  '/expenses': [{ to: '/expenses', label: 'Expenses' }, { to: '/inventory', label: 'Inventory' }],
  '/employees': [{ to: '/employees', label: 'Employees' }, { to: '/attendance', label: 'Attendance' }], // owner 2026-11-09
  '/reports': [{ to: '/reports', label: 'Reports' }, { to: '/analytics', label: 'Analytics' }],
  '/alerts': [{ to: '/alerts', label: 'Alerts' }, { to: '/complaints', label: 'Complaints' }],
}

/** Sidebar items that became tabs (no sidebar item of their own) */
export const MERGED_PATHS = Object.values(MODULE_GROUPS).flatMap(g => g.slice(1).map(t => t.to))

/** The group a path belongs to (parent key), or null */
export function groupOf(path: string): string | null {
  for (const [parent, tabs] of Object.entries(MODULE_GROUPS)) {
    if (tabs.some(t => path === t.to || path.startsWith(`${t.to}/`))) return parent
  }
  return null
}

/** Every path of a sidebar item (the item itself when it has no group) */
export const groupPaths = (to: string): string[] => (MODULE_GROUPS[to] || [{ to, label: '' }]).map(t => t.to)
