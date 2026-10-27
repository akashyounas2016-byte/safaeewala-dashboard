import React, { useState, useEffect, useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Save, Users, Calendar, UserCheck } from 'lucide-react'
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

  const modalTitle = isEdit
    ? (isMonthly ? 'Edit Monthly Client' : 'Edit Client Profile')
    : 'Add New Client'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      size="xl"
      className="max-h-[96vh] max-w-4xl"
      bodyClassName="px-7 py-5.5 pb-6.5"
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
                className="h-8.5 px-4 text-[12.5px] font-semibold text-slate-600 hover:text-slate-800 border-slate-200 cursor-pointer rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="client-modal-form"
                size="sm"
                disabled={isSaving}
                className="h-8.5 px-4.5 text-[12.5px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs cursor-pointer flex items-center gap-1.5 rounded-lg"
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
        /* ── Unified Profile & Financial Form (Balanced, spacious 4-row layout) ── */
        <form
          id="client-modal-form"
          onSubmit={handleSubmit}
          className="space-y-5.5"
        >
          {/* Row 1: Full Name (required) | Phone | WhatsApp */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            <Input
              name="full_name"
              label="Full Name *"
              placeholder="e.g. Sarah Al-Rashidi"
              defaultValue={initialClient?.full_name || ''}
              required
              className="h-10 text-[13.5px] rounded-xl"
            />
            <Input
              name="phone"
              label="Phone Number"
              placeholder="+971 50 000 0000"
              defaultValue={initialClient?.phone || ''}
              className="h-10 text-[13.5px] rounded-xl"
            />
            <Input
              name="whatsapp"
              label="WhatsApp Number"
              placeholder="+971 50 000 0000"
              defaultValue={initialClient?.whatsapp ?? initialClient?.phone ?? ''}
              className="h-10 text-[13.5px] rounded-xl"
            />
          </div>

          {/* Row 2: Email | Building / Villa | Apartment / Flat */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            <Input
              name="email"
              label="Email Address"
              type="email"
              placeholder="email@example.com"
              defaultValue={initialClient?.email ?? ''}
              className="h-10 text-[13.5px] rounded-xl"
            />
            <Input
              name="building_name"
              label="Building / Villa Name"
              placeholder="Marina Heights / Villa 42"
              defaultValue={initialClient?.building_name ?? ''}
              className="h-10 text-[13.5px] rounded-xl"
            />
            <Input
              name="apartment"
              label="Apartment / Flat No"
              placeholder="Apt 1204 / Penthouse"
              defaultValue={initialClient?.apartment ?? ''}
              className="h-10 text-[13.5px] rounded-xl"
            />
          </div>

          {/* Row 3: Emirate | Area / Community | Cleaner Assignment (Multi-select with checkboxes) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            <Select
              name="city"
              label="Emirate (City)"
              defaultValue={initialClient?.city || 'Dubai'}
              className="h-10 text-[13.5px] rounded-xl"
            >
              <option value="Dubai">Dubai</option>
              <option value="Abu Dhabi">Abu Dhabi</option>
              <option value="Sharjah">Sharjah</option>
              <option value="Ajman">Ajman</option>
              <option value="Ras Al Khaimah">Ras Al Khaimah</option>
              <option value="Fujairah">Fujairah</option>
              <option value="Umm Al Quwain">Umm Al Quwain</option>
            </Select>

            <Input
              name="area"
              label="Area / Community"
              placeholder="e.g. Dubai Marina, JBR, Downtown"
              defaultValue={initialClient?.area ?? ''}
              className="h-10 text-[13.5px] rounded-xl"
            />

            {/* ── Searchable Cleaner Combobox with Checkboxes ── */}
            <div>
              <CleanerMultiSelect
                label="Cleaner Assignment"
                name="preferred_cleaner"
                cleaners={activeCleanersList}
                selected={selectedCleaners}
                onChange={setSelectedCleaners}
                placeholder="Pick cleaner(s)..."
              />
            </div>
          </div>

          {/* Row 4: Remarks / Notes (5 cols) & Initial Financial Amounts (7 cols) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 pt-1">
            {/* Left: Remarks / Notes */}
            <div className="md:col-span-5 flex flex-col justify-between">
              <Textarea
                name="remarks"
                label="Remarks / Notes"
                placeholder="Key with concierge, gate code, parking instructions, or client preferences..."
                defaultValue={initialClient?.remarks ?? initialClient?.notes ?? initialClient?.access_notes ?? ''}
                rows={4}
                className="text-[13px] h-[98px] resize-none rounded-xl"
              />
            </div>

            {/* Right: Initial Financial Amounts Container */}
            <div className="md:col-span-7 bg-slate-50/90 rounded-xl p-3.5 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[12.5px] font-bold text-[#111827]">Initial Financial Balances</p>
                  <p className="text-[10.5px] text-slate-500">Opening advance, adjustment (ADJ), and pending balances</p>
                </div>
                <span className="text-[9.5px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Optional
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-emerald-800 mb-1">
                    Advance (AED)
                  </label>
                  <Input
                    name="advance_amount"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    defaultValue={initialClient?.advance_amount ? String(initialClient.advance_amount) : ''}
                    className="h-9 font-bold text-emerald-700 bg-white text-[13px] rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-indigo-800 mb-1 flex items-center gap-1">
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
                    className="h-9 font-bold text-indigo-700 bg-white text-[13px] rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-rose-800 mb-1">
                    Pending (AED)
                  </label>
                  <Input
                    name="pending_amount"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    defaultValue={initialClient?.pending_amount ? String(initialClient.pending_amount) : ''}
                    className="h-9 font-bold text-rose-700 bg-white text-[13px] rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}
