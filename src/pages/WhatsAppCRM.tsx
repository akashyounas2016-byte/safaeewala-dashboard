import { MessageSquare, Zap, Clock, Bell, Send, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

export function WhatsAppCRM() {
  return (
    <div className="space-y-6">
      {/* ── Page Hero ── */}
      <PageHero
        title="WhatsApp CRM"
        subtitle="Direct client messaging, automated booking alerts, and conversational workflows"
        statusChip="Coming Soon"
        showSearch={false}
      />

      {/* ── Main Coming Soon Showcase Card ── */}
      <div className="bg-white rounded-[26px] border border-[#E4E8EC] shadow-[0_4px_24px_rgba(15,23,42,0.06)] overflow-hidden">
        {/* Top Accent Gradient Header Banner */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-8 py-10 text-white relative">
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400 text-amber-950 text-[11px] font-extrabold uppercase tracking-wider mb-4 shadow-sm">
              <Sparkles size={13} />
              <span>Coming Soon</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Safaeewala WhatsApp CRM & Automation Hub
            </h2>
            <p className="text-emerald-100 text-[13.5px] sm:text-[14px] mt-2 leading-relaxed">
              We are building a seamless WhatsApp Business API integration tailored for Safaeewala LLC. Connect directly with clients, automate booking confirmations, and dispatch job status updates in real-time.
            </p>
          </div>
        </div>

        {/* Inner Content Area */}
        <div className="p-6 sm:p-8 space-y-8">
          {/* Status Tracker Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-600/30">
                <MessageSquare size={20} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-slate-800">Module Architecture Phase</p>
                <p className="text-[11.5px] text-slate-500">Scheduled for full deployment in the next release update</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[12px] font-bold text-emerald-800">Under Active Development</span>
            </div>
          </div>

          {/* Upcoming Features Grid */}
          <div>
            <h3 className="text-[15px] font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              <span>What’s Coming to WhatsApp CRM</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  icon: MessageSquare,
                  color: 'text-emerald-600',
                  bg: 'bg-emerald-50',
                  title: 'Two-Way Live Chat',
                  desc: 'Read and reply to customer inquiries directly from your dashboard without checking multiple phones.',
                  badge: 'Direct Inbox',
                },
                {
                  icon: Bell,
                  color: 'text-teal-600',
                  bg: 'bg-teal-50',
                  title: 'Instant Booking Alerts',
                  desc: 'Automatically send booking confirmations, crew arrival times, and completion notices to customers.',
                  badge: 'Automated',
                },
                {
                  icon: Send,
                  color: 'text-indigo-600',
                  bg: 'bg-indigo-50',
                  title: 'Invoice Links & Reminders',
                  desc: 'Send digital invoice PDF links and payment reminders to clients with a single one-click dispatch.',
                  badge: 'Smart Billing',
                },
                {
                  icon: ShieldCheck,
                  color: 'text-sky-600',
                  bg: 'bg-sky-50',
                  title: 'Official Cloud API',
                  desc: 'Secure enterprise connection via Meta WhatsApp Cloud API with verified business identity badge.',
                  badge: 'Enterprise',
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="p-5 rounded-2xl border border-[#E4E8EC] bg-[#f8fafc]/50 hover:bg-white hover:shadow-md hover:border-emerald-200 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className={`w-9 h-9 rounded-xl ${feature.bg} ${feature.color} flex items-center justify-center`}>
                      <feature.icon size={18} />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {feature.badge}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-slate-800">{feature.title}</h4>
                    <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Notice Card */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-slate-400 shrink-0" />
              <p className="text-[12px] text-slate-600">
                Need to contact a lead immediately? You can already use the <strong className="text-slate-800">WhatsApp Quick Chat button</strong> inside the <strong className="text-slate-800">Fluent Forms</strong> and <strong className="text-slate-800">Clients</strong> screens.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E4E8EC] text-[11px] font-bold text-slate-700 shadow-xs shrink-0">
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span>Ready for Configuration</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
