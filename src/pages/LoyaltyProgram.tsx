import { useState } from 'react'
import { Gift, TrendingUp, Award, Plus, Trash2 } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface LoyaltyMember {
  id: string
  name: string
  email: string
  points: number
  totalSpent: number
  joinDate: string
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
}

const tierBenefits = {
  bronze: { minSpent: 0, discount: '5%', benefits: ['5% discount on services', 'Birthday bonus 50 points'] },
  silver: { minSpent: 2000, discount: '10%', benefits: ['10% discount', 'Free service per year', 'Priority booking'] },
  gold: { minSpent: 5000, discount: '15%', benefits: ['15% discount', 'Free quarterly service', 'VIP support'] },
  platinum: { minSpent: 10000, discount: '20%', benefits: ['20% discount', 'Free monthly service', 'Personal account manager'] },
}

const defaultMembers: LoyaltyMember[] = [
  {
    id: '1',
    name: 'Ahmed Al Mansoori',
    email: 'ahmed@example.com',
    points: 850,
    totalSpent: 8500,
    joinDate: '2025-06-15',
    tier: 'gold',
  },
  {
    id: '2',
    name: 'Fatima Al Mazrouei',
    email: 'fatima@example.com',
    points: 1200,
    totalSpent: 12000,
    joinDate: '2024-12-20',
    tier: 'platinum',
  },
  {
    id: '3',
    name: 'Mohammed Al Ketbi',
    email: 'mohammed@example.com',
    points: 320,
    totalSpent: 1500,
    joinDate: '2026-03-10',
    tier: 'bronze',
  },
]

const getTierColor = (tier: LoyaltyMember['tier']) => {
  const colors = {
    bronze: 'bg-amber-100 text-amber-700',
    silver: 'bg-slate-100 text-slate-700',
    gold: 'bg-yellow-100 text-yellow-700',
    platinum: 'bg-purple-100 text-purple-700',
  }
  return colors[tier]
}

export function LoyaltyProgram() {
  const [members, setMembers] = useState<LoyaltyMember[]>(defaultMembers)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<LoyaltyMember>({
    id: '',
    name: '',
    email: '',
    points: 0,
    totalSpent: 0,
    joinDate: new Date().toISOString().split('T')[0],
    tier: 'bronze',
  })

  const handleAdd = () => {
    setFormData({
      id: Date.now().toString(),
      name: '',
      email: '',
      points: 0,
      totalSpent: 0,
      joinDate: new Date().toISOString().split('T')[0],
      tier: 'bronze',
    })
    setEditingId(null)
    setShowModal(true)
  }

  const handleSave = () => {
    if (!formData.name || !formData.email) {
      alert('Please fill required fields')
      return
    }
    if (editingId) {
      setMembers(m => m.map(x => x.id === editingId ? formData : x))
    } else {
      setMembers(m => [...m, formData])
    }
    setShowModal(false)
  }

  const handleDelete = (id: string) => {
    setMembers(m => m.filter(x => x.id !== id))
  }

  const stats = {
    total: members.length,
    totalPoints: members.reduce((sum, m) => sum + m.points, 0),
    avgSpent: members.length > 0 ? Math.round(members.reduce((sum, m) => sum + m.totalSpent, 0) / members.length) : 0,
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Loyalty Program"
        subtitle="Reward and retain your best customers"
        actionLabel="+ Add Member"
        onAction={handleAdd}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-[16px] p-5">
          <div className="flex items-center gap-3 mb-2">
            <Award size={18} className="text-emerald-600" />
            <p className="text-[12px] font-semibold text-emerald-700 uppercase">Members</p>
          </div>
          <p className="text-[28px] font-bold text-emerald-900">{stats.total}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-[16px] p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp size={18} className="text-blue-600" />
            <p className="text-[12px] font-semibold text-blue-700 uppercase">Total Points</p>
          </div>
          <p className="text-[28px] font-bold text-blue-900">{stats.totalPoints}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-[16px] p-5">
          <div className="flex items-center gap-3 mb-2">
            <Gift size={18} className="text-purple-600" />
            <p className="text-[12px] font-semibold text-purple-700 uppercase">Avg Spent</p>
          </div>
          <p className="text-[28px] font-bold text-purple-900">AED {stats.avgSpent}</p>
        </div>
      </div>

      {/* Tier Benefits */}
      <div>
        <h3 className="text-[16px] font-bold text-[#111827] mb-4">Tier Benefits</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(Object.keys(tierBenefits) as Array<keyof typeof tierBenefits>).map(tier => (
            <div
              key={tier}
              className={`${getTierColor(tier)} rounded-[16px] p-4 border border-current border-opacity-30`}
            >
              <p className="text-[14px] font-bold capitalize mb-2">{tier} Tier</p>
              <p className="text-[11px] opacity-75 mb-3">Spent: AED {tierBenefits[tier].minSpent}+</p>
              <ul className="space-y-1">
                {tierBenefits[tier].benefits.map((benefit, i) => (
                  <li key={i} className="text-[11px] flex items-start gap-2">
                    <span className="mt-0.5">✓</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Members List */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-slate-50">
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Name</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Email</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Tier</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Points</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Total Spent</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Joined</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <tr key={member.id} className="border-b border-[#E4E8EC] hover:bg-slate-50">
                  <td className="px-6 py-4 text-[13px] font-semibold text-[#111827]">{member.name}</td>
                  <td className="px-6 py-4 text-[12px] text-slate-600">{member.email}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-[11px] font-bold px-3 py-1 rounded-full capitalize ${getTierColor(member.tier)}`}>
                      {member.tier}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-[13px] font-semibold">{member.points}</td>
                  <td className="px-6 py-4 text-center text-[13px] font-semibold text-emerald-600">AED {member.totalSpent}</td>
                  <td className="px-6 py-4 text-center text-[12px] text-slate-600">
                    {new Date(member.joinDate).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 flex justify-center gap-2">
                    <button
                      onClick={() => handleDelete(member.id)}
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

      {/* Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Add Loyalty Member"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <Input
            label="Total Spent (AED)"
            type="number"
            value={formData.totalSpent}
            onChange={e => setFormData({ ...formData, totalSpent: parseFloat(e.target.value) })}
          />
          <Input
            label="Points"
            type="number"
            value={formData.points}
            onChange={e => setFormData({ ...formData, points: parseInt(e.target.value) })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Member</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
