import React, { useState } from 'react'
import { isWrongDocDate } from '@/lib/utils'
import {
  UserCheck, Briefcase, CreditCard, Shield, Car, Sparkles, Check, FileText, FileCheck
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Employee, Agency, Client, EmployeeDocument, EmployeeRole } from '@/types'
import { MONTHLY_WORK_HOURS, formatEmpRole } from '@/lib/clientDataSync'
import { EmployeeDocumentPreviewModal } from './EmployeeDocumentField'
import { DocVersionsField } from '@/components/common/DocVersionsField'
import { addVersion, currentDocs, readAndStore, removeVersion, seedFromFields } from '@/lib/docVersions'
import { useAuth } from '@/store/UserContext'
import { useSalaryAccess } from '@/store/useModuleAccess'
import { todayDubai } from '@/lib/dubaiTime'
import { useData } from '@/store/DataContext'
import { notify, confirmAsync } from '@/lib/notify'
import { findDuplicateEmployee, formatEmiratesId, isUaeMobile, isValidEmiratesId } from '@/lib/validation'

export interface EmployeeFormModalProps {
  open: boolean
  onClose: () => void
  initialEmployee?: Employee | null
  agencies: Agency[]
  clients: Client[]
  onSave: (employeeData: Partial<Employee>) => void
  isSaving?: boolean
}

/** R-DOC-01: all document images with their versions; old employees bring their single image per document */
function getInitialDocs(initialEmployee?: Employee | null): EmployeeDocument[] {
  if (!initialEmployee) return []
  const e = initialEmployee
  return seedFromFields<EmployeeDocument>(e.documents, [
    ['eid', 'Emirates ID', e.eid_file], ['passport', 'Passport', e.passport_file], ['visa', 'Residency Visa', e.visa_file],
    ['work_permit', 'Work Permit', e.work_permit_file], ['noc', 'NOC / Labour Card', e.noc_file],
    ['other', 'Other Documents', e.other_documents_file],
    ['driving_license', 'Driving License', e.driving_license_file],
    ['medical_insurance', 'Medical Insurance', e.medical_insurance_file],
  ], e.created_at || new Date().toISOString())
}

export function EmployeeFormModal(props: EmployeeFormModalProps) {
  if (!props.open) return null
  return <EmployeeFormModalContent key={props.initialEmployee?.id || 'new'} {...props} />
}

function EmployeeFormModalContent({
  open,
  onClose,
  initialEmployee,
  agencies,
  clients,
  onSave,
  isSaving = false,
}: EmployeeFormModalProps) {
  const isEdit = !!initialEmployee

  // Selected role for dynamic driver vs cleaner field switching
  const [role, setRole] = useState<EmployeeRole>(() => initialEmployee?.role || 'cleaner')
  const [status, setStatus] = useState<Employee['status']>(() => initialEmployee?.status || 'active')

  // Document upload state
  const [docs, setDocs] = useState<EmployeeDocument[]>(() => getInitialDocs(initialEmployee))
  const { user: me } = useAuth()
  const seeSalary = useSalaryAccess() // R-SEC-08
  const cur = (c: EmployeeDocument['category']) => currentDocs(docs, c)[0]

  // Assigned client IDs (for cleaners and technical)
  const [assignedClientIds, setAssignedClientIds] = useState<string[]>(() => initialEmployee?.assigned_client_ids || [])

  // Preview modal for documents
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null)

  // R-DOC-01: one or more new images become current; the ones they replace show under them as Previous
  const handleAttachDoc = (category: EmployeeDocument['category'], files: FileList) => {
    // R-DOC-02: images and PDFs go to Storage as soon as they are picked
    void readAndStore(files, category, `employees/${initialEmployee?.id || 'new'}`, me?.full_name || me?.email || undefined)
      .then(added => setDocs(prev => addVersion(prev, category, added as EmployeeDocument[])))
      .catch(() => notify.error('Could not read this file — try another one'))
  }

  const handleRemoveDoc = (id: string) => setDocs(prev => removeVersion(prev, id))

  const { employees } = useData()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const str = (key: string) => ((fd.get(key) as string) || '').trim() || undefined

    // Issue date must not be after the expiry date
    const datePairs: [string, string, string][] = [
      ['eid_start_date', 'eid_end_date', 'Emirates ID'],
      ['passport_start_date', 'passport_expiry', 'Passport'],
      ['visa_start_date', 'visa_expiry', 'Residency Visa'],
      ['driving_license_issue_date', 'driving_license_expiry_date', 'Driving License'],
    ]
    for (const [from, to, label] of datePairs) {
      const a = str(from), b = str(to)
      // R-EMP-04: a typo year (0227 for 2027) is stopped here instead of becoming an "expired" alert
      const wrong = [a, b].find(d => d && isWrongDocDate(d))
      if (wrong) {
        notify.error(`${label}: the date ${wrong} has a wrong year — please correct it (e.g. 2027).`)
        return
      }
      if (a && b && a > b) {
        notify.error(`${label}: issue date cannot be after the expiry date.`)
        return
      }
    }

    const wpExpiry = str('work_permit_expiry')
    if (wpExpiry && isWrongDocDate(wpExpiry)) {
      notify.error('Work Permit: the expiry date has a wrong year — please correct it (e.g. 2027).')
      return
    }

    const monthly_salary = Number(fd.get('monthly_salary')) || 0
    const basic_salary = Number(fd.get('basic_salary')) || undefined
    const agencyId = (fd.get('agency_id') as string) || ''
    const selAgency = agencies.find(a => a.id === agencyId)
    const docsList: EmployeeDocument[] = docs
    // R-DOC-01: eid_file, passport_file … = the newest current image ('' once every image was removed)
    const fileOf = (c: EmployeeDocument['category'], old?: string) => cur(c)?.file_data || (docs.some(d => d.category === c) ? '' : old)

    const patch: Partial<Employee> = {
      full_name: fd.get('full_name') as string,
      short_name: str('short_name'),
      phone: fd.get('phone') as string,
      role,
      designation: formatEmpRole(role),
      gender: (fd.get('gender') as string) || 'Female',
      nationality: fd.get('nationality') as string,
      agency_id: agencyId || undefined,
      agency_name: selAgency?.name || (agencyId ? initialEmployee?.agency_name : undefined),

      // EID
      emirates_id: (fd.get('emirates_id') as string) || initialEmployee?.emirates_id || '',
      eid_start_date: (fd.get('eid_start_date') as string) || undefined,
      eid_end_date: (fd.get('eid_end_date') as string) || undefined,
      eid_file: fileOf('eid', initialEmployee?.eid_file),

      // Passport
      passport_number: (fd.get('passport_number') as string) || initialEmployee?.passport_number || undefined,
      passport_start_date: (fd.get('passport_start_date') as string) || undefined,
      passport_expiry: (fd.get('passport_expiry') as string) || '',
      passport_end_date: (fd.get('passport_expiry') as string) || undefined,
      passport_file: fileOf('passport', initialEmployee?.passport_file),

      // Visa
      visa_number: (fd.get('visa_number') as string) || initialEmployee?.visa_number || undefined,
      visa_start_date: (fd.get('visa_start_date') as string) || undefined,
      visa_expiry: (fd.get('visa_expiry') as string) || '',
      visa_end_date: (fd.get('visa_expiry') as string) || undefined,
      visa_file: fileOf('visa', initialEmployee?.visa_file),

      // Work Permit (Expiry Date only)
      work_permit_number: (fd.get('work_permit_number') as string) || initialEmployee?.work_permit_number || undefined,
      work_permit_expiry: (fd.get('work_permit_expiry') as string) || '',
      work_permit_end_date: (fd.get('work_permit_expiry') as string) || undefined,
      work_permit_file: fileOf('work_permit', initialEmployee?.work_permit_file),

      // Driving License (for Drivers)
      driving_license_no: (fd.get('driving_license_no') as string) || undefined,
      driving_license_place_of_issue: (fd.get('driving_license_place_of_issue') as string) || undefined,
      driving_license_issue_date: (fd.get('driving_license_issue_date') as string) || undefined,
      driving_license_expiry_date: (fd.get('driving_license_expiry_date') as string) || undefined,
      driving_license_type: (fd.get('driving_license_type') as string) || undefined,
      driving_license_file: fileOf('driving_license', initialEmployee?.driving_license_file),
      assigned_vehicle: (fd.get('assigned_vehicle') as string) || undefined,

      // Financial & Employment
      monthly_salary,
      basic_salary,
      pay_rate_hourly: Math.round((monthly_salary / MONTHLY_WORK_HOURS) * 10) / 10,
      medical_insurance: (fd.get('medical_insurance') as string) || undefined,
      medical_insurance_expiry: (fd.get('medical_insurance_expiry') as string) || undefined,
      medical_insurance_file: fileOf('medical_insurance', initialEmployee?.medical_insurance_file),
      joined_date: (fd.get('joined_date') as string) || initialEmployee?.joined_date || todayDubai(),
      end_date: (fd.get('end_date') as string) || undefined,
      noc: (fd.get('noc') as string) || undefined,
      noc_file: fileOf('noc', initialEmployee?.noc_file),
      other_documents_file: fileOf('other', initialEmployee?.other_documents_file),

      status,
      training_start_date: status === 'under_training' ? ((fd.get('training_start_date') as string) || todayDubai()) : undefined,
      training_end_date: status === 'under_training' ? ((fd.get('training_end_date') as string) || undefined) : undefined,
      training_duration_days: status === 'under_training' && fd.get('training_end_date') && fd.get('training_start_date') ? Math.max(1, Math.round((new Date(fd.get('training_end_date') as string).getTime() - new Date(fd.get('training_start_date') as string).getTime()) / (1000 * 60 * 60 * 24))) : undefined,

      // Skills & Clients
      skills: (fd.get('skills') as string)?.split(',').map(s => s.trim()).filter(Boolean) || [],
      assigned_client_ids: role === 'driver' ? [] : assignedClientIds,
      notes: (fd.get('notes') as string)?.trim() || undefined,

      // Document history
      documents: docsList.length > 0 ? docsList : initialEmployee?.documents,
    }

    // VAL-04: Emirates ID is 15 digits starting with 784 — stored as 784-YYYY-NNNNNNN-N
    if (patch.emirates_id) {
      if (!isValidEmiratesId(patch.emirates_id)) {
        notify.error('Emirates ID must be 15 digits starting with 784, e.g. 784-1990-1234567-1.')
        return
      }
      patch.emirates_id = formatEmiratesId(patch.emirates_id)
    }
    // VAL-03: UAE mobile format (other countries are allowed after a confirm)
    if (patch.phone && !isUaeMobile(patch.phone)) {
      const ok = await confirmAsync({ title: 'Phone number', message: `"${patch.phone}" does not look like a UAE mobile (050 123 4567). Save it anyway?`, confirmLabel: 'Save anyway' })
      if (!ok) return
    }
    // VAL-01: the same Emirates ID / passport / phone means the same person — never two records
    const dup = findDuplicateEmployee(employees, { emirates_id: patch.emirates_id || '', passport_number: patch.passport_number, phone: patch.phone || '' }, initialEmployee?.id)
    if (dup) {
      if (dup.reason === 'same phone number') {
        const ok = await confirmAsync({ title: 'Possible duplicate employee', message: `${dup.employee.full_name} already has this phone number. Save anyway?`, confirmLabel: 'Save anyway', tone: 'danger' })
        if (!ok) return
      } else {
        notify.error(`${dup.employee.full_name} is already registered with the ${dup.reason}. Open that employee instead.`)
        return
      }
    }

    onSave(patch)
    onClose()
  }

  // Filter clients to assignable list (excluding demo seed clients)
  const assignableClients = clients.filter(c => !c.id.startsWith('c1000001-'))

  const modalTitle = isEdit
    ? `Edit Employee Profile — ${initialEmployee?.full_name}`
    : 'Add New Employee'

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={modalTitle}
        size="xl"
        className="max-w-6xl"
        headerActions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
              <span className="text-[11px] font-bold text-slate-500">Status:</span>
              <select
                name="status"
                form="employee-form-modal"
                value={status}
                onChange={e => setStatus(e.target.value as Employee['status'])}
                className="text-[11.5px] px-2 py-1 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600 font-bold text-slate-800 cursor-pointer shadow-2xs"
              >
                <option value="active">Active</option>
                <option value="under_training">Under Training</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On Leave</option>
                <option value="engaged_in_project">Engaged in Project</option>
              </select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="employee-form-modal"
              size="sm"
              disabled={isSaving}
              className="h-8 px-4 text-[11.5px] bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Check size={13} className="stroke-[2.5]" />
              <span>{isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Employee'}</span>
            </Button>
          </div>
        }
      >
        <form id="employee-form-modal" className="space-y-3.5" onSubmit={handleSubmit}>
          {/* ── Row 1: Profile · Role & Sourcing · Employment (Single Horizontal Row) ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Employee Profile */}
            <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                <UserCheck size={13} className="text-teal-600" />
                <span>Employee Profile</span>
              </h4>

              <Input
                name="full_name"
                label="Full Name *"
                defaultValue={initialEmployee?.full_name || ''}
                placeholder="e.g. Maria Santos"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  name="phone"
                  label="Phone"
                  defaultValue={initialEmployee?.phone || ''}
                  placeholder="+971 50 000 0000"
                />
                <div>
                  <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Gender</label>
                  <select
                    name="gender"
                    defaultValue={initialEmployee?.gender || 'Female'}
                    className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  name="nationality"
                  label="Nationality"
                  defaultValue={initialEmployee?.nationality || ''}
                  placeholder="e.g. Filipino, Nepali..."
                />
                <Input
                  name="short_name"
                  label="Short Name"
                  defaultValue={initialEmployee?.short_name || ''}
                  placeholder="e.g. Maria"
                />
              </div>
            </div>

            {/* Role & Sourcing */}
            <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                  <Briefcase size={13} className="text-teal-600" />
                  <span>Role & Sourcing</span>
                </h4>
                <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200/60">
                  {role === 'driver' ? 'Driver Form' : 'Cleaner & Technical Form'}
                </span>
              </div>

              <div>
                <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Designation / Role *</label>
                <select
                  name="role"
                  value={role}
                  onChange={e => setRole(e.target.value as EmployeeRole)}
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                  required
                >
                  <option value="cleaner">Cleaner</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="technical">Technical</option>
                  <option value="store_cleaner">Store Cleaner</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
              <div>
                <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Agency / Sourcing Source</label>
                <select
                  name="agency_id"
                  defaultValue={initialEmployee?.agency_id || ''}
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                >
                  <option value="">Safaeewala (Parent Company)</option>
                  {agencies
                    .filter(a => a.id !== 'agency-safaeewala' && a.company_type !== 'Parent Company' && !a.name.toLowerCase().includes('safaeewala'))
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.status})
                      </option>
                    ))}
                </select>
              </div>
              <p className="text-[10.5px] text-slate-500 font-medium">
                Document & assignment fields below switch automatically with the designation.
              </p>
            </div>

            {/* Employment & Salary */}
            <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                <CreditCard size={13} className="text-teal-600" />
                <span>Employment & Salary</span>
              </h4>

              {seeSalary ? (
                <div className="space-y-2">
                  <Input
                    name="monthly_salary"
                    label="Total Salary (AED/mo) *"
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={initialEmployee?.monthly_salary ? String(initialEmployee.monthly_salary) : (initialEmployee?.pay_rate_hourly ? String(Math.round(initialEmployee.pay_rate_hourly * MONTHLY_WORK_HOURS)) : '2500')}
                    placeholder="2500"
                    required
                  />
                  <Input
                    name="basic_salary"
                    label="Basic Salary (AED/mo)"
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={initialEmployee?.basic_salary ? String(initialEmployee.basic_salary) : ''}
                    placeholder="e.g. 1500"
                  />
                </div>
              ) : (
                <>
                  {/* R-SEC-08: the salary is kept as it is; only Admin (or a role given Salary) sees and sets it */}
                  <input type="hidden" name="monthly_salary" defaultValue={initialEmployee?.monthly_salary ? String(initialEmployee.monthly_salary) : (initialEmployee?.pay_rate_hourly ? String(Math.round(initialEmployee.pay_rate_hourly * MONTHLY_WORK_HOURS)) : '')} />
                  <input type="hidden" name="basic_salary" defaultValue={initialEmployee?.basic_salary ? String(initialEmployee.basic_salary) : ''} />
                  <p className="text-[11.5px] text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">Salary: set by Admin</p>
                </>
              )}

              {status === 'under_training' && (
                <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 block flex items-center gap-1">
                    <span>⚡ Under Training Period</span>
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      name="training_start_date"
                      label="Training Start"
                      type="date"
                      defaultValue={initialEmployee?.training_start_date || todayDubai()}
                      className="h-8 text-[11px] min-w-[125px] bg-white border-amber-200"
                    />
                    <Input
                      name="training_end_date"
                      label="Training End"
                      type="date"
                      defaultValue={initialEmployee?.training_end_date || ''}
                      className="h-8 text-[11px] min-w-[125px] bg-white border-amber-200"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Input
                  name="joined_date"
                  label="Joined Date"
                  type="date"
                  defaultValue={initialEmployee?.joined_date || todayDubai()}
                />
                <Input
                  name="end_date"
                  label="Contract End Date"
                  type="date"
                  defaultValue={initialEmployee?.end_date || ''}
                />
              </div>
            </div>
          </div>

          {/* ── Row 2: Standard Compliance Documents (EID, Passport, Visa, Work Permit) ── */}
          <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Shield size={13} className="text-teal-600" />
                <span>Standard Compliance Documents</span>
              </h4>
              <span className="text-[10.5px] font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200/80">
                Pure image upload with thumbnail preview & validity tracking
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* Card 1: Emirates ID (Sky Blue Tint) */}
              <div className="bg-sky-50/70 border border-sky-200/90 rounded-2xl p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-sky-200/60">
                  <span className="text-[11px] font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
                    <FileText size={12} className="text-sky-600" />
                    <span>Emirates ID (EID)</span>
                  </span>
                  {cur('eid')?.file_data ? (
                    <span className="text-[9.5px] font-black text-sky-700 bg-sky-100/90 px-1.5 py-0.5 rounded-md border border-sky-200">
                      ATTACHED
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-semibold text-sky-600/70">
                      Required
                    </span>
                  )}
                </div>
                <DocVersionsField
                  category="eid"
                  docs={docs}
                  accent="sky"
                  onUpload={f => handleAttachDoc('eid', f)}
                  onRemove={handleRemoveDoc}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <Input
                    name="eid_start_date"
                    label="Issue Date"
                    type="date"
                    defaultValue={initialEmployee?.eid_start_date || ''}
                    className="h-8 text-[11px] min-w-[125px] bg-white border-sky-200/80 focus:border-sky-500"
                  />
                  <Input
                    name="eid_end_date"
                    label="Expiry Date"
                    type="date"
                    defaultValue={initialEmployee?.eid_end_date || ''}
                    className="h-8 text-[11px] min-w-[125px] bg-white border-sky-200/80 focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Card 2: Passport (Purple Tint) */}
              <div className="bg-purple-50/70 border border-purple-200/90 rounded-2xl p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-purple-200/60">
                  <span className="text-[11px] font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                    <FileText size={12} className="text-purple-600" />
                    <span>Passport</span>
                  </span>
                  {cur('passport')?.file_data ? (
                    <span className="text-[9.5px] font-black text-purple-700 bg-purple-100/90 px-1.5 py-0.5 rounded-md border border-purple-200">
                      ATTACHED
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-semibold text-purple-600/70">
                      Required
                    </span>
                  )}
                </div>
                <DocVersionsField
                  category="passport"
                  docs={docs}
                  accent="purple"
                  onUpload={f => handleAttachDoc('passport', f)}
                  onRemove={handleRemoveDoc}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <Input
                    name="passport_start_date"
                    label="Issue Date"
                    type="date"
                    defaultValue={initialEmployee?.passport_start_date || ''}
                    className="h-8 text-[11px] min-w-[125px] bg-white border-purple-200/80 focus:border-purple-500"
                  />
                  <Input
                    name="passport_expiry"
                    label="Expiry Date"
                    type="date"
                    defaultValue={initialEmployee?.passport_expiry || initialEmployee?.passport_end_date || ''}
                    className="h-8 text-[11px] min-w-[125px] bg-white border-purple-200/80 focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Card 3: Residency Visa (Amber Tint) */}
              <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-amber-200/60">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <Shield size={12} className="text-amber-600" />
                    <span>Residency Visa</span>
                  </span>
                  {cur('visa')?.file_data ? (
                    <span className="text-[9.5px] font-black text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded-md border border-amber-200">
                      ATTACHED
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-semibold text-amber-600/70">
                      Required
                    </span>
                  )}
                </div>
                <DocVersionsField
                  category="visa"
                  docs={docs}
                  accent="amber"
                  onUpload={f => handleAttachDoc('visa', f)}
                  onRemove={handleRemoveDoc}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <Input
                    name="visa_start_date"
                    label="Issue Date"
                    type="date"
                    defaultValue={initialEmployee?.visa_start_date || ''}
                    className="h-8 text-[11px] min-w-[125px] bg-white border-amber-200/80 focus:border-amber-500"
                  />
                  <Input
                    name="visa_expiry"
                    label="Expiry Date"
                    type="date"
                    defaultValue={initialEmployee?.visa_expiry || initialEmployee?.visa_end_date || ''}
                    className="h-8 text-[11px] min-w-[125px] bg-white border-amber-200/80 focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Card 4: Work Permit (Emerald Tint) — Expiry Date ONLY */}
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-emerald-200/60">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                    <FileCheck size={12} className="text-emerald-600" />
                    <span>Work Permit</span>
                  </span>
                  {cur('work_permit')?.file_data ? (
                    <span className="text-[9.5px] font-black text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded-md border border-emerald-200">
                      ATTACHED
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-semibold text-emerald-600/70">
                      Required
                    </span>
                  )}
                </div>
                <DocVersionsField
                  category="work_permit"
                  docs={docs}
                  accent="emerald"
                  onUpload={f => handleAttachDoc('work_permit', f)}
                  onRemove={handleRemoveDoc}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="pt-0.5">
                  <Input
                    name="work_permit_expiry"
                    label="Expiry Date"
                    type="date"
                    defaultValue={initialEmployee?.work_permit_expiry || initialEmployee?.work_permit_end_date || ''}
                    className="h-8 text-[11px] min-w-[125px] bg-white border-emerald-200/80 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Card 5: NOC / Labour Clearance (Indigo Tint) */}
              <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-indigo-200/60">
                  <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                    <FileText size={12} className="text-indigo-600" />
                    <span>NOC</span>
                  </span>
                  {cur('noc')?.file_data ? (
                    <span className="text-[9.5px] font-black text-indigo-700 bg-indigo-100/90 px-1.5 py-0.5 rounded-md border border-indigo-200">
                      ATTACHED
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-semibold text-indigo-600/70">
                      Optional
                    </span>
                  )}
                </div>
                <DocVersionsField
                  category="noc"
                  docs={docs}
                  accent="indigo"
                  onUpload={f => handleAttachDoc('noc', f)}
                  onRemove={handleRemoveDoc}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="pt-0.5">
                  <Input
                    name="noc"
                    label="NOC Details / Reference"
                    defaultValue={initialEmployee?.noc || ''}
                    placeholder="e.g. MOHRE NOC / Clearance #1234"
                    className="h-8 text-[11px] bg-white border-indigo-200/80 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Card 6: Other Documents (Slate / Teal Tint) — Multi-upload */}
              <div className="bg-slate-100/80 border border-slate-300/80 rounded-2xl p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <FileText size={12} className="text-teal-600" />
                    <span>Other Documents</span>
                  </span>
                  {currentDocs(docs, 'other').length > 0 ? (
                    <span className="text-[9.5px] font-black text-teal-800 bg-teal-100/90 px-1.5 py-0.5 rounded-md border border-teal-200">
                      {currentDocs(docs, 'other').length} ATTACHED
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-semibold text-slate-500">
                      Multi-upload
                    </span>
                  )}
                </div>
                <DocVersionsField
                  category="other"
                  docs={docs}
                  accent="teal"
                  uploadText="Upload EID, Passport, residency files…"
                  onUpload={f => handleAttachDoc('other', f)}
                  onRemove={handleRemoveDoc}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="pt-0.5">
                  <p className="text-[10px] text-slate-500 font-medium">
                    Upload multiple images or PDFs (EID copy, extra certificates, agreement).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 3: Role-Specific Documents & Details ── */}
          <div>
            {role === 'driver' ? (
              /* Driver Licence & Vehicle Section */
              <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <h4 className="text-[12px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                    <Car size={13} className="text-amber-600" />
                    <span>Driver Licence & Assigned Vehicle</span>
                  </h4>
                  <span className="text-[10.5px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/60">
                    Mandatory for Drivers
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-3.5 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-blue-200/60">
                      <span className="text-[11px] font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                        <Car size={12} className="text-blue-600" />
                        <span>UAE Driving License</span>
                      </span>
                      {cur('driving_license')?.file_data && (
                        <span className="text-[9.5px] font-black text-blue-700 bg-blue-100/90 px-1.5 py-0.5 rounded-md border border-blue-200">
                          ATTACHED
                        </span>
                      )}
                    </div>
                    <DocVersionsField
                      category="driving_license"
                      docs={docs}
                      accent="blue"
                      onUpload={f => handleAttachDoc('driving_license', f)}
                      onRemove={handleRemoveDoc}
                      onPreview={d => setPreviewDoc(d)}
                    />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Input
                        name="driving_license_issue_date"
                        label="Issue Date"
                        type="date"
                        defaultValue={initialEmployee?.driving_license_issue_date || ''}
                      />
                      <Input
                        name="driving_license_expiry_date"
                        label="Expiry Date"
                        type="date"
                        defaultValue={initialEmployee?.driving_license_expiry_date || ''}
                      />
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2.5 flex flex-col justify-between">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Place of Issue</label>
                        <select
                          name="driving_license_place_of_issue"
                          defaultValue={initialEmployee?.driving_license_place_of_issue || 'Dubai'}
                          className="w-full text-[11.5px] px-2 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                        >
                          <option value="Dubai">Dubai</option>
                          <option value="Abu Dhabi">Abu Dhabi</option>
                          <option value="Sharjah">Sharjah</option>
                          <option value="Ajman">Ajman</option>
                          <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                          <option value="Fujairah">Fujairah</option>
                          <option value="Umm Al Quwain">Umm Al Quwain</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11.5px] font-bold text-slate-700 block mb-1">Licence Type</label>
                        <select
                          name="driving_license_type"
                          defaultValue={initialEmployee?.driving_license_type || 'Light Vehicle (Automatic)'}
                          className="w-full text-[11.5px] px-2 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                        >
                          <option value="Light Vehicle (Manual)">Light Vehicle (Manual)</option>
                          <option value="Light Vehicle (Automatic)">Light Vehicle (Automatic)</option>
                          <option value="Van">Van</option>
                        </select>
                      </div>
                    </div>
                    <Input
                      name="assigned_vehicle"
                      label="Assign Vehicle"
                      defaultValue={initialEmployee?.assigned_vehicle || ''}
                      placeholder="e.g. Van 1, Toyota HiAce, Plate #12345"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Skills & Client Assessment (Cleaners & Technical) */
              <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <h4 className="text-[12px] font-black uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-indigo-600" />
                    <span>Skills & Client Assessment</span>
                  </h4>
                  {assignedClientIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAssignedClientIds([])}
                      className="text-[10.5px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                    >
                      Clear Client
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  {/* Column 1: Skills */}
                  <div>
                    <Input
                      name="skills"
                      label="Skills"
                      defaultValue={initialEmployee?.skills?.join(', ') || ''}
                      placeholder="e.g. Deep Clean, Sofa, Window..."
                    />
                  </div>

                  {/* Column 2: Comments / Remarks */}
                  <div>
                    <Input
                      name="notes"
                      label="Comments / Remarks"
                      defaultValue={initialEmployee?.notes || ''}
                      placeholder="e.g. Good with pets, punctual..."
                    />
                  </div>

                  {/* Column 3: Client Selection Dropdown */}
                  <div>
                    <label htmlFor="assigned_client_id" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                      Client
                    </label>
                    <select
                      id="assigned_client_id"
                      value={assignedClientIds[0] || ''}
                      onChange={e => setAssignedClientIds(e.target.value ? [e.target.value] : [])}
                      className="w-full text-[12.5px] px-3 py-2 min-h-[42px] border border-slate-200 rounded-xl bg-white text-slate-800 font-semibold focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-500 shadow-2xs cursor-pointer"
                    >
                      <option value="">-- Select Client (Optional) --</option>
                      {assignableClients.map(c => {
                        const loc = c.building_name ? `${c.building_name}, ${c.area}` : c.area
                        return (
                          <option key={c.id} value={c.id}>
                            {c.full_name}{loc ? ` (${loc})` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* ── Document Full Preview Modal ── */}
      <EmployeeDocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </>
  )
}
