import { FileText, Shield, Lock, Archive } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'

export function DocumentManagement() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Document Management"
        subtitle="Store contracts, waivers, and compliance documents — coming soon"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-[22px] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-500 flex items-center justify-center mx-auto mb-6">
            <FileText size={40} className="text-white" />
          </div>
          <h2 className="text-[28px] font-bold text-slate-900 mb-3">Document Management Coming Soon</h2>
          <p className="text-slate-700 mb-6">
            Securely store and manage contracts, NDAs, waivers, and compliance documents.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-full text-[12px] font-semibold">
            <FileText size={14} /> Expected Q1 2027
          </div>
        </div>

        {[
          {
            icon: FileText,
            title: 'Contract Templates',
            description: 'Pre-made templates for service agreements and waivers',
          },
          {
            icon: Shield,
            title: 'Digital Signatures',
            description: 'Get e-signatures from clients directly in the dashboard',
          },
          {
            icon: Lock,
            title: 'Secure Storage',
            description: 'Encrypted storage with version control and audit logs',
          },
          {
            icon: Archive,
            title: 'Document Organization',
            description: 'Organize by client, document type, and expiration date',
          },
        ].map((feature, i) => (
          <div
            key={i}
            className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
                <feature.icon size={24} className="text-slate-600" />
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
