import { useState } from 'react'
import { FileText, Plus, Trash2, Download, Eye, Lock, Clock, CheckCircle, AlertTriangle, Search, Filter } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface Document {
  id: string
  name: string
  type: 'contract' | 'agreement' | 'certification' | 'compliance' | 'financial' | 'other'
  category: 'client' | 'employee' | 'company' | 'legal'
  linkedTo?: string // Client name or Employee name
  uploadDate: string
  expirationDate?: string
  status: 'active' | 'expiring_soon' | 'expired'
  signed: boolean
  signedBy?: string
  signedDate?: string
  fileSize: number
  accessLog: { user: string; timestamp: string; action: string }[]
}

const defaultDocuments: Document[] = [
  {
    id: '1',
    name: 'Ahmed Al Mansoori - Service Agreement',
    type: 'agreement',
    category: 'client',
    linkedTo: 'Ahmed Al Mansoori',
    uploadDate: '2025-12-15',
    expirationDate: '2026-12-15',
    status: 'active',
    signed: true,
    signedBy: 'Ahmed Al Mansoori',
    signedDate: '2025-12-15',
    fileSize: 245,
    accessLog: [
      { user: 'Admin', timestamp: '2026-06-07 10:30', action: 'Viewed' },
      { user: 'Akash Younas', timestamp: '2026-06-05 14:22', action: 'Downloaded' },
    ],
  },
  {
    id: '2',
    name: 'Ahmed Al Mansoori - Recurring Contract',
    type: 'contract',
    category: 'client',
    linkedTo: 'Ahmed Al Mansoori',
    uploadDate: '2025-12-15',
    expirationDate: '2026-12-15',
    status: 'active',
    signed: true,
    signedBy: 'Ahmed Al Mansoori',
    signedDate: '2025-12-15',
    fileSize: 312,
    accessLog: [],
  },
  {
    id: '3',
    name: 'Employee - Training Certification',
    type: 'certification',
    category: 'employee',
    linkedTo: 'Ahmed Al Mansoori',
    uploadDate: '2026-01-10',
    expirationDate: '2027-01-10',
    status: 'active',
    signed: false,
    fileSize: 156,
    accessLog: [],
  },
  {
    id: '4',
    name: 'DED License - Safaeewala LLC',
    type: 'compliance',
    category: 'company',
    uploadDate: '2025-06-01',
    expirationDate: '2026-06-01',
    status: 'expiring_soon',
    signed: false,
    fileSize: 523,
    accessLog: [
      { user: 'Admin', timestamp: '2026-06-01 09:15', action: 'Viewed' },
    ],
  },
  {
    id: '5',
    name: 'VAT Certificate - 2026',
    type: 'compliance',
    category: 'company',
    uploadDate: '2026-01-01',
    expirationDate: '2026-12-31',
    status: 'active',
    signed: false,
    fileSize: 189,
    accessLog: [],
  },
  {
    id: '6',
    name: 'Insurance Certificate - Liability',
    type: 'compliance',
    category: 'company',
    uploadDate: '2025-12-01',
    expirationDate: '2026-12-01',
    status: 'active',
    signed: false,
    fileSize: 401,
    accessLog: [
      { user: 'Akash Younas', timestamp: '2026-05-20 11:45', action: 'Downloaded' },
    ],
  },
]

export function DocumentManagement() {
  const [documents, setDocuments] = useState<Document[]>(defaultDocuments)
  const [showModal, setShowModal] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const handleDeleteDocument = (id: string) => {
    setDocuments(d => d.filter(x => x.id !== id))
  }

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (doc.linkedTo && doc.linkedTo.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesType = filterType === 'all' || doc.type === filterType
    const matchesCategory = filterCategory === 'all' || doc.category === filterCategory
    return matchesSearch && matchesType && matchesCategory
  })

  const stats = {
    total: documents.length,
    signed: documents.filter(d => d.signed).length,
    expiring: documents.filter(d => d.status === 'expiring_soon').length,
    expired: documents.filter(d => d.status === 'expired').length,
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle size={14} className="text-emerald-600" />
      case 'expiring_soon':
        return <AlertTriangle size={14} className="text-amber-600" />
      case 'expired':
        return <AlertTriangle size={14} className="text-red-600" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-50 text-emerald-700'
      case 'expiring_soon':
        return 'bg-amber-50 text-amber-700'
      case 'expired':
        return 'bg-red-50 text-red-700'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Document Management"
        subtitle="Centralized storage for contracts, compliance, and legal documents"
        actionLabel="+ Upload Document"
        onAction={() => setShowModal(true)}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-blue-700 uppercase">Total Documents</p>
          <p className="text-[28px] font-bold text-blue-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-emerald-700 uppercase">Signed</p>
          <p className="text-[28px] font-bold text-emerald-900 mt-1">{stats.signed}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-amber-700 uppercase">Expiring Soon</p>
          <p className="text-[28px] font-bold text-amber-900 mt-1">{stats.expiring}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-[16px] p-5">
          <p className="text-[12px] font-semibold text-red-700 uppercase">Expired</p>
          <p className="text-[28px] font-bold text-red-900 mt-1">{stats.expired}</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="text-[12px] font-semibold text-[#111827] block mb-2">Search Documents</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name or linked to..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-[#E4E8EC] rounded-xl text-[13px] focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-[#111827] block mb-2">Document Type</label>
            <Select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              <option value="contract">Contract</option>
              <option value="agreement">Agreement</option>
              <option value="certification">Certification</option>
              <option value="compliance">Compliance</option>
              <option value="financial">Financial</option>
            </Select>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-[#111827] block mb-2">Category</label>
            <Select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">All Categories</option>
              <option value="client">Client</option>
              <option value="employee">Employee</option>
              <option value="company">Company</option>
              <option value="legal">Legal</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {stats.expiring > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[22px] p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle size={20} className="text-amber-600 mt-1 shrink-0" />
            <div>
              <p className="text-[14px] font-bold text-amber-900 mb-2">⚠️ Documents Expiring Soon</p>
              <p className="text-[12px] text-amber-800">
                {stats.expiring} document(s) are expiring soon. Please review and renew them to maintain compliance.
              </p>
            </div>
          </div>
        </div>
      )}

      {stats.expired > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-[22px] p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle size={20} className="text-red-600 mt-1 shrink-0" />
            <div>
              <p className="text-[14px] font-bold text-red-900 mb-2">🚨 Expired Documents</p>
              <p className="text-[12px] text-red-800">
                {stats.expired} document(s) have expired. Please update them immediately for compliance.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E8EC] flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#111827]">Documents</h3>
          <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
            {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E4E8EC] bg-slate-50">
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Document Name</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Type</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Linked To</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Signed</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Status</th>
                <th className="px-6 py-4 text-left text-[12px] font-bold text-slate-600 uppercase">Expiration</th>
                <th className="px-6 py-4 text-center text-[12px] font-bold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map(doc => (
                <tr key={doc.id} className="border-b border-[#E4E8EC] hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <FileText size={16} className="text-slate-400" />
                      <div>
                        <p className="text-[13px] font-semibold text-[#111827]">{doc.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{(doc.fileSize / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 capitalize">
                      {doc.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[12px] text-slate-600">{doc.linkedTo || '—'}</td>
                  <td className="px-6 py-4 text-center">
                    {doc.signed ? (
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle size={14} className="text-emerald-600" />
                        <span className="text-[11px] text-emerald-700 font-semibold">Signed</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">Unsigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {getStatusIcon(doc.status)}
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${getStatusColor(doc.status)}`}>
                        {doc.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[12px] text-slate-600">
                    {doc.expirationDate ? (
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(doc.expirationDate).toLocaleDateString('en-AE')}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-6 py-4 flex justify-center gap-2">
                    <button
                      onClick={() => setSelectedDoc(doc)}
                      className="p-2 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                      title="View details"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                      title="Delete document"
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

      {/* Features Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lock size={20} className="text-purple-600" />
            <h4 className="text-[14px] font-bold text-[#111827]">Secure Storage</h4>
          </div>
          <ul className="space-y-2 text-[12px] text-slate-600">
            <li>✓ Encrypted document storage</li>
            <li>✓ Version control & history</li>
            <li>✓ Access logs & audit trail</li>
            <li>✓ Backup & recovery</li>
          </ul>
        </div>

        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText size={20} className="text-blue-600" />
            <h4 className="text-[14px] font-bold text-[#111827]">Digital Signatures</h4>
          </div>
          <ul className="space-y-2 text-[12px] text-slate-600">
            <li>✓ E-signature capability</li>
            <li>✓ Timestamped signatures</li>
            <li>✓ Legally binding</li>
            <li>✓ Signature proof</li>
          </ul>
        </div>

        <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-6">
          <div className="flex items-center gap-3 mb-4">
            <Clock size={20} className="text-amber-600" />
            <h4 className="text-[14px] font-bold text-[#111827]">Expiration Tracking</h4>
          </div>
          <ul className="space-y-2 text-[12px] text-slate-600">
            <li>✓ Auto-expiration alerts</li>
            <li>✓ Compliance reminders</li>
            <li>✓ Renewal notifications</li>
            <li>✓ Certification tracking</li>
          </ul>
        </div>
      </div>

      {/* Document Detail Modal */}
      <Modal
        open={!!selectedDoc}
        onClose={() => setSelectedDoc(null)}
        title={selectedDoc?.name || ''}
        size="lg"
      >
        {selectedDoc && (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-slate-500 font-semibold uppercase">Document Type</p>
                <p className="text-[14px] font-bold text-[#111827] mt-1 capitalize">{selectedDoc.type}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-semibold uppercase">Category</p>
                <p className="text-[14px] font-bold text-[#111827] mt-1 capitalize">{selectedDoc.category}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-semibold uppercase">Upload Date</p>
                <p className="text-[14px] font-bold text-[#111827] mt-1">
                  {new Date(selectedDoc.uploadDate).toLocaleDateString('en-AE')}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-semibold uppercase">File Size</p>
                <p className="text-[14px] font-bold text-[#111827] mt-1">{(selectedDoc.fileSize / 1024).toFixed(1)} KB</p>
              </div>
            </div>

            {/* Status */}
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-[11px] text-slate-500 font-semibold uppercase mb-2">Status</p>
              <div className="flex items-center gap-2">
                {getStatusIcon(selectedDoc.status)}
                <span className={`text-[13px] font-bold px-3 py-1 rounded-full capitalize ${getStatusColor(selectedDoc.status)}`}>
                  {selectedDoc.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            {/* Signature Info */}
            {selectedDoc.signed && selectedDoc.signedBy && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-[11px] text-emerald-700 font-semibold uppercase mb-2">✓ Signed</p>
                <p className="text-[13px] text-emerald-800">
                  <strong>By:</strong> {selectedDoc.signedBy}
                </p>
                <p className="text-[13px] text-emerald-800 mt-1">
                  <strong>Date:</strong> {new Date(selectedDoc.signedDate || '').toLocaleDateString('en-AE')}
                </p>
              </div>
            )}

            {/* Expiration Info */}
            {selectedDoc.expirationDate && (
              <div className={`rounded-xl p-4 ${
                selectedDoc.status === 'expired'
                  ? 'bg-red-50 border border-red-200'
                  : selectedDoc.status === 'expiring_soon'
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-blue-50 border border-blue-200'
              }`}>
                <p className={`text-[11px] font-semibold uppercase mb-2 ${
                  selectedDoc.status === 'expired'
                    ? 'text-red-700'
                    : selectedDoc.status === 'expiring_soon'
                      ? 'text-amber-700'
                      : 'text-blue-700'
                }`}>
                  Expiration Date
                </p>
                <p className={`text-[13px] font-bold ${
                  selectedDoc.status === 'expired'
                    ? 'text-red-800'
                    : selectedDoc.status === 'expiring_soon'
                      ? 'text-amber-800'
                      : 'text-blue-800'
                }`}>
                  {new Date(selectedDoc.expirationDate).toLocaleDateString('en-AE')}
                </p>
              </div>
            )}

            {/* Linked To */}
            {selectedDoc.linkedTo && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[11px] text-slate-500 font-semibold uppercase mb-2">Linked To</p>
                <p className="text-[13px] font-bold text-[#111827]">{selectedDoc.linkedTo}</p>
              </div>
            )}

            {/* Access Log */}
            {selectedDoc.accessLog.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[11px] text-slate-500 font-semibold uppercase mb-3">Access History</p>
                <div className="space-y-2">
                  {selectedDoc.accessLog.map((log, i) => (
                    <div key={i} className="text-[12px] text-slate-600">
                      <p><strong>{log.user}</strong> - {log.action}</p>
                      <p className="text-[11px] text-slate-500">{log.timestamp}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSelectedDoc(null)}>
                Close
              </Button>
              <Button onClick={() => setSelectedDoc(null)}>
                <Download size={14} className="mr-1.5" /> Download
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
