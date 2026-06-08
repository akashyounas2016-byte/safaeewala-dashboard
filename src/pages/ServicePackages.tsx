import { useState } from 'react'
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface ServicePackage {
  id: string
  name: string
  description: string
  price: number
  duration: number
  features: string[]
}

const defaultPackages: ServicePackage[] = [
  {
    id: '1',
    name: 'Basic Clean',
    description: 'Standard cleaning for small apartments',
    price: 150,
    duration: 2,
    features: ['Dusting', 'Vacuuming', 'Mopping', 'Bathroom cleaning'],
  },
  {
    id: '2',
    name: 'Premium Clean',
    description: 'Deep cleaning for medium homes',
    price: 300,
    duration: 4,
    features: ['All Basic features', 'Kitchen deep clean', 'Window cleaning', 'Carpet shampooing'],
  },
  {
    id: '3',
    name: 'Executive Clean',
    description: 'Complete cleaning service for large properties',
    price: 500,
    duration: 6,
    features: ['All Premium features', 'Upholstery cleaning', 'Wall washing', 'Ceiling cleaning'],
  },
]

export function ServicePackages() {
  const [packages, setPackages] = useState<ServicePackage[]>(defaultPackages)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState<ServicePackage>({
    id: '',
    name: '',
    description: '',
    price: 0,
    duration: 0,
    features: [],
  })

  const handleAdd = () => {
    setFormData({
      id: Date.now().toString(),
      name: '',
      description: '',
      price: 0,
      duration: 0,
      features: [],
    })
    setEditingId(null)
    setShowModal(true)
  }

  const handleEdit = (pkg: ServicePackage) => {
    setFormData({ ...pkg })
    setEditingId(pkg.id)
    setShowModal(true)
  }

  const handleSave = () => {
    if (!formData.name || formData.price <= 0 || formData.duration <= 0) {
      alert('Please fill all required fields')
      return
    }
    if (editingId) {
      setPackages(p => p.map(x => x.id === editingId ? formData : x))
    } else {
      setPackages(p => [...p, formData])
    }
    setShowModal(false)
  }

  const handleDelete = (id: string) => {
    setPackages(p => p.filter(x => x.id !== id))
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Service Packages"
        subtitle="Create and manage service packages for your clients"
        actionLabel="+ New Package"
        onAction={handleAdd}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {packages.map(pkg => (
          <div
            key={pkg.id}
            className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6 flex flex-col"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-[18px] font-bold text-[#111827]">{pkg.name}</h3>
                <p className="text-[12px] text-slate-500 mt-1">{pkg.description}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(pkg)}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(pkg.id)}
                  className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1">
              <div className="mb-4">
                <p className="text-[13px] text-slate-500 mb-2">Features</p>
                <ul className="space-y-1">
                  {pkg.features.map((f, i) => (
                    <li key={i} className="text-[12px] text-slate-600 flex items-start gap-2">
                      <span className="text-emerald-600 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="border-t border-[#E4E8EC] pt-4 mt-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[11px] text-slate-500">Duration</p>
                  <p className="text-[14px] font-semibold text-[#111827]">{pkg.duration}h</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-500">Price</p>
                  <p className="text-[20px] font-bold text-emerald-600">AED {pkg.price}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Add Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Package' : 'New Package'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Package Name"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Basic Clean"
          />
          <Input
            label="Description"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description for clients"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Price (AED)"
              type="number"
              value={formData.price}
              onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
            />
            <Input
              label="Duration (hours)"
              type="number"
              value={formData.duration}
              onChange={e => setFormData({ ...formData, duration: parseInt(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-[13px] font-semibold text-[#111827] block mb-2">Features (one per line)</label>
            <textarea
              value={formData.features.join('\n')}
              onChange={e => setFormData({ ...formData, features: e.target.value.split('\n').filter(Boolean) })}
              className="w-full p-3 border border-[#E4E8EC] rounded-xl text-[13px] focus:outline-none focus:border-emerald-400"
              rows={4}
              placeholder="Dusting&#10;Vacuuming&#10;Mopping"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>
              <Save size={14} className="mr-1.5" /> Save Package
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
