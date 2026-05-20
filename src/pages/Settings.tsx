import { useState } from 'react'
import { Save, Building, Bell, Shield, CreditCard, Globe, User, Activity, HardDrive } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHero } from '@/components/layout/PageHero'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'company',       label: 'Company',        icon: Building  },
  { id: 'notifications', label: 'Notifications',  icon: Bell      },
  { id: 'roles',         label: 'Roles & Access', icon: Shield    },
  { id: 'billing',       label: 'Billing',        icon: CreditCard },
  { id: 'integrations',  label: 'Integrations',   icon: Globe     },
]

function Toggle({ label, description, defaultChecked = false }: { label: string; description: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked)
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div>
        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
        <p className="text-[12px] text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => setOn(!on)}
        className={cn(
          'w-11 rounded-full transition-colors duration-200 relative shrink-0 mt-0.5 cursor-pointer',
          on ? 'bg-emerald-500' : 'bg-slate-200'
        )}
        style={{ height: '24px' }}
      >
        <span
          className={cn(
            'absolute top-0.5 bg-white rounded-full shadow transition-transform duration-200',
            on ? 'translate-x-[22px]' : 'translate-x-0.5'
          )}
          style={{ width: '20px', height: '20px' }}
        />
      </button>
    </div>
  )
}

export function Settings() {
  const [activeTab, setActiveTab] = useState('company')

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Settings"
        subtitle="Company profile · Notifications · Roles · Billing · Integrations"
        actionLabel="Save Changes"
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

          {/* Tab content */}
          {activeTab === 'company' && (
            <div className="space-y-5">
              <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E4E8EC]">
                  <h3 className="text-[15px] font-bold text-[#111827]">Company Profile</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Company Name" defaultValue="Safaeewala Cleaning & Maintenance LLC" />
                    <Input label="Trading Name" defaultValue="Verdure Cleaning Co." />
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
                    <Button>
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
                    <Button>
                      <Save size={14} className="mr-1.5" /> Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Notification Preferences</h3>
              </div>
              <div className="p-6">
                <div className="space-y-0 divide-y divide-[#E4E8EC]">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] pb-3">Booking Alerts</p>
                  <Toggle label="New booking created"  description="Get notified when a new booking is made"         defaultChecked />
                  <Toggle label="Booking confirmed"    description="Alert when a booking is confirmed by office"     defaultChecked />
                  <Toggle label="Booking cancelled"    description="Alert when a client cancels"                     defaultChecked />
                  <Toggle label="24h before reminder"  description="Send reminder to crew 24 hours before job"       defaultChecked />
                  <Toggle label="2h before reminder"   description="Send reminder 2 hours before job"                defaultChecked />

                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] py-3">Financial Alerts</p>
                  <Toggle label="Invoice overdue"      description="Alert when an invoice is past due date"          defaultChecked />
                  <Toggle label="Payment received"     description="Notify when a payment is confirmed"              defaultChecked />

                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] py-3">Operational Alerts</p>
                  <Toggle label="Low stock alert"           description="Alert when inventory falls below minimum"         defaultChecked />
                  <Toggle label="Document expiry warning"   description="Warn 90 days before staff documents expire"       defaultChecked />
                  <Toggle label="New client review"         description="Notify when a client leaves a review" />
                </div>
              </div>
            </div>
          )}

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

          {activeTab === 'billing' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Subscription & Billing</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start justify-between">
                  <div>
                    <p className="text-[14px] font-bold text-emerald-800">Supabase Pro Plan</p>
                    <p className="text-[12px] text-emerald-700 mt-0.5">$25/month · Billed monthly</p>
                    <p className="text-[12px] text-emerald-700">Next billing: June 1, 2026</p>
                  </div>
                  <span className="text-[11px] bg-emerald-500 text-white px-2.5 py-1 rounded-full font-bold">Active</span>
                </div>
                <div className="space-y-2 text-[13px]">
                  {[
                    { item: 'Supabase Pro (Database + Auth + Storage)', cost: '$25/mo' },
                    { item: 'Resend (Email — free tier)',                cost: '$0/mo' },
                    { item: 'Shared Hosting (existing)',                 cost: 'Already paid' },
                  ].map(b => (
                    <div key={b.item} className="flex justify-between py-2.5 border-b border-[#E4E8EC]">
                      <span className="text-slate-600">{b.item}</span>
                      <span className="font-bold text-[#111827]">{b.cost}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 font-bold text-[#111827] text-[14px]">
                    <span>Total Monthly</span><span>~$25/mo</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E4E8EC]">
                <h3 className="text-[15px] font-bold text-[#111827]">Integrations</h3>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { name: 'Supabase',              desc: 'Database, Auth & File Storage',       status: 'connected',     logo: '⚡' },
                  { name: 'WhatsApp Business API', desc: 'Client reminders & confirmations',     status: 'not_connected', logo: '💬' },
                  { name: 'Resend',                desc: 'Transactional email delivery',         status: 'not_connected', logo: '📧' },
                  { name: 'Stripe',                desc: 'Online payment processing',            status: 'not_connected', logo: '💳' },
                  { name: 'Google Calendar',       desc: 'Crew schedule sync',                  status: 'not_connected', logo: '📅' },
                  { name: 'Zoho Books',            desc: 'UAE VAT-compliant accounting sync',   status: 'not_connected', logo: '📊' },
                  { name: 'PostHog',               desc: 'Product analytics & session replay',  status: 'not_connected', logo: '📈' },
                  { name: 'Sentry',                desc: 'Error monitoring',                    status: 'not_connected', logo: '🛡️' },
                ].map(int => (
                  <div key={int.name} className="flex items-center justify-between p-3.5 border border-[#E4E8EC] rounded-xl hover:border-slate-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{int.logo}</span>
                      <div>
                        <p className="text-[13px] font-bold text-[#111827]">{int.name}</p>
                        <p className="text-[12px] text-slate-500">{int.desc}</p>
                      </div>
                    </div>
                    <Button variant={int.status === 'connected' ? 'secondary' : 'outline'} size="sm">
                      {int.status === 'connected' ? 'Configure' : 'Connect'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar widgets ── */}
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
                { label: 'Email',    value: 'akash@safaeewala.com' },
                { label: 'Role',     value: 'Owner' },
                { label: '2FA',      value: 'Not enabled' },
                { label: 'Last login', value: 'Today, 9:24 AM' },
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
          </div>

          {/* System Health */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">System Health</h3>
              <Activity size={16} className="text-slate-400" />
            </div>
            <div className="space-y-3">
              {[
                { service: 'Database',     status: 'Online', latency: '12ms',  ok: true  },
                { service: 'Auth Server',  status: 'Online', latency: '8ms',   ok: true  },
                { service: 'File Storage', status: 'Online', latency: '45ms',  ok: true  },
                { service: 'Email (Resend)', status: 'Degraded', latency: '—', ok: false },
              ].map(s => (
                <div key={s.service} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="text-[12px] font-medium text-slate-700">{s.service}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{s.latency}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Backup Alert */}
          <div className="bg-amber-50 border border-amber-200 rounded-[22px] p-5">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive size={16} className="text-amber-600" />
              <h3 className="text-[14px] font-bold text-amber-800">Backup Status</h3>
            </div>
            <p className="text-[12px] text-amber-700 mb-3">
              Last backup: 2 days ago. Daily automatic backups are enabled via Supabase Pro.
            </p>
            <div className="space-y-1.5">
              {[
                { label: 'Database',    date: 'May 19, 2026', ok: true  },
                { label: 'Storage',     date: 'May 19, 2026', ok: true  },
                { label: 'Config',      date: 'May 17, 2026', ok: false },
              ].map(b => (
                <div key={b.label} className="flex items-center justify-between">
                  <span className="text-[12px] text-amber-800 font-medium">{b.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-amber-700">{b.date}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${b.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 py-2 rounded-xl bg-amber-600 text-white text-[12px] font-semibold hover:bg-amber-700 transition-colors">
              Run Backup Now
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
