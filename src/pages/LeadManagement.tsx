import { useState } from 'react'
import { Plus, Trash2, Edit2, Save, X, Eye, Mail, Phone } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface Lead {
  id: string
  name: string
  email: string
  phone: string
  service: string
  status: 'new' | 'contacted' | 'quoted' | 'converted' | 'lost'
  quotedAmount?: number
  notes: string
  createdAt: string
}

const defaultLeads: Lead[] = [
  {
    id: '1',
    name: 'Ahmed Al Mansoori',
    email: 'ahmed@example.com',
    phone: '+971501234567',
    service: 'Villa Cleaning',
    status: 'new',
    notes: 'Interested in weekly service',
    createdAt: '2026-06-05',
  },
  {
    id: '2',
    name: 'Fatima Al Mazrouei',
    email: 'fatima@example.com',
    phone: '+971509876543',
    service: 'Office Cleaning',
    status: 'quoted',
    quotedAmount: 2500,
    notes: 'Waiting for decision',
    createdAt: '2026-06-04',
  },
]

const statusColors: Record<Lead['status'], string> = {
  new: 'bg-blue-50 text-blue-700',
  contacted: 'bg-amber-50 text-amber-700',
  quoted: 'bg-purple-50 text-purple-700',
  converted: 'bg-emerald-50 text-emerald-700',
  lost: 'bg-red-50 text-red-700',
}

export function LeadManagement() {
  const [leads, setLeads] = useState<Lead[]>(defaultLeads)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Lead>({
    id: '',
    name: '',
    email: '',
    phone: '',
    service: '',
    status: 'new',
    notes: '',
    createdAt: new Date().toISOString().split('T')[0],
  })

  const handleAdd = () => {
    setFormData({
      id: Date.now().toString(),
      name: '',
      email: '',
      phone: '',
      service: '',
      status: 'new',
      notes: '',
      createdAt: new Date().toISOString().split('T')[0],
    })
    setEditingId(null)
    setShowModal(true)
  }

  const handleEdit = (lead: Lead) => {
    setFormData({ ...lead })
    setEditingId(lead.id)
    setShowModal(true)
  }

  const handleSave = () => {
    if (!formData.name || !formData.email || !formData.phone) {
      alert('Please fill required fields')
      return
    }
    if (editingId) {
      setLeads(l => l.map(x => x.id === editingId ? formData : x))
    } else {
      setLeads(l => [...l, formData])
    }
    setShowModal(false)
  }

  const handleDelete = (id: string) => {
    setLeads(l => l.filter(x => x.id !== id))
  }

  const statusBreakdown = {
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    quoted: leads.filter(l => l.status === 'quoted').length,
    converted: leads.filter(l => l.status === 'converted').length,
    lost: leads.filter(l => l.status === 'lost').length,
  }

  const totalQuotedValue = leads
    .filter(l => l.quotedAmount)
    .reduce((sum, l) => sum + (l.quotedAmount || 0), 0)

  return (
    <div className="space-y-6">
      <PageHero
        title="Lead Management"
        subtitle="Track prospects and quotes"
        actionLabel="+ New Lead"
        onAction={handleAdd}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'New Leads', value: statusBreakdown.new, color: 'bg-blue-50 text-blue-700' },
          { label: 'Contacted', value: statusBreakdown.contacted, color: 'bg-amber-50 text-amber-700' },
          { label: 'Quoted', value: statusBreakdown.quoted, color: 'bg-purple-50 text-purple-700' },
          { label: 'Converted', value: statusBreakdown.converted, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Pipeline Value', value: `AED ${totalQuotedValue}`, color: 'bg-slate-50 text-slate-700' },
        ].map((stat, i) => (
          <div
            key={i}
            className={`${stat.color} rounded-[16px] p-4 text-center border border-current border-opacity-20`}
          >
            <p className="text-[11px] font-semibold opacity-70">{stat.label}</p>
            <p className="text-[22px] font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-slate-50">
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Name</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Contact</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Service</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Status</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Quote</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} className="border-b border-[#E4E8EC] hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="text-[13px] font-semibold text-[#111827]">{lead.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-0.5">
                      <p className="text-[12px] text-slate-600 flex items-center gap-1">
                        <Mail size={12} /> {lead.email}
                      </p>
                      <p className="text-[12px] text-slate-600 flex items-center gap-1">
                        <Phone size={12} /> {lead.phone}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[13px] text-slate-600">{lead.service}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${
                        statusColors[lead.status]
                      }`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[13px] font-semibold text-slate-600">
                    {lead.quotedAmount ? `AED ${lead.quotedAmount}` : '—'}
                  </td>
                  <td className="px-6 py-4 flex justify-center gap-2">
                    <button
                      onClick={() => handleEdit(lead)}
                      className="p-2 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(lead.id)}
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
        title={editingId ? 'Edit Lead' : 'New Lead'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="Client name"
            required
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            placeholder="email@example.com"
            required
          />
          <Input
            label="Phone"
            value={formData.phone}
            onChange={e => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+971501234567"
            required
          />
          <Input
            label="Service Interested In"
            value={formData.service}
            onChange={e => setFormData({ ...formData, service: e.target.value })}
            placeholder="e.g., Office Cleaning"
          />
          <Select
            label="Status"
            value={formData.status}
            onChange={e => setFormData({ ...formData, status: e.target.value as Lead['status'] })}
          >
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="quoted">Quoted</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
          </Select>
          <Input
            label="Quoted Amount (AED)"
            type="number"
            value={formData.quotedAmount || ''}
            onChange={e => setFormData({ ...formData, quotedAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
            placeholder="Leave empty if not quoted"
          />
          <div>
            <label className="text-[13px] font-semibold text-[#111827] block mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-3 border border-[#E4E8EC] rounded-xl text-[13px] focus:outline-none focus:border-emerald-400"
              rows={3}
              placeholder="Any notes about this lead..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>
              <Save size={14} className="mr-1.5" /> Save Lead
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
