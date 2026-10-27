import React, { useState, useEffect } from 'react'
import {
  UserCheck, Briefcase, DollarSign, Shield, Car, Sparkles, Search, Check
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Employee, Agency, Client, EmployeeDocument, EmployeeRole } from '@/types'
import { MONTHLY_WORK_HOURS, formatEmpRole } from '@/lib/clientDataSync'
import { EmployeeDocInput, EmployeeDocumentPreviewModal } from './EmployeeDocumentField'

export interface EmployeeFormModalProps {
  open: boolean
  onClose: () => void
  initialEmployee?: Employee | null
  agencies: Agency[]
  clients: Client[]
  onSave: (employeeData: Partial<Employee>) => void
  isSaving?: boolean
}

export function EmployeeFormModal({
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
  const [role, setRole] = useState<EmployeeRole>('cleaner')

  // Document upload state
  const [docs, setDocs] = useState<Record<string, EmployeeDocument>>({})

  // Assigned client IDs (for cleaners and technical)
  const [assignedClientIds, setAssignedClientIds] = useState<string[]>([])
  const [clientSearch, setClientSearch] = useState('')

  // Preview modal for documents
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null)

  // Reset or initialize state when modal opens or initialEmployee changes
  useEffect(() => {
    if (open) {
      if (initialEmployee) {
        setRole(initialEmployee.role)
        setAssignedClientIds(initialEmployee.assigned_client_ids || [])

        // Map initial documents into dictionary
        const docsMap: Record<string, EmployeeDocument> = {}
        const seedDoc = (cat: EmployeeDocument['category'], name: string, fileData?: string, expiry?: string, docNo?: string) => {
          if (fileData || docNo || expiry) {
            docsMap[cat] = {
              id: `doc-${cat}-${Date.now()}`,
              category: cat,
              name,
              file_data: fileData,
              document_number: docNo,
              end_date: expiry,
              uploaded_at: new Date().toISOString(),
            }
          }
        }

        seedDoc('eid', 'Emirates ID', initialEmployee.eid_file, initialEmployee.eid_end_date, initialEmployee.emirates_id)
        seedDoc('passport', 'Passport', initialEmployee.passport_file, initialEmployee.passport_expiry || initialEmployee.passport_end_date, initialEmployee.passport_number)
        seedDoc('visa', 'Residency Visa', initialEmployee.visa_file, initialEmployee.visa_expiry || initialEmployee.visa_end_date, initialEmployee.visa_number)
        seedDoc('work_permit', 'Work Permit', initialEmployee.work_permit_file, initialEmployee.work_permit_expiry || initialEmployee.work_permit_end_date, initialEmployee.work_permit_number)
        seedDoc('driving_license', 'Driving License', initialEmployee.driving_license_file, initialEmployee.driving_license_expiry_date, initialEmployee.driving_license_no)
        seedDoc('medical_insurance', 'Medical Insurance', initialEmployee.medical_insurance_file, initialEmployee.medical_insurance_expiry, initialEmployee.medical_insurance)
        seedDoc('noc', 'NOC / Labour Card', initialEmployee.noc_file, undefined, initialEmployee.noc)

        setDocs(docsMap)
      } else {
        setRole('cleaner')
        setDocs({})
        setAssignedClientIds([])
      }
      setClientSearch('')
    }
  }, [open, initialEmployee])

  // Helper to attach uploaded document
  const handleAttachDoc = (category: EmployeeDocument['category'], name: string, file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result as string
      setDocs(prev => ({
        ...prev,
        [category]: {
          id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          category,
          name: file.name || name,
          file_data: result,
          file_size: file.size,
          file_type: file.type,
          uploaded_at: new Date().toISOString(),
        },
      }))
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveDoc = (category: string) => {
    setDocs(prev => {
      const copy = { ...prev }
      delete copy[category]
      return copy
    })
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const monthly_salary = Number(fd.get('monthly_salary')) || 0
    const agencyId = (fd.get('agency_id') as string) || ''
    const selAgency = agencies.find(a => a.id === agencyId)
    const docsList: EmployeeDocument[] = Object.values(docs)

    const patch: Partial<Employee> = {
      full_name: fd.get('full_name') as string,
      phone: fd.get('phone') as string,
      role,
      designation: formatEmpRole(role),
      gender: (fd.get('gender') as string) || 'Female',
      nationality: fd.get('nationality') as string,
      agency_id: agencyId || undefined,
      agency_name: selAgency?.name || (agencyId ? initialEmployee?.agency_name : undefined),

      // EID
      emirates_id: (fd.get('emirates_id') as string) || '',
      eid_start_date: (fd.get('eid_start_date') as string) || undefined,
      eid_end_date: (fd.get('eid_end_date') as string) || undefined,
      eid_file: docs.eid?.file_data || initialEmployee?.eid_file,

      // Passport
      passport_number: (fd.get('passport_number') as string) || undefined,
      passport_start_date: (fd.get('passport_start_date') as string) || undefined,
      passport_expiry: (fd.get('passport_expiry') as string) || '',
      passport_end_date: (fd.get('passport_expiry') as string) || undefined,
      passport_file: docs.passport?.file_data || initialEmployee?.passport_file,

      // Visa
      visa_number: (fd.get('visa_number') as string) || undefined,
      visa_start_date: (fd.get('visa_start_date') as string) || undefined,
      visa_expiry: (fd.get('visa_expiry') as string) || '',
      visa_end_date: (fd.get('visa_expiry') as string) || undefined,
      visa_file: docs.visa?.file_data || initialEmployee?.visa_file,

      // Work Permit
      work_permit_number: (fd.get('work_permit_number') as string) || undefined,
      work_permit_start_date: (fd.get('work_permit_start_date') as string) || undefined,
      work_permit_expiry: (fd.get('work_permit_expiry') as string) || '',
      work_permit_end_date: (fd.get('work_permit_expiry') as string) || undefined,
      work_permit_file: docs.work_permit?.file_data || initialEmployee?.work_permit_file,

      // Driving License (for Drivers)
      driving_license_no: (fd.get('driving_license_no') as string) || undefined,
      driving_license_place_of_issue: (fd.get('driving_license_place_of_issue') as string) || undefined,
      driving_license_issue_date: (fd.get('driving_license_issue_date') as string) || undefined,
      driving_license_expiry_date: (fd.get('driving_license_expiry_date') as string) || undefined,
      driving_license_type: (fd.get('driving_license_type') as string) || undefined,
      driving_license_file: docs.driving_license?.file_data || initialEmployee?.driving_license_file,
      assigned_vehicle: (fd.get('assigned_vehicle') as string) || undefined,

      // Financial & Employment
      monthly_salary,
      pay_rate_hourly: Math.round((monthly_salary / MONTHLY_WORK_HOURS) * 10) / 10,
      medical_insurance: (fd.get('medical_insurance') as string) || undefined,
      medical_insurance_expiry: (fd.get('medical_insurance_expiry') as string) || undefined,
      medical_insurance_file: docs.medical_insurance?.file_data || initialEmployee?.medical_insurance_file,
      joined_date: (fd.get('joined_date') as string) || initialEmployee?.joined_date || new Date().toISOString().split('T')[0],
      end_date: (fd.get('end_date') as string) || undefined,
      noc: (fd.get('noc') as string) || undefined,
      noc_file: docs.noc?.file_data || initialEmployee?.noc_file,

      status: (fd.get('status') as Employee['status']) || initialEmployee?.status || 'active',

      // Skills & Clients
      skills: (fd.get('skills') as string)?.split(',').map(s => s.trim()).filter(Boolean) || [],
      assigned_client_ids: role === 'driver' ? [] : assignedClientIds,

      // Document history
      documents: docsList.length > 0 ? docsList : initialEmployee?.documents,
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
                defaultValue={initialEmployee?.status || 'active'}
                className="text-[11.5px] px-2 py-1 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600 font-bold text-slate-800 cursor-pointer shadow-2xs"
              >
                <option value="active">Active</option>
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
              <Input
                name="nationality"
                label="Nationality"
                defaultValue={initialEmployee?.nationality || ''}
                placeholder="e.g. Filipino, Pakistani, Indian, Nepali..."
              />
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
                <DollarSign size={13} className="text-teal-600" />
                <span>Employment & Salary</span>
              </h4>

              <Input
                name="monthly_salary"
                label="Monthly Salary (AED/mo) *"
                type="number"
                min="0"
                step="any"
                defaultValue={initialEmployee?.monthly_salary ? String(initialEmployee.monthly_salary) : (initialEmployee?.pay_rate_hourly ? String(Math.round(initialEmployee.pay_rate_hourly * MONTHLY_WORK_HOURS)) : '2500')}
                placeholder="2500"
                required
              />

              <div className="grid grid-cols-2 gap-2">
                <Input
                  name="joined_date"
                  label="Joined Date"
                  type="date"
                  defaultValue={initialEmployee?.joined_date || new Date().toISOString().split('T')[0]}
                />
                <Input
                  name="end_date"
                  label="Contract End Date"
                  type="date"
                  defaultValue={initialEmployee?.end_date || ''}
                />
              </div>
              <p className="text-[10.5px] text-slate-500 font-medium">
                Standard hourly rate calculated at {MONTHLY_WORK_HOURS} hours/month.
              </p>
            </div>
          </div>

          {/* ── Row 2: Standard Compliance Documents (EID, Passport, Visa, Work Permit) ── */}
          <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-3">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                <Shield size={13} className="text-teal-600" />
                <span>Standard Compliance Documents</span>
              </h4>
              <span className="text-[10.5px] font-semibold text-slate-500">
                Pure image upload with thumbnail preview & validity tracking
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Emirates ID */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2">
                <EmployeeDocInput
                  name="eid_file"
                  label="Emirates ID"
                  placeholder="Upload EID image"
                  doc={docs.eid}
                  onUpload={f => handleAttachDoc('eid', 'Emirates ID', f)}
                  onRemove={() => handleRemoveDoc('eid')}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <Input
                    name="eid_start_date"
                    label="Issue Date"
                    type="date"
                    defaultValue={initialEmployee?.eid_start_date || ''}
                    className="h-8 text-[11px]"
                  />
                  <Input
                    name="eid_end_date"
                    label="Expiry Date"
                    type="date"
                    defaultValue={initialEmployee?.eid_end_date || ''}
                    className="h-8 text-[11px]"
                  />
                </div>
              </div>

              {/* Passport */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2">
                <EmployeeDocInput
                  name="passport_file"
                  label="Passport"
                  placeholder="Upload Passport image"
                  doc={docs.passport}
                  onUpload={f => handleAttachDoc('passport', 'Passport', f)}
                  onRemove={() => handleRemoveDoc('passport')}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <Input
                    name="passport_start_date"
                    label="Issue Date"
                    type="date"
                    defaultValue={initialEmployee?.passport_start_date || ''}
                    className="h-8 text-[11px]"
                  />
                  <Input
                    name="passport_expiry"
                    label="Expiry Date"
                    type="date"
                    defaultValue={initialEmployee?.passport_expiry || initialEmployee?.passport_end_date || ''}
                    className="h-8 text-[11px]"
                  />
                </div>
              </div>

              {/* Residency Visa */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2">
                <EmployeeDocInput
                  name="visa_file"
                  label="Residency Visa"
                  placeholder="Upload Visa image"
                  doc={docs.visa}
                  onUpload={f => handleAttachDoc('visa', 'Residency Visa', f)}
                  onRemove={() => handleRemoveDoc('visa')}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <Input
                    name="visa_start_date"
                    label="Issue Date"
                    type="date"
                    defaultValue={initialEmployee?.visa_start_date || ''}
                    className="h-8 text-[11px]"
                  />
                  <Input
                    name="visa_expiry"
                    label="Expiry Date"
                    type="date"
                    defaultValue={initialEmployee?.visa_expiry || initialEmployee?.visa_end_date || ''}
                    className="h-8 text-[11px]"
                  />
                </div>
              </div>

              {/* Work Permit */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2">
                <EmployeeDocInput
                  name="work_permit_file"
                  label="Work Permit"
                  placeholder="Upload Work Permit image"
                  doc={docs.work_permit}
                  onUpload={f => handleAttachDoc('work_permit', 'Work Permit', f)}
                  onRemove={() => handleRemoveDoc('work_permit')}
                  onPreview={d => setPreviewDoc(d)}
                />
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <Input
                    name="work_permit_start_date"
                    label="Issue Date"
                    type="date"
                    defaultValue={initialEmployee?.work_permit_start_date || ''}
                    className="h-8 text-[11px]"
                  />
                  <Input
                    name="work_permit_expiry"
                    label="Expiry Date"
                    type="date"
                    defaultValue={initialEmployee?.work_permit_expiry || initialEmployee?.work_permit_end_date || ''}
                    className="h-8 text-[11px]"
                  />
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
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2">
                    <EmployeeDocInput
                      name="driving_license_file"
                      label="UAE Driving License"
                      placeholder="Upload Driving License image"
                      doc={docs.driving_license}
                      onUpload={f => handleAttachDoc('driving_license', 'Driving License', f)}
                      onRemove={() => handleRemoveDoc('driving_license')}
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
                          <option value="Light Vehicle (Automatic)">Light Vehicle (Automatic)</option>
                          <option value="Light Vehicle (Manual)">Light Vehicle (Manual)</option>
                          <option value="Heavy Bus">Heavy Bus</option>
                          <option value="Heavy Truck">Heavy Truck</option>
                          <option value="Motorcycle">Motorcycle</option>
                          <option value="Forklift">Forklift</option>
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
              /* Skills & Client Assignment (Cleaners & Technical) */
              <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <h4 className="text-[12px] font-black uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-indigo-600" />
                    <span>Skills & Client Assignment</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    {assignedClientIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAssignedClientIds([])}
                        className="text-[10.5px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                    <span className="text-[10.5px] font-bold bg-teal-50 text-teal-800 border border-teal-200/60 px-2 py-0.5 rounded-lg">
                      {assignedClientIds.length} Clients Assigned
                    </span>
                  </div>
                </div>

                <Input
                  name="skills"
                  label="Skills (comma separated)"
                  defaultValue={initialEmployee?.skills?.join(', ') || ''}
                  placeholder="Deep Clean, Sofa, Window, Technical, Carpet..."
                />

                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search clients by name or location..."
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 shadow-2xs"
                  />
                </div>

                <div className="max-h-[180px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 pr-1 content-start">
                  {assignableClients.length === 0 && (
                    <p className="col-span-full text-center text-[11.5px] text-slate-400 py-4">No clients found. Add clients first on the Clients screen.</p>
                  )}
                  {assignableClients
                    .filter(c => {
                      if (!clientSearch) return true
                      const q = clientSearch.toLowerCase()
                      const loc = (c.building_name || c.area || '').toLowerCase()
                      return c.full_name.toLowerCase().includes(q) || loc.includes(q)
                    })
                    .map(c => {
                      const checked = assignedClientIds.includes(c.id)
                      const location = c.building_name ? `${c.building_name}, ${c.area}` : c.area
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center justify-between p-2 rounded-xl text-[11.5px] border cursor-pointer transition-colors shadow-2xs ${
                            checked
                              ? 'bg-teal-50 border-teal-300 text-teal-950 font-bold'
                              : 'bg-white border-slate-200 hover:bg-slate-100/70 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setAssignedClientIds(prev =>
                                  checked ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                )
                              }}
                              className="rounded text-teal-600 focus:ring-teal-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span className="truncate">{c.full_name}</span>
                            {location && <span className="text-[10.5px] text-slate-400 font-normal truncate">({location})</span>}
                          </div>
                          {checked && <span className="text-[10px] font-black text-teal-700 shrink-0">ASSIGNED</span>}
                        </label>
                      )
                    })}
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
