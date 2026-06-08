import { useState } from 'react'
import { Plus, Trash2, Edit2, Save, X, Power, Calendar, DollarSign, TrendingUp } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface RecurringContract {
  id: string
  clientName: string
  clientEmail: string
  serviceType: string
  frequency: 'weekly' | 'biweekly' | 'monthly'
  amount: number
  startDate: string
  renewalDate: string
  status: 'active' | 'paused' | 'cancelled'
  lastBilled: string
  nextBillingDate: string
}

const defaultContracts: RecurringContract[] = [
  {
    id: '1',
    clientName: 'Ahmed Al Mansoori',
    clientEmail: 'ahmed@example.com',
    serviceType: 'Weekly Villa Cleaning',
    frequency: 'weekly',
    amount: 300,
    startDate: '2025-12-15',
    renewalDate: '2026-12-15',
    status: 'active',
    lastBilled: '2026-06-07',
    nextBillingDate: '2026-06-14',
  },
  {
    id: '2',
    clientName: 'Fatima Al Mazrouei',
    clientEmail: 'fatima@example.com',
    serviceType: 'Bi-weekly Office Cleaning',
    frequency: 'biweekly',
    amount: 1200,
    startDate: '2026-01-10',
    renewalDate: '2027-01-10',
    status: 'active',
    lastBilled: '2026-06-05',
    nextBillingDate: '2026-06-19',
  },
  {
    id: '3',
    clientName: 'Mohammed Al Ketbi',
    clientEmail: 'mohammed@example.com',
    serviceType: 'Monthly Deep Clean',
    frequency: 'monthly',
    amount: 500,
    startDate: '2026-03-01',
    renewalDate: '2027-03-01',
    status: 'paused',
    lastBilled: '2026-06-01',
    nextBillingDate: '2026-07-01',
  },
]

const frequencyLabels = {
  weekly: 'Every Week',
  biweekly: 'Every 2 Weeks',
  monthly: 'Every Month',
}

const frequencyDays = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
}

export function RecurringSubscriptions() {
  const [contracts, setContracts] = useState<RecurringContract[]>(defaultContracts)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<RecurringContract>({
    id: '',
    clientName: '',
    clientEmail: '',
    serviceType: '',
    frequency: 'weekly',
    amount: 0,
    startDate: new Date().toISOString().split('T')[0],
    renewalDate: '',
    status: 'active',
    lastBilled: new Date().toISOString().split('T')[0],
    nextBillingDate: '',
  })

  const handleAdd = () => {
    const today = new Date().toISOString().split('T')[0]
    const nextBilling = new Date()
    nextBilling.setDate(nextBilling.getDate() + frequencyDays['weekly'])

    setFormData({
      id: Date.now().toString(),
      clientName: '',
      clientEmail: '',
      serviceType: '',
      frequency: 'weekly',
      amount: 0,
      startDate: today,
      renewalDate: '',
      status: 'active',
      lastBilled: today,
      nextBillingDate: nextBilling.toISOString().split('T')[0],
    })
    setEditingId(null)
    setShowModal(true)
  }

  const handleEdit = (contract: RecurringContract) => {
    setFormData({ ...contract })
    setEditingId(contract.id)
    setShowModal(true)
  }

  const handleSave = () => {
    if (!formData.clientName || !formData.serviceType || formData.amount <= 0) {
      alert('Please fill all required fields')
      return
    }

    // Calculate renewal date (1 year from start)
    const startDate = new Date(formData.startDate)
    const renewalDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate())

    const updatedFormData = {
      ...formData,
      renewalDate: renewalDate.toISOString().split('T')[0],
    }

    if (editingId) {
      setContracts(c => c.map(x => x.id === editingId ? updatedFormData : x))
    } else {
      setContracts(c => [...c, updatedFormData])
    }
    setShowModal(false)
  }

  const handleDelete = (id: string) => {
    setContracts(c => c.filter(x => x.id !== id))
  }

  const handleToggleStatus = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active'
    setContracts(c =>
      c.map(contract =>
        contract.id === id ? { ...contract, status: newStatus as 'active' | 'paused' } : contract
      )
    )
  }

  // Calculate metrics
  const activeCount = contracts.filter(c => c.status === 'active').length
  const monthlyRecurringRevenue = contracts
    .filter(c => c.status === 'active')
    .reduce((sum, c) => {
      const monthlyAmount = c.frequency === 'weekly' ? c.amount * 4.33 : c.frequency === 'biweekly' ? c.amount * 2.17 : c.amount
      return sum + monthlyAmount
    }, 0)

  const nextBillingTotal = contracts
    .filter(c => c.status === 'active' && new Date(c.nextBillingDate) <= new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000))
    .reduce((sum, c) => sum + c.amount, 0)

  return (
    <div className="space-y-6">
      <PageHero
        title="Recurring Subscriptions"
        subtitle="Manage recurring cleaning contracts and auto-billing"
        actionLabel="+ New Contract"
        onAction={handleAdd}
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-emerald-700 uppercase">Active Contracts</p>
          <p className="text-[28px] font-bold text-emerald-900 mt-1">{activeCount}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-blue-700 uppercase">Monthly Recurring Revenue</p>
          <p className="text-[22px] font-bold text-blue-900 mt-1">AED {Math.round(monthlyRecurringRevenue)}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-purple-700 uppercase">Next 7 Days Billing</p>
          <p className="text-[22px] font-bold text-purple-900 mt-1">AED {nextBillingTotal}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-slate-700 uppercase">Annual Value</p>
          <p className="text-[22px] font-bold text-slate-900 mt-1">AED {Math.round(monthlyRecurringRevenue * 12)}</p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-[22px] p-6">
        <p className="text-[14px] font-bold text-emerald-900 mb-3">How Recurring Subscriptions Work</p>
        <ul className="space-y-2 text-[12px] text-emerald-800">
          <li>✓ Create weekly, bi-weekly, or monthly contracts with clients</li>
          <li>✓ Auto-generate invoices on each billing date</li>
          <li>✓ Track revenue and predict monthly income</li>
          <li>✓ Pause or cancel contracts anytime</li>
          <li>✓ Auto-renewal on contract anniversary</li>
        </ul>
      </div>

      {/* Contracts Table */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-slate-50">
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Client</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Service</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Frequency</th>
                <th className="px-6 py-4 text-right text-[12px] font-bold text-slate-600 uppercase">Amount</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Next Billing</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Status</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map(contract => (
                <tr key={contract.id} className="border-b border-[#E4E8EC] hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="text-[13px] font-semibold text-[#111827]">{contract.clientName}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{contract.clientEmail}</p>
                  </td>
                  <td className="px-6 py-4 text-[13px] text-slate-600">{contract.serviceType}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                      {frequencyLabels[contract.frequency]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-[13px] font-semibold text-emerald-600">
                    AED {contract.amount}
                  </td>
                  <td className="px-6 py-4 text-center text-[12px] text-slate-600">
                    <div className="flex items-center justify-center gap-1">
                      <Calendar size={12} />
                      {contract.nextBillingDate}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${
                        contract.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {contract.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 flex justify-center gap-2">
                    <button
                      onClick={() => handleToggleStatus(contract.id, contract.status)}
                      className={`p-2 rounded-lg transition-colors ${
                        contract.status === 'active'
                          ? 'hover:bg-amber-100 text-amber-600'
                          : 'hover:bg-emerald-100 text-emerald-600'
                      }`}
                      title={contract.status === 'active' ? 'Pause' : 'Activate'}
                    >
                      <Power size={14} />
                    </button>
                    <button
                      onClick={() => handleEdit(contract)}
                      className="p-2 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(contract.id)}
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
        title={editingId ? 'Edit Contract' : 'New Recurring Contract'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Client Name"
            value={formData.clientName}
            onChange={e => setFormData({ ...formData, clientName: e.target.value })}
            placeholder="e.g., Ahmed Al Mansoori"
            required
          />
          <Input
            label="Client Email"
            type="email"
            value={formData.clientEmail}
            onChange={e => setFormData({ ...formData, clientEmail: e.target.value })}
            placeholder="ahmed@example.com"
            required
          />
          <Input
            label="Service Type"
            value={formData.serviceType}
            onChange={e => setFormData({ ...formData, serviceType: e.target.value })}
            placeholder="e.g., Weekly Villa Cleaning"
            required
          />
          <Select
            label="Frequency"
            value={formData.frequency}
            onChange={e => setFormData({ ...formData, frequency: e.target.value as 'weekly' | 'biweekly' | 'monthly' })}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly (Every 2 weeks)</option>
            <option value="monthly">Monthly</option>
          </Select>
          <Input
            label="Amount (AED)"
            type="number"
            value={formData.amount}
            onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
            required
          />
          <Input
            label="Contract Start Date"
            type="date"
            value={formData.startDate}
            onChange={e => setFormData({ ...formData, startDate: e.target.value })}
            required
          />
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-[12px] text-blue-800">
              📅 Contract will auto-renew on: <strong>{formData.renewalDate || 'Auto-calculated'}</strong>
            </p>
            <p className="text-[11px] text-blue-700 mt-2">
              💰 Monthly Recurring Revenue: <strong>AED {Math.round(
                formData.frequency === 'weekly' ? formData.amount * 4.33 :
                formData.frequency === 'biweekly' ? formData.amount * 2.17 :
                formData.amount
              )}</strong>
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>
              <Save size={14} className="mr-1.5" /> Save Contract
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
