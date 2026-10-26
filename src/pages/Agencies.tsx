import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Plus, Search, Phone, Mail, MapPin, Users,
  Percent, CreditCard, FileText, CheckCircle2, AlertCircle,
  Edit2, Trash2, ExternalLink, RotateCcw, X, Shield, ArrowUpRight,
  ArrowRight, LayoutGrid, List, Check, Paperclip, Upload, Eye, Download,
  Pin, Crown, Sparkles, UserCheck
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { useData, defaultAgencies } from '@/store/DataContext'
import type { Agency, AgencyContactPerson, AgencyDocument } from '@/types'
import { formatDate, isThirdPartyEmployee } from '@/lib/utils'
import { safeLocalStorageSet, safeLocalStorageGet } from '@/lib/storageUtils'
import { AgencyDashboard } from '@/components/agencies/AgencyDashboard'

export function slugifyAgencyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Curated Distinct Light Color Themes for Agency Widgets ──
export const LIGHT_AGENCY_CARD_THEMES = [
  {
    bg: 'bg-emerald-50/60',
    border: 'border-emerald-200/90',
    hoverBorder: 'hover:border-emerald-400',
    hoverShadow: 'hover:shadow-[0_12px_35px_rgba(16,185,129,0.14)]',
    iconGradient: 'linear-gradient(135deg, #059669, #047857)',
    badgeBg: 'bg-emerald-100/80 text-emerald-900 border-emerald-300',
    statBg: 'bg-emerald-100/50 border-emerald-200/80',
    btnBg: 'bg-emerald-100/80 hover:bg-emerald-600 text-emerald-800 hover:text-white',
    titleHover: 'group-hover:text-emerald-800',
  },
  {
    bg: 'bg-sky-50/60',
    border: 'border-sky-200/90',
    hoverBorder: 'hover:border-sky-400',
    hoverShadow: 'hover:shadow-[0_12px_35px_rgba(14,165,233,0.14)]',
    iconGradient: 'linear-gradient(135deg, #0284c7, #0369a1)',
    badgeBg: 'bg-sky-100/80 text-sky-900 border-sky-300',
    statBg: 'bg-sky-100/50 border-sky-200/80',
    btnBg: 'bg-sky-100/80 hover:bg-sky-600 text-sky-800 hover:text-white',
    titleHover: 'group-hover:text-sky-800',
  },
  {
    bg: 'bg-amber-50/60',
    border: 'border-amber-200/90',
    hoverBorder: 'hover:border-amber-400',
    hoverShadow: 'hover:shadow-[0_12px_35px_rgba(245,158,11,0.14)]',
    iconGradient: 'linear-gradient(135deg, #d97706, #b45309)',
    badgeBg: 'bg-amber-100/80 text-amber-900 border-amber-300',
    statBg: 'bg-amber-100/50 border-amber-200/80',
    btnBg: 'bg-amber-100/80 hover:bg-amber-600 text-amber-900 hover:text-white',
    titleHover: 'group-hover:text-amber-800',
  },
  {
    bg: 'bg-purple-50/60',
    border: 'border-purple-200/90',
    hoverBorder: 'hover:border-purple-400',
    hoverShadow: 'hover:shadow-[0_12px_35px_rgba(168,85,247,0.14)]',
    iconGradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    badgeBg: 'bg-purple-100/80 text-purple-900 border-purple-300',
    statBg: 'bg-purple-100/50 border-purple-200/80',
    btnBg: 'bg-purple-100/80 hover:bg-purple-600 text-purple-900 hover:text-white',
    titleHover: 'group-hover:text-purple-800',
  },
  {
    bg: 'bg-rose-50/60',
    border: 'border-rose-200/90',
    hoverBorder: 'hover:border-rose-400',
    hoverShadow: 'hover:shadow-[0_12px_35px_rgba(244,63,94,0.14)]',
    iconGradient: 'linear-gradient(135deg, #e11d48, #be123c)',
    badgeBg: 'bg-rose-100/80 text-rose-900 border-rose-300',
    statBg: 'bg-rose-100/50 border-rose-200/80',
    btnBg: 'bg-rose-100/80 hover:bg-rose-600 text-rose-900 hover:text-white',
    titleHover: 'group-hover:text-rose-800',
  },
  {
    bg: 'bg-teal-50/60',
    border: 'border-teal-200/90',
    hoverBorder: 'hover:border-teal-400',
    hoverShadow: 'hover:shadow-[0_12px_35px_rgba(20,184,166,0.14)]',
    iconGradient: 'linear-gradient(135deg, #0d9488, #115e59)',
    badgeBg: 'bg-teal-100/80 text-teal-900 border-teal-300',
    statBg: 'bg-teal-100/50 border-teal-200/80',
    btnBg: 'bg-teal-100/80 hover:bg-teal-600 text-teal-900 hover:text-white',
    titleHover: 'group-hover:text-teal-800',
  },
  {
    bg: 'bg-indigo-50/60',
    border: 'border-indigo-200/90',
    hoverBorder: 'hover:border-indigo-400',
    hoverShadow: 'hover:shadow-[0_12px_35px_rgba(99,102,241,0.14)]',
    iconGradient: 'linear-gradient(135deg, #4f46e5, #4338ca)',
    badgeBg: 'bg-indigo-100/80 text-indigo-900 border-indigo-300',
    statBg: 'bg-indigo-100/50 border-indigo-200/80',
    btnBg: 'bg-indigo-100/80 hover:bg-indigo-600 text-indigo-900 hover:text-white',
    titleHover: 'group-hover:text-indigo-800',
  },
  {
    bg: 'bg-orange-50/60',
    border: 'border-orange-200/90',
    hoverBorder: 'hover:border-orange-400',
    hoverShadow: 'hover:shadow-[0_12px_35px_rgba(249,115,22,0.14)]',
    iconGradient: 'linear-gradient(135deg, #ea580c, #c2410c)',
    badgeBg: 'bg-orange-100/80 text-orange-900 border-orange-300',
    statBg: 'bg-orange-100/50 border-orange-200/80',
    btnBg: 'bg-orange-100/80 hover:bg-orange-600 text-orange-900 hover:text-white',
    titleHover: 'group-hover:text-orange-800',
  },
]

// ── XML Escaping Helper for SVG Generation ──
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── Instant Digital UAE Certificate Generator (for quick Trade Lic & NOC viewing) ──
function generateCertificateDataUrl(
  agency: Agency,
  category: 'trade_license' | 'noc',
  certNumber: string
): string {
  const isTradeLicense = category === 'trade_license'
  const title = isTradeLicense ? 'COMMERCIAL TRADE LICENSE' : 'NO OBJECTION CERTIFICATE (NOC)'
  const authority = isTradeLicense
    ? 'GOVERNMENT OF DUBAI — DEPARTMENT OF ECONOMY & TOURISM'
    : 'MINISTRY OF HUMAN RESOURCES & EMIRATISATION (MOHRE)'
  const emirate = 'DUBAI, UNITED ARAB EMIRATES'
  const issueDate = escapeXml(agency.license_issue_date || '2024-01-01')
  const expiryDate = escapeXml(agency.license_expiry_date || '2027-12-31')
  const primaryContact = escapeXml(agency.contact_person || 'Authorized Corporate Representative')
  const trn = escapeXml(agency.trn_no || '100234567800001')
  const safeName = escapeXml(agency.name)
  const safeCert = escapeXml(certNumber)
  const safeType = escapeXml(agency.company_type || 'Commercial Partner')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" width="900" height="600">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#f8fafc"/>
      </linearGradient>
    </defs>
    <rect x="15" y="15" width="870" height="570" rx="20" fill="url(#bgGrad)" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="25" y="25" width="850" height="550" rx="16" fill="none" stroke="#0d9488" stroke-width="2" stroke-dasharray="6,4" opacity="0.6"/>

    <rect x="40" y="40" width="820" height="85" rx="14" fill="#0f172a"/>
    <text x="70" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="800" fill="#2dd4bf" letter-spacing="2">${authority}</text>
    <text x="70" y="102" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#ffffff" letter-spacing="0.5">${title}</text>
    <text x="830" y="85" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#94a3b8">${emirate}</text>

    <g transform="translate(670, 145)">
      <rect x="0" y="0" width="170" height="32" rx="16" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1.5"/>
      <circle cx="20" cy="16" r="6" fill="#10b981"/>
      <text x="35" y="21" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="#065f46" letter-spacing="1">VERIFIED ACTIVE</text>
    </g>

    <text x="70" y="170" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="800" fill="#64748b" letter-spacing="1.5">REGISTERED ENTITY / COMPANY NAME</text>
    <text x="70" y="205" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="900" fill="#0f172a">${safeName}</text>

    <g transform="translate(70, 240)">
      <g>
        <rect x="0" y="0" width="230" height="68" rx="10" fill="#f1f5f9" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">${isTradeLicense ? 'TRADE LICENSE NO' : 'NOC REFERENCE NO'}</text>
        <text x="16" y="50" font-family="Courier, monospace" font-size="16" font-weight="900" fill="#0f766e">${safeCert}</text>
      </g>
      <g transform="translate(250, 0)">
        <rect x="0" y="0" width="230" height="68" rx="10" fill="#f1f5f9" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">TAX TRN NUMBER</text>
        <text x="16" y="50" font-family="Courier, monospace" font-size="15" font-weight="800" fill="#334155">${trn}</text>
      </g>
      <g transform="translate(500, 0)">
        <rect x="0" y="0" width="260" height="68" rx="10" fill="#f1f5f9" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">LEGAL STATUS / CATEGORY</text>
        <text x="16" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#334155">${safeType}</text>
      </g>
    </g>

    <g transform="translate(70, 330)">
      <g>
        <rect x="0" y="0" width="230" height="68" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">ISSUE DATE</text>
        <text x="16" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#0f172a">${issueDate}</text>
      </g>
      <g transform="translate(250, 0)">
        <rect x="0" y="0" width="230" height="68" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">EXPIRY DATE</text>
        <text x="16" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#0f172a">${expiryDate}</text>
      </g>
      <g transform="translate(500, 0)">
        <rect x="0" y="0" width="260" height="68" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">AUTHORIZED CONTACT</text>
        <text x="16" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#0f172a">${primaryContact}</text>
      </g>
    </g>

    <line x1="70" y1="430" x2="830" y2="430" stroke="#cbd5e1" stroke-width="1"/>
    <g transform="translate(70, 450)">
      <text x="0" y="20" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="700" fill="#64748b">Verified by Safaeewala Procurement &amp; Compliance Management Portal</text>
      <text x="0" y="38" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="500" fill="#94a3b8">This electronic document verification record confirms active registration in accordance with UAE commercial law.</text>
    </g>

    <g transform="translate(730, 440)">
      <circle cx="45" cy="45" r="42" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-dasharray="4,2"/>
      <circle cx="45" cy="45" r="36" fill="none" stroke="#0d9488" stroke-width="1"/>
      <text x="45" y="42" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="900" fill="#0d9488" letter-spacing="1">GOVT OF DUBAI</text>
      <text x="45" y="55" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="800" fill="#0d9488">VALIDATED</text>
    </g>
  </svg>`

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// ── Multi-File Attachment Helper Function ──
function handleFileUpload(
  files: FileList | null,
  category: 'trade_license' | 'tax_registration' | 'agreement' | 'noc',
  setDocs: React.Dispatch<React.SetStateAction<AgencyDocument[]>>
) {
  if (!files || files.length === 0) return
  Array.from(files).forEach(file => {
    const reader = new FileReader()
    reader.onload = () => {
      const doc: AgencyDocument = {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        category,
        file_data: reader.result as string,
        file_type: file.type,
        file_size: file.size,
        uploaded_at: new Date().toISOString(),
      }
      setDocs(prev => [...prev, doc])
    }
    reader.readAsDataURL(file)
  })
}

// ── Editable Field with Integrated File Upload Icon & Doc Viewer ──
function InputFieldWithUpload({
  name,
  label,
  placeholder,
  defaultValue,
  category,
  documents,
  onAttach,
  onRemove,
  onPreview,
  required,
}: {
  name: string
  label: string
  placeholder?: string
  defaultValue?: string
  category: 'trade_license' | 'tax_registration' | 'agreement' | 'noc'
  documents: AgencyDocument[]
  onAttach: (files: FileList | null) => void
  onRemove: (docId: string) => void
  onPreview: (doc: AgencyDocument) => void
  required?: boolean
}) {
  const catDocs = documents.filter(d => d.category === category)
  const uploadInputId = `upload-${category}-${name}-${Math.random().toString(36).slice(2, 7)}`

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[11.5px] font-bold text-slate-700">{label}</label>
        {catDocs.length > 0 && (
          <span className="text-[10px] font-black text-teal-700 bg-teal-50 border border-teal-200/80 px-1.5 py-0.2 rounded-full flex items-center gap-1">
            <Paperclip size={9} />
            <span>{catDocs.length} {catDocs.length === 1 ? 'file' : 'files'}</span>
          </span>
        )}
      </div>

      <div className="relative flex items-center">
        <input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          className="w-full rounded-xl border border-slate-200 bg-white pl-3 pr-10 py-2 text-[12px] font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600/30 transition-all shadow-2xs"
        />

        {/* Upload Icon attached directly beside the editable field */}
        <label
          htmlFor={uploadInputId}
          className="absolute right-1.5 p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 cursor-pointer transition-colors"
          title={`Upload document attachment for ${label}`}
        >
          <Upload size={14} className="stroke-[2.2]" />
          <input
            id={uploadInputId}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={e => {
              onAttach(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {/* Uploaded documents micro-pills */}
      {catDocs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {catDocs.map(doc => (
            <div
              key={doc.id}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-teal-50/90 border border-teal-200/80 text-[10.5px] text-teal-900 shadow-2xs transition-all max-w-full"
            >
              <Paperclip size={10} className="text-teal-700 shrink-0" />
              <span className="font-semibold truncate max-w-[125px]" title={doc.name}>
                {doc.name}
              </span>
              <button
                type="button"
                onClick={() => onPreview(doc)}
                className="text-teal-700 hover:text-teal-950 p-0.5 rounded hover:bg-teal-100/80 cursor-pointer"
                title="Preview / Download Document"
              >
                <Eye size={11} />
              </button>
              <button
                type="button"
                onClick={() => onRemove(doc.id)}
                className="text-slate-400 hover:text-rose-600 p-0.5 rounded hover:bg-rose-50 cursor-pointer"
                title="Remove Document"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Agencies() {
  const navigate = useNavigate()
  const { agencies, addAgency, updateAgency, deleteAgency, employees, clients } = useData()

  // ── Safaeewala Active Clients Count ──
  const safaeewalaActiveClientsCount = useMemo(() => {
    return (clients || []).filter(c => Boolean(c.last_service && new Date(c.last_service) > new Date('2026-01-01'))).length
  }, [clients])

  // ── View Mode Switcher (Grid vs Table) ──
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    return safeLocalStorageGet('agencies_view_mode', 'grid')
  })

  useEffect(() => {
    safeLocalStorageSet('agencies_view_mode', viewMode)
  }, [viewMode])

  const handleOpenAgency = (agency: Agency) => {
    const scrollEl = document.getElementById('main-content-scroll')
    if (scrollEl) {
      scrollEl.style.scrollBehavior = 'auto'
      scrollEl.scrollTop = 0
    }
    window.scrollTo(0, 0)
    const slug = slugifyAgencyName(agency.name) || agency.id
    navigate(`/agencies/${encodeURIComponent(slug)}`)
  }

  // ── Search & Filter State ──
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // ── Modal State ──
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Agency | null>(null)
  const [previewDoc, setPreviewDoc] = useState<AgencyDocument | null>(null)

  // ── Add Modal Form State ──
  const [addStatus, setAddStatus] = useState<'active' | 'inactive'>('active')
  const [addCompanyType, setAddCompanyType] = useState<'Third Party' | 'Parent Company'>('Third Party')
  const [addReplacementGuarantee, setAddReplacementGuarantee] = useState<'Yes' | 'No'>('Yes')
  const [addContacts, setAddContacts] = useState<AgencyContactPerson[]>([
    { id: 'cp-1', name: '', phone: '', email: '', role: 'Account Manager' }
  ])
  const [addDocs, setAddDocs] = useState<AgencyDocument[]>([])
  const [addPaymentTerms, setAddPaymentTerms] = useState('Monthly')
  const [addTerminationNotice, setAddTerminationNotice] = useState('1 Month')

  // ── Edit Modal Form State ──
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active')
  const [editCompanyType, setEditCompanyType] = useState<'Third Party' | 'Parent Company'>('Third Party')
  const [editReplacementGuarantee, setEditReplacementGuarantee] = useState<'Yes' | 'No'>('Yes')
  const [editContacts, setEditContacts] = useState<AgencyContactPerson[]>([])
  const [editDocs, setEditDocs] = useState<AgencyDocument[]>([])
  const [editPaymentTerms, setEditPaymentTerms] = useState('Monthly')
  const [editTerminationNotice, setEditTerminationNotice] = useState('1 Month')

  // Synchronize edit states whenever editingAgency changes
  useEffect(() => {
    if (editingAgency) {
      setEditStatus(editingAgency.status || 'active')
      setEditCompanyType(editingAgency.company_type || 'Third Party')
      setEditReplacementGuarantee(
        editingAgency.replacement_guarantee === 'No' || editingAgency.replacement_guarantee_enabled === false
          ? 'No'
          : 'Yes'
      )
      setEditContacts(
        editingAgency.contact_persons && editingAgency.contact_persons.length > 0
          ? editingAgency.contact_persons
          : [{ id: 'cp-1', name: editingAgency.contact_person || '', phone: editingAgency.phone || '', email: editingAgency.email || '', role: 'Account Manager' }]
      )
      setEditDocs(editingAgency.documents || [])
      setEditPaymentTerms(editingAgency.payment_terms || 'Monthly')
      setEditTerminationNotice(editingAgency.termination_notice || '1 Month')
    }
  }, [editingAgency])

  const handleOpenAddModal = () => {
    setAddStatus('active')
    setAddCompanyType('Third Party')
    setAddReplacementGuarantee('Yes')
    setAddContacts([{ id: `cp-${Date.now()}`, name: '', phone: '', email: '', role: 'Account Manager' }])
    setAddDocs([])
    setAddPaymentTerms('Monthly')
    setAddTerminationNotice('1 Month')
    setShowAddModal(true)
  }

  // ── Quick Document Shortcut Handler (Trade License & NOC) ──
  const handleQuickDocOpen = (
    e: React.MouseEvent,
    agency: Agency,
    category: 'trade_license' | 'noc'
  ) => {
    e.stopPropagation()
    const doc = agency.documents?.find(d => d.category === category)
    if (doc) {
      setPreviewDoc(doc)
      return
    }

    const certNumber = category === 'trade_license' ? agency.trade_license_no : agency.noc_no
    if (certNumber) {
      setPreviewDoc({
        id: `cert-${category}-${agency.id}`,
        name: category === 'trade_license'
          ? `${agency.name} — Commercial Trade License (${certNumber})`
          : `${agency.name} — No Objection Certificate (${certNumber})`,
        category,
        file_type: 'image/svg+xml',
        uploaded_at: agency.license_issue_date || agency.created_at,
        file_data: generateCertificateDataUrl(agency, category, certNumber),
      })
      return
    }

    // If neither uploaded document nor license number is present, open edit modal to add it
    setEditingAgency(agency)
  }

  // ── Map of agency ID to count of employees ──
  const staffCountByAgency = useMemo(() => {
    const counts = new Map<string, number>()
    for (const emp of employees) {
      if (emp.agency_id) {
        counts.set(emp.agency_id, (counts.get(emp.agency_id) || 0) + 1)
      } else if (emp.agency_name) {
        counts.set(emp.agency_name, (counts.get(emp.agency_name) || 0) + 1)
      }
    }
    return counts
  }, [employees])

  // ── Filtered Agencies with Parent Company ALWAYS Pinned at Position #1 ──
  const filteredAgencies = useMemo(() => {
    const q = search.toLowerCase().trim()
    const list = agencies.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (!q) return true
      return (
        a.name.toLowerCase().includes(q) ||
        (a.contact_person && a.contact_person.toLowerCase().includes(q)) ||
        (a.phone && a.phone.toLowerCase().includes(q)) ||
        (a.email && a.email.toLowerCase().includes(q)) ||
        (a.notes && a.notes.toLowerCase().includes(q)) ||
        (a.address && a.address.toLowerCase().includes(q))
      )
    })

    // ── Master Pinning Rule: Parent Company ALWAYS at Position #1 ──
    return [...list].sort((a, b) => {
      const aIsParent = a.company_type === 'Parent Company' || a.id === 'agency-safaeewala' || a.name.toLowerCase().includes('safaeewala')
      const bIsParent = b.company_type === 'Parent Company' || b.id === 'agency-safaeewala' || b.name.toLowerCase().includes('safaeewala')
      if (aIsParent && !bIsParent) return -1
      if (!aIsParent && bIsParent) return 1
      return 0
    })
  }, [agencies, search, statusFilter])

  // ── Summary KPI Metrics ──
  const summaryMetrics = useMemo(() => {
    const total = agencies.length
    const active = agencies.filter(a => a.status === 'active').length
    const totalStaffFromAgencies = employees.filter(isThirdPartyEmployee).length
    const licensedAgencies = agencies.filter(a => a.trade_license_no || a.license_expiry_date || a.license_issue_date).length

    return { total, active, totalStaffFromAgencies, licensedAgencies }
  }, [agencies, employees])

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">

      {/* ── Page Hero Header ── */}
      <PageHero
        title="Agencies & Manpower Partners"
        subtitle="Manage external recruitment agencies, contracted staff, and vendor payment terms in Dubai."
        statusChip="Vendor Management"
        actionLabel="Add New Agency"
        onAction={handleOpenAddModal}
      />

      {/* ── KPI Stat Cards (Clickable Quick Filters) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => { setStatusFilter('all'); setSearch('') }}
          className={`bg-white rounded-[24px] border shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${
            statusFilter === 'all' && !search ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-200/80 hover:border-slate-300'
          }`}
          title="Click to view all agencies"
        >
          <div className="flex items-start justify-between mb-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Building2 size={18} />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              Partners
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">{summaryMetrics.total}</p>
          <p className="text-[12px] font-bold text-slate-700 mt-0.5">Total Agencies</p>
        </div>

        <div
          onClick={() => setStatusFilter('active')}
          className={`bg-white rounded-[24px] border shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${
            statusFilter === 'active' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200/80 hover:border-slate-300'
          }`}
          title="Click to filter active agencies"
        >
          <div className="flex items-start justify-between mb-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Active
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">{summaryMetrics.active}</p>
          <p className="text-[12px] font-bold text-slate-700 mt-0.5">Active Agencies</p>
        </div>

        <div
          onClick={() => navigate('/employees?agency=third_party')}
          className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-400 group"
          title="Click to view all third-party supplied cleaners in Employees directory"
        >
          <div className="flex items-start justify-between mb-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Users size={18} />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 flex items-center gap-1">
              <span>View All</span>
              <ArrowUpRight size={10} />
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">{summaryMetrics.totalStaffFromAgencies}</p>
          <p className="text-[12px] font-bold text-slate-700 mt-0.5">Supplied Cleaners (Active)</p>
        </div>

        <div
          onClick={() => { setSearch(''); setStatusFilter('all') }}
          className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-amber-400"
          title="Licensed and verified vendors"
        >
          <div className="flex items-start justify-between mb-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Shield size={18} />
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              Verified
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">{summaryMetrics.licensedAgencies}</p>
          <p className="text-[12px] font-bold text-slate-700 mt-0.5">Licensed Agencies</p>
        </div>
      </div>

      {/* ── Search & Filter Bar ── */}
      <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-wrap">

          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search agencies by name, contact person, phone, email, notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-[13px] pl-10 pr-9 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 placeholder-slate-400 font-medium text-slate-800 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 shrink-0">
            {[
              { id: 'all',      label: 'All Partners' },
              { id: 'active',   label: 'Active' },
              { id: 'inactive', label: 'Inactive' },
            ].map(pill => {
              const active = statusFilter === pill.id
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {pill.label}
                </button>
              )
            })}
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-teal-700 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-teal-700 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Table View (Full Width)"
            >
              <List size={15} />
            </button>
          </div>

          {/* Count Pill */}
          <span className="text-[12px] font-bold text-slate-600 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200/70 shrink-0 ml-auto">
            Showing <strong className="text-teal-700">{filteredAgencies.length}</strong> of {agencies.length} agencies
          </span>

        </div>
      </div>

      {/* ── Agencies Content: Table View vs Grid Card View ── */}
      {filteredAgencies.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3.5">
            <Building2 size={26} />
          </div>
          <p className="text-[16px] font-black text-slate-800">No agencies match your search</p>
          <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search terms or add a new agency vendor to the system.
          </p>
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter('all') }}
            className="mt-4 px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-[12px] hover:bg-teal-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <RotateCcw size={13} /> Reset Filters
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="w-full bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Agency / Partner</th>
                  <th className="py-3.5 px-4">Contact Details</th>
                  <th className="py-3.5 px-4">Compliance Documents</th>
                  <th className="py-3.5 px-4 text-center">Supplied Staff / Quota</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgencies.map((agency, idx) => {
                  const count = staffCountByAgency.get(agency.id) || staffCountByAgency.get(agency.name) || 0
                  const isActive = agency.status === 'active'
                  const slug = slugifyAgencyName(agency.name) || agency.id

                  const isParent = agency.company_type === 'Parent Company' || agency.name.toLowerCase().includes('safaeewala')

                  return (
                    <tr
                      key={agency.id}
                      onClick={() => handleOpenAgency(agency)}
                      className={`transition-colors cursor-pointer group ${
                        isParent
                          ? 'bg-slate-900 text-white hover:bg-slate-800/95 border-b border-slate-800'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shadow-xs shrink-0 ${
                              isParent
                                ? 'bg-gradient-to-tr from-teal-400 to-emerald-400 text-slate-950 shadow-teal-500/20'
                                : 'text-white'
                            }`}
                            style={isParent ? undefined : {
                              background: idx % 3 === 0
                                ? 'linear-gradient(135deg, #0d9488, #115e59)'
                                : idx % 3 === 1
                                ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                                : 'linear-gradient(135deg, #d97706, #b45309)'
                            }}
                          >
                            <Building2 size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className={`font-extrabold transition-colors truncate ${
                                isParent ? 'text-white group-hover:text-teal-300' : 'text-[#111827] group-hover:text-teal-700'
                              }`}>
                                {agency.name}
                              </h4>
                              {isParent && (
                                <span className="text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/40 shrink-0">
                                  👑 Parent Company
                                </span>
                              )}
                            </div>
                            <p className={`text-[11.5px] truncate mt-0.5 ${
                              isParent ? 'text-teal-300/80 font-bold' : 'text-slate-500'
                            }`}>
                              {isParent ? 'Direct Corporate Fleet' : (agency.contact_person || 'Vendor Partner')}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {agency.phone && (
                            <p className={`font-semibold flex items-center gap-1.5 text-[12px] ${isParent ? 'text-slate-200' : 'text-slate-800'}`}>
                              <Phone size={11} className={isParent ? 'text-teal-400' : 'text-teal-600'} />
                              <span>{agency.phone}</span>
                            </p>
                          )}
                          {agency.email && (
                            <p className={`text-[11.5px] flex items-center gap-1.5 truncate ${isParent ? 'text-slate-300' : 'text-slate-500'}`}>
                              <Mail size={11} className={isParent ? 'text-teal-400' : 'text-teal-600 shrink-0'} />
                              <span className="truncate">{agency.email}</span>
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={e => handleQuickDocOpen(e, agency, 'trade_license')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                              agency.documents?.some(d => d.category === 'trade_license') || agency.trade_license_no
                                ? isParent
                                  ? 'bg-teal-950/80 border-teal-500/50 text-teal-200 hover:bg-teal-900 shadow-2xs'
                                  : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800 shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200/70 border-slate-200 text-slate-400'
                            }`}
                            title={
                              agency.documents?.some(d => d.category === 'trade_license') || agency.trade_license_no
                                ? 'Quick Preview Trade License'
                                : 'Upload Trade License'
                            }
                          >
                            <FileText size={11} className={agency.documents?.some(d => d.category === 'trade_license') || agency.trade_license_no ? 'text-emerald-600' : 'text-slate-400'} />
                            <span>Trade Lic</span>
                            {agency.documents?.some(d => d.category === 'trade_license') || agency.trade_license_no ? (
                              <CheckCircle2 size={10} className="text-emerald-600" />
                            ) : (
                              <span className="text-[9px]">+</span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={e => handleQuickDocOpen(e, agency, 'noc')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                              agency.documents?.some(d => d.category === 'noc') || agency.noc_no
                                ? isParent
                                  ? 'bg-teal-950/80 border-teal-500/50 text-teal-200 hover:bg-teal-900 shadow-2xs'
                                  : 'bg-teal-50 hover:bg-teal-100 border-teal-300 text-teal-800 shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200/70 border-slate-200 text-slate-400'
                            }`}
                            title={
                              agency.documents?.some(d => d.category === 'noc') || agency.noc_no
                                ? 'Quick Preview NOC'
                                : 'Upload NOC'
                            }
                          >
                            <Shield size={11} className={agency.documents?.some(d => d.category === 'noc') || agency.noc_no ? 'text-teal-600' : 'text-slate-400'} />
                            <span>NOC</span>
                            {agency.documents?.some(d => d.category === 'noc') || agency.noc_no ? (
                              <CheckCircle2 size={10} className="text-teal-600" />
                            ) : (
                              <span className="text-[9px]">+</span>
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          onClick={(e) => {
                            if (isParent) {
                              e.stopPropagation()
                              navigate('/clients?filter=active&agency=safaeewala')
                            }
                          }}
                          className={`inline-flex items-center gap-1 text-[12px] font-black px-2.5 py-0.5 rounded-full ${
                            isParent
                              ? 'text-teal-200 bg-teal-950/90 border border-teal-500/50 hover:bg-teal-900 hover:border-teal-400 cursor-pointer shadow-xs'
                              : 'text-slate-800 bg-slate-100'
                          }`}
                          title={isParent ? "Click to view Safaeewala's Active Clients" : undefined}
                        >
                          {isParent ? (
                            <>
                              <UserCheck size={12} className="text-teal-400" />
                              <span>{safaeewalaActiveClientsCount} Active Clients</span>
                            </>
                          ) : (
                            <>
                              <Users size={12} className="text-teal-600" />
                              <span>{count} Active</span>
                              {agency.quota_cleaners ? (
                                <span className="text-slate-400 font-semibold text-[11px]">/ {agency.quota_cleaners} Quota</span>
                              ) : null}
                            </>
                          )}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleOpenAgency(agency)}
                            className="text-[11.5px] font-extrabold text-teal-700 hover:text-white bg-teal-50 hover:bg-teal-600 px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                          >
                            <span>Open Dashboard</span>
                            <ArrowRight size={12} />
                          </button>

                          {/* Active / Inactive Quick Toggle Switch */}
                          <button
                            type="button"
                            onClick={() => {
                              const nextStatus = agency.status === 'active' ? 'inactive' : 'active'
                              updateAgency(agency.id, { status: nextStatus })
                            }}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border transition-all cursor-pointer ${
                              agency.status === 'active'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : 'bg-slate-100 border-slate-300 text-slate-500'
                            }`}
                            title={agency.status === 'active' ? 'Agency is Active. Click to deactivate' : 'Agency is Inactive. Click to activate'}
                          >
                            <span
                              className={`relative inline-flex h-3.5 w-6.5 shrink-0 rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                                agency.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                  agency.status === 'active' ? 'translate-x-3' : 'translate-x-0'
                                }`}
                              />
                            </span>
                            <span className="text-[10px] font-black uppercase">
                              {agency.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingAgency(agency)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Edit Agency"
                          >
                            <Edit2 size={13.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(agency)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete Agency"
                          >
                            <Trash2 size={13.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAgencies.map((agency, idx) => {
            const count = staffCountByAgency.get(agency.id) || staffCountByAgency.get(agency.name) || 0
            const isActive = agency.status === 'active'
            const slug = slugifyAgencyName(agency.name) || agency.id
            const theme = LIGHT_AGENCY_CARD_THEMES[idx % LIGHT_AGENCY_CARD_THEMES.length]
            const isParent = agency.company_type === 'Parent Company' || agency.name.toLowerCase().includes('safaeewala')

            return (
              <div
                key={agency.id}
                onClick={() => handleOpenAgency(agency)}
                className={`rounded-[26px] border transition-all duration-200 flex flex-col justify-between p-5.5 group relative overflow-hidden cursor-pointer hover:-translate-y-1 ${
                  isParent
                    ? 'bg-gradient-to-br from-[#061413] via-[#0b2421] to-[#041210] border-teal-500/70 shadow-[0_14px_45px_rgba(4,20,18,0.65)] hover:border-teal-300 hover:shadow-[0_20px_55px_rgba(20,184,166,0.35)] ring-1 ring-teal-500/50 text-slate-100'
                    : `${theme.bg} ${theme.border} shadow-[0_4px_20px_rgba(15,23,42,0.03)] ${theme.hoverShadow} ${theme.hoverBorder}`
                }`}
              >
                {/* Ambient glow blobs for Parent Company */}
                {isParent && (
                  <>
                    <div className="absolute -top-16 -right-16 w-44 h-44 bg-teal-500/20 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />
                  </>
                )}

                {/* Header: Icon, Name, Pinned Badge, Status Badge */}
                <div>
                  {/* Top Pin Banner for Parent Company */}
                  {isParent && (
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-wider px-2.5 py-0.8 rounded-full bg-amber-400 text-amber-950 shadow-xs border border-amber-300">
                        <Pin size={10} className="fill-amber-950" />
                        <span>PINNED MASTER HQ</span>
                      </span>
                      <span className="text-[10px] font-bold text-teal-300/90 flex items-center gap-1">
                        <Sparkles size={11} className="text-teal-400" />
                        <span>Safaeewala Fleet</span>
                      </span>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3 mb-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold shadow-sm shrink-0 ${
                          isParent
                            ? 'bg-gradient-to-tr from-teal-400 to-emerald-400 text-slate-950 shadow-teal-500/30'
                            : 'text-white'
                        }`}
                        style={isParent ? undefined : {
                          background: theme.iconGradient
                        }}
                      >
                        {isParent ? <Crown size={22} className="stroke-[2.2]" /> : <Building2 size={20} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`text-[15.5px] font-black truncate transition-colors ${
                            isParent
                              ? 'text-white group-hover:text-teal-300'
                              : `text-slate-900 ${theme.titleHover}`
                          }`}>
                            {agency.name}
                          </h3>
                        </div>
                        <p className={`text-[11.5px] truncate mt-0.5 ${
                          isParent ? 'text-teal-300/90 font-bold' : 'text-slate-600'
                        }`}>
                          {isParent ? 'Direct Corporate Fleet • In-House Master' : (agency.contact_person || 'Vendor Partner')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border shrink-0 ${
                          isParent
                            ? isActive
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                            : isActive
                            ? 'bg-emerald-100/90 text-emerald-900 border-emerald-300'
                            : 'bg-slate-200/80 text-slate-700 border-slate-300'
                        }`}
                      >
                        {isActive ? '● Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Contact Info Pills with Direct Click to Call / Email */}
                  <div className={`space-y-1.5 mb-4 text-[12px] ${isParent ? 'text-slate-300' : 'text-slate-700'}`}>
                    {agency.phone && (
                      <a
                        href={`tel:${agency.phone}`}
                        onClick={e => e.stopPropagation()}
                        className={`inline-flex items-center gap-2 hover:underline transition-colors ${isParent ? 'text-teal-200' : 'text-slate-900'}`}
                        title="Click to call agency"
                      >
                        <Phone size={13} className={isParent ? 'text-teal-400 shrink-0' : 'text-teal-700 shrink-0'} />
                        <span className="font-semibold">{agency.phone}</span>
                      </a>
                    )}
                    {agency.email && (
                      <div className="truncate">
                        <a
                          href={`mailto:${agency.email}`}
                          onClick={e => e.stopPropagation()}
                          className={`inline-flex items-center gap-2 truncate hover:underline transition-colors ${isParent ? 'text-slate-300' : 'text-slate-700'}`}
                          title="Click to send email"
                        >
                          <Mail size={13} className={isParent ? 'text-teal-400 shrink-0' : 'text-teal-700 shrink-0'} />
                          <span className="truncate">{agency.email}</span>
                        </a>
                      </div>
                    )}
                    {agency.address && (
                      <div className="flex items-center gap-2 truncate text-slate-500">
                        <MapPin size={13} className={isParent ? 'text-teal-400 shrink-0' : 'text-teal-700 shrink-0'} />
                        <span className={`truncate ${isParent ? 'text-slate-400' : 'text-slate-600'}`}>{agency.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Staff Quota (Contract Target) & Uploaded Documents Shortcuts Block */}
                  <div className={`grid grid-cols-2 gap-2.5 rounded-2xl p-3 border mb-4 ${
                    isParent
                      ? 'bg-slate-900/80 border-teal-500/30'
                      : `${theme.statBg}`
                  }`}>
                    {/* Left: Staff Quota (Clickable to jump to SLA & Quota details) */}
                    <div
                      className="min-w-0 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl p-1 -m-1 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenAgency(agency)
                      }}
                      title="Click to view Staff SLA and contract terms"
                    >
                      <div className="flex items-center justify-between">
                        <p className={`text-[10px] font-extrabold uppercase tracking-wider ${
                          isParent ? 'text-teal-400/80' : 'text-slate-500'
                        }`}>Staff Quota</p>
                        <ArrowUpRight size={11} className={`opacity-0 group-hover:opacity-100 transition-opacity ${isParent ? 'text-teal-300' : 'text-teal-600'}`} />
                      </div>
                      <p className={`text-[14px] font-black mt-0.5 truncate ${
                        isParent ? 'text-white' : 'text-slate-900'
                      }`}>
                        {agency.quota_cleaners || count || 0} Staff
                      </p>
                      <p className={`text-[10px] font-semibold mt-0.5 truncate ${
                        isParent ? 'text-teal-300/70' : 'text-slate-500'
                      }`}>
                        Contract Target
                      </p>
                    </div>

                    {/* Right: Quick Document Shortcuts (Trade License & NOC) */}
                    <div className="min-w-0" onClick={e => e.stopPropagation()}>
                      <p className={`text-[10px] font-extrabold uppercase tracking-wider mb-1.5 ${
                        isParent ? 'text-teal-400/80' : 'text-slate-500'
                      }`}>
                        Compliance Docs
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {/* Trade License Shortcut Button */}
                        <button
                          type="button"
                          onClick={(e) => handleQuickDocOpen(e, agency, 'trade_license')}
                          className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border flex items-center justify-between gap-1 transition-all cursor-pointer ${
                            agency.documents?.some(d => d.category === 'trade_license') || agency.trade_license_no
                              ? isParent
                                ? 'bg-teal-950/90 border-teal-500/50 text-teal-200 hover:bg-teal-900 hover:border-teal-400 shadow-2xs'
                                : 'bg-emerald-50 hover:bg-emerald-100/90 border-emerald-300 text-emerald-900 shadow-2xs'
                              : isParent
                              ? 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                              : 'bg-white/80 hover:bg-slate-100 border-slate-200 text-slate-500'
                          }`}
                          title={
                            agency.documents?.find(d => d.category === 'trade_license')
                              ? `View Uploaded Trade License: ${agency.documents.find(d => d.category === 'trade_license')!.name}`
                              : agency.trade_license_no
                              ? `Quick Preview Trade License (${agency.trade_license_no})`
                              : 'Click to upload Trade License'
                          }
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <FileText size={11} className={agency.documents?.some(d => d.category === 'trade_license') || agency.trade_license_no ? 'text-emerald-600 shrink-0' : 'text-slate-400 shrink-0'} />
                            <span className="truncate">Trade Lic</span>
                          </span>
                          {agency.documents?.some(d => d.category === 'trade_license') || agency.trade_license_no ? (
                            <span className={`text-[9px] font-black px-1 rounded-sm shrink-0 ${
                              isParent ? 'bg-teal-500/30 text-teal-300' : 'bg-emerald-200 text-emerald-900'
                            }`}>
                              VIEW
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-bold text-slate-400 shrink-0">+ Add</span>
                          )}
                        </button>

                        {/* NOC Shortcut Button */}
                        <button
                          type="button"
                          onClick={(e) => handleQuickDocOpen(e, agency, 'noc')}
                          className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border flex items-center justify-between gap-1 transition-all cursor-pointer ${
                            agency.documents?.some(d => d.category === 'noc') || agency.noc_no
                              ? isParent
                                ? 'bg-teal-950/90 border-teal-500/50 text-teal-200 hover:bg-teal-900 hover:border-teal-400 shadow-2xs'
                                : 'bg-teal-50 hover:bg-teal-100/90 border-teal-300 text-teal-900 shadow-2xs'
                              : isParent
                              ? 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                              : 'bg-white/80 hover:bg-slate-100 border-slate-200 text-slate-500'
                          }`}
                          title={
                            agency.documents?.find(d => d.category === 'noc')
                              ? `View Uploaded NOC: ${agency.documents.find(d => d.category === 'noc')!.name}`
                              : agency.noc_no
                              ? `Quick Preview NOC (${agency.noc_no})`
                              : 'Click to upload NOC'
                          }
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <Shield size={11} className={agency.documents?.some(d => d.category === 'noc') || agency.noc_no ? 'text-teal-600 shrink-0' : 'text-slate-400 shrink-0'} />
                            <span className="truncate">NOC</span>
                          </span>
                          {agency.documents?.some(d => d.category === 'noc') || agency.noc_no ? (
                            <span className={`text-[9px] font-black px-1 rounded-sm shrink-0 ${
                              isParent ? 'bg-teal-500/30 text-teal-300' : 'bg-teal-200 text-teal-900'
                            }`}>
                              VIEW
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-bold text-slate-400 shrink-0">+ Add</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sourced Staff / Active Clients Counter */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isParent) {
                        navigate('/clients?filter=active&agency=safaeewala')
                      } else {
                        handleOpenAgency(agency)
                      }
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border mb-4 shadow-2xs transition-all cursor-pointer ${
                      isParent
                        ? 'bg-slate-900/70 border-teal-500/40 hover:border-teal-400 hover:bg-slate-900/95 ring-1 ring-teal-500/20'
                        : 'bg-white/80 border-slate-200/80 hover:border-teal-400 hover:bg-teal-50/40'
                    }`}
                    title={
                      isParent
                        ? "Click to view Safaeewala's Active Clients"
                        : "Click to view assigned cleaners list in Agency Profile"
                    }
                  >
                    <span className={`text-[12px] font-bold flex items-center gap-1.5 ${
                      isParent ? 'text-teal-200' : 'text-slate-800'
                    }`}>
                      {isParent ? (
                        <>
                          <UserCheck size={14} className="text-teal-400" />
                          <span>Active Clients (Safaeewala)</span>
                        </>
                      ) : (
                        <>
                          <Users size={14} className="text-teal-700" />
                          <span>Supplied Cleaners (Active)</span>
                        </>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[13px] font-black px-2.5 py-0.5 rounded-lg border shadow-2xs ${
                        isParent
                          ? 'bg-teal-950/90 text-teal-300 border-teal-500/50 shadow-xs'
                          : 'bg-white text-slate-900 border-slate-200'
                      }`}>
                        {isParent ? `${safaeewalaActiveClientsCount} Active Clients` : `${count} Active`}
                      </span>
                      {!isParent && agency.quota_cleaners ? (
                        <span className={`text-[11px] font-semibold ${isParent ? 'text-slate-400' : 'text-slate-500'}`}>
                          / {agency.quota_cleaners}
                        </span>
                      ) : null}
                      <ArrowRight size={12} className={isParent ? 'text-teal-400' : 'text-teal-700'} />
                    </div>
                  </div>

                  {/* License Expiry Info */}
                  {agency.license_expiry_date && (
                    <div className={`text-[11.5px] font-medium mb-3 flex items-center justify-between px-3 py-1.5 rounded-xl border ${
                      isParent
                        ? 'bg-slate-900/60 border-teal-500/25 text-slate-300'
                        : 'bg-white/70 border-slate-200/60 text-slate-600'
                    }`}>
                      <span>License Expiry:</span>
                      <strong className={isParent ? 'text-teal-300' : 'text-slate-800'}>{formatDate(agency.license_expiry_date)}</strong>
                    </div>
                  )}

                  {/* Notes */}
                  {agency.notes && (
                    <p className={`text-[11.5px] italic line-clamp-2 mb-4 p-2 rounded-lg border ${
                      isParent
                        ? 'bg-slate-900/60 border-teal-500/25 text-slate-300'
                        : 'bg-white/60 border-slate-200/60 text-slate-600'
                    }`}>
                      "{agency.notes}"
                    </p>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className={`pt-3 border-t flex items-center justify-between gap-2 ${
                  isParent ? 'border-teal-500/20' : 'border-slate-200/60'
                }`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenAgency(agency)
                    }}
                    className={`text-[12px] font-extrabold px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-xs ${
                      isParent
                        ? 'bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-slate-950 font-black shadow-teal-500/20'
                        : `${theme.btnBg}`
                    }`}
                  >
                    <span>Open Dashboard</span>
                    <ArrowRight size={13} />
                  </button>

                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {/* Active / Inactive Quick Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => {
                        const nextStatus = agency.status === 'active' ? 'inactive' : 'active'
                        updateAgency(agency.id, { status: nextStatus })
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border transition-all cursor-pointer ${
                        isParent
                          ? agency.status === 'active'
                            ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                          : agency.status === 'active'
                          ? 'bg-emerald-50/90 border-emerald-300 text-emerald-800'
                          : 'bg-slate-100 border-slate-300 text-slate-500'
                      }`}
                      title={agency.status === 'active' ? 'Agency is Active. Click to deactivate' : 'Agency is Inactive. Click to activate'}
                    >
                      <span
                        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                          agency.status === 'active' ? 'bg-emerald-500' : (isParent ? 'bg-slate-700' : 'bg-slate-300')
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                            agency.status === 'active' ? 'translate-x-3' : 'translate-x-0'
                          }`}
                        />
                      </span>
                      <span className="text-[10px] font-black uppercase">
                        {agency.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingAgency(agency)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isParent
                          ? 'text-slate-300 hover:text-teal-300 hover:bg-slate-800'
                          : 'text-slate-600 hover:text-teal-800 hover:bg-white/80'
                      }`}
                      title="Edit Agency"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(agency)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isParent
                          ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/50'
                          : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                      }`}
                      title="Delete Agency"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add New Agency Modal ── */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Agency Vendor"
        size="xl"
        className="max-w-6xl"
        headerActions={
          <div className="flex items-center gap-3">
            {/* Header Active / Inactive Toggle Switch before Cancel */}
            <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
              <span className="text-[11px] font-bold text-slate-500">Status:</span>
              <button
                type="button"
                onClick={() => setAddStatus(prev => prev === 'active' ? 'inactive' : 'active')}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  addStatus === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
                title={`Vendor is ${addStatus}. Click to toggle.`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                    addStatus === 'active' ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className={`text-[11px] font-black uppercase tracking-wider ${
                addStatus === 'active' ? 'text-emerald-700' : 'text-slate-400'
              }`}>
                {addStatus === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(false)}
              className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-agency-form"
              size="sm"
              className="h-8 px-4 text-[11.5px] bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Check size={13} className="stroke-[2.5]" />
              <span>Save Agency</span>
            </Button>
          </div>
        }
      >
        <form
          id="add-agency-form"
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const contractedAmount = Number(fd.get('contracted_amount')) || undefined
            const primaryContact = addContacts.find(c => c.name.trim())?.name || ''
            const validContacts = addContacts.filter(c => c.name.trim() || c.phone?.trim())

            addAgency({
              name: fd.get('name') as string,
              company_type: addCompanyType,
              contact_person: primaryContact || undefined,
              contact_persons: validContacts.length > 0 ? validContacts : undefined,
              phone: fd.get('phone') as string,
              email: (fd.get('email') as string) || undefined,
              address: (fd.get('address') as string) || undefined,
              price: contractedAmount,
              contracted_amount: contractedAmount,
              quota_cleaners: Number(fd.get('quota_cleaners')) || undefined,
              replacement_guarantee: addReplacementGuarantee === 'Yes' ? 'Yes (Replacement supplied within 24 hours)' : 'No',
              replacement_guarantee_enabled: addReplacementGuarantee === 'Yes',
              contract_ref: (fd.get('contract_ref') as string) || undefined,
              contract_start_date: (fd.get('contract_start_date') as string) || undefined,
              contract_end_date: (fd.get('contract_end_date') as string) || undefined,
              trade_license_no: (fd.get('trade_license_no') as string) || undefined,
              license_issue_date: (fd.get('license_issue_date') as string) || undefined,
              license_expiry_date: (fd.get('license_expiry_date') as string) || undefined,
              trn_no: (fd.get('trn_no') as string) || undefined,
              noc_no: (fd.get('noc_no') as string) || undefined,
              payment_terms: addPaymentTerms,
              termination_notice: addTerminationNotice,
              documents: addDocs,
              notes: (fd.get('notes') as string) || undefined,
              status: addStatus,
            })
            setShowAddModal(false)
          }}
        >
          {/* 3-Column Layout without vertical scroll */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Column 1: Core Agency Info & Contacts */}
            <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
              <div className="space-y-2.5">
                <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                  <Building2 size={13} className="text-teal-600" />
                  <span>Agency Profile & Contacts</span>
                </h4>

                <Input name="name" label="Agency Name *" placeholder="e.g. Al Safa Manpower LLC" required />
                <Input name="phone" label="Primary Phone Number *" placeholder="+971 4 000 0000" required />
                <Input name="email" label="Email Address" type="email" placeholder="agency@example.ae" />
                <Input name="address" label="UAE Office Address" placeholder="e.g. Deira Business Center, Dubai" />

                {/* Multiple Contact Persons */}
                <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <Users size={11} className="text-teal-600" />
                      <span>Contact Persons ({addContacts.length})</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setAddContacts(prev => [
                          ...prev,
                          { id: `cp-${Date.now()}`, name: '', phone: '', email: '', role: 'Account Manager' }
                        ])
                      }
                      className="text-[10.5px] font-bold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100/70 px-2 py-0.5 rounded-lg border border-teal-200/60 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={10} />
                      <span>Add Contact</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {addContacts.map((cp, idx) => (
                      <div key={cp.id} className="p-2 rounded-xl bg-white border border-slate-200/80 space-y-1 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[9.5px] font-black uppercase text-slate-400">
                            Contact #{idx + 1} {idx === 0 ? '(Primary)' : ''}
                          </span>
                          {addContacts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setAddContacts(prev => prev.filter(c => c.id !== cp.id))}
                              className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                              title="Remove contact"
                            >
                              <X size={11} />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            placeholder="Full Name *"
                            value={cp.name}
                            onChange={e => {
                              const val = e.target.value
                              setAddContacts(prev => prev.map(c => c.id === cp.id ? { ...c, name: val } : c))
                            }}
                            className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 font-medium"
                            required={idx === 0}
                          />
                          <input
                            type="text"
                            placeholder="Phone / Role"
                            value={cp.phone}
                            onChange={e => {
                              const val = e.target.value
                              setAddContacts(prev => prev.map(c => c.id === cp.id ? { ...c, phone: val } : c))
                            }}
                            className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 font-medium"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Company Type Dropdown (Shifted below Contact Persons) */}
                <div className="pt-2 border-t border-slate-200/70">
                  <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Company Type</label>
                  <select
                    value={addCompanyType}
                    onChange={e => setAddCompanyType(e.target.value as any)}
                    className="w-full text-[12px] px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option value="Third Party">Third Party (Vendor)</option>
                    <option value="Parent Company">Parent Company (Safaeewala)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Column 2: Licensing, Tax & Documents */}
            <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-amber-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                <Shield size={13} className="text-amber-600" />
                <span>Licensing, Tax & Documents</span>
              </h4>

              {/* Trade License Field & Integrated Upload */}
              <InputFieldWithUpload
                name="trade_license_no"
                label="Trade license"
                placeholder="e.g. CN-1829472"
                category="trade_license"
                documents={addDocs}
                onAttach={files => handleFileUpload(files, 'trade_license', setAddDocs)}
                onRemove={id => setAddDocs(prev => prev.filter(d => d.id !== id))}
                onPreview={doc => setPreviewDoc(doc)}
              />

              <div className="grid grid-cols-2 gap-2">
                <Input name="license_issue_date" label="License Issue Date" type="date" />
                <Input name="license_expiry_date" label="License Expiry Date" type="date" />
              </div>

              {/* Tax Registration / TRN Field & Integrated Upload */}
              <InputFieldWithUpload
                name="trn_no"
                label="Tax TRN Number"
                placeholder="e.g. 100234567800001"
                category="tax_registration"
                documents={addDocs}
                onAttach={files => handleFileUpload(files, 'tax_registration', setAddDocs)}
                onRemove={id => setAddDocs(prev => prev.filter(d => d.id !== id))}
                onPreview={doc => setPreviewDoc(doc)}
              />

              {/* NOC (No Objection Certificate) Field & Integrated Upload */}
              <InputFieldWithUpload
                name="noc_no"
                label="NOC (No Objection Certificate)"
                placeholder="e.g. NOC-DXB-2024-912"
                category="noc"
                documents={addDocs}
                onAttach={files => handleFileUpload(files, 'noc', setAddDocs)}
                onRemove={id => setAddDocs(prev => prev.filter(d => d.id !== id))}
                onPreview={doc => setPreviewDoc(doc)}
              />

              <Input name="notes" label="Specialty & General Notes" placeholder="Specialties, roster notes..." />
            </div>

            {/* Column 3: Commercials & Agreement */}
            <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-indigo-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                <Users size={13} className="text-indigo-600" />
                <span>Commercials & Agreement</span>
              </h4>

              {/* Contracted Amount */}
              <Input name="contracted_amount" label="Contracted Amount (AED)" type="number" placeholder="e.g. 5000" />

              <div className="grid grid-cols-2 gap-2">
                {/* Staff Quota */}
                <Input name="quota_cleaners" label="Staff Quota (Target Staff)" type="number" placeholder="e.g. 5" defaultValue="5" />

                {/* Staff Replacement Guarantee Yes/No */}
                <div>
                  <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Replacement Guarantee</label>
                  <select
                    value={addReplacementGuarantee}
                    onChange={e => setAddReplacementGuarantee(e.target.value as any)}
                    className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option value="Yes">Yes (Guaranteed)</option>
                    <option value="No">No (Not Included)</option>
                  </select>
                </div>
              </div>

              {/* Agreement Field & Integrated Upload */}
              <InputFieldWithUpload
                name="contract_ref"
                label="Agreement / Contract Ref"
                placeholder="e.g. AGR-2024-ALSAFA-08"
                category="agreement"
                documents={addDocs}
                onAttach={files => handleFileUpload(files, 'agreement', setAddDocs)}
                onRemove={id => setAddDocs(prev => prev.filter(d => d.id !== id))}
                onPreview={doc => setPreviewDoc(doc)}
              />

              <div className="grid grid-cols-2 gap-2">
                <Input name="contract_start_date" label="Start Date" type="date" />
                <Input name="contract_end_date" label="End Date" type="date" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Payment Term */}
                <div>
                  <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Payment Term</label>
                  <select
                    value={addPaymentTerms}
                    onChange={e => setAddPaymentTerms(e.target.value)}
                    className="w-full text-[11.5px] px-2 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Bi-Weekly">Bi-Weekly</option>
                    <option value="Monthly (Net 15)">Monthly (Net 15)</option>
                    <option value="Monthly (Net 30)">Monthly (Net 30)</option>
                    <option value="Advance">Advance Paid</option>
                  </select>
                </div>

                {/* Termination Notice Period */}
                <div>
                  <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Termination Notice</label>
                  <select
                    value={addTerminationNotice}
                    onChange={e => setAddTerminationNotice(e.target.value)}
                    className="w-full text-[11.5px] px-2 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option value="1 Month">1 Month Notice</option>
                    <option value="2 Months">2 Months Notice</option>
                    <option value="15 Days">15 Days Notice</option>
                    <option value="3 Months">3 Months Notice</option>
                    <option value="Immediate">Immediate</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Edit Agency Modal ── */}
      <Modal
        open={!!editingAgency}
        onClose={() => setEditingAgency(null)}
        title="Edit Agency Vendor Details"
        size="xl"
        className="max-w-6xl"
        headerActions={
          <div className="flex items-center gap-3">
            {/* Header Active / Inactive Toggle Switch before Cancel */}
            <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
              <span className="text-[11px] font-bold text-slate-500">Status:</span>
              <button
                type="button"
                onClick={() => setEditStatus(prev => prev === 'active' ? 'inactive' : 'active')}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  editStatus === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
                title={`Vendor is ${editStatus}. Click to toggle.`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                    editStatus === 'active' ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className={`text-[11px] font-black uppercase tracking-wider ${
                editStatus === 'active' ? 'text-emerald-700' : 'text-slate-400'
              }`}>
                {editStatus === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingAgency(null)}
              className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-agency-form"
              size="sm"
              className="h-8 px-4 text-[11.5px] bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Check size={13} className="stroke-[2.5]" />
              <span>Update Agency</span>
            </Button>
          </div>
        }
      >
        {editingAgency && (
          <form
            id="edit-agency-form"
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const contractedAmount = Number(fd.get('contracted_amount')) || undefined
              const primaryContact = editContacts.find(c => c.name.trim())?.name || ''
              const validContacts = editContacts.filter(c => c.name.trim() || c.phone?.trim())

              updateAgency(editingAgency.id, {
                name: fd.get('name') as string,
                company_type: editCompanyType,
                contact_person: primaryContact || undefined,
                contact_persons: validContacts.length > 0 ? validContacts : undefined,
                phone: fd.get('phone') as string,
                email: (fd.get('email') as string) || undefined,
                address: (fd.get('address') as string) || undefined,
                price: contractedAmount,
                contracted_amount: contractedAmount,
                quota_cleaners: Number(fd.get('quota_cleaners')) || undefined,
                replacement_guarantee: editReplacementGuarantee === 'Yes' ? 'Yes (Replacement supplied within 24 hours)' : 'No',
                replacement_guarantee_enabled: editReplacementGuarantee === 'Yes',
                contract_ref: (fd.get('contract_ref') as string) || undefined,
                contract_start_date: (fd.get('contract_start_date') as string) || undefined,
                contract_end_date: (fd.get('contract_end_date') as string) || undefined,
                trade_license_no: (fd.get('trade_license_no') as string) || undefined,
                license_issue_date: (fd.get('license_issue_date') as string) || undefined,
                license_expiry_date: (fd.get('license_expiry_date') as string) || undefined,
                trn_no: (fd.get('trn_no') as string) || undefined,
                noc_no: (fd.get('noc_no') as string) || undefined,
                payment_terms: editPaymentTerms,
                termination_notice: editTerminationNotice,
                documents: editDocs,
                notes: (fd.get('notes') as string) || undefined,
                status: editStatus,
              })
              setEditingAgency(null)
            }}
          >
            {/* 3-Column Layout without vertical scroll */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Column 1: Core Agency Info & Contacts */}
              <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                    <Building2 size={13} className="text-teal-600" />
                    <span>Agency Profile & Contacts</span>
                  </h4>

                  <Input name="name" label="Agency Name *" defaultValue={editingAgency.name} required />
                  <Input name="phone" label="Primary Phone Number *" defaultValue={editingAgency.phone} required />
                  <Input name="email" label="Email Address" type="email" defaultValue={editingAgency.email} />
                  <Input name="address" label="UAE Office Address" defaultValue={editingAgency.address} />

                  {/* Multiple Contact Persons */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                        <Users size={11} className="text-teal-600" />
                        <span>Contact Persons ({editContacts.length})</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setEditContacts(prev => [
                            ...prev,
                            { id: `cp-${Date.now()}`, name: '', phone: '', email: '', role: 'Account Manager' }
                          ])
                        }
                        className="text-[10.5px] font-bold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100/70 px-2 py-0.5 rounded-lg border border-teal-200/60 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={10} />
                        <span>Add Contact</span>
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                      {editContacts.map((cp, idx) => (
                        <div key={cp.id} className="p-2 rounded-xl bg-white border border-slate-200/80 space-y-1 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[9.5px] font-black uppercase text-slate-400">
                              Contact #{idx + 1} {idx === 0 ? '(Primary)' : ''}
                            </span>
                            {editContacts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setEditContacts(prev => prev.filter(c => c.id !== cp.id))}
                                className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                                title="Remove contact"
                              >
                                <X size={11} />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              placeholder="Full Name *"
                              value={cp.name}
                              onChange={e => {
                                const val = e.target.value
                                setEditContacts(prev => prev.map(c => c.id === cp.id ? { ...c, name: val } : c))
                              }}
                              className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 font-medium"
                              required={idx === 0}
                            />
                            <input
                              type="text"
                              placeholder="Phone / Role"
                              value={cp.phone}
                              onChange={e => {
                                const val = e.target.value
                                setEditContacts(prev => prev.map(c => c.id === cp.id ? { ...c, phone: val } : c))
                              }}
                              className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 font-medium"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Company Type Dropdown (Shifted below Contact Persons) */}
                  <div className="pt-2 border-t border-slate-200/70">
                    <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Company Type</label>
                    <select
                      value={editCompanyType}
                      onChange={e => setEditCompanyType(e.target.value as any)}
                      className="w-full text-[12px] px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                    >
                      <option value="Third Party">Third Party (Vendor)</option>
                      <option value="Parent Company">Parent Company (Safaeewala)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Column 2: Licensing, Tax & Documents */}
              <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                <h4 className="text-[12px] font-black uppercase tracking-wider text-amber-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                  <Shield size={13} className="text-amber-600" />
                  <span>Licensing, Tax & Documents</span>
                </h4>

                {/* Trade License Field & Integrated Upload */}
                <InputFieldWithUpload
                  name="trade_license_no"
                  label="Trade license"
                  defaultValue={editingAgency.trade_license_no}
                  placeholder="e.g. CN-1829472"
                  category="trade_license"
                  documents={editDocs}
                  onAttach={files => handleFileUpload(files, 'trade_license', setEditDocs)}
                  onRemove={id => setEditDocs(prev => prev.filter(d => d.id !== id))}
                  onPreview={doc => setPreviewDoc(doc)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Input name="license_issue_date" label="License Issue Date" type="date" defaultValue={editingAgency.license_issue_date} />
                  <Input name="license_expiry_date" label="License Expiry Date" type="date" defaultValue={editingAgency.license_expiry_date} />
                </div>

                {/* Tax Registration / TRN Field & Integrated Upload */}
                <InputFieldWithUpload
                  name="trn_no"
                  label="Tax TRN Number"
                  defaultValue={editingAgency.trn_no}
                  placeholder="e.g. 100234567800001"
                  category="tax_registration"
                  documents={editDocs}
                  onAttach={files => handleFileUpload(files, 'tax_registration', setEditDocs)}
                  onRemove={id => setEditDocs(prev => prev.filter(d => d.id !== id))}
                  onPreview={doc => setPreviewDoc(doc)}
                />

                {/* NOC (No Objection Certificate) Field & Integrated Upload */}
                <InputFieldWithUpload
                  name="noc_no"
                  label="NOC (No Objection Certificate)"
                  defaultValue={editingAgency.noc_no}
                  placeholder="e.g. NOC-DXB-2024-912"
                  category="noc"
                  documents={editDocs}
                  onAttach={files => handleFileUpload(files, 'noc', setEditDocs)}
                  onRemove={id => setEditDocs(prev => prev.filter(d => d.id !== id))}
                  onPreview={doc => setPreviewDoc(doc)}
                />

                <Input name="notes" label="Specialty & General Notes" defaultValue={editingAgency.notes} />
              </div>

              {/* Column 3: Commercials & Agreement */}
              <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                <h4 className="text-[12px] font-black uppercase tracking-wider text-indigo-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                  <Users size={13} className="text-indigo-600" />
                  <span>Commercials & Agreement</span>
                </h4>

                {/* Contracted Amount */}
                <Input
                  name="contracted_amount"
                  label="Contracted Amount (AED)"
                  type="number"
                  defaultValue={editingAgency.contracted_amount ? String(editingAgency.contracted_amount) : (editingAgency.price ? String(editingAgency.price) : '')}
                  placeholder="e.g. 5000"
                />

                <div className="grid grid-cols-2 gap-2">
                  {/* Staff Quota */}
                  <Input name="quota_cleaners" label="Staff Quota (Target Staff)" type="number" defaultValue={String(editingAgency.quota_cleaners || 5)} />

                  {/* Staff Replacement Guarantee Yes/No */}
                  <div>
                    <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Replacement Guarantee</label>
                    <select
                      value={editReplacementGuarantee}
                      onChange={e => setEditReplacementGuarantee(e.target.value as any)}
                      className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                    >
                      <option value="Yes">Yes (Guaranteed)</option>
                      <option value="No">No (Not Included)</option>
                    </select>
                  </div>
                </div>

                {/* Agreement Field & Integrated Upload */}
                <InputFieldWithUpload
                  name="contract_ref"
                  label="Agreement / Contract Ref"
                  defaultValue={editingAgency.contract_ref}
                  placeholder="e.g. AGR-2024-ALSAFA-08"
                  category="agreement"
                  documents={editDocs}
                  onAttach={files => handleFileUpload(files, 'agreement', setEditDocs)}
                  onRemove={id => setEditDocs(prev => prev.filter(d => d.id !== id))}
                  onPreview={doc => setPreviewDoc(doc)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Input name="contract_start_date" label="Start Date" type="date" defaultValue={editingAgency.contract_start_date} />
                  <Input name="contract_end_date" label="End Date" type="date" defaultValue={editingAgency.contract_end_date} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Payment Term */}
                  <div>
                    <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Payment Term</label>
                    <select
                      value={editPaymentTerms}
                      onChange={e => setEditPaymentTerms(e.target.value)}
                      className="w-full text-[11.5px] px-2 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                    >
                      <option value="Monthly">Monthly</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Bi-Weekly">Bi-Weekly</option>
                      <option value="Monthly (Net 15)">Monthly (Net 15)</option>
                      <option value="Monthly (Net 30)">Monthly (Net 30)</option>
                      <option value="Advance">Advance Paid</option>
                    </select>
                  </div>

                  {/* Termination Notice Period */}
                  <div>
                    <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Termination Notice</label>
                    <select
                      value={editTerminationNotice}
                      onChange={e => setEditTerminationNotice(e.target.value)}
                      className="w-full text-[11.5px] px-2 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                    >
                      <option value="1 Month">1 Month Notice</option>
                      <option value="2 Months">2 Months Notice</option>
                      <option value="15 Days">15 Days Notice</option>
                      <option value="3 Months">3 Months Notice</option>
                      <option value="Immediate">Immediate</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Document Preview & Download Modal ── */}
      {previewDoc && (
        <Modal
          open={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          title={`Document Preview — ${previewDoc.name}`}
          size="lg"
          headerActions={
            <div className="flex items-center gap-2">
              {previewDoc.file_data && (
                <a
                  href={previewDoc.file_data}
                  download={previewDoc.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[12px] font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download</span>
                </a>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewDoc(null)}
                className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </Button>
            </div>
          }
        >
          <div className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-2xl min-h-[300px]">
            {previewDoc.file_data?.startsWith('data:image/') ? (
              <img
                src={previewDoc.file_data}
                alt={previewDoc.name}
                className="max-h-[500px] max-w-full rounded-xl object-contain border border-slate-200 shadow-sm"
              />
            ) : previewDoc.file_data?.startsWith('data:application/pdf') ? (
              <iframe
                src={previewDoc.file_data}
                title={previewDoc.name}
                className="w-full h-[520px] rounded-xl border border-slate-200"
              />
            ) : (
              <div className="text-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <FileText size={32} />
                </div>
                <h4 className="text-[15px] font-bold text-slate-800">{previewDoc.name}</h4>
                <p className="text-[12px] text-slate-500 mt-1">
                  Category: <strong className="capitalize">{previewDoc.category.replace('_', ' ')}</strong>
                  {previewDoc.file_size ? ` • ${Math.round(previewDoc.file_size / 1024)} KB` : ''}
                </p>
                {previewDoc.file_data && (
                  <a
                    href={previewDoc.file_data}
                    download={previewDoc.name}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-[12.5px] shadow-sm cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Download File</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <Modal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Delete Agency Vendor"
          headerActions={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 px-4 text-[11.5px] bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer shadow-xs"
                onClick={() => {
                  deleteAgency(deleteTarget.id)
                  setDeleteTarget(null)
                }}
              >
                Delete
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600" />
              <div className="text-[13px]">
                <p className="font-bold">Are you sure you want to delete this agency?</p>
                <p className="text-[12px] text-rose-700 mt-1">
                  This will remove <strong>"{deleteTarget.name}"</strong> from your vendor list. Cleaners currently assigned to this agency will retain their records.
                </p>
              </div>
            </div>
          </div>
        </Modal>
      )}

    </div>
  )
}
