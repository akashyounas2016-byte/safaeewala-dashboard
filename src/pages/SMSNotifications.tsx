import { MessageSquare, Send, Bell, BarChart3 } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

export function SMSNotifications() {
  return (
    <div className="space-y-6">
      <PageHero
        title="SMS Notifications"
        subtitle="Send automated appointment reminders and updates via SMS — coming soon"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-[22px] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-purple-500 flex items-center justify-center mx-auto mb-6">
            <MessageSquare size={40} className="text-white" />
          </div>
          <h2 className="text-[28px] font-bold text-purple-900 mb-3">SMS Notifications Coming Soon</h2>
          <p className="text-purple-700 mb-6">
            Send automatic SMS reminders, confirmations, and updates to keep your customers informed.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-full text-[12px] font-semibold">
            <Send size={14} /> Expected Q4 2026
          </div>
        </div>

        {[
          {
            icon: Bell,
            title: '24h & 2h Reminders',
            description: 'Automatic appointment reminders reduce no-shows by 40%',
          },
          {
            icon: Send,
            title: 'Booking Confirmations',
            description: 'Send instant SMS when customers book through your system',
          },
          {
            icon: MessageSquare,
            title: 'Crew Notifications',
            description: 'Alert your team about job details and schedule changes',
          },
          {
            icon: BarChart3,
            title: 'Analytics',
            description: 'Track SMS delivery rates and customer engagement',
          },
        ].map((feature, i) => (
          <div
            key={i}
            className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center">
                <feature.icon size={24} className="text-purple-600" />
              </div>
              <h3 className="text-[16px] font-bold text-[#111827]">{feature.title}</h3>
            </div>
            <p className="text-[13px] text-slate-600">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-[22px] p-6">
        <p className="text-[13px] text-blue-800 font-semibold mb-2">How It Works</p>
        <ul className="space-y-2 text-[12px] text-blue-700">
          <li>✓ Set up SMS reminders in Settings → Notifications</li>
          <li>✓ Configure reminder timing (24h before, 2h before, etc.)</li>
          <li>✓ Customize message templates</li>
          <li>✓ View delivery status and analytics</li>
        </ul>
      </div>
    </div>
  )
}
