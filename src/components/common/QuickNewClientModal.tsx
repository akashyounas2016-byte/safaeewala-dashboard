import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useData } from '@/store/DataContext'
import type { Client } from '@/types'
import { notify } from '@/lib/notify'
import {
  UserPlus,
  Phone,
  MessageCircle,
  Building2,
  MapPin,
  Home,
  FileText,
  Check,
  X,
  Sparkles,
} from 'lucide-react'

export interface QuickNewClientModalProps {
  open: boolean
  onClose: () => void
  initialName?: string
  initialArea?: string
  initialBuilding?: string
  onClientRegistered: (client: Client) => void
}

const COMMON_AREAS = [
  'Downtown Dubai',
  'Dubai Marina',
  'Business Bay',
  'Jumeirah Village Circle (JVC)',
  'Jumeirah Lake Towers (JLT)',
  'Palm Jumeirah',
  'The Greens',
  'Discovery Gardens',
  'Al Barsha',
  'Dubai Hills Estate',
  'Mirdif',
  'Dubai Silicon Oasis',
  'Motor City',
  'JBR',
  'Damac Hills',
  'Deira',
  'Bur Dubai',
  'Al Furjan',
  'Arabian Ranches',
]

export function QuickNewClientModal({
  open,
  onClose,
  initialName = '',
  initialArea = '',
  initialBuilding = '',
  onClientRegistered,
}: QuickNewClientModalProps) {
  const { addClient, clients } = useData()

  const [fullName, setFullName] = useState(initialName)
  const [whatsapp, setWhatsapp] = useState('')
  const [phone, setPhone] = useState('')
  const [building, setBuilding] = useState(initialBuilding || initialName)
  const [apartment, setApartment] = useState('')
  const [area, setArea] = useState(initialArea)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setFullName(initialName)
      setBuilding(initialBuilding || initialName)
      setArea(initialArea)
      setWhatsapp('')
      setPhone('')
      setApartment('')
      setNotes('')
    }
  }, [open, initialName, initialArea, initialBuilding])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = fullName.trim()
    if (!trimmedName) {
      notify.error('Please enter the client full name.')
      return
    }

    const primaryPhone = whatsapp.trim() || phone.trim() || '—'
    const waNumber = whatsapp.trim() || phone.trim() || ''

    // Construct client payload
    const newClientPayload: Omit<Client, 'id' | 'created_at'> = {
      full_name: trimmedName,
      phone: primaryPhone,
      whatsapp: waNumber,
      building_name: building.trim() || undefined,
      apartment: apartment.trim() || undefined,
      area: area.trim() || 'Dubai',
      city: 'Dubai',
      notes: notes.trim() || undefined,
      source: 'daily_job_sheet',
      total_bookings: 1,
      total_spent: 0,
    }

    addClient(newClientPayload)

    // Synthesize created client row
    const registered: Client = {
      ...newClientPayload,
      id: `client-${Date.now()}`,
      created_at: new Date().toISOString(),
    }

    notify.success(`New client "${trimmedName}" registered in system!`)
    onClientRegistered(registered)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
            <UserPlus size={17} />
          </div>
          <div>
            <span className="font-extrabold text-[15.5px] text-slate-900 block leading-tight">
              Register New Client
            </span>
            <span className="text-[11px] text-slate-500 font-medium block">
              Client was not found in system. Add WhatsApp & address to register.
            </span>
          </div>
        </div>
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-slate-800">
        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-[12px] text-amber-900">
          <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Unregistered Client Detected:</span>
            <p className="text-[11.5px] text-amber-800 mt-0.5">
              Yeh client system mein pehlay say register nahi hai. WhatsApp number aur address register karnay say yeh CRM aur client directory mein foran save ho jaye ga.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Client Full Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
              Client Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Sarah Johnson, Ahmed Khan…"
              required
              autoFocus
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/80 focus:outline-none focus:border-emerald-500 focus:bg-white font-bold text-slate-900 transition-all shadow-2xs"
            />
          </div>

          {/* WhatsApp Number (Highlighted) */}
          <div>
            <label className="block text-[11px] font-semibold text-emerald-800 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
              <MessageCircle size={13} className="text-emerald-600" />
              <span>WhatsApp Number</span>
              <span className="text-[10px] text-emerald-600 font-normal lowercase">(preferred for CRM)</span>
            </label>
            <div className="relative">
              <input
                type="tel"
                value={whatsapp}
                onChange={e => {
                  setWhatsapp(e.target.value)
                  if (!phone) setPhone(e.target.value)
                }}
                placeholder="e.g. +971 50 123 4567"
                className="w-full text-[13px] px-3.5 py-2.5 border border-emerald-300 rounded-xl bg-emerald-50/30 focus:outline-none focus:border-emerald-600 focus:bg-white font-bold text-emerald-950 transition-all shadow-2xs"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Phone Number */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
              <Phone size={12} className="text-slate-400" />
              <span>Secondary Phone (Optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. +971 4 000 0000"
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/80 focus:outline-none focus:border-emerald-500 focus:bg-white font-medium text-slate-800 transition-all shadow-2xs"
            />
          </div>

          {/* Building Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
              <Building2 size={12} className="text-slate-400" />
              <span>Building / Tower / Villa</span>
            </label>
            <input
              type="text"
              value={building}
              onChange={e => setBuilding(e.target.value)}
              placeholder="e.g. 202 Escape Tower, Marina Gate…"
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/80 focus:outline-none focus:border-emerald-500 focus:bg-white font-semibold text-slate-800 transition-all shadow-2xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Apartment Number */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
              <Home size={12} className="text-slate-400" />
              <span>Apartment / Unit #</span>
            </label>
            <input
              type="text"
              value={apartment}
              onChange={e => setApartment(e.target.value)}
              placeholder="e.g. Apt 1402, Villa 5"
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/80 focus:outline-none focus:border-emerald-500 focus:bg-white font-medium text-slate-800 transition-all shadow-2xs"
            />
          </div>

          {/* Area / Zone */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
              <MapPin size={12} className="text-slate-400" />
              <span>Location / Area</span>
            </label>
            <input
              type="text"
              list="quick-client-area-suggestions"
              value={area}
              onChange={e => setArea(e.target.value)}
              placeholder="e.g. Dubai Marina, Downtown…"
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/80 focus:outline-none focus:border-emerald-500 focus:bg-white font-medium text-slate-800 transition-all shadow-2xs"
            />
            <datalist id="quick-client-area-suggestions">
              {COMMON_AREAS.map(a => <option key={a} value={a} />)}
            </datalist>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
            <FileText size={12} className="text-slate-400" />
            <span>Notes / Access Instructions</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Key with security, Call upon arrival, Dog at home…"
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/80 focus:outline-none focus:border-emerald-500 focus:bg-white font-medium text-slate-800 transition-all shadow-2xs"
          />
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl font-bold text-slate-600 hover:bg-slate-100 border-slate-300 transition-all cursor-pointer"
          >
            Skip / Continue
          </Button>
          <Button
            type="submit"
            className="flex-1 h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[13px] shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Check size={16} className="stroke-[3]" />
            <span>Save & Register Client</span>
          </Button>
        </div>
      </form>
    </Modal>
  )
}

