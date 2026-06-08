import { useState } from 'react'
import { Sparkles, FileText, Send, Copy, Loader } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface Proposal {
  id: string
  clientName: string
  serviceType: string
  estimatedPrice: number
  proposal: string
  createdAt: string
  sent: boolean
}

const defaultProposals: Proposal[] = [
  {
    id: '1',
    clientName: 'Ahmed Al Mansoori',
    serviceType: 'Villa Deep Clean',
    estimatedPrice: 850,
    proposal: 'Dear Ahmed,\n\nThank you for inquiring about our deep cleaning services. We are excited to provide you with a customized proposal for your villa.\n\n**Service Details:**\n- Property Type: Villa\n- Service: Deep Cleaning\n- Estimated Duration: 6-8 hours\n- Team Size: 3-4 cleaners\n\n**Pricing:**\n- Deep Clean Service: AED 700\n- Special Areas (Carpet/Upholstery): AED 150\n- Total: AED 850\n\n**What\'s Included:**\n✓ Complete dusting and vacuuming\n✓ Window and glass cleaning\n✓ Kitchen deep clean\n✓ Bathroom sanitization\n✓ Floor polishing\n\nWe are confident this service will exceed your expectations. Please let us know if you would like to proceed.\n\nBest regards,\nSafaeewala Cleaning Team',
    createdAt: '2026-06-05',
    sent: true,
  },
]

export function AIProposalGenerator() {
  const [proposals, setProposals] = useState<Proposal[]>(defaultProposals)
  const [showModal, setShowModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [formData, setFormData] = useState({
    clientName: '',
    email: '',
    propertyType: 'apartment',
    serviceType: '',
    squareMeters: '',
    specialRequirements: '',
  })
  const [generatedProposal, setGeneratedProposal] = useState('')
  const [copied, setCopied] = useState(false)

  const handleGenerate = async () => {
    if (!formData.clientName || !formData.serviceType) {
      alert('Please fill required fields')
      return
    }

    setGenerating(true)
    // Simulate API call to Claude
    setTimeout(() => {
      const proposal = `Dear ${formData.clientName},

Thank you for choosing Safaeewala for your ${formData.serviceType} needs. We're excited to provide our expertise to your ${formData.propertyType}.

**Service Overview:**
- Property Type: ${formData.propertyType}
- Service: ${formData.serviceType}
${formData.squareMeters ? `- Property Size: ${formData.squareMeters} sqm` : ''}
${formData.specialRequirements ? `- Special Requirements: ${formData.specialRequirements}` : ''}

**What's Included:**
✓ Professional cleaning team
✓ Eco-friendly cleaning products
✓ Quality assurance inspection
✓ Flexible scheduling

**Our Guarantee:**
We guarantee 100% customer satisfaction. If you're not satisfied, we'll re-do the work at no charge.

**Next Steps:**
1. Review this proposal
2. Confirm your preferred date
3. We'll send a service agreement
4. Our team arrives on the scheduled date

Please reply to confirm, or contact us at +971 55 628 2374 if you have any questions.

Best regards,
Safaeewala Cleaning & Maintenance LLC
Dubai, UAE`

      setGeneratedProposal(proposal)
      setGenerating(false)
    }, 1500)
  }

  const handleSaveProposal = () => {
    const newProposal: Proposal = {
      id: Date.now().toString(),
      clientName: formData.clientName,
      serviceType: formData.serviceType,
      estimatedPrice: 0, // Would be calculated
      proposal: generatedProposal,
      createdAt: new Date().toISOString().split('T')[0],
      sent: false,
    }
    setProposals([...proposals, newProposal])
    setShowModal(false)
    setFormData({
      clientName: '',
      email: '',
      propertyType: 'apartment',
      serviceType: '',
      squareMeters: '',
      specialRequirements: '',
    })
    setGeneratedProposal('')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedProposal)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="AI Proposal Generator"
        subtitle="Generate professional proposals in seconds with AI"
        actionLabel="+ Generate Proposal"
        onAction={() => setShowModal(true)}
      />

      {/* Previous Proposals */}
      <div>
        <h3 className="text-[16px] font-bold text-[#111827] mb-4">Recent Proposals</h3>
        <div className="space-y-3">
          {proposals.map(proposal => (
            <div
              key={proposal.id}
              className="bg-white rounded-[16px] border border-[#E4E8EC] p-4 flex items-center justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <p className="text-[14px] font-semibold text-[#111827]">{proposal.clientName}</p>
                <p className="text-[12px] text-slate-500 mt-0.5">{proposal.serviceType}</p>
                <p className="text-[11px] text-slate-400 mt-1">{proposal.createdAt}</p>
              </div>
              <div className="flex items-center gap-2">
                {proposal.sent ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                    ✓ Sent
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                    Draft
                  </span>
                )}
                <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                  <FileText size={16} className="text-slate-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-[22px] p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
            <Sparkles size={24} className="text-white" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-emerald-900 mb-2">How AI Proposal Generator Works</p>
            <ul className="space-y-1 text-[12px] text-emerald-800">
              <li>✓ Enter client details and service requirements</li>
              <li>✓ AI generates a professional proposal in seconds</li>
              <li>✓ Edit, customize, and personalize as needed</li>
              <li>✓ Send directly to clients via email</li>
              <li>✓ Track proposal status and follow-ups</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal */}
      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false)
          setGeneratedProposal('')
          setFormData({
            clientName: '',
            email: '',
            propertyType: 'apartment',
            serviceType: '',
            squareMeters: '',
            specialRequirements: '',
          })
        }}
        title="Generate Proposal with AI"
        size="lg"
      >
        <div className="space-y-4">
          {!generatedProposal ? (
            <>
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
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="ahmed@example.com"
              />
              <Select
                label="Property Type"
                value={formData.propertyType}
                onChange={e => setFormData({ ...formData, propertyType: e.target.value })}
              >
                <option value="apartment">Apartment</option>
                <option value="villa">Villa</option>
                <option value="office">Office</option>
                <option value="retail">Retail Space</option>
                <option value="industrial">Industrial</option>
              </Select>
              <Input
                label="Service Type"
                value={formData.serviceType}
                onChange={e => setFormData({ ...formData, serviceType: e.target.value })}
                placeholder="e.g., Deep Clean, Regular Maintenance"
                required
              />
              <Input
                label="Property Size (sqm)"
                type="number"
                value={formData.squareMeters}
                onChange={e => setFormData({ ...formData, squareMeters: e.target.value })}
                placeholder="Optional"
              />
              <Textarea
                label="Special Requirements"
                value={formData.specialRequirements}
                onChange={e => setFormData({ ...formData, specialRequirements: e.target.value })}
                placeholder="Any special needs or instructions..."
                rows={3}
              />
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowModal(false)
                    setGeneratedProposal('')
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? (
                    <>
                      <Loader size={14} className="mr-1.5 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} className="mr-1.5" /> Generate with AI
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-[13px] font-semibold text-[#111827] block mb-2">Generated Proposal</label>
                <textarea
                  value={generatedProposal}
                  onChange={e => setGeneratedProposal(e.target.value)}
                  className="w-full p-4 border border-[#E4E8EC] rounded-xl text-[12px] font-mono focus:outline-none focus:border-emerald-400"
                  rows={12}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={handleCopy}>
                  <Copy size={14} className="mr-1.5" /> {copied ? 'Copied!' : 'Copy'}
                </Button>
                <Button variant="secondary" onClick={() => setGeneratedProposal('')}>
                  Regenerate
                </Button>
                <Button onClick={handleSaveProposal}>
                  <Send size={14} className="mr-1.5" /> Save Proposal
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
