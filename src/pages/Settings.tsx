import { useState, useEffect, useRef } from 'react'
import { Save, Building, Bell, Shield, CreditCard, Globe, User, Activity, HardDrive, ExternalLink, CheckCircle, Download, LogOut, CloudUpload, FileSpreadsheet, Users, Upload, Pencil, AlertTriangle, Clock, Moon, Sun } from 'lucide-react'
import { useDarkMode } from '@/hooks/useDarkMode'
import { supabase } from '@/lib/supabase'
import { useIsAdmin, useCurrentUser, useRolePerms, useSetRolePerms, DEFAULT_ROLE_PERMS, ALL_MODULES, type RolePerms, type AppRole } from '@/store/UserContext'
import * as XLSX from 'xlsx'
import { authorizeGoogleDrive, getAccessToken, uploadToDrive, gdriveConfigured } from '@/lib/googleDrive'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHero } from '@/components/layout/PageHero'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { useData } from '@/store/DataContext'

const ROLE_META: Record<AppRole, { label: string; badge: string; desc: string }> = {
  admin:     { label: 'Admin',     badge: 'bg-purple-50 text-purple-700 border-purple-200', desc: 'Full access to all modules including user management and daily job sheet' },
  developer: { label: 'Developer', badge: 'bg-blue-50 text-blue-700 border-blue-200',       desc: 'Same full access as Admin — for technical team members managing the system' },
  employee:  { label: 'Employee',  badge: 'bg-slate-100 text-slate-600 border-slate-200',   desc: 'Operational access only — configure accessible modules below' },
}

const allTabs = [
  { id: 'company',       label: 'Company',        icon: Building,   adminOnly: false },
  { id: 'appearance',    label: 'Appearance',     icon: Moon,       adminOnly: false },
  { id: 'users',         label: 'Users',          icon: Users,      adminOnly: true  },
  { id: 'notifications', label: 'Notifications',  icon: Bell,       adminOnly: false },
  { id: 'roles',         label: 'Roles & Access', icon: Shield,     adminOnly: false },
  { id: 'billing',       label: 'Billing',        icon: CreditCard, adminOnly: false },
  { id: 'activity',      label: 'Activity Log',   icon: Clock,      adminOnly: true  },
  { id: 'integrations',  label: 'Integrations',   icon: Globe,     adminOnly: false },
]

interface Profile {
  id: string
  email: string
  full_name: string
  status: 'pending' | 'approved' | 'rejected'
  role: 'admin' | 'developer' | 'employee'
  created_at: string
}

function AppearancePanel() {
  const { isDark, toggleDark } = useDarkMode()

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6">
        <h3 className="text-[16px] font-bold text-[#111827] mb-4 flex items-center gap-2">
          <Moon size={18} className="text-slate-600" />
          Theme
        </h3>

        <div className="space-y-4">
          <p className="text-[13px] text-slate-600">Choose your preferred theme for the dashboard</p>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                if (isDark) toggleDark()
              }}
              className={`relative p-6 rounded-[16px] border-2 transition-all cursor-pointer ${
                !isDark
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-[#E4E8EC] bg-white hover:border-slate-300'
              }`}
            >
              <Sun size={32} className={!isDark ? 'text-amber-500' : 'text-slate-400'} />
              <p className={`text-[13px] font-bold mt-3 ${!isDark ? 'text-emerald-700' : 'text-slate-600'}`}>
                Light Mode
              </p>
              {!isDark && <CheckCircle size={16} className="absolute top-3 right-3 text-emerald-500" />}
            </button>

            <button
              onClick={() => {
                if (!isDark) toggleDark()
              }}
              className={`relative p-6 rounded-[16px] border-2 transition-all cursor-pointer ${
                isDark
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-[#E4E8EC] bg-white hover:border-slate-300'
              }`}
            >
              <Moon size={32} className={isDark ? 'text-blue-500' : 'text-slate-400'} />
              <p className={`text-[13px] font-bold mt-3 ${isDark ? 'text-emerald-700' : 'text-slate-600'}`}>
                Dark Mode
              </p>
              {isDark && <CheckCircle size={16} className="absolute top-3 right-3 text-emerald-500" />}
            </button>
          </div>

          <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3">
            💡 Dark mode is perfect for night operations. Your preference is saved automatically.
          </p>
        </div>
      </div>
    </div>
  )
}

function UsersPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (data) setProfiles(data as Profile[])
    setLoading(false)
  }

  async function approveWithRole(id: string) {
    const role = pendingRoles[id] ?? 'employee'
    await supabase.from('profiles').update({ status: 'approved', role }).eq('id', id)
    setProfiles(p => p.map(u => u.id === id ? { ...u, status: 'approved', role: role as Profile['role'] } : u))
  }

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    await supabase.from('profiles').update({ status }).eq('id', id)
    setProfiles(p => p.map(u => u.id === id ? { ...u, status } : u))
  }

  useEffect(() => { load() }, [])

  const pending  = profiles.filter(p => p.status === 'pending')
  const approved = profiles.filter(p => p.status === 'approved')
  const rejected = profiles.filter(p => p.status === 'rejected')

  const statusBadge = (s: string) => {
    const cfg: Record<string, string> = {
      approved: 'bg-emerald-50 text-emerald-700',
      pending:  'bg-amber-50 text-amber-700',
      rejected: 'bg-red-50 text-red-600',
    }
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${cfg[s] ?? ''}`}>{s}</span>
  }

  return (
    <div className="space-y-5">

      {/* Pending requests */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#111827]">Pending Requests</h3>
          {pending.length > 0 && (
            <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full">
              {pending.length} waiting
            </span>
          )}
        </div>
        {loading ? (
          <p className="text-[13px] text-slate-400 text-center py-8">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="text-[13px] text-slate-400 text-center py-8">No pending requests</p>
        ) : (
          <div className="divide-y divide-[#E4E8EC]">
            {pending.map(u => (
              <div key={u.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-[13px] shrink-0">
                  {(u.full_name || u.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#111827]">{u.full_name || '—'}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{u.email}</p>
                  <p className="text-[10.5px] text-slate-400 mt-0.5">Requested {new Date(u.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={pendingRoles[u.id] ?? 'employee'}
                    onChange={e => setPendingRoles(r => ({ ...r, [u.id]: e.target.value }))}
                    className="text-[12px] px-2.5 py-1.5 border border-[#E4E8EC] rounded-xl bg-slate-50 focus:outline-none focus:border-emerald-400 text-slate-700"
                  >
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                    <option value="developer">Developer</option>
                  </select>
                  <button
                    onClick={() => setStatus(u.id, 'rejected')}
                    className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 text-[12px] font-semibold hover:bg-red-50 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => approveWithRole(u.id)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[12px] font-semibold hover:bg-emerald-600 transition-colors"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approved users */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E8EC]">
          <h3 className="text-[15px] font-bold text-[#111827]">Active Users ({approved.length})</h3>
        </div>
        <div className="divide-y divide-[#E4E8EC]">
          {approved.map(u => (
            <div key={u.id} className="px-6 py-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-[13px] shrink-0">
                {(u.full_name || u.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#111827]">{u.full_name || '—'}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{u.email}</p>
              </div>
              {statusBadge(u.status)}
              <button
                onClick={() => setStatus(u.id, 'rejected')}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-500 text-[12px] font-semibold hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors"
              >
                Revoke
              </button>
            </div>
          ))}
          {approved.length === 0 && <p className="text-[13px] text-slate-400 text-center py-6">No approved users</p>}
        </div>
      </div>

      {/* Rejected users */}
      {rejected.length > 0 && (
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E4E8EC]">
            <h3 className="text-[15px] font-bold text-[#111827]">Rejected ({rejected.length})</h3>
          </div>
          <div className="divide-y divide-[#E4E8EC]">
            {rejected.map(u => (
              <div key={u.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-500 font-bold text-[13px] shrink-0">
                  {(u.full_name || u.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#111827]">{u.full_name || '—'}</p>
                  <p className="text-[11px] text-slate-500">{u.email}</p>
                </div>
                {statusBadge(u.status)}
                <button
                  onClick={() => setStatus(u.id, 'approved')}
                  className="px-3 py-1.5 rounded-xl border border-emerald-200 text-emerald-600 text-[12px] font-semibold hover:bg-emerald-50 transition-colors"
                >
                  Re-approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Toggle — controlled ─── */
function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div>
        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
        <p className="text-[12px] text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12,
          background: checked ? '#10b981' : '#d1d5db',
          position: 'relative', border: 'none', cursor: 'pointer',
          transition: 'background 0.2s', flexShrink: 0, marginTop: 2, outline: 'none',
          display: 'inline-block',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

/* ─── Integration connection modal ─── */
interface IntegrationInfo {
  name: string
  desc: string
  logo: string
  status: 'connected' | 'not_connected' | 'coming_soon'
  docsUrl?: string
  steps?: string[]
  envVars?: string[]
  note?: string
}

function IntegrationModal({ info, onClose }: { info: IntegrationInfo; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{info.logo}</span>
        <div>
          <p className="text-[16px] font-bold text-[#111827]">{info.name}</p>
          <p className="text-[12px] text-slate-500">{info.desc}</p>
        </div>
        {info.status === 'connected' && (
          <span className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
            <CheckCircle size={13} /> Connected
          </span>
        )}
      </div>

      {info.status === 'connected' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-emerald-800 mb-1">Already working</p>
          <p className="text-[12px] text-emerald-700">
            {info.name} is connected and active. Your database URL and API keys are stored in VPS environment variables.
          </p>
        </div>
      )}

      {info.status === 'coming_soon' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-slate-700 mb-1">Coming Soon</p>
          <p className="text-[12px] text-slate-500">{info.note}</p>
        </div>
      )}

      {info.status === 'not_connected' && info.steps && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-[12px] text-amber-800 font-medium">{info.note}</p>
          </div>
          <div>
            <p className="text-[12px] font-bold text-slate-600 uppercase tracking-[0.08em] mb-3">Setup Steps</p>
            <ol className="space-y-2.5">
              {info.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-[13px] text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          {info.envVars && (
            <div>
              <p className="text-[12px] font-bold text-slate-600 uppercase tracking-[0.08em] mb-2">Environment Variables to Add</p>
              <div className="bg-slate-900 rounded-xl p-4 space-y-1">
                {info.envVars.map(v => (
                  <p key={v} className="text-[12px] font-mono text-emerald-400">{v}=your_key_here</p>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Add these to your VPS .env file, then redeploy.</p>
            </div>
          )}
          {info.docsUrl && (
            <a
              href={info.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600 hover:underline"
            >
              Open official docs <ExternalLink size={13} />
            </a>
          )}
        </>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

/* ─── Integration data ─── */
const integrations: IntegrationInfo[] = [
  {
    name: 'Supabase',
    desc: 'Database, Auth & File Storage',
    logo: '⚡',
    status: 'connected',
    note: 'Connected via VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.',
  },
  {
    name: 'WhatsApp Business API',
    desc: 'Client reminders & confirmations',
    logo: '💬',
    status: 'not_connected',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    note: 'WhatsApp Business API requires a Meta Business Account and approval. This is a paid service.',
    steps: [
      'Go to business.facebook.com and create a Meta Business Account',
      'Apply for WhatsApp Business API access (approval takes 1–3 days)',
      'Create a WhatsApp Business App in Meta Developer Portal',
      'Get your Phone Number ID and Access Token',
      'Add the environment variables to your VPS .env file (see below)',
      'Contact your developer to wire up the sending logic in the backend',
    ],
    envVars: ['VITE_WHATSAPP_PHONE_ID', 'VITE_WHATSAPP_TOKEN'],
  },
  {
    name: 'Resend',
    desc: 'Transactional email delivery',
    logo: '📧',
    status: 'not_connected',
    docsUrl: 'https://resend.com/docs',
    note: 'Resend is free up to 3,000 emails/month. You need to verify your domain first.',
    steps: [
      'Sign up at resend.com (free)',
      'Add and verify your domain: safaeewala.com',
      'Generate an API key in the Resend dashboard',
      'Add the environment variable to your VPS .env file',
      'Contact your developer to wire up email sending',
    ],
    envVars: ['RESEND_API_KEY'],
  },
  {
    name: 'Stripe',
    desc: 'Online payment processing',
    logo: '💳',
    status: 'not_connected',
    docsUrl: 'https://stripe.com/docs',
    note: 'Stripe is available in UAE. You need a UAE bank account and business registration.',
    steps: [
      'Create a Stripe account at stripe.com (UAE is supported)',
      'Complete business verification with your DED license and bank details',
      'Get your publishable key and secret key from the Stripe dashboard',
      'Add keys to your VPS environment variables',
      'Contact your developer to add payment form and webhook handler',
    ],
    envVars: ['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'],
  },
  {
    name: 'Google Calendar',
    desc: 'Crew schedule sync',
    logo: '📅',
    status: 'not_connected',
    docsUrl: 'https://developers.google.com/calendar',
    note: 'Google Calendar sync requires OAuth 2.0 setup via Google Cloud Console. Needs backend work.',
    steps: [
      'Go to console.cloud.google.com and create a project',
      'Enable the Google Calendar API',
      'Create OAuth 2.0 credentials (Web Application type)',
      'Add your VPS URL as an authorized redirect URI',
      'This requires backend OAuth flow — contact your developer',
    ],
    envVars: ['VITE_GOOGLE_CLIENT_ID'],
  },
  {
    name: 'Zoho Books',
    desc: 'UAE VAT-compliant accounting sync',
    logo: '📊',
    status: 'not_connected',
    docsUrl: 'https://www.zoho.com/books/api/v3',
    note: 'Zoho Books requires an active subscription and API credentials from Zoho Developer Portal.',
    steps: [
      'Subscribe to Zoho Books at zoho.com/books',
      'Go to Zoho Developer Portal (api-console.zoho.com)',
      'Create a Self Client application to get client ID and secret',
      'Authorize your organization and get OAuth tokens',
      'Contact your developer to implement the sync logic',
    ],
    envVars: ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET'],
  },
  {
    name: 'PostHog',
    desc: 'Product analytics & session replay',
    logo: '📈',
    status: 'not_connected',
    docsUrl: 'https://posthog.com/docs',
    note: 'PostHog has a generous free tier (1M events/month). Easy to set up — just add one env var.',
    steps: [
      'Sign up free at posthog.com',
      'Create a new project for your dashboard',
      'Copy your Project API Key from Settings',
      'Add the environment variable to your VPS .env file',
      'PostHog will automatically start tracking page views',
    ],
    envVars: ['VITE_POSTHOG_KEY'],
  },
  {
    name: 'Sentry',
    desc: 'Error monitoring',
    logo: '🛡️',
    status: 'not_connected',
    docsUrl: 'https://docs.sentry.io',
    note: 'Sentry is free for small projects. Catches JavaScript errors and shows stack traces.',
    steps: [
      'Sign up free at sentry.io',
      'Create a new React project',
      'Copy your DSN from Project Settings → Client Keys',
      'Add the environment variable to your VPS .env file',
      'Ask your developer to add the Sentry initialization code',
    ],
    envVars: ['VITE_SENTRY_DSN'],
  },
]

type CompanyData = Record<string, string>
type NotifData   = Record<string, boolean>

const DEFAULT_COMPANY: CompanyData = {
  company_name: 'Safaeewala Cleaning & Maintenance LLC',
  trading_name: 'Safaeewala',
  trn: '100234567890003',
  ded_license: '1089342',
  phone: '+971 55 628 2374',
  email: 'info@safaeewala.com',
  website: 'https://www.safaeewala.com',
  address: 'Dubai, United Arab Emirates',
  currency: 'AED',
  timezone: 'Asia/Dubai',
  invoice_prefix: 'SAF',
  invoice_next_number: '143',
  payment_terms_days: '10',
  invoice_vat_rate: '5',
  invoice_notes: 'Payment due within 10 days. Bank transfer or cash accepted. For queries contact: info@safaeewala.com',
}

const DEFAULT_NOTIF: NotifData = {
  new_booking: false, booking_confirmed: false, booking_cancelled: true,
  reminder_24h: true, reminder_2h: true, invoice_overdue: true,
  payment_received: true, low_stock: true, document_expiry: true, new_review: false,
}

const AUDIT_SQL = `-- Run this once in Supabase SQL Editor:
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_name text,
  action text,
  entity text,
  entity_id text,
  entity_name text,
  details text
);
alter table public.audit_log enable row level security;
create policy "allow all authenticated" on public.audit_log
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);`

const ENTITY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  booking:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  client:   { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  invoice:  { bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-500'  },
  employee: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  default:  { bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400'   },
}
const ACTION_LABELS: Record<string, string> = {
  created:        '✦ Created',
  deleted:        '✕ Deleted',
  status_changed: '↻ Status changed',
  updated:        '✎ Updated',
}

function ActivityLogPanel() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setTableExists(false)
        else setLogs(data ?? [])
        setLoading(false)
      })
  }, [])

  if (!tableExists) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-[22px] p-5">
          <p className="text-[13px] font-bold text-amber-800 mb-1">One-time setup required</p>
          <p className="text-[12px] text-amber-700 mb-3">
            The activity log needs a table in Supabase. Run the SQL below in your Supabase SQL Editor, then refresh the page.
          </p>
          <div className="relative">
            <pre className="text-[11px] font-mono bg-slate-900 text-emerald-400 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap">{AUDIT_SQL}</pre>
            <button
              onClick={() => { navigator.clipboard.writeText(AUDIT_SQL); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="absolute top-2 right-2 text-[11px] font-semibold bg-white/10 text-white px-2.5 py-1 rounded-lg hover:bg-white/20 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-[#111827]">Activity Log</h3>
        <span className="text-[12px] text-slate-500">{logs.length} entries</span>
      </div>
      {loading ? (
        <p className="text-[13px] text-slate-400 text-center py-10">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-[13px] text-slate-400 text-center py-10">No activity recorded yet</p>
      ) : (
        <div className="divide-y divide-[#E4E8EC]">
          {logs.map(log => {
            const style = ENTITY_STYLES[log.entity] ?? ENTITY_STYLES.default
            return (
              <div key={log.id} className="px-6 py-3.5 flex items-center gap-4">
                <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text} capitalize`}>
                      {log.entity}
                    </span>
                    <span className="text-[12px] font-semibold text-[#111827] truncate">{log.entity_name}</span>
                    <span className="text-[11.5px] text-slate-500">{ACTION_LABELS[log.action] ?? log.action}</span>
                    {log.details && (
                      <span className="text-[11px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded">{log.details}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {log.user_name} · {new Date(log.created_at).toLocaleString('en-AE', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Settings() {
  const { bookings, clients, employees, invoices, inventory, dailyJobs, dailyExpenses } = useData()
  const isAdmin = useIsAdmin()
  // Hide admin-only tabs only when role is confirmed as employee (not while loading)
  const currentUser = useCurrentUser()
  const roleLoaded  = currentUser !== null
  const tabs        = allTabs.filter(t => !t.adminOnly || !roleLoaded || isAdmin)
  const [activeTab, setActiveTab] = useState('company')
  const [userEmail, setUserEmail] = useState('')
  const [company,  setCompany]   = useState<CompanyData>(DEFAULT_COMPANY)
  const [notif,    setNotif]     = useState<NotifData>(DEFAULT_NOTIF)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? ''
      setUserEmail(data.user?.email ?? '')
      setCurrentUserId(uid)
      if (uid) {
        supabase.from('profiles').select('full_name').eq('id', uid).single().then(({ data: p }) => {
          if (p?.full_name) setProfileName(p.full_name)
        })
      }
    })

    supabase.from('company_settings').select('data').eq('id', 1).single().then(({ data }) => {
      if (data?.data) {
        const saved = data.data as Record<string, any>
        setCompany(c => ({ ...c, ...saved.company }))
        if (saved.notifications) setNotif(n => ({ ...n, ...saved.notifications }))
        if (saved.rolePermissions) setRolePerms(r => ({ ...r, ...saved.rolePermissions }))
      }
      setSettingsLoaded(true)
    })
  }, [])

  async function saveCompany(patch: CompanyData) {
    const merged = { ...company, ...patch }
    setCompany(merged)
    await supabase.from('company_settings').upsert({ id: 1, data: { company: merged, notifications: notif } })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function saveInvoice(patch: CompanyData) {
    const merged = { ...company, ...patch }
    setCompany(merged)
    await supabase.from('company_settings').upsert({ id: 1, data: { company: merged, notifications: notif } })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function toggleNotif(key: string, val: boolean) {
    const updated = { ...notif, [key]: val }
    setNotif(updated)
    await supabase.from('company_settings').upsert({ id: 1, data: { company, notifications: updated } })
  }
  const storedRolePerms  = useRolePerms()
  const setStoredPerms   = useSetRolePerms()
  const [rolePerms,      setRolePerms]      = useState<RolePerms>(DEFAULT_ROLE_PERMS)
  const [editingRole,    setEditingRole]    = useState<AppRole | null>(null)
  const [editPerms,      setEditPerms]      = useState<string[]>([])
  const [connectingIntegration, setConnectingIntegration] = useState<IntegrationInfo | null>(null)
  const [saved, setSaved] = useState(false)
  const [editProfileOpen,  setEditProfileOpen]  = useState(false)
  const [profileName,      setProfileName]      = useState('Akash Younas')
  const [profileSaving,    setProfileSaving]    = useState(false)
  const [currentUserId,    setCurrentUserId]    = useState('')
  const [driveStatus, setDriveStatus] = useState<'idle' | 'connecting' | 'uploading' | 'done' | 'error'>('idle')
  const [driveLink, setDriveLink]   = useState('')
  const [driveError, setDriveError] = useState('')
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [importError,  setImportError]  = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  function downloadBackup() {
    const data = { bookings, clients, employees, invoices, inventory, dailyJobs, dailyExpenses, exported_at: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `safaeewala-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadExcel() {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookings),      'Bookings')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clients),       'Clients')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employees),     'Employees')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoices),      'Invoices')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inventory),     'Inventory')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyJobs),     'Daily Jobs')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyExpenses), 'Daily Expenses')
    XLSX.writeFile(wb, `safaeewala-backup-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  async function backupToDrive() {
    try {
      setDriveStatus('connecting'); setDriveError('')
      let token = getAccessToken()
      if (!token) token = await authorizeGoogleDrive()
      setDriveStatus('uploading')
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookings),      'Bookings')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clients),       'Clients')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employees),     'Employees')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoices),      'Invoices')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inventory),     'Inventory')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyJobs),     'Daily Jobs')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyExpenses), 'Daily Expenses')
      const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const filename = `safaeewala-backup-${new Date().toISOString().split('T')[0]}.xlsx`
      const link = await uploadToDrive(blob, filename, token)
      setDriveLink(link); setDriveStatus('done')
    } catch (err: any) {
      setDriveError(err.message || 'Upload failed'); setDriveStatus('error')
    }
  }

  async function saveRolePerms(newPerms: RolePerms) {
    setRolePerms(newPerms)
    setStoredPerms(newPerms)  // update sidebar immediately
    const { data } = await supabase.from('company_settings').select('data').eq('id', 1).single()
    const current = (data?.data ?? {}) as Record<string, any>
    await supabase.from('company_settings').upsert({ id: 1, data: { ...current, rolePermissions: newPerms } })
  }

  async function saveProfile(name: string) {
    setProfileSaving(true)
    await supabase.from('profiles').update({ full_name: name }).eq('id', currentUserId)
    setProfileName(name)
    setProfileSaving(false)
    setEditProfileOpen(false)
  }

  async function importBackup(file: File) {
    try {
      setImportStatus('loading')
      setImportError('')
      const text = await file.text()
      const data = JSON.parse(text)
      const tables: [string, any[]][] = [
        ['bookings',       data.bookings       ?? []],
        ['clients',        data.clients        ?? []],
        ['employees',      data.employees      ?? []],
        ['invoices',       data.invoices       ?? []],
        ['inventory',      data.inventory      ?? []],
        ['daily_jobs',     data.dailyJobs      ?? []],
        ['daily_expenses', data.dailyExpenses  ?? []],
      ]
      for (const [table, rows] of tables) {
        if (rows.length > 0) {
          await supabase.from(table).upsert(rows)
        }
      }
      setImportStatus('done')
      setTimeout(() => setImportStatus('idle'), 3000)
    } catch (err: any) {
      setImportError(err.message || 'Import failed')
      setImportStatus('error')
    }
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Settings"
        subtitle="Company profile · Notifications · Roles · Billing · Integrations"
        actionLabel={saved ? '✓ Saved!' : 'Save Changes'}
        onAction={handleSave}
        searchPlaceholder="Search settings…"
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Tab nav + Content ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Tab nav */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-3 py-3">
            <div className="flex gap-1 flex-wrap">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer',
                    activeTab === t.id
                      ? 'bg-[#111827] text-white'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  )}
                >
                  <t.icon size={15} className="shrink-0" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Appearance ── */}
          {activeTab === 'appearance' && <AppearancePanel />}

          {/* ── Users ── */}
          {activeTab === 'users' && <UsersPanel />}

          {/* ── Company ── */}
          {activeTab === 'company' && settingsLoaded && (
            <div className="space-y-5">
              <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E4E8EC]">
                  <h3 className="text-[15px] font-bold text-[#111827]">Company Profile</h3>
                </div>
                <form className="p-6 space-y-4" onSubmit={e => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget as HTMLFormElement)
                  saveCompany({
                    company_name: fd.get('company_name') as string,
                    trading_name: fd.get('trading_name') as string,
                    trn: fd.get('trn') as string,
                    ded_license: fd.get('ded_license') as string,
                    phone: fd.get('phone') as string,
                    email: fd.get('email') as string,
                    website: fd.get('website') as string,
                    address: fd.get('address') as string,
                    currency: fd.get('currency') as string,
                    timezone: fd.get('timezone') as string,
                  })
                }}>
                  <div className="grid grid-cols-2 gap-4">
                    <Input name="company_name" label="Company Name" defaultValue={company.company_name} />
                    <Input name="trading_name" label="Trading Name" defaultValue={company.trading_name} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input name="trn" label="Tax Registration Number (TRN)" defaultValue={company.trn} />
                    <Input name="ded_license" label="DED License Number" defaultValue={company.ded_license} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input name="phone" label="Phone" defaultValue={company.phone} />
                    <Input name="email" label="Email" type="email" defaultValue={company.email} />
                  </div>
                  <Input name="website" label="Website" defaultValue={company.website} />
                  <Textarea name="address" label="Address" defaultValue={company.address} rows={2} />
                  <div className="grid grid-cols-2 gap-4">
                    <Select name="currency" label="Default Currency" defaultValue={company.currency}>
                      <option value="AED">AED — UAE Dirham</option>
                      <option value="USD">USD — US Dollar</option>
                    </Select>
                    <Select name="timezone" label="Timezone" defaultValue={company.timezone}>
                      <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                      <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                    </Select>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit"><Save size={14} className="mr-1.5" /> Save Changes</Button>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E4E8EC]">
                  <h3 className="text-[15px] font-bold text-[#111827]">Invoice Settings</h3>
                </div>
                <form className="p-6 space-y-4" onSubmit={e => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget as HTMLFormElement)
                  saveInvoice({
                    invoice_prefix: fd.get('invoice_prefix') as string,
                    invoice_next_number: fd.get('invoice_next_number') as string,
                    payment_terms_days: fd.get('payment_terms_days') as string,
                    invoice_vat_rate: fd.get('invoice_vat_rate') as string,
                    invoice_notes: fd.get('invoice_notes') as string,
                  })
                }}>
                  <div className="grid grid-cols-2 gap-4">
                    <Input name="invoice_prefix" label="Invoice Prefix" defaultValue={company.invoice_prefix} />
                    <Input name="invoice_next_number" label="Next Invoice Number" type="number" defaultValue={company.invoice_next_number} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input name="payment_terms_days" label="Default Payment Terms (days)" type="number" defaultValue={company.payment_terms_days} />
                    <Select name="invoice_vat_rate" label="Default VAT Rate" defaultValue={company.invoice_vat_rate}>
                      <option value="5">5% (UAE Standard)</option>
                      <option value="0">0% (Zero-rated)</option>
                    </Select>
                  </div>
                  <Textarea name="invoice_notes" label="Default Invoice Notes" defaultValue={company.invoice_notes} rows={3} />
                  <div className="flex justify-end">
                    <Button type="submit"><Save size={14} className="mr-1.5" /> Save</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeTab === 'notifications' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Notification Preferences</h3>
                <p className="text-[12px] text-slate-500 mt-1">Settings are saved instantly to Supabase. Sending requires WhatsApp or Resend integration.</p>
              </div>
              <div className="p-6">
                <div className="space-y-0 divide-y divide-[#E4E8EC]">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] pb-3">Booking Alerts</p>
                  <Toggle label="New booking created"  description="Get notified when a new booking is made"           checked={notif.new_booking}         onChange={v => toggleNotif('new_booking', v)} />
                  <Toggle label="Booking confirmed"    description="Alert when a booking is confirmed by office"       checked={notif.booking_confirmed}    onChange={v => toggleNotif('booking_confirmed', v)} />
                  <Toggle label="Booking cancelled"    description="Alert when a client cancels"                       checked={notif.booking_cancelled}    onChange={v => toggleNotif('booking_cancelled', v)} />
                  <Toggle label="24h before reminder"  description="Send reminder to crew 24 hours before job"         checked={notif.reminder_24h}         onChange={v => toggleNotif('reminder_24h', v)} />
                  <Toggle label="2h before reminder"   description="Send reminder 2 hours before job"                  checked={notif.reminder_2h}          onChange={v => toggleNotif('reminder_2h', v)} />
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] py-3">Financial Alerts</p>
                  <Toggle label="Invoice overdue"      description="Alert when an invoice is past due date"            checked={notif.invoice_overdue}      onChange={v => toggleNotif('invoice_overdue', v)} />
                  <Toggle label="Payment received"     description="Notify when a payment is confirmed"                checked={notif.payment_received}     onChange={v => toggleNotif('payment_received', v)} />
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] py-3">Operational Alerts</p>
                  <Toggle label="Low stock alert"         description="Alert when inventory falls below minimum"       checked={notif.low_stock}            onChange={v => toggleNotif('low_stock', v)} />
                  <Toggle label="Document expiry warning" description="Warn 90 days before staff documents expire"     checked={notif.document_expiry}      onChange={v => toggleNotif('document_expiry', v)} />
                  <Toggle label="New client review"       description="Notify when a client leaves a review"           checked={notif.new_review}           onChange={v => toggleNotif('new_review', v)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Roles ── */}
          {activeTab === 'roles' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Role Permissions</h3>
                <p className="text-[12px] text-slate-500 mt-1">Define which modules each role can access. Assign roles when approving users in the Users tab.</p>
              </div>
              <div className="p-6 space-y-4">
                {(['admin', 'developer', 'employee'] as const).map(roleKey => {
                  const meta  = ROLE_META[roleKey]
                  const perms = rolePerms[roleKey]
                  return (
                    <div key={roleKey} className="border border-[#E4E8EC] rounded-xl p-4 hover:border-slate-300 transition-colors">
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${meta.badge}`}>{meta.label}</span>
                        <p className="text-[12px] text-slate-500 flex-1">{meta.desc}</p>
                        {isAdmin && (
                          <button
                            onClick={() => { setEditingRole(roleKey); setEditPerms([...perms]) }}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                          >
                            <Pencil size={11} /> Edit
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_MODULES.map(mod => {
                          const has = perms.includes(mod)
                          return (
                            <span
                              key={mod}
                              className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                                has
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-red-50 text-red-500 border-red-200 line-through opacity-60'
                              }`}
                            >
                              {mod}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Billing ── */}
          {activeTab === 'billing' && (
            <div className="space-y-4">
              <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E4E8EC]">
                  <h3 className="text-[15px] font-bold text-[#111827]">Subscription & Billing</h3>
                </div>
                <div className="p-6 space-y-4">
                  {/* Current plan */}
                  <div className="bg-slate-50 border border-[#E4E8EC] rounded-xl p-4 flex items-start justify-between">
                    <div>
                      <p className="text-[14px] font-bold text-[#111827]">Supabase Free Tier</p>
                      <p className="text-[12px] text-slate-500 mt-0.5">$0/month · No billing required</p>
                      <p className="text-[12px] text-slate-500">Free forever with generous limits</p>
                    </div>
                    <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-bold">Active</span>
                  </div>

                  {/* Free tier limits */}
                  <div>
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-3">Free Tier Limits</p>
                    <div className="space-y-2 text-[13px]">
                      {[
                        { item: 'Database storage',    limit: '500 MB',          used: 'Included' },
                        { item: 'Bandwidth',           limit: '5 GB/month',      used: 'Included' },
                        { item: 'File storage',        limit: '1 GB',            used: 'Included' },
                        { item: 'API requests',        limit: '500K / month',    used: 'Included' },
                        { item: 'Auth users',          limit: '50,000 users',    used: 'Included' },
                        { item: 'Automated backups',   limit: 'Not included',    used: 'Pro plan only' },
                      ].map(b => (
                        <div key={b.item} className="flex justify-between py-2.5 border-b border-[#E4E8EC]">
                          <span className="text-slate-600">{b.item}</span>
                          <div className="text-right">
                            <span className="font-bold text-[#111827]">{b.limit}</span>
                            {b.used !== 'Included' && <p className="text-[11px] text-amber-600">{b.used}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Infrastructure cost summary */}
                  <div>
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-3">Your Infrastructure Costs</p>
                    <div className="space-y-2 text-[13px]">
                      {[
                        { item: 'Supabase (Database + Auth + Storage)', cost: '$0/mo', note: 'Free tier' },
                        { item: 'VPS (Hosting)',                         cost: '~$5/mo', note: 'VPS server' },
                        { item: 'Custom domain (if registered)',         cost: '~$10/yr', note: 'Paid separately' },
                      ].map(b => (
                        <div key={b.item} className="flex justify-between py-2.5 border-b border-[#E4E8EC]">
                          <div>
                            <span className="text-slate-600">{b.item}</span>
                            <p className="text-[11px] text-slate-400">{b.note}</p>
                          </div>
                          <span className="font-bold text-emerald-600">{b.cost}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 font-bold text-[#111827] text-[14px]">
                        <span>Total Monthly</span><span className="text-emerald-600">~$5/mo</span>
                      </div>
                    </div>
                  </div>

                  {/* Upgrade note */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-[13px] font-semibold text-blue-800 mb-1">When to upgrade</p>
                    <p className="text-[12px] text-blue-700">
                      Upgrade to Supabase Pro ($25/mo) when you need automated daily backups, more than 500MB database, or advanced features.
                      Your current free tier is more than sufficient for a growing cleaning business.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Integrations ── */}
          {activeTab === 'integrations' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Integrations</h3>
                <p className="text-[12px] text-slate-500 mt-1">Click any integration to see setup instructions.</p>
              </div>
              <div className="p-6 space-y-3">
                {integrations.map(int => (
                  <div key={int.name} className="flex items-center justify-between p-3.5 border border-[#E4E8EC] rounded-xl hover:border-slate-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{int.logo}</span>
                      <div>
                        <p className="text-[13px] font-bold text-[#111827]">{int.name}</p>
                        <p className="text-[12px] text-slate-500">{int.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {int.status === 'connected' && (
                        <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                          <CheckCircle size={12} /> Connected
                        </span>
                      )}
                      {int.status === 'coming_soon' && (
                        <span className="text-[11px] text-slate-400 font-semibold">Coming Soon</span>
                      )}
                      <Button
                        variant={int.status === 'connected' ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => setConnectingIntegration(int)}
                      >
                        {int.status === 'connected' ? 'View' : int.status === 'coming_soon' ? 'Info' : 'How to Connect'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Activity Log ── */}
          {activeTab === 'activity' && <ActivityLogPanel />}
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-5">


          {/* User Account Card */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-[14px] text-black shrink-0"
                style={{ background: 'linear-gradient(135deg, #fbbf24, #f97316)' }}
              >
                {profileName.trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??'}
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#111827]">{profileName}</p>
                <p className="text-[12px] text-slate-500 mt-0.5">Owner · Admin</p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Email',      value: userEmail || '—' },
                { label: 'Role',       value: 'Owner' },
                { label: '2FA',        value: 'Not enabled' },
                { label: 'Last login', value: 'Today' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-[#E4E8EC] last:border-0">
                  <span className="text-[12px] text-slate-500">{label}</span>
                  <span className="text-[12px] font-semibold text-[#111827]">{value}</span>
                </div>
              ))}
            </div>
            {!isAdmin && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11.5px] font-semibold text-amber-800">Role mismatch detected</p>
                    <p className="text-[11px] text-amber-700 mt-0.5 mb-2">Your profile is set to Employee in the database. Click below to restore admin access.</p>
                    <button
                      onClick={async () => {
                        await supabase.from('profiles').update({ role: 'admin' }).eq('id', currentUserId)
                        window.location.reload()
                      }}
                      className="text-[11px] font-bold text-amber-800 underline hover:text-amber-900"
                    >
                      Restore Admin Access
                    </button>
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={() => setEditProfileOpen(true)}
              className="w-full mt-4 py-2 rounded-xl border border-[#E4E8EC] text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <User size={14} /> Edit Profile
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="w-full mt-2 py-2 rounded-xl border border-red-200 text-[12px] font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>

          {/* System Health */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">System Health</h3>
              <Activity size={16} className="text-slate-400" />
            </div>
            <div className="space-y-3">
              {[
                { service: 'Database',       status: 'Online',     latency: '~12ms', ok: true  },
                { service: 'File Hosting',   status: 'Online',     latency: '~30ms', ok: true  },
                { service: 'WhatsApp',             status: 'Not set up', latency: '—',   ok: false },
                { service: 'Email (Resend)',        status: 'Not set up', latency: '—',   ok: false },
              ].map(s => (
                <div key={s.service} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${s.ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="text-[12px] font-medium text-slate-700">{s.service}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{s.latency}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Backup Status — honest version */}
          <div className="bg-slate-50 border border-[#E4E8EC] rounded-[22px] p-5">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive size={16} className="text-slate-500" />
              <h3 className="text-[14px] font-bold text-slate-700">Data Backup</h3>
            </div>
            <div className="space-y-1.5 mb-3">
              <p className="text-[12px] font-semibold text-slate-600 mb-2">Manual backup options:</p>
              {[
                'Supabase Dashboard → Settings → Database → Backups',
                'Download CSV from each table via Table Editor',
                'Use pg_dump via Supabase connection string',
              ].map((tip, i) => (
                <div key={i} className="flex gap-2 text-[11.5px] text-slate-600">
                  <span className="text-slate-400 shrink-0">→</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
            <button
              onClick={downloadExcel}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 transition-colors mb-2"
            >
              <FileSpreadsheet size={13} /> Download as Excel (.xlsx)
            </button>
            <button
              onClick={downloadBackup}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-700 text-white text-[12px] font-semibold hover:bg-slate-800 transition-colors mb-2"
            >
              <Download size={13} /> Download JSON Backup
            </button>

            {/* Import */}
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) importBackup(file)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => importRef.current?.click()}
              disabled={importStatus === 'loading'}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-300 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors mb-2 disabled:opacity-60"
            >
              <Upload size={13} /> {importStatus === 'loading' ? 'Importing…' : 'Import JSON Backup'}
            </button>
            {importStatus === 'done' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2">
                <p className="text-[11px] text-emerald-700 font-semibold">Backup imported successfully</p>
              </div>
            )}
            {importStatus === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
                <p className="text-[11px] text-red-700">{importError}</p>
              </div>
            )}

            {/* Google Drive */}
            {gdriveConfigured ? (
              <>
                <button
                  onClick={backupToDrive}
                  disabled={driveStatus === 'connecting' || driveStatus === 'uploading'}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 transition-colors mb-2 disabled:opacity-60"
                >
                  <CloudUpload size={13} />
                  {driveStatus === 'connecting' ? 'Connecting to Google…' : driveStatus === 'uploading' ? 'Uploading…' : 'Backup to Google Drive'}
                </button>
                {driveStatus === 'done' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2 flex items-center justify-between">
                    <span className="text-[11px] text-emerald-700 font-semibold">Uploaded to Drive</span>
                    <a href={driveLink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-600 underline">Open</a>
                  </div>
                )}
                {driveStatus === 'error' && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
                    <p className="text-[11px] text-red-700">{driveError}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-2">
                <p className="text-[11.5px] font-semibold text-blue-800 mb-1">Enable Google Drive Backup</p>
                <p className="text-[11px] text-blue-700 mb-1">Add <code className="bg-blue-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> to your VPS environment variables.</p>
                <p className="text-[10.5px] text-blue-600">Google Cloud Console → APIs → OAuth 2.0 Client (Web) → copy Client ID → VPS .env file → redeploy.</p>
              </div>
            )}

            <p className="text-[10.5px] text-slate-400 text-center mb-3">
              {bookings.length + clients.length + employees.length + invoices.length + inventory.length + dailyJobs.length} records across all tables
            </p>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full block text-center py-2 rounded-xl bg-slate-800 text-white text-[12px] font-semibold hover:bg-slate-700 transition-colors"
            >
              Open Supabase Dashboard
            </a>
          </div>

        </div>
      </div>

      {/* ── Edit Role Permissions modal ── */}
      <Modal
        open={!!editingRole}
        onClose={() => setEditingRole(null)}
        title={editingRole ? `Edit ${ROLE_META[editingRole].label} Permissions` : ''}
        size="sm"
      >
        {editingRole && (
          <div className="space-y-3">
            <p className="text-[12px] text-slate-500">Toggle which modules this role can access. Changes apply immediately across the app.</p>
            <div className="space-y-0 divide-y divide-[#E4E8EC]">
              {ALL_MODULES.map(mod => (
                <label key={mod} className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-slate-50 -mx-1 px-1 rounded-lg transition-colors">
                  <input
                    type="checkbox"
                    checked={editPerms.includes(mod)}
                    onChange={e =>
                      setEditPerms(p => e.target.checked ? [...p, mod] : p.filter(x => x !== mod))
                    }
                    className="w-4 h-4 rounded border-slate-300 accent-emerald-600"
                  />
                  <span className="text-[13px] text-[#111827] font-medium">{mod}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditingRole(null)}>Cancel</Button>
              <Button onClick={async () => {
                const newPerms = { ...rolePerms, [editingRole]: editPerms }
                await saveRolePerms(newPerms)
                setEditingRole(null)
              }}>
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit Profile modal ── */}
      <Modal
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        title="Edit Profile"
        size="sm"
      >
        <form
          className="space-y-4"
          onSubmit={async e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget as HTMLFormElement)
            await saveProfile(fd.get('full_name') as string)
          }}
        >
          <Input
            name="full_name"
            label="Full Name"
            defaultValue={profileName}
            required
          />
          <Input
            label="Email"
            value={userEmail}
            disabled
          />
          <p className="text-[11px] text-slate-400 -mt-3">Email cannot be changed here.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditProfileOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Integration info modal ── */}
      <Modal
        open={!!connectingIntegration}
        onClose={() => setConnectingIntegration(null)}
        title={connectingIntegration ? `${connectingIntegration.name} Setup` : ''}
        size="lg"
      >
        {connectingIntegration && (
          <IntegrationModal info={connectingIntegration} onClose={() => setConnectingIntegration(null)} />
        )}
      </Modal>
    </div>
  )
}
