import React, { useState, useEffect, useMemo, useRef } from 'react'
import { requireFields } from '@/components/common/FormGuard'
import { clientNameOrAddress, hasClientAddress, singleAddressOf, cleanAddresses } from '@/lib/clientAddress'
import { AddressesEditor } from '@/components/clients/AddressesEditor'
import { WeeklyScheduleCard, initialWeekSchedule, activeDaysOf, monthlyFieldsOf, type WeekSchedule } from '@/components/monthlyClients/WeeklyScheduleCard'
import { findMonthlyScheduleClashes } from '@/lib/clientDataSync'
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
import { useData } from '@/store/DataContext'
import { confirmAsync, notify } from '@/lib/notify'
import { findDuplicateClient, isUaeMobile } from '@/lib/validation'
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'
import { BiWeeklyScheduleCard, emptyBiWeeklyPlan } from '@/components/clients/BiWeeklyScheduleCard'
import { ContractStatusToggle } from '@/components/clients/ContractStatusToggle'
import { ContractDetailsCard } from '@/components/clients/ContractDetailsCard'
import { contractDateError, contractOfClient, detailsOfContract, saveClientContract } from '@/lib/clientContracts'
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
  // R-SCHED-18: no Profile / 7-Day Schedule tabs. The form follows the Mode: Monthly → the monthly form
  // (contract, profile, balances and the 7-day schedule in one), General / Bi-Weekly → this form. The two tabs
  // each had their own Contract section and a change made in one did not show in the other (2026-11-16).

  // R-CLI-02: Mode — General (stay here), Bi-Weekly (days + duration here), Monthly (the monthly client form)
  const startMode = (): ClientServiceMode => (isMonthly ? 'monthly' : seed?.service_mode === 'biweekly' ? 'biweekly' : seed?.service_mode === 'monthly' ? 'monthly' : 'general')
  const [mode, setMode] = useState<ClientServiceMode>(startMode)
  const [plan, setPlan] = useState<BiWeeklyPlan>(() => seed?.biweekly_plan ?? emptyBiWeeklyPlan())
  // R-CLI-05: the client's contract (Monthly Clients → Contracts) is edited here too
  const [savedContract] = useState(() => (initialClient ? contractOfClient(initialClient.full_name) : undefined))
  const [contract, setContract] = useState(() => detailsOfContract(savedContract))
  // R-SCHED-08: Off when the client or its contract is switched off
  const [contractOn, setContractOn] = useState(() => seed?.contract_active !== false && (!savedContract || savedContract.status === 'active'))
  // R-SCHED-20: one popup for every Mode — Monthly shows its weekly schedule card here (no separate form)
  const weekSeed = (): Partial<Client> | null => (seed?.service_days?.length ? seed : null)
  const [week, setWeek] = useState<WeekSchedule>(() => initialWeekSchedule(weekSeed()))
  const formRef = useRef<HTMLFormElement>(null)
  // R-SCHED-18: was a monthly client (has a weekly schedule) — moving it to General / Bi-Weekly clears that schedule
  const hadMonthlySchedule = isEdit && Array.isArray(initialClient?.service_days) && (initialClient?.service_days?.length || 0) > 0

  // Reset tab when modal opens
  useEffect(() => {
    if (open) {
      setMode(startMode())
      setPlan(seed?.biweekly_plan ?? emptyBiWeeklyPlan())
      setContractOn(seed?.contract_active !== false)
      setWeek(initialWeekSchedule(weekSeed()))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  /** R-SCHED-20: the Mode only changes the cards shown — everything typed stays in this one form */
  const chooseMode = (next: ClientServiceMode) => setMode(next)
  const modeSelect = (compact = false) => (
    <div className={compact ? 'w-40' : ''}>
      {!compact && <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Mode</label>}
      <select
        value={mode}
        onChange={e => chooseMode(e.target.value as ClientServiceMode)}
        title="General: one-off jobs · Bi-Weekly: chosen days every other week · Monthly: weekly schedule. Can be changed any time (R-SCHED-18)"
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

  const { clients, trimVisitsToContract } = useData()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation() // opened from inside the Add Job form: its submit must not also save the job
    const f = new FormData(e.currentTarget)
    // R-CLI-03: the name is optional, the address is required and names the client when the name is empty
    const addressParts = { apartment: String(f.get('apartment') || ''), building_name: String(f.get('building_name') || ''), area: String(f.get('area') || '') }
    if (!requireFields(e.currentTarget, [
      { name: 'building_name', label: 'Address', ok: hasClientAddress(addressParts) },
      { name: 'contract_end', label: 'Contract End (on or after Contract Start)', ok: mode === 'general' || !contractDateError(contract) }, // R-SCHED-11
      { name: 'schedule_days', label: 'Service days (tick at least one)', ok: mode !== 'monthly' || activeDaysOf(week).length > 0 || isEdit }, // R-SCHED-16
    ])) return
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
      addresses:         cleanAddresses(JSON.parse(String(f.get('addresses_json') || '[]'))), // R-CLI-09
    }

    // R-CLI-02: the mode, and the Bi-Weekly days and duration
    if (mode === 'biweekly') {
      // UX-84
      if (!requireFields(e.currentTarget, [{ name: 'biweekly_days', label: 'Bi-Weekly days (tick at least one)', ok: plan.days.length > 0 }])) return
      patch.service_mode = 'biweekly'
      patch.biweekly_plan = plan
      if (!contractOn || seed?.contract_active === false) patch.contract_active = contractOn // R-SCHED-08 (sent only when Off or turned back On)
      if (!cleaner) patch.preferred_cleaner = Array.from(new Set(plan.days.map(d => plan.day_schedules[d]?.cleaner).filter(Boolean))).join(', ')
    } else if (mode === 'monthly') {
      // R-SCHED-20 / R-SCHED-06: a cleaner cannot be scheduled for two monthly clients at the same time
      const active = activeDaysOf(week)
      const clashes = findMonthlyScheduleClashes(initialClient ? { id: initialClient.id, full_name: clientName } : { id: '', full_name: clientName },
        Object.fromEntries(active.map(d => [d, week[d]])), clients)
      if (clashes.length > 0) {
        notify.error(`⛔ Time clash, not saved: ${clashes.slice(0, 3).map(c => `${c.cleaner} already works for ${c.other} on ${c.day} ${c.time}`).join('; ')}. Change the time or the cleaner.`)
        return
      }
      const fields = monthlyFieldsOf(week, initialClient)
      Object.assign(patch, fields)
      patch.service_mode = 'monthly'
      patch.preferred_cleaner = fields.preferred_cleaner || cleaner // the schedule's cleaner, else the one picked above
      if (!contractOn || seed?.contract_active === false) patch.contract_active = contractOn // R-SCHED-08
      if (seed?.biweekly_plan) patch.biweekly_plan = null as unknown as undefined // no longer bi-weekly
      if (active.length === 0) notify.warning('Saved without service days — no visits are added to the Job Sheet until a day is ticked.') // R-SCHED-16
    } else {
      patch.service_mode = 'general'
      if (seed?.biweekly_plan) patch.biweekly_plan = null as unknown as undefined // no longer bi-weekly
    }

    // R-SCHED-18: a monthly client moved to General / Bi-Weekly — its weekly schedule goes, so no monthly visits are made any more
    if (hadMonthlySchedule && mode !== 'monthly') {
      patch.service_days = []
      patch.day_schedules = {}
      patch.day_cleaner_assignments = {}
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
    // R-CLI-05: Bi-Weekly / monthly clients keep their contract with them (a General client has none)
    if (patch.service_mode !== 'general') {
      saveClientContract({ clientName: patch.full_name || '', previousName: initialClient?.full_name, details: contract, active: contractOn, phone: patch.phone, email: patch.email })
      trimVisitsToContract({ ...(initialClient || {}), ...patch }) // R-SCHED-13
    }
    onClose()
  }

  const modalTitle = (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200/80 shadow-2xs">
        {isEdit ? <UserCheck size={16} /> : <UserPlus size={16} />}
      </div>
      <div>
        <h3 className="text-[16px] font-black text-slate-900 tracking-tight">
          {isEdit ? (mode === 'monthly' ? 'Edit Monthly Client' : mode === 'biweekly' ? 'Edit Bi-Weekly Client' : 'Edit Client Profile') : 'Add New Client'}
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
          {/* R-SCHED-18: no Profile / 7-Day Schedule tabs any more — one form */}
          {/* R-SCHED-17: Save on both tabs — the 7-Day Schedule tab had no Save button, so a picked day / cleaner
              could never be saved (2026-11-16); there it submits the schedule form */}
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
                form="client-modal-form"
                size="sm"
                disabled={isSaving}
                className="h-9 px-4.5 text-[12.5px] font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 rounded-xl transition-all"
              >
                <Save size={13} />
                <span>{isSaving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Save Client')}</span>
              </Button>
          </>
        </div>
      }
    >
      {(
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
                  label="Mobile Number *"
                  placeholder="+971 50 000 0000"
                  defaultValue={seed?.phone || ''}
                  required // R-CLI-09: mobile number is required
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

            {/* UX-164: row 1 Preferred Cleaner · Email · City; row 2 Address · Area; then the other addresses */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
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
              {/* R-CLI-09: one Address field (was Apartment / Villa Number + Building / Villa Name) */}
              <div className="md:col-span-8">
                <input type="hidden" name="apartment" value="" />
                <Input
                  name="building_name"
                  label="Address *"
                  placeholder="e.g. Al Khair Building Apt 302 / Villa 25"
                  defaultValue={singleAddressOf(seed)}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
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
              {/* R-CLI-09: more addresses of the same client — chosen when booking */}
              <div className="md:col-span-12">
                <AddressesEditor initial={seed?.addresses} />
              </div>
            </div>
          </div>

          {/* R-CLI-02: Bi-Weekly — days like the monthly schedule, and the contract duration */}
          {mode !== 'general' && <ContractStatusToggle on={contractOn} onChange={setContractOn} />}
          {mode !== 'general' && <ContractDetailsCard value={contract} onChange={setContract} existing={Boolean(savedContract)} />}
          {mode === 'biweekly' && <div data-field="biweekly_days"><BiWeeklyScheduleCard plan={plan} onChange={setPlan} cleaners={activeCleanersList} /></div>}
          {/* R-SCHED-20: Monthly — the weekly schedule card in the same popup */}
          {mode === 'monthly' && <WeeklyScheduleCard value={week} onChange={setWeek} employees={employees} />}

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

