import React, { useState, useEffect, useMemo } from 'react'
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
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'

export interface ClientModalFormProps {
  open: boolean
  onClose: () => void
  initialClient?: Client | null
  employees: Employee[]
  onSave: (clientData: Partial<Client>) => void
  isMonthly?: boolean
  isSaving?: boolean
}

export function ClientModalForm({
  open,
  onClose,
  initialClient,
  employees,
  onSave,
  isMonthly = false,
  isSaving = false,
}: ClientModalFormProps) {
  const isEdit = !!initialClient

  // Tab state for monthly client (Profile & Financials vs 7-Day Recurring Schedule)
  const [activeTab, setActiveTab] = useState<'profile' | 'schedule'>('profile')

  // Reset tab when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('profile')
    }
  }, [open])

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
    const active = employees.filter(e => e.status !== 'inactive')
    const unique = Array.from(new Set(active.map(e => e.full_name.trim()))).filter(Boolean)
    selectedCleaners.forEach(sc => {
      if (sc && !unique.includes(sc)) unique.push(sc)
    })
    return unique.sort((a, b) => a.localeCompare(b))
  }, [employees, selectedCleaners])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const clientName = String(f.get('full_name') || '').trim() || (isEdit ? initialClient?.full_name || 'Client' : 'New Client')
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
      className="max-h-[96vh] max-w-4xl"
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
                form="client-modal-form"
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
      {isMonthly && isEdit && activeTab === 'schedule' ? (
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
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {/* ── Card 1: Identity & Contact Details ── */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.02)] p-4.5">
            <div className="flex items-center gap-2 mb-3.5 pb-2.5 border-b border-slate-100">
              <div className="w-6.5 h-6.5 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200/60">
                <User size={13} />
              </div>
              <div>
                <p className="text-[12.5px] font-black text-slate-800">Primary Contact & Identity</p>
                <p className="text-[10.5px] text-slate-500">Enter client name and direct communication phone lines</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
              <div className="md:col-span-4">
                <Input
                  name="full_name"
                  label="Full Name *"
                  placeholder="e.g. Sarah Al-Rashidi"
                  defaultValue={initialClient?.full_name || ''}
                  required
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
              <div className="md:col-span-4">
                <Input
                  name="phone"
                  label="Phone Number"
                  placeholder="+971 50 000 0000"
                  defaultValue={initialClient?.phone || ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
              <div className="md:col-span-4">
                <Input
                  name="whatsapp"
                  label="WhatsApp Number"
                  placeholder="+971 50 000 0000"
                  defaultValue={initialClient?.whatsapp ?? initialClient?.phone ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
            </div>
          </div>

          {/* ── Card 2: Address & Location Details ── */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.02)] p-4.5">
            <div className="flex items-center gap-2 mb-3.5 pb-2.5 border-b border-slate-100">
              <div className="w-6.5 h-6.5 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200/60">
                <MapPin size={13} />
              </div>
              <div>
                <p className="text-[12.5px] font-black text-slate-800">Address & Crew Assignment</p>
                <p className="text-[10.5px] text-slate-500">Physical service address, community and preferred cleaner(s)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
              <div className="md:col-span-4">
                <Input
                  name="email"
                  label="Email Address"
                  type="email"
                  placeholder="client@example.com"
                  defaultValue={initialClient?.email ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
              <div className="md:col-span-4">
                <Input
                  name="building_name"
                  label="Building / Villa Name"
                  placeholder="e.g. Marina Gate 1 / Villa 14"
                  defaultValue={initialClient?.building_name ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>
              <div className="md:col-span-4">
                <Input
                  name="apartment"
                  label="Apartment / Flat / Unit"
                  placeholder="e.g. Apt 1204 / Unit 4B"
                  defaultValue={initialClient?.apartment ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>

              <div className="md:col-span-4">
                <Select
                  name="city"
                  label="Emirate (City)"
                  defaultValue={initialClient?.city || 'Dubai'}
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
                  defaultValue={initialClient?.area ?? ''}
                  className="h-9.5 text-[13px] rounded-xl border-slate-200 focus:border-teal-500"
                />
              </div>

              <div className="md:col-span-4">
                <CleanerMultiSelect
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
                  defaultValue={initialClient?.remarks ?? initialClient?.notes ?? initialClient?.access_notes ?? ''}
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
                      defaultValue={initialClient?.advance_amount ? String(initialClient.advance_amount) : ''}
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
                      defaultValue={initialClient?.adjustment_amount ? String(initialClient.adjustment_amount) : ''}
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
                      defaultValue={initialClient?.pending_amount ? String(initialClient.pending_amount) : ''}
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

