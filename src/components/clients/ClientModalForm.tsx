import React, { useState, useEffect, useMemo, useRef } from 'react'
import { requireFields } from '@/components/common/FormGuard'
import { clientNameOrAddress, hasClientAddress } from '@/lib/clientAddress'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  Save,
  Calendar,
  UserCheck,
  User,
  Phone,
  Mail,
  MapPin,
  Building2,
  FileText,
  DollarSign,
  UserPlus,
  Coins
} from 'lucide-react'
import type { Client, Employee } from '@/types'
import { AddMonthlyClientModalForm } from '@/components/monthlyClients/AddMonthlyClientModalForm'
import { useData } from '@/store/DataContext'
import { confirmAsync, notify } from '@/lib/notify'
import { findDuplicateClient, isUaeMobile } from '@/lib/validation'
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'
import { BiWeeklyScheduleCard, emptyBiWeeklyPlan } from '@/components/clients/BiWeeklyScheduleCard'
import { ContractStatusToggle } from '@/components/clients/ContractStatusToggle'
import type { BiWeeklyPlan, ClientServiceMode } from '@/lib/biweekly'

export interface ClientModalFormProps {
  open: boolean
  onClose: () => void
  initialClient?: Client | null
  /** Values filled in for a NEW client (e.g. the address typed on a job) — the popup stays "Add New Client" */
  prefill?: Partial<Client>
  employees: Employee[]
  onSave: (clientData: Partial<Client>) => void
  isMonthly?: boolean
  isSaving?: boolean
}

export function ClientModalForm({
  open,
  onClose,
  initialClient,
  prefill,
  employees,
  onSave,
  isMonthly = false,
  isSaving = false,
}: ClientModalFormProps) {
  const isEdit = !!initialClient
  const seed: Partial<Client> | null | undefined = initialClient ?? prefill

  // Tab state for monthly client (Profile & Financials vs 7-Day Recurring Schedule)
  const [activeTab, setActiveTab] = useState<'profile' | 'schedule'>('profile')

  // R-CLI-02: Mode — General (stay here), Bi-Weekly (days + duration here), Monthly (the monthly client form)
  const startMode = (): ClientServiceMode => (isMonthly ? 'monthly' : seed?.service_mode === 'biweekly' ? 'biweekly' : seed?.service_mode === 'monthly' ? 'monthly' : 'general')
  const [mode, setMode] = useState<ClientServiceMode>(startMode)
  const [plan, setPlan] = useState<BiWeeklyPlan>(() => seed?.biweekly_plan ?? emptyBiWeeklyPlan())
  const [contractOn, setContractOn] = useState(() => seed?.contract_active !== false) // R-SCHED-08
  const [monthlyPrefill, setMonthlyPrefill] = useState<Partial<Client> | undefined>(undefined)
  const formRef = useRef<HTMLFormElement>(null)
  const monthlyEdit = isMonthly && isEdit // an existing monthly client keeps its Profile / 7-Day Schedule tabs
  const showMonthlyFlow = mode === 'monthly' && !monthlyEdit

  // Reset tab when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('profile')
      setMode(startMode())
      setPlan(seed?.biweekly_plan ?? emptyBiWeeklyPlan())
      setContractOn(seed?.contract_active !== false)
      setMonthlyPrefill(undefined)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Switching mode keeps what was typed: Monthly opens the monthly client form with it filled in */
  const chooseMode = (next: ClientServiceMode) => {
    if (next === 'monthly' && formRef.current) {
      const f = new FormData(formRef.current)
      const v = (k: string) => String(f.get(k) || '').trim()
      setMonthlyPrefill({
        full_name: v('full_name'), phone: v('phone'), whatsapp: v('whatsapp'), email: v('email'),
        apartment: v('apartment'), building_name: v('building_name'), area: v('area'), city: v('city') || 'Dubai',
        remarks: v('remarks'),
        advance_amount: Number(v('advance_amount')) || undefined,
        adjustment_amount: Number(v('adjustment_amount')) || undefined,
        pending_amount: Number(v('pending_amount')) || undefined,
      })
    }
    setMode(next)
  }
  const modeSelect = (compact = false) => (
    <div className={compact ? 'w-40' : ''}>
      {!compact && <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Mode</label>}
      <select
        value={mode}
        disabled={monthlyEdit}
        onChange={e => chooseMode(e.target.value as ClientServiceMode)}
        title={monthlyEdit ? 'Monthly client — change the schedule in the 7-Day Schedule tab' : 'General: one-off jobs · Bi-Weekly: chosen days every other week · Monthly: monthly client form'}
        className={`w-full ${compact ? 'h-9' : 'h-9.5'} px-3 text-[13px] font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-teal-500 cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 ${mode === 'biweekly' ? 'text-violet-800' : mode === 'monthly' ? 'text-emerald-800' : 'text-slate-800'}`}
      >
        <option value="general">General</option>
        <option value="biweekly">Bi-Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
  )

  // ── Multi-Cleaner Assignment State ──
  const [selectedCleaners, setSelectedCleaners] = useState<string[]>(() => {
    if (!initialClient?.preferred_cleaner) return []
    return initialClient.preferred_cleaner.split(/[,+/&]/).map(s => s.trim()).filter(Boolean)
  })

  // Sync cleaner selection on initialClient change or open
  useEffect(() => {
    if (open) {
      if (initialClient?.preferred_cleaner) {
        setSelectedCleaners(initialClient.preferred_cleaner.split(/[,+/&]/).map(s => s.trim()).filter(Boolean))
      } else {
        setSelectedCleaners([])
      }
    }
  }, [open, initialClient])

  // Filtered distinct active cleaners list (includes all non-inactive employees and any cleaner already assigned)
  const activeCleanersList = useMemo(() => {
    const active = employees.filter(e => e.status !== 'inactive' && e.role !== 'csr') // R-EMP-12
    const unique = Array.from(new Set(active.map(e => e.full_name.trim()))).filter(Boolean)
    selectedCleaners.forEach(sc => {
      if (sc && !unique.includes(sc)) unique.push(sc)
    })
    return unique.sort((a, b) => a.localeCompare(b))
  }, [employees, selectedCleaners])

  const { clients } = useData()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation() // opened from inside the Add Job form: its submit must not also save the job
    const f = new FormData(e.currentTarget)
    // R-CLI-03: the name is optional, the address is required and names the client when the name is empty
    const addressParts = { apartment: String(f.get('apartment') || ''), building_name: String(f.get('building_name') || ''), area: String(f.get('area') || '') }
    if (!requireFields(e.currentTarget, [{ name: 'building_name', label: 'Address (apartment / villa number or building name)', ok: hasClientAddress(addressParts) }])) return
    const clientName = clientNameOrAddress(f.get('full_name'), addressParts)
    const remarks = String(f.get('remarks') || '')
    const advance = parseFloat(String(f.get('advance_amount') || '0')) || 0
    const adjustment = parseFloat(String(f.get('adjustment_amount') || '0')) || 0
    const pending = parseFloat(String(f.get('pending_amount') || '0')) || 0
    const cleaner = selectedCleaners.join(', ')

    const patch: Partial<Client> = {
      full_name:         clientName,
      phone:             String(f.get('phone') || '').trim(),
      whatsapp:          String(f.get('whatsapp') || '').trim(),
      email:             String(f.get('email') || '').trim(),
      building_name:     String(f.get('building_name') || '').trim(),
      apartment:         String(f.get('apartment') || '').trim(),
      city:              String(f.get('city') || 'Dubai').trim(),
      area:              String(f.get('area') || 'Dubai').trim(),
      preferred_cleaner: cleaner,
      remarks:           remarks,
      notes:             remarks,
      access_notes:      remarks,
      advance_amount:    advance,
      adjustment_amount: adjustment,
      pending_amount:    pending,
    }

    // R-CLI-02: the mode, and the Bi-Weekly days and duration
    if (mode === 'biweekly') {
      // UX-84
      if (!requireFields(e.currentTarget, [{ name: 'biweekly_days', label: 'Bi-Weekly days (tick at least one)', ok: plan.days.length > 0 }])) return
      patch.service_mode = 'biweekly'
      patch.biweekly_plan = plan
      if (!contractOn || seed?.contract_active === false) patch.contract_active = contractOn // R-SCHED-08 (sent only when Off or turned back On)
      if (!cleaner) patch.preferred_cleaner = Array.from(new Set(plan.days.map(d => plan.day_schedules[d]?.cleaner).filter(Boolean))).join(', ')
    } else {
      patch.service_mode = monthlyEdit ? 'monthly' : 'general'
      if (monthlyEdit && (!contractOn || seed?.contract_active === false)) patch.contract_active = contractOn // R-SCHED-08
      if (seed?.biweekly_plan) patch.biweekly_plan = null as unknown as undefined // no longer bi-weekly
    }

    // VAL-03: UAE mobile format (other countries are allowed after a confirm)
    if (patch.phone && !isUaeMobile(patch.phone)) {
      const ok = await confirmAsync({
        title: 'Phone number',
        message: `"${patch.phone}" does not look like a UAE mobile (050 123 4567). Save it anyway?`,
        confirmLabel: 'Save anyway',
      })
      if (!ok) return
    }
    // VAL-02: same phone, or same name + building → probably the same client
    const dup = findDuplicateClient(clients, { full_name: patch.full_name || '', phone: patch.phone || '', building_name: patch.building_name }, initialClient?.id)
    if (dup) {
      const ok = await confirmAsync({
        title: 'Possible duplicate client',
        message: `"${dup.client.full_name}" already exists with the ${dup.reason}${dup.client.building_name ? ` (${dup.client.building_name})` : ''}. Save a separate client anyway?`,
        confirmLabel: 'Save anyway',
        tone: 'danger',
      })
      if (!ok) return
    }

    onSave(patch)
    onClose()
  }

  const modalTitle = (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200/80 shadow-2xs">
        {isEdit ? <UserCheck size={16} /> : <UserPlus size={16} />}
      </div>
      <div>
        <h3 className="text-[16px] font-black text-slate-900 tracking-tight">
          {isEdit ? (isMonthly ? 'Edit Monthly Client' : 'Edit Client Profile') : 'Add New Client'}
        </h3>
        <p className="text-[11px] font-semibold text-slate-500">
          {isEdit ? 'Update client details, address, crew assignment & opening balances' : 'Register a new client with contact details, address & opening financials'}
        </p>
      </div>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      size="xl"
      className="max-h-[96vh] max-w-5xl" // UX-76: wider, so the cleaner list fits
      bodyClassName="px-6 py-5 pb-6 bg-slate-50/50"
      headerActions={
        <div className="flex items-center gap-2 mr-1">
          {/* Monthly tab switcher if client is monthly and editing */}
          {isMonthly && isEdit && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg mr-2 border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`px-3 py-1 text-[11.5px] font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck size={13} />
                <span>Profile & Financials</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className={`px-3 py-1 text-[11.5px] font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'schedule'
                    ? 'bg-white text-purple-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar size={13} />
                <span>7-Day Schedule</span>
              </button>
            </div>
          )}

          {showMonthlyFlow && modeSelect(true)}
          {activeTab === 'profile' && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="h-9 px-4 text-[12px] font-semibold text-slate-600 hover:text-slate-900 border-slate-200 cursor-pointer rounded-xl bg-white shadow-2xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form={showMonthlyFlow ? 'add-monthly-client-form' : 'client-modal-form'}
                size="sm"
                disabled={isSaving}
                className="h-9 px-4.5 text-[12.5px] font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 rounded-xl transition-all"
              >
                <Save size={13} />
                <span>{isSaving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Save Client')}</span>
              </Button>
            </>
          )}
        </div>
      }
    >
      {/* ── Monthly Client Recurring Schedule Tab ── */}
      {showMonthlyFlow ? (
        /* R-CLI-02: Mode → Monthly opens the monthly client form, with what was already typed */
        <AddMonthlyClientModalForm
          initialClient={isEdit ? initialClient : undefined}
          prefill={isEdit ? undefined : monthlyPrefill}
          isEdit={isEdit}
          employees={employees}
          onClose={onClose}
          onAdd={monthlyData => {
            onSave({ ...monthlyData, service_mode: 'monthly', ...(seed?.biweekly_plan ? { biweekly_plan: null as unknown as undefined } : {}) })
            onClose()
          }}
        />
      ) : isMonthly && isEdit && activeTab === 'schedule' ? (
        <AddMonthlyClientModalForm
          initialClient={initialClient}
          isEdit={true}
          employees={employees}
          onClose={onClose}
          onAdd={updatedMonthlyData => {
            onSave(updatedMonthlyData)
            onClose()
          }}
        />
      ) : (
        /* ── Unified Profile & Financial Form (Organized into 3 Clean Cards) ── */
        <form
          id="client-modal-form"
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {/* ── Card 1: Identity & Contact Details ── */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.02)] p-4.5">
            <div className="flex items-center gap-2 mb-3.5 pb-2.5 border-b border-slate-100">
              <div className="w-6.5 h-6.5 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200/60">
                <User size={13} />
              </div>
              <p className="text-[12.5px] font-black text-slate-800">Primary Contact & Identity</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
              <div className="md:col-span-3">
                <Input
                  name="full_name"
                  label="Full Name (optional)"
                  placeholder="e.g. Sarah Al-Rashidi"
                  defaultValue={seed?.full_name || ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
              <div className="md:col-span-3">
                <Input
                  name="phone"
                  label="Phone Number"
                  placeholder="+971 50 000 0000"
                  defaultValue={seed?.phone || ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
              <div className="md:col-span-3">
                <Input
                  name="whatsapp"
                  label="WhatsApp Number"
                  placeholder="+971 50 000 0000"
                  defaultValue={seed?.whatsapp ?? initialClient?.phone ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
              <div className="md:col-span-3">{modeSelect()}</div>
            </div>
          </div>

          {/* ── Card 2: Address & Location Details ── */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.02)] p-4.5">
            <div className="flex items-center gap-2 mb-3.5 pb-2.5 border-b border-slate-100">
              <div className="w-6.5 h-6.5 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200/60">
                <MapPin size={13} />
              </div>
              <p className="text-[12.5px] font-black text-slate-800">Address & Crew Assignment</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
              <div className="md:col-span-4">
                <Input
                  name="email"
                  label="Email Address"
                  type="email"
                  placeholder="client@example.com"
                  defaultValue={seed?.email ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
              {/* R-CLI-01: number first, then the building / villa name, then the area */}
              <div className="md:col-span-4">
                <Input
                  name="apartment"
                  label="Apartment / Villa Number"
                  placeholder="e.g. 302 / Villa 25"
                  defaultValue={seed?.apartment ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
              <div className="md:col-span-4">
                <Input
                  name="building_name"
                  label="Building / Villa Name *"
                  placeholder="e.g. Al Khair Building"
                  defaultValue={seed?.building_name ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>

              <div className="md:col-span-4">
                <Select
                  name="city"
                  label="Emirate (City)"
                  defaultValue={seed?.city || 'Dubai'}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                >
                  <option value="Dubai">Dubai</option>
                  <option value="Abu Dhabi">Abu Dhabi</option>
                  <option value="Sharjah">Sharjah</option>
                  <option value="Ajman">Ajman</option>
                  <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                  <option value="Fujairah">Fujairah</option>
                  <option value="Umm Al Quwain">Umm Al Quwain</option>
                </Select>
              </div>

              <div className="md:col-span-4">
                <Input
                  name="area"
                  label="Area / Community"
                  placeholder="e.g. Dubai Marina, JBR, Downtown"
                  defaultValue={seed?.area ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>

              <div className="md:col-span-4 min-w-0">
                <CleanerMultiSelect
                  alignRight
                  label="Preferred Cleaner(s)"
                  name="preferred_cleaner"
                  cleaners={activeCleanersList}
                  selected={selectedCleaners}
                  onChange={setSelectedCleaners}
                  placeholder="Assign cleaner(s)..."
                />
              </div>
            </div>
          </div>

          {/* R-CLI-02: Bi-Weekly — days like the monthly schedule, and the contract duration */}
          {(mode === 'biweekly' || monthlyEdit) && <ContractStatusToggle on={contractOn} onChange={setContractOn} />}
          {mode === 'biweekly' && <div data-field="biweekly_days"><BiWeeklyScheduleCard plan={plan} onChange={setPlan} cleaners={activeCleanersList} /></div>}

          {/* ── Card 3: Financial Balances & Service Remarks ── */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.02)] p-4.5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left: Remarks / Notes */}
              <div className="md:col-span-5 flex flex-col justify-between">
                <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-100">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <FileText size={12} />
                  </div>
                  <p className="text-[12px] font-black text-slate-800">Special Notes & Access</p>
                </div>
                <Textarea
                  name="remarks"
                  placeholder="Key with concierge, gate barrier code, parking slot, pet warnings, or specific client instructions..."
                  defaultValue={seed?.remarks ?? initialClient?.notes ?? initialClient?.access_notes ?? ''}
                  rows={3}
                  className="text-[12.5px] h-[92px] resize-none rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>

              {/* Right: Initial Financial Amounts Container */}
              <div className="md:col-span-7 bg-slate-50/90 rounded-xl p-3.5 border border-slate-200/80 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Coins size={13} className="text-emerald-700" />
                    <div>
                      <p className="text-[12px] font-black text-[#111827]">Initial Financial Balances</p>
                      <p className="text-[10px] text-slate-500">Opening advance deposit, adjustments, or pending dues</p>
                    </div>
                  </div>
                  <span className="text-[9.5px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                    Optional
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-200/70">
                    <label className="block text-[10.5px] font-bold text-emerald-800 mb-1">
                      Advance (AED)
                    </label>
                    <Input
                      name="advance_amount"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      defaultValue={seed?.advance_amount ? String(seed.advance_amount) : ''}
                      className="h-8 font-black text-emerald-700 bg-white text-[12.5px] rounded-lg border-emerald-300"
                    />
                  </div>

                  <div className="bg-indigo-50/60 p-2 rounded-xl border border-indigo-200/70">
                    <label className="block text-[10.5px] font-bold text-indigo-800 mb-1 flex items-center justify-between">
                      <span>Adjustment</span>
                      <span className="bg-indigo-700 text-white text-[8px] font-black px-1 py-0.2 rounded uppercase">
                        ADJ
                      </span>
                    </label>
                    <Input
                      name="adjustment_amount"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      defaultValue={seed?.adjustment_amount ? String(seed.adjustment_amount) : ''}
                      className="h-8 font-black text-indigo-700 bg-white text-[12.5px] rounded-lg border-indigo-300"
                    />
                  </div>

                  <div className="bg-rose-50/60 p-2 rounded-xl border border-rose-200/70">
                    <label className="block text-[10.5px] font-bold text-rose-800 mb-1">
                      Pending (AED)
                    </label>
                    <Input
                      name="pending_amount"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      defaultValue={seed?.pending_amount ? String(seed.pending_amount) : ''}
                      className="h-8 font-black text-rose-700 bg-white text-[12.5px] rounded-lg border-rose-300"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}

