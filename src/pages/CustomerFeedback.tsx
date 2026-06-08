import { MessageSquare, Star, TrendingUp, CheckCircle } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

export function CustomerFeedback() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Customer Feedback Forms"
        subtitle="Post-service surveys and quality feedback — coming soon"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-[22px] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-500 flex items-center justify-center mx-auto mb-6">
            <MessageSquare size={40} className="text-white" />
          </div>
          <h2 className="text-[28px] font-bold text-amber-900 mb-3">Feedback Forms Coming Soon</h2>
          <p className="text-amber-700 mb-6">
            Automatically send post-service surveys to collect customer feedback and improve quality.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-full text-[12px] font-semibold">
            <Star size={14} /> Expected Q4 2026
          </div>
        </div>

        {[
          {
            icon: Star,
            title: 'Star Ratings',
            description: '1-5 star ratings for service quality and crew professionalism',
          },
          {
            icon: MessageSquare,
            title: 'Feedback Surveys',
            description: 'Customizable survey questions specific to your services',
          },
          {
            icon: TrendingUp,
            title: 'Quality Analytics',
            description: 'Track average ratings and identify improvement areas',
          },
          {
            icon: CheckCircle,
            title: 'Issue Resolution',
            description: 'Flag low ratings for follow-up and resolution',
          },
        ].map((feature, i) => (
          <div
            key={i}
            className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                <feature.icon size={24} className="text-amber-600" />
              </div>
              <h3 className="text-[16px] font-bold text-[#111827]">{feature.title}</h3>
            </div>
            <p className="text-[13px] text-slate-600">{feature.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
