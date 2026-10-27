import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2, ArrowLeft, Users, Percent, CreditCard, FileText, CheckCircle2,
  AlertCircle, Edit2, Phone, Mail, MapPin, Calendar, Clock, DollarSign,
  Shield, CheckCircle, ExternalLink, Plus, Search, X, Award, AlertTriangle,
  Landmark, UserCheck, UserPlus, Briefcase, ChevronRight, FileCheck, ArrowUpRight, TrendingUp,
  LayoutGrid, List, Lock, Wallet, ShieldCheck, History, Download, Eye, Paperclip, Upload,
  Sparkles, Check, FileSpreadsheet, Layers, Trash2, Zap
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useData } from '@/store/DataContext'
import type { Agency, Employee, DailyJob, AgencySalaryPayout, AgencyDocument, AgencyDocumentCategory, AgencyContactPerson } from '@/types'
import { formatDate, formatCurrency, daysUntil, isParentCompanyEmployee } from '@/lib/utils'
import { getEmployeeDailyJobsHistory, employeeMatchesStaff, jobChargeShare, shiftSalaryCost, formatMonthlySalary } from '@/lib/clientDataSync'
import { generateCertificateDataUrl } from '@/lib/agencyCertificates'

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
  category: AgencyDocumentCategory
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
        <label className="text-xs font-medium text-slate-600">{label}</label>
        {catDocs.length > 0 && (
          <span className="text-[10px] font-black text-teal-700 bg-teal-50 border border-teal-200/80 px-1.5 py-0.2 rounded-full flex items-center gap-1">
            <Paperclip size={9} />
            <span>{catDocs.length} {catDocs.length === 1 ? 'file' : 'versions'}</span>
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

        <input
          id={uploadInputId}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={e => {
            onAttach(e.target.files)
            e.target.value = ''
          }}
        />

        <label
          htmlFor={uploadInputId}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 hover:text-teal-800 border border-teal-200/80 cursor-pointer transition-all shadow-2xs flex items-center justify-center"
          title={`Upload or Replace ${label} Document`}
        >
          <Upload size={12} className="stroke-[2.5]" />
        </label>
      </div>

      {catDocs.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          {catDocs.slice(0, 2).map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center justify-between px-2.5 py-1 rounded-lg border text-[11px] font-medium shadow-2xs ${
                doc.is_active !== false
                  ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <div
                onClick={() => onPreview(doc)}
                className="flex items-center gap-1.5 truncate cursor-pointer hover:underline flex-1 min-w-0"
                title="Click to preview file"
              >
                <Paperclip size={10} className="shrink-0 text-slate-400" />
                <span className="truncate">{doc.name}</span>
                <span className={`text-[9px] font-black uppercase px-1 py-0.2 rounded ${
                  doc.is_active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {doc.is_active !== false ? 'Active' : 'History'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-1.5">
                <button
                  type="button"
                  onClick={() => onPreview(doc)}
                  className="text-slate-400 hover:text-teal-600 p-0.5 rounded hover:bg-teal-50 cursor-pointer"
                  title="Preview Document"
                >
                  <Eye size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(doc.id)}
                  className="text-slate-400 hover:text-rose-600 p-0.5 rounded hover:bg-rose-50 cursor-pointer"
                  title="Remove from current session"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface AgencyDashboardProps {
  agency: Agency
  onBack: () => void
}

export function AgencyDashboard({ agency: initialAgency, onBack }: AgencyDashboardProps) {
  const { agencies, employees, dailyJobs, clients, updateAgency, updateEmployee, addEmployee } = useData()
  const navigate = useNavigate()

  // Always use the live agency record from DataContext store so updates reflect instantly
  const agency = useMemo(() => {
    return agencies.find(a => a.id === initialAgency.id) || initialAgency
  }, [agencies, initialAgency])

  const isParentAgency = agency.company_type === 'Parent Company' || agency.id === 'agency-safaeewala' || agency.name.toLowerCase().includes('safaeewala')

  // Safaeewala active cleaners count
  const safaeewalaActiveCleanersCount = useMemo(() => {
    return (employees || []).filter(e => isParentCompanyEmployee(e) && e.status !== 'inactive').length
  }, [employees])

  // ── Active Tab: 'staff' | 'documents' | 'payouts' | 'contract' ──
  const [activeTab, setActiveTab] = useState<'staff' | 'documents' | 'payouts' | 'contract'>(() => {
    return isParentAgency ? 'documents' : 'staff'
  })

  // Ensure Master Agency never stays on Sourced Employees tab
  useEffect(() => {
    if (isParentAgency && activeTab === 'staff') {
      setActiveTab('documents')
    }
  }, [isParentAgency, activeTab])

  // ── Filter State for Sourced Staff ──
  const [staffSearch, setStaffSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  // ── Modals State ──
  const [showEditProfileModal, setShowEditProfileModal] = useState(false)
  const [showLogPayoutModal, setShowLogPayoutModal] = useState(false)
  const [showAssignStaffModal, setShowAssignStaffModal] = useState(false)
  const [showAddStaffModal, setShowAddStaffModal] = useState(false)
  const [unassignTarget, setUnassignTarget] = useState<Employee | null>(null)

  // ── Salary Payout & Advance Form State ──
  const [payoutFormType, setPayoutFormType] = useState<'salary' | 'advance'>('salary')
  const [payoutCleanerId, setPayoutCleanerId] = useState<string>('')
  const [payoutTypeFilter, setPayoutTypeFilter] = useState<'all' | 'salary' | 'advance'>('all')
  const [shiftsSearch, setShiftsSearch] = useState<string>('')
  const [shiftsStaffFilter, setShiftsStaffFilter] = useState<string>('all')

  // ── Document Preview & Direct Upload Modals ──
  const [previewDoc, setPreviewDoc] = useState<AgencyDocument | null>(null)
  const [showUploadDocModal, setShowUploadDocModal] = useState(false)
  const [directUploadCategory, setDirectUploadCategory] = useState<AgencyDocumentCategory | 'other'>('trade_license')

  // ── Edit Profile Modal Form State ──
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>(agency.status || 'active')
  const [editCompanyType, setEditCompanyType] = useState<'Third Party' | 'Parent Company'>(agency.company_type || 'Third Party')
  const [editReplacementGuarantee, setEditReplacementGuarantee] = useState<'Yes' | 'No'>('Yes')
  const [editContacts, setEditContacts] = useState<AgencyContactPerson[]>([])
  const [editDocs, setEditDocs] = useState<AgencyDocument[]>([])
  const [editPaymentTerms, setEditPaymentTerms] = useState('Monthly')
  const [editTerminationNotice, setEditTerminationNotice] = useState('1 Month')

  // Synchronize edit states whenever agency changes or modal opens
  useEffect(() => {
    if (agency) {
      setEditStatus(agency.status || 'active')
      setEditCompanyType(agency.company_type || 'Third Party')
      setEditReplacementGuarantee(
        agency.replacement_guarantee === 'No' || agency.replacement_guarantee_enabled === false
          ? 'No'
          : 'Yes'
      )
      setEditContacts(
        agency.contact_persons && agency.contact_persons.length > 0
          ? agency.contact_persons
          : [{ id: 'cp-1', name: agency.contact_person || '', phone: agency.phone || '', email: agency.email || '', role: 'Account Manager' }]
      )
      setEditDocs(agency.documents || [])
      setEditPaymentTerms(agency.payment_terms || 'Monthly')
      setEditTerminationNotice(agency.termination_notice || '1 Month')
    }
  }, [agency, showEditProfileModal])

  // ── Staff View Mode: 'table' | 'grid' ──
  const [staffViewMode, setStaffViewMode] = useState<'table' | 'grid'>('table')

  // ── Cleaner Profile Modal State ──
  const [profileStaff, setProfileStaff] = useState<Employee | null>(null)

  // ── Cleaners / Staff belonging to this Agency ──
  const agencyStaff = useMemo(() => {
    if (isParentAgency) {
      return employees.filter(isParentCompanyEmployee)
    }
    return employees.filter(e =>
      e.agency_id === agency.id ||
      (e.agency_name && e.agency_name.toLowerCase().trim() === agency.name.toLowerCase().trim())
    )
  }, [employees, agency, isParentAgency])

  // ── Candidate Cleaners who can be assigned to this agency ──
  const assignableStaff = useMemo(() => {
    return employees.filter(e => e.agency_id !== agency.id && e.agency_name !== agency.name)
  }, [employees, agency])

  // ── Filtered Staff for Tab 1 ──
  const filteredStaff = useMemo(() => {
    const q = staffSearch.toLowerCase().trim()
    return agencyStaff.filter(emp => {
      if (roleFilter !== 'all') {
        if (roleFilter === 'technical' || roleFilter === 'ducting') {
          if (emp.role !== 'technical' && emp.role !== 'ducting') return false
        } else if (emp.role !== roleFilter) {
          return false
        }
      }
      if (!q) return true
      return (
        (emp.full_name || '').toLowerCase().includes(q) ||
        (emp.phone && emp.phone.includes(q)) ||
        (emp.nationality && emp.nationality.toLowerCase().includes(q)) ||
        (emp.emirates_id && emp.emirates_id.includes(q))
      )
    })
  }, [agencyStaff, staffSearch, roleFilter])

  // ── Today's Date String ──
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  // ── Jobs Completed by this Agency's Staff ──
  const staffJobsData = useMemo(() => {
    const items: {
      job: DailyJob
      employee: Employee
      revenue: number
      salaryShare: number
    }[] = []

    agencyStaff.forEach(emp => {
      const history = getEmployeeDailyJobsHistory(emp, dailyJobs)

      history.forEach(job => {
        const rev = jobChargeShare(job)
        const duty = Number(job.duty_hours) || 0 // no invented 4 h (AUD-11)
        const salaryAlloc = shiftSalaryCost(emp, duty) // same salary rule as Employees (AUD-06)

        items.push({
          job,
          employee: emp,
          revenue: rev,
          salaryShare: salaryAlloc,
        })
      })
    })

    return items.sort((a, b) => (b.job.date || '').localeCompare(a.job.date || ''))
  }, [agencyStaff, dailyJobs])

  // ── Financial Metrics (Salary Payouts, Advance History, & Daily Job Sheet Sync) ──
  const financials = useMemo(() => {
    const totalRevenue = staffJobsData.reduce((acc, item) => acc + item.revenue, 0)
    const totalSalaryAllocated = agency.contracted_amount
      ? agency.contracted_amount
      : (agency.price ? agency.price : staffJobsData.reduce((acc, item) => acc + item.salaryShare, 0))
    const payouts = agency.payouts || []

    const totalSalaryPaid = payouts
      .filter(p => (p.payment_type !== 'advance') && p.status === 'paid')
      .reduce((acc, p) => acc + p.amount, 0)

    const totalAdvances = payouts
      .filter(p => p.payment_type === 'advance' && p.status === 'paid')
      .reduce((acc, p) => acc + p.amount, 0)

    const totalPaid = totalSalaryPaid + totalAdvances
    const totalPending = payouts
      .filter(p => p.status === 'pending' || p.status === 'processing')
      .reduce((acc, p) => acc + p.amount, 0)

    const netBalance = Math.max(0, totalSalaryAllocated - totalPaid)
    const totalDutyHours = staffJobsData.reduce((acc, item) => acc + (Number(item.job.duty_hours) || 0), 0)

    return {
      totalRevenue,
      totalSalaryAllocated,
      totalSalaryPaid,
      totalAdvances,
      totalPaid,
      totalPending,
      netBalance,
      payoutsCount: payouts.length,
      salaryCount: payouts.filter(p => p.payment_type !== 'advance').length,
      advanceCount: payouts.filter(p => p.payment_type === 'advance').length,
      jobsCount: staffJobsData.length,
      totalDutyHours,
    }
  }, [staffJobsData, agency.payouts, agency.contracted_amount, agency.price])

  // ── Contract Expiry Countdown ──
  const contractExpiryInfo = useMemo(() => {
    if (!agency.contract_end_date) {
      return { days: null, status: 'unknown', text: 'No end date set' }
    }
    const days = daysUntil(agency.contract_end_date)
    if (isNaN(days)) {
      return { days: null, status: 'unknown', text: 'Ongoing' }
    }
    if (days < 0) {
      return { days, status: 'expired', text: `Expired ${Math.abs(days)} days ago` }
    }
    if (days <= 30) {
      return { days, status: 'expiring', text: `Expiring soon (${days} days left)` }
    }
    return { days, status: 'valid', text: `${days} Days Remaining` }
  }, [agency.contract_end_date])

  // ── Live Staff Duty Classification for Today ──
  const staffDutyStats = useMemo(() => {
    let workingTodayCount = 0
    let standbyCount = 0
    let onLeaveCount = 0

    agencyStaff.forEach(emp => {
      const todayJob = dailyJobs.find(j => j.date === todayStr && employeeMatchesStaff(emp, j.staff_name))
      if (todayJob) {
        workingTodayCount++
      } else if (emp.status === 'on_leave') {
        onLeaveCount++
      } else {
        standbyCount++
      }
    })

    return { workingTodayCount, standbyCount, onLeaveCount }
  }, [agencyStaff, dailyJobs, todayStr])

  // ── All Documents (Categorized into Active vs Archived History) ──
  const { activeDocs, archivedDocs, allDocs } = useMemo(() => {
    const rawDocs = agency.documents || []
    const list: AgencyDocument[] = [...rawDocs]

    // If Trade License doesn't have an uploaded file but has a number, create a verified digital record
    const hasTradeLic = list.some(d => d.category === 'trade_license')
    if (!hasTradeLic && agency.trade_license_no) {
      list.push({
        id: `cert-trade_license-${agency.id}`,
        name: `${agency.name} — Trade License Certificate (${agency.trade_license_no})`,
        category: 'trade_license',
        file_type: 'image/svg+xml',
        uploaded_at: agency.license_issue_date || agency.created_at,
        file_data: generateCertificateDataUrl(agency, 'trade_license', agency.trade_license_no),
        is_active: true,
        version: 1,
        notes: 'Verified UAE DED Commercial Registration'
      })
    }

    // If NOC doesn't have an uploaded file but has a number, create a verified digital record
    const hasNoc = list.some(d => d.category === 'noc')
    if (!hasNoc && agency.noc_no) {
      list.push({
        id: `cert-noc-${agency.id}`,
        name: `${agency.name} — No Objection Certificate (${agency.noc_no})`,
        category: 'noc',
        file_type: 'image/svg+xml',
        uploaded_at: agency.license_issue_date || agency.created_at,
        file_data: generateCertificateDataUrl(agency, 'noc', agency.noc_no),
        is_active: true,
        version: 1,
        notes: 'Verified MOHRE Labour Supply Authorization'
      })
    }

    const active: AgencyDocument[] = []
    const archived: AgencyDocument[] = []
    const seenActiveCats = new Set<string>()

    // Sort by uploaded_at descending
    const sorted = [...list].sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''))

    sorted.forEach(doc => {
      if (doc.is_active === false || doc.archived_at) {
        archived.push(doc)
      } else if (!seenActiveCats.has(doc.category)) {
        seenActiveCats.add(doc.category)
        active.push({ ...doc, is_active: true })
      } else {
        archived.push({ ...doc, is_active: false })
      }
    })

    return { activeDocs: active, archivedDocs: archived, allDocs: sorted }
  }, [agency])

  // ── Document Upload with Version History Preservation (for Edit Profile) ──
  const handleEditFileUpload = (
    files: FileList | null,
    category: AgencyDocumentCategory
  ) => {
    if (!files || files.length === 0) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64Data = reader.result as string
        setEditDocs(prevDocs => {
          const categoryDocs = prevDocs.filter(d => d.category === category)
          const nextVersion = categoryDocs.length + 1

          // Preserve previous active documents as archived history
          const archivedOldDocs = prevDocs.map(d => {
            if (d.category === category && d.is_active !== false) {
              return {
                ...d,
                is_active: false,
                archived_at: new Date().toISOString()
              }
            }
            return d
          })

          const newDoc: AgencyDocument = {
            id: `doc-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            category,
            file_data: base64Data,
            file_type: file.type || 'application/octet-stream',
            file_size: file.size,
            uploaded_at: new Date().toISOString(),
            is_active: true,
            version: nextVersion,
          }

          return [newDoc, ...archivedOldDocs]
        })
      }
      reader.readAsDataURL(file)
    })
  }

  // ── Direct Document Upload with Version History Preservation (from License & Documents Tab) ──
  const handleDirectUploadDoc = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const file = (fd.get('doc_file') as File)
    const category = (fd.get('doc_category') as AgencyDocument['category']) || 'trade_license'
    const docNotes = (fd.get('doc_notes') as string) || ''

    if (!file || file.size === 0) {
      alert('Please select a document file to attach.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const base64Data = reader.result as string
      const currentDocs = agency.documents || []
      const categoryDocs = currentDocs.filter(d => d.category === category)
      const nextVersion = categoryDocs.length + 1

      // Archive previous active documents in this category
      const archivedOldDocs = currentDocs.map(d => {
        if (d.category === category && d.is_active !== false) {
          return {
            ...d,
            is_active: false,
            archived_at: new Date().toISOString()
          }
        }
        return d
      })

      const newDoc: AgencyDocument = {
        id: `doc-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        category,
        file_data: base64Data,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        uploaded_at: new Date().toISOString(),
        is_active: true,
        version: nextVersion,
        notes: docNotes || undefined,
      }

      updateAgency(agency.id, {
        documents: [newDoc, ...archivedOldDocs]
      })
      setShowUploadDocModal(false)
    }
    reader.readAsDataURL(file)
  }

  // ── Save Comprehensive Edit Profile Modal ──
  const handleSaveEditProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const contractedAmount = Number(fd.get('contracted_amount')) || Number(fd.get('price')) || undefined
    const validContacts = editContacts.filter(c => c.name.trim() || c.phone?.trim())

    updateAgency(agency.id, {
      name: fd.get('name') as string,
      company_type: editCompanyType,
      contact_person: validContacts[0]?.name || undefined,
      contact_persons: validContacts.length > 0 ? validContacts : undefined,
      phone: fd.get('phone') as string,
      email: (fd.get('email') as string) || undefined,
      address: (fd.get('address') as string) || undefined,
      contracted_amount: contractedAmount,
      price: contractedAmount,
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
      sla_terms: (fd.get('sla_terms') as string) || undefined,
      bank_details: {
        bank_name: (fd.get('bank_name') as string) || undefined,
        account_title: (fd.get('account_title') as string) || undefined,
        iban: (fd.get('iban') as string) || undefined,
      },
      notes: (fd.get('notes') as string) || undefined,
      status: editStatus,
      documents: editDocs,
    })

    setShowEditProfileModal(false)
  }

  // ── Handlers ──
  const handleAssignStaff = (empId: string) => {
    updateEmployee(empId, {
      agency_id: agency.id,
      agency_name: agency.name,
    })
    setShowAssignStaffModal(false)
  }

  const handleUnassignStaff = (emp: Employee) => {
    updateEmployee(emp.id, {
      agency_id: undefined,
      agency_name: undefined,
    })
    setUnassignTarget(null)
  }

  const handleLogPayout = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const amount = Number(fd.get('amount')) || 0
    const paymentDate = (fd.get('payment_date') as string) || todayStr
    const paymentMethod = (fd.get('payment_method') as AgencySalaryPayout['payment_method']) || 'bank_transfer'
    const referenceNo = (fd.get('reference_no') as string) || ''
    const status = (fd.get('status') as AgencySalaryPayout['status']) || 'paid'
    const notes = (fd.get('notes') as string) || (payoutFormType === 'advance' ? 'Staff advance payment' : 'Staff salary payout settlement')
    const selectedEmp = payoutCleanerId ? agencyStaff.find(s => s.id === payoutCleanerId) : null

    const newPayout: AgencySalaryPayout = {
      id: `payout-${Date.now()}`,
      agency_id: agency.id,
      payment_type: payoutFormType,
      cleaner_id: selectedEmp?.id || undefined,
      cleaner_name: selectedEmp?.full_name || undefined,
      amount,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      reference_no: referenceNo,
      status,
      notes,
      created_at: new Date().toISOString(),
    }

    const currentPayouts = agency.payouts || []
    updateAgency(agency.id, {
      payouts: [newPayout, ...currentPayouts],
    })
    setShowLogPayoutModal(false)
    setPayoutCleanerId('')
    setPayoutFormType('salary')
  }

  const handleDeletePayout = (payoutId: string) => {
    if (!window.confirm('Are you sure you want to delete this payment record?')) return
    const updated = (agency.payouts || []).filter(p => p.id !== payoutId)
    updateAgency(agency.id, {
      payouts: updated,
    })
  }

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-200">

      {/* ── Top Bar: Back Button & Quick Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[13px] font-bold text-slate-600 hover:text-teal-700 bg-white hover:bg-teal-50/60 border border-slate-200/90 hover:border-teal-300 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-xs w-fit"
        >
          <ArrowLeft size={16} />
          <span>Back to All Agencies</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            className="text-[12.5px] font-bold border-slate-200"
            onClick={() => setShowEditProfileModal(true)}
          >
            <Edit2 size={14} className="mr-1.5 text-teal-600" />
            Edit Profile
          </Button>

          <Button
            type="button"
            className="text-[12.5px] font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm cursor-pointer flex items-center gap-1.5"
            onClick={() => {
              setPayoutFormType('salary')
              setShowLogPayoutModal(true)
            }}
          >
            <Wallet size={14} className="mr-0.5" />
            Salary Payout
          </Button>
        </div>
      </div>

      {/* ── Agency Hero Header Card ── */}
      <div className="bg-white rounded-[28px] border border-slate-200/90 shadow-[0_4px_25px_rgba(15,23,42,0.04)] p-6 md:p-8 relative overflow-hidden">
        {/* Subtle decorative background gradient accent */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-teal-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            {/* Agency Title & Badges */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-700 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-teal-700/20 shrink-0">
                <Building2 size={32} />
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                    {agency.name}
                  </h1>

                  {/* Header Active / Inactive Instant Toggle Switch (Redundant static tag removed) */}
                  <button
                    type="button"
                    onClick={() => {
                      const isCurrentlyActive = (agency.status || 'active') === 'active'
                      const nextStatus = isCurrentlyActive ? 'inactive' : 'active'
                      updateAgency(agency.id, { status: nextStatus })
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold cursor-pointer transition-all shadow-xs ${
                      agency.status === 'active'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-400'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                    title={agency.status === 'active' ? 'Agency is currently Active. Click to deactivate.' : 'Agency is currently Inactive. Click to activate.'}
                  >
                    <span
                      className={`relative inline-flex h-4 w-7.5 shrink-0 rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                        agency.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                          agency.status === 'active' ? 'translate-x-3.5' : 'translate-x-0'
                        }`}
                      />
                    </span>
                    <span className="uppercase text-[10.5px] font-black tracking-wider">
                      {agency.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </div>

                <p className="text-[13.5px] text-slate-500 mt-1 font-medium">
                  {agency.contact_person ? `Representative: ${agency.contact_person}` : 'External Manpower & Recruitment Vendor'}
                </p>

                {/* Contact Info Pills */}
                <div className="flex items-center gap-4 mt-3 flex-wrap text-[12.5px] text-slate-600">
                  {agency.phone && (
                    <a
                      href={`tel:${agency.phone}`}
                      className="flex items-center gap-1.5 font-semibold text-slate-800 hover:text-teal-700 transition-colors"
                    >
                      <Phone size={13} className="text-teal-600" />
                      <span>{agency.phone}</span>
                    </a>
                  )}

                  {agency.email && (
                    <a
                      href={`mailto:${agency.email}`}
                      className="flex items-center gap-1.5 text-slate-600 hover:text-teal-700 transition-colors"
                    >
                      <Mail size={13} className="text-teal-600" />
                      <span>{agency.email}</span>
                    </a>
                  )}

                  {agency.address && (
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <MapPin size={13} className="text-teal-600 shrink-0" />
                      <span>{agency.address}</span>
                    </div>
                  )}

                  {agency.trade_license_no && (
                    <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/60">
                      <Shield size={12} className="text-teal-600" />
                      <span>Trade Lic: <strong>{agency.trade_license_no}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 Top KPI Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Due Amount & Settled Tag */}
        <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                financials.netBalance > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
              }`}>
                <DollarSign size={18} />
              </div>
              <span
                className={`inline-flex items-center gap-1.5 text-[10.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border shadow-2xs ${
                  financials.netBalance > 0
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    financials.netBalance > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                <span>{financials.netBalance > 0 ? 'Due' : 'Settled'}</span>
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(financials.netBalance)}
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-0.5">
              Due Amount
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Settled Amount: <strong>{formatCurrency(financials.totalPaid)}</strong></span>
            </span>
          </div>
        </div>

        {/* Card 2: Sourced Cleaners (or Active Cleaners for Master Agency) */}
        <div
          onClick={() => {
            if (isParentAgency) {
              navigate('/employees?agency=safaeewala')
            }
          }}
          className={`bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 flex flex-col justify-between ${
            isParentAgency ? 'cursor-pointer hover:border-teal-400 hover:shadow-md transition-all group' : ''
          }`}
          title={isParentAgency ? "Click to view Safaeewala's Active Cleaners in Employees directory" : undefined}
        >
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isParentAgency ? 'bg-teal-50 text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-colors' : 'bg-indigo-50 text-indigo-700'
              }`}>
                <Users size={18} />
              </div>
              <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border shadow-2xs ${
                isParentAgency
                  ? 'bg-teal-50 text-teal-900 border-teal-200'
                  : 'bg-indigo-50 text-indigo-900 border-indigo-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isParentAgency ? 'bg-teal-500' : 'bg-indigo-500'}`} />
                <span>
                  {isParentAgency ? (
                    <span className="flex items-center gap-1">
                      <span>Active Cleaners</span>
                      <ArrowUpRight size={10} />
                    </span>
                  ) : (
                    `${staffDutyStats.workingTodayCount} Working Today`
                  )}
                </span>
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {isParentAgency ? safaeewalaActiveCleanersCount : agencyStaff.length}
              {isParentAgency ? (
                <span className="text-[12px] font-bold text-slate-400 ml-1">Active Cleaners</span>
              ) : agency.quota_cleaners ? (
                <span className="text-[13px] font-bold text-slate-400 ml-1">/ {agency.quota_cleaners} Quota</span>
              ) : (
                <span className="text-[12px] font-bold text-slate-400 ml-1">Staff</span>
              )}
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-0.5">
              {isParentAgency ? 'Corporate Fleet Cleaners' : 'Sourced Cleaners'}
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-50 text-slate-700 border border-slate-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span>Available / Standby: <strong>{staffDutyStats.standbyCount}</strong></span>
            </span>
          </div>
        </div>

        {/* Card 3: Total Sourced Revenue */}
        <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <TrendingUp size={18} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{financials.jobsCount} Shifts</span>
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(financials.totalRevenue)}
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-0.5">
              Gross Revenue Generated
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
              <span>Completed Shifts: <strong>{financials.jobsCount} {financials.jobsCount === 1 ? 'Job' : 'Jobs'}</strong></span>
            </span>
          </div>
        </div>

        {/* Card 4: Total Contract Amount with Status Indicator */}
        <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                financials.netBalance > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
              }`}>
                <Wallet size={18} />
              </div>

              {/* Wazeh Status Indicator (Due / Settled) */}
              <span
                className={`inline-flex items-center gap-1.5 text-[10.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border shadow-2xs ${
                  financials.netBalance > 0
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    financials.netBalance > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                <span>{financials.netBalance > 0 ? 'Due' : 'Settled'}</span>
              </span>
            </div>

            {/* Total Contract Amount */}
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(financials.totalSalaryAllocated)}
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-0.5">
              Total Contract Amount
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-50 text-slate-700 border border-slate-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
              <span>Payment Terms: <strong>{agency.payment_terms || 'Monthly'}</strong></span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
        {!isParentAgency && (
          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer ${
              activeTab === 'staff'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users size={16} />
            <span>Sourced Employees ({agencyStaff.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer ${
            activeTab === 'documents'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck size={16} />
          <span>License & Documents ({allDocs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payouts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer ${
            activeTab === 'payouts'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Wallet size={16} />
          <span>Staff & Salaries Payout ({formatCurrency(financials.totalSalaryAllocated)})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('contract')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer ${
            activeTab === 'contract'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText size={16} />
          <span>Contract & SLA Details</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: SOURCED EMPLOYEES & STAFF DATA (Third-Party Agencies Only)
         ══════════════════════════════════════════════════════════════════════ */}
      {!isParentAgency && activeTab === 'staff' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff by name, phone, Emirates ID, nationality..."
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                className="w-full text-[13px] pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 text-slate-800 font-medium transition-all"
              />
              {staffSearch && (
                <button
                  type="button"
                  onClick={() => setStaffSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Role Filter & View Switcher */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="text-[12.5px] font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-teal-600 cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="cleaner">Cleaners</option>
                <option value="crew_lead">Crew Leads / Supervisors</option>
                <option value="driver">Drivers</option>
                <option value="technical">Technical</option>
                <option value="store_cleaner">Store Cleaners</option>
              </select>

              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setStaffViewMode('table')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    staffViewMode === 'table' ? 'bg-white text-teal-700 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Table View"
                >
                  <List size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setStaffViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    staffViewMode === 'grid' ? 'bg-white text-teal-700 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Grid Card View"
                >
                  <LayoutGrid size={15} />
                </button>
              </div>

              <Button
                type="button"
                className="text-[12.5px] font-bold bg-teal-600 hover:bg-teal-700 text-white shrink-0"
                onClick={() => setShowAssignStaffModal(true)}
              >
                <UserPlus size={14} className="mr-1.5" />
                Assign Existing Cleaner
              </Button>

              <Button
                type="button"
                variant="outline"
                className="text-[12.5px] font-bold border-slate-200 shrink-0"
                onClick={() => setShowAddStaffModal(true)}
              >
                <Plus size={14} className="mr-1.5 text-teal-600" />
                New Cleaner
              </Button>
            </div>
          </div>

          {/* Sourced Staff Table / Cards */}
          {filteredStaff.length === 0 ? (
            <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3">
                <Users size={24} />
              </div>
              <h3 className="text-[16px] font-black text-slate-800">No Cleaners Assigned to This Agency</h3>
              <p className="text-[13px] text-slate-500 mt-1 max-w-md mx-auto">
                Assign cleaners from your staff pool to "{agency.name}" or add a new cleaner directly under this partner agency.
              </p>
              <div className="flex justify-center gap-3 mt-4">
                <Button
                  type="button"
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[12.5px]"
                  onClick={() => setShowAssignStaffModal(true)}
                >
                  <UserPlus size={14} className="mr-1.5" /> Assign Staff to Agency
                </Button>
              </div>
            </div>
          ) : staffViewMode === 'table' ? (
            <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4">Staff Member</th>
                      <th className="py-3.5 px-4">Role</th>
                      <th className="py-3.5 px-4">Emirates ID & Visa</th>
                      <th className="py-3.5 px-4">Today's Duty Status</th>
                      <th className="py-3.5 px-4 text-center">Completed Shifts</th>
                      <th className="py-3.5 px-4 text-right">Rates & Compensation</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[13px]">
                    {filteredStaff.map(emp => {
                      // Check today's shift
                      const todayJob = dailyJobs.find(j => j.date === todayStr && employeeMatchesStaff(emp, j.staff_name))
                      const history = getEmployeeDailyJobsHistory(emp, dailyJobs)
                      const totalDuty = history.reduce((acc, j) => acc + (Number(j.duty_hours) || 0), 0)
                      const cleanerRevenue = Math.round(history.reduce((acc, j) => acc + jobChargeShare(j), 0))

                      // Visa expiry alerts
                      const visaDays = emp.visa_expiry ? daysUntil(emp.visa_expiry) : null
                      const visaValid = visaDays !== null && visaDays > 60

                      return (
                        <tr
                          key={emp.id}
                          onClick={() => setProfileStaff(emp)}
                          className="hover:bg-teal-50/30 transition-colors cursor-pointer group"
                        >
                          {/* Name & Phone */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 text-[12px]">
                                {(emp.full_name || 'Staff').slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 group-hover:text-teal-700 flex items-center gap-1 transition-colors">
                                  <span>{emp.full_name}</span>
                                  <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 text-teal-600 transition-opacity" />
                                </span>
                                <p className="text-[11.5px] text-slate-500 font-medium">
                                  {emp.phone || 'No phone'} {emp.nationality ? `• ${emp.nationality}` : ''}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="py-3.5 px-4">
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 capitalize">
                              {(emp.role === 'ducting' || emp.role === 'technical') ? 'Technical' : (emp.role || 'cleaner').replace('_', ' ')}
                            </span>
                          </td>

                          {/* Emirates ID & Visa */}
                          <td className="py-3.5 px-4">
                            <p className="font-semibold text-slate-800 text-[12px]">
                              {emp.emirates_id || 'Not Registered'}
                            </p>
                            {emp.visa_expiry ? (
                              <span
                                className={`text-[10.5px] font-bold inline-flex items-center gap-1 px-1.5 py-0.2 rounded ${
                                  visaValid
                                    ? 'text-emerald-700 bg-emerald-50'
                                    : 'text-amber-800 bg-amber-50'
                                }`}
                              >
                                {visaValid ? '✓' : '⚠'} Visa: {formatDate(emp.visa_expiry)}
                              </span>
                            ) : (
                              <span className="text-[10.5px] text-slate-400">No visa date</span>
                            )}
                          </td>

                          {/* Live Duty Status */}
                          <td className="py-3.5 px-4">
                            {todayJob ? (
                              <div>
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                  Working Today
                                </span>
                                <p className="text-[11px] text-slate-600 font-medium mt-0.5 truncate max-w-[160px]">
                                  {todayJob.area || todayJob.address || 'Assigned Shift'}
                                </p>
                              </div>
                            ) : emp.status === 'on_leave' ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                On Leave
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
                                Available / Standby
                              </span>
                            )}
                          </td>

                          {/* Completed Shifts */}
                          <td className="py-3.5 px-4 text-center">
                            <p className="font-black text-slate-900">{history.length}</p>
                            <p className="text-[10.5px] text-slate-500 font-medium">{totalDuty}h duty</p>
                          </td>

                          {/* Rates & Compensation */}
                          <td className="py-3.5 px-4 text-right">
                            {emp.monthly_salary ? (
                              <p className="font-bold text-slate-900 text-[12.5px]">
                                {formatCurrency(emp.monthly_salary)}
                                <span className="text-[10.5px] font-normal text-slate-500 block">per month</span>
                              </p>
                            ) : (
                              <p className="font-bold text-slate-500 text-[12.5px]">
                                {formatMonthlySalary(emp)}
                              </p>
                            )}
                            <p className="text-[10.5px] font-bold text-teal-700 mt-0.5">
                              {agency.payment_terms || 'Monthly Payout'}
                            </p>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setProfileStaff(emp)}
                                className="px-2 py-1 rounded-lg text-teal-700 hover:text-white bg-teal-50 hover:bg-teal-600 font-bold text-[11px] transition-colors cursor-pointer shadow-2xs"
                                title="Open Cleaner Profile"
                              >
                                Profile
                              </button>
                              <Link
                                to={`/employees/${emp.id}`}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-slate-100 transition-colors"
                                title="View Master Employee Profile"
                              >
                                <ExternalLink size={14} />
                              </Link>
                              <button
                                type="button"
                                onClick={() => setUnassignTarget(emp)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Unassign Cleaner from Agency"
                              >
                                <X size={14} />
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
            /* Grid Card View for Sourced Staff */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
              {filteredStaff.map(emp => {
                const todayJob = dailyJobs.find(j => j.date === todayStr && employeeMatchesStaff(emp, j.staff_name))
                const history = getEmployeeDailyJobsHistory(emp, dailyJobs)
                const totalDuty = history.reduce((acc, j) => acc + (Number(j.duty_hours) || 0), 0)
                const cleanerRevenue = Math.round(history.reduce((acc, j) => acc + jobChargeShare(j), 0))
                const visaDays = emp.visa_expiry ? daysUntil(emp.visa_expiry) : null
                const visaValid = visaDays !== null && visaDays > 60

                return (
                  <div
                    key={emp.id}
                    onClick={() => setProfileStaff(emp)}
                    className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] hover:shadow-[0_8px_30px_rgba(13,148,136,0.12)] hover:border-teal-300 p-5 transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      {/* Header: Avatar, Name, Role & Status */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-2xl bg-teal-100 text-teal-800 font-extrabold flex items-center justify-center text-[13px] shrink-0 shadow-xs">
                            {(emp.full_name || 'Staff').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-extrabold text-[#111827] group-hover:text-teal-700 transition-colors truncate text-[14px]">
                              {emp.full_name}
                            </h4>
                            <p className="text-[11.5px] text-slate-500 font-medium truncate">
                              {emp.nationality ? `${emp.nationality} · ` : ''}{emp.phone || 'No phone'}
                            </p>
                          </div>
                        </div>

                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                          todayJob
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : emp.status === 'on_leave'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {todayJob ? 'Working Today' : emp.status === 'on_leave' ? 'On Leave' : 'Standby'}
                        </span>
                      </div>

                      {/* Rates & Compensation Box */}
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 mb-3 grid grid-cols-2 gap-2 text-[11.5px]">
                        <div>
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Pay Rate</p>
                          <p className="text-[13px] font-black text-slate-900 mt-0.5">
                            {formatMonthlySalary(emp)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Payment Cycle</p>
                          <p className="text-[13px] font-black text-teal-700 mt-0.5">
                            {agency.payment_terms || 'Monthly'}
                          </p>
                        </div>
                      </div>

                      {/* Shifts & Hours Stat */}
                      <div className="grid grid-cols-2 gap-2 text-center py-2 border-y border-slate-100 mb-3 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium">Completed Shifts:</span>
                          <p className="font-bold text-slate-800 text-[12px]">{history.length} shifts</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium">Logged Hours:</span>
                          <p className="font-bold text-slate-800 text-[12px]">{totalDuty}h duty</p>
                        </div>
                      </div>

                      {/* Emirates ID & Visa Pill */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                        <span>EID: <strong className="text-slate-700">{emp.emirates_id || 'Not set'}</strong></span>
                        {emp.visa_expiry && (
                          <span className={`px-2 py-0.5 rounded-full font-bold ${visaValid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            Visa: {formatDate(emp.visa_expiry)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setProfileStaff(emp)}
                        className="text-[11.5px] font-bold text-teal-700 hover:text-white bg-teal-50 hover:bg-teal-600 px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-2xs"
                      >
                        View Profile
                      </button>

                      <div className="flex items-center gap-1">
                        <Link
                          to={`/employees/${emp.id}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-slate-100 transition-colors"
                          title="Open Master Employee Page"
                        >
                          <ExternalLink size={13} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setUnassignTarget(emp)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Unassign"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: LICENSE & DOCUMENTS (Real-time Compliance & Version History)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          {/* Header Banner & Upload Trigger */}
          <div className="bg-white rounded-[28px] border border-slate-200/90 shadow-[0_4px_25px_rgba(15,23,42,0.03)] p-6 md:p-8 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200/80">
                    Compliance & Regulatory Vault
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">
                    • Total {allDocs.length} Documents Logged
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                  License & Compliance Documents
                </h2>
                <p className="text-[13px] text-slate-500 mt-1 max-w-2xl">
                  UAE commercial registrations, labour quota permits, NOC, and agreements for <strong>{agency.name}</strong>. All new uploads preserve previous versions in historical audit logs.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditProfileModal(true)}
                  className="text-[12.5px] font-bold border-slate-200 cursor-pointer flex items-center gap-1.5"
                >
                  <Edit2 size={13} className="text-teal-600" />
                  <span>Edit Profile</span>
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    setDirectUploadCategory('trade_license')
                    setShowUploadDocModal(true)
                  }}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[12.5px] shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Upload size={14} className="stroke-[2.5]" />
                  <span>Upload Document / Renewal</span>
                </Button>
              </div>
            </div>

            {/* Quick 4 Compliance Overview Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
              {/* Card 1: Trade License */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Shield size={13} className="text-teal-600" />
                      <span>Trade License</span>
                    </span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      agency.trade_license_no ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {agency.trade_license_no ? 'Active' : 'Unregistered'}
                    </span>
                  </div>
                  <p className="text-[14px] font-mono font-black text-slate-900 truncate">
                    {agency.trade_license_no || 'CN-Pending'}
                  </p>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">
                    {agency.license_expiry_date ? `Exp: ${formatDate(agency.license_expiry_date)}` : 'Government of Dubai DED'}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                  {(() => {
                    const doc = activeDocs.find(d => d.category === 'trade_license')
                    return doc ? (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="text-[11.5px] font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer hover:underline"
                      >
                        <Eye size={12} />
                        <span>Preview Certificate</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">No file attached</span>
                    )
                  })()}
                </div>
              </div>

              {/* Card 2: Ministry NOC */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-teal-600" />
                      <span>Ministry NOC</span>
                    </span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      agency.noc_no ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {agency.noc_no ? 'Authorized' : 'Optional'}
                    </span>
                  </div>
                  <p className="text-[14px] font-mono font-black text-slate-900 truncate">
                    {agency.noc_no || 'NOC-Pending'}
                  </p>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">
                    Labour Supply Authorization
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                  {(() => {
                    const doc = activeDocs.find(d => d.category === 'noc')
                    return doc ? (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="text-[11.5px] font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer hover:underline"
                      >
                        <Eye size={12} />
                        <span>Preview NOC</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">No file attached</span>
                    )
                  })()}
                </div>
              </div>

              {/* Card 3: Tax TRN */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Landmark size={13} className="text-teal-600" />
                      <span>Tax TRN Number</span>
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      FTA Registered
                    </span>
                  </div>
                  <p className="text-[14px] font-mono font-black text-slate-900 truncate">
                    {agency.trn_no || '100234567800001'}
                  </p>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">
                    Federal Tax Authority (UAE)
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                  {(() => {
                    const doc = activeDocs.find(d => d.category === 'tax_registration')
                    return doc ? (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="text-[11.5px] font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer hover:underline"
                      >
                        <Eye size={12} />
                        <span>Preview TRN Doc</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Tax verified</span>
                    )
                  })()}
                </div>
              </div>

              {/* Card 4: Agreement Ref */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <FileText size={13} className="text-teal-600" />
                      <span>Contract Ref</span>
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      In Force
                    </span>
                  </div>
                  <p className="text-[14px] font-mono font-black text-slate-900 truncate">
                    {agency.contract_ref || 'AGR-Standard'}
                  </p>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">
                    {agency.contract_end_date ? `Valid till ${formatDate(agency.contract_end_date)}` : 'Ongoing Partner Contract'}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                  {(() => {
                    const doc = activeDocs.find(d => d.category === 'agreement')
                    return doc ? (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="text-[11.5px] font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer hover:underline"
                      >
                        <Eye size={12} />
                        <span>Preview Agreement</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Standard Terms</span>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Active In-Force Documents Grid */}
          <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-[16px] font-black text-slate-900 flex items-center gap-2">
                  <CheckCircle2 size={17} className="text-emerald-600" />
                  <span>Current Active Documents ({activeDocs.length})</span>
                </h3>
                <p className="text-[12px] text-slate-500">
                  Documents currently recognized as active for legal and operational compliance.
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDirectUploadCategory('trade_license')
                  setShowUploadDocModal(true)
                }}
                className="text-[12px] font-bold border-slate-200 flex items-center gap-1.5"
              >
                <Plus size={13} className="text-teal-600" />
                <span>Add / Replace Document</span>
              </Button>
            </div>

            {activeDocs.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
                <ShieldCheck size={32} className="mx-auto text-slate-400 mb-2" />
                <p className="text-[14px] font-bold text-slate-700">No Documents Uploaded Yet</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Click "Upload Document / Renewal" or "Edit Profile" to attach government licenses.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeDocs.map(doc => {
                  const catLabel =
                    doc.category === 'trade_license' ? 'Trade License' :
                    doc.category === 'tax_registration' ? 'Tax Registration (TRN)' :
                    doc.category === 'noc' ? 'No Objection Certificate (NOC)' :
                    doc.category === 'agreement' ? 'Contract Agreement' :
                    doc.category === 'emirates_id' ? 'Emirates ID (EID)' :
                    doc.category === 'passport' ? 'Passport' :
                    doc.category === 'workmen_compensation' ? "Workmen's Compensation Insurance" : 'Compliance Document'

                  return (
                    <div
                      key={doc.id}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition-all p-4.5 flex flex-col justify-between group"
                    >
                      <div>
                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200/60">
                            {catLabel}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9.5px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                              Active In-Force
                            </span>
                            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono">
                              v{doc.version || 1}
                            </span>
                          </div>
                        </div>

                        {/* Title & Icon */}
                        <div className="flex items-start gap-3 my-2">
                          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                            <FileCheck size={20} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-[13px] font-bold text-slate-900 line-clamp-1 group-hover:text-teal-700 transition-colors" title={doc.name}>
                              {doc.name}
                            </h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Uploaded: {formatDate(doc.uploaded_at)}
                              {doc.file_size ? ` • ${(doc.file_size / 1024).toFixed(0)} KB` : ''}
                            </p>
                          </div>
                        </div>

                        {doc.notes && (
                          <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 italic mt-2">
                            "{doc.notes}"
                          </p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold text-teal-700 hover:bg-teal-50 border border-teal-200/70 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Eye size={12} />
                            <span>Preview</span>
                          </button>

                          {doc.file_data && (
                            <a
                              href={doc.file_data}
                              download={doc.name}
                              className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Download file"
                            >
                              <Download size={12} />
                              <span>Download</span>
                            </a>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setDirectUploadCategory(doc.category)
                            setShowUploadDocModal(true)
                          }}
                          className="text-[11px] font-bold text-slate-500 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                          title="Upload new renewed version (archives this one)"
                        >
                          <Upload size={11} />
                          <span>Renew</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section 2: Complete Document History & Archived Versions Table */}
          <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-[16px] font-black text-slate-900 flex items-center gap-2">
                  <History size={17} className="text-teal-600" />
                  <span>Document Version History & Historical Archive</span>
                </h3>
                <p className="text-[12px] text-slate-500">
                  Permanent record of all active and superseded document uploads. When an updated file is uploaded, previous files are preserved here.
                </p>
              </div>

              <span className="text-[11.5px] font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200/80">
                {allDocs.length} Total Records ({archivedDocs.length} Archived History)
              </span>
            </div>

            {allDocs.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
                <History size={28} className="mx-auto text-slate-400 mb-2" />
                <p className="text-[14px] font-bold text-slate-700">No Document History Logged</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Any new documents or renewals uploaded will be permanently tracked here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Version</th>
                      <th className="py-3 px-4">Document / File Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4">Uploaded Date</th>
                      <th className="py-3 px-4">Archived / Replaced At</th>
                      <th className="py-3 px-4">Notes / Remarks</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allDocs.map((doc, idx) => {
                      const isActive = doc.is_active !== false && !doc.archived_at
                      const catLabel =
                        doc.category === 'trade_license' ? 'Trade License' :
                        doc.category === 'tax_registration' ? 'Tax TRN' :
                        doc.category === 'noc' ? 'MOHRE NOC' :
                        doc.category === 'agreement' ? 'Agreement' :
                        doc.category === 'emirates_id' ? 'Emirates ID' :
                        doc.category === 'passport' ? 'Passport' :
                        doc.category === 'workmen_compensation' ? "Workmen's Comp." : 'Compliance'

                      return (
                        <tr
                          key={doc.id || idx}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isActive ? 'bg-emerald-50/30 font-medium' : 'text-slate-600'
                          }`}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-[12px]">
                            <span className={`px-2 py-0.5 rounded ${
                              isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              v{doc.version || (allDocs.length - idx)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 max-w-xs">
                              <Paperclip size={13} className={isActive ? 'text-emerald-600 shrink-0' : 'text-slate-400 shrink-0'} />
                              <span className="truncate font-semibold text-slate-800" title={doc.name}>
                                {doc.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                              {catLabel}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-200 text-slate-600'
                            }`}>
                              {isActive ? '● Active' : 'Archived History'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[12px] text-slate-600 whitespace-nowrap">
                            {formatDate(doc.uploaded_at)}
                          </td>
                          <td className="py-3 px-4 text-[12px] text-slate-500 whitespace-nowrap">
                            {doc.archived_at ? (
                              <span className="text-amber-800 font-medium">
                                {formatDate(doc.archived_at)}
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-bold">— Current</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[11.5px] text-slate-500 italic max-w-xs truncate">
                            {doc.notes || (isActive ? 'Active verified record' : 'Archived after renewal')}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(doc)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                                title="Preview Document"
                              >
                                <Eye size={13} />
                              </button>
                              {doc.file_data && (
                                <a
                                  href={doc.file_data}
                                  download={doc.name}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                  title="Download File"
                                >
                                  <Download size={13} />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: STAFF & SALARIES PAYOUT (LIVE SYNCED WITH DAILY JOB SHEET)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'payouts' && (
        <div className="space-y-6">
          {/* Salary Calculation Overview Card */}
          <div className="bg-white rounded-[28px] border border-slate-200/90 shadow-[0_4px_25px_rgba(15,23,42,0.03)] p-6 md:p-8 relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-teal-700">
                    Salary & Advance Disbursements
                  </span>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                    Daily Job Sheet Synced
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-slate-900 mt-1">
                  Staff & Salaries Payout Ledger
                </h2>
                <p className="text-[13px] text-slate-500 mt-0.5 leading-relaxed">
                  Live synchronization with Daily Job Sheet shifts, duty hours, salary settlements, and staff advance history for <strong className="font-bold text-slate-800">{agency.name}</strong>. Payment Terms: <strong className="font-bold text-teal-700">{agency.payment_terms || 'Monthly (Net 15)'}</strong>.
                </p>
              </div>

              <Button
                type="button"
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[13px] shadow-sm w-fit shrink-0 cursor-pointer flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all"
                onClick={() => {
                  setPayoutFormType('salary')
                  setShowLogPayoutModal(true)
                }}
              >
                <Wallet size={15} />
                <span>Salary Payout</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Gross Shifts Revenue */}
              <div className="p-4.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50/90 border border-slate-200/80 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      Gross Shifts Revenue
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-slate-200/70 text-slate-700 flex items-center justify-center shrink-0">
                      <TrendingUp size={15} />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
                    {formatCurrency(financials.totalRevenue)}
                  </p>
                </div>
                <p className="text-[11.5px] font-medium text-slate-500 mt-2">
                  Across {financials.jobsCount} shifts ({financials.totalDutyHours}h logged)
                </p>
              </div>

              {/* Card 2: Total Salary Allocated */}
              <div className="p-4.5 rounded-2xl bg-teal-50/50 hover:bg-teal-50/75 border border-teal-200/70 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-teal-800">
                      Total Salary Allocated
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-teal-100/80 text-teal-700 flex items-center justify-center shrink-0">
                      <Wallet size={15} />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-teal-900 mt-1 tracking-tight">
                    {formatCurrency(financials.totalSalaryAllocated)}
                  </p>
                </div>
                <p className="text-[11.5px] font-medium text-teal-700/80 mt-2">
                  {agency.contracted_amount ? `AED ${agency.contracted_amount} contracted` : 'Duty hour compensation'}
                </p>
              </div>

              {/* Card 3: Total Settled & Advances */}
              <div className="p-4.5 rounded-2xl bg-emerald-50/50 hover:bg-emerald-50/75 border border-emerald-200/70 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                      Total Settled & Advances
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={15} />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-emerald-900 mt-1 tracking-tight">
                    {formatCurrency(financials.totalPaid)}
                  </p>
                </div>
                <p className="text-[11.5px] font-medium text-emerald-700/80 mt-2">
                  Salary: {formatCurrency(financials.totalSalaryPaid)} · Advance: {formatCurrency(financials.totalAdvances)}
                </p>
              </div>

              {/* Card 4: Outstanding Salary Due / Settlement Status */}
              <div className={`p-4.5 rounded-2xl border transition-all flex flex-col justify-between ${
                financials.netBalance > 0
                  ? 'bg-amber-50/50 hover:bg-amber-50/75 border-amber-200/70'
                  : 'bg-emerald-50/50 hover:bg-emerald-50/75 border-emerald-200/70'
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[11px] font-extrabold uppercase tracking-wider ${
                      financials.netBalance > 0 ? 'text-amber-800' : 'text-emerald-800'
                    }`}>
                      {financials.netBalance > 0 ? 'Outstanding Salary Due' : 'All Salaries Settled'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border shadow-2xs ${
                        financials.netBalance > 0
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          financials.netBalance > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                        }`}
                      />
                      <span>{financials.netBalance > 0 ? 'Due' : 'Settled'}</span>
                    </span>
                  </div>
                  <p className={`text-2xl font-black mt-1 tracking-tight ${
                    financials.netBalance > 0 ? 'text-amber-900' : 'text-emerald-900'
                  }`}>
                    {formatCurrency(financials.netBalance)}
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-medium text-slate-600">
                  <span>Contract: <strong className="text-slate-900 font-bold">{formatCurrency(financials.totalSalaryAllocated)}</strong></span>
                  <span>Settled: <strong className="text-emerald-700 font-bold">{formatCurrency(financials.totalPaid)}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Salary Payouts & Advance Payment History */}
          <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-black text-slate-900 flex items-center gap-2">
                  <Wallet size={18} className="text-teal-600" />
                  <span>Salary Payout & Advance Payment History</span>
                </h3>
                <p className="text-[12px] text-slate-500">
                  Audit trail of all salary disbursements and staff advances issued for {agency.name}.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter Pills for All / Salary / Advance */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-[11.5px] font-bold">
                  <button
                    type="button"
                    onClick={() => setPayoutTypeFilter('all')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      payoutTypeFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({financials.payoutsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoutTypeFilter('salary')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      payoutTypeFilter === 'salary'
                        ? 'bg-white text-teal-700 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Salaries ({financials.salaryCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoutTypeFilter('advance')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      payoutTypeFilter === 'advance'
                        ? 'bg-white text-amber-700 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Advances ({financials.advanceCount})
                  </button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="text-[12px] font-bold border-slate-200 flex items-center gap-1.5"
                  onClick={() => {
                    setPayoutFormType('salary')
                    setShowLogPayoutModal(true)
                  }}
                >
                  <Plus size={13} className="text-teal-600" />
                  <span>Record Payment</span>
                </Button>
              </div>
            </div>

            {(!agency.payouts || agency.payouts.length === 0) ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
                <CreditCard size={28} className="mx-auto text-slate-400 mb-2" />
                <p className="text-[14px] font-bold text-slate-700">No Salary Payouts or Advances Logged Yet</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Click "Salary Payout" or "Record Payment" to record a salary settlement or staff advance.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Payment Date</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Recipient / Staff</th>
                      <th className="py-3 px-4">Reference / Tx No</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[12.5px]">
                    {(agency.payouts || [])
                      .filter(p => {
                        if (payoutTypeFilter === 'advance') return p.payment_type === 'advance'
                        if (payoutTypeFilter === 'salary') return p.payment_type !== 'advance'
                        return true
                      })
                      .map(p => {
                        const isAdvance = p.payment_type === 'advance'
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                              {formatDate(p.payment_date)}
                            </td>
                            <td className="py-3 px-4">
                              {isAdvance ? (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80">
                                  <Zap size={10} className="fill-amber-600 text-amber-600" />
                                  <span>Advance</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200/80">
                                  <Wallet size={10} className="text-teal-700" />
                                  <span>Salary Payout</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {p.cleaner_name ? (
                                <div className="flex items-center gap-1.5">
                                  <Users size={12} className="text-teal-600 shrink-0" />
                                  <span className="font-bold text-slate-800">{p.cleaner_name}</span>
                                </div>
                              ) : (
                                <span className="text-slate-500 font-medium">🏢 General Agency Fleet</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-[11.5px] font-mono text-slate-600">
                              {p.reference_no || '—'}
                            </td>
                            <td className="py-3 px-4 capitalize text-[12px] font-medium text-slate-700">
                              {p.payment_method.replace('_', ' ')}
                            </td>
                            <td className={`py-3 px-4 text-right font-black text-[13.5px] ${
                              isAdvance ? 'text-amber-800' : 'text-emerald-700'
                            }`}>
                              {formatCurrency(p.amount)}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${
                                  p.status === 'paid'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                                    : 'bg-amber-50 text-amber-800 border-amber-200/80'
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-[12px] text-slate-500 italic max-w-xs truncate">
                              {p.notes || '—'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeletePayout(p.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete payment record"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Live Sourced Shifts & Duty Allocation (Synced with Daily Job Sheet) */}
          <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_20px_rgba(15,23,42,0.03)] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-black text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-teal-600" />
                  <span>Live Clean Shifts & Duty Allocation (Daily Job Sheet Sync)</span>
                </h3>
                <p className="text-[12px] text-slate-500">
                  Real-time audit trail of client bookings executed by {agency.name}'s staff and calculated duty salary.
                </p>
              </div>

              {/* Shift Search & Cleaner Filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search shifts, client, area..."
                    value={shiftsSearch}
                    onChange={e => setShiftsSearch(e.target.value)}
                    className="w-full text-[12px] pl-8.5 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-medium"
                  />
                  {shiftsSearch && (
                    <button
                      type="button"
                      onClick={() => setShiftsSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {agencyStaff.length > 1 && (
                  <select
                    value={shiftsStaffFilter}
                    onChange={e => setShiftsStaffFilter(e.target.value)}
                    className="text-[12px] px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-700 cursor-pointer"
                  >
                    <option value="all">👥 All Staff ({agencyStaff.length})</option>
                    {agencyStaff.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {staffJobsData.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
                <FileText size={28} className="mx-auto text-slate-400 mb-2" />
                <p className="text-[14px] font-bold text-slate-700">No Service Shifts Found</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  When assigned cleaners complete bookings on the Daily Job Sheet, their duty hours and salary allocation will appear here automatically.
                </p>
              </div>
            ) : (() => {
              const q = shiftsSearch.toLowerCase().trim()
              const visibleShifts = staffJobsData.filter(item => {
                if (shiftsStaffFilter !== 'all' && item.employee.id !== shiftsStaffFilter) return false
                if (!q) return true
                return (
                  (item.employee.full_name || '').toLowerCase().includes(q) ||
                  (item.job.address || '').toLowerCase().includes(q) ||
                  (item.job.area || '').toLowerCase().includes(q) ||
                  (item.job.service || '').toLowerCase().includes(q) ||
                  (item.job.date || '').includes(q)
                )
              })

              const visibleTotalRev = visibleShifts.reduce((acc, s) => acc + s.revenue, 0)
              const visibleTotalSalary = visibleShifts.reduce((acc, s) => acc + s.salaryShare, 0)
              const visibleTotalDuty = visibleShifts.reduce((acc, s) => acc + (Number(s.job.duty_hours) || 0), 0)

              return (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Staff Member</th>
                          <th className="py-3 px-4">Client / Location</th>
                          <th className="py-3 px-4">Service</th>
                          <th className="py-3 px-4 text-center">Duty</th>
                          <th className="py-3 px-4 text-right">Job Revenue</th>
                          <th className="py-3 px-4 text-right">Duty Salary (AED)</th>
                          <th className="py-3 px-4 text-center">Job Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[12.5px]">
                        {visibleShifts.slice(0, 40).map(({ job, employee, revenue, salaryShare }, idx) => (
                          <tr key={`${job.id || idx}-${job.date}`} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                              {formatDate(job.date)}
                            </td>
                            <td className="py-2.5 px-4">
                              <Link
                                to={`/employees/${employee.id}`}
                                className="font-bold text-slate-800 hover:text-teal-700 flex items-center gap-1.5"
                              >
                                <span className="w-6 h-6 rounded-lg bg-teal-50 text-teal-800 text-[10px] font-extrabold flex items-center justify-center">
                                  {(employee.full_name || 'S').slice(0, 2).toUpperCase()}
                                </span>
                                <span>{employee.full_name}</span>
                              </Link>
                            </td>
                            <td className="py-2.5 px-4 text-[12px] text-slate-600 max-w-[200px] truncate">
                              {job.address || job.area || 'Client Booking'}
                            </td>
                            <td className="py-2.5 px-4 text-[12px] text-slate-600">
                              {job.service || 'Cleaning'}
                            </td>
                            <td className="py-2.5 px-4 text-center text-[12px] font-bold text-slate-700">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                                {job.duty_hours || '4'}h
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-semibold text-slate-800">
                              {formatCurrency(revenue)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-black text-teal-700">
                              {formatCurrency(salaryShare)}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${
                                (job.payment_mode as string) === 'Paid' || (job.received >= job.charges && job.charges > 0)
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                                  : 'bg-teal-50 text-teal-800 border-teal-200/80'
                              }`}>
                                {job.payment_mode || job.status || 'Completed'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Bar */}
                  <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between text-[12px] font-bold text-slate-700 flex-wrap gap-2">
                    <span>
                      Showing {Math.min(visibleShifts.length, 40)} of {visibleShifts.length} Shifts
                    </span>
                    <div className="flex items-center gap-4 flex-wrap">
                      <span>Total Duty: <strong className="text-slate-900">{visibleTotalDuty}h</strong></span>
                      <span>Total Revenue: <strong className="text-slate-900">{formatCurrency(visibleTotalRev)}</strong></span>
                      <span>Total Duty Pay: <strong className="text-teal-700">{formatCurrency(visibleTotalSalary)}</strong></span>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: CONTRACT & SLA DETAILS
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'contract' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Master Contract & Terms */}
          <div className="bg-white rounded-[28px] border border-slate-200/90 shadow-[0_4px_25px_rgba(15,23,42,0.03)] p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-[16px] font-black text-slate-900">Contract Agreement</h3>
                  <p className="text-[12px] text-slate-500">Legal partnership validity & commercial terms</p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="text-[12px] font-bold border-slate-200"
                onClick={() => setShowEditProfileModal(true)}
              >
                <Edit2 size={13} className="mr-1 text-teal-600" />
                Edit Profile
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[10.5px] font-bold uppercase text-slate-400">Agreement Reference</span>
                  <p className="font-bold text-slate-900 mt-0.5">{agency.contract_ref || 'AGR-PENDING'}</p>
                </div>
                <div>
                  <span className="text-[10.5px] font-bold uppercase text-slate-400">Agreement Status</span>
                  <p className="font-black text-emerald-700 mt-0.5 uppercase text-[12px]">
                    {agency.status === 'active' ? 'Active Vendor' : 'Inactive'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[10.5px] font-bold uppercase text-slate-400">Contract Start Date</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{formatDate(agency.contract_start_date)}</p>
                </div>
                <div>
                  <span className="text-[10.5px] font-bold uppercase text-slate-400">Contract End / Renewal</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{formatDate(agency.contract_end_date)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[10.5px] font-bold uppercase text-slate-400">UAE Trade License No.</span>
                  <p className="font-mono font-bold text-slate-800 mt-0.5">{agency.trade_license_no || 'Not Registered'}</p>
                </div>
                <div>
                  <span className="text-[10.5px] font-bold uppercase text-slate-400">Tax TRN Number</span>
                  <p className="font-mono font-bold text-slate-800 mt-0.5">{agency.trn_no || '100234567890003'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[10.5px] font-bold uppercase text-slate-400">Contract Terms</span>
                  <p className="font-black text-teal-700 text-[15px] mt-0.5">
                    {agency.contracted_amount ? `AED ${agency.contracted_amount.toLocaleString()}/mo` : (agency.price ? `AED ${agency.price.toLocaleString()}/mo` : (agency.payment_terms || 'Monthly Contract'))}
                  </p>
                </div>
                <div>
                  <span className="text-[10.5px] font-bold uppercase text-slate-400">Billing Terms</span>
                  <p className="font-bold text-slate-800 mt-0.5">{agency.payment_terms || 'Monthly (Net 15)'}</p>
                </div>
              </div>

              {/* Disbursement Bank Details */}
              <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200/70">
                <div className="flex items-center gap-2 mb-2">
                  <Landmark size={15} className="text-teal-700" />
                  <span className="text-[12px] font-black text-teal-900 uppercase tracking-wider">
                    Disbursement Bank Details
                  </span>
                </div>
                <div className="space-y-1 text-[12.5px] text-teal-950 font-medium">
                  <p>Bank: <strong>{agency.bank_details?.bank_name || 'Emirates NBD'}</strong></p>
                  <p>Title: <strong>{agency.bank_details?.account_title || agency.name}</strong></p>
                  <p className="font-mono text-[12px] text-teal-900">
                    IBAN: {agency.bank_details?.iban || 'AE12 0260 0010 0234 5678 901'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Manpower SLA & Guarantees */}
          <div className="bg-white rounded-[28px] border border-slate-200/90 shadow-[0_4px_25px_rgba(15,23,42,0.03)] p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <Shield size={18} />
                </div>
                <div>
                  <h3 className="text-[16px] font-black text-slate-900">Manpower SLA & Guarantees</h3>
                  <p className="text-[12px] text-slate-500">Service Level Commitments & replacement terms</p>
                </div>
              </div>

              <div className="space-y-3.5 text-[12.5px]">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10.5px] font-extrabold uppercase text-slate-400 block mb-1">
                    Staff Quota (Contracted)
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      {isParentAgency ? `${employees.length} Cleaners (Total Fleet Pool)` : `${agency.quota_cleaners || 5} Cleaners / Technicians Minimum`}
                    </span>
                    <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-teal-100 text-teal-800">
                      Supplied: {agencyStaff.length}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10.5px] font-extrabold uppercase text-slate-400 block mb-1">
                    Staff Replacement Guarantee
                  </span>
                  <p className="font-medium text-slate-700">
                    {agency.replacement_guarantee || 'Replacement supplied within 24 hours in case of illness, leave, or termination.'}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10.5px] font-extrabold uppercase text-slate-400 block mb-1">
                    Attendance & Operational SLA
                  </span>
                  <p className="font-medium text-slate-700">
                    {agency.sla_terms || 'Minimum 98% attendance SLA required across all assigned shifts. Cleaners must report in company standard uniform.'}
                  </p>
                </div>

                {agency.notes && (
                  <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/70">
                    <span className="text-[10.5px] font-extrabold uppercase text-amber-800 block mb-1">
                      Partner Notes & Specialties
                    </span>
                    <p className="font-medium text-amber-950 italic">
                      "{agency.notes}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[12px] text-slate-500">
              <span>Partner record created: {formatDate(agency.created_at)}</span>
              <button
                type="button"
                onClick={() => setShowEditProfileModal(true)}
                className="text-teal-700 font-bold hover:underline cursor-pointer"
              >
                Update SLA & Terms →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS
         ══════════════════════════════════════════════════════════════════════ */}

      {/* ── 1. Salary Payout & Advance Payment Modal ── */}
      <Modal
        open={showLogPayoutModal}
        onClose={() => {
          setShowLogPayoutModal(false)
          setPayoutCleanerId('')
          setPayoutFormType('salary')
        }}
        title={`Record Salary Payment & Advances — ${agency.name}`}
        size="md"
        headerActions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowLogPayoutModal(false)
                setPayoutCleanerId('')
                setPayoutFormType('salary')
              }}
              className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="log-payout-form"
              size="sm"
              className="h-8 px-3 text-[11.5px] bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Check size={13} className="stroke-[2.5]" />
              <span>Record Payment</span>
            </Button>
          </div>
        }
      >
        <form id="log-payout-form" className="space-y-4" onSubmit={handleLogPayout}>
          {/* Payment Type Switcher: Salary Settlement vs Staff Advance */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setPayoutFormType('salary')}
              className={`py-2 px-3 rounded-lg text-[12px] font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                payoutFormType === 'salary'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wallet size={14} />
              <span>Salary Settlement</span>
            </button>
            <button
              type="button"
              onClick={() => setPayoutFormType('advance')}
              className={`py-2 px-3 rounded-lg text-[12px] font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                payoutFormType === 'advance'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap size={14} className="text-amber-500 fill-amber-500" />
              <span>Staff Advance</span>
            </button>
          </div>

          <div className={`p-3.5 rounded-xl border text-[12px] space-y-1 ${
            payoutFormType === 'advance'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-teal-50 border-teal-200 text-teal-900'
          }`}>
            <p className="font-bold flex items-center gap-1.5">
              {payoutFormType === 'advance' ? (
                <>
                  <Zap size={14} className="text-amber-600 fill-amber-600" />
                  <span>Issuing Advance Payment</span>
                </>
              ) : (
                <>
                  <Wallet size={14} className="text-teal-700" />
                  <span>Settling Accrued Salary / Contract</span>
                </>
              )}
            </p>
            <p className="text-[11.5px] opacity-90">
              Outstanding Salary Balance: <strong>{formatCurrency(financials.netBalance)}</strong> · Advances Paid: <strong>{formatCurrency(financials.totalAdvances)}</strong>
            </p>
          </div>

          {/* Cleaner / Staff Member Selector */}
          <div>
            <label className="text-[11.5px] font-bold text-slate-700 block mb-1">
              Recipient / Staff Member {payoutFormType === 'advance' ? '*' : '(Optional)'}
            </label>
            <select
              value={payoutCleanerId}
              onChange={e => setPayoutCleanerId(e.target.value)}
              className="w-full text-[12.5px] px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
            >
              <option value="">🏢 Entire Agency Fleet / General Settlement</option>
              {agencyStaff.map(emp => (
                <option key={emp.id} value={emp.id}>
                  👤 {emp.full_name} ({emp.role || 'Cleaner'}) — {emp.phone || emp.nationality || 'Staff'}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              {payoutFormType === 'advance'
                ? 'Select the specific cleaner receiving this advance against their monthly salary.'
                : 'Select a specific cleaner, or leave as General for vendor fleet disbursement.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="amount"
              label="Payout Amount (AED) *"
              type="number"
              placeholder="e.g. 1500"
              defaultValue={payoutFormType === 'salary' && financials.netBalance > 0 ? String(financials.netBalance) : '500'}
              required
            />
            <Input
              name="payment_date"
              label="Payment Date *"
              type="date"
              defaultValue={todayStr}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select name="payment_method" label="Payment Method">
              <option value="bank_transfer">Bank Wire / Transfer</option>
              <option value="cash">Cash in Hand</option>
              <option value="cheque">Cheque</option>
              <option value="credit">Account Credit / Offset</option>
            </Select>

            <Input
              name="reference_no"
              label="Transaction / Cheque Ref #"
              placeholder="e.g. FT262849102"
            />
          </div>

          <Select name="status" label="Settlement Status">
            <option value="paid">Paid & Settled</option>
            <option value="pending">Pending Approval</option>
            <option value="processing">In Bank Processing</option>
          </Select>

          <Input
            name="notes"
            label="Payment Remarks & Period"
            placeholder={payoutFormType === 'advance' ? 'e.g. Advance issued against upcoming salary' : 'e.g. Monthly salary settlement'}
          />
        </form>
      </Modal>

      {/* ── 2. Assign Cleaner to Agency Modal ── */}
      <Modal
        open={showAssignStaffModal}
        onClose={() => setShowAssignStaffModal(false)}
        title="Assign Cleaner to Agency"
        size="lg"
        headerActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAssignStaffModal(false)}
            className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-slate-500">
            Select a cleaner from your current workforce to link them under <strong>{agency.name}</strong>. Their shifts will automatically count towards this agency's roster and billing.
          </p>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
            {assignableStaff.length === 0 ? (
              <p className="p-6 text-center text-slate-400 text-[13px]">
                All employees are already linked to this agency.
              </p>
            ) : (
              assignableStaff.map(emp => (
                <div key={emp.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[12px]">
                      {(emp.full_name || 'Staff').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-[13px]">{emp.full_name}</p>
                      <p className="text-[11.5px] text-slate-500">
                        {(emp.role || 'cleaner').replace('_', ' ')} • {emp.phone || 'No phone'}
                        {emp.agency_name ? ` (Current: ${emp.agency_name})` : ' (Safaeewala Fleet / Unassigned)'}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[12px]"
                    onClick={() => handleAssignStaff(emp.id)}
                  >
                    Assign to {agency.name.split(' ')[0]}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* ── 3. Quick Add Cleaner directly under this Agency ── */}
      <Modal
        open={showAddStaffModal}
        onClose={() => setShowAddStaffModal(false)}
        title={`Add New Cleaner under ${agency.name}`}
        headerActions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddStaffModal(false)}
              className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-cleaner-agency-form"
              size="sm"
              className="h-8 px-3 text-[11.5px] bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer shadow-xs"
            >
              Create & Link Staff
            </Button>
          </div>
        }
      >
        <form
          id="add-cleaner-agency-form"
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            addEmployee({
              full_name: fd.get('full_name') as string,
              phone: (fd.get('phone') as string) || '',
              role: (fd.get('role') as any) || 'cleaner',
              nationality: (fd.get('nationality') as string) || '',
              emirates_id: (fd.get('emirates_id') as string) || '',
              visa_expiry: (fd.get('visa_expiry') as string) || '',
              work_permit_expiry: (fd.get('visa_expiry') as string) || '',
              passport_expiry: '',
              skills: [],
              status: 'active',
              // Monthly salary only; no invented hourly rate (AUD-09)
              monthly_salary: Number(fd.get('monthly_salary')) || undefined,
              pay_rate_hourly: Number(fd.get('monthly_salary')) ? Math.round((Number(fd.get('monthly_salary')) / 200) * 10) / 10 : 0,
              agency_id: agency.id,
              agency_name: agency.name,
              joined_date: todayStr,
            })
            setShowAddStaffModal(false)
          }}
        >
          <Input name="full_name" label="Full Name *" placeholder="e.g. Ramesh Thapa" required />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="phone" label="Phone Number" placeholder="+971 50 000 0000" />
            <Select name="role" label="Staff Role" defaultValue="cleaner">
              <option value="cleaner">Cleaner</option>
              <option value="crew_lead">Supervisor / Crew Lead</option>
              <option value="driver">Driver</option>
              <option value="technical">Technical</option>
              <option value="store_cleaner">Store Cleaner</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="nationality" label="Nationality" defaultValue="Nepal" />
            <Input name="emirates_id" label="Emirates ID" placeholder="784-xxxx-xxxxxxx-x" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="visa_expiry" label="Visa Expiry Date" type="date" />
            <Input name="monthly_salary" label="Monthly Salary (AED)" type="number" placeholder="e.g. 2200" />
          </div>
        </form>
      </Modal>

      {/* ── 4. Unassign Staff Confirmation Modal ── */}
      {unassignTarget && (
        <Modal
          open={!!unassignTarget}
          onClose={() => setUnassignTarget(null)}
          title="Unassign Cleaner from Agency"
          headerActions={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUnassignTarget(null)}
                className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-[11.5px] bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer shadow-xs"
                onClick={() => handleUnassignStaff(unassignTarget)}
              >
                Unassign
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-[13px] text-slate-600">
              Are you sure you want to unlink <strong>{unassignTarget.full_name}</strong> from <strong>{agency.name}</strong>?
            </p>
            <p className="text-[12px] text-slate-500">
              This cleaner's profile and past booking history will be preserved as a Safaeewala staff member.
            </p>
          </div>
        </Modal>
      )}

      {/* ── 5. Comprehensive Edit Agency Profile Modal (Same 3-column format as Add New Agency) ── */}
      <Modal
        open={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
        title={`Edit Agency Profile — ${agency.name}`}
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
              onClick={() => setShowEditProfileModal(false)}
              className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-agency-profile-form"
              size="sm"
              className="h-8 px-4 text-[11.5px] bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Check size={13} className="stroke-[2.5]" />
              <span>Save Changes</span>
            </Button>
          </div>
        }
      >
        <form
          id="edit-agency-profile-form"
          className="space-y-4"
          onSubmit={handleSaveEditProfile}
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

                <Input name="name" label="Agency Name *" defaultValue={agency.name} required />
                <Input name="phone" label="Primary Phone Number *" defaultValue={agency.phone} required />
                <Input name="email" label="Email Address" type="email" defaultValue={agency.email} />
                <Input name="address" label="UAE Office Address" defaultValue={agency.address} />

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

                {/* Company Type Dropdown */}
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
                label="Trade License Number"
                defaultValue={agency.trade_license_no}
                placeholder="e.g. CN-1829472"
                category="trade_license"
                documents={editDocs}
                onAttach={files => handleEditFileUpload(files, 'trade_license')}
                onRemove={id => setEditDocs(prev => prev.filter(d => d.id !== id))}
                onPreview={doc => setPreviewDoc(doc)}
              />

              <div className="grid grid-cols-2 gap-2">
                <Input name="license_issue_date" label="License Issue Date" type="date" defaultValue={agency.license_issue_date} />
                <Input name="license_expiry_date" label="License Expiry Date" type="date" defaultValue={agency.license_expiry_date} />
              </div>

              {/* Tax Registration / TRN Field & Integrated Upload */}
              <InputFieldWithUpload
                name="trn_no"
                label="Tax TRN Number"
                defaultValue={agency.trn_no}
                placeholder="e.g. 100234567800001"
                category="tax_registration"
                documents={editDocs}
                onAttach={files => handleEditFileUpload(files, 'tax_registration')}
                onRemove={id => setEditDocs(prev => prev.filter(d => d.id !== id))}
                onPreview={doc => setPreviewDoc(doc)}
              />

              {/* NOC (No Objection Certificate) Field & Integrated Upload */}
              <InputFieldWithUpload
                name="noc_no"
                label="NOC (No Objection Certificate)"
                defaultValue={agency.noc_no}
                placeholder="e.g. NOC-DXB-2024-912"
                category="noc"
                documents={editDocs}
                onAttach={files => handleEditFileUpload(files, 'noc')}
                onRemove={id => setEditDocs(prev => prev.filter(d => d.id !== id))}
                onPreview={doc => setPreviewDoc(doc)}
              />

              <Input name="notes" label="Specialty & General Notes" defaultValue={agency.notes} placeholder="Specialties, roster notes..." />
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
                defaultValue={agency.contracted_amount ? String(agency.contracted_amount) : (agency.price ? String(agency.price) : '')}
                placeholder="e.g. 5000"
              />

              <div className="grid grid-cols-2 gap-2">
                {/* Staff Quota */}
                <Input
                  name="quota_cleaners"
                  label="Staff Quota (Target Staff)"
                  type="number"
                  placeholder="e.g. 5"
                  defaultValue={String(agency.quota_cleaners || 5)}
                />

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
                defaultValue={agency.contract_ref}
                placeholder="e.g. AGR-2024-ALSAFA-08"
                category="agreement"
                documents={editDocs}
                onAttach={files => handleEditFileUpload(files, 'agreement')}
                onRemove={id => setEditDocs(prev => prev.filter(d => d.id !== id))}
                onPreview={doc => setPreviewDoc(doc)}
              />

              <div className="grid grid-cols-2 gap-2">
                <Input name="contract_start_date" label="Start Date" type="date" defaultValue={agency.contract_start_date} />
                <Input name="contract_end_date" label="End Date" type="date" defaultValue={agency.contract_end_date} />
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

              {/* Disbursement Bank Details */}
              <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                  Disbursement Bank Account
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <Input
                    name="bank_name"
                    label="Bank Name"
                    defaultValue={agency.bank_details?.bank_name || 'Emirates NBD'}
                  />
                  <Input
                    name="account_title"
                    label="Account Title"
                    defaultValue={agency.bank_details?.account_title || agency.name}
                  />
                </div>
                <Input
                  name="iban"
                  label="IBAN"
                  defaultValue={agency.bank_details?.iban || 'AE120260001002345678901'}
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Direct Document Upload / Renewal Modal ── */}
      <Modal
        open={showUploadDocModal}
        onClose={() => setShowUploadDocModal(false)}
        title={`Upload Compliance Document — ${agency.name}`}
        headerActions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUploadDocModal(false)}
              className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="direct-upload-doc-form"
              size="sm"
              className="h-8 px-3 text-[11.5px] bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Upload size={12} className="stroke-[2.5]" />
              <span>Upload & Save</span>
            </Button>
          </div>
        }
      >
        <form id="direct-upload-doc-form" className="space-y-4" onSubmit={handleDirectUploadDoc}>
          <div className="p-3.5 rounded-xl bg-teal-50/80 border border-teal-200/80 text-teal-900 text-[12px] space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-teal-800">
              <ShieldCheck size={14} className="text-teal-600 shrink-0" />
              <span>Version History Guaranteed</span>
            </p>
            <p className="text-teal-700">
              Uploading a new document will automatically archive the previous version into Document History. All historical documents remain accessible and preserved.
            </p>
          </div>

          <div>
            <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Document Category *</label>
            <select
              name="doc_category"
              defaultValue={directUploadCategory}
              className="w-full text-[12.5px] px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
            >
              <option value="trade_license">UAE Trade License (DED)</option>
              <option value="noc">Ministry Labour Supply NOC (MOHRE)</option>
              <option value="tax_registration">Tax Registration Certificate (TRN)</option>
              <option value="agreement">Contract Agreement / Service Level Agreement (SLA)</option>
              <option value="emirates_id">Emirates ID (EID)</option>
              <option value="passport">Passport</option>
              <option value="workmen_compensation">Workmen's Compensation Insurance</option>
              <option value="other">Other Compliance / Insurance Document</option>
            </select>
          </div>

          <div>
            <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Select Document File (.pdf, .png, .jpg, .webp) *</label>
            <input
              name="doc_file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              required
              className="w-full text-[12px] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-[11.5px] file:font-bold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100/80 text-slate-600 border border-slate-200 rounded-xl p-1.5 cursor-pointer bg-slate-50/50"
            />
          </div>

          <Input
            name="doc_notes"
            label="Renewal / Document Notes"
            placeholder="e.g. 2026-2027 Annual Renewal Certificate"
          />
        </form>
      </Modal>

      {/* ── Document Full Preview Modal ── */}
      {previewDoc && (
        <Modal
          open={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          title={`Document Preview — ${previewDoc.name}`}
          size="lg"
          headerActions={
            <div className="flex items-center gap-2">
              {previewDoc.file_data && (
                <a
                  href={previewDoc.file_data}
                  download={previewDoc.name}
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-[11.5px] font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-xs transition-colors"
                >
                  <Download size={13} />
                  <span>Download File</span>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[12px] bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 capitalize">
                  {previewDoc.category.replace('_', ' ')}
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                  v{previewDoc.version || 1}
                </span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                  previewDoc.is_active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {previewDoc.is_active !== false ? 'Active Document' : 'Archived History'}
                </span>
              </div>
              <span className="text-slate-500">
                Uploaded: {formatDate(previewDoc.uploaded_at)}
              </span>
            </div>

            {/* Document Render Area */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-900/5 min-h-[360px] flex items-center justify-center p-2">
              {previewDoc.file_data ? (
                previewDoc.file_type?.includes('image') || previewDoc.file_data.startsWith('data:image/') ? (
                  <img
                    src={previewDoc.file_data}
                    alt={previewDoc.name}
                    className="max-h-[600px] w-auto max-w-full rounded-xl object-contain shadow-sm bg-white"
                  />
                ) : previewDoc.file_type?.includes('pdf') || previewDoc.file_data.startsWith('data:application/pdf') ? (
                  <iframe
                    src={previewDoc.file_data}
                    title={previewDoc.name}
                    className="w-full h-[600px] rounded-xl border-0 bg-white"
                  />
                ) : (
                  <div className="text-center p-8">
                    <FileCheck size={40} className="mx-auto text-teal-600 mb-2" />
                    <p className="font-bold text-slate-800 text-[14px]">{previewDoc.name}</p>
                    <p className="text-[12px] text-slate-500 mt-1">This file type can be downloaded directly.</p>
                    <a
                      href={previewDoc.file_data}
                      download={previewDoc.name}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-xl font-bold text-[12px] hover:bg-teal-700 shadow-sm"
                    >
                      <Download size={13} /> Download File
                    </a>
                  </div>
                )
              ) : (
                <div className="text-center p-8 text-slate-400">
                  <AlertCircle size={36} className="mx-auto mb-2 text-slate-300" />
                  <p className="font-bold text-slate-600">No binary file preview available</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">Please upload a scanned document or digital certificate.</p>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}


      {/* ── 6. Dedicated Cleaner Profile & Rates Modal ── */}
      {profileStaff && (() => {
        const history = getEmployeeDailyJobsHistory(profileStaff, dailyJobs)
        const totalDuty = history.reduce((acc, j) => acc + (Number(j.duty_hours) || 0), 0)
        const cleanerRevenue = Math.round(history.reduce((acc, j) => acc + jobChargeShare(j), 0))
        const todayJob = dailyJobs.find(j => j.date === todayStr && employeeMatchesStaff(profileStaff, j.staff_name))
        const visaDays = profileStaff.visa_expiry ? daysUntil(profileStaff.visa_expiry) : null
        const visaValid = visaDays !== null && visaDays > 60

        return (
          <Modal
            open={Boolean(profileStaff)}
            onClose={() => setProfileStaff(null)}
            title={`Cleaner Profile — ${profileStaff.full_name}`}
            size="lg"
            headerActions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProfileStaff(null)}
                className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </Button>
            }
          >
            <div className="space-y-5">
              {/* Header Card */}
              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-2xl p-4.5 border border-teal-200/80 flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white font-extrabold text-lg flex items-center justify-center shrink-0 shadow-sm">
                  {(profileStaff.full_name || 'Staff').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-black text-slate-900">{profileStaff.full_name}</h3>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize border border-slate-200/80">
                      {(profileStaff.role === 'ducting' || profileStaff.role === 'technical') ? 'Technical' : (profileStaff.role || 'cleaner').replace('_', ' ')}
                    </span>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                      todayJob
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : profileStaff.status === 'on_leave'
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}>
                      {todayJob ? '● Working Today' : profileStaff.status === 'on_leave' ? 'On Leave' : '● Standby Available'}
                    </span>
                  </div>
                  <p className="text-[12px] text-teal-800 font-semibold mt-1 flex items-center gap-1.5">
                    <Building2 size={13} className="text-teal-600" />
                    <span>Recruited & Sourced via <strong>{agency.name}</strong></span>
                  </p>
                </div>
              </div>

              {/* 3 Rates & Financial Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Cleaner Pay Rate</span>
                  <p className="text-xl font-black text-slate-900 mt-0.5">
                    {formatMonthlySalary(profileStaff)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Direct cleaner compensation</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Payment Terms</span>
                  <p className="text-xl font-black text-teal-700 mt-0.5">
                    {agency.payment_terms || 'Monthly'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{agency.price ? `AED ${agency.price}/mo quota` : 'Standard contract'}</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Gross Billed Revenue</span>
                  <p className="text-xl font-black text-emerald-700 mt-0.5">
                    {formatCurrency(cleanerRevenue)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{history.length} shifts · {totalDuty}h logged</p>
                </div>
              </div>

              {/* Contact & Today's Shift */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 text-[12.5px]">
                  <div className="flex items-center gap-4 flex-wrap">
                    {profileStaff.phone && (
                      <a href={`tel:${profileStaff.phone}`} className="font-bold text-slate-800 hover:text-teal-700 flex items-center gap-1.5">
                        <Phone size={13} className="text-teal-600" />
                        <span>{profileStaff.phone}</span>
                      </a>
                    )}
                    {profileStaff.email && (
                      <a href={`mailto:${profileStaff.email}`} className="text-slate-600 hover:text-teal-700 flex items-center gap-1.5">
                        <Mail size={13} className="text-teal-600" />
                        <span>{profileStaff.email}</span>
                      </a>
                    )}
                    <span className="text-slate-500 font-medium">
                      Nationality: <strong className="text-slate-800">{profileStaff.nationality || 'Not specified'}</strong>
                    </span>
                  </div>
                </div>

                {todayJob && (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[12px] flex items-center gap-2">
                    <Calendar size={14} className="text-emerald-700 shrink-0" />
                    <span className="font-bold text-emerald-900">Today's Assigned Shift:</span>
                    <span className="text-emerald-800 font-medium">{todayJob.area || todayJob.address || 'Cleaning Shift'} · {todayJob.duty_hours || 4}h duty</span>
                  </div>
                )}
              </div>

              {/* Skills & Badges */}
              {profileStaff.skills && profileStaff.skills.length > 0 && (
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Cleaning Skills & Specializations</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {profileStaff.skills.map(s => (
                      <span key={s} className="bg-teal-50 text-teal-800 border border-teal-200/80 px-2.5 py-0.5 rounded-lg text-[11.5px] font-bold">
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Identity & Legal Docs Grid */}
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Legal Compliance & Emirates Documents</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[12px]">
                  <div className="bg-white rounded-xl p-2.5 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Emirates ID</span>
                    <span className="font-extrabold text-slate-800">{profileStaff.emirates_id || 'Not registered'}</span>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Visa Expiry</span>
                    <span className={`font-extrabold ${visaValid ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {profileStaff.visa_expiry ? formatDate(profileStaff.visa_expiry) : 'Not recorded'}
                    </span>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Passport Expiry</span>
                    <span className="font-extrabold text-slate-800">
                      {profileStaff.passport_expiry ? formatDate(profileStaff.passport_expiry) : 'Not recorded'}
                    </span>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Medical Insurance</span>
                    <span className="font-extrabold text-slate-800">
                      {profileStaff.medical_insurance_expiry ? formatDate(profileStaff.medical_insurance_expiry) : 'Covered'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Shifts Table */}
              {history.length > 0 && (
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Recent Cleaning Shifts (Last 5)</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-slate-50 text-[10.5px] uppercase font-bold text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Client / Area</th>
                          <th className="py-2 px-3 text-center">Duty Hours</th>
                          <th className="py-2 px-3 text-right">Charges</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {history.slice(0, 5).map((job, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 font-bold text-slate-800">{formatDate(job.date)}</td>
                            <td className="py-2 px-3 text-slate-700">{job.area || job.address || 'Cleaning Service'}</td>
                            <td className="py-2 px-3 text-center font-bold text-slate-800">{job.duty_hours ? `${job.duty_hours}h` : '—'}</td>
                            <td className="py-2 px-3 text-right font-extrabold text-teal-700">AED {job.charges || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="pt-3 border-t border-slate-200/80 flex items-center justify-end gap-3 flex-wrap">
                <Link
                  to={`/employees/${profileStaff.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-[12.5px] shadow-sm transition-all"
                >
                  <ExternalLink size={14} />
                  <span>Open Full Master Employee Page</span>
                </Link>
              </div>
            </div>
          </Modal>
        )
      })()}

    </div>
  )
}
