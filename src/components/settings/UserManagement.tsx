import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, KeyRound, Pencil, Plus, Power, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { notify, confirmAsync } from '@/lib/notify'
import { useData } from '@/store/DataContext'
import { useAuth, useRolePerms, useSetRolePerms } from '@/store/UserContext'
import {
  ALL_MODULE_KEYS, ROLE_META, generatePassword, nextLoginId, passwordProblem, passwordStrength,
  type AppRole, type ModuleKey, type RolePerms,
} from '@/lib/permissions'

/** A login, as stored in public.profiles */
export interface UserProfile {
  id: string
  login_id: string
  email: string | null
  full_name: string
  role: AppRole
  employee_id: string | null
  status: 'active' | 'disabled'
  created_at: string
  last_login_at: string | null
}

/** Calls the admin endpoints on our server (the service key stays on the server) */
async function adminApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`/api/admin/users${path}`, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error || `Server error ${res.status}`)
  return json as T
}

const dubaiTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' }) : '—'

const inputCls = 'w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-white'
const labelCls = 'block text-[11.5px] font-bold text-slate-600 mb-1'

function StrengthMeter({ value }: { value: string }) {
  const score = passwordStrength(value)
  const problem = value ? passwordProblem(value) : null
  const colors = ['bg-rose-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600']
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? colors[score] : 'bg-slate-200'}`} />)}
      </div>
      <p className={`text-[11px] mt-1 ${problem ? 'text-rose-600' : 'text-emerald-700'}`}>
        {value ? (problem || 'Strong enough') : 'At least 10 characters with upper case, lower case and a number.'}
      </p>
    </div>
  )
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelCls}>Password</label>
      <div className="flex gap-2">
        <input value={value} onChange={e => onChange(e.target.value)} className={`${inputCls} font-mono`} autoComplete="new-password" spellCheck={false} />
        <button type="button" onClick={() => onChange(generatePassword())} title="Generate a strong password"
          className="px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"><RefreshCw size={14} /></button>
      </div>
      <StrengthMeter value={value} />
    </div>
  )
}

/** Shown once after creating a user or resetting a password */
function CredentialsCard({ loginId, password, onClose }: { loginId: string; password: string; onClose: () => void }) {
  const text = `Safaeewala CRM\nLogin ID: ${loginId}\nPassword: ${password}`
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-slate-600">Give these to the user. The password is not shown again — reset it if it is lost.</p>
      <div className="rounded-xl bg-slate-900 text-emerald-200 font-mono text-[13px] p-4 whitespace-pre">{text}</div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => { void navigator.clipboard.writeText(text); notify.success('Copied') }}
          className="px-3 py-2 rounded-xl border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><Copy size={13} /> Copy</button>
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-[12.5px] font-bold hover:bg-emerald-800 cursor-pointer">Done</button>
      </div>
    </div>
  )
}

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; user: UserProfile }
  | { kind: 'password'; user: UserProfile }
  | { kind: 'credentials'; loginId: string; password: string }
  | null

/** Settings → Users: only admins; there is no self sign-up (SEC-01) */
export function UsersAdminPanel() {
  const { user: me } = useAuth()
  const { employees } = useData()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ login_id: '', full_name: '', role: 'employee' as AppRole, employee_id: '', password: '', status: 'active' as 'active' | 'disabled' })

  // Bump to re-read the list from the server
  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(async () => { setReloadKey(k => k + 1) }, [])
  useEffect(() => {
    let alive = true
    adminApi<UserProfile[]>('')
      .then(rows => { if (alive) { setUsers(rows); setError(null) } },
            e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reloadKey])

  const employeeName = useMemo(() => new Map(employees.map(e => [e.id, e.full_name])), [employees])
  const linkedEmployeeIds = useMemo(() => new Set(users.map(u => u.employee_id).filter(Boolean)), [users])

  const openAdd = () => {
    setForm({ login_id: nextLoginId(users.map(u => u.login_id)), full_name: '', role: 'employee', employee_id: '', password: generatePassword(), status: 'active' })
    setDialog({ kind: 'add' })
  }
  const openEdit = (u: UserProfile) => {
    setForm({ login_id: u.login_id, full_name: u.full_name, role: u.role, employee_id: u.employee_id || '', password: '', status: u.status })
    setDialog({ kind: 'edit', user: u })
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { notify.error(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const submitAdd = () => run(async () => {
    const pw = passwordProblem(form.password)
    if (pw) { notify.error(pw); return }
    if (!form.full_name.trim()) { notify.error('Enter the name.'); return }
    await adminApi('', { method: 'POST', body: { login_id: form.login_id.trim(), full_name: form.full_name.trim(), role: form.role, employee_id: form.employee_id || null, password: form.password } })
    setDialog({ kind: 'credentials', loginId: form.login_id.trim(), password: form.password })
    await load()
  })

  const submitEdit = (u: UserProfile) => run(async () => {
    await adminApi(`/${u.id}`, { method: 'PATCH', body: { full_name: form.full_name, role: form.role, employee_id: form.employee_id || null, status: form.status } })
    notify.success(`${u.login_id} updated`)
    setDialog(null)
    await load()
  })

  const submitPassword = (u: UserProfile) => run(async () => {
    const pw = passwordProblem(form.password)
    if (pw) { notify.error(pw); return }
    await adminApi(`/${u.id}`, { method: 'PATCH', body: { password: form.password } })
    setDialog({ kind: 'credentials', loginId: u.login_id, password: form.password })
  })

  const toggleStatus = async (u: UserProfile) => {
    const next = u.status === 'active' ? 'disabled' : 'active'
    if (next === 'disabled') {
      const ok = await confirmAsync({ title: `Disable ${u.login_id}?`, message: `${u.full_name || u.login_id} will be signed out and cannot sign in until enabled again.`, confirmLabel: 'Disable', tone: 'danger' })
      if (!ok) return
    }
    await run(async () => {
      await adminApi(`/${u.id}`, { method: 'PATCH', body: { status: next } })
      notify.success(`${u.login_id} ${next === 'active' ? 'enabled' : 'disabled'}`)
      await load()
    })
  }

  const employeeSelect = (
    <div>
      <label className={labelCls}>Linked employee (optional)</label>
      <select value={form.employee_id} className={inputCls}
        onChange={e => {
          const id = e.target.value
          const emp = employees.find(x => x.id === id)
          setForm(f => ({ ...f, employee_id: id, full_name: emp && !f.full_name ? emp.full_name : f.full_name }))
        }}>
        <option value="">— Not an employee (office user) —</option>
        {employees.filter(e => e.status !== 'inactive').map(e => (
          <option key={e.id} value={e.id} disabled={linkedEmployeeIds.has(e.id) && e.id !== form.employee_id}>
            {e.full_name}{linkedEmployeeIds.has(e.id) && e.id !== form.employee_id ? ' (has a login)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
  const roleSelect = (lockSelf: boolean) => (
    <div>
      <label className={labelCls}>Role</label>
      <select value={form.role} disabled={lockSelf} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppRole }))} className={inputCls}>
        {(Object.keys(ROLE_META) as AppRole[]).map(r => <option key={r} value={r}>{ROLE_META[r].label} — {ROLE_META[r].desc}</option>)}
      </select>
      {lockSelf && <p className="text-[11px] text-slate-400 mt-1">You cannot change your own role.</p>}
    </div>
  )

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-700" /> Users & logins</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">Only an admin adds users — nobody can sign up. Each person gets their own Login ID; their role decides which screens they see.</p>
        </div>
        <button type="button" onClick={openAdd} disabled={!!error && !users.length}
          className="px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-[12.5px] font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer flex items-center gap-1.5">
          <UserPlus size={14} /> Add user
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-[12.5px] text-amber-900">
          {error} <button type="button" onClick={() => { setLoading(true); void load() }} className="underline font-bold ml-1 cursor-pointer">Try again</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-[#f8fafc] text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-6 py-2.5">Name</th>
              <th className="text-left px-3 py-2.5">Login ID</th>
              <th className="text-left px-3 py-2.5">Role</th>
              <th className="text-left px-3 py-2.5">Employee</th>
              <th className="text-left px-3 py-2.5">Status</th>
              <th className="text-left px-3 py-2.5">Last sign-in (Dubai)</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.id} className={u.status === 'disabled' ? 'opacity-60' : ''}>
                <td className="px-6 py-3 font-semibold text-slate-800">{u.full_name || '—'}{u.id === me?.id && <span className="ml-1.5 text-[10.5px] text-emerald-700">(you)</span>}</td>
                <td className="px-3 py-3 font-mono">{u.login_id}</td>
                <td className="px-3 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${ROLE_META[u.role]?.badge || ''}`}>{ROLE_META[u.role]?.label || u.role}</span></td>
                <td className="px-3 py-3 text-slate-600">{u.employee_id ? employeeName.get(u.employee_id) || 'Unknown employee' : '—'}</td>
                <td className="px-3 py-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${u.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{u.status === 'active' ? 'Active' : 'Disabled'}</span>
                </td>
                <td className="px-3 py-3 text-slate-500">{dubaiTime(u.last_login_at)}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-1 justify-end">
                    <button type="button" title="Edit" onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"><Pencil size={14} /></button>
                    <button type="button" title="Reset password" onClick={() => { setForm(f => ({ ...f, password: generatePassword() })); setDialog({ kind: 'password', user: u }) }} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"><KeyRound size={14} /></button>
                    {u.id !== me?.id && (
                      <button type="button" title={u.status === 'active' ? 'Disable' : 'Enable'} onClick={() => void toggleStatus(u)}
                        className={`p-1.5 rounded-lg cursor-pointer ${u.status === 'active' ? 'text-rose-500 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}><Power size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && !error && (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400">No users yet.</td></tr>
            )}
            {loading && <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400">Loading…</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={dialog?.kind === 'add'} onClose={() => setDialog(null)} title="Add user" size="md"
        headerActions={<button type="button" disabled={busy} onClick={() => void submitAdd()} className="px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white text-[12.5px] font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"><Plus size={13} /> Create</button>}>
        <div className="space-y-3.5">
          {employeeSelect}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Full name</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Login ID</label>
              <input value={form.login_id} onChange={e => setForm(f => ({ ...f, login_id: e.target.value.replace(/\s/g, '') }))} className={`${inputCls} font-mono`} />
            </div>
          </div>
          {roleSelect(false)}
          <PasswordField value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
        </div>
      </Modal>

      <Modal open={dialog?.kind === 'edit'} onClose={() => setDialog(null)} title={dialog?.kind === 'edit' ? `Edit ${dialog.user.login_id}` : ''} size="md"
        headerActions={dialog?.kind === 'edit' ? <button type="button" disabled={busy} onClick={() => void submitEdit(dialog.user)} className="px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white text-[12.5px] font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer">Save</button> : null}>
        {dialog?.kind === 'edit' && (
          <div className="space-y-3.5">
            <div>
              <label className={labelCls}>Full name</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} />
            </div>
            {employeeSelect}
            {roleSelect(dialog.user.id === me?.id)}
            <p className="text-[11.5px] text-slate-400">Login ID cannot be changed — create a new user instead.</p>
          </div>
        )}
      </Modal>

      <Modal open={dialog?.kind === 'password'} onClose={() => setDialog(null)} title={dialog?.kind === 'password' ? `New password for ${dialog.user.login_id}` : ''} size="sm"
        headerActions={dialog?.kind === 'password' ? <button type="button" disabled={busy} onClick={() => void submitPassword(dialog.user)} className="px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white text-[12.5px] font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer">Set password</button> : null}>
        <PasswordField value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
      </Modal>

      <Modal open={dialog?.kind === 'credentials'} onClose={() => setDialog(null)} title="Login details" size="sm">
        {dialog?.kind === 'credentials' && <CredentialsCard loginId={dialog.loginId} password={dialog.password} onClose={() => setDialog(null)} />}
      </Modal>
    </div>
  )
}

/** Settings → Roles & Access: which screens Manager and Employee may open (admin sees everything) */
export function RolePermissionsPanel() {
  const { user } = useAuth()
  const stored = useRolePerms()
  const setStored = useSetRolePerms()
  const [draft, setDraft] = useState<RolePerms>(stored)
  const [saving, setSaving] = useState(false)
  const isAdmin = user?.role === 'admin'
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)

  const toggle = (role: keyof RolePerms, mod: ModuleKey) =>
    setDraft(d => ({ ...d, [role]: d[role].includes(mod) ? d[role].filter(m => m !== mod) : [...d[role], mod] }))

  const save = async () => {
    setSaving(true)
    try {
      const { data } = await supabase.from('company_settings').select('data').eq('id', 1).maybeSingle()
      const current = (data?.data ?? {}) as Record<string, unknown>
      const { error } = await supabase.from('company_settings').upsert({ id: 1, data: { ...current, rolePermissions: draft } })
      if (error) throw error
      setStored(draft)
      notify.success('Screen permissions saved')
    } catch (e) {
      notify.error('Not saved: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-bold text-[#111827]">Roles & screen access</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">Tick the screens each role may open. Blocked screens disappear from the menu and their links show “No access”.</p>
        </div>
        {isAdmin && (
          <button type="button" disabled={!dirty || saving} onClick={() => void save()}
            className="px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-[12.5px] font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-[#f8fafc] text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-6 py-2.5">Screen</th>
              {(Object.keys(ROLE_META) as AppRole[]).map(r => <th key={r} className="px-3 py-2.5 text-center">{ROLE_META[r].label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ALL_MODULE_KEYS.map(mod => (
              <tr key={mod}>
                <td className="px-6 py-2.5 font-semibold text-slate-700">{mod}</td>
                <td className="px-3 py-2.5 text-center"><input type="checkbox" checked disabled className="w-4 h-4 accent-emerald-600" title="Admin always has every screen" /></td>
                {(['manager', 'employee'] as const).map(role => (
                  <td key={role} className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={draft[role].includes(mod)} disabled={!isAdmin} onChange={() => toggle(role, mod)} className="w-4 h-4 accent-emerald-600 cursor-pointer" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-6 py-3 text-[11.5px] text-slate-400 border-t border-slate-100">Deleting records is allowed for Admin and Manager only (enforced by the database). Users & roles are always admin-only.</p>
    </div>
  )
}
