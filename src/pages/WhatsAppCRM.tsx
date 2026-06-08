import { MessageCircle, Zap, Users, BarChart3 } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

export function WhatsAppCRM() {
  return (
    <div className="space-y-6">
      <PageHero
        title="WhatsApp CRM"
        subtitle="Client communication and automated messaging — coming soon"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Main Coming Soon Card */}
        <div className="md:col-span-2 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-[22px] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-6">
            <MessageCircle size={40} className="text-white" />
          </div>
          <h2 className="text-[28px] font-bold text-emerald-900 mb-3">WhatsApp CRM Coming Soon</h2>
          <p className="text-emerald-700 mb-6">
            We're building a powerful WhatsApp integration to manage all your client communications in one place.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full text-[12px] font-semibold">
            <Zap size={14} /> Expected Q4 2026
          </div>
        </div>

        {/* Feature Cards */}
        {[
          {
            icon: MessageCircle,
            title: 'Unified Inbox',
            description: 'Manage all WhatsApp conversations from your team in one dashboard',
          },
          {
            icon: Zap,
            title: 'Auto Responses',
            description: 'Set up automatic replies for common questions and booking requests',
          },
          {
            icon: Users,
            title: 'Contact Management',
            description: 'Link WhatsApp chats directly to client profiles for context',
          },
          {
            icon: BarChart3,
            title: 'Analytics',
            description: 'Track response times, engagement rates, and client satisfaction',
          },
        ].map((feature, i) => (
          <div
            key={i}
            className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <feature.icon size={24} className="text-emerald-600" />
              </div>
              <h3 className="text-[16px] font-bold text-[#111827]">{feature.title}</h3>
            </div>
            <p className="text-[13px] text-slate-600">{feature.description}</p>
          </div>
        ))}
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-[22px] p-6">
        <p className="text-[13px] text-blue-800 font-semibold mb-2">What You Can Do Now</p>
        <ul className="space-y-2 text-[12px] text-blue-700">
          <li>✓ Set up WhatsApp Business Account in Settings → Integrations</li>
          <li>✓ Generate API credentials from Meta Business Manager</li>
          <li>✓ Connect your phone number to the dashboard</li>
        </ul>
      </div>
    </div>
  )
}
