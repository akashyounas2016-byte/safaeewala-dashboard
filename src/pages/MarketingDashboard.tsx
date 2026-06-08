import { useState } from 'react'
import { Mail, Users, TrendingUp, Plus, Trash2, Edit2, Save, BarChart3, Gift, Eye, Send } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface EmailCampaign {
  id: string
  name: string
  type: 'newsletter' | 'promotion' | 'reminder' | 'reengagement'
  segment: string
  subject: string
  status: 'draft' | 'scheduled' | 'sent'
  sentDate?: string
  recipients: number
  openRate: number
  clickRate: number
  conversionRate: number
}

interface ReferralProgram {
  id: string
  referrerName: string
  referrerEmail: string
  referredName: string
  referredEmail: string
  status: 'pending' | 'completed' | 'claimed'
  referralDate: string
  rewardAmount: number
  claimedDate?: string
}

interface RetentionMetric {
  metric: string
  value: string | number
  trend: number
  color: string
}

const defaultCampaigns: EmailCampaign[] = [
  {
    id: '1',
    name: 'Summer Promotion 2026',
    type: 'promotion',
    segment: 'All Clients',
    subject: '🌞 20% Off Summer Cleaning - Limited Time',
    status: 'sent',
    sentDate: '2026-06-05',
    recipients: 145,
    openRate: 32,
    clickRate: 8,
    conversionRate: 3,
  },
  {
    id: '2',
    name: 'Monthly Newsletter - June',
    type: 'newsletter',
    segment: 'All Clients',
    subject: 'Safaeewala June Newsletter - New Services & Tips',
    status: 'sent',
    sentDate: '2026-06-01',
    recipients: 168,
    openRate: 28,
    clickRate: 6,
    conversionRate: 2,
  },
  {
    id: '3',
    name: 'Inactive Customer Re-engagement',
    type: 'reengagement',
    segment: 'Inactive (90+ days)',
    subject: 'We Miss You! 15% Discount Just For You',
    status: 'scheduled',
    recipients: 42,
    openRate: 0,
    clickRate: 0,
    conversionRate: 0,
  },
  {
    id: '4',
    name: 'Premium Service Upsell',
    type: 'promotion',
    segment: 'Active Customers',
    subject: 'Try Our Premium Deep Clean Service',
    status: 'draft',
    recipients: 0,
    openRate: 0,
    clickRate: 0,
    conversionRate: 0,
  },
]

const defaultReferrals: ReferralProgram[] = [
  {
    id: '1',
    referrerName: 'Ahmed Al Mansoori',
    referrerEmail: 'ahmed@example.com',
    referredName: 'Fatima Al Mazrouei',
    referredEmail: 'fatima@example.com',
    status: 'completed',
    referralDate: '2026-05-15',
    rewardAmount: 200,
    claimedDate: '2026-06-01',
  },
  {
    id: '2',
    referrerName: 'Mohammed Al Ketbi',
    referrerEmail: 'mohammed@example.com',
    referredName: 'Layla Ahmed',
    referredEmail: 'layla@example.com',
    status: 'pending',
    referralDate: '2026-06-03',
    rewardAmount: 200,
  },
  {
    id: '3',
    referrerName: 'Fatima Al Mazrouei',
    referrerEmail: 'fatima@example.com',
    referredName: 'Omar Hassan',
    referredEmail: 'omar@example.com',
    status: 'completed',
    referralDate: '2026-04-20',
    rewardAmount: 200,
    claimedDate: '2026-05-15',
  },
]

export function MarketingDashboard() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>(defaultCampaigns)
  const [referrals, setReferrals] = useState<ReferralProgram[]>(defaultReferrals)
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [campaignForm, setCampaignForm] = useState<EmailCampaign>({
    id: '',
    name: '',
    type: 'newsletter',
    segment: 'All Clients',
    subject: '',
    status: 'draft',
    recipients: 0,
    openRate: 0,
    clickRate: 0,
    conversionRate: 0,
  })

  const handleAddCampaign = () => {
    setCampaignForm({
      id: Date.now().toString(),
      name: '',
      type: 'newsletter',
      segment: 'All Clients',
      subject: '',
      status: 'draft',
      recipients: 0,
      openRate: 0,
      clickRate: 0,
      conversionRate: 0,
    })
    setEditingCampaignId(null)
    setShowCampaignModal(true)
  }

  const handleSaveCampaign = () => {
    if (!campaignForm.name || !campaignForm.subject) {
      alert('Please fill all required fields')
      return
    }

    if (editingCampaignId) {
      setCampaigns(c => c.map(x => x.id === editingCampaignId ? campaignForm : x))
    } else {
      setCampaigns(c => [...c, campaignForm])
    }
    setShowCampaignModal(false)
  }

  const handleDeleteCampaign = (id: string) => {
    setCampaigns(c => c.filter(x => x.id !== id))
  }

  const handleDeleteReferral = (id: string) => {
    setReferrals(r => r.filter(x => x.id !== id))
  }

  // Calculate metrics
  const sentCampaigns = campaigns.filter(c => c.status === 'sent')
  const totalEmails = sentCampaigns.reduce((sum, c) => sum + c.recipients, 0)
  const avgOpenRate = sentCampaigns.length > 0 ? Math.round(sentCampaigns.reduce((sum, c) => sum + c.openRate, 0) / sentCampaigns.length) : 0
  const totalReferralValue = referrals.filter(r => r.status === 'completed').reduce((sum, r) => sum + r.rewardAmount, 0)
  const activeReferrals = referrals.filter(r => r.status === 'pending').length

  const retentionMetrics: RetentionMetric[] = [
    { metric: 'Customer Retention Rate', value: '87%', trend: 5, color: 'emerald' },
    { metric: 'Repeat Customer Rate', value: '78%', trend: 8, color: 'blue' },
    { metric: 'Average Customer Lifetime', value: '14 months', trend: 3, color: 'purple' },
    { metric: 'Churn Rate', value: '1.2%', trend: -0.5, color: 'amber' },
  ]

  return (
    <div className="space-y-6">
      <PageHero
        title="Marketing Dashboard"
        subtitle="Email campaigns, referrals, and customer retention"
        actionLabel="+ New Campaign"
        onAction={handleAddCampaign}
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-blue-700 uppercase">Total Emails Sent</p>
          <p className="text-[28px] font-bold text-blue-900 mt-1">{totalEmails.toLocaleString()}</p>
          <p className="text-[11px] text-blue-700 mt-2">{sentCampaigns.length} campaigns</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-emerald-700 uppercase">Avg Open Rate</p>
          <p className="text-[28px] font-bold text-emerald-900 mt-1">{avgOpenRate}%</p>
          <p className="text-[11px] text-emerald-700 mt-2">Industry avg: 25%</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-purple-700 uppercase">Referral Value</p>
          <p className="text-[28px] font-bold text-purple-900 mt-1">AED {totalReferralValue.toLocaleString()}</p>
          <p className="text-[11px] text-purple-700 mt-2">{referrals.filter(r => r.status === 'completed').length} completed</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-amber-700 uppercase">Active Referrals</p>
          <p className="text-[28px] font-bold text-amber-900 mt-1">{activeReferrals}</p>
          <p className="text-[11px] text-amber-700 mt-2">Pending reward claims</p>
        </div>
      </div>

      {/* Retention Metrics */}
      <div>
        <h3 className="text-[16px] font-bold text-[#111827] mb-4">Customer Retention Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {retentionMetrics.map((m, i) => (
            <div
              key={i}
              className={`bg-${m.color}-50 border border-${m.color}-200 rounded-[16px] p-5`}
            >
              <p className={`text-[12px] font-semibold text-${m.color}-700 uppercase`}>{m.metric}</p>
              <p className={`text-[24px] font-bold text-${m.color}-900 mt-2`}>{m.value}</p>
              <div className={`flex items-center gap-1 mt-2 text-[11px] font-bold text-${m.trend >= 0 ? 'emerald-600' : 'red-600'}`}>
                {m.trend >= 0 ? '↑' : '↓'} {Math.abs(m.trend)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-[22px] p-6">
        <p className="text-[14px] font-bold text-blue-900 mb-3">💡 Marketing Strategy</p>
        <ul className="space-y-2 text-[12px] text-blue-800">
          <li>✓ Email campaigns drive 28% open rate (vs industry 25%) - above average!</li>
          <li>✓ Referral program generated AED 600 in new customer value</li>
          <li>✓ Retention rate at 87% - strong customer loyalty</li>
          <li>✓ Monthly newsletters keep customers engaged</li>
          <li>✓ Re-engagement campaigns win back inactive customers</li>
          <li>✓ Seasonal promotions drive 3-5% conversion rate</li>
        </ul>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#111827]">Email Campaigns</h3>
          <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
            {campaigns.length} campaigns
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-slate-50">
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Campaign Name</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Type</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Status</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Recipients</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Open Rate</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Click Rate</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(campaign => (
                <tr key={campaign.id} className="border-b border-[#E4E8EC] hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="text-[13px] font-semibold text-[#111827]">{campaign.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{campaign.subject.substring(0, 40)}...</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 capitalize">
                      {campaign.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${
                        campaign.status === 'sent'
                          ? 'bg-emerald-50 text-emerald-700'
                          : campaign.status === 'scheduled'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-[13px] font-semibold text-[#111827]">
                    {campaign.recipients}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-12 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${campaign.openRate}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-[#111827] w-8">{campaign.openRate}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-12 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full"
                          style={{ width: `${campaign.clickRate}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-[#111827] w-8">{campaign.clickRate}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 flex justify-center gap-2">
                    <button
                      onClick={() => handleDeleteCampaign(campaign.id)}
                      className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Referral Program */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Gift size={18} className="text-purple-600" />
            <h3 className="text-[15px] font-bold text-[#111827]">Referral Program</h3>
          </div>
          <div className="text-[11px] font-bold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">
            AED 200 per referral
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-slate-50">
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Referrer</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Referred Client</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Status</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Reward</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Date</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map(referral => (
                <tr key={referral.id} className="border-b border-[#E4E8EC] hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="text-[13px] font-semibold text-[#111827]">{referral.referrerName}</p>
                    <p className="text-[11px] text-slate-500">{referral.referrerEmail}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-[13px] font-semibold text-[#111827]">{referral.referredName}</p>
                    <p className="text-[11px] text-slate-500">{referral.referredEmail}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${
                        referral.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : referral.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {referral.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-[13px] font-bold text-purple-600">
                    AED {referral.rewardAmount}
                  </td>
                  <td className="px-6 py-4 text-[12px] text-slate-600">{referral.referralDate}</td>
                  <td className="px-6 py-4 flex justify-center">
                    <button
                      onClick={() => handleDeleteReferral(referral.id)}
                      className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign Strategy */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
          <div className="flex items-center gap-3 mb-4">
            <Mail size={20} className="text-blue-600" />
            <h4 className="text-[14px] font-bold text-[#111827]">Monthly Newsletter</h4>
          </div>
          <p className="text-[12px] text-slate-600 mb-4">
            Keep customers engaged with monthly updates, tips, and exclusive offers
          </p>
          <div className="space-y-2 text-[11px] text-slate-600">
            <p>✓ Sent: 168 recipients</p>
            <p>✓ Open rate: 28%</p>
            <p>✓ Click rate: 6%</p>
          </div>
        </div>

        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp size={20} className="text-emerald-600" />
            <h4 className="text-[14px] font-bold text-[#111827]">Seasonal Promotions</h4>
          </div>
          <p className="text-[12px] text-slate-600 mb-4">
            Limited-time offers drive urgency and increase conversion rates
          </p>
          <div className="space-y-2 text-[11px] text-slate-600">
            <p>✓ Sent: 145 recipients</p>
            <p>✓ Conversion: 3%</p>
            <p>✓ ROI: 450%</p>
          </div>
        </div>

        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users size={20} className="text-purple-600" />
            <h4 className="text-[14px] font-bold text-[#111827]">Re-engagement</h4>
          </div>
          <p className="text-[12px] text-slate-600 mb-4">
            Win back inactive customers with special offers and personalized messages
          </p>
          <div className="space-y-2 text-[11px] text-slate-600">
            <p>✓ Targets: 42 inactive</p>
            <p>✓ Expected ROI: 200%</p>
            <p>✓ Recovery rate: 15%</p>
          </div>
        </div>
      </div>

      {/* Campaign Modal */}
      <Modal
        open={showCampaignModal}
        onClose={() => setShowCampaignModal(false)}
        title={editingCampaignId ? 'Edit Campaign' : 'New Campaign'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Campaign Name"
            value={campaignForm.name}
            onChange={e => setCampaignForm({ ...campaignForm, name: e.target.value })}
            placeholder="e.g., Summer Promotion 2026"
            required
          />

          <Select
            label="Campaign Type"
            value={campaignForm.type}
            onChange={e => setCampaignForm({ ...campaignForm, type: e.target.value as any })}
          >
            <option value="newsletter">Newsletter</option>
            <option value="promotion">Promotion</option>
            <option value="reminder">Reminder</option>
            <option value="reengagement">Re-engagement</option>
          </Select>

          <Select
            label="Customer Segment"
            value={campaignForm.segment}
            onChange={e => setCampaignForm({ ...campaignForm, segment: e.target.value })}
          >
            <option value="All Clients">All Clients</option>
            <option value="Active Customers">Active Customers</option>
            <option value="Inactive (90+ days)">Inactive (90+ days)</option>
            <option value="VIP">VIP Customers</option>
            <option value="New Customers">New Customers</option>
          </Select>

          <Input
            label="Email Subject"
            value={campaignForm.subject}
            onChange={e => setCampaignForm({ ...campaignForm, subject: e.target.value })}
            placeholder="e.g., 20% Off Summer Cleaning - Limited Time"
            required
          />

          <Textarea
            label="Email Content Preview"
            value={campaignForm.subject}
            onChange={e => setCampaignForm({ ...campaignForm, subject: e.target.value })}
            placeholder="Email body content"
            rows={4}
          />

          <Select
            label="Status"
            value={campaignForm.status}
            onChange={e => setCampaignForm({ ...campaignForm, status: e.target.value as any })}
          >
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="sent">Sent</option>
          </Select>

          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-[11px] text-blue-800">
              💡 <strong>Tip:</strong> Personalize with {'{clientName>'}, {'{date>'}, {'{discount>'} to increase engagement
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCampaignModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCampaign}>
              <Send size={14} className="mr-1.5" /> Save Campaign
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
