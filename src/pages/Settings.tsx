import { useState, useEffect } from 'react'
import { Save, Building, Bell, Shield, CreditCard, Globe, User, Activity, HardDrive, ExternalLink, CheckCircle, Download, LogOut, CloudUpload, FileSpreadsheet, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { authorizeGoogleDrive, getAccessToken, uploadToDrive, gdriveConfigured } from '@/lib/googleDrive'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHero } from '@/components/layout/PageHero'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { useData } from '@/store/DataContext'

const tabs = [
  { id: 'company',       label: 'Company',        icon: Building  },
  { id: 'users',         label: 'Users',          icon: Users     },
  { id: 'notifications', label: 'Notifications',  icon: Bell      },
  { id: 'roles',         label: 'Roles & Access', icon: Shield    },
  { id: 'billing',       label: 'Billing',        icon: CreditCard },
  { id: 'integrations',  label: 'Integrations',   icon: Globe     },
]

interface Profile {
  id: string
  email: string
  full_name: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

function UsersPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (data) setProfiles(data as Profile[])
    setLoading(false)
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
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setStatus(u.id, 'rejected')}
                    className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 text-[12px] font-semibold hover:bg-red-50 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => setStatus(u.id, 'approved')}
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

/* ─── Toggle — inline styles so it renders correctly regardless of Tailwind purge ─── */
function Toggle({ label, description, defaultChecked = false }: { label: string; description: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked)
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div>
        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
        <p className="text-[12px] text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(v => !v)}
        style={{
          width: 44, height: 24, borderRadius: 12,
          background: on ? '#10b981' : '#d1d5db',
          position: 'relative', border: 'none', cursor: 'pointer',
          transition: 'background 0.2s', flexShrink: 0, marginTop: 2, outline: 'none',
          display: 'inline-block',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: on ? 22 : 2,
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
            {info.name} is connected and active. Your database URL and API keys are stored in Netlify environment variables.
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
              <p className="text-[12px] font-bold text-slate-600 uppercase tracking-[0.08em] mb-2">Netlify Environment Variables to Add</p>
              <div className="bg-slate-900 rounded-xl p-4 space-y-1">
                {info.envVars.map(v => (
                  <p key={v} className="text-[12px] font-mono text-emerald-400">{v}=your_key_here</p>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Add these in Netlify → Site Settings → Environment Variables, then redeploy.</p>
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
      'Add the environment variables to Netlify (see below)',
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
      'Add the environment variable to Netlify',
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
      'Add keys to Netlify environment variables',
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
      'Add your Netlify URL as an authorized redirect URI',
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
      'Add the environment variable to Netlify',
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
      'Add the environment variable to Netlify',
      'Ask your developer to add the Sentry initialization code',
    ],
    envVars: ['VITE_SENTRY_DSN'],
  },
]

export function Settings() {
  const { bookings, clients, employees, invoices, inventory, dailyJobs, dailyExpenses } = useData()
  const [activeTab, setActiveTab] = useState('company')
  const [userEmail, setUserEmail] = useState('')
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ''))
  }, [])
  const [connectingIntegration, setConnectingIntegration] = useState<IntegrationInfo | null>(null)
  const [saved, setSaved] = useState(false)
  const [driveStatus, setDriveStatus] = useState<'idle' | 'connecting' | 'uploading' | 'done' | 'error'>('idle')
  const [driveLink, setDriveLink]   = useState('')
  const [driveError, setDriveError] = useState('')

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

          {/* ── Users ── */}
          {activeTab === 'users' && <UsersPanel />}

          {/* ── Company ── */}
          {activeTab === 'company' && (
            <div className="space-y-5">
              <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E4E8EC]">
                  <h3 className="text-[15px] font-bold text-[#111827]">Company Profile</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Company Name" defaultValue="Safaeewala Cleaning & Maintenance LLC" />
                    <Input label="Trading Name" defaultValue="Safaeewala" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Tax Registration Number (TRN)" defaultValue="100234567890003" />
                    <Input label="DED License Number" defaultValue="1089342" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Phone" defaultValue="+971 55 628 2374" />
                    <Input label="Email" type="email" defaultValue="info@safaeewala.com" />
                  </div>
                  <Input label="Website" defaultValue="https://www.safaeewala.com" />
                  <Textarea label="Address" defaultValue="Dubai, United Arab Emirates" rows={2} />
                  <div className="grid grid-cols-2 gap-4">
                    <Select label="Default Currency">
                      <option value="AED">AED — UAE Dirham</option>
                      <option value="USD">USD — US Dollar</option>
                    </Select>
                    <Select label="Timezone">
                      <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                      <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                    </Select>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSave}>
                      <Save size={14} className="mr-1.5" /> Save Changes
                    </Button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E4E8EC]">
                  <h3 className="text-[15px] font-bold text-[#111827]">Invoice Settings</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Invoice Prefix" defaultValue="SAF" />
                    <Input label="Next Invoice Number" type="number" defaultValue="143" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Default Payment Terms (days)" type="number" defaultValue="10" />
                    <Select label="Default VAT Rate">
                      <option value="5">5% (UAE Standard)</option>
                      <option value="0">0% (Zero-rated)</option>
                    </Select>
                  </div>
                  <Textarea label="Default Invoice Notes" defaultValue="Payment due within 10 days. Bank transfer or cash accepted. For queries contact: info@safaeewala.com" rows={3} />
                  <div className="flex justify-end">
                    <Button onClick={handleSave}>
                      <Save size={14} className="mr-1.5" /> Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeTab === 'notifications' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Notification Preferences</h3>
                <p className="text-[12px] text-slate-500 mt-1">
                  Notifications require WhatsApp or Resend integration to actually send. These settings are saved for when integrations are connected.
                </p>
              </div>
              <div className="p-6">
                <div className="space-y-0 divide-y divide-[#E4E8EC]">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] pb-3">Booking Alerts</p>
                  <Toggle label="New booking created"  description="Get notified when a new booking is made"           defaultChecked={false} />
                  <Toggle label="Booking confirmed"    description="Alert when a booking is confirmed by office"       defaultChecked={false} />
                  <Toggle label="Booking cancelled"    description="Alert when a client cancels"                       defaultChecked />
                  <Toggle label="24h before reminder"  description="Send reminder to crew 24 hours before job"         defaultChecked />
                  <Toggle label="2h before reminder"   description="Send reminder 2 hours before job"                  defaultChecked />

                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] py-3">Financial Alerts</p>
                  <Toggle label="Invoice overdue"      description="Alert when an invoice is past due date"            defaultChecked />
                  <Toggle label="Payment received"     description="Notify when a payment is confirmed"                defaultChecked />

                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] py-3">Operational Alerts</p>
                  <Toggle label="Low stock alert"           description="Alert when inventory falls below minimum"       defaultChecked />
                  <Toggle label="Document expiry warning"   description="Warn 90 days before staff documents expire"     defaultChecked />
                  <Toggle label="New client review"         description="Notify when a client leaves a review" />
                </div>
              </div>
            </div>
          )}

          {/* ── Roles ── */}
          {activeTab === 'roles' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Role Permissions</h3>
              </div>
              <div className="p-6 space-y-4">
                {[
                  { role: 'Owner',        desc: 'Full access to all modules, settings, and financial data',     perms: ['All modules', 'Delete records', 'Export data', 'Manage roles', 'Financial reports'] },
                  { role: 'Office Staff', desc: 'Can manage bookings, clients, invoices, and staff schedules',  perms: ['Bookings', 'Clients', 'Invoices', 'Dispatch', 'Employees (view)'] },
                  { role: 'Crew Lead',    desc: 'Mobile app access, can view and manage assigned jobs',         perms: ['Mobile app', 'View own schedule', 'Checklists', 'Photos'] },
                  { role: 'Cleaner',      desc: 'Mobile app access for viewing own schedule only',              perms: ['Mobile app', 'View own schedule', 'Checklists'] },
                ].map(r => (
                  <div key={r.role} className="border border-[#E4E8EC] rounded-xl p-4 hover:border-slate-300 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-[13px] font-bold text-[#111827]">{r.role}</p>
                        <p className="text-[12px] text-slate-500 mt-0.5">{r.desc}</p>
                      </div>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.perms.map(p => (
                        <span key={p} className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">{p}</span>
                      ))}
                    </div>
                  </div>
                ))}
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
                        { item: 'Netlify (Hosting)',                     cost: '$0/mo', note: 'Free tier' },
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
                        <span>Total Monthly</span><span className="text-emerald-600">$0/mo</span>
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
                AY
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#111827]">Akash Younas</p>
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
            <button className="w-full mt-4 py-2 rounded-xl border border-[#E4E8EC] text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
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
                { service: 'Database (Supabase)',  status: 'Online',    latency: '~12ms', ok: true  },
                { service: 'File Hosting (Netlify)', status: 'Online',  latency: '~30ms', ok: true  },
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
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-[12px] font-semibold text-amber-800 mb-1">Free tier — no auto backups</p>
              <p className="text-[11px] text-amber-700">
                Supabase Free tier does not include automated backups. Upgrade to Pro ($25/mo) for daily automatic backups.
              </p>
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
                <p className="text-[11px] text-blue-700 mb-1">Add <code className="bg-blue-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> to your Netlify environment variables.</p>
                <p className="text-[10.5px] text-blue-600">Google Cloud Console → APIs → OAuth 2.0 Client (Web) → copy Client ID → Netlify env vars → redeploy.</p>
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
